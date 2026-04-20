# Giving someone unlimited access

Use this to set up a free unlimited account for friends, family, or testers.

---

## What it does

Setting `is_gifted = true` on a household grants:
- Unlimited AI calls (no weekly cap)
- Full recipe library (all search results)
- All features unlocked

It bypasses every limit without needing a Puter token or API key.

---

## Steps

1. **Find the household ID**

   Go to Supabase → Table editor → `households`.
   Find the row for the person's account (match by `name` or join via `household_members` → `user_id`).
   Copy the `id` (UUID).

2. **Set the flag**

   Go to `household_preferences`. Find the row where `household_id` matches.
   Set `is_gifted` to `true` and save.

   Or run in the SQL editor:
   ```sql
   update household_preferences
   set is_gifted = true
   where household_id = '<paste-uuid-here>';
   ```

3. **Done** — takes effect on their next page load. No action needed on their end.

---

## To revoke

```sql
update household_preferences
set is_gifted = false
where household_id = '<paste-uuid-here>';
```

---

## Notes

- If the row doesn't exist yet in `household_preferences` (they skipped onboarding), insert it:
  ```sql
  insert into household_preferences (household_id, is_gifted)
  values ('<paste-uuid-here>', true)
  on conflict (household_id) do update set is_gifted = true;
  ```
- `is_gifted` has no expiry — revoke manually when needed.
- The person doesn't see any "gifted" label in the UI; it's invisible to them.
