import { normalizeSpoonacular } from '../_lib/normalize.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id required' });

  if (String(id).startsWith('hf-')) {
    return res.status(404).json({ error: 'Use meal_plan_items.recipe_data for HelloFresh recipes' });
  }

  if (!process.env.SPOONACULAR_API_KEY) {
    return res.status(503).json({ error: 'SPOONACULAR_API_KEY not configured' });
  }

  const response = await fetch(
    `https://api.spoonacular.com/recipes/${id}/information?includeNutrition=true&apiKey=${process.env.SPOONACULAR_API_KEY}`
  );

  if (!response.ok) {
    return res.status(response.status).json({ error: 'Recipe not found' });
  }

  const data = await response.json();
  res.json(normalizeSpoonacular(data));
}
