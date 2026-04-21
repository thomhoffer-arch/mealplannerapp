import { createClient } from '@supabase/supabase-js';
import handleSuggestWeek from '../_lib/ai-handlers/suggest-week.js';
import handleSuggest from '../_lib/ai-handlers/suggest.js';
import handleSuggestSide from '../_lib/ai-handlers/suggest-side.js';
import handleGenerateRecipe from '../_lib/ai-handlers/generate-recipe.js';
import handleShoppingInsights from '../_lib/ai-handlers/shopping-insights.js';
import handleModerate from '../_lib/ai-handlers/moderate.js';
import handleRegenerateDay from '../_lib/ai-handlers/regenerate-day.js';
import handleNormalizePantryItem from '../_lib/ai-handlers/normalize-pantry-item.js';
import handleNormalizeShoppingList from '../_lib/ai-handlers/normalize-shopping-list.js';
import handleSearchDeals from '../_lib/ai-handlers/search-deals.js';
import handleGenerateRecipesBatch from '../_lib/ai-handlers/generate-recipes-batch.js';
import { applyCors } from '../_lib/cors.js';
import { getUserAndHousehold } from '../_lib/auth.js';
import { checkRateLimits } from '../_lib/rate-limit.js';

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
  'regenerate-day':        handleRegenerateDay,
  'normalize-pantry-item':    handleNormalizePantryItem,
  'normalize-shopping-list':  handleNormalizeShoppingList,
  'search-deals':             handleSearchDeals,
  'generate-recipes-batch':   handleGenerateRecipesBatch,
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  const { action } = req.query;
  // One-line log per request so Vercel function logs reveal the exact
  // method + action received. Helps diagnose 405s that shouldn't happen.
  console.log(`[ai] ${req.method} action=${action}`);

  const impl = HANDLERS[action];
  if (!impl) return res.status(404).json({ error: `Unknown AI action: ${action}`, known_actions: Object.keys(HANDLERS) });

  // Central rate limit check — runs before every AI handler.
  // Uses allowAmbiguous so multi-household users aren't blocked; if we can
  // resolve a householdId we apply per-household burst/hourly limits. Fails
  // open (never blocks) if auth is absent or the rate_limit table isn't
  // migrated yet.
  if (req.method === 'POST') {
    try {
      const authResult = await getUserAndHousehold(req, { allowAmbiguous: true });
      const householdId = authResult?.ctx?.householdId;
      if (householdId) {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const limitErr = await checkRateLimits(supabase, householdId);
        if (limitErr) return res.status(429).json({ error: limitErr });
      }
    } catch {
      // Auth/rate-limit errors must never prevent the handler from running.
    }
  }

  try {
    return await impl(req, res);
  } catch (err) {
    console.error(`[ai/${action}] unhandled:`, err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
