'use strict';

const WEEKLY_FREE_LIMIT = 15;

// Monday of the current ISO week, as YYYY-MM-DD, in UTC.
// Reusing the existing `ai_usage.usage_date` column — records from the
// earlier daily scheme remain but are effectively orphaned by the new key.
function currentWeekKey() {
  const date = new Date();
  const day = date.getUTCDay();            // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

// Returns true if the household has hit the cap this week.
// Otherwise increments and returns false.
async function checkAndIncrementUsage(supabase, householdId, limit = WEEKLY_FREE_LIMIT) {
  const weekKey = currentWeekKey();

  const { data } = await supabase
    .from('ai_usage')
    .select('call_count')
    .eq('household_id', householdId)
    .eq('usage_date', weekKey)
    .single();

  if (data && data.call_count >= limit) return true;

  await supabase.from('ai_usage').upsert(
    { household_id: householdId, usage_date: weekKey, call_count: (data?.call_count || 0) + 1 },
    { onConflict: 'household_id,usage_date' }
  );
  return false;
}

// Returns true if the household has is_gifted = true (bypass usage cap).
async function isGiftedHousehold(supabase, householdId) {
  const { data } = await supabase
    .from('household_preferences')
    .select('is_gifted')
    .eq('household_id', householdId)
    .maybeSingle();
  return !!(data?.is_gifted);
}

module.exports = { checkAndIncrementUsage, isGiftedHousehold, WEEKLY_FREE_LIMIT };
