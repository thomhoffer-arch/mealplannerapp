'use strict';

const { createClient } = require('@supabase/supabase-js');
const { getUserAndHousehold } = require('../_lib/auth');
const { encrypt } = require('../_lib/crypto');

// POST /api/household/save-key
// Body: { key: "AIza..." }  — send empty string to remove the key
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const ctx = await getUserAndHousehold(req);
  if (!ctx) return res.status(401).json({ error: 'Unauthorized' });

  const key = (req.body?.key || '').trim();

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Empty key = remove
  if (!key) {
    await supabase
      .from('household_preferences')
      .upsert({ household_id: ctx.householdId, gemini_api_key_encrypted: null, gemini_api_key_hint: null },
               { onConflict: 'household_id' });
    return res.json({ removed: true });
  }

  // Validate key against Gemini before storing
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
};
