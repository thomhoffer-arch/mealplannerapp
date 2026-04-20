import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../_lib/auth.js';
import { encrypt } from '../_lib/crypto.js';

// Household actions endpoint. Despite the legacy filename, it now serves
// both reads and writes:
//   GET  → list the caller's households (uses allowAmbiguous so users with
//          multiple memberships can call it without selecting one first).
//   POST → save/remove the household's Gemini key or Puter token.
//
// Folded together to stay under the Vercel Hobby 12-function cap.
export default async function handler(req, res) {
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

    const testRes = await fetch('https://api.puter.com/puterai/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!testRes.ok) {
      return res.status(422).json({ error: 'Invalid Puter token — please check and try again.' });
    }

    const encrypted = encrypt(token);
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

  const testRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
  );
  if (!testRes.ok) {
    return res.status(422).json({ error: 'Invalid Gemini API key — please check and try again.' });
  }

  const encrypted = encrypt(key);
  const hint = key.slice(-4);
  await supabase
    .from('household_preferences')
    .upsert({ household_id: ctx.householdId, gemini_api_key_encrypted: encrypted, gemini_api_key_hint: hint },
             { onConflict: 'household_id' });
  res.json({ saved: true, hint });
}
