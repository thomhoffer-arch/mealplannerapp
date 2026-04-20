import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../_lib/auth.js';
import { encrypt } from '../_lib/crypto.js';

export default async function handler(req, res) {
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
