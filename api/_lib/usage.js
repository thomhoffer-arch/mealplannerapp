export const WEEKLY_FREE_LIMIT = 40;

export function currentWeekKey() {
  const date = new Date();
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

export async function checkAndIncrementUsage(supabase, householdId, limit = WEEKLY_FREE_LIMIT) {
  // Temporary test escape hatch: set DISABLE_AI_LIMIT=1 on Vercel to
  // bypass the free-tier cap without touching the household_preferences
  // is_gifted column (useful while the Supabase console is misbehaving
  // or during a demo / dev pass). Remove when proper access tiers are
  // back in play.
  if (process.env.DISABLE_AI_LIMIT === '1' || process.env.DISABLE_AI_LIMIT === 'true') return false;

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

export async function isGiftedHousehold(supabase, householdId) {
  // Same escape hatch — pretend every household is gifted while the
  // flag is on so downstream checks that short-circuit on isGifted
  // also bypass the limit cleanly.
  if (process.env.DISABLE_AI_LIMIT === '1' || process.env.DISABLE_AI_LIMIT === 'true') return true;

  const { data } = await supabase
    .from('household_preferences')
    .select('is_gifted')
    .eq('household_id', householdId)
    .maybeSingle();
  return !!(data?.is_gifted);
}
