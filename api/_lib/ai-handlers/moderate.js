import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../auth.js';
import { resolveAiProvider, callAi } from '../ai-call.js';

// Tiered safety review of recipe content.
//
//   severity: 'ok'    → silent pass
//             'warn'  → show a warning on save, let user proceed
//             'block' → refuse to save
//
// Used on user-supplied content (URL imports, generated recipes, user-
// created recipes). The caller decides what to do with the response;
// this handler just classifies.
export default async function handleModerate(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { recipe, text } = req.body || {};
  const content = (text || (recipe ? [
    recipe.name,
    recipe.overview,
    'Ingredients: ' + (recipe.ingredients || []).map((i) => `${i.amount || ''} ${i.name}`).join(', '),
    'Steps: ' + (recipe.steps || []).join(' '),
  ].filter(Boolean).join('\n') : '')).trim();

  if (!content) return res.status(400).json({ error: 'recipe or text is required' });

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { provider, token } = await resolveAiProvider(supabase, ctx.householdId);
  if (!token) return res.status(503).json({ error: 'No AI provider configured' });

  const prompt = `Review this recipe content for safety and appropriateness. Classify any issues.

CONTENT:
${content.slice(0, 3000)}

Severity guidelines:
- "ok": no concerns.
- "warn": minor issues worth flagging but not blocking — unusual
  ingredient combos, ambiguous measurements, non-standard techniques,
  plausible but unflagged allergen risk.
- "block": must not be saved — food-safety violations (dangerous
  undercooking, raw/unsafe animal products eaten raw), toxic or
  inedible ingredients, medical misinformation, offensive or clearly
  spam content.

Return ONLY JSON, no markdown:
{
  "severity": "ok" | "warn" | "block",
  "issues": ["<short issue 1>"],
  "summary": "<one sentence, user-friendly>"
}`;

  let rawText;
  try {
    rawText = await callAi(provider, token, prompt);
  } catch (err) {
    return res.status(502).json({ error: err.message || 'AI service error' });
  }
  if (!rawText) return res.status(502).json({ error: 'Empty AI response' });

  let parsed;
  try { parsed = JSON.parse(rawText); } catch {
    return res.status(502).json({ error: 'Could not parse AI response' });
  }

  const severity = ['ok', 'warn', 'block'].includes(parsed.severity) ? parsed.severity : 'ok';
  return res.json({
    severity,
    issues: Array.isArray(parsed.issues) ? parsed.issues.slice(0, 5).map(String) : [],
    summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 300) : '',
  });
}
