import { requireAuth } from '../_lib/auth.js';
import { isUserPremium, memberBasedLimit, currentWeekKey, weekStartDayFromReminder } from '../_lib/usage.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const { supabase, householdId } = ctx;

  const [giftedResult, prefsResult, limit] = await Promise.all([
    isUserPremium(supabase, householdId, ctx.user.id),
    supabase.from('household_preferences')
      .select('gemini_api_key_hint, puter_token_hint, ai_credits, reminder_day')
      .eq('household_id', householdId)
      .maybeSingle(),
    memberBasedLimit(supabase, householdId),
  ]);

  const prefs = prefsResult.data || {};
  const isByok = !!(prefs.gemini_api_key_hint || prefs.puter_token_hint);
  const isPremium = giftedResult;

  if (isPremium || isByok) {
    return res.json({
      used: 0,
      limit,
      unlimited: isPremium,
      byok: isByok && !isPremium,
      gifted: isPremium,
      credits: prefs.ai_credits || 0,
    });
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
    limit,
    unlimited: false,
    byok: false,
    credits: prefs.ai_credits || 0,
  });
}
