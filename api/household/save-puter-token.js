'use strict';

const { createClient } = require('@supabase/supabase-js');
const { getUserAndHousehold } = require('../_lib/auth');
const { encrypt } = require('../_lib/crypto');

// POST /api/household/save-puter-token
// Body: { token: "<puter auth token>" }  — send empty string to remove
//
// Stores the household's Puter auth token encrypted. When set, AI calls
// for this household route through Puter's OpenAI-compatible endpoint
// and Puter bills the token owner's account (user-pays model).
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const ctx = await getUserAndHousehold(req);
  if (!ctx) return res.status(401).json({ error: 'Unauthorized' });

  const token = (req.body?.token || '').trim();

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (!token) {
    await supabase
      .from('household_preferences')
      .upsert({ household_id: ctx.householdId, puter_token_encrypted: null, puter_token_hint: null },
               { onConflict: 'household_id' });
    return res.json({ removed: true });
  }

  // Validate against Puter's OpenAI-compatible models endpoint before storing.
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

  res.json({ saved: true, hint });
};
