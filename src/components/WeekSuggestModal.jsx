import React, { useState } from 'react';
import { X, Sparkles, Check, ChevronDown, ChevronUp, Users, MinusCircle, Wand2 } from 'lucide-react';
import { apiFetch } from '../lib/api';

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
  const [swapInput, setSwapInput] = useState({}); // { "1-Monday": "too heavy" }
  const [swappingKey, setSwappingKey] = useState(null);
  const [thisWeekWishes, setThisWeekWishes] = useState('');
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
      const data = await apiFetch('/api/ai/suggest-week', {
        method: 'POST',
        body: {
          weeks: numWeeks,
          plan_extras_text: planExtrasText || '',
          day_notes: dayNotes,
          this_week_wishes: thisWeekWishes || '',
        },
      });
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

  async function swapDay(weekNum, dayObj, overrideRequest) {
    const key = `${weekNum}-${dayObj.day}`;
    const request = overrideRequest || (swapInput[key] || '').trim();
    if (!request || swappingKey) return;
    setSwappingKey(key);
    try {
      const otherDays = plan
        .flatMap((w) => w.days)
        .filter((d) => !(d.day === dayObj.day))
        .map((d) => d.recipe?.name)
        .filter(Boolean);
      const updated = await apiFetch('/api/ai/regenerate-day', {
        method: 'POST',
        body: {
          day_name: dayObj.day,
          current_recipe_name: dayObj.recipe?.name || dayObj.name || '',
          change_request: request,
          other_days_names: otherDays,
        },
      });
      // Replace the day in the plan state, keep selected/servings/notes.
      setPlan((prev) => prev.map((w) => {
        if (w.week !== weekNum) return w;
        return {
          ...w,
          days: w.days.map((d) => (d.day === dayObj.day ? {
            ...d,
            recipe: updated.recipe,
            name: updated.recipe?.name,
            overview: updated.recipe?.overview,
            reason: updated.reason,
            leftover_for: updated.leftover_for,
            uses_pantry: updated.uses_pantry,
            photo: updated.photo,
          } : d)),
        };
      }));
      setSwapInput((p) => ({ ...p, [key]: '' }));
    } catch (err) {
      setError(err.message || 'Could not swap recipe');
    } finally {
      setSwappingKey(null);
    }
  }

  function handleLoadPlan() {
    if (!plan) return;
    const recipes = [];
    plan.forEach((week) => {
      week.days.forEach((day) => {
        const key = `${week.week}-${day.day}`;
        if (!selected[key]) return;
        if (day.recipe) {
          const override = servings[key];
          const base = override ? { ...day.recipe, servings: override } : day.recipe;
          recipes.push({
            ...base,
            _plannedDay: day.day,
            _plannedWeek: week.week,
            _plannerReason: day.reason || null,
            _plannerLeftoverFor: day.leftover_for || null,
            _plannerUsesPantry: Array.isArray(day.uses_pantry) ? day.uses_pantry : [],
            _plannerPhoto: day.photo || null,
          });
        }
        // Include extras (breakfast/lunch) for selected days
        (day.extras || []).forEach((extra) => {
          recipes.push({
            ...extra,
            _plannedDay: day.day,
            _plannedWeek: week.week,
            _plannerReason: extra._extraReason || null,
            _plannerPhoto: extra.photo || null,
            _plannerUsesPantry: [],
          });
        });
      });
    });
    onLoadPlan(recipes);
    onClose();
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const selectedMealCount = plan
    ? plan.reduce((acc, week) => week.days.reduce((a, day) => {
        const key = `${week.week}-${day.day}`;
        if (!selected[key]) return a;
        return a + (day.recipe ? 1 : 0) + (day.extras?.length || 0);
      }, acc), 0)
    : selectedCount;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="w-full max-w-lg mx-auto flex flex-col h-full">

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
        <div className="px-5 pt-4 pb-3 space-y-3">
          <div className="flex items-center gap-3">
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
          <textarea
            rows={2}
            placeholder='Anything on your mind for this week — the AI reads this first…'
            value={thisWeekWishes}
            onChange={(e) => setThisWeekWishes(e.target.value)}
            className="w-full text-xs border border-orange-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-300 placeholder-orange-300 resize-none leading-relaxed"
          />
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 pb-6 safe-area-bottom">
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
            <div key={week.week} className="mb-4 -mx-5">
              {plan.length > 1 && (
                <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide mb-2 px-5">Week {week.week}</p>
              )}

              {/* Day chip nav — tap to jump, shows include/exclude state at a glance */}
              <div className="flex gap-1.5 px-5 mb-3 overflow-x-auto scrollbar-hide">
                {week.days.map((day) => {
                  const key = `${week.week}-${day.day}`;
                  const isSelected = !!selected[key];
                  return (
                    <button
                      key={day.day}
                      onClick={() => {
                        const el = document.getElementById(`plan-day-${week.week}-${day.day}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                      }}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition ${
                        isSelected ? 'bg-orange-500 text-white' : 'bg-orange-100 text-orange-400'
                      }`}
                    >
                      {day.day.slice(0, 3)}
                    </button>
                  );
                })}
              </div>

              {/* Horizontal carousel — one day per swipe */}
              <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory px-5 scroll-px-5 pb-3 scrollbar-hide">
                {week.days.map((day) => {
                  const key = `${week.week}-${day.day}`;
                  const isSelected = !!selected[key];
                  const recipe = day.recipe;
                  const isAI = recipe?._aiSuggestion;
                  const isStarred = recipe?._fromStarred;
                  const dayServings = servings[key] || recipe?.servings || 2;
                  const totalTime = (recipe?.prepTime || day.prep_time || 0) + (recipe?.cookTime || day.cook_time || 0);

                  // Skipped days — render a simple "free evening" placeholder.
                  if (day.skip || !recipe) {
                    return (
                      <div
                        key={day.day}
                        id={`plan-day-${week.week}-${day.day}`}
                        className="flex-shrink-0 w-full snap-start rounded-2xl border-2 border-dashed border-orange-100 bg-orange-50/40 overflow-hidden"
                      >
                        <div className="flex items-center gap-1.5 px-4 pt-4">
                          <span className="text-[10px] font-bold uppercase bg-orange-100 text-orange-400 px-2 py-0.5 rounded-full tracking-wider">{day.day}</span>
                        </div>
                        <div className="px-4 pt-3 pb-4">
                          <p className="font-display text-base font-semibold text-orange-400 italic">Free evening</p>
                          {day.reason && (
                            <p className="text-xs text-orange-400 mt-1 leading-snug">{day.reason}</p>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={day.day}
                      id={`plan-day-${week.week}-${day.day}`}
                      className={`flex-shrink-0 w-full snap-start rounded-2xl border-2 overflow-hidden bg-white transition ${
                        isSelected ? 'border-orange-400' : 'border-orange-100 opacity-75'
                      }`}
                    >
                      {/* Hero photo (Pexels) */}
                      {day.photo?.url ? (
                        <div className="relative h-40 w-full bg-orange-100">
                          <img
                            src={day.photo.url}
                            alt={day.photo.alt || recipe?.name || day.name}
                            loading="lazy"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          <div className="absolute top-2 left-2 flex gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold uppercase bg-white/90 text-orange-600 px-2 py-0.5 rounded-full tracking-wider">{day.day}</span>
                            {totalTime > 0 && (
                              <span className="text-[10px] font-semibold bg-black/40 text-white px-2 py-0.5 rounded-full">⏱ {totalTime} min</span>
                            )}
                          </div>
                          {day.photo.photographer && (
                            <a
                              href={day.photo.photographer_url || 'https://www.pexels.com'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="absolute bottom-1.5 right-1.5 text-[9px] bg-black/40 text-white px-1.5 py-0.5 rounded-full hover:bg-black/60 transition"
                            >
                              📷 {day.photo.photographer}
                            </a>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-4 pt-4">
                          <span className="text-[10px] font-bold uppercase bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full tracking-wider">{day.day}</span>
                          {totalTime > 0 && (
                            <span className="text-[10px] font-semibold bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full">⏱ {totalTime} min</span>
                          )}
                        </div>
                      )}

                      {/* Body */}
                      <div className="px-4 pt-3 pb-4 space-y-3">
                        {/* Title row with selection toggle */}
                        <div className="flex items-start gap-2">
                          <button
                            onClick={() => toggleDay(key)}
                            className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center mt-0.5 transition ${
                              isSelected ? 'bg-orange-500 border-orange-500' : 'border-orange-300'
                            }`}
                            title={isSelected ? 'Remove day' : 'Include day'}
                          >
                            {isSelected && <Check size={13} className="text-white" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap mb-1">
                              {isStarred && <span className="text-[10px] bg-amber-100 text-orange-700 px-1.5 py-0.5 rounded-full font-semibold">Starred</span>}
                              {isAI && <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-semibold">AI</span>}
                              {recipe?.source && !isAI && !isStarred && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${SOURCE_COLORS[recipe.source] || 'bg-orange-50 text-orange-600'}`}>
                                  {recipe.source}
                                </span>
                              )}
                            </div>
                            <p className="font-display text-base font-bold text-orange-900 leading-snug">{recipe?.name || day.name}</p>
                          </div>
                        </div>

                        {(recipe?.overview || day.overview) && (
                          <p className="text-xs text-orange-700 leading-relaxed">{recipe?.overview || day.overview}</p>
                        )}

                        {day.reason && (
                          <p className="text-xs text-orange-500 italic leading-snug bg-orange-50/60 rounded-xl px-3 py-2">✨ {day.reason}</p>
                        )}

                        {((day.uses_pantry || []).length > 0 || day.leftover_for) && (
                          <div className="flex flex-wrap gap-1.5">
                            {day.leftover_for && (
                              <span className="text-[10px] bg-amber-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">
                                → {day.leftover_for}
                              </span>
                            )}
                            {(day.uses_pantry || []).map((item) => (
                              <span key={item} className="text-[10px] bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full border border-orange-100">
                                🥫 {item}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Extra meals (breakfast/lunch requested for this day) */}
                        {(day.extras || []).length > 0 && (
                          <div className="space-y-1.5 border-t border-orange-50 pt-2">
                            {day.extras.map((extra, i) => {
                              const xTime = (extra.prepTime || 0) + (extra.cookTime || 0);
                              return (
                                <div key={i} className="flex items-center gap-2 bg-orange-50/60 rounded-xl px-3 py-2">
                                  <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider w-14 flex-shrink-0">{extra._mealType || 'Extra'}</span>
                                  {extra.photo?.thumbnail && (
                                    <img src={extra.photo.thumbnail} alt={extra.name} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-orange-900 truncate">{extra.name}</p>
                                    {xTime > 0 && <p className="text-[10px] text-orange-400">{xTime} min</p>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Options — always visible now, not behind an expand */}
                        {isSelected && (
                          <div className="pt-2 border-t border-orange-50 space-y-2">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2 flex-1">
                                <Users size={13} className="text-orange-400 flex-shrink-0" />
                                <span className="text-xs text-orange-600">Portions</span>
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
                                onClick={() => swapDay(week.week, day, 'suggest something different')}
                                disabled={!!swappingKey}
                                className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-600 transition disabled:opacity-40"
                                title="Suggest a different recipe for this day"
                              >
                                <Wand2 size={13} />
                                Another
                              </button>
                              <div className="w-px h-4 bg-orange-100" />
                              <button
                                onClick={() => toggleDay(key)}
                                className="flex items-center gap-1 text-xs text-orange-400 hover:text-red-500 transition"
                              >
                                <MinusCircle size={13} />
                                Skip
                              </button>
                            </div>
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                placeholder='Describe what you want instead…'
                                value={swapInput[key] || ''}
                                onChange={(e) => setSwapInput((p) => ({ ...p, [key]: e.target.value }))}
                                onKeyDown={(e) => e.key === 'Enter' && swapDay(week.week, day)}
                                disabled={swappingKey === key}
                                className="flex-1 text-xs border border-orange-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-300 placeholder-orange-300 disabled:opacity-50 min-w-0"
                              />
                              <button
                                onClick={() => swapDay(week.week, day)}
                                disabled={!(swapInput[key] || '').trim() || swappingKey === key}
                                className="flex-shrink-0 px-3 py-1.5 bg-orange-600 text-white rounded-xl text-xs font-semibold hover:bg-orange-700 transition disabled:opacity-50 flex items-center gap-1"
                              >
                                <Wand2 size={11} />
                                {swappingKey === key ? '…' : 'Swap'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
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
              Add {selectedMealCount} meal{selectedMealCount !== 1 ? 's' : ''} to my plan
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
