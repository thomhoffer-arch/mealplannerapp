'use strict';

// POST /api/ai/suggest
// Body: { recipe, preferences }
// Returns: { suitable, issues, substitutions, tips }
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'GEMINI_API_KEY not configured' });

  const { recipe, preferences } = req.body || {};
  if (!recipe) return res.status(400).json({ error: 'recipe is required' });

  const prompt = buildPrompt(recipe, preferences || {});

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error('Gemini error:', err);
    return res.status(502).json({ error: 'AI service error' });
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return res.status(502).json({ error: 'Empty AI response' });

  try {
    res.json(JSON.parse(text));
  } catch {
    res.status(502).json({ error: 'Could not parse AI response' });
  }
};

function buildPrompt(recipe, preferences) {
  const restrictions = [
    ...(preferences.dietary_restrictions || []),
    ...(preferences.intolerances || []),
  ];
  const dislikes = preferences.dislikes || '';

  const ingredientList = (recipe.ingredients || [])
    .map((i) => `- ${i.amount ? i.amount + ' ' : ''}${i.name}`)
    .join('\n');

  return `You are a helpful cooking assistant. Analyse this recipe against the household's dietary needs and suggest specific adaptations.

HOUSEHOLD PREFERENCES:
${restrictions.length ? `Dietary restrictions / intolerances: ${restrictions.join(', ')}` : 'No dietary restrictions.'}
${dislikes ? `Dislikes: ${dislikes}` : ''}

RECIPE: ${recipe.name}
Source: ${recipe.source || 'Unknown'}
Servings: ${recipe.servings || 2}

INGREDIENTS:
${ingredientList || 'Not listed'}

STEPS (summary):
${(recipe.steps || []).slice(0, 3).join(' | ') || 'Not listed'}

Return ONLY a JSON object with this exact structure — no markdown, no explanation:
{
  "suitable": <boolean — true if recipe already fits the preferences>,
  "issues": [<string — each specific problem found, e.g. "pasta contains gluten">],
  "substitutions": [
    {
      "original": "<exact ingredient as listed>",
      "replacement": "<what to use instead>",
      "reason": "<one short sentence why>"
    }
  ],
  "tips": "<optional short paragraph with any useful cooking notes for the adaptations>"
}

If the recipe already fits all preferences, return suitable: true, empty issues and substitutions arrays, and a brief encouraging tip.`;
}
