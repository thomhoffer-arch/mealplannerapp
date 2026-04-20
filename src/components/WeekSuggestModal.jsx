import React, { useState } from 'react';
import { X, Sparkles, Check, ChevronDown, ChevronUp, Users, MinusCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const SOURCE_COLORS = {
  'My Recipes':     'bg-orange-100 text-orange-600',
  'AI Suggestion':  'bg-orange-100 text-orange-600',
  'Web import':     'bg-orange-50 text-orange-600',
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function WeekSuggestModal({ household, onClose, onLoadPlan, planExtrasText }) {
  const [numWeeks, setNumWeeks] = useState(1);
  const [loading, setLoading]   = useState(false);
  const [plan, setPlan]         = useState(null);
  const [notes, setNotes]       = useState('');
  const [error, setError]       = useState('');
  const [selected, setSelected] = useState({});   // { "1-Monday": true }
  const [servings, setServings] = useState({});   // { "1-Monday": 4 }  overrides per day
  const [dayNotes, setDayNotes] = useState({});   // { "1-Monday": "skip lunch" }
  const [showNotes, setShowNotes] = useState(false);
  const [expandedDay, setExpandedDay] = useState(null); // key of day with controls open

  async function generate() {
    setLoading(true);
    setError('');
    setPlan(null);
    setSelected({});
    setServings({});
    setDayNotes({});
    setExpandedDay(null);
    try {
      const sessionResult = await supabase.auth.getSession();
      const token = sessionResult?.data?.session?.access_token;
      if (!token) throw new Error('Not signed in — please refresh and try again.');
      const res = await fetch('/api/ai/suggest-week', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ weeks: numWeeks, plan_extras_text: planExtrasText || '', day_notes: dayNotes }),
      });
      const raw = await res.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(`Server error ${res.status}: ${raw.slice(0, 300) || '(empty response)'}`);
      }
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
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

  function toggleDay(key) {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
    // Close expanded controls if deselecting
    if (selected[key]) setExpandedDay(null);
  }

  function setDayServings(key, val) {
    const n = Math.min(Math.max(parseInt(val) || 2, 1), 12);
    setServings((prev) => ({ ...prev, [key]: n }));
  }

  function handleLoadPlan() {
    if (!plan) return;
    const recipes = [];
    plan.forEach((week) => {
      week.days.forEach((day) => {
        const key = `${week.week}-${day.day}`;
        if (selected[key] && day.recipe) {
          const override = servings[key];
          const base = override ? { ...day.recipe, servings: override } : day.recipe;
          recipes.push({ ...base, _plannedDay: day.day, _plannedWeek: week.week });
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
            <Sparkles size={17} className="text-orange-600" />
            {/* TODO: replace "AI week planner" with app name */}
            <h2 className="font-display text-base font-bold text-orange-900">Week planner</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-orange-400 hover:bg-orange-50 transition">
            <X size={16} />
          </button>
        </div>

        {/* Controls */}
        <div className="px-5 pt-4 pb-3 flex items-center gap-3">
          <span className="text-sm font-medium text-orange-900">Plan:</span>
          {[1, 2].map((w) => (
            <button key={w} onClick={() => setNumWeeks(w)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition border-2 ${
                numWeeks === w ? 'bg-orange-500 text-white border-orange-500' : 'border-orange-200 text-orange-900 hover:border-orange-400'
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
              <p className="text-sm text-orange-600">Planning your week…</p>
              <p className="text-xs text-orange-400">Checking preferences and starred recipes</p>
            </div>
          )}

          {!loading && !plan && !error && (
            <div className="text-center py-10">
              <Sparkles size={40} className="mx-auto mb-3 text-orange-400" />
              <p className="text-sm text-orange-600 font-medium">AI plans a varied week for you</p>
              <p className="text-xs text-orange-400 mt-1 leading-relaxed">Based on your preferences and starred recipes — no pasta two days in a row.</p>
            </div>
          )}

          {plan && !loading && plan.map((week) => (
            <div key={week.week} className="mb-4">
              {plan.length > 1 && (
                <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide mb-2">Week {week.week}</p>
              )}
              <div className="space-y-2">
                {week.days.map((day) => {
                  const key = `${week.week}-${day.day}`;
                  const isSelected = !!selected[key];
                  const recipe = day.recipe;
                  const isAI = recipe?._aiSuggestion;
                  const isStarred = recipe?._fromStarred;
                  const dayServings = servings[key] || recipe?.servings || 2;
                  const isExpanded = expandedDay === key;

                  return (
                    <div key={day.day} className={`rounded-2xl border-2 transition-all ${
                      isSelected ? 'border-orange-400 bg-orange-50' : 'border-orange-100 bg-white opacity-60'
                    }`}>
                      {/* Main row */}
                      <div className="flex items-start gap-2 px-3 py-3">
                        <button
                          onClick={() => toggleDay(key)}
                          className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 transition-all ${
                            isSelected ? 'bg-orange-500 border-orange-500' : 'border-orange-300'
                          }`}
                        >
                          {isSelected && <Check size={11} className="text-white" />}
                        </button>

                        <div className="flex-1 min-w-0" onClick={() => toggleDay(key)}>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-orange-600 uppercase">{day.day.slice(0, 3)}</span>
                            {isStarred && <span className="text-xs bg-amber-100 text-orange-600 px-1.5 py-0.5 rounded-full font-semibold">⭐ Starred</span>}
                            {isAI && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-semibold">✨ New</span>}
                            {recipe?.source && !isAI && (
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${SOURCE_COLORS[recipe.source] || 'bg-orange-50 text-orange-600'}`}>
                                {recipe.source}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-orange-900 mt-0.5 leading-snug">{recipe?.name || day.name}</p>
                          {(recipe?.overview || day.overview) && (
                            <p className="text-xs text-orange-600 mt-0.5 line-clamp-1">{recipe?.overview || day.overview}</p>
                          )}
                        </div>

                        {/* Per-day options toggle — only when selected */}
                        {isSelected && (
                          <button
                            onClick={() => setExpandedDay(isExpanded ? null : key)}
                            className="flex-shrink-0 flex items-center gap-1 text-orange-400 hover:text-orange-600 transition ml-1 mt-0.5"
                            title="Day options"
                          >
                            <Users size={14} />
                            {servings[key] && servings[key] !== (recipe?.servings || 2) && (
                              <span className="text-xs font-semibold text-orange-600">{servings[key]}</span>
                            )}
                          </button>
                        )}
                      </div>

                      {/* Expanded day options */}
                      {isSelected && isExpanded && (
                        <div className="border-t border-orange-100 px-3 py-2.5 space-y-2 bg-white rounded-b-2xl">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 flex-1">
                              <Users size={13} className="text-orange-400 flex-shrink-0" />
                              <span className="text-xs text-orange-900">Portions</span>
                              <div className="flex items-center gap-1.5 ml-auto">
                                <button
                                  onClick={() => setDayServings(key, dayServings - 1)}
                                  className="w-6 h-6 rounded-full border border-orange-200 flex items-center justify-center text-orange-600 hover:bg-orange-50 transition text-sm font-bold"
                                >−</button>
                                <span className="text-sm font-semibold text-orange-900 w-4 text-center">{dayServings}</span>
                                <button
                                  onClick={() => setDayServings(key, dayServings + 1)}
                                  className="w-6 h-6 rounded-full border border-orange-200 flex items-center justify-center text-orange-600 hover:bg-orange-50 transition text-sm font-bold"
                                >+</button>
                              </div>
                            </div>
                            <div className="w-px h-4 bg-orange-100" />
                            <button
                              onClick={() => { toggleDay(key); setExpandedDay(null); }}
                              className="flex items-center gap-1 text-xs text-orange-400 hover:text-red-500 transition"
                            >
                              <MinusCircle size={13} />
                              Skip day
                            </button>
                          </div>
                          <div className="pt-1 border-t border-orange-50">
                            <input
                              type="text"
                              placeholder="Any notes for this day? (e.g. include lunch, skip breakfast, leftovers ok)"
                              value={dayNotes[key] || ''}
                              onChange={(e) => setDayNotes((p) => ({ ...p, [key]: e.target.value }))}
                              className="w-full text-xs border border-orange-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-300 placeholder-orange-300"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* AI notes */}
          {notes && plan && !loading && (
            <div className="mt-2">
              <button onClick={() => setShowNotes((v) => !v)}
                className="flex items-center gap-1 text-xs text-orange-600 font-medium hover:text-orange-900 transition">
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
              Add {selectedCount} meal{selectedCount !== 1 ? 's' : ''} to my plan
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
