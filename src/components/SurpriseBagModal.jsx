import React, { useState, useMemo } from 'react';
import { X, Sparkles, Plus } from 'lucide-react';
import { apiFetch } from '../lib/api';

export default function SurpriseBagModal({ household, dietaryPrefs, starredRecipes = [], onAddRecipes, onClose }) {
  const [tab, setTab] = useState('bag');
  const [ingredients, setIngredients] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  async function suggest() {
    if (!ingredients.trim()) return;
    setLoading(true);
    setError('');
    setSuggestions([]);
    try {
      const data = await apiFetch('/api/ai/suggest-side', {
        method: 'POST',
        body: { bag_ingredients: ingredients.trim(), dietary_prefs: dietaryPrefs || '' },
      });
      setSuggestions(data.suggestions || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function addToWeek(recipe) {
    onAddRecipes([recipe]);
    onClose();
  }

  function addBagSuggestion(s) {
    addToWeek({
      id: `bag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: s.name,
      source: 'AI Suggestion',
      overview: s.description,
      _aiSuggestion: true,
      _fromBag: true,
      servings: 2,
      ingredients: [],
      steps: [],
      keywords: ['surprise bag'],
      macros: {},
    });
  }

  function addNewPersonalRecipe() {
    if (!search.trim()) return;
    addToWeek({
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: search.trim(),
      source: 'My Recipes',
      overview: '',
      _quickEntry: true,
      servings: 2,
      ingredients: [],
      steps: [],
      keywords: [],
      macros: {},
    });
  }

  const filteredRecipes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return starredRecipes;
    return starredRecipes.filter((r) => r?.name?.toLowerCase().includes(q));
  }, [search, starredRecipes]);

  const hasExactMatch = starredRecipes.some(
    (r) => r?.name?.toLowerCase() === search.trim().toLowerCase()
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-warm-lg w-full max-w-sm flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-orange-50">
          <div>
            <h2 className="font-display text-base font-bold text-orange-900">Cook from what you've got</h2>
            <p className="text-xs text-orange-400">Too Good To Go bag, fridge clean-out, market find</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-orange-400 hover:bg-orange-50 transition">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-orange-50 px-5">
          <button
            onClick={() => setTab('bag')}
            className={`text-xs font-medium py-2.5 mr-4 border-b-2 transition ${tab === 'bag' ? 'border-orange-500 text-orange-600' : 'border-transparent text-orange-300 hover:text-orange-500'}`}
          >
            What've I got?
          </button>
          <button
            onClick={() => setTab('personal')}
            className={`text-xs font-medium py-2.5 border-b-2 transition ${tab === 'personal' ? 'border-orange-500 text-orange-600' : 'border-transparent text-orange-300 hover:text-orange-500'}`}
          >
            Personal
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          {tab === 'bag' ? (
            <>
              <p className="text-xs text-orange-600 mb-3">Write down what you've got — we'll find something worth cooking with it.</p>
              <textarea
                rows={3}
                placeholder="e.g. 2 chicken thighs, half a butternut squash, some wilting spinach, Greek yogurt, a lemon…"
                value={ingredients}
                onChange={(e) => setIngredients(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.metaKey && !loading && suggest()}
                className="w-full border border-orange-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-orange-300 resize-none leading-relaxed"
                autoFocus
              />
              <button
                onClick={suggest}
                disabled={loading || !ingredients.trim()}
                className="w-full mt-2 py-2.5 bg-orange-500 text-white rounded-full font-semibold text-sm hover:bg-orange-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Sparkles size={13} />
                {loading ? 'Working on it…' : 'What can I make?'}
              </button>

              {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

              {loading && (
                <div className="flex items-center gap-2 mt-4 text-xs text-orange-400">
                  <div className="w-4 h-4 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                  Going through your ingredients…
                </div>
              )}

              {suggestions.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide">Slot into this week</p>
                  {suggestions.map((s) => (
                    <button
                      key={s.name}
                      onClick={() => addBagSuggestion(s)}
                      className="w-full text-left bg-orange-50 hover:bg-orange-100 rounded-xl px-3 py-3 transition border border-orange-100"
                    >
                      <p className="text-sm font-semibold text-orange-900">{s.name}</p>
                      <p className="text-xs text-orange-600 mt-0.5 leading-relaxed">{s.description}</p>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-orange-600 mb-3">Search your recipes or add a new one by name.</p>
              <input
                type="text"
                autoFocus
                placeholder="Search or type a recipe name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !filteredRecipes.length && addNewPersonalRecipe()}
                className="w-full border border-orange-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-orange-300"
              />

              {filteredRecipes.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {filteredRecipes.map((r) => (
                    <button
                      key={r.id || r.name}
                      onClick={() => addToWeek({ ...r, _plannedDay: undefined })}
                      className="w-full text-left bg-orange-50 hover:bg-orange-100 rounded-xl px-3 py-2.5 transition border border-orange-100"
                    >
                      <p className="text-sm font-semibold text-orange-900">{r.name}</p>
                      {r.overview && <p className="text-xs text-orange-500 mt-0.5 line-clamp-1">{r.overview}</p>}
                    </button>
                  ))}
                </div>
              )}

              {search.trim() && !hasExactMatch && (
                <button
                  onClick={addNewPersonalRecipe}
                  className="w-full mt-3 py-2.5 border border-dashed border-orange-200 text-orange-500 rounded-full text-sm hover:border-orange-400 hover:text-orange-600 transition flex items-center justify-center gap-2"
                >
                  <Plus size={13} />
                  Add "{search.trim()}"
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
