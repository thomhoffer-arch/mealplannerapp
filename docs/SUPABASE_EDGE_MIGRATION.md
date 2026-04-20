# Supabase Edge Functions migration — candidates

When we add enough endpoints that the Vercel Hobby 12-function cap
pinches again, these handlers are the right ones to move to Supabase
Edge Functions. They all share two traits: (1) they mostly or entirely
talk to the Supabase database, and (2) they don't depend on Node-only
APIs that Deno lacks.

Leave everything else on Vercel — the AI calls, URL scraping, and cron
work benefit from the Node runtime and Vercel's cold-start behaviour.

## Move to Supabase Edge when convenient

| Endpoint | Why it's a good fit |
|---|---|
| `api/household/save-key.js` (GET list, POST save, DELETE leave/remove) | Pure DB — just reads/writes `household_members` and `household_preferences`. The POST save-key path does make a test call to Gemini / Puter APIs, which works fine from Deno fetch. |
| `api/account.js` (GET export, DELETE soft-delete) | Pure DB plus `supabase.auth.admin.deleteUser()`. Admin API is available in the Deno client. |
| `api/dinner-invitations/index.js` | Pure DB. |
| `api/dinner-invitations/[token].js` | Pure DB. |
| `api/recipes/[id].js` | Hits Spoonacular's HTTP API but is otherwise trivial; Deno fetch handles it fine. |

Rough order of value: start with dinner-invitations (two functions → one
Edge function frees 2 Vercel slots in one step) and account (one slot
but high-leverage because account deletion is infrequent + DB-heavy, so
Edge cold starts don't matter).

## Keep on Vercel

| Endpoint | Why |
|---|---|
| `api/ai/[action].js` | Calls external AI providers (Gemini, Puter). Works on Deno too, but Vercel's Node runtime has better observability for the prompt/response debugging we actually do here. |
| `api/recipes/index.js` (search, import) | URL scraping + Spoonacular/HelloFresh API + Gemini parsing — external-integration heavy. |
| `api/cron/scrape.js` | Vercel Cron triggers it; Supabase would need its own scheduler. |

## How to migrate one

For each candidate:

1. Copy the handler logic into `supabase/functions/<name>/index.ts`.
2. Rewrite the `req`/`res` contract to Edge's `Request`/`Response` style
   (Deno `Deno.serve` or the Supabase `serve` helper).
3. Port env vars: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
   auto-injected in Edge Functions. Any others (like `GEMINI_API_KEY`)
   need to be set via `supabase secrets set`.
4. Deploy: `supabase functions deploy <name>`.
5. Update the client `apiFetch` base path for that endpoint — point at
   `https://<project>.supabase.co/functions/v1/<name>` and strip the
   service-role routing logic (Edge handles auth from the same JWT).
6. Delete the old Vercel file. Redeploy Vercel; function count drops.

## Decision rule

Don't migrate speculatively. Wait until a feature needs a new slot.
Each migration adds a second runtime to keep healthy (deploys, logs,
envs) — that cost is only worth paying when Vercel's cap actually
blocks a shipment.
