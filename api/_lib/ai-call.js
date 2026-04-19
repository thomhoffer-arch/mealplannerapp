'use strict';

// Unified AI call — picks a provider based on what's configured at the
// household level and returns the raw JSON text the prompt asked for.
//
// Priority order when resolving credentials:
//   1. Puter auth token (user's own Puter account, pay-as-you-go)
//   2. Personal Gemini API key (unlimited, BYOK)
//   3. Shared Gemini key with daily quota (default)
//
// Puter endpoint is OpenAI-compatible, so shape mirrors OpenAI chat
// completions. Gemini uses Google's generativelanguage API.

const { decrypt } = require('./crypto');

const PUTER_ENDPOINT = 'https://api.puter.com/puterai/openai/v1/chat/completions';
const PUTER_MODEL = process.env.PUTER_MODEL || 'claude-sonnet-4-5';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

async function resolveAiProvider(supabase, householdId) {
  try {
    const { data } = await supabase
      .from('household_preferences')
      .select('gemini_api_key_encrypted, puter_token_encrypted')
      .eq('household_id', householdId)
      .single();

    if (data?.puter_token_encrypted) {
      return { provider: 'puter', token: decrypt(data.puter_token_encrypted), usingSharedKey: false };
    }
    if (data?.gemini_api_key_encrypted) {
      return { provider: 'gemini', token: decrypt(data.gemini_api_key_encrypted), usingSharedKey: false };
    }
  } catch { /* fall through to shared key */ }

  return {
    provider: 'gemini',
    token: process.env.GEMINI_API_KEY || null,
    usingSharedKey: true,
  };
}

async function callAi(provider, token, prompt) {
  if (provider === 'puter') {
    const res = await fetch(PUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: PUTER_MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Puter AI error (${res.status}): ${detail.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // Gemini (default)
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini AI error (${res.status})`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

module.exports = { resolveAiProvider, callAi };
