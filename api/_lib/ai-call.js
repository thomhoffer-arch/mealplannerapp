import { decrypt } from './crypto.js';

const PUTER_ENDPOINT = 'https://api.puter.com/puterai/openai/v1/chat/completions';
const PUTER_MODEL = process.env.PUTER_MODEL || 'claude-sonnet-4-5';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

export async function resolveAiProvider(supabase, householdId) {
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

export async function callAi(provider, token, prompt) {
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
    const content = data.choices?.[0]?.message?.content;
    // Puter may return content as an already-parsed object rather than a string
    if (content && typeof content === 'object') return JSON.stringify(content);
    const text = (content || '').trim();
    // Strip markdown code fences that some model/proxy combos add
    const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    return fenced ? fenced[1] : text;
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
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `Gemini AI error (${res.status})`);
  }
  const data = await res.json();
  // Use the last part — thinking-enabled models prepend a thought part before the response
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts[parts.length - 1]?.text || '';
}
