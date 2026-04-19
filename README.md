# Meal Planner

A collaborative household meal planning PWA built with React, Tailwind CSS, Supabase, and Gemini AI. Designed for two people sharing a kitchen — plan your week together, build a shared shopping list, and let AI do the rotation thinking.

---

## What it does

- **Search recipes** from HelloFresh, Marley Spoon, NYT Cooking, and Spoonacular (with dietary / time / cuisine filters)
- **Import any recipe by URL** — paste a link from any food blog and the app scrapes + normalises it via Gemini
- **Create your own recipes** — a full form (ingredients, steps, times, servings) saved to your household's library
- **Build a shared meal plan** — add recipes to this week's plan; both partners see changes in real time via Supabase Realtime
- **Generate a shopping list** automatically from plan ingredients, with pantry cross-referencing to skip items you already have
- **Check off items** as you shop (synced between partners)
- **Star recipes** and set a rotation priority: 🔥 Every week · 🔄 Biweekly · 💫 Occasional
- **AI week planner** — one tap to generate a 1 or 2-week varied dinner plan based on your starred recipes, rotation priorities, dietary preferences, and recent history (no pasta two days in a row)
- **Rate recipes** after cooking (1–5 stars) to build a household history of winners
- **Pantry tracker** — mark ingredients you already have; they're greyed out on the shopping list
- **Save plan templates** — name and save a week's lineup to reuse later
- **Adapt recipes with AI** — ask Gemini to substitute ingredients or adjust servings
- **Weekly planning reminder** — choose a day of the week; the app shows a banner nudging you to plan if you haven't updated your plan in 6+ days
- **Real-time notification bell** — the header bell icon shows when your partner adds or removes recipes from the plan or stars something; includes unread badge, mark-all-read, and per-item dismiss
- **Dinner invitations** — host picks a dinner, generates a shareable link with a dish, time, and optional note. If the recipient is a signed-in user who accepts, their own week plan and shopping list drop that night (they're eating elsewhere). Household members see "away" and guest chips on the plan at a glance
- **Landing page + plan selector** — unauthenticated visitors see a full marketing page (hero, an interactive week sandbox, plan comparison), before reaching the auth form. All visual decisions (palette, radii, typography, glyph style) live in [`DESIGN.md`](./DESIGN.md) as the single source of truth
- **PWA installable** — works on iOS (Add to Home Screen) and Android/Chrome (native install prompt), no app store needed; install prompt only shows to authenticated users

---

## Architecture

```
React 18 + Tailwind CSS (Vite)
  └── Vercel (hosting + serverless functions in /api/)
        └── Supabase (PostgreSQL + Auth + Realtime + Row Level Security)
              └── Gemini 2.5 Flash (AI: recipe import, adaptation, week planning)
```

### Key design decisions

**Supabase Realtime on all shared tables** — every mutation (add to plan, check item, star recipe, create recipe, etc.) is immediately reflected on both partners' screens via Postgres change listeners filtered by `household_id`. No polling. The notification bell uses its own dedicated Realtime channel that only starts after login, so the landing page never receives these events.

**Per-household Gemini API key** — users can supply their own Gemini key (stored AES-256-GCM encrypted). Without one, the app uses a shared server key capped at 50 AI calls/day per household (tracked in `ai_usage`). This is the freemium model: enough to try everything, personal key for unlimited use. Both `ai/suggest` (recipe adaptation) and `ai/suggest-week` (week planning) share the same daily counter and the same key resolution logic.

**AI week planner prompt design** — instead of asking Gemini to invent 7 meals, we pass it the household's starred recipe IDs grouped by priority. Gemini returns `starred_id` references for meals it picks from the list, plus new suggestions for any gaps. The server enriches `starred_id` references with full recipe objects before returning to the client. This keeps suggestions grounded in recipes the household already loves while still allowing creativity.

**Recipe import via scraping + Gemini** — raw HTML from any food URL is sent to Gemini with a prompt asking for structured JSON (name, ingredients with amounts, steps, times). No brittle CSS selectors or site-specific parsers. The result is normalised into the same schema as HelloFresh/Spoonacular recipes so it works everywhere in the app.

**Pantry cross-reference** — `consolidateIngredients()` merges all plan recipe ingredients into a unified list (amounts combined with `+`), then the shopping list checks each ingredient name against the pantry set (case-insensitive). Pantry items render greyed-out so you don't double-buy.

**Planning reminder without push notifications** — entirely client-side: on app load, if `preferences.reminder_day` matches today's day name, the most recent `meal_plan_items` row is >6 days old, and the banner hasn't been dismissed today (tracked in `localStorage`), a banner appears above the content. No server-side scheduling or push tokens needed.

**Landing page flow** — unauthenticated users see a landing page → plan selector → auth form. Arriving via invite link skips to auth directly. The plan selector is informational only (no payment processing); the "Unlimited" plan means the user adds their own API key in Settings after signing up.

**PWA install prompt scoped to authenticated users** — `InstallBanner` is only rendered inside the auth-guarded part of `App.jsx`. For Android/Chrome the `beforeinstallprompt` event is only listened for post-login; for iOS the manual hint timer only starts post-login.

---

## Components

| Component | Description |
|---|---|
| `AuthScreen` | Landing page, plan selector, and login/register form |
| `PreferencesModal` | Dietary preferences, weekly reminder toggle, Gemini API key management |
| `CreateRecipeModal` | Full form for creating household-owned recipes |
| `StarredPanel` | View starred recipes, cycle rotation priority, open AI week planner |
| `WeekSuggestModal` | AI week planner UI: generate, preview per-day, select/deselect, load |
| `NotificationBell` | Real-time activity notifications for household changes |
| `WillingnessModal` | Willingness-to-pay survey (shown after 3 days of engagement) |
| `InstallBanner` | PWA install prompt (Android native + iOS manual hint) |

---

## Database schema (Supabase)

| Table | Purpose |
|---|---|
| `households` | One per household, has `invite_token` for partner joining |
| `household_members` | Many-to-many: users ↔ households |
| `household_preferences` | Dietary text, Gemini API key (encrypted + hint), reminder settings |
| `meal_plan_items` | This week's plan: `recipe_id` + full `recipe_data` JSONB |
| `custom_ingredients` | Per-recipe extra ingredients added by the household |
| `cooked_recipes` | Marks which recipes have been cooked; stores `rating` (1–5) |
| `shopping_checks` | Checked-off items on the shopping list |
| `starred_recipes` | Starred recipes with `rotation_priority` (1/2/3) |
| `user_recipes` | Manually created household recipes |
| `pantry_items` | Ingredients already at home |
| `plan_templates` | Saved week lineups with a name |
| `ai_usage` | Shared-key call counter: one row per household per day |
| `dinner_invitations` | Share-link invitations: token, dish snapshot, date/time, location, host note, guest RSVP status |

### Migrations

For a fresh Supabase project, run these in order via **SQL Editor** (one file per tab, paste + Run):

```
1.  supabase/schema.sql                             — base tables + RLS helper + core policies
2.  supabase/migration_add_preferences.sql          — household_preferences table
3.  supabase/migration_add_gemini_key.sql           — gemini_key_encrypted on household_preferences
4.  supabase/migration_add_ai_usage.sql             — ai_usage table + RLS
5.  supabase/migration_add_rating.sql               — rating on cooked_recipes
6.  supabase/migration_add_starred.sql              — starred_recipes table
7.  supabase/migration_add_pantry.sql               — pantry_items table
8.  supabase/migration_add_templates.sql            — plan_templates table
9.  supabase/migration_add_user_recipes.sql         — user_recipes table + RLS
10. supabase/migration_add_rotation_reminder.sql    — rotation_priority on starred_recipes;
                                                      reminder_enabled + reminder_day on household_preferences
11. supabase/migration_add_survey.sql               — survey response columns
12. supabase/migration_add_puter_token.sql          — puter_token_encrypted + puter_token_hint on
                                                      household_preferences (optional, for Puter BYOK)
13. supabase/migration_add_dinner_invitations.sql   — dinner_invitations table + RLS + realtime publication
14. supabase/migration_add_rpc_grants.sql           — GRANT EXECUTE on RPC functions for authenticated users
```

**Editor gotcha:** Supabase's SQL editor can misparse multiple `$$`-quoted functions pasted in one batch and raise `relation "hid" does not exist`. If that happens, run each `create or replace function` block in its own tab.

---

## API routes (`/api/`)

| Route | Method | Auth | Description |
|---|---|---|---|
| `recipes/search` | GET | — | Federated search across HelloFresh, Marley Spoon, Spoonacular |
| `recipes/[id]` | GET | — | Fetch a single recipe by ID |
| `recipes/import` | POST | Bearer | Scrape a URL and normalise to recipe schema via Gemini |
| `ai/suggest` | POST | Bearer | Adapt a recipe (substitutions, scaling) via Gemini |
| `ai/suggest-week` | POST | Bearer | Generate a 1–2 week dinner plan via Gemini |
| `household/save-key` | POST | Bearer | Encrypt and store a personal Gemini API key |
| `household/save-puter-token` | POST | Bearer | Encrypt and store a personal Puter auth token (pay-as-you-go AI) |
| `dinner-invitations/create` | POST | Bearer | Host creates an invitation, returns `{ token, shareUrl }` |
| `dinner-invitations/[token]` | GET | — | Public — fetch sanitised invite details for the RSVP page |
| `dinner-invitations/[token]` | DELETE | Bearer | Host-only — cancel an invitation |
| `dinner-invitations/respond` | POST | Bearer | Guest RSVP: `{ token, action: 'accept' \| 'decline' }` |
| `dinner-invitations/list` | GET | Bearer | Returns `{ sent, received }` for the logged-in household |
| `cron/scrape` | GET | Cron | Background recipe index refresh (Vercel cron, daily) |

All `Bearer` routes resolve the household via the JWT. AI provider resolution order is: **household Puter token** → **personal Gemini key** → **shared Gemini key**. The 50/day cap applies only to the shared key.

---

## Local development

```bash
npm install
cp .env.local.example .env.local
# Fill in the values — see "Environment variables" below
npm run dev
```

The frontend is built with **Vite** and runs at `http://localhost:3000`. API requests are proxied to the Vercel serverless functions via `vercel dev`, or you can run them separately.

---

## Third-party services

You need accounts on these services before the app works. Free tiers are sufficient for personal use.

| Service | Required? | What it's for | Free tier | Sign up |
|---|---|---|---|---|
| **Vercel** | yes | Hosting, serverless functions, cron | Hobby plan is free | [vercel.com/signup](https://vercel.com/signup) |
| **Supabase** | yes | Postgres DB, auth, realtime, storage | 2 projects, 500 MB DB | [supabase.com](https://supabase.com) |
| **Google AI Studio (Gemini)** | yes | Recipe import, recipe adaptation, week planning | 1,500 free requests/day on Gemini Flash | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| **Puter** | optional | Per-household pay-as-you-go AI (Claude, GPT, Gemini, etc.) — overrides Gemini when set | Free signup, top up to use AI | [puter.com](https://puter.com) |
| **Spoonacular** | recommended | External recipe search | 150 requests/day | [spoonacular.com/food-api](https://spoonacular.com/food-api) |
| **GitHub** | yes | Source hosting (Vercel deploys from it) | Free for private repos | [github.com](https://github.com) |
| **Domain registrar** | optional | Custom domain (e.g. `meals.thomhoffer.nl`) | N/A — you already own `thomhoffer.nl` | — |

### Setup order

1. **GitHub** — push the repo so Vercel can import it.
2. **Supabase** — create a project, then run the SQL from `supabase/` (see "Database schema" section). Copy the project URL, `anon` key, and `service_role` key.
3. **Google AI Studio** — create an API key. One key per Google account.
4. **Spoonacular** — optional but recommended; sign up, copy the API key from your profile.
5. **Vercel** — import the GitHub repo as a new project, paste env vars during import (see below).
6. **Domain** (optional) — add `meals.thomhoffer.nl` in Vercel, then create a CNAME at your registrar (see "Custom domain" section).

---

## Environment variables

The app uses two groups of env vars: **client-side** (exposed to the browser bundle, prefixed `VITE_`) and **server-side** (used only by `/api/*` serverless functions, never shipped to the browser).

| Variable | Scope | What it's for | Where to get it |
|---|---|---|---|
| `VITE_SUPABASE_URL` | client | Supabase project URL | Supabase → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | client | Supabase public anon key | Supabase → Project Settings → API |
| `SUPABASE_URL` | server | Same URL, used by `/api/*` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Service-role key (bypasses RLS) | Supabase → Project Settings → API → **never expose** |
| `SPOONACULAR_API_KEY` | server | Recipe search API | spoonacular.com/food-api |
| `HELLOFRESH_CLIENT_ID` | server | HelloFresh scraper auth | `.env.local.example` has community defaults |
| `HELLOFRESH_CLIENT_SECRET` | server | HelloFresh scraper auth | `.env.local.example` has community defaults |
| `GEMINI_API_KEY` | server | Shared AI key (free tier) | aistudio.google.com/app/apikey |
| `GEMINI_MODEL` | server | Optional override for the Gemini model (default `gemini-2.5-flash`) | — |
| `PUTER_MODEL` | server | Optional override for the Puter model (default `claude-sonnet-4-5`). Set this if the default doesn't match Puter's current catalogue. | Puter docs |
| `ENCRYPTION_KEY` | server | AES-256-GCM key for stored Gemini keys and Puter tokens | `openssl rand -hex 32` |
| `CRON_SECRET` | server | Auth for the weekly scrape cron | **Auto-set by Vercel** — don't add manually |

### Google sign-in (OAuth)

Users can sign up / log in with Google as an alternative to email + password. To enable this:

1. **Google Cloud Console** — create an OAuth client
   - Go to [console.cloud.google.com](https://console.cloud.google.com) → create (or pick) a project
   - **APIs & Services → OAuth consent screen** → User Type: **External** → fill in app name, support email, logo (optional), authorized domains (`yourdomain.com` + `supabase.co`)
   - **APIs & Services → Credentials → Create Credentials → OAuth client ID** → type: **Web application**
   - **Authorized JavaScript origins**: your site URL (e.g. `https://meals.thomhoffer.nl`) plus `http://localhost:3000` for dev
   - **Authorized redirect URIs**: `https://<your-project-ref>.supabase.co/auth/v1/callback` (copy this exact URL from the Supabase Google-provider page)
   - Copy the **Client ID** and **Client secret**

2. **Supabase Dashboard** — enable the provider
   - Project → **Authentication → Providers → Google** → toggle **Enable**
   - Paste the Client ID and Client secret → **Save**

3. **(Optional) Vercel** — if you use a custom domain, make sure it's in **Supabase → Authentication → URL Configuration → Site URL** so the redirect works correctly.

That's it. The "Continue with Google" button in `AuthScreen.jsx` calls `supabase.auth.signInWithOAuth({ provider: 'google' })` and the rest is handled by Supabase. No extra env vars needed in the app.

---

### Puter (pay-as-you-go AI — optional)

A household can opt into Puter's user-pays model so AI calls are billed to their own Puter account instead of your shared Gemini quota. One person per household does this setup and the whole household benefits.

1. **Sign up** at [puter.com](https://puter.com) and top up the account (Puter bills per AI call).
2. **Grab the auth token.** After signing in at puter.com, open the browser devtools console and run `puter.authToken` — copy the string.
3. **Paste it into Settings** in the meal planner (Settings → Personal Puter token → Save). The token is validated against Puter's API, then encrypted with `ENCRYPTION_KEY` and stored at the household level.
4. Once saved, **AI provider order becomes**: Puter token → Gemini BYOK → shared Gemini. Remove the token to fall back.

Model: defaults to `claude-sonnet-4-5` on Puter's OpenAI-compatible endpoint. Override via the `PUTER_MODEL` env var if Puter's catalogue differs.

Caveat worth flagging to users: Puter auth tokens may be session-scoped and expire occasionally. If AI calls start failing with a 401, the user re-pastes a fresh token. If this becomes a regular issue, we'd need to switch to an in-browser Puter.js flow instead of a pasted server-side token.

---

### Setting them in Vercel

1. Go to **Project → Settings → Environment Variables**
2. For each row above, click **Add New**:
   - **Key**: variable name
   - **Value**: the real value
   - **Environments**: tick **Production**, **Preview**, and **Development**
3. Shortcut for bulk import: on the "Add New" view, click **Import .env** and paste your filled-in `.env.local` contents — Vercel parses it into rows.
4. After editing vars on a project that's already deployed, trigger a **Redeploy** (Deployments tab → `⋯` menu → Redeploy) so the build picks them up.

**Important:** `VITE_*` vars get inlined into the JS bundle at build time. Never put secrets in them — anything `VITE_`-prefixed is public. Secrets go in the server-side vars only.

---

## Custom domain

The app is currently reachable at `meals.thomhoffer.nl` (subdomain of the owner's root domain). To set up a custom subdomain on your own Vercel project:

### 1. Add the domain in Vercel

1. **Project → Settings → Domains**
2. Enter the subdomain you want (e.g. `meals.thomhoffer.nl`) and click **Add**
3. Vercel shows a DNS record to configure. For a subdomain this is usually:

   | Type  | Name    | Value                   |
   |-------|---------|-------------------------|
   | CNAME | `meals` | `cname.vercel-dns.com`  |

### 2. Add the DNS record at your registrar

Go to the DNS panel of whoever manages `thomhoffer.nl` (TransIP, Versio, Cloudflare, Namecheap, Google Domains, etc.) and create the CNAME. The `Name` field is usually just the subdomain part (`meals`), not the full hostname.

### 3. Wait for propagation

Usually under 10 minutes, occasionally up to an hour. You can verify from a terminal:

```bash
dig meals.thomhoffer.nl +short
# should return → cname.vercel-dns.com
```

Vercel's Domains page flips from "Invalid Configuration" to "Valid Configuration" once it resolves, and it auto-issues a Let's Encrypt SSL cert — no action needed.

### Using an apex/root domain instead

If you ever want `thomhoffer.nl` itself (not a subdomain) to point to a Vercel project, use the A records Vercel lists (usually `76.76.21.21`). Note this will conflict with your main site hosting — don't do this unless the Vercel project is the *primary* site for that domain.

---

## Freemium model

The app ships with a shared Gemini API key on the server. Each household gets **50 AI calls per day** for free — enough for recipe import, adaptation, and a week's planning suggestion.

To remove the cap, users add their own Gemini key in Settings (⚙️). The key is AES-256-GCM encrypted at rest (using `ENCRYPTION_KEY` env var) and only the last 4 characters are stored as a display hint.

A willingness-to-pay survey appears after 3 days of use once the household has at least 1 meal planned or recipe cooked. Prices shown reflect competitor benchmarks (Mealime, Plan to Eat, Paprika).

---

## PWA

- `public/manifest.json` — app name, icons, theme colour
- `public/service-worker.js` — caches the app shell for offline use (cache name is versioned per deploy, see "Versioning & cache busting" below)
- `index.html` (repo root) — Apple PWA meta tags (`apple-mobile-web-app-capable`, `apple-touch-icon`)
- `src/components/InstallBanner.jsx` — Chrome/Android native prompt + iOS manual hint
- `src/components/UpdateToast.jsx` — "New version available — refresh" toast when a new SW is waiting
- `src/lib/serviceWorker.js` — SW registration + update-detection logic
- Install prompt only shown to authenticated users (component lives inside the auth gate)

---

## Theming (light / dark)

The app ships with both a **light** and a **dark** theme. The landing / plan selection / auth screens always render in light mode; dark mode only applies once a user is signed in, so first-time visitors see a consistent welcome.

**How it's wired:**

- `src/index.css` defines CSS custom properties for the full `orange` + `amber` + `sage` palettes, with a flipped scale in `.dark` (so `bg-orange-50` is cream in light mode and deep espresso in dark).
- `tailwind.config.js` remaps Tailwind's `orange`/`amber` color tokens to those CSS variables, so existing utility classes auto-theme without per-component refactors.
- `src/lib/theme.js` — preference persistence (`system` | `light` | `dark`) via localStorage, with a `matchMedia` listener for OS changes.
- `src/main.jsx` applies the theme early **only if** a Supabase session already exists (prevents a flash for returning users, keeps signed-out landing light).
- `src/App.jsx` applies / removes the `.dark` class on the `<html>` element on sign-in / sign-out.
- `src/components/ThemeToggle.jsx` — segmented control (Light / System / Dark), mounted inside the Preferences modal.

**Typography:**
- Body: **Outfit** (Google Fonts) — clean sans
- Display: **Fraunces** (Google Fonts) — warm editorial serif, used for headings (`font-display` class)

For the complete set of visual rules — every colour step's semantic role, the radius scale, shadow tokens, stroke weights, illustration style, dark-mode conventions, allow-listed brand hex codes — see [`DESIGN.md`](./DESIGN.md). That file is the canonical style reference; avoid adding stray hex codes, bracket radii, or shadow sizes outside what it documents.

---

## Versioning & cache busting

Every deploy gets a unique build ID (`<git-sha>.<timestamp>`) that's injected into:

- The **service worker's cache name** (`vite.config.js` rewrites `__BUILD_ID__` in `public/service-worker.js` at build time), so the SW file bytes change on every deploy → browsers install the new worker and purge old caches.
- **`import.meta.env.VITE_APP_VERSION`** — available anywhere in the frontend code; currently rendered as a tiny `v<id>` label under the bottom nav.

Cache-Control headers in `vercel.json`:
- `/index.html` and `/service-worker.js` → `max-age=0, must-revalidate` (always fetch fresh)
- `/assets/*` → `max-age=31536000, immutable` (safe — Vite content-hashes filenames)

When a new deploy lands, the flow is: user opens the app → browser fetches fresh `index.html` → SW registration detects a new worker → new worker installs and goes into "waiting" → `UpdateToast` shows → user clicks **Refresh** → `SKIP_WAITING` message → old tabs reload onto the new version.

---

## Renaming the app

Once a name is chosen, update:

| File | What to change |
|---|---|
| `public/manifest.json` | `name`, `short_name` |
| `index.html` | `<title>`, meta description, `apple-mobile-web-app-title` |
| `public/service-worker.js` | `meal-planner-` prefix in the `CACHE` constant (optional) |
| `src/App.jsx` | `<h1>` header text |
| `src/components/AuthScreen.jsx` | `<h1>` and `<span>` in nav + auth form |
| `README.md` | Title and description |
