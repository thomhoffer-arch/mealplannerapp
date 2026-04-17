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
- **Landing page + plan selector** — unauthenticated visitors see a full marketing page (hero, feature grid, how-it-works), then a plan comparison screen (Free vs. Unlimited), before reaching the auth form
- **PWA installable** — works on iOS (Add to Home Screen) and Android/Chrome (native install prompt), no app store needed; install prompt only shows to authenticated users

---

## Architecture

```
React 18 + Tailwind CSS (Create React App)
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

### Migrations

Run these in order against your Supabase project (earlier migrations live in the Supabase dashboard history):

```
supabase/migration_add_ai_usage.sql              — ai_usage table + RLS
supabase/migration_add_user_recipes.sql          — user_recipes table + RLS
supabase/migration_add_rotation_reminder.sql     — rotation_priority on starred_recipes;
                                                   reminder_enabled + reminder_day on household_preferences
```

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
| `cron/scrape` | GET | Cron | Background recipe index refresh (Vercel cron, daily) |

All `Bearer` routes resolve the household via the JWT, then check for a personal API key before falling back to the shared server key. The 50/day cap applies only to the shared key.

---

## Local development

```bash
npm install
cp .env.example .env.local
# Fill in:
#   SUPABASE_URL
#   SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY
#   GEMINI_API_KEY          (shared server key for the free tier)
#   ENCRYPTION_KEY          (32-byte hex string for AES-256-GCM)
npm start
```

API requests from the dev server are proxied to Vercel serverless functions via `vercel dev`, or you can run them separately.

---

## Freemium model

The app ships with a shared Gemini API key on the server. Each household gets **50 AI calls per day** for free — enough for recipe import, adaptation, and a week's planning suggestion.

To remove the cap, users add their own Gemini key in Settings (⚙️). The key is AES-256-GCM encrypted at rest (using `ENCRYPTION_KEY` env var) and only the last 4 characters are stored as a display hint.

A willingness-to-pay survey appears after 3 days of use once the household has at least 1 meal planned or recipe cooked. Prices shown reflect competitor benchmarks (Mealime, Plan to Eat, Paprika).

---

## PWA

- `public/manifest.json` — app name, icons, theme colour
- `public/service-worker.js` — caches the app shell for offline use
- `public/index.html` — Apple PWA meta tags (`apple-mobile-web-app-capable`, `apple-touch-icon`)
- `src/components/InstallBanner.jsx` — Chrome/Android native prompt + iOS manual hint
- Install prompt only shown to authenticated users (component lives inside the auth gate)

---

## Renaming the app

Once a name is chosen, update:

| File | What to change |
|---|---|
| `public/manifest.json` | `name`, `short_name` |
| `public/index.html` | `<title>`, meta description, `apple-mobile-web-app-title` |
| `public/service-worker.js` | `CACHE` constant string |
| `src/App.jsx` | `<h1>` header text (~line 841) |
| `src/components/AuthScreen.jsx` | `<h1>` and `<span>` in nav + auth form |
| `README.md` | Title and description |
