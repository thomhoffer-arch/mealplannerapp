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
- **PWA installable** — works on iOS (Add to Home Screen) and Android/Chrome (native install prompt), no app store needed

---

## Architecture

```
React 18 + Tailwind CSS (Vite)
  └── Vercel (hosting + serverless functions in /api/)
        └── Supabase (PostgreSQL + Auth + Realtime + Row Level Security)
              └── Gemini 2.5 Flash (AI: recipe import, adaptation, week planning)
```

### Key design decisions

**Supabase Realtime on all shared tables** — every mutation (add to plan, check item, star recipe, etc.) is immediately reflected on both partners' screens via Postgres change listeners filtered by `household_id`. No polling.

**Per-household Gemini API key** — users can supply their own Gemini key (stored AES-256-GCM encrypted). Without one, the app uses a shared server key capped at 50 AI calls/day per household (tracked in `ai_usage`). This is the freemium model: enough to try everything, personal key for unlimited use.

**AI week planner prompt design** — instead of asking Gemini to invent 7 meals, we pass it the household's starred recipe IDs grouped by priority. Gemini returns `starred_id` references for meals to pick from the list, plus new suggestions for gaps. The server enriches `starred_id` references with full recipe objects before returning to the client. This keeps suggestions grounded in recipes the household already loves.

**Recipe import via scraping + Gemini** — raw HTML from any food URL is sent to Gemini with a prompt asking for structured JSON (name, ingredients with amounts, steps, times). No brittle CSS selectors or site-specific parsers.

**Pantry cross-reference** — `consolidateIngredients()` merges all plan recipe ingredients, then the shopping list component checks each ingredient name against the pantry set (case-insensitive). Pantry items render greyed-out so you don't double-buy.

**Planning reminder without push notifications** — entirely client-side: on app load, if `preferences.reminder_day` matches today's day name and the most recent `meal_plan_items` row is >6 days old (and the banner hasn't been dismissed today via `localStorage`), a purple banner appears above the main content.

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

Run these in order against your Supabase project:

```
supabase/migration_add_user_recipes.sql         — user_recipes table + RLS
supabase/migration_add_rotation_reminder.sql    — rotation_priority, reminder_enabled, reminder_day
```

(Earlier migrations live in the Supabase dashboard history.)

---

## API routes (`/api/`)

| Route | Method | Description |
|---|---|---|
| `recipes/search` | GET | Federated search across HelloFresh, Marley Spoon, Spoonacular |
| `recipes/[id]` | GET | Fetch a single recipe by ID |
| `recipes/import` | POST | Scrape a URL and normalise to recipe schema via Gemini |
| `ai/suggest` | POST | Adapt a recipe (substitutions, scaling) via Gemini |
| `ai/suggest-week` | POST | Generate a 1–2 week dinner plan via Gemini |
| `household/save-key` | POST | Encrypt and store a personal Gemini API key |
| `cron/scrape` | GET | Background recipe index refresh (Vercel cron, daily) |

---

## Local development

```bash
npm install
cp .env.example .env.local   # fill in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, ENCRYPTION_KEY
npm run dev
```

The Vite dev server proxies `/api/` requests to the serverless functions (configured in `vite.config.js`).

---

## Freemium model

The app ships with a shared Gemini API key on the server. Each household gets **50 AI calls per day** for free — enough for recipe import, adaptation, and a week's planning suggestion.

To remove the cap, users add their own key in Settings (⚙️). The key is encrypted at rest (AES-256-GCM, key from `ENCRYPTION_KEY` env var) and only the last 4 characters are stored as a display hint.

A willingness-to-pay survey appears after 3 days of engagement to gauge interest in a paid tier with a more powerful model and additional recipe sources.

---

## PWA

- `public/manifest.json` — app name, icons, theme colour
- `public/service-worker.js` — caches the shell for offline use
- `public/index.html` — Apple PWA meta tags (`apple-mobile-web-app-capable`, `apple-touch-icon`)
- Chrome/Android: native `beforeinstallprompt` handled in `InstallBanner.jsx`
- iOS: manual "Add to Home Screen" hint shown when running in mobile Safari
