-- Toggle for the in-app activity feed (meal plan / starred changes).
-- Default on — matches existing behaviour for rows created before this
-- column existed.
alter table public.household_preferences
  add column if not exists notifications_enabled boolean not null default true;

-- NOTE (follow-up): to filter notifications to "things other people did",
-- the underlying tables need an added_by uuid column tracking which user
-- caused the row. meal_plan_items, starred_recipes, and cooked_recipes
-- don't track that today. Until they do, the feed reports the user's
-- own actions too — informational but noisy.
