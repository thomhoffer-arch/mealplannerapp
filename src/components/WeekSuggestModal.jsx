import React, { useState } from 'react';
import { X, Sparkles, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const SOURCE_COLORS = {
  HelloFresh:       'bg-green-100 text-green-700',
  'Marley Spoon':   'bg-amber-100 text-amber-700',
  'NYT Cooking':    'bg-red-100 text-red-700',
  Spoonacular:      'bg-orange-100 text-orange-700',
  'My Recipes':     'bg-amber-100 text-amber-700',
  'AI Suggestion':  'bg-orange-50 text-orange-500',
  'Web import':     'bg-orange-50 text-orange-500',
};

export default function WeekSuggestModal({ household, onClose, onLoadPlan }) {
  const [numWeeks, setNumWeeks] = useState(1);
  const [loading, setLoading]   = useState(false);
  const [plan, setPlan]         = useState(null);
  const [notes, setNotes]       = useState('');
  const [error, setError]       = useState('');
  const [selected, setSelected] = useState({});
  const [showNotes, setShowNotes] = useState(false);

  async function generate() {
    setLoading(true);
    setError('');
    setPlan(null);
    setSelected({});
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/ai/suggest-week', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ weeks: numWeeks }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not generate plan');
      setPlan(data.weeks);
      setNotes(data.notes || '');
      const sel = {};
      data.weeks.forEach((week) => {
        week.days.forEach((day) => {
          if (day.recipe) sel[`${week.week}-${day.day}`] = true;
        });
      });
      setSelected(sel);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function toggleDay(weekNum, day) {
    const key = `${weekNum}-${day}`;
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleLoadPlan() {
    if (!plan) return;
    const recipes = [];
    plan.forEach((week) => {
      week.days.forEach((day) => {
        if (selected[`${week.week}-${day.day}`] && day.recipe) {
          recipes.push(day.recipe);
        }
      });
    });
    onLoadPlan(recipes);
    onClose();
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-orange-50">
          <div className="flex items-center gap-2">
            <Sparkles size={17} className="text-orange-500" />
            <h2 className="text-base font-bold text-orange-900">AI week planner</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-orange-300 hover:bg-orange-50 transition">
            <X size={16} />
          </button>
        </div>

        {/* Controls */}
        <div className="px-5 pt-4 pb-3 flex items-center gap-3">
          <span className="text-sm font-medium text-orange-800">Plan:</span>
          {[1, 2].map((w) => (
            <button key={w} onClick={() => setNumWeeks(w)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition border-2 ${
                numWeeks === w ? 'bg-orange-500 text-white border-orange-500' : 'border-orange-200 text-orange-700 hover:border-orange-400'
              }`}>
              {w} week{w > 1 ? 's' : ''}
            </button>
          ))}
          <button onClick={generate} disabled={loading}
            className="ml-auto px-4 py-1.5 bg-orange-500 text-white rounded-full text-sm font-semibold hover:bg-orange-600 transition disabled:opacity-50 flex items-center gap-1.5">
            <Sparkles size={12} />
            {loading ? 'Planning…' : plan ? 'Regenerate' : 'Generate'}
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 pb-4">
          {error && (
            <div className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2 mb-3">{error}</div>
          )}

          {loading && (
            <div className="flex flex-col items-center py-12 gap-3">
              <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
              <p className="text-sm text-orange-500">Planning your week…</p>
              <p className="text-xs text-orange-300">Checking your preferences and starred recipes</p>
            </div>
          )}

          {!loading && !plan && !error && (
            <div className="text-center py-10">
              <Sparkles size={40} className="mx-auto mb-3 text-orange-200" />
              <p className="text-sm text-orange-500 font-medium">AI will plan a varied week for you</p>
              <p className="text-xs text-orange-300 mt-1 leading-relaxed">Based on your preferences, starred recipes, and rotation priorities — no pasta two days in a row.</p>
            </div>
          )}

          {plan && !loading && plan.map((week) => (
            <div key={week.week} className="mb-4">
              {plan.length > 1 && (
                <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">Week {week.week}</p>
              )}
              <div className="space-y-2">
                {week.days.map((day) => {
                  const key = `${week.week}-${day.day}`;
                  const isSelected = !!selected[key];
                  const recipe = day.recipe;
                  const isAI = recipe?._aiSuggestion;
                  const isStarred = recipe?._fromStarred;
                  return (
                    <button key={day.day} onClick={() => toggleDay(week.week, day.day)}
                      className={`w-full text-left rounded-2xl border-2 px-3 py-3 transition-all ${
                        isSelected ? 'border-orange-400 bg-orange-50' : 'border-orange-100 bg-white'
                      }`}>
                      <div className="flex items-start gap-2">
                        <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 transition-all ${
                          isSelected ? 'bg-orange-500 border-orange-500' : 'border-orange-300'
                        }`}>
                          {isSelected && <Check size={11} className="text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-orange-500 uppercase">{day.day.slice(0, 3)}</span>
                            {isStarred && <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-semibold">⭐ Starred</span>}
                            {isAI && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-semibold">✨ New</span>}
                            {recipe?.source && !isAI && (
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${SOURCE_COLORS[recipe.source] || 'bg-orange-50 text-orange-500'}`}>
                                {recipe.source}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-orange-900 mt-0.5 leading-snug">{recipe?.name || day.name}</p>
                          {(recipe?.overview || day.overview) && (
                            <p className="text-xs text-orange-500 mt-0.5 line-clamp-1">{recipe?.overview || day.overview}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* AI notes */}
          {notes && plan && !loading && (
            <div className="mt-2">
              <button onClick={() => setShowNotes((v) => !v)}
                className="flex items-center gap-1 text-xs text-orange-500 font-medium hover:text-orange-700 transition">
                {showNotes ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                Planner notes
              </button>
              {showNotes && (
                <p className="text-xs text-orange-600 bg-orange-50 rounded-xl px-3 py-2 mt-1 leading-relaxed">{notes}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {plan && !loading && (
          <div className="px-5 py-4 border-t border-orange-50">
            <button onClick={handleLoadPlan} disabled={selectedCount === 0}
              className="w-full py-3 bg-orange-500 text-white rounded-full font-semibold text-sm hover:bg-orange-600 transition disabled:opacity-50">
              Add {selectedCount} recipe{selectedCount !== 1 ? 's' : ''} to my plan
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
