import { decrypt } from './crypto.js';

const PUTER_ENDPOINT = 'https://api.puter.com/puterai/openai/v1/chat/completions';
const PUTER_MODEL = process.env.PUTER_MODEL || 'claude-sonnet-4-5';

// Gemini model fallback chain. Flash-Lite has the most generous free-tier
// rate limits, so we hit it first. On 429 (quota/rate) or 503 (upstream
// unavailable) we fall back to Flash, then Pro. Any other error bubbles.
//
// Override with GEMINI_MODELS=a,b,c for a custom chain, or the legacy
// GEMINI_MODEL=a for a single-model no-fallback setup.
const GEMINI_MODELS = (
  process.env.GEMINI_MODELS ||
  process.env.GEMINI_MODEL ||
  'gemini-2.5-flash-lite,gemini-2.5-flash,gemini-2.5-pro'
).split(',').map((s) => s.trim()).filter(Boolean);

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

// Shared helper: POST a generateContent request to Gemini with model-chain
// fallback. Returns the parsed response body on success. Exported so the
// URL-import scraper can reuse the same fallback logic instead of pinning
// a single model.
export async function callGemini(apiKey, body) {
  let lastError;
  for (const model of GEMINI_MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    if (res.ok) return { data: await res.json(), model };

    const errBody = await res.json().catch(() => ({}));
    const errMsg = errBody?.error?.message || '';

    // Fall back on:
    //   - 429 (rate / quota)
    //   - 503 (upstream unavailable)
    //   - any status with a message indicating the specific model isn't
    //     available to this project (denied access, not enabled, not found,
    //     not supported). These are model-scoped errors that the next
    //     model in the chain can sometimes satisfy.
    const modelScopedDenial = /denied access|not authorized|not enabled|is not supported|is not found|permission.*model/i.test(errMsg);
    if (res.status === 429 || res.status === 503 || modelScopedDenial) {
      console.warn(`[gemini] ${model} → ${res.status}, falling back:`, errMsg || '(no detail)');
      lastError = new Error(errMsg || `Gemini ${res.status}`);
      continue;
    }

    // Permanent / config error (bad key, malformed request) — bubble.
    throw new Error(errMsg || `Gemini AI error (${res.status})`);
  }
  throw lastError || new Error('All Gemini models exhausted');
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

  // Gemini (default) — with lite → flash → pro fallback.
  const { data } = await callGemini(token, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' },
  });
  // Use the last part — thinking-enabled models prepend a thought part before the response
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts[parts.length - 1]?.text || '';
}
