# Tiers & gifting

## Overview

Three tiers cover every user:

| Tier    | Who                                    | AI cap                          | Features                          |
|---------|----------------------------------------|---------------------------------|-----------------------------------|
| Free    | Default for every new user             | 15 + 5 × members / week         | 4 search results, 1 side dish     |
| BYOK    | Household connected their own API key  | No cap (they pay the API cost)  | Same as Free — no feature unlock  |
| Premium | Per-user `is_premium` flag             | Unlimited                       | All features                      |

**Free** is the default for every new account. Joining someone's household never transfers their premium status — each person starts free until they pay or are gifted.

**BYOK** (Bring Your Own Key) means the household connected a Gemini or Puter API key in Settings. The key owner covers the API cost for the whole household (intentional — shared kitchen, shared cost), so there's no weekly AI cap. However, the free-tier feature gates still apply: 4 recipe search results, 1 side dish suggestion per request, no AI pantry disambiguation, no AI shopping list clean. BYOK is a better experience for households that hit the weekly cap, but it's not a substitute for Premium.

**Premium** (`household_members.is_premium = true`) is per-user: all features unlocked, no AI cap. Either a paid subscription (€4.99/month, not yet live) or admin-gifted.

---

## What premium unlocks

| Feature                            | Free | BYOK | Premium |
|------------------------------------|------|------|---------|
| AI suggestions / week              | 15 + 5×members | No cap (own key) | Unlimited |
| Recipe search results              | 4    | 4    | Unlimited |
| Side dish suggestions              | 1    | 1    | All       |
| AI pantry name disambiguation      | —    | —    | ✓         |
| AI shopping list clean             | —    | —    | ✓         |
| Daily macro tracking               | —    | —    | ✓         |
| Export to PDF / Google Calendar    | —    | —    | soon      |
| Recipe history & insights          | —    | —    | soon      |
| Advanced recipe filters            | —    | —    | soon      |
| Cross-household favourites sync    | —    | —    | soon      |

---

## Gifting someone premium

Gifting is per-user — it sets `is_premium = true` on the user's row in `household_members`, not on the household. Inviting someone to your household never passes your status to them.

**Steps:**

1. **Find the user's row**

   Supabase → Table editor → `household_members`. Find the row by matching `user_id` (cross-reference via `auth.users` by email if needed) and `household_id`.

2. **Set the flag**

   ```sql
   update public.household_members
   set is_premium = true
   where user_id      = '<user-uuid>'
     and household_id = '<household-uuid>';
   ```

   Or: find the row in the Table editor, flip `is_premium` to `true`, save.

3. **Done** — takes effect on their next page load.

---

## Revoking premium

```sql
update public.household_members
set is_premium = false
where user_id      = '<user-uuid>'
  and household_id = '<household-uuid>';
```

---

## Notes

- A user can be premium in one household and free in another — `is_premium` is per row.
- There's no expiry — revoke manually when needed.
- The `is_gifted` column on `household_preferences` is kept in place but no longer read for access checks. It was used by the old household-level gifting system.
- BYOK keys (`gemini_api_key_hint`, `puter_token_hint`) stay on `household_preferences` intentionally — when you connect your own key you're covering the AI cost for the whole household.
- Premium status is invisible to the user in the UI (no "gifted" badge shown to them).
