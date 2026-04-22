import { requireAuth } from '../_lib/auth.js';
import { isGiftedHousehold, WEEKLY_FREE_LIMIT, currentWeekKey, weekStartDayFromReminder } from '../_lib/usage.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const { supabase, householdId } = ctx;

  const [giftedResult, prefsResult] = await Promise.all([
    isGiftedHousehold(supabase, householdId),
    supabase.from('household_preferences')
      .select('gemini_api_key_hint, puter_token_hint, ai_credits, reminder_day')
      .eq('household_id', householdId)
      .maybeSingle(),
  ]);

  const prefs = prefsResult.data || {};
  const unlimited = giftedResult || !!(prefs.gemini_api_key_hint || prefs.puter_token_hint);

  if (unlimited) {
    return res.json({ used: 0, limit: WEEKLY_FREE_LIMIT, unlimited: true, credits: prefs.ai_credits || 0 });
  }

  const weekKey = currentWeekKey(weekStartDayFromReminder(prefs.reminder_day));
  const { data } = await supabase
    .from('ai_usage')
    .select('call_count')
    .eq('household_id', householdId)
    .eq('usage_date', weekKey)
    .maybeSingle();

  return res.json({
    used: data?.call_count || 0,
    limit: WEEKLY_FREE_LIMIT,
    unlimited: false,
    credits: prefs.ai_credits || 0,
  });
}
