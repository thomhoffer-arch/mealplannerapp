import handleSuggestWeek from '../_lib/ai-handlers/suggest-week.js';
import handleSuggest from '../_lib/ai-handlers/suggest.js';
import handleSuggestSide from '../_lib/ai-handlers/suggest-side.js';
import handleGenerateRecipe from '../_lib/ai-handlers/generate-recipe.js';
import handleShoppingInsights from '../_lib/ai-handlers/shopping-insights.js';
import handleModerate from '../_lib/ai-handlers/moderate.js';

// Single entry point for all AI operations.
//
// Vercel's [action].js pattern matches /api/ai/suggest-week, /api/ai/suggest,
// /api/ai/suggest-side, /api/ai/generate-recipe, /api/ai/shopping-insights —
// so client URLs are unchanged from when each action had its own file. This
// file counts as one Serverless Function on the Hobby plan instead of five.
const HANDLERS = {
  'suggest-week':      handleSuggestWeek,
  'suggest':           handleSuggest,
  'suggest-side':      handleSuggestSide,
  'generate-recipe':   handleGenerateRecipe,
  'shopping-insights': handleShoppingInsights,
  'moderate':          handleModerate,
};

export default async function handler(req, res) {
  const { action } = req.query;
  // One-line log per request so Vercel function logs reveal the exact
  // method + action received. Helps diagnose 405s that shouldn't happen.
  console.log(`[ai] ${req.method} action=${action}`);

  const impl = HANDLERS[action];
  if (!impl) return res.status(404).json({ error: `Unknown AI action: ${action}`, known_actions: Object.keys(HANDLERS) });
  try {
    return await impl(req, res);
  } catch (err) {
    console.error(`[ai/${action}] unhandled:`, err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
