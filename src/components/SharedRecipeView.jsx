import React, { useEffect, useState } from 'react';
import { ChefHat, Clock, Users, ExternalLink } from 'lucide-react';

// Public read-only view of a shared recipe. No auth required; fetches by
// token from /api/recipes?share=TOKEN. Mounted by App.jsx when the URL
// contains ?recipe_share=...
export default function SharedRecipeView({ token, onClose }) {
  const [recipe, setRecipe] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/recipes?share=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || 'Could not load share');
        setRecipe(data.recipe);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-orange-100 p-6 max-w-sm text-center">
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={onClose} className="mt-4 text-sm text-orange-600 hover:text-orange-900 font-medium">
            Back to app
          </button>
        </div>
      </div>
    );
  }

  const total = (recipe.prepTime || 0) + (recipe.cookTime || 0);

  return (
    <div className="min-h-screen bg-paper pb-12">
      <div className="max-w-2xl mx-auto p-4">
        <div className="flex items-center gap-2 mb-6 text-xs text-orange-400">
          <ChefHat size={14} />
          <span>Shared recipe</span>
        </div>

        <h1 className="font-display text-2xl font-bold text-orange-900 mb-2">{recipe.name}</h1>
        {recipe.overview && <p className="text-sm text-orange-700 mb-4 leading-relaxed">{recipe.overview}</p>}

        <div className="flex items-center gap-4 text-xs text-orange-600 mb-6">
          {total > 0 && (
            <span className="flex items-center gap-1"><Clock size={12} /> {total} min</span>
          )}
          {recipe.servings && (
            <span className="flex items-center gap-1"><Users size={12} /> {recipe.servings} servings</span>
          )}
        </div>

        {recipe.ingredients?.length > 0 && (
          <div className="bg-white rounded-2xl border border-orange-100 p-4 mb-4">
            <h2 className="text-xs font-semibold text-orange-900 uppercase tracking-wide mb-3">Ingredients</h2>
            <ul className="space-y-1.5 text-sm text-orange-900">
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-orange-400">•</span>
                  <span>{ing.amount ? `${ing.amount} ` : ''}{ing.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {recipe.steps?.length > 0 && (
          <div className="bg-white rounded-2xl border border-orange-100 p-4 mb-4">
            <h2 className="text-xs font-semibold text-orange-900 uppercase tracking-wide mb-3">Steps</h2>
            <ol className="space-y-3 text-sm text-orange-900 leading-relaxed">
              {recipe.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 text-orange-600 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-4 py-3 bg-orange-500 text-white rounded-full font-semibold text-sm hover:bg-orange-600 transition flex items-center justify-center gap-2"
        >
          <ExternalLink size={14} />
          Open the meal planner
        </button>
      </div>
    </div>
  );
}
