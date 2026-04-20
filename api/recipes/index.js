import handleSearch from '../_lib/recipes-handlers/search.js';
import handleImport from '../_lib/recipes-handlers/import.js';

// Consolidated recipes endpoint. Method-routed:
//   GET  /api/recipes?q=…&dietary=…  → search Spoonacular + HelloFresh
//   POST /api/recipes  body { url }  → scrape a URL via Gemini
//
// Keeps us under the Hobby 12-function cap — was previously two separate
// files. GET /api/recipes/:id still lives in [id].js (needs the path param).
export default async function handler(req, res) {
  try {
    if (req.method === 'GET')  return await handleSearch(req, res);
    if (req.method === 'POST') return await handleImport(req, res);
    return res.status(405).end();
  } catch (err) {
    console.error('[recipes] unhandled:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
