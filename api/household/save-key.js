import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../_lib/auth.js';
import { encrypt } from '../_lib/crypto.js';
import { applyCors } from '../_lib/cors.js';

// Household actions endpoint. Legacy filename — it now serves all
// household-scoped actions (folded to stay under the 12-fn Vercel cap):
//
//   GET                           → list the caller's households
//   POST  { key | token }         → save/remove Gemini key or Puter token
//   DELETE                        → leave the active household
//   DELETE { member_user_id }     → remove a member (any member can kick
//                                    another — symmetrical, trust-based;
//                                    tighten later if you need ownership).
//                                    If the last member leaves, the
//                                    household is deleted via cascade.
export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method === 'GET') {
    const ctx = await requireAuth(req, res, { allowAmbiguous: true });
    if (!ctx) return;

    if (ctx.memberships.length === 0) {
      return res.json({ households: [], active_id: null });
    }

    const { data, error } = await ctx.supabase
      .from('households')
      .select('id, name')
      .in('id', ctx.memberships);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ households: data || [], active_id: ctx.householdId });
  }

  if (req.method === 'DELETE') {
    const ctx = await requireAuth(req, res);
    if (!ctx) return;

    const targetUserId = (req.body?.member_user_id || ctx.user.id);

    // Verify the target is actually in this household.
    const { data: target } = await ctx.supabase
      .from('household_members')
      .select('user_id')
      .eq('household_id', ctx.householdId)
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (!target) return res.status(404).json({ error: 'Not a member of this household' });

    const { error: delErr } = await ctx.supabase
      .from('household_members')
      .delete()
      .eq('household_id', ctx.householdId)
      .eq('user_id', targetUserId);

    if (delErr) return res.status(500).json({ error: delErr.message });

    // If that was the last member, drop the household so data doesn't orphan.
    // Everything referencing household_id cascades via the FK definitions.
    const { count } = await ctx.supabase
      .from('household_members')
      .select('*', { count: 'exact', head: true })
      .eq('household_id', ctx.householdId);

    if (count === 0) {
      await ctx.supabase.from('households').delete().eq('id', ctx.householdId);
    }

    return res.json({ removed: true, household_deleted: count === 0 });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if ('token' in (req.body || {})) {
    const token = (req.body.token || '').trim();

    if (!token) {
      await supabase
        .from('household_preferences')
        .upsert({ household_id: ctx.householdId, puter_token_encrypted: null, puter_token_hint: null },
                 { onConflict: 'household_id' });
      return res.json({ removed: true });
    }

    let puterOk = false;
    try {
      const testRes = await fetch('https://api.puter.com/puterai/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
      puterOk = testRes.ok;
    } catch {
      return res.status(422).json({ error: 'Could not reach Puter to validate token — check your connection and try again.' });
    }
    if (!puterOk) {
      return res.status(422).json({ error: 'Invalid Puter token — please check and try again.' });
    }

    let encrypted;
    try { encrypted = encrypt(token); } catch (err) {
      console.error('[save-key] encrypt failed:', err.message);
      return res.status(500).json({ error: 'Server configuration error — ENCRYPTION_KEY is not set correctly.' });
    }
    const hint = token.slice(-4);
    await supabase
      .from('household_preferences')
      .upsert({ household_id: ctx.householdId, puter_token_encrypted: encrypted, puter_token_hint: hint },
               { onConflict: 'household_id' });
    return res.json({ saved: true, hint });
  }

  const key = (req.body?.key || '').trim();

  if (!key) {
    await supabase
      .from('household_preferences')
      .upsert({ household_id: ctx.householdId, gemini_api_key_encrypted: null, gemini_api_key_hint: null },
               { onConflict: 'household_id' });
    return res.json({ removed: true });
  }

  let geminiOk = false;
  try {
    const testRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
      { signal: AbortSignal.timeout(8000) }
    );
    geminiOk = testRes.ok;
    if (!geminiOk) {
      return res.status(422).json({ error: 'Invalid Gemini API key — please check and try again.' });
    }
  } catch {
    return res.status(422).json({ error: 'Could not reach Google to validate the key — check your connection and try again.' });
  }

  let encrypted;
  try { encrypted = encrypt(key); } catch (err) {
    console.error('[save-key] encrypt failed:', err.message);
    return res.status(500).json({ error: 'Server configuration error — ENCRYPTION_KEY is not set correctly.' });
  }
  const hint = key.slice(-4);
  await supabase
    .from('household_preferences')
    .upsert({ household_id: ctx.householdId, gemini_api_key_encrypted: encrypted, gemini_api_key_hint: hint },
             { onConflict: 'household_id' });
  res.json({ saved: true, hint });
}
