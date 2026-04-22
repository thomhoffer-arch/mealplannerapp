# Stripe Payment Integration

## Context
Premium feature gates are fully built — `household_members.is_premium` controls access across all API handlers and UI. The upgrade modal exists with a disabled "Notify me when payment is ready" button. This plan replaces that placeholder with a real Stripe Checkout flow. RevenueCat was considered but ruled out for now: its main value is cross-platform (App Store / Google Play) subscription unification, which isn't needed for a web-only PWA. Direct Stripe is simpler, has no commission layer, and can be swapped for RevenueCat later if mobile launches.

## Prerequisites — Stripe dashboard (manual, before code)
1. Create a Stripe account (or use existing) — ensure you're in **live mode** for production (use test mode during dev)
2. Create a Product: "Premium" with a recurring price of €4.99/month → copy the **Price ID** (`price_xxxxx`)
3. Enable the **Customer Portal** in Stripe dashboard → Settings → Billing → Customer portal. Set it to allow subscription cancellation.
4. Under Developers → Webhooks: add endpoint `https://<your-domain>/api/payment/webhook`. Select events: `checkout.session.completed`, `customer.subscription.deleted`. Copy the **Webhook signing secret** (`whsec_xxxxx`).
5. Copy your **Secret key** (`sk_live_xxxxx` or `sk_test_xxxxx` for dev)

## New environment variables
```
STRIPE_SECRET_KEY=sk_live_xxxxx        # Never expose to frontend
STRIPE_WEBHOOK_SECRET=whsec_xxxxx      # From Stripe webhook settings
STRIPE_PRICE_ID=price_xxxxx            # The €4.99/month price ID
```
Add to Vercel env vars. Add placeholder lines to `.env.local.example`. No `VITE_` prefix — no Stripe key is needed on the frontend for hosted checkout.

---

## How it works (no DB migration needed)

**User identified via:** `client_reference_id` on the checkout session (set to Supabase user UUID) and `metadata.user_id` on the subscription object.

**Webhook events handled:**
- `checkout.session.completed` → `is_premium = true` (initial purchase, via `client_reference_id`)
- `customer.subscription.deleted` → `is_premium = false` (cancelled + expired + failed renewals — Stripe fires this after all retries fail)

This is the minimal viable set. Renewals keep `is_premium` true automatically since `subscription.deleted` only fires on actual termination.

---

## New file: `api/payment/checkout.js`
Creates a Stripe Checkout Session and returns the redirect URL.

```js
import Stripe from 'stripe';
import { requireAuth } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    client_reference_id: ctx.user.id,          // Supabase UUID — used in webhook
    subscription_data: {
      metadata: { user_id: ctx.user.id },      // also on subscription for deletion events
    },
    customer_email: ctx.user.email,             // prefills Stripe form
    success_url: `${process.env.VITE_APP_URL ?? req.headers.origin}/?checkout=success`,
    cancel_url:  `${process.env.VITE_APP_URL ?? req.headers.origin}/?checkout=cancelled`,
  });

  return res.json({ url: session.url });
}
```

## New file: `api/payment/portal.js`
Creates a Stripe Customer Portal session for managing/cancelling subscriptions.

```js
import Stripe from 'stripe';
import { requireAuth } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  // Find this user's Stripe customer by searching subscriptions with their user_id metadata
  const subscriptions = await stripe.subscriptions.search({
    query: `metadata['user_id']:'${ctx.user.id}'`,
    limit: 1,
  });

  const customerId = subscriptions.data[0]?.customer;
  if (!customerId) return res.status(404).json({ error: 'No active subscription found' });

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.VITE_APP_URL ?? req.headers.origin}/`,
  });

  return res.json({ url: portalSession.url });
}
```

## New file: `api/payment/webhook.js`
Handles Stripe lifecycle events. Does NOT use `requireAuth` — uses Stripe signature verification instead.

```js
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: false } }; // Vercel: raw body needed for signature

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Collect raw body (needed for Stripe signature verification)
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf8');

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.mode === 'subscription' && session.client_reference_id) {
      await supabase
        .from('household_members')
        .update({ is_premium: true })
        .eq('user_id', session.client_reference_id);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const userId = subscription.metadata?.user_id;
    if (userId) {
      await supabase
        .from('household_members')
        .update({ is_premium: false })
        .eq('user_id', userId);
    }
  }

  return res.status(200).json({ received: true });
}
```

**Safety note on gifted accounts:** Gifted users have `is_premium = true` set manually with no Stripe subscription. They'll never receive a `customer.subscription.deleted` event, so the webhook will never touch them.

---

## `package.json`
```
npm install stripe
```
Backend only. No frontend Stripe SDK needed — hosted checkout is a redirect.

---

## `src/App.jsx` changes

### 1. New state (near line 1008)
```js
const [purchaseLoading, setPurchaseLoading] = useState(false);
const [purchaseError,   setPurchaseError]   = useState('');
```

### 2. Handle return from Stripe checkout (on mount, in the initial useEffect)
```js
const params = new URLSearchParams(window.location.search);
if (params.get('checkout') === 'success') {
  window.history.replaceState({}, '', '/'); // clean URL
  loadWeeklyUsage();                        // refresh premium status
}
```

### 3. Check post-signup premium intent (alongside existing `mp-pending-puter-connect` check)
```js
if (localStorage.getItem('mp-pending-premium')) {
  localStorage.removeItem('mp-pending-premium');
  setShowUpgradeModal(true);
}
```

### 4. Add purchase handler function (near `loadWeeklyUsage`)
```js
async function handlePurchase() {
  setPurchaseLoading(true);
  setPurchaseError('');
  try {
    const { url } = await apiFetch('/api/payment/checkout', { method: 'POST' });
    window.location.href = url; // redirect to Stripe hosted checkout
  } catch (err) {
    setPurchaseError(err.message || 'Could not start checkout. Please try again.');
    setPurchaseLoading(false);
  }
}
```

### 5. Add portal handler function
```js
async function handleManageSubscription() {
  try {
    const { url } = await apiFetch('/api/payment/portal', { method: 'POST' });
    window.location.href = url;
  } catch {
    // silently fail — button just doesn't navigate
  }
}
```

### 6. Upgrade modal — free state (~line 2870)
Replace the disabled button and its caption:
```jsx
// Remove: disabled "Notify me when payment is ready" button + footer note
// Replace with:
<button
  onClick={handlePurchase}
  disabled={purchaseLoading}
  className="w-full py-3.5 bg-orange-500 text-white rounded-full font-medium text-sm hover:bg-orange-600 transition disabled:opacity-60 flex items-center justify-center gap-2"
>
  <Sparkles size={14} />
  {purchaseLoading ? 'Opening checkout…' : 'Get Premium — €4.99 / month'}
</button>
{purchaseError && (
  <p className="text-center text-xs text-red-400 mt-2">{purchaseError}</p>
)}
<p className="text-center text-xs text-orange-400 mt-3">
  Secure payment via Stripe · cancel any time
</p>
```
Also update the subtitle from `"Payment coming soon — join the waitlist below"` to `"€4.99 / month · cancel any time"`.

### 7. Upgrade modal — BYOK state
Replace the existing disabled "Get Premium — €4.99/month (coming soon)" button with the same active `handlePurchase` button.

### 8. Upgrade modal — premium state
Add a "Manage subscription" button below "Manage settings":
```jsx
<button
  onClick={handleManageSubscription}
  className="w-full mt-2 py-2.5 border border-orange-100 text-orange-400 bg-white rounded-full text-sm font-medium hover:border-orange-200 hover:text-orange-500 transition"
>
  Manage subscription
</button>
```

---

## `src/components/AuthScreen.jsx` changes

### 1. Remove "coming soon" from Premium card (~line 573)
Delete the `<span>— coming soon</span>` from the plan card header.

### 2. Update signup CTA text (~line 658)
```jsx
// Before:
selectedPlan === 'premium' ? 'Start free — I want Premium when it launches'
// After:
selectedPlan === 'premium' ? 'Create account — upgrade after sign-in'
```

### 3. Set localStorage intent before signup (in the submit handler)
```js
if (selectedPlan === 'premium') {
  try { localStorage.setItem('mp-pending-premium', '1'); } catch {}
}
// then proceed with Supabase signup...
```

---

## `.env.local.example`
Add at the bottom:
```
# ─── Stripe ───────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
STRIPE_PRICE_ID=price_your_price_id_here
```

---

## No database migration needed
`household_members.is_premium` already exists. The webhook sets it directly via service role.

---

## Data flow
```
User clicks "Get Premium"
  → apiFetch('/api/payment/checkout') → Stripe creates session
  → window.location.href = session.url (Stripe hosted checkout)
  → User pays with card
  → Stripe redirects to /?checkout=success
  → App detects param, calls loadWeeklyUsage()
  → Meanwhile: Stripe fires checkout.session.completed webhook
  → /api/payment/webhook: UPDATE household_members SET is_premium=true WHERE user_id=<uuid>
  → weeklyUsage.unlimited = true → premium UI activates

User cancels subscription (via portal)
  → Stripe eventually fires customer.subscription.deleted
  → /api/payment/webhook: UPDATE household_members SET is_premium=false WHERE user_id=<uuid>
```

---

## Verification
1. **Webhook test:** Use Stripe CLI (`stripe trigger checkout.session.completed`) or send test event from Stripe dashboard → confirm `is_premium=true` in DB
2. **Full flow (test mode):** Click "Get Premium" → Stripe test card `4242 4242 4242 4242` → complete → confirm redirect back + `weeklyUsage.unlimited = true`
3. **Cancellation:** Use Stripe dashboard to cancel a test subscription → confirm `customer.subscription.deleted` fires → `is_premium=false` in DB
4. **Gifted accounts unaffected:** Manually gifted user has no Stripe subscription → no deletion event → `is_premium` unchanged
5. **Portal:** Premium user clicks "Manage subscription" → redirects to Stripe portal → can cancel from there
