import React, { useState, useEffect } from 'react';
import { X, Sparkles, Check, ChevronDown, ChevronUp, Users, MinusCircle, Plus, Wand2, Tag, Lock } from 'lucide-react';
import { apiFetch } from '../lib/api';


// Single expandable meal row inside a day card
function MealPanel({ mealType, name, time, photo, overview, reason, leftoverFor, sideDish, isExpanded, onToggle, isIncluded = true, onToggleInclude }) {
  const label = mealType === 'dinner' ? 'Dinner'
    : mealType === 'breakfast' ? 'Breakfast'
    : mealType === 'lunch' ? 'Lunch'
    : 'Snack';
  const isDinner = mealType === 'dinner';

  return (
    <div className={`border-b border-orange-50 last:border-b-0 ${!isIncluded ? 'opacity-40' : ''}`}>
      <div className="flex items-center gap-1 px-4 py-2.5">
        <button
          onClick={onToggle}
          className="flex items-center gap-2 flex-1 text-left hover:bg-orange-50/30 transition rounded min-w-0"
        >
          <span className={`text-[10px] font-bold uppercase tracking-wider w-14 flex-shrink-0 ${
            isDinner ? 'text-orange-500' : 'text-orange-400'
          }`}>
            {label}
          </span>
          {photo?.thumbnail && !isDinner && (
            <img src={photo.thumbnail} alt={name} className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold truncate ${isIncluded ? 'text-orange-900' : 'text-orange-400 line-through'}`}>{name}</p>
            {time > 0 && <p className="text-[10px] text-orange-400">{time} min</p>}
          </div>
          {isIncluded && (isExpanded
            ? <ChevronUp size={14} className="text-orange-400 flex-shrink-0" />
            : <ChevronDown size={14} className="text-orange-400 flex-shrink-0" />)}
        </button>
        {onToggleInclude && (
          <button
            onClick={onToggleInclude}
            className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition"
            title={isIncluded ? 'Remove this meal' : 'Add back'}
          >
            {isIncluded
              ? <MinusCircle size={14} className="text-orange-200 hover:text-red-400 transition" />
              : <Plus size={14} className="text-orange-400 hover:text-orange-600 transition" />}
          </button>
        )}
      </div>

      {isIncluded && isExpanded && (
        <div className="px-4 pb-3 space-y-2 border-t border-orange-50">
          {overview && (
            <p className="text-xs text-orange-700 leading-relaxed pt-2">{overview}</p>
          )}
          {reason && (
            <p className="font-display italic text-orange-600 text-xs leading-snug bg-orange-50/60 rounded-xl px-3 py-2">— {reason}</p>
          )}
          {leftoverFor && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] bg-amber-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">
                → {leftoverFor}
              </span>
            </div>
          )}
          {sideDish?.name && (
            <div className="flex items-start gap-2 bg-orange-50/60 rounded-xl px-3 py-2">
              <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider w-10 flex-shrink-0 mt-0.5">Side</span>
              <div>
                <p className="text-xs font-semibold text-orange-900">{sideDish.name}</p>
                {sideDish.description && (
                  <p className="text-[10px] text-orange-500 leading-snug">{sideDish.description}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function WeekSuggestModal({ household, onClose, onLoadPlan, planExtrasText, preferences, language = 'English', weeklyUsage = null, initialDayNotes = {} }) {
  const hasDealsAccess = !!(weeklyUsage?.unlimited || preferences?.is_gifted || preferences?.gemini_api_key_hint);
  const hhKey = household?.id ? `mp:hh:${household.id}` : null;
  const [numWeeks, setNumWeeks]         = useState(() => {
    try { return Number(localStorage.getItem(`${hhKey}:numWeeks`)) || 1; } catch { return 1; }
  });
  const [loading, setLoading]           = useState(false);
  const [plan, setPlan]                 = useState(null);
  const [notes, setNotes]               = useState('');
  const [error, setError]               = useState('');
  const [errorStatus, setErrorStatus]   = useState(null);
  const [selected, setSelected]         = useState({});   // { "1-Monday": true }
  const [servings, setServings]         = useState({});   // { "1-Monday": 4 }
  const [dayNotes, setDayNotes]         = useState(() => initialDayNotes || {});
  const [swapInput, setSwapInput]       = useState({});
  const [swappingKey, setSwappingKey]   = useState(null);
  const [thisWeekWishes, setThisWeekWishes] = useState(() => {
    // Pre-populate with any per-day hints set on the main week view
    const hints = Object.entries(initialDayNotes || {})
      .filter(([, v]) => v && v.trim())
      .map(([day, note]) => `${day}: ${note.trim()}`)
      .join('\n');
    return hints || '';
  });
  const [weeklyBudget, setWeeklyBudget]   = useState(() => {
    try { return localStorage.getItem(`${hhKey}:weeklyBudget`) || ''; } catch { return ''; }
  });
  const [simpleNight, setSimpleNight]     = useState(false); // include one easy night
  const [deals, setDeals]               = useState([]);    // fetched supermarket deals
  const [dealsLoading, setDealsLoading] = useState(false);
  const [dealsError, setDealsError]     = useState('');
  const [showNotes, setShowNotes]       = useState(false);
  // expandedMeals: { [weekNum-dayName]: { dinner: bool, "breakfast-0": bool, ... } }
  const [expandedMeals, setExpandedMeals] = useState({});
  const [excludedMeals, setExcludedMeals] = useState(new Set()); // keys: "weekNum-dayName-dinner" or "weekNum-dayName-extra-N"
  const [sideDishPanel, setSideDishPanel] = useState(null); // { key, weekNum, dayName, recipe, loading, suggestions, error, input }
  const [addingExtra, setAddingExtra]     = useState(null); // "weekNum-dayName-mealType"
  const [easterEggIdx, setEasterEggIdx] = useState(0);

  const EASTER_EGGS = [
    "Consulting the pasta oracle…",
    "Arguing with the fridge about leftovers…",
    "Digging through the recipe box for something new…",
    "Googling 'what even is a balanced meal'…",
    "Convincing Monday it doesn't have to be sad…",
    "Teaching Tuesday to cook without burning things…",
    "Checking if anyone actually eats Wednesday…",
    "Negotiating with the spice rack…",
    "Pretending vegetables are fun…",
    "Avoiding yet another pasta on Thursday…",
    "Making sure Friday feels special…",
    "Sneaking a treat into the weekend…",
    "Asking the pantry what it really wants…",
    "Making sure no one gets pasta three days running…",
    "Checking the fridge knows what's coming…",
  ];

  useEffect(() => { try { if (hhKey) localStorage.setItem(`${hhKey}:numWeeks`, numWeeks); } catch {} }, [numWeeks, hhKey]);
  useEffect(() => { try { if (hhKey) localStorage.setItem(`${hhKey}:weeklyBudget`, weeklyBudget); } catch {} }, [weeklyBudget, hhKey]);

  useEffect(() => {
    if (!loading) return;
    setEasterEggIdx(Math.floor(Math.random() * EASTER_EGGS.length));
    const id = setInterval(() => {
      setEasterEggIdx((i) => (i + 1) % EASTER_EGGS.length);
    }, 2200);
    return () => clearInterval(id);
  }, [loading]);

  function toggleMealPanel(dayKey, panelId) {
    setExpandedMeals((prev) => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        [panelId]: !(prev[dayKey]?.[panelId]),
      },
    }));
  }

  async function generate() {
    setLoading(true);
    setError('');
    setErrorStatus(null);
    setPlan(null);
    setSelected({});
    setServings({});
    setDayNotes({});
    setExpandedMeals({});
    setExcludedMeals(new Set());
    setSideDishPanel(null);
    try {
      const data = await apiFetch('/api/ai/suggest-week', {
        method: 'POST',
        body: {
          weeks: numWeeks,
          plan_extras_text: planExtrasText || '',
          day_notes: dayNotes,
          this_week_wishes: thisWeekWishes || '',
          weekly_budget: weeklyBudget ? Number(weeklyBudget) : null,
          simple_night: simpleNight,
          deals: deals,
          language,
        },
      });
      setPlan(data.weeks);
      setNotes(data.notes || '');
      const sel = {};
      const defExpanded = {};
      data.weeks.forEach((week) => {
        week.days.forEach((day) => {
          if (day.recipe) {
            sel[`${week.week}-${day.day}`] = true;
            // Open dinner panel by default so the chosen dish is immediately visible
            defExpanded[`${week.week}-${day.day}`] = { dinner: true };
          }
        });
      });
      setSelected(sel);
      setExpandedMeals(defExpanded);
    } catch (err) {
      setError(err.message || 'Something went wrong');
      setErrorStatus(err.status || null);
    } finally {
      setLoading(false);
    }
  }

  async function fetchDeals() {
    setDealsLoading(true);
    setDealsError('');
    try {
      const data = await apiFetch('/api/ai/search-deals', { method: 'POST', body: {} });
      setDeals(data.deals || []);
      if (!data.deals?.length) setDealsError('No deals found for this week.');
    } catch (err) {
      setDealsError(err.message || 'Could not fetch deals');
    } finally {
      setDealsLoading(false);
    }
  }

  function toggleDay(key) {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
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
        .filter((d) => d.day !== dayObj.day)
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
      setPlan((prev) => prev.map((w) => {
        if (w.week !== weekNum) return w;
        return {
          ...w,
          days: w.days.map((d) => d.day !== dayObj.day ? d : {
            ...d,
            recipe:       updated.recipe,
            name:         updated.recipe?.name,
            overview:     updated.recipe?.overview,
            reason:       updated.reason,
            leftover_for: updated.leftover_for,
            uses_pantry:  updated.uses_pantry,
            photo:        updated.photo,
          }),
        };
      }));
      setSwapInput((p) => ({ ...p, [key]: '' }));
    } catch (err) {
      setError(err.message || 'Could not swap recipe');
    } finally {
      setSwappingKey(null);
    }
  }

  async function fetchSideDish(key, weekNum, dayName, recipe, preference) {
    setSideDishPanel({ key, weekNum, dayName, recipe, input: preference, loading: true, suggestions: [], error: '' });
    try {
      const data = await apiFetch('/api/ai/suggest-side', {
        method: 'POST',
        body: {
          recipe: { name: recipe.name, cuisine_type: recipe.cuisineType, ingredients: recipe.ingredients },
          preference,
        },
      });
      setSideDishPanel((p) => p?.key === key ? { ...p, loading: false, suggestions: data.suggestions || [] } : p);
    } catch (err) {
      setSideDishPanel((p) => p?.key === key ? { ...p, loading: false, error: err.message } : p);
    }
  }

  function applySideDish(weekNum, dayName, sideDish) {
    setPlan((prev) => prev.map((w) => {
      if (w.week !== weekNum) return w;
      return {
        ...w,
        days: w.days.map((d) => {
          if (d.day !== dayName) return d;
          const recipe = { ...d.recipe };
          if (sideDish) recipe._sideDish = sideDish;
          else delete recipe._sideDish;
          return { ...d, recipe };
        }),
      };
    }));
    setSideDishPanel(null);
  }

  async function addExtraMeal(weekNum, dayObj, mealType) {
    const key = `${weekNum}-${dayObj.day}-${mealType}`;
    setAddingExtra(key);
    try {
      const otherDays = plan
        .flatMap((w) => w.days)
        .map((d) => d.recipe?.name)
        .filter(Boolean);
      const data = await apiFetch('/api/ai/regenerate-day', {
        method: 'POST',
        body: {
          day_name: dayObj.day,
          current_recipe_name: '',
          change_request: `A simple ${mealType} for ${dayObj.day}`,
          other_days_names: otherDays,
          meal_type: mealType,
        },
      });
      if (data?.recipe) {
        setPlan((prev) => prev.map((w) => {
          if (w.week !== weekNum) return w;
          return {
            ...w,
            days: w.days.map((d) => {
              if (d.day !== dayObj.day) return d;
              const extras = [...(d.extras || []), { ...data.recipe, _mealType: mealType, _extraReason: data.reason || null, photo: data.photo || null }];
              return { ...d, extras };
            }),
          };
        }));
      }
    } catch {
      // fail silently
    } finally {
      setAddingExtra(null);
    }
  }

  function removeExtra(weekNum, dayName, mealType) {
    setPlan((prev) => prev.map((w) => {
      if (w.week !== weekNum) return w;
      return {
        ...w,
        days: w.days.map((d) => {
          if (d.day !== dayName) return d;
          // Remove the last extra with this mealType
          const extras = [...(d.extras || [])];
          const idx = extras.map((e) => e._mealType).lastIndexOf(mealType);
          if (idx !== -1) extras.splice(idx, 1);
          return { ...d, extras };
        }),
      };
    }));
  }

  function handleLoadPlan() {
    if (!plan) return;
    const recipes = [];
    plan.forEach((week) => {
      week.days.forEach((day) => {
        const key = `${week.week}-${day.day}`;
        if (!selected[key]) return;
        if (day.recipe && !excludedMeals.has(`${key}-dinner`)) {
          const override = servings[key];
          const base = override ? { ...day.recipe, servings: override } : day.recipe;
          recipes.push({
            ...base,
            _plannedDay:        day.day,
            _plannedWeek:       week.week,
            _plannerReason:     day.reason || null,
            _plannerLeftoverFor: day.leftover_for || null,
            _plannerUsesPantry: Array.isArray(day.uses_pantry) ? day.uses_pantry : [],
            _plannerPhoto:      day.photo || null,
          });
        }
        (day.extras || []).forEach((extra, i) => {
          if (!excludedMeals.has(`${key}-extra-${i}`)) {
            recipes.push({
              ...extra,
              _plannedDay:        day.day,
              _plannedWeek:       week.week,
              _plannerReason:     extra._extraReason || null,
              _plannerPhoto:      extra.photo || null,
              _plannerUsesPantry: [],
            });
          }
        });
      });
    });
    onLoadPlan(recipes);
    onClose();
  }

  function toggleMealExclusion(mealKey) {
    setExcludedMeals((prev) => {
      const next = new Set(prev);
      if (next.has(mealKey)) next.delete(mealKey);
      else next.add(mealKey);
      return next;
    });
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const selectedMealCount = plan
    ? plan.reduce((acc, week) => week.days.reduce((a, day) => {
        const key = `${week.week}-${day.day}`;
        if (!selected[key]) return a;
        const dinnerCount = day.recipe && !excludedMeals.has(`${key}-dinner`) ? 1 : 0;
        const extrasCount = (day.extras || []).filter((_, i) => !excludedMeals.has(`${key}-extra-${i}`)).length;
        return a + dinnerCount + extrasCount;
      }, acc), 0)
    : selectedCount;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="w-full max-w-lg mx-auto flex flex-col h-full">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-orange-50">
          <div className="flex items-center gap-2">
            <Sparkles size={17} className="text-orange-600" />
            <h2 className="font-display text-base font-bold text-orange-900">Week planner</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-orange-400 hover:bg-orange-50 transition">
            <X size={16} />
          </button>
        </div>

        {/* Controls */}
        <div className="px-5 pt-4 pb-3 space-y-3">
          {preferences?.meal_prep_mode && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              <span className="text-xs font-semibold text-orange-700">Meal prep mode on</span>
              {preferences.meal_prep_set_by_name && (
                <span className="text-xs text-orange-400">— enabled by {preferences.meal_prep_set_by_name}</span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-orange-900">Plan:</span>
            {[1, 2].map((w) => (
              <button key={w} onClick={() => setNumWeeks(w)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition border-2 ${
                  numWeeks === w ? 'bg-orange-500 text-white border-orange-500' : 'border-orange-200 text-orange-900 hover:border-orange-400'
                }`}>
                {w} week{w > 1 ? 's' : ''}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              {weeklyUsage && !weeklyUsage.unlimited && (
                <span className={`text-xs ${weeklyUsage.used >= weeklyUsage.limit ? 'text-red-500 font-medium' : 'text-orange-400'}`}>
                  {weeklyUsage.limit - weeklyUsage.used} left this week
                </span>
              )}
              <button onClick={generate} disabled={loading}
                className="px-3 py-1.5 bg-orange-500 text-white rounded-full text-xs font-semibold hover:bg-orange-600 transition disabled:opacity-50 flex items-center gap-1.5">
                <Sparkles size={12} />
                {loading ? 'Planning…' : plan ? 'Regenerate' : 'Generate'}
              </button>
            </div>
          </div>
          <textarea
            rows={2}
            placeholder='Anything specific this week? e.g. "Monday: vegetarian, Friday: fish, weekdays under 35 min"…'
            value={thisWeekWishes}
            onChange={(e) => setThisWeekWishes(e.target.value)}
            className="w-full text-xs border border-orange-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-300 placeholder-orange-300 resize-none leading-relaxed"
          />
          {/* Budget + simple night + deals row */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-orange-600">€</span>
              <input
                type="number"
                min="0"
                placeholder="Budget/week"
                value={weeklyBudget}
                onChange={(e) => setWeeklyBudget(e.target.value)}
                className="w-28 text-xs border border-orange-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-300 placeholder-orange-300"
              />
            </div>
            <button
              type="button"
              onClick={() => setSimpleNight((v) => !v)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition ${
                simpleNight
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'border-orange-200 text-orange-600 hover:border-orange-400'
              }`}
            >
              {simpleNight ? '✓ ' : ''}Easy night
            </button>
            <button
              type="button"
              onClick={hasDealsAccess ? fetchDeals : undefined}
              disabled={dealsLoading || !hasDealsAccess}
              title={!hasDealsAccess ? 'Requires your own Gemini API key — add one in Settings' : undefined}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition ${
                !hasDealsAccess
                  ? 'border-orange-100 text-orange-300 cursor-not-allowed'
                  : deals.length
                    ? 'bg-green-50 border-green-300 text-green-700 hover:border-green-400'
                    : 'border-orange-200 text-orange-600 hover:border-orange-400 disabled:opacity-50'
              }`}
            >
              <Tag size={12} />
              {dealsLoading ? 'Finding deals…' : deals.length ? 'Refresh deals' : 'This week\'s deals'}
            </button>
            {dealsError && <span className="text-[11px] text-red-400">{dealsError}</span>}
          </div>

          {deals.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {deals.map((deal, i) => (
                <span key={i} className="flex items-center gap-1 text-[11px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                  {deal.item}{deal.price ? ` · ${deal.price}` : ''}
                  <button
                    type="button"
                    onClick={() => setDeals((prev) => prev.filter((_, j) => j !== i))}
                    className="text-green-400 hover:text-green-700 transition ml-0.5 flex-shrink-0"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Content area — scrolls vertically so cards expand to their full height */}
        <div className="flex-1 overflow-y-auto">
          {error && errorStatus === 429 ? (
            <div className="px-5 pt-4">
              <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
                <p className="text-sm font-semibold text-orange-900 mb-1">Kitchen limit reached</p>
                <p className="text-xs text-orange-700 leading-relaxed mb-3">
                  Your kitchen has used its {weeklyUsage?.limit ?? 'weekly'} AI suggestions for this week.
                  {weeklyUsage?.limit != null && ` Suggestions reset every week — invite someone to cook with you to grow your shared budget (5 per member).`}
                </p>
                <div className="flex flex-col gap-2">
                  <div className="bg-white rounded-xl border border-orange-200 px-3 py-2.5">
                    <p className="text-[11px] font-semibold text-orange-900 uppercase tracking-wide mb-1.5">Premium — coming soon</p>
                    <p className="text-xs text-orange-700 leading-relaxed">
                      €4.99/month per person · contributes 50/week to your shared kitchen · unlimited search · macro tracking · exports & insights
                    </p>
                  </div>
                  <p className="text-[11px] text-orange-500 text-center">
                    In the meantime, connect Puter or add your Gemini key in Settings for unlimited AI.
                  </p>
                </div>
              </div>
            </div>
          ) : error ? (
            <div className="px-5 pt-2">
              <div className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</div>
            </div>
          ) : null}

          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
              <p className="text-sm text-orange-600">Planning your week…</p>
              <p className="text-xs text-orange-400 italic transition-all duration-500">{EASTER_EGGS[easterEggIdx]}</p>
            </div>
          )}

          {!loading && !plan && !error && (
            <div className="flex flex-col items-center justify-center px-5 text-center py-20">
              <Sparkles size={40} className="mx-auto mb-3 text-orange-400" />
              <p className="text-sm text-orange-600 font-medium">AI plans a varied week for you</p>
              <p className="text-xs text-orange-400 mt-1 leading-relaxed">Use the box above for any rules — per-day too, e.g. "Monday: vegetarian, Friday: fish".</p>
            </div>
          )}

          {plan && !loading && (
            <div>
          {plan.map((week) => (
            <div key={week.week} className="mb-4">
              {plan.length > 1 && (
                <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide mb-2 px-5">Week {week.week}</p>
              )}

              {/* Stacked day cards */}
              <div className="space-y-3 px-5 pb-3">
                {week.days.map((day) => {
                  const key = `${week.week}-${day.day}`;
                  const isSelected = !!selected[key];
                  const recipe = day.recipe;
                  const isAI = recipe?._aiSuggestion;
                  const isStarred = recipe?._fromStarred;
                  const dayServings = servings[key] || recipe?.servings || 2;
                  const dinnerTime = (recipe?.prepTime || day.prep_time || 0) + (recipe?.cookTime || day.cook_time || 0);

                  // Free-evening / skipped day
                  if (day.skip || !recipe) {
                    return (
                      <div
                        key={day.day}
                        id={`plan-day-${week.week}-${day.day}`}
                        className="rounded-2xl border-2 border-dashed border-orange-100 bg-orange-50/40 overflow-hidden"
                      >
                        <div className="flex items-center gap-1.5 px-4 pt-4">
                          <span className="text-[10px] font-bold uppercase bg-orange-100 text-orange-400 px-2 py-0.5 rounded-full tracking-wider">{day.day}</span>
                        </div>
                        <div className="px-4 pt-3 pb-4">
                          <p className="font-display text-base font-semibold text-orange-400 italic">Free evening</p>
                          {day.reason && <p className="text-xs text-orange-400 mt-1 leading-snug">{day.reason}</p>}
                        </div>
                      </div>
                    );
                  }

                  const dayExpanded = expandedMeals[key] || {};
                  const extras = day.extras || [];
                  const breakfastExtras = extras.filter((e) => e._mealType === 'breakfast');
                  const lunchExtras    = extras.filter((e) => e._mealType === 'lunch');
                  const otherExtras    = extras.filter((e) => !['breakfast', 'lunch'].includes(e._mealType));

                  return (
                    <div
                      key={day.day}
                      id={`plan-day-${week.week}-${day.day}`}
                      className={`rounded-2xl border-2 overflow-hidden bg-white transition ${
                        isSelected ? 'border-orange-400' : 'border-orange-100 opacity-75'
                      }`}
                    >
                      {/* Hero photo — fixed, not scrolled */}
                      {day.photo?.url ? (
                        <div className="relative h-36 w-full bg-orange-100 flex-shrink-0">
                          <img
                            src={day.photo.url}
                            alt={day.photo.alt || recipe?.name}
                            loading="lazy"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          <div className="absolute top-2 left-2 flex gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold uppercase bg-white/90 text-orange-600 px-2 py-0.5 rounded-full tracking-wider">{day.day}</span>
                            {extras.length > 0 && (
                              <span className="text-[10px] bg-white/90 text-orange-500 px-2 py-0.5 rounded-full font-semibold">
                                +{extras.length} extra meal{extras.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          {day.photo.photographer && (
                            <a
                              href={day.photo.photographer_url || 'https://www.pexels.com'}
                              target="_blank" rel="noopener noreferrer"
                              className="absolute bottom-1.5 right-1.5 text-[9px] bg-black/40 text-white px-1.5 py-0.5 rounded-full hover:bg-black/60 transition"
                            >
                              {day.photo.photographer}
                            </a>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-4 pt-4 pb-1 flex-shrink-0">
                          <span className="text-[10px] font-bold uppercase bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full tracking-wider">{day.day}</span>
                          {extras.length > 0 && (
                            <span className="text-[10px] bg-orange-100 text-orange-500 px-2 py-0.5 rounded-full font-semibold">
                              +{extras.length} extra meal{extras.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      )}

                      <div>

                        {/* Selection toggle + source badges */}
                        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
                          <button
                            onClick={() => toggleDay(key)}
                            className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${
                              isSelected ? 'bg-orange-500 border-orange-500' : 'border-orange-300'
                            }`}
                            title={isSelected ? 'Remove day' : 'Include day'}
                          >
                            {isSelected && <Check size={13} className="text-white" />}
                          </button>
                          <div className="flex items-center gap-1.5 flex-wrap flex-1">
                            {isStarred && <span className="text-[10px] bg-amber-100 text-orange-700 px-1.5 py-0.5 rounded-full font-semibold">Starred</span>}
                            {isAI && !isStarred && <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-semibold">AI</span>}
                            {day.estimated_cost && <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded-full font-semibold border border-green-100">{day.estimated_cost}</span>}
                          </div>
                          {swappingKey === key && (
                            <span className="text-[10px] text-orange-500 animate-pulse">Swapping…</span>
                          )}
                        </div>

                        {/* Stacked expandable meal panels */}
                        <div className="border-t border-orange-50">
                          {/* Breakfast extras */}
                          {breakfastExtras.map((extra, i) => {
                            const origIdx = extras.indexOf(extra);
                            const mealKey = `${key}-extra-${origIdx}`;
                            return (
                              <MealPanel
                                key={`bf-${i}`}
                                mealType="breakfast"
                                name={extra.name}
                                time={(extra.prepTime || 0) + (extra.cookTime || 0)}
                                photo={extra.photo}
                                overview={extra.overview}
                                reason={extra._extraReason}
                                isExpanded={!!dayExpanded[`breakfast-${i}`]}
                                onToggle={() => toggleMealPanel(key, `breakfast-${i}`)}
                                isIncluded={!excludedMeals.has(mealKey)}
                                onToggleInclude={() => toggleMealExclusion(mealKey)}
                              />
                            );
                          })}
                          {/* Lunch extras */}
                          {lunchExtras.map((extra, i) => {
                            const origIdx = extras.indexOf(extra);
                            const mealKey = `${key}-extra-${origIdx}`;
                            return (
                              <MealPanel
                                key={`lu-${i}`}
                                mealType="lunch"
                                name={extra.name}
                                time={(extra.prepTime || 0) + (extra.cookTime || 0)}
                                photo={extra.photo}
                                overview={extra.overview}
                                reason={extra._extraReason}
                                isExpanded={!!dayExpanded[`lunch-${i}`]}
                                onToggle={() => toggleMealPanel(key, `lunch-${i}`)}
                                isIncluded={!excludedMeals.has(mealKey)}
                                onToggleInclude={() => toggleMealExclusion(mealKey)}
                              />
                            );
                          })}
                          {/* Other extras (snacks etc.) */}
                          {otherExtras.map((extra, i) => {
                            const origIdx = extras.indexOf(extra);
                            const mealKey = `${key}-extra-${origIdx}`;
                            return (
                              <MealPanel
                                key={`ot-${i}`}
                                mealType={extra._mealType || 'snack'}
                                name={extra.name}
                                time={(extra.prepTime || 0) + (extra.cookTime || 0)}
                                photo={extra.photo}
                                overview={extra.overview}
                                reason={extra._extraReason}
                                isExpanded={!!dayExpanded[`other-${i}`]}
                                onToggle={() => toggleMealPanel(key, `other-${i}`)}
                                isIncluded={!excludedMeals.has(mealKey)}
                                onToggleInclude={() => toggleMealExclusion(mealKey)}
                              />
                            );
                          })}
                          {/* Dinner — always present */}
                          <MealPanel
                            mealType="dinner"
                            name={recipe?.name || day.name}
                            time={dinnerTime}
                            overview={recipe?.overview || day.overview}
                            reason={day.reason}
                            leftoverFor={day.leftover_for}
                            sideDish={recipe?._sideDish}
                            isExpanded={!!dayExpanded.dinner}
                            onToggle={() => toggleMealPanel(key, 'dinner')}
                            isIncluded={!excludedMeals.has(`${key}-dinner`)}
                            onToggleInclude={() => toggleMealExclusion(`${key}-dinner`)}
                          />
                        </div>

                        {/* Options bar + side dish panel — only when day is selected */}
                        {isSelected && (
                          <>
                          <div className="px-4 py-3 border-t border-orange-50 space-y-2">
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
                              >
                                <Wand2 size={13} />
                                Different dish
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
                                className="flex-shrink-0 px-3 py-1.5 bg-orange-500 text-white rounded-xl text-xs font-semibold hover:bg-orange-600 transition disabled:opacity-50 flex items-center gap-1"
                              >
                                <Wand2 size={11} />
                                {swappingKey === key ? '…' : 'Swap'}
                              </button>
                            </div>
                            {/* Add extras row: breakfast · lunch · side */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {/* Breakfast */}
                              {breakfastExtras.length > 0 ? (
                                <>
                                  <span className="text-xs bg-orange-50 text-orange-600 border border-orange-200 rounded-full px-2.5 py-1 font-medium">
                                    Breakfast: {breakfastExtras[0].name}
                                  </span>
                                  <button
                                    onClick={() => removeExtra(week.week, day.day, 'breakfast')}
                                    className="text-orange-400 hover:text-orange-600 transition text-xs -ml-1"
                                    title="Remove breakfast"
                                  >×</button>
                                </>
                              ) : (
                                <button
                                  onClick={() => addExtraMeal(week.week, day, 'breakfast')}
                                  disabled={addingExtra === `${key}-breakfast`}
                                  className="text-xs text-orange-400 hover:text-orange-600 transition border border-dashed border-orange-200 rounded-full px-3 py-1 hover:border-orange-400 disabled:opacity-50"
                                >
                                  {addingExtra === `${key}-breakfast` ? '…' : '+ Breakfast'}
                                </button>
                              )}
                              {/* Lunch */}
                              {lunchExtras.length > 0 ? (
                                <>
                                  <span className="text-xs bg-orange-50 text-orange-600 border border-orange-200 rounded-full px-2.5 py-1 font-medium">
                                    Lunch: {lunchExtras[0].name}
                                  </span>
                                  <button
                                    onClick={() => removeExtra(week.week, day.day, 'lunch')}
                                    className="text-orange-400 hover:text-orange-600 transition text-xs -ml-1"
                                    title="Remove lunch"
                                  >×</button>
                                </>
                              ) : (
                                <button
                                  onClick={() => addExtraMeal(week.week, day, 'lunch')}
                                  disabled={addingExtra === `${key}-lunch`}
                                  className="text-xs text-orange-400 hover:text-orange-600 transition border border-dashed border-orange-200 rounded-full px-3 py-1 hover:border-orange-400 disabled:opacity-50"
                                >
                                  {addingExtra === `${key}-lunch` ? '…' : '+ Lunch'}
                                </button>
                              )}
                              {/* Side dish */}
                              {recipe?._sideDish ? (
                                <>
                                  <span className="text-xs bg-orange-50 text-orange-600 border border-orange-200 rounded-full px-2.5 py-1 font-medium">
                                    + {recipe._sideDish.name}
                                  </span>
                                  <button
                                    onClick={() => applySideDish(week.week, day.day, null)}
                                    className="text-orange-400 hover:text-orange-600 transition text-xs -ml-1"
                                    title="Remove side dish"
                                  >×</button>
                                </>
                              ) : (
                                <button
                                  onClick={() => {
                                    if (sideDishPanel?.key === key) { setSideDishPanel(null); return; }
                                    fetchSideDish(key, week.week, day.day, recipe, '');
                                  }}
                                  className="text-xs text-orange-400 hover:text-orange-600 transition border border-dashed border-orange-200 rounded-full px-3 py-1 hover:border-orange-400"
                                >
                                  + Add a side
                                </button>
                              )}
                            </div>
                          </div>
                          {/* Side dish suggestions panel */}
                          {sideDishPanel?.key === key && (
                            <div className="px-4 pb-3 border-t border-orange-50 pt-3 space-y-2">
                              {sideDishPanel.loading && (
                                <div className="flex items-center gap-2 py-1">
                                  <div className="w-4 h-4 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                                  <p className="text-xs text-orange-400">Looking for a good side…</p>
                                </div>
                              )}
                              {!sideDishPanel.loading && sideDishPanel.suggestions.length > 0 && (() => {
                                const isUnlimited = !!(weeklyUsage?.unlimited);
                                const visible = isUnlimited ? sideDishPanel.suggestions : sideDishPanel.suggestions.slice(0, 1);
                                const locked = isUnlimited ? 0 : sideDishPanel.suggestions.length - 1;
                                return (
                                  <div className="space-y-1.5">
                                    {visible.map((s) => (
                                      <button
                                        key={s.name}
                                        onClick={() => applySideDish(week.week, day.day, s)}
                                        className="w-full text-left px-3 py-2 rounded-xl border border-orange-100 hover:border-orange-300 hover:bg-orange-50/50 transition"
                                      >
                                        <p className="text-xs font-semibold text-orange-900">{s.name}</p>
                                        {s.description && <p className="text-[10px] text-orange-500 mt-0.5 leading-snug">{s.description}</p>}
                                      </button>
                                    ))}
                                    {locked > 0 && (
                                      <button className="w-full text-left px-3 py-1.5 rounded-xl border border-dashed border-orange-100 text-orange-300 flex items-center gap-1.5 text-xs cursor-not-allowed">
                                        <Lock size={11} className="flex-shrink-0" />
                                        {locked} more option{locked !== 1 ? 's' : ''} — upgrade for all suggestions
                                      </button>
                                    )}
                                  </div>
                                );
                              })()}
                              {sideDishPanel.error && <p className="text-xs text-red-500">{sideDishPanel.error}</p>}
                              {!sideDishPanel.loading && (
                                <div className="flex gap-1.5">
                                  <input
                                    type="text"
                                    placeholder="Something light, or herby…"
                                    value={sideDishPanel.input}
                                    onChange={(e) => setSideDishPanel((p) => ({ ...p, input: e.target.value }))}
                                    onKeyDown={(e) => e.key === 'Enter' && fetchSideDish(key, week.week, day.day, recipe, sideDishPanel.input)}
                                    autoFocus={sideDishPanel.suggestions.length === 0}
                                    className="flex-1 text-xs border border-orange-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-300 placeholder-orange-300 min-w-0"
                                  />
                                  <button
                                    onClick={() => fetchSideDish(key, week.week, day.day, recipe, sideDishPanel.input)}
                                    className="flex-shrink-0 px-3 py-1.5 bg-orange-500 text-white rounded-xl text-xs font-semibold hover:bg-orange-600 transition flex items-center gap-1"
                                  >
                                    <Sparkles size={11} />
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* AI planner notes */}
          {notes && (
            <div className="px-5 py-2">
              <button
                onClick={() => setShowNotes((v) => !v)}
                className="flex items-center gap-1 text-xs text-orange-600 font-medium hover:text-orange-900 transition"
              >
                {showNotes ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                Planner notes
              </button>
              {showNotes && (
                <p className="text-xs text-orange-600 bg-orange-50 rounded-xl px-3 py-2 mt-1 leading-relaxed">{notes}</p>
              )}
            </div>
          )}
            </div>
          )}
        </div>

        {/* Footer */}
        {plan && !loading && (
          <div className="px-5 py-4 border-t border-orange-50">
            <button
              onClick={handleLoadPlan}
              disabled={selectedCount === 0}
              className="w-full py-3 bg-orange-500 text-white rounded-full font-semibold text-sm hover:bg-orange-600 transition disabled:opacity-50"
            >
              Add {selectedMealCount} meal{selectedMealCount !== 1 ? 's' : ''} to my plan
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
