import { requireAuth } from './_lib/auth.js';
import { applyCors } from './_lib/cors.js';

// Account endpoint.
//   GET    → full data export as JSON (download)
//   DELETE → soft-delete: remove from all households, ban auth user for
//            the grace period, log in deleted_accounts. A future cron
//            can hard-purge rows whose purge_at has passed.
export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method === 'GET')    return exportData(req, res);
  if (req.method === 'DELETE') return softDelete(req, res);
  return res.status(405).end();
}

async function exportData(req, res) {
  const ctx = await requireAuth(req, res, { allowAmbiguous: true });
  if (!ctx) return;

  const { supabase, user, memberships } = ctx;
  const out = {
    exported_at: new Date().toISOString(),
    user: { id: user.id, email: user.email, created_at: user.created_at },
    households: [],
  };

  for (const hid of memberships) {
    const [h, members, pref, meal, starred, cooked, custom, checks, pantry, userRecipes] = await Promise.all([
      supabase.from('households').select('*').eq('id', hid).maybeSingle(),
      supabase.from('household_members').select('user_id, display_name, personal_prefs, onboarded_at').eq('household_id', hid),
      supabase.from('household_preferences').select('preferences_text, plan_extras_text, reminder_enabled, reminder_day').eq('household_id', hid).maybeSingle(),
      supabase.from('meal_plan_items').select('recipe_id, recipe_data, added_at').eq('household_id', hid),
      supabase.from('starred_recipes').select('recipe_id, recipe_data, rotation_priority').eq('household_id', hid),
      supabase.from('cooked_recipes').select('recipe_id, rating').eq('household_id', hid),
      supabase.from('custom_ingredients').select('recipe_id, name, amount').eq('household_id', hid),
      supabase.from('shopping_checks').select('item_name').eq('household_id', hid),
      supabase.from('pantry_items').select('name, amount').eq('household_id', hid),
      supabase.from('user_recipes').select('*').eq('household_id', hid),
    ]);

    out.households.push({
      household: h.data,
      members: members.data || [],
      preferences: pref.data,
      meal_plan: meal.data || [],
      starred_recipes: starred.data || [],
      cooked_recipes: cooked.data || [],
      custom_ingredients: custom.data || [],
      shopping_checks: checks.data || [],
      pantry: pantry.data || [],
      user_recipes: userRecipes.data || [],
    });
  }

  res.setHeader('Content-Disposition', `attachment; filename="mealplanner-export-${user.id}.json"`);
  return res.status(200).json(out);
}

async function softDelete(req, res) {
  const ctx = await requireAuth(req, res, { allowAmbiguous: true });
  if (!ctx) return;

  const { supabase, user, memberships } = ctx;
  const graceDays = Number(req.body?.grace_days) || 30;
  const purgeAt = new Date(Date.now() + graceDays * 86_400_000).toISOString();

  await supabase.from('deleted_accounts').upsert({
    user_id: user.id,
    deleted_at: new Date().toISOString(),
    purge_at: purgeAt,
    reason: req.body?.reason?.slice(0, 500) || null,
  });

  // Remove from every household; cascade-delete households where the user was the last member.
  for (const hid of memberships) {
    await supabase.from('household_members').delete().eq('household_id', hid).eq('user_id', user.id);
    const { count } = await supabase
      .from('household_members')
      .select('*', { count: 'exact', head: true })
      .eq('household_id', hid);
    if (count === 0) {
      await supabase.from('households').delete().eq('id', hid);
    }
  }

  // Ban the auth user for the grace period. Re-sign-in is blocked until purge_at.
  const { error: banErr } = await supabase.auth.admin.updateUserById(user.id, {
    ban_duration: `${graceDays * 24}h`,
  });
  if (banErr) console.error('[account] ban failed:', banErr.message);

  return res.json({ deleted: true, purge_at: purgeAt });
}
