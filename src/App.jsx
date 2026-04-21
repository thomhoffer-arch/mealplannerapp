import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search, ShoppingCart, ShoppingBag, Calendar, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Check, Plus, X, Trash2, LogOut, Link2, Users, User, Sparkles, Star, Package, PenLine, Bell, Settings, AlertTriangle, MinusCircle,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { apiFetch, setActiveHouseholdId, getActiveHouseholdId } from "./lib/api";
import AuthScreen from "./components/AuthScreen";
import OnboardingScreen from "./components/OnboardingScreen";
import PreferencesModal from "./components/PreferencesModal";
import WillingnessModal from "./components/WillingnessModal";
import InstallBanner from "./components/InstallBanner";
import CreateRecipeModal from "./components/CreateRecipeModal";
import StarredPanel from "./components/StarredPanel";
import HouseholdSwitcher from "./components/HouseholdSwitcher";
import SharedRecipeView from "./components/SharedRecipeView";
import AccountActions from "./components/AccountActions";
import { extractAvoids, checkRecipe, summarizeConflicts } from "./lib/dietary";
import WeekSuggestModal from "./components/WeekSuggestModal";
import SurpriseBagModal from "./components/SurpriseBagModal";
import PuterWelcomeModal from "./components/PuterWelcomeModal";
import GrocerHandoffModal from "./components/GrocerHandoffModal";
import UpdateToast from "./components/UpdateToast";
import ThemeToggle from "./components/ThemeToggle";
import { applyTheme } from "./lib/theme";
import { GlyphPot, GlyphSpyglass, GlyphLink, GlyphBasket, Scribble } from "./components/glyphs";

const SOURCE_COLORS = {
  "My Recipes":    "bg-orange-100 text-orange-600",
  "AI Suggestion": "bg-orange-100 text-orange-600",
  "Web import":    "bg-orange-50 text-orange-600",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function totalTime(r) { return (r.prepTime || 0) + (r.cookTime || 0); }

// Common food qualifiers that shouldn't affect ingredient matching.
const FOOD_QUALIFIERS = /\b(unsalted|salted|fresh|dried|ground|whole|organic|plain|low-fat|full-fat|semi-skimmed|skimmed|chopped|sliced|diced|frozen|canned|tinned|large|small|medium|extra|light|dark|sweet|raw|cooked|white|brown|black|red|green|yellow|virgin|pure|fine|coarse|baby|mini|regular|softened|melted|cold)\b/gi;

function pantryMatchesItem(pantryName, itemName) {
  const p = pantryName.toLowerCase().trim();
  const i = itemName.toLowerCase().trim();
  if (p === i) return true;

  // Whole-word match: "butter" matches "unsalted butter" but NOT "peanut butter"
  // (leftover "peanut" is not a qualifier). "pepper" must NOT match "chili pepper"
  // because "chili" is a type specifier, not a descriptor.
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`\\b${escaped}\\b`).test(i)) {
    const leftover = i.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '').replace(/\s+/g, ' ').trim();
    if (!leftover || !leftover.replace(FOOD_QUALIFIERS, '').replace(/\s+/g, ' ').trim()) return true;
  }

  // Core match: strip qualifiers from both sides and compare exactly.
  // Substring checks are intentionally removed — after stripping qualifiers any
  // remaining difference means a genuinely different ingredient type.
  const coreP = p.replace(FOOD_QUALIFIERS, '').replace(/\s+/g, ' ').trim();
  const coreI = i.replace(FOOD_QUALIFIERS, '').replace(/\s+/g, ' ').trim();
  if (coreP && coreI && coreP === coreI) return true;
  return false;
}

// Returns the ISO date string (YYYY-MM-DD) of the Monday of the given date's week.
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun … 6=Sat
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function addWeeks(weekStart, n) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(weekStart) {
  const start = new Date(weekStart);
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const opts = { month: 'short' };
  const sm = start.toLocaleDateString('en-GB', opts);
  const em = end.toLocaleDateString('en-GB', opts);
  const sd = start.getDate();
  const ed = end.getDate();
  return sm === em ? `${sd}–${ed} ${sm}` : `${sd} ${sm} – ${ed} ${em}`;
}

const ALLERGENS = [
  { name: 'Gluten',     color: 'bg-amber-100 text-amber-700',   patterns: ['flour','wheat','pasta','bread','breadcrumb','soy sauce','barley','rye','oat','spelt','semolina','noodle','couscous','bulgur','pita','tortilla'] },
  { name: 'Milk',       color: 'bg-blue-100 text-blue-700',     patterns: ['milk','cream','butter','cheese','yogurt','yoghurt','parmesan','mozzarella','ricotta','halloumi','pecorino','brie','cheddar','gouda','feta','mascarpone','crème fraîche','creme fraiche','ghee'] },
  { name: 'Eggs',       color: 'bg-yellow-100 text-yellow-700', patterns: ['egg'] },
  { name: 'Fish',       color: 'bg-cyan-100 text-cyan-700',     patterns: ['salmon','tuna','cod','bass','halibut','trout','flounder','anchovy','sardine','mackerel','herring','tilapia','snapper','fish sauce','fish stock','fish'] },
  { name: 'Shellfish',  color: 'bg-teal-100 text-teal-700',     patterns: ['shrimp','prawn','crab','lobster','scallop','clam','oyster','mussel','squid','octopus','crayfish'] },
  { name: 'Peanuts',    color: 'bg-orange-100 text-orange-700', patterns: ['peanut','groundnut','satay'] },
  { name: 'Tree nuts',  color: 'bg-orange-100 text-orange-700', patterns: ['almond','cashew','walnut','pecan','pistachio','macadamia','hazelnut','pine nut','brazil nut'] },
  { name: 'Soy',        color: 'bg-green-100 text-green-700',   patterns: ['soy','tofu','tempeh','edamame','miso','tamari'] },
  { name: 'Sesame',     color: 'bg-stone-100 text-stone-600',   patterns: ['sesame','tahini'] },
  { name: 'Mustard',    color: 'bg-yellow-100 text-yellow-700', patterns: ['mustard'] },
  { name: 'Celery',     color: 'bg-lime-100 text-lime-700',     patterns: ['celery','celeriac'] },
  { name: 'Sulphites',  color: 'bg-purple-100 text-purple-700', patterns: ['wine','vinegar','dried apricot','dried fruit','balsamic'] },
];
// Ingredients typically bought in larger units than a single recipe needs.
// When checked off the shopping list these are auto-added to the pantry.
const BULK_STAPLES = [
  'olive oil','oil','butter','coconut oil','sesame oil','vegetable oil','sunflower oil',
  'vinegar','balsamic','apple cider vinegar','white wine vinegar','red wine vinegar','rice vinegar',
  'soy sauce','fish sauce','worcestershire','hot sauce','ketchup','mustard','mayonnaise',
  'oyster sauce','hoisin','sriracha','tahini','miso','miso paste',
  'salt','pepper','paprika','cumin','coriander','turmeric','oregano','thyme','basil',
  'bay leaves','chili flakes','cayenne','cinnamon','nutmeg','cardamom','cloves','garam masala',
  'canned tomatoes','tomato paste','coconut milk','tomato puree',
  'pasta','rice','flour','sugar','honey','maple syrup',
  'parmesan','pecorino','stock','broth','bouillon',
  'dried herbs','dried spices',
];
function isBulkStaple(name) {
  const n = (name || '').toLowerCase().trim();
  return BULK_STAPLES.some((s) => n.includes(s));
}

function detectAllergens(ingredients = []) {
  const text = ingredients.map((i) => `${i.name || ''} ${i.amount || ''}`).join(' ').toLowerCase();
  return ALLERGENS.filter((a) => a.patterns.some((p) => text.includes(p)));
}

const PREP_WORDS = ['sliced','diced','chopped','minced','peeled','grated','shredded','torn','crushed','halved','quartered','julienned','roughly','finely','thinly','thickly','cut','trimmed','washed','rinsed','dried','softened','melted','beaten','whisked','to taste','at room temperature','room temperature'];
function normalizeIngredientName(name) {
  // Strip prep description after the first comma if it looks like a preparation instruction
  const commaIdx = name.indexOf(',');
  if (commaIdx > 0) {
    const afterComma = name.slice(commaIdx + 1).trim().toLowerCase();
    if (PREP_WORDS.some((p) => afterComma.startsWith(p))) {
      name = name.slice(0, commaIdx).trim();
    }
  }
  // Strip parenthetical prep notes like "(peeled and diced)"
  return name.replace(/\s*\([^)]*\)/g, '').trim();
}

const _FRACS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1/3, '⅔': 2/3, '⅛': 0.125 };
const _NUM_RE = /^([\d½¼¾⅓⅔⅛][^a-zA-Z]*?)\s*([a-zA-Z]+\.?)?$/;
function mergeAmounts(rawAmounts) {
  const amounts = rawAmounts.map((a) => (a || '').trim()).filter(Boolean);
  if (!amounts.length) return '';
  // Deduplicate identical strings (handles "to taste × N" → "to taste")
  const deduped = amounts.filter(
    (a, i) => amounts.findIndex((b) => b.toLowerCase() === a.toLowerCase()) === i
  );
  if (deduped.length === 1) return deduped[0];
  // Try to sum numeric amounts sharing a unit
  const byUnit = new Map();
  const misc = [];
  for (const a of deduped) {
    const m = a.trim().match(_NUM_RE);
    if (m) {
      const numStr = m[1].trim();
      const unit = (m[2] || '').toLowerCase().replace(/\.$/, '');
      let qty = 0;
      for (const part of numStr.replace(/,/g, '.').split(/\s+/)) {
        if (_FRACS[part]) { qty += _FRACS[part]; continue; }
        if (part.includes('/')) { const [n, d] = part.split('/').map(Number); if (d) qty += n / d; continue; }
        const n = parseFloat(part); if (!isNaN(n)) qty += n;
      }
      if (qty > 0) {
        const key = unit || '__bare__';
        byUnit.set(key, { total: (byUnit.get(key)?.total || 0) + qty, unit: m[2] || '' });
        continue;
      }
    }
    misc.push(a);
  }
  const numParts = [...byUnit.values()].map(({ total, unit }) => {
    const fmt = Number.isInteger(total) ? String(total) : parseFloat(total.toFixed(2)).toString().replace(/\.?0+$/, '');
    return unit ? `${fmt} ${unit}` : fmt;
  });
  return [...numParts, ...misc].join(' + ');
}

function consolidateIngredients(selectedRecipes, customIngredients) {
  const items = {};
  selectedRecipes.forEach((recipe) => {
    const rid = String(recipe.id);
    (recipe.ingredients || []).forEach(({ name: rawName, amount }) => {
      const name = normalizeIngredientName(rawName);
      const key = name.toLowerCase().trim();
      if (items[key]) items[key].amounts.push(amount);
      else items[key] = { name, amounts: [amount] };
    });
    (recipe._sideDish?.ingredients || []).forEach(({ name, amount }) => {
      const key = name.toLowerCase().trim();
      if (items[key]) items[key].amounts.push(amount || '');
      else items[key] = { name, amounts: [amount || ''], isSide: true };
    });
    (customIngredients[rid] || []).forEach(({ name, amount }) => {
      const key = name.toLowerCase().trim();
      if (items[key]) items[key].amounts.push(amount || "");
      else items[key] = { name, amounts: [amount || ""], isCustom: true };
    });
  });
  return Object.values(items).map((item) => ({
    name: item.name,
    amount: mergeAmounts(item.amounts),
    isCustom: item.isCustom || false,
  }));
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function WeeklyNutritionCard({ recipes }) {
  const totals = recipes.reduce(
    (acc, r) => {
      const s = r.servings || 1;
      acc.calories += (r.macros?.calories || 0) * s;
      acc.protein  += (r.macros?.protein  || 0) * s;
      acc.carbs    += (r.macros?.carbs    || 0) * s;
      acc.fat      += (r.macros?.fat      || 0) * s;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const hasData = totals.calories > 0 || totals.protein > 0;
  if (!hasData) return null;
  return (
    <div className="bg-white rounded-2xl border border-orange-100 p-4 mb-4">
      <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide mb-3">Weekly nutrition total</p>
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Calories", value: Math.round(totals.calories), unit: "" },
          { label: "Protein",  value: Math.round(totals.protein),  unit: "g" },
          { label: "Carbs",    value: Math.round(totals.carbs),    unit: "g" },
          { label: "Fat",      value: Math.round(totals.fat),      unit: "g" },
        ].map(({ label, value, unit }) => (
          <div key={label} className="bg-orange-50 rounded-[10px] p-2 text-center">
            <p className="text-sm font-bold text-orange-900">{value}{unit}</p>
            <p className="text-xs text-orange-600">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecipeCard({ recipe, isSelected, isStarred, onToggleSelect, onToggleStar }) {
  return (
    <div className={`rounded-2xl border-2 p-4 transition-all ${isSelected ? "border-orange-400 bg-orange-50" : "border-orange-100 bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SOURCE_COLORS[recipe.source] || "bg-orange-50 text-orange-600"}`}>
              {recipe.source}
            </span>
            <span className="text-xs text-orange-600">{totalTime(recipe)} min · {recipe.servings} servings</span>
          </div>
          <h3 className="font-semibold text-orange-900 text-base leading-snug">{recipe.name}</h3>
          <p className="text-sm text-orange-900 italic mt-0.5 leading-snug line-clamp-2">{recipe.overview}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {(recipe.keywords || []).slice(0, 5).map((kw) => (
              <span key={kw} className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">{kw}</span>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 flex-shrink-0">
          <button
            onClick={() => onToggleStar(recipe)}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
              isStarred ? "text-orange-600 bg-amber-50" : "text-orange-400 hover:text-orange-600"
            }`}
            aria-label={isStarred ? "Unstar recipe" : "Star recipe"}
          >
            <Star size={16} fill={isStarred ? "currentColor" : "none"} />
          </button>
          <button
            onClick={() => onToggleSelect(recipe)}
            className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
              isSelected ? "bg-orange-500 border-orange-500 text-white" : "border-orange-300 text-orange-400 hover:border-orange-500"
            }`}
            aria-label={isSelected ? "Remove from meal plan" : "Add to meal plan"}
          >
            {isSelected ? <Check size={18} /> : <Plus size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function SelectedRecipeCard({
  recipe, expanded, onToggleExpand, onToggleCooked, isCooked,
  customIngredients, onAddCustom, onRemoveCustom, onRemove,
  newIngredientInput, onInputChange, preferences, starredRecipes, onAcceptSubstitution,
  rating, onGenerateRecipe, onShareRecipe,
  inlineExpanded,
}) {
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareError, setShareError] = useState(null);
  const [showAllergens, setShowAllergens] = useState(false);
  const rid = String(recipe.id);
  const customs = customIngredients[rid] || [];
  const detectedAllergens = detectAllergens([...(recipe.ingredients || []), ...customs]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [adjustInput, setAdjustInput] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState(null);

  async function adjustRecipe() {
    const request = adjustInput.trim();
    if (!request) return;
    setAdjusting(true);
    setAdjustError(null);
    try {
      const data = await apiFetch('/api/ai/generate-recipe', {
        method: 'POST',
        body: { recipe, request },
      });
      onGenerateRecipe(rid, data);
      setAdjustInput('');
    } catch (err) {
      setAdjustError(err.message || 'Something went wrong. Try again.');
    } finally {
      setAdjusting(false);
    }
  }

  const isStub = recipe._aiSuggestion && (!recipe.ingredients || recipe.ingredients.length === 0);

  async function generateFullRecipe() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const data = await apiFetch('/api/ai/generate-recipe', {
        method: 'POST',
        body: { recipe },
      });
      onGenerateRecipe(rid, data);
    } catch (err) {
      setGenerateError(err.message || 'Something went wrong. Try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function fetchSuggestions() {
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    try {
      const data = await apiFetch('/api/ai/suggest', {
        method: 'POST',
        body: { recipe, preferences, starredRecipes },
      });
      setAiResult(data);
    } catch (err) {
      setAiError(err.message || 'Could not get suggestions. Try again.');
    } finally {
      setAiLoading(false);
    }
  }
  // When used inside the expanded week-view day row, the day header above already
  // shows the recipe name, source, and time — skip the card chrome entirely and
  // just render the actions inline (no nested border, no duplicate title).
  if (inlineExpanded) {
    return (
      <div className="px-4 pb-4 space-y-4">
        {/* Minimal action row: cooked toggle + allergens + share */}
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <button
            onClick={() => onToggleCooked(rid)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border-2 transition ${isCooked ? 'border-sage-400 bg-sage-100 text-sage-600' : 'border-orange-200 text-orange-400 hover:border-sage-300 hover:text-sage-600'}`}
          >
            <Check size={12} />
            {isCooked ? 'Cooked!' : 'Mark cooked'}
          </button>
          {rating && <p className="text-xs ml-1 text-orange-400">{'★'.repeat(rating)}</p>}
          {detectedAllergens.length > 0 && (
            <button
              onClick={() => setShowAllergens((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full border-2 border-amber-200 text-amber-600 hover:bg-amber-50 transition"
            >
              <AlertTriangle size={11} />
              Allergens
            </button>
          )}
          <button
            onClick={async () => {
              if (sharing) return;
              setSharing(true);
              try {
                const url = await onShareRecipe(recipe);
                await navigator.clipboard?.writeText(url);
                setShareCopied(true);
                setTimeout(() => setShareCopied(false), 2000);
              } catch (err) {
                setShareError(err.message || 'Could not create share link');
                setTimeout(() => setShareError(null), 4000);
              } finally {
                setSharing(false);
              }
            }}
            className="ml-auto flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-orange-400 hover:bg-orange-50 transition"
            title={shareError ? shareError : shareCopied ? 'Link copied!' : 'Share recipe'}
          >
            {shareError ? <X size={15} className="text-red-400" /> : shareCopied ? <Check size={15} className="text-orange-600" /> : <Link2 size={15} />}
          </button>
        </div>
        {showAllergens && detectedAllergens.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
            <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
              <AlertTriangle size={12} /> Possible allergens
            </p>
            <div className="flex flex-wrap gap-1.5">
              {detectedAllergens.map((a) => (
                <span key={a.name} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${a.color}`}>{a.name}</span>
              ))}
            </div>
            <p className="text-[10px] text-amber-500 mt-2">Based on ingredient names — always check labels for your specific dietary needs.</p>
          </div>
        )}
        {isStub || recipe._quickEntry ? (
          <div className="py-3 space-y-3">
            {isStub && (
              <p className="text-xs text-orange-400 text-center">Tap generate to get the full recipe — or adjust it first.</p>
            )}
            {/* Tweak before generating (or adjust a quick entry) */}
            <div className="flex gap-2">
              <input type="text"
                placeholder={isStub ? 'Adjust before generating… (faster, use chicken…)' : 'Change something… (shorter, add ingredients…)'}
                value={adjustInput} onChange={(e) => setAdjustInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (generating || adjusting ? null : adjustInput.trim() ? adjustRecipe() : generateFullRecipe())}
                className="flex-1 border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-400 placeholder-orange-300"
              />
              <button
                onClick={() => adjustInput.trim() ? adjustRecipe() : generateFullRecipe()}
                disabled={generating || adjusting}
                className="flex-shrink-0 px-4 py-2 bg-orange-500 text-white rounded-full text-sm font-medium hover:bg-orange-600 transition disabled:opacity-50 flex items-center gap-1.5">
                <Sparkles size={13} />
                {generating || adjusting ? 'Writing…' : adjustInput.trim() ? 'Apply' : 'Generate'}
              </button>
            </div>
            {(generateError || adjustError) && (
              <p className="text-xs text-red-500">{generateError || adjustError}</p>
            )}
          </div>
        ) : (
          <>
            {/* Macros */}
            {(recipe.macros?.calories || recipe.macros?.protein) && (
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Protein",  value: recipe.macros?.protein,  unit: "g" },
                  { label: "Carbs",    value: recipe.macros?.carbs,    unit: "g" },
                  { label: "Fat",      value: recipe.macros?.fat,      unit: "g" },
                  { label: "Cal",      value: recipe.macros?.calories, unit: "" },
                ].map(({ label, value, unit }) => (
                  <div key={label} className="bg-orange-50 rounded-[10px] p-2 text-center">
                    <p className="text-sm font-bold text-orange-900">{value || "—"}{unit}</p>
                    <p className="text-xs text-orange-400">{label}</p>
                  </div>
                ))}
              </div>
            )}
            {/* Steps */}
            {(recipe.steps || []).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide mb-2">Instructions</p>
                <ol className="space-y-2">
                  {recipe.steps.map((step, i) => (
                    <li key={i} className="flex gap-2 text-sm text-orange-900">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-orange-100 text-orange-900 text-xs flex items-center justify-center font-semibold">{i + 1}</span>
                      <span className="leading-snug">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {/* Side dish (if one has been attached to this dinner) */}
            {recipe._sideDish && (
              <div className="bg-orange-50/60 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide">Side dish</p>
                <p className="text-sm font-semibold text-orange-900">{recipe._sideDish.name}</p>
                {recipe._sideDish.description && (
                  <p className="text-xs text-orange-700 leading-snug">{recipe._sideDish.description}</p>
                )}
                {(recipe._sideDish.ingredients || []).length > 0 && (
                  <ul className="pt-1 space-y-0.5">
                    {recipe._sideDish.ingredients.map((ing, idx) => (
                      <li key={idx} className="text-xs text-orange-600">
                        {ing.amount ? `${ing.amount} ${ing.name}` : ing.name}
                      </li>
                    ))}
                  </ul>
                )}
                {(recipe._sideDish.steps || []).length > 0 && (
                  <ol className="pt-2 space-y-1.5 border-t border-orange-100 mt-1">
                    {recipe._sideDish.steps.map((step, idx) => (
                      <li key={idx} className="text-xs text-orange-700 flex gap-1.5">
                        <span className="flex-shrink-0 font-semibold text-orange-400 w-4">{idx + 1}.</span>
                        <span className="leading-snug">{step}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
            {/* Custom ingredients */}
            <div>
              <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide mb-2">Add Extra Ingredients</p>
              <div className="flex gap-2">
                <input type="text" placeholder="e.g. 100g breadcrumbs"
                  value={newIngredientInput[rid] || ""}
                  onChange={(e) => onInputChange(rid, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onAddCustom(rid)}
                  className="flex-1 border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-400"
                />
                <button onClick={() => onAddCustom(rid)}
                  className="px-4 py-2 bg-orange-500 text-white rounded-full hover:bg-orange-600 transition text-sm font-medium">Add</button>
              </div>
              {customs.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {customs.map((c) => (
                    <li key={c.id} className="flex items-center justify-between bg-amber-50 rounded-xl px-3 py-2">
                      <span className="text-sm text-orange-600">{c.amount ? `${c.amount} ${c.name}` : c.name}</span>
                      <button onClick={() => onRemoveCustom(rid, c.id)} className="text-orange-600 hover:text-red-500 transition ml-2"><X size={14} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/* Tweak */}
            <div>
              <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide mb-2">Tweak this recipe</p>
              <div className="flex gap-2">
                <input type="text" placeholder='e.g. use chicken breast, make it spicier…'
                  value={adjustInput} onChange={(e) => setAdjustInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && adjustRecipe()}
                  className="flex-1 border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-400 placeholder-orange-300"
                />
                <button onClick={adjustRecipe} disabled={adjusting || !adjustInput.trim()}
                  className="flex-shrink-0 px-4 py-2 bg-orange-500 text-white rounded-full text-sm font-medium hover:bg-orange-600 transition disabled:opacity-50 flex items-center gap-1.5">
                  <PenLine size={13} />
                  {adjusting ? 'Tweaking…' : 'Apply'}
                </button>
              </div>
              {adjustError && <p className="text-xs text-red-500 mt-2">{adjustError}</p>}
            </div>
          </>
        )}
        <button onClick={() => onRemove(recipe)}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-full border border-dashed border-orange-200 text-orange-400 hover:border-orange-400 hover:text-orange-600 transition text-sm">
          <Trash2 size={13} />
          Remove from plan
        </button>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border-2 transition-all ${isCooked ? "border-sage-200 bg-sage-100/40 opacity-80" : "border-orange-100 bg-white"}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => onToggleCooked(rid)}
            className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center mt-0.5 transition-all ${isCooked ? "bg-sage-500 border-sage-500 text-white" : "border-orange-300"}`}
          >
            {isCooked && <Check size={12} />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SOURCE_COLORS[recipe.source] || "bg-orange-50 text-orange-600"}`}>
                {recipe.source}
              </span>
              <span className="text-xs text-orange-600">{totalTime(recipe)} min · {recipe.servings} servings</span>
            </div>
            <h3 className={`font-semibold text-base leading-snug ${isCooked ? "line-through text-orange-400" : "text-orange-900"}`}>
              {recipe.name}
            </h3>
            {rating && (
              <p className="text-xs mt-0.5 text-orange-400">{'★'.repeat(rating)}</p>
            )}
          </div>
          <button
            onClick={async () => {
              if (sharing) return;
              setSharing(true);
              try {
                const url = await onShareRecipe(recipe);
                await navigator.clipboard?.writeText(url);
                setShareCopied(true);
                setTimeout(() => setShareCopied(false), 2000);
              } catch (err) {
                window.alert(err.message || 'Could not create share link');
              } finally {
                setSharing(false);
              }
            }}
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-orange-400 hover:bg-orange-50 transition"
            title={shareCopied ? 'Link copied!' : 'Share recipe'}
          >
            {shareCopied ? <Check size={16} className="text-orange-600" /> : <Link2 size={16} />}
          </button>
          <button
            onClick={() => onToggleExpand(rid)}
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-orange-400 hover:bg-orange-50 transition"
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
        <div className="flex flex-wrap gap-1 mt-3">
          {(recipe.ingredients || []).map((ing) => (
            <span key={ing.name} className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">{ing.name}</span>
          ))}
          {customs.map((c) => (
            <span key={c.id} className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">{c.name}</span>
          ))}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-orange-100 p-4 space-y-4">

          {/* Allergen panel */}
          {detectedAllergens.length > 0 && (
            <div>
              <button
                onClick={() => setShowAllergens((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-800 transition"
              >
                <AlertTriangle size={12} />
                {showAllergens ? 'Hide allergens' : 'Show possible allergens'}
              </button>
              {showAllergens && (
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {detectedAllergens.map((a) => (
                      <span key={a.name} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${a.color}`}>{a.name}</span>
                    ))}
                  </div>
                  <p className="text-[10px] text-amber-500">Based on ingredient names — always check labels for your specific needs.</p>
                </div>
              )}
            </div>
          )}

          {/* AI stub — offer to generate full recipe */}
          {isStub ? (
            <div className="text-center py-4">
              <p className="text-sm text-orange-900 mb-1 font-display italic">Full recipe not written yet.</p>
              <p className="text-xs text-orange-600 mb-4">The AI will write ingredients and steps now — takes about 10 seconds.</p>
              {generateError && <p className="text-xs text-red-500 mb-3">{generateError}</p>}
              <button
                onClick={generateFullRecipe}
                disabled={generating}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-full text-sm font-medium hover:bg-orange-600 transition disabled:opacity-50"
              >
                <Sparkles size={14} />
                {generating ? 'Writing recipe…' : 'Generate full recipe'}
              </button>
            </div>
          ) : (
            <>
          {/* Macros */}
          <div>
            <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide mb-2">Nutrition (per serving)</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Protein",   value: recipe.macros?.protein,   unit: "g" },
                { label: "Carbs",     value: recipe.macros?.carbs,     unit: "g" },
                { label: "Fat",       value: recipe.macros?.fat,       unit: "g" },
                { label: "Calories",  value: recipe.macros?.calories,  unit: "" },
              ].map(({ label, value, unit }) => (
                <div key={label} className="bg-orange-50 rounded-[10px] p-2 text-center">
                  <p className="text-sm font-bold text-orange-900">{value || "—"}{unit}</p>
                  <p className="text-xs text-orange-600">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Steps */}
          {(recipe.steps || []).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide mb-2">Instructions</p>
              <ol className="space-y-2">
                {recipe.steps.map((step, i) => (
                  <li key={i} className="flex gap-2 text-sm text-orange-900">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-orange-200 text-orange-900 text-xs flex items-center justify-center font-semibold">{i + 1}</span>
                    <span className="leading-snug">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Custom ingredients */}
          <div>
            <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide mb-2">Add Extra Ingredients</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. 100g breadcrumbs"
                value={newIngredientInput[rid] || ""}
                onChange={(e) => onInputChange(rid, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onAddCustom(rid)}
                className="flex-1 border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-400"
              />
              <button
                onClick={() => onAddCustom(rid)}
                className="px-4 py-2 bg-orange-500 text-white rounded-full hover:bg-orange-600 transition text-sm font-medium"
              >
                Add
              </button>
            </div>
            {customs.length > 0 && (
              <ul className="mt-2 space-y-1">
                {customs.map((c) => (
                  <li key={c.id} className="flex items-center justify-between bg-amber-50 rounded-xl px-3 py-2">
                    <span className="text-sm text-orange-600">{c.amount ? `${c.amount} ${c.name}` : c.name}</span>
                    <button
                      onClick={() => onRemoveCustom(rid, c.id)}
                      className="text-orange-600 hover:text-red-500 transition ml-2"
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* AI adaptation */}
          <div className="rounded-2xl border border-orange-100 bg-orange-50/60 p-4">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide">Adapt for your household</p>
              <button
                onClick={fetchSuggestions}
                disabled={aiLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-full text-xs font-medium hover:bg-orange-600 transition disabled:opacity-50"
              >
                <Sparkles size={12} />
                {aiLoading ? "Thinking…" : aiResult ? "Refresh" : "Suggest adaptations"}
              </button>
            </div>

            {aiError && <p className="text-xs text-red-500">{aiError}</p>}

            {aiResult && (
              <div className="space-y-2 mt-1">
                {aiResult.suitable && !aiResult.substitutions?.length ? (
                  <p className="text-xs text-orange-900 bg-white rounded-xl px-3 py-2 border border-orange-100">
                    This recipe already fits your household preferences.
                    {aiResult.tips && <span className="block mt-1 text-orange-600 italic">{aiResult.tips}</span>}
                  </p>
                ) : (
                  <>
                    {(aiResult.issues || []).length > 0 && (
                      <div className="text-xs text-orange-600 bg-orange-50 rounded-xl px-3 py-2 space-y-0.5 border border-orange-100">
                        {aiResult.issues.map((issue, i) => (
                          <p key={i}>⚠ {issue}</p>
                        ))}
                      </div>
                    )}
                    {(aiResult.substitutions || []).map((sub, i) => (
                      <div key={i} className="bg-white rounded-xl border border-orange-100 px-3 py-2.5">
                        <p className="text-xs text-orange-400 line-through">{sub.original}</p>
                        <p className="text-sm font-medium text-orange-900">{sub.replacement}</p>
                        <p className="text-xs text-orange-600 mt-0.5">{sub.reason}</p>
                        <button
                          onClick={() => onAcceptSubstitution(rid, sub)}
                          className="mt-1.5 text-xs text-orange-600 font-semibold hover:text-orange-900 transition"
                        >
                          + Add as note
                        </button>
                      </div>
                    ))}
                    {aiResult.tips && (
                      <p className="text-xs text-orange-600 italic px-1">{aiResult.tips}</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Tweak the recipe */}
          <div>
            <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide mb-2">Tweak this recipe</p>
            <p className="text-xs text-orange-600 mb-2">Ask for a small change — the rest of the recipe stays as-is.</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. use chicken breast, make it spicier, leave out the nuts…"
                value={adjustInput}
                onChange={(e) => setAdjustInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && adjustRecipe()}
                className="flex-1 border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-400 placeholder-orange-300"
              />
              <button
                onClick={adjustRecipe}
                disabled={adjusting || !adjustInput.trim()}
                className="flex-shrink-0 px-4 py-2 bg-orange-500 text-white rounded-full text-sm font-medium hover:bg-orange-600 transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <PenLine size={13} />
                {adjusting ? 'Tweaking…' : 'Apply'}
              </button>
            </div>
            {adjustError && <p className="text-xs text-red-500 mt-2">{adjustError}</p>}
          </div>
          </>
          )}

          <button
            onClick={() => onRemove(recipe)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full border-2 border-red-200 text-red-500 hover:bg-red-50 transition text-sm font-medium"
          >
            <Trash2 size={15} />
            Remove from meal plan
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // ── Auth / household state
  const [user, setUser] = useState(null);
  const [household, setHousehold] = useState(null);
  // All households this user belongs to. Each entry mirrors a row from
  // household_members joined onto households so we can switch without re-fetching.
  const [memberships, setMemberships] = useState([]);
  // The current user's row in household_members, with display_name / prefs /
  // onboarded_at. When onboarded_at is null we render OnboardingScreen
  // instead of the main app.
  const [memberProfile, setMemberProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [showInviteSharePanel, setShowInviteSharePanel] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showSurvey, setShowSurvey] = useState(false);
  const [showCreateRecipe, setShowCreateRecipe] = useState(false);
  const [showStarred, setShowStarred] = useState(false);
  const [showWeekSuggest, setShowWeekSuggest] = useState(false);
  const [showPuterWelcome, setShowPuterWelcome] = useState(false);
  const [showGrocerHandoff, setShowGrocerHandoff] = useState(false);
  const [showReminderBanner, setShowReminderBanner] = useState(false);
  const [notifications, setNotifications] = useState(() => {
    // Rehydrate unread notifications from localStorage so the Profile-tab
    // badge survives reloads. Keyed separately per household; the effect
    // below narrows to the active one on load.
    try {
      const raw = localStorage.getItem('mp:notifications');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState({});
  const [planExtrasText, setPlanExtrasText] = useState('');
  const [sideDishPanel, setSideDishPanel] = useState(null);
  const [clearWeekConfirm, setClearWeekConfirm] = useState(false);
  const [showEmptyGrid, setShowEmptyGrid] = useState(false);
  const [wasteInsights, setWasteInsights] = useState(null); // null | { loading, insights, error }
  const [showBagModal, setShowBagModal] = useState(false); // { key, mainRecipe, rid, input, loading, suggestions, error }

  // ── Search state
  const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const todayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];

  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('mp:activeTab') || "week");
  const [basketSection, setBasketSection] = useState("shopping");
  const [householdMembers, setHouseholdMembers] = useState([]);
  const [editingHouseholdName, setEditingHouseholdName] = useState(false);
  const [householdNameDraft, setHouseholdNameDraft] = useState('');
  const searchInputRef = useRef(null);
  const fetchedPhotoIds = useRef(new Set()); // prevents re-fetching on realtime updates
  const [searchQuery, setSearchQuery] = useState("");
  const [recipes, setRecipes] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimer = useRef(null);
  const [importUrl, setImportUrl] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");

  // ── Supabase-backed shared state
  const [mealPlanItems, setMealPlanItems] = useState([]);   // [{ id, recipe_id, recipe_data }]
  const [customIngredients, setCustomIngredients] = useState({});  // { recipe_id: [{id,name,amount}] }
  const [cookedRecipes, setCookedRecipes] = useState({});   // { recipe_id: true }
  const [checkedItems, setCheckedItems] = useState({});     // { item_name: true }
  const [starredItems, setStarredItems] = useState([]);     // [{ recipe_id, recipe_data, rotation_priority }]
  const [userRecipes, setUserRecipes] = useState([]);       // household-created recipes
  const [recipeRatings, setRecipeRatings] = useState({});  // { recipe_id: 1-5 }
  const [ratingPrompt, setRatingPrompt] = useState(null);  // recipe_id awaiting rating
  const [shareOffer, setShareOffer] = useState(null);       // { recipe, stars } after a 4-5★ cook
  const [pantryItems, setPantryItems] = useState([]);      // [{ id, name, amount }]
  const [pantryInput, setPantryInput] = useState("");
  const [pantryNudge, setPantryNudge] = useState(null);   // { original, amount, suggestions, loading }
  const [quickEntryDay, setQuickEntryDay] = useState(null);
  const [quickEntryValue, setQuickEntryValue] = useState('');
  const [searchTargetDay, setSearchTargetDay] = useState(null); // day name when search triggered from a day slot
  const [templates, setTemplates] = useState([]);          // [{ id, name, recipes }]
  const [templateName, setTemplateName] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [viewWeek, setViewWeek] = useState(() => getWeekStart(new Date()));

  // ── Local UI state
  const [expandedRecipes, setExpandedRecipes] = useState({});
  const [newIngredientInput, setNewIngredientInput] = useState({});
  const [generatingExtra, setGeneratingExtra] = useState(null); // "Monday-breakfast" while generating

  useEffect(() => { localStorage.setItem('mp:activeTab', activeTab); }, [activeTab]);

  // ── Auth setup ────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) applyTheme();
      else document.documentElement.classList.remove('dark');
      if (!session?.user) setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        applyTheme();
      } else {
        // Reset to light for the landing/auth pages on sign-out.
        document.documentElement.classList.remove('dark');
        setAuthLoading(false);
        setHousehold(null);
        setMemberships([]);
        setActiveHouseholdId(null);
        setMemberProfile(null);
        setMealPlanItems([]);
        setCustomIngredients({});
        setCookedRecipes({});
        setCheckedItems({});
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Load household when user is ready ────────────────────────────────────
  const loadingForUser = React.useRef(null);
  useEffect(() => {
    if (!user) {
      loadingForUser.current = null; // reset so the next sign-in always triggers loadHousehold
      return;
    }
    if (loadingForUser.current === user.id) return; // guard against duplicate onAuthStateChange fires
    loadingForUser.current = user.id;
    loadHousehold();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Already-signed-in user pastes an invite URL → apply the invite. The
  // [user] effect above only fires when user first signs in; once a
  // household is loaded a fresh visit to /?invite=TOKEN wouldn't otherwise
  // trigger anything. loadHousehold itself clears the URL after applying,
  // so this doesn't loop.
  useEffect(() => {
    if (!user || !household) return;
    const token = new URLSearchParams(window.location.search).get('invite');
    if (!token) return;
    loadingForUser.current = null; // allow loadHousehold to run again
    loadHousehold();
  }, [user, household?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the membership list fresh across devices — when a new row appears
  // (invite accepted elsewhere) or disappears (kicked / left), re-run
  // loadHousehold so the switcher and active household reflect reality.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`user-memberships-${user.id}`)
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'household_members', filter: `user_id=eq.${user.id}` },
          () => loadHousehold())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadHousehold() {
    setAuthLoading(true);
    const RLS_HINT =
      "If this is a 403, the RLS SELECT policies on household_members / households " +
      "are missing. Run supabase/migration_add_rls_select_policies.sql in the " +
      "Supabase SQL editor, then sign in again.";

    // Apply any pending invite BEFORE we look at memberships — fixes the
    // signup race where loadHousehold was otherwise beating
    // join_household_by_token to the membership check and auto-creating
    // a stray solo household. Also covers already-signed-in users who
    // paste an invite URL. Idempotent on the DB side (ON CONFLICT DO
    // NOTHING), so harmless if AuthScreen already ran it.
    const inviteToken = new URLSearchParams(window.location.search).get('invite');
    if (inviteToken) {
      const { error: joinErr } = await supabase.rpc('join_household_by_token', {
        p_token: inviteToken, p_user_id: user.id,
      });
      if (joinErr) {
        console.error('[auth] join_household_by_token failed:', joinErr.message);
      } else {
        window.history.replaceState({}, '', window.location.pathname);
      }
    }

    async function readMemberships() {
      const { data, error } = await supabase
        .from("household_members")
        .select("household_id, display_name, personal_prefs, onboarded_at, households(*)")
        .eq("user_id", user.id);
      return { rows: (data || []).filter((r) => r.households), error };
    }

    let { rows, error: memberErr } = await readMemberships();
    if (memberErr) {
      console.error("[auth] household_members read failed:", memberErr, "\n" + RLS_HINT);
      await supabase.auth.signOut();
      setAuthLoading(false);
      return;
    }

    // Self-heal: no memberships → create a personal household. The RPC is
    // idempotent (see supabase/migration_idempotent_create_household.sql), so
    // a concurrent retry won't create stray households.
    if (rows.length === 0) {
      const { error: rpcError } = await supabase.rpc("create_household_for_user", { uid: user.id });
      if (rpcError) {
        console.error("[auth] create_household_for_user failed:", rpcError);
        await supabase.auth.signOut();
        setAuthLoading(false);
        return;
      }
      ({ rows, error: memberErr } = await readMemberships());
      if (memberErr || rows.length === 0) {
        console.error("[auth] still no memberships after self-heal:", memberErr);
        await supabase.auth.signOut();
        setAuthLoading(false);
        return;
      }
    }

    // Deduplicate by household_id (defensive against historical duplicate-row bug).
    const seen = new Set();
    const uniqueRows = rows.filter((r) => {
      if (seen.has(r.household_id)) return false;
      seen.add(r.household_id);
      return true;
    });

    const persisted = getActiveHouseholdId();
    const active = uniqueRows.find((r) => r.household_id === persisted) || uniqueRows[0];

    setMemberships(uniqueRows);
    setActiveHouseholdId(active.household_id);
    setHousehold(active.households);
    setMemberProfile({
      display_name:   active.display_name,
      personal_prefs: active.personal_prefs,
      onboarded_at:   active.onboarded_at,
    });
    setAuthLoading(false);
  }

  async function shareRecipe(recipe) {
    const { shareUrl } = await apiFetch('/api/recipes', {
      method: 'POST',
      body: { action: 'share', recipe },
    });
    return shareUrl;
  }

  async function leaveHousehold() {
    if (!household) return;
    const ok = window.confirm(`Leave "${household.name}"? You'll lose access to its meal plan, starred recipes and preferences. If you're the only member left, the household will be deleted.`);
    if (!ok) return;
    try {
      await apiFetch('/api/household/save-key', { method: 'DELETE' });
      // Realtime subscription will fire loadHousehold, but kick it off
      // immediately so the UI updates without waiting for the round-trip.
      setActiveHouseholdId(null);
      loadHousehold();
    } catch (err) {
      window.alert(err.message || 'Could not leave household');
    }
  }

  async function removeMember(memberUserId, memberName) {
    const ok = window.confirm(`Remove ${memberName || 'this member'} from "${household.name}"?`);
    if (!ok) return;
    try {
      await apiFetch('/api/household/save-key', {
        method: 'DELETE',
        body: { member_user_id: memberUserId },
      });
      // Refresh the member list; realtime only watches the current user.
      const { data } = await supabase.from('household_members')
        .select('display_name, user_id, personal_prefs').eq('household_id', household.id);
      setHouseholdMembers(data || []);
    } catch (err) {
      window.alert(err.message || 'Could not remove member');
    }
  }

  // Switch the active household without a full reload. The useEffect on
  // [household] picks up the change and re-fetches all household-scoped data.
  function switchHousehold(id) {
    if (!id || id === household?.id) return;
    const target = memberships.find((m) => m.household_id === id);
    if (!target) return;
    setActiveHouseholdId(id);
    setHousehold(target.households);
    setMemberProfile({
      display_name:   target.display_name,
      personal_prefs: target.personal_prefs,
      onboarded_at:   target.onboarded_at,
    });
    // Reset household-scoped UI state so we don't briefly show the wrong data.
    setMealPlanItems([]);
    setCustomIngredients({});
    setCookedRecipes({});
    setCheckedItems({});
    setStarredItems([]);
  }

  // ── Load + subscribe when household is ready ──────────────────────────────
  useEffect(() => {
    if (!household) return;
    loadMealPlan();
    loadCustomIngredients();
    loadCookedRecipes();
    loadCheckedItems();
    loadPreferences();
    loadStarred();
    loadPantry();
    loadTemplates();
    loadUserRecipes();
    supabase.from('household_members').select('display_name, user_id, personal_prefs').eq('household_id', household.id)
      .then(({ data }) => setHouseholdMembers(data || []));

    const channel = supabase
      .channel(`hh-${household.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "meal_plan_items",    filter: `household_id=eq.${household.id}` }, loadMealPlan)
      .on("postgres_changes", { event: "*", schema: "public", table: "custom_ingredients", filter: `household_id=eq.${household.id}` }, loadCustomIngredients)
      .on("postgres_changes", { event: "*", schema: "public", table: "cooked_recipes",     filter: `household_id=eq.${household.id}` }, loadCookedRecipes)
      .on("postgres_changes", { event: "*", schema: "public", table: "shopping_checks",    filter: `household_id=eq.${household.id}` }, loadCheckedItems)
      .on("postgres_changes", { event: "*", schema: "public", table: "starred_recipes",    filter: `household_id=eq.${household.id}` }, loadStarred)
      .on("postgres_changes", { event: "*", schema: "public", table: "pantry_items",       filter: `household_id=eq.${household.id}` }, loadPantry)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_recipes",       filter: `household_id=eq.${household.id}` }, loadUserRecipes)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [household]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data loaders ──────────────────────────────────────────────────────────
  async function loadMealPlan() {
    const { data } = await supabase
      .from("meal_plan_items").select("*").eq("household_id", household.id).order("added_at");
    setMealPlanItems(data || []);
  }

  // Backfill Pexels photos for any plan item that doesn't have one yet.
  // Uses a ref to ensure each item is only fetched once per session even if
  // loadMealPlan is called multiple times via the realtime subscription.
  useEffect(() => {
    if (!household) return;
    mealPlanItems.forEach((item) => {
      const rd = item.recipe_data;
      if (!rd || rd._plannerPhoto || rd._notAtHome || rd._isLeftovers) return;
      const key = item.id || rd.id;
      if (!key || fetchedPhotoIds.current.has(String(key))) return;
      if (!rd.name) return;
      fetchedPhotoIds.current.add(String(key));
      apiFetch(`/api/photo?name=${encodeURIComponent(rd.name)}`)
        .then(({ photo }) => {
          if (!photo) return;
          const withPhoto = { ...rd, _plannerPhoto: photo };
          setMealPlanItems((prev) => prev.map((i) =>
            (i.id === item.id) ? { ...i, recipe_data: withPhoto } : i
          ));
          if (item.id && !String(item.id).startsWith('optimistic-')) {
            supabase.from('meal_plan_items').update({ recipe_data: withPhoto }).eq('id', item.id);
          }
        })
        .catch(() => {});
    });
  }, [mealPlanItems, household]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadCustomIngredients() {
    const { data } = await supabase
      .from("custom_ingredients").select("*").eq("household_id", household.id);
    const byRecipe = {};
    (data || []).forEach((i) => {
      if (!byRecipe[i.recipe_id]) byRecipe[i.recipe_id] = [];
      byRecipe[i.recipe_id].push({ id: i.id, name: i.name, amount: i.amount });
    });
    setCustomIngredients(byRecipe);
  }

  async function loadCookedRecipes() {
    const { data } = await supabase
      .from("cooked_recipes").select("recipe_id, rating").eq("household_id", household.id);
    const cooked = {}, ratings = {};
    (data || []).forEach((r) => {
      cooked[r.recipe_id] = true;
      if (r.rating) ratings[r.recipe_id] = r.rating;
    });
    setCookedRecipes(cooked);
    setRecipeRatings(ratings);
  }

  async function loadCheckedItems() {
    const { data } = await supabase
      .from("shopping_checks").select("item_name").eq("household_id", household.id);
    const map = {};
    (data || []).forEach((r) => { map[r.item_name] = true; });
    setCheckedItems(map);
  }

  async function loadPreferences() {
    const { data } = await supabase
      .from("household_preferences").select("*").eq("household_id", household.id).maybeSingle();
    setPreferences(data || {});
    setPlanExtrasText(data?.plan_extras_text || '');
  }

  // ── Post-signup Puter connect prompt ──────────────────────────────────────
  // Surfaces the welcome modal only if the user picked the pay-as-you-go plan
  // and the household doesn't already have a token saved.
  useEffect(() => {
    if (!household) return;
    let pending = false;
    try { pending = localStorage.getItem('mp-pending-puter-connect') === '1'; } catch {}
    if (!pending) return;
    if (preferences && preferences.puter_token_hint) {
      try { localStorage.removeItem('mp-pending-puter-connect'); } catch {}
      return;
    }
    setShowPuterWelcome(true);
  }, [household, preferences.puter_token_hint]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Survey trigger ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !household || preferences.survey_completed_at) return;
    const daysSinceSignup = (Date.now() - new Date(user.created_at)) / (1000 * 60 * 60 * 24);
    const isEngaged = mealPlanItems.length >= 1 || Object.keys(cookedRecipes).length >= 1;
    if (daysSinceSignup >= 3 && isEngaged) {
      const t = setTimeout(() => setShowSurvey(true), 4000);
      return () => clearTimeout(t);
    }
  }, [user, household, preferences.survey_completed_at, mealPlanItems.length, cookedRecipes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Planning reminder ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!preferences.reminder_enabled || !preferences.reminder_day) return;
    const todayName = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][new Date().getDay()];
    if (todayName !== preferences.reminder_day) return;
    // Only show once per day (use ISO date as key)
    const today = new Date().toISOString().slice(0, 10);
    const dismissKey = `reminder_dismissed_${today}`;
    if (localStorage.getItem(dismissKey)) return;
    // Check if plan was already updated this week
    const mostRecent = mealPlanItems[mealPlanItems.length - 1];
    const daysSinceLastPlan = mostRecent
      ? (Date.now() - new Date(mostRecent.added_at)) / (1000 * 60 * 60 * 24)
      : 999;
    if (daysSinceLastPlan >= 6) {
      setShowReminderBanner(true);
    }
  }, [preferences.reminder_enabled, preferences.reminder_day, mealPlanItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset empty-grid flag when navigating to a different week
  useEffect(() => { setShowEmptyGrid(false); }, [viewWeek]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Activity notifications ────────────────────────────────────────────────
  // Filter stored notifications to the active household when it changes.
  useEffect(() => {
    if (!household) return;
    setNotifications((prev) => prev.filter((n) => n.household_id === household.id));
  }, [household?.id]);

  // Persist unread notifications so the Profile-tab badge survives reloads.
  useEffect(() => {
    try { localStorage.setItem('mp:notifications', JSON.stringify(notifications)); } catch {}
  }, [notifications]);

  useEffect(() => {
    if (!household) return;
    if (preferences.notifications_enabled === false) return; // user opted out
    function addNotification(message) {
      setNotifications((prev) => [
        { id: Date.now(), message, timestamp: new Date(), read: false, household_id: household.id },
        ...prev,
      ].slice(0, 20));
    }
    const channel = supabase
      .channel(`notif-${household.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'meal_plan_items', filter: `household_id=eq.${household.id}` },
        (p) => addNotification(`${p.new?.recipe_data?.name || 'A recipe'} was added to the meal plan`))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'meal_plan_items', filter: `household_id=eq.${household.id}` },
        (p) => addNotification(`${p.old?.recipe_data?.name || 'A recipe'} was removed from the meal plan`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'starred_recipes', filter: `household_id=eq.${household.id}` },
        (p) => addNotification(`${p.new?.recipe_data?.name || 'A recipe'} was starred`))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [household?.id, preferences.notifications_enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const notifUnread = notifications.filter((n) => !n.read).length;

  function markAllNotifsRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }
  function dismissNotif(id) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }
  function formatNotifTime(date) {
    const mins = Math.round((Date.now() - date) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
  }

  async function loadStarred() {
    const { data } = await supabase
      .from("starred_recipes").select("recipe_id, recipe_data, rotation_priority").eq("household_id", household.id);
    setStarredItems(data || []);
  }

  async function loadUserRecipes() {
    const { data } = await supabase
      .from("user_recipes").select("*").eq("household_id", household.id).order("created_at");
    setUserRecipes((data || []).map((r) => ({
      id: r.id, name: r.name, source: "My Recipes", overview: r.overview,
      prepTime: r.prep_time, cookTime: r.cook_time, servings: r.servings,
      ingredients: r.ingredients, steps: r.steps, keywords: [], macros: {},
    })));
  }

  async function loadPantry() {
    const { data } = await supabase
      .from("pantry_items").select("id, name, amount").eq("household_id", household.id).order("added_at");
    setPantryItems(data || []);
  }

  async function addPantryItem() {
    const raw = pantryInput.trim();
    if (!raw) return;
    const match = raw.match(/^([\d.]+\s*(?:g|kg|ml|l|tsp|tbsp|cup|cups|oz|lb|pieces?|slices?|handful|pinch)\s*)/i);
    let amount = "", name = raw;
    if (match) { amount = match[0].trim(); name = raw.slice(match[0].length).trim() || raw; }

    // Premium/gifted: ask AI if the name is ambiguous before saving.
    const hasUnlimitedAi = !!(preferences?.puter_token_hint || preferences?.is_gifted || preferences?.gemini_api_key_hint);
    if (hasUnlimitedAi && name.split(/\s+/).length <= 2) {
      setPantryInput("");
      setPantryNudge({ original: name, amount, suggestions: [], loading: true });
      try {
        const data = await apiFetch('/api/ai/normalize-pantry-item', { method: 'POST', body: { name } });
        if (data.ambiguous && data.alternatives?.length > 0) {
          setPantryNudge({ original: name, amount, suggestions: [data.canonical, ...data.alternatives], loading: false });
          return; // wait for user to pick
        }
        // Unambiguous — save canonical name directly
        await savePantryName(data.canonical || name, amount);
      } catch {
        // AI unavailable — fall back to raw name
        await savePantryName(name, amount);
      } finally {
        setPantryNudge(null);
      }
      return;
    }

    await savePantryName(name, amount);
    setPantryInput("");
  }

  async function savePantryName(name, amount) {
    const tempId = `optimistic-${Date.now()}`;
    setPantryItems((prev) => [...prev, { id: tempId, name, amount }]);
    await supabase.from("pantry_items").insert({ household_id: household.id, name, amount });
  }

  async function confirmPantryNudge(chosenName) {
    if (!pantryNudge) return;
    const { amount } = pantryNudge;
    setPantryNudge(null);
    await savePantryName(chosenName, amount);
  }

  async function submitQuickEntry(day) {
    const name = quickEntryValue.trim();
    if (!name) { setQuickEntryDay(null); return; }
    setQuickEntryDay(null);
    setQuickEntryValue('');
    const stub = {
      id: `quick-${Date.now()}`,
      name,
      _plannedDay: day,
      _weekStart: viewWeek,
      _quickEntry: true,
      ingredients: [],
      steps: [],
      prepTime: 0,
      cookTime: 0,
    };
    await toggleSelectedRecipe(stub);
  }

  async function removePantryItem(id) {
    setPantryItems((prev) => prev.filter((i) => i.id !== id));
    await supabase.from("pantry_items").delete().eq("id", id);
  }

  async function loadTemplates() {
    const { data } = await supabase
      .from("plan_templates").select("id, name, recipes").eq("household_id", household.id).order("created_at");
    setTemplates(data || []);
  }

  async function saveTemplate() {
    const name = templateName.trim();
    if (!name || viewRecipeObjects.length === 0) return;
    await supabase.from("plan_templates").insert({
      household_id: household.id,
      name,
      recipes: viewRecipeObjects,
    });
    setTemplateName("");
    setShowTemplates(false);
    await loadTemplates();
  }

  async function loadTemplate(template) {
    // Clear current plan and load template recipes
    for (const item of mealPlanItems) {
      await supabase.from("meal_plan_items").delete().eq("id", item.id);
    }
    for (const recipe of template.recipes) {
      await supabase.from("meal_plan_items").insert({
        household_id: household.id,
        recipe_id: String(recipe.id),
        recipe_data: recipe,
      });
    }
    setShowTemplates(false);
  }

  async function deleteTemplate(id) {
    await supabase.from("plan_templates").delete().eq("id", id);
    await loadTemplates();
  }

  async function toggleStar(recipe) {
    const rid = String(recipe.id);
    const isStarred = starredItems.some((s) => s.recipe_id === rid);
    if (isStarred) {
      setStarredItems((prev) => prev.filter((s) => s.recipe_id !== rid));
      await supabase.from("starred_recipes").delete()
        .eq("household_id", household.id).eq("recipe_id", rid);
    } else {
      setStarredItems((prev) => [...prev, { recipe_id: rid, recipe_data: recipe, rotation_priority: 2 }]);
      await supabase.from("starred_recipes").insert({
        household_id: household.id, recipe_id: rid, recipe_data: recipe,
      });
    }
  }

  // Accept an AI substitution — saves it as a custom ingredient note on the recipe
  async function acceptSubstitution(rid, sub) {
    await supabase.from("custom_ingredients").insert({
      household_id: household.id,
      recipe_id: rid,
      name: sub.replacement,
      amount: `replaces: ${sub.original}`,
    });
  }

  async function generateAndSaveRecipe(rid, fullData) {
    const item = mealPlanItems.find((i) => i.recipe_id === rid);
    if (!item) return;
    const updatedRecipe = { ...item.recipe_data, ...fullData };
    const { error } = await supabase.from("meal_plan_items")
      .update({ recipe_data: updatedRecipe })
      .eq("id", item.id);
    if (error) { console.error('[generateAndSaveRecipe] update failed:', error); return; }
    // Update local state directly so the expanded card rerenders with the
    // full ingredients/steps immediately — don't wait for realtime.
    setMealPlanItems((prev) => prev.map((i) =>
      i.id === item.id ? { ...i, recipe_data: updatedRecipe } : i
    ));
  }

  // ── Side dish helpers ─────────────────────────────────────────────────────
  async function saveSideDish(itemId, sideDish) {
    const item = mealPlanItems.find((i) => String(i.recipe_data?.id) === String(itemId));
    if (!item) return;
    const updated = { ...item.recipe_data };
    if (sideDish) updated._sideDish = sideDish;
    else delete updated._sideDish;
    setMealPlanItems((prev) => prev.map((i) => i.id === item.id ? { ...i, recipe_data: updated } : i));
    await supabase.from('meal_plan_items').update({ recipe_data: updated }).eq('id', item.id);
  }

  async function fetchSideSuggestions(dayKey, mainRecipe, preference) {
    setSideDishPanel((p) => ({ ...p, loading: true, error: '', suggestions: [] }));
    const pref = preference !== undefined ? preference : sideDishPanel?.input || '';
    try {
      const data = await apiFetch('/api/ai/suggest-side', {
        method: 'POST',
        body: { recipe: { name: mainRecipe.name, cuisine_type: mainRecipe.cuisineType, ingredients: mainRecipe.ingredients }, preference: pref },
      });
      setSideDishPanel((p) => ({ ...p, loading: false, suggestions: data.suggestions || [] }));
    } catch (err) {
      setSideDishPanel((p) => ({ ...p, loading: false, error: err.message }));
    }
  }

  // ── Waste / shopping insights ─────────────────────────────────────────────
  async function fetchWasteInsights() {
    setWasteInsights({ loading: true, insights: [], error: '' });
    try {
      const data = await apiFetch('/api/ai/shopping-insights', {
        method: 'POST',
        body: {
          items: shoppingList.filter((i) => !i.inPantry).map((i) => ({ name: i.name, amount: i.amount })),
          recipes: selectedRecipeObjects.map((r) => ({ name: r.name, servings: r.servings })),
        },
      });
      setWasteInsights({ loading: false, insights: data.insights || [], error: '' });
    } catch (err) {
      setWasteInsights({ loading: false, insights: [], error: err.message });
    }
  }

  // ── Recipe search ─────────────────────────────────────────────────────────
  async function importFromUrl() {
    const url = importUrl.trim();
    if (!url) return;
    setImportLoading(true);
    setImportError("");
    try {
      const data = await apiFetch('/api/recipes', {
        method: 'POST',
        body: { url },
      });

      // Safety pass — classify content before saving. 'block' refuses,
      // 'warn' asks the user, 'ok' proceeds silently. Failures here
      // shouldn't block the happy path, so swallow any moderation error.
      let mod;
      try {
        mod = await apiFetch('/api/ai/moderate', { method: 'POST', body: { recipe: data } });
      } catch { /* moderation is best-effort */ }

      if (mod?.severity === 'block') {
        setImportError(`Blocked: ${mod.summary || 'content failed safety review'}`);
        return;
      }
      if (mod?.severity === 'warn') {
        const msg = `Heads up: ${mod.summary || 'this recipe has some flags'}\n\n${(mod.issues || []).map((i) => `• ${i}`).join('\n')}\n\nAdd it anyway?`;
        if (!window.confirm(msg)) return;
      }

      await toggleSelectedRecipe(data);
      setImportUrl("");
      setActiveTab("week");
    } catch (err) {
      setImportError(err.message || 'Could not import recipe');
    } finally {
      setImportLoading(false);
    }
  }

  const fetchRecipes = useCallback(async (query) => {
    if (!query.trim()) { setRecipes([]); return; }
    setSearchLoading(true);
    try {
      // apiFetch attaches bearer + X-Household-Id so the search endpoint can
      // resolve the household's AI provider for the LLM-suggestion fallback.
      const data = await apiFetch(`/api/recipes?${new URLSearchParams({ q: query })}`);
      setRecipes(data);
    } catch {
      setRecipes([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchRecipes(searchQuery), 400);
    return () => clearTimeout(searchTimer.current);
  }, [searchQuery, fetchRecipes]);

  // ── Meal plan handlers ────────────────────────────────────────────────────
  async function toggleSelectedRecipe(recipe) {
    const rid = String(recipe.id);
    const existing = mealPlanItems.find((i) => i.recipe_id === rid);
    if (existing) {
      setMealPlanItems((prev) => prev.filter((i) => i.recipe_id !== rid));
      setExpandedRecipes((p) => { const n = { ...p }; delete n[rid]; return n; });
      await supabase.from("meal_plan_items").delete().eq("id", existing.id);
      return;
    }
    // Hard dietary guardrail — runs deterministically on top of the LLM's
    // soft respect for preferences. Only nags on ADD, not REMOVE, and only
    // when the recipe has actual ingredients (stubs are checked later when
    // they get filled in).
    if ((recipe.ingredients || []).length > 0) {
      const avoids = extractAvoids(preferences?.preferences_text || '', householdMembers);
      const conflicts = checkRecipe(recipe, avoids);
      if (conflicts.length) {
        const ok = window.confirm(
          `Heads up — this recipe contains ingredients the household said they avoid:\n\n` +
          summarizeConflicts(conflicts) +
          `\n\nAdd it anyway?`
        );
        if (!ok) return;
      }
    }
    const recipeData = { ...recipe, _weekStart: recipe._weekStart || viewWeek };
    setMealPlanItems((prev) => [...prev, { id: `optimistic-${rid}`, recipe_id: rid, recipe_data: recipeData }]);
    const { data: inserted } = await supabase.from("meal_plan_items").insert({
      household_id: household.id,
      recipe_id: rid,
      recipe_data: recipeData,
    }).select('id').single();
    // Background Pexels photo fetch for manually-added recipes (no planner photo yet)
    if (!recipeData._plannerPhoto && recipeData.name) {
      apiFetch(`/api/photo?name=${encodeURIComponent(recipeData.name)}`)
        .then(({ photo }) => {
          if (!photo) return;
          const withPhoto = { ...recipeData, _plannerPhoto: photo };
          setMealPlanItems((prev) => prev.map((i) =>
            i.recipe_id === rid ? { ...i, recipe_data: withPhoto } : i
          ));
          if (inserted?.id) {
            supabase.from('meal_plan_items').update({ recipe_data: withPhoto }).eq('id', inserted.id);
          }
        })
        .catch(() => {});
    }
  }

  // When search was launched from a specific day slot, assign the recipe to that day
  async function handleSearchSelect(recipe) {
    const withDay = searchTargetDay
      ? { ...recipe, _plannedDay: searchTargetDay }
      : recipe;
    await toggleSelectedRecipe(withDay);
    if (searchTargetDay) {
      setSearchTargetDay(null);
      setSearchQuery('');
    }
  }

  async function addExtraMeal(day, mealType, request) {
    const key = `${day}-${mealType}`;
    setGeneratingExtra(key);
    try {
      const otherNames = viewItems.map((i) => i.recipe_data?.name).filter(Boolean);
      const data = await apiFetch('/api/ai/regenerate-day', {
        method: 'POST',
        body: {
          day_name: day,
          current_recipe_name: '',
          change_request: request || `A simple ${mealType} for ${day}`,
          other_days_names: otherNames,
          meal_type: mealType,
        },
      });
      if (data?.recipe) {
        await toggleSelectedRecipe({
          ...data.recipe,
          _plannedDay: day,
          _weekStart: viewWeek,
          _mealType: mealType,
          _plannerReason: data.reason || null,
          _plannerPhoto: data.photo || null,
        });
      }
    } catch {
      // fail silently — button re-enables
    } finally {
      setGeneratingExtra(null);
    }
  }

  async function toggleCookedRecipe(rid) {
    if (cookedRecipes[rid]) {
      setCookedRecipes((prev) => { const n = { ...prev }; delete n[rid]; return n; });
      await supabase.from("cooked_recipes").delete()
        .eq("household_id", household.id).eq("recipe_id", rid);
    } else {
      setCookedRecipes((prev) => ({ ...prev, [rid]: true }));
      setRatingPrompt(rid);
      await supabase.from("cooked_recipes").insert({ household_id: household.id, recipe_id: rid });
    }
  }

  async function toggleNotAtHome(day) {
    const dayPrefix = day.toLowerCase().slice(0, 3);
    const existing = mealPlanItems.find(
      (i) => i.recipe_data?._notAtHome &&
        String(i.recipe_data._plannedDay).toLowerCase().startsWith(dayPrefix) &&
        i.recipe_data._weekStart === viewWeek
    );
    if (existing) {
      // Undo: remove the marker; shopping list items auto-restore via viewRecipeObjects
      setMealPlanItems((prev) => prev.filter((i) => i.id !== existing.id));
      await supabase.from('meal_plan_items').delete().eq('id', existing.id);
      return;
    }

    // If shopping already happened for this day, move checked items to pantry
    // so they're available for future weeks instead of being wasted.
    const dayRecipes = mealPlanItems.filter(
      (i) => !i.recipe_data?._notAtHome &&
        String(i.recipe_data?._plannedDay).toLowerCase().startsWith(dayPrefix) &&
        i.recipe_data?._weekStart === viewWeek
    );
    const existingPantryNames = new Set(pantryItems.map((p) => p.name.toLowerCase()));
    const toAddToPantry = [];
    dayRecipes.forEach((item) => {
      const rd = item.recipe_data;
      [...(rd?.ingredients || []), ...(rd?._sideDish?.ingredients || [])].forEach(({ name }) => {
        const key = name.toLowerCase().trim();
        if (checkedItems[name] && !existingPantryNames.has(key) && !toAddToPantry.includes(name)) {
          toAddToPantry.push(name);
        }
      });
    });
    for (const name of toAddToPantry) {
      await supabase.from('pantry_items').insert({ household_id: household.id, name, amount: '' });
    }

    const markerData = { id: `not-at-home-${day}`, _notAtHome: true, _plannedDay: day, _weekStart: viewWeek, name: 'Not at home' };
    const tempId = `optimistic-not-at-home-${day}`;
    setMealPlanItems((prev) => [...prev, { id: tempId, recipe_id: 'not-at-home', recipe_data: markerData, household_id: household.id }]);
    const { data: inserted } = await supabase.from('meal_plan_items').insert({
      household_id: household.id, recipe_id: 'not-at-home', recipe_data: markerData,
    }).select('id').single();
    if (inserted?.id) {
      setMealPlanItems((prev) => prev.map((i) => i.id === tempId ? { ...i, id: inserted.id } : i));
    }
  }

  async function toggleMealSkip(itemId) {
    setMealPlanItems((prev) => prev.map((item) => {
      if (item.id !== itemId) return item;
      const updated = { ...item.recipe_data, _skipped: !item.recipe_data._skipped };
      supabase.from('meal_plan_items').update({ recipe_data: updated }).eq('id', itemId);
      return { ...item, recipe_data: updated };
    }));
  }

  async function saveRating(rid, stars) {
    setRatingPrompt(null);
    setRecipeRatings((prev) => ({ ...prev, [rid]: stars }));
    await supabase.from("cooked_recipes")
      .update({ rating: stars })
      .eq("household_id", household.id).eq("recipe_id", rid);
    // If they loved it, offer to share — explicit, opt-in "share this win"
    // rather than an ambient activity feed.
    if (stars >= 4) {
      const item = mealPlanItems.find((i) => i.recipe_id === rid);
      if (item?.recipe_data) setShareOffer({ recipe: item.recipe_data, stars });
    }
  }

  // ── Custom ingredient handlers ────────────────────────────────────────────
  async function addCustomIngredient(rid) {
    const raw = (newIngredientInput[rid] || "").trim();
    if (!raw) return;
    const match = raw.match(/^([\d.]+\s*(?:g|kg|ml|l|tsp|tbsp|cup|cups|oz|lb|piece|pieces|slice|slices|handful|pinch)?\s*)/i);
    let amount = "", name = raw;
    if (match) { amount = match[0].trim(); name = raw.slice(match[0].length).trim() || raw; }
    const tempId = `optimistic-${Date.now()}`;
    setCustomIngredients((prev) => ({ ...prev, [rid]: [...(prev[rid] || []), { id: tempId, name, amount }] }));
    setNewIngredientInput((prev) => ({ ...prev, [rid]: "" }));
    await supabase.from("custom_ingredients").insert({
      household_id: household.id, recipe_id: rid, name, amount,
    });
  }

  async function removeCustomIngredient(rid, ingredientId) {
    setCustomIngredients((prev) => ({ ...prev, [rid]: (prev[rid] || []).filter((i) => i.id !== ingredientId) }));
    await supabase.from("custom_ingredients").delete().eq("id", ingredientId);
  }

  // ── Shopping list handlers ────────────────────────────────────────────────
  async function toggleItem(itemName) {
    // Optimistic update — flip state immediately so the UI responds without
    // waiting for the Supabase realtime event.
    const wasChecked = !!checkedItems[itemName];
    setCheckedItems((prev) => {
      const next = { ...prev };
      if (wasChecked) delete next[itemName];
      else next[itemName] = true;
      return next;
    });
    if (wasChecked) {
      await supabase.from("shopping_checks").delete()
        .eq("household_id", household.id).eq("item_name", itemName);
    } else {
      await supabase.from("shopping_checks").insert({ household_id: household.id, item_name: itemName });
      // Auto-add bulk staples to pantry — they'll have plenty left over after one use
      if (isBulkStaple(itemName)) {
        const alreadyInPantry = pantryItems.some((p) => p.name.toLowerCase().trim() === itemName.toLowerCase().trim());
        if (!alreadyInPantry) {
          const { data: inserted } = await supabase.from('pantry_items')
            .insert({ household_id: household.id, name: itemName, amount: '' })
            .select('id, name, amount').single();
          if (inserted) setPantryItems((prev) => [...prev, inserted]);
        }
      }
    }
  }

  async function clearCheckedItems() {
    setCheckedItems({});
    supabase.from("shopping_checks").delete().eq("household_id", household.id);
  }

  async function clearWeekPlan() {
    const ids = viewItems.map((i) => i.id).filter(Boolean);
    if (!ids.length) return;
    setMealPlanItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    setClearWeekConfirm(false);
    setShowEmptyGrid(true);
    supabase.from("meal_plan_items").delete().in("id", ids);
  }

  // ── Invite link ───────────────────────────────────────────────────────────
  const inviteUrl = household
    ? `${window.location.origin}?invite=${household.invite_token}`
    : "";

  async function shareInviteLink() {
    const shareData = {
      title: 'Join our kitchen',
      text: "Come plan meals with me — one shared list, no more \"what's for dinner?\" texts.",
      url: inviteUrl,
    };
    if (navigator.share && navigator.canShare?.(shareData)) {
      try { await navigator.share(shareData); } catch (err) {
        if (err.name !== 'AbortError') setShowInviteSharePanel(true);
      }
    } else {
      setShowInviteSharePanel((v) => !v);
    }
  }

  async function copyInviteLink() {
    await navigator.clipboard.writeText(inviteUrl);
    setInviteCopied(true);
    setShowInviteSharePanel(false);
    setTimeout(() => setInviteCopied(false), 2000);
  }

  async function saveHouseholdName() {
    const name = householdNameDraft.trim();
    if (!name || name === household.name) { setEditingHouseholdName(false); return; }
    const { error } = await supabase.from('households').update({ name }).eq('id', household.id);
    if (error) {
      console.error('[saveHouseholdName]', error.message);
    } else {
      // Optimistic update, then confirm from DB so the name survives a reload
      setHousehold((h) => ({ ...h, name }));
      supabase.from('households').select('name').eq('id', household.id).single()
        .then(({ data }) => { if (data?.name) setHousehold((h) => ({ ...h, name: data.name })); });
    }
    setEditingHouseholdName(false);
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const currentWeekStart = getWeekStart(new Date());
  // Items visible for the currently-viewed week. Legacy items (no _weekStart)
  // are treated as belonging to the current week for backwards compatibility.
  const viewItems = mealPlanItems.filter((i) => {
    const iw = i.recipe_data?._weekStart;
    return iw ? iw === viewWeek : viewWeek === currentWeekStart;
  });
  const selectedRecipeObjects = mealPlanItems.map((i) => i.recipe_data);
  const selectedIds = new Set(mealPlanItems.map((i) => i.recipe_id));
  const starredIds = new Set(starredItems.map((s) => s.recipe_id));
  const starredRecipes = starredItems.map((s) => s.recipe_data);
  // Shopping list is scoped to the viewed week so users get a per-week list.
  // Days marked as "not at home" are excluded — no point buying ingredients for them.
  const notAtHomeDaySet = new Set(
    viewItems
      .filter((i) => i.recipe_data?._notAtHome)
      .map((i) => String(i.recipe_data._plannedDay).toLowerCase().slice(0, 3))
  );
  const viewRecipeObjects = viewItems
    .filter((i) => {
      if (i.recipe_data?._notAtHome) return false;
      if (i.recipe_data?._skipped) return false;
      const pd = i.recipe_data?._plannedDay;
      if (!pd) return true;
      return !notAtHomeDaySet.has(String(pd).toLowerCase().slice(0, 3));
    })
    .map((i) => i.recipe_data);
  const shoppingList = consolidateIngredients(viewRecipeObjects, customIngredients)
    .map((item) => ({ ...item, inPantry: pantryItems.some((p) => pantryMatchesItem(p.name, item.name)) }));
  const checkedCount = shoppingList.filter((i) => checkedItems[i.name]).length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { setWasteInsights(null); }, [shoppingList.length]);

  // ── Public recipe share view ─────────────────────────────────────────────
  // Rendered before the auth gate so unsigned visitors can see shared recipes.
  const shareToken = new URLSearchParams(window.location.search).get('recipe_share');
  if (shareToken) {
    return (
      <SharedRecipeView
        token={shareToken}
        onClose={() => {
          window.history.replaceState({}, '', window.location.pathname);
          // Forces re-render without the share param.
          window.location.reload();
        }}
      />
    );
  }

  // ── Loading / auth gate ───────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !household) return <AuthScreen />;

  // First-run gate: only show onboarding when neither onboarded_at nor
  // display_name is set — covers users created before the onboarded_at
  // column migration was run.
  if (memberProfile && !memberProfile.onboarded_at && !memberProfile.display_name) {
    return (
      <OnboardingScreen
        user={user}
        household={household}
        memberProfile={memberProfile}
        onDone={() => {
          setMemberProfile((m) => ({ ...m, onboarded_at: new Date().toISOString() }));
          // Land them straight in the suggest-week modal so "see some
          // suggestions" actually delivers suggestions.
          setShowWeekSuggest(true);
        }}
      />
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white font-outfit">
      {/* Top bar — household switcher (only when 2+ households) */}
      {memberships.length >= 2 && (
        <div className="sticky top-0 z-30 bg-orange-50/80 backdrop-blur-md border-b border-orange-100 px-4 py-2 flex items-center gap-2 max-w-2xl mx-auto">
          <HouseholdSwitcher
            memberships={memberships}
            activeId={household?.id}
            onSwitch={switchHousehold}
            onLeave={leaveHousehold}
            variant="chip"
          />
        </div>
      )}

      {/* Reminder banner */}
      {showReminderBanner && (
        <div className="bg-orange-50 border-b border-orange-100 px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <p className="text-sm text-orange-900">
              <span className="font-semibold">Time to plan your week!</span> You haven't updated the plan in a while.
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => { setShowWeekSuggest(true); setShowReminderBanner(false); }}
                className="text-xs px-4 py-1.5 bg-orange-500 text-white rounded-full font-semibold hover:bg-orange-600 transition">
                Plan now
              </button>
              <button onClick={() => {
                  localStorage.setItem(`reminder_dismissed_${new Date().toISOString().slice(0, 10)}`, '1');
                  setShowReminderBanner(false);
                }}
                className="text-orange-400 hover:text-orange-600 transition">
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preferences modal */}
      {showPreferences && (
        <PreferencesModal
          household={household}
          initialPrefs={preferences}
          onPrefsChange={(p) => setPreferences((prev) => ({ ...prev, ...p }))}
          onClose={() => { setShowPreferences(false); loadPreferences(); }}
        />
      )}

      {/* Post-signup Puter connect */}
      {showPuterWelcome && (
        <PuterWelcomeModal
          onClose={() => { setShowPuterWelcome(false); loadPreferences(); }}
        />
      )}

      {/* Grocer handoff */}
      {showGrocerHandoff && (
        <GrocerHandoffModal
          items={shoppingList.filter((i) => !i.inPantry && !checkedItems[i.name])}
          onClose={() => setShowGrocerHandoff(false)}
          onMarkChecked={(name) => {
            if (!checkedItems[name]) toggleItem(name);
          }}
        />
      )}

      {/* Willingness-to-pay survey */}
      {showSurvey && !showPreferences && (
        <WillingnessModal
          household={household}
          onClose={() => { setShowSurvey(false); loadPreferences(); }}
        />
      )}

      {/* Create recipe modal */}
      {showCreateRecipe && (
        <CreateRecipeModal
          household={household}
          onClose={() => setShowCreateRecipe(false)}
          onAddToPlan={toggleSelectedRecipe}
        />
      )}

      {/* Starred panel */}
      {showStarred && (
        <StarredPanel
          starredItems={starredItems}
          household={household}
          onClose={() => setShowStarred(false)}
          onAddToPlan={(recipe) => { toggleSelectedRecipe(recipe); setShowStarred(false); setActiveTab("week"); }}
          onUnstar={toggleStar}
          onPlanWeek={() => { setShowStarred(false); setShowWeekSuggest(true); }}
        />
      )}

      {/* AI week suggestion modal */}
      {showBagModal && (
        <SurpriseBagModal
          household={household}
          dietaryPrefs={preferences?.preferences_text || ''}
          onAddRecipes={async (recipes) => { for (const r of recipes) await toggleSelectedRecipe(r); setActiveTab('week'); }}
          onClose={() => setShowBagModal(false)}
        />
      )}

      {showWeekSuggest && (
        <WeekSuggestModal
          household={household}
          planExtrasText={planExtrasText}
          onClose={() => setShowWeekSuggest(false)}
          onLoadPlan={async (recipes) => {
            setShowEmptyGrid(false);
            // Optimistically clear existing items for this week
            const oldIds = viewItems.map((i) => i.id).filter(Boolean);
            if (oldIds.length) {
              setMealPlanItems((prev) => prev.filter((i) => !oldIds.includes(i.id)));
              supabase.from("meal_plan_items").delete().in("id", oldIds);
            }
            // Optimistically add new items
            const newRows = recipes.map((recipe) => ({
              id: `optimistic-${recipe.id}-${Math.random()}`,
              recipe_id: String(recipe.id),
              recipe_data: { ...recipe, _weekStart: viewWeek },
              household_id: household.id,
            }));
            setMealPlanItems((prev) => [...prev, ...newRows]);
            // Persist to DB
            const { data: inserted } = await supabase.from("meal_plan_items").insert(
              newRows.map(({ recipe_id, recipe_data }) => ({ household_id: household.id, recipe_id, recipe_data }))
            ).select('id, recipe_id');
            const idMap = {};
            if (inserted) {
              inserted.forEach((r) => { idMap[r.recipe_id] = r.id; });
              setMealPlanItems((prev) => prev.map((item) =>
                item.id.startsWith('optimistic-') && idMap[item.recipe_id]
                  ? { ...item, id: idMap[item.recipe_id] }
                  : item
              ));
            }
            setActiveTab("week");
            // Background: generate full ingredients for all AI stubs in one batch call
            // so the entire enrichment pass counts as a single rate-limit hit.
            const aiStubs = recipes.filter((r) => r._aiSuggestion && !(r.ingredients?.length));
            if (aiStubs.length) {
              (async () => {
                try {
                  const { results } = await apiFetch('/api/ai/generate-recipes-batch', {
                    method: 'POST',
                    body: { recipes: aiStubs },
                  });
                  for (const generated of results) {
                    if (!generated.success) {
                      console.error('[bg-generate]', generated.id, generated.error);
                      continue;
                    }
                    const stub = aiStubs.find((s) => String(s.id) === String(generated.id));
                    if (!stub) continue;
                    const enriched = {
                      ...stub,
                      ingredients: generated.ingredients || [],
                      steps: generated.steps || [],
                      prepTime: generated.prepTime || stub.prepTime,
                      cookTime: generated.cookTime || stub.cookTime,
                      macros: generated.macros || {},
                      _weekStart: viewWeek,
                      ...(stub._sideDish && {
                        _sideDish: { ...stub._sideDish, steps: generated.side_dish_steps || [] },
                      }),
                    };
                    setMealPlanItems((prev) => prev.map((item) =>
                      item.recipe_id === String(stub.id)
                        ? { ...item, recipe_data: enriched }
                        : item
                    ));
                    const dbId = idMap[String(stub.id)];
                    if (dbId) supabase.from('meal_plan_items').update({ recipe_data: enriched }).eq('id', dbId);
                  }
                } catch (err) {
                  console.error('[bg-generate-batch]', err.message);
                }
              })();
            }
          }}
        />
      )}

      {/* Side dish panel */}
      {sideDishPanel && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20" onClick={() => setSideDishPanel(null)}>
          <div className="bg-white rounded-t-2xl w-full max-w-sm p-5 shadow-warm-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-semibold text-orange-900 text-sm">Side for {sideDishPanel.mainRecipe?.name}</p>
                <p className="text-xs text-orange-400">Not right? Try different below.</p>
              </div>
              <button onClick={() => setSideDishPanel(null)} className="text-orange-400 hover:text-orange-600 transition"><X size={16} /></button>
            </div>

            {/* Suggestions shown first */}
            {sideDishPanel.loading && (
              <div className="flex items-center gap-2 py-3 mb-2">
                <div className="w-4 h-4 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                <p className="text-xs text-orange-400">Looking for a good side…</p>
              </div>
            )}
            {!sideDishPanel.loading && sideDishPanel.suggestions.length > 0 && (
              <div className="space-y-2 mb-3">
                {sideDishPanel.suggestions.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => { saveSideDish(sideDishPanel.rid, s); setSideDishPanel(null); }}
                    className="w-full text-left bg-orange-50 hover:bg-orange-100 rounded-xl px-3 py-2.5 transition border border-orange-100"
                  >
                    <p className="text-sm font-semibold text-orange-900">{s.name}</p>
                    <p className="text-xs text-orange-600 mt-0.5">{s.description}</p>
                  </button>
                ))}
              </div>
            )}

            {sideDishPanel.error && <p className="text-xs text-red-500 mb-2">{sideDishPanel.error}</p>}

            {/* Refine input — shown after initial load */}
            {!sideDishPanel.loading && (
              <div className="flex gap-2 border-t border-orange-50 pt-3">
                <input
                  type="text"
                  placeholder="Something different? (e.g. a salad, bread, rice…)"
                  value={sideDishPanel.input}
                  onChange={(e) => setSideDishPanel((p) => ({ ...p, input: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && fetchSideSuggestions(sideDishPanel.key, sideDishPanel.mainRecipe)}
                  className="flex-1 border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300/50 placeholder-orange-300"
                  autoFocus={sideDishPanel.suggestions.length === 0}
                />
                <button
                  onClick={() => fetchSideSuggestions(sideDishPanel.key, sideDishPanel.mainRecipe)}
                  className="px-3 py-2 bg-orange-100 text-orange-600 rounded-full text-xs font-medium hover:bg-orange-200 transition flex items-center gap-1"
                >
                  <Sparkles size={12} />
                  Try again
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Post-cook rating prompt */}
      {ratingPrompt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-warm-lg w-full max-w-xs p-6 text-center">
            <p className="font-display italic text-orange-600 text-xs tracking-wide mb-3">— how was it?</p>
            <h3 className="font-display text-xl font-semibold text-orange-900 mb-2 leading-tight">Worth the pan wash?</h3>
            <p className="text-xs text-orange-600 mb-4 leading-relaxed">A quick rating so the week plans itself around what you actually like.</p>
            <div className="flex justify-center gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => saveRating(ratingPrompt, s)}
                  className="text-3xl hover:scale-110 transition-transform">
                  ★
                </button>
              ))}
            </div>
            <button onClick={() => setRatingPrompt(null)}
              className="text-xs text-orange-400 hover:text-orange-600 transition">
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Share-this-win offer after a 4-5★ cook */}
      {shareOffer && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-warm-lg w-full max-w-xs p-6 text-center">
            <p className="text-2xl mb-2 text-orange-400">{'★'.repeat(shareOffer.stars)}</p>
            <h3 className="text-base font-bold text-orange-900 mb-1">A winner — share it?</h3>
            <p className="text-xs text-orange-400 mb-4">Create a public link to <span className="font-semibold text-orange-600">{shareOffer.recipe.name}</span>. Good for sending to friends.</p>
            <button
              onClick={async () => {
                try {
                  const url = await shareRecipe(shareOffer.recipe);
                  await navigator.clipboard?.writeText(url);
                  setShareOffer(null);
                } catch (err) {
                  setShareOffer((o) => o ? { ...o, error: err.message || 'Could not create share link' } : null);
                }
              }}
              className="w-full py-2.5 bg-orange-500 text-white rounded-full text-sm font-semibold hover:bg-orange-600 transition mb-2"
            >
              Create share link
            </button>
            {shareOffer?.error && (
              <p className="text-xs text-red-500 mt-2 mb-1">{shareOffer.error}</p>
            )}
            <button onClick={() => setShareOffer(null)}
              className="text-xs text-orange-400 hover:text-orange-600 transition">
              Not this time
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-2xl mx-auto px-4 pt-4 pb-28">

        {/* ── WEEK TAB ── */}
        {activeTab === "week" && (
          <div>
            {/* Week navigator */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setViewWeek((w) => addWeeks(w, -1))}
                className="w-9 h-9 flex items-center justify-center rounded-full border border-orange-200 bg-white text-orange-400 hover:text-orange-600 hover:border-orange-300 transition"
                aria-label="Previous week"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="text-center">
                <p className="text-sm font-semibold text-orange-900">{formatWeekLabel(viewWeek)}</p>
                <button
                  onClick={() => setViewWeek(currentWeekStart)}
                  className={`text-[11px] text-orange-600 hover:text-orange-900 transition font-medium ${viewWeek === currentWeekStart ? 'invisible' : ''}`}
                >
                  Back to this week
                </button>
              </div>
              <button
                onClick={() => setViewWeek((w) => addWeeks(w, 1))}
                className="w-9 h-9 flex items-center justify-center rounded-full border border-orange-200 bg-white text-orange-400 hover:text-orange-600 hover:border-orange-300 transition"
                aria-label="Next week"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Search bar + starred button */}
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-orange-400" size={18} />
                <input
                  ref={searchInputRef}
                  type="search"
                  placeholder="Search recipes…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-10 py-3 rounded-2xl border border-orange-200 bg-white text-orange-900 placeholder-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-400 text-sm"
                />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(''); setSearchTargetDay(null); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-orange-400 hover:text-orange-600 transition">
                    <X size={16} />
                  </button>
                )}
              </div>
              <button onClick={() => setShowStarred(true)}
                className="relative flex-shrink-0 w-12 rounded-2xl border border-orange-200 bg-white flex items-center justify-center text-orange-400 hover:text-orange-600 hover:border-orange-300 transition"
                title="Saved recipes">
                <Star size={18} />
                {starredItems.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full text-white text-[9px] font-bold flex items-center justify-center">
                    {starredItems.length}
                  </span>
                )}
              </button>
            </div>

            {searchQuery ? (
              <div>
                {/* Day-assignment banner — shown when search was opened from a day slot */}
                {searchTargetDay && (
                  <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 mb-3">
                    <span className="text-xs text-orange-700">Adding to <strong>{searchTargetDay}</strong></span>
                    <button onClick={() => setSearchTargetDay(null)} className="text-xs text-orange-400 hover:text-orange-600 transition font-medium">Cancel</button>
                  </div>
                )}
                {/* URL import + manual create */}
                <div className="bg-white rounded-2xl border border-orange-100 p-4 mb-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide">Import from any website</p>
                    <button onClick={() => setShowCreateRecipe(true)}
                      className="flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-900 transition">
                      <PenLine size={12} /> Create your own
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="Paste a recipe URL…"
                      value={importUrl}
                      onChange={(e) => { setImportUrl(e.target.value); setImportError(""); }}
                      onKeyDown={(e) => e.key === "Enter" && importFromUrl()}
                      className="flex-1 border border-orange-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-400 placeholder-orange-300"
                    />
                    <button onClick={importFromUrl} disabled={importLoading || !importUrl.trim()}
                      className="flex-shrink-0 px-4 py-2.5 bg-orange-500 text-white rounded-full text-sm font-medium hover:bg-orange-600 transition disabled:opacity-50 flex items-center gap-1.5">
                      <Link2 size={14} />
                      {importLoading ? "Importing…" : "Import"}
                    </button>
                  </div>
                  {importError && <p className="text-xs text-red-500 mt-2">{importError}</p>}
                </div>

                {userRecipes.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm text-orange-600 font-medium mb-2">Your recipes</p>
                    <div className="space-y-3">
                      {userRecipes.map((recipe) => (
                        <RecipeCard key={recipe.id} recipe={recipe}
                          isSelected={selectedIds.has(String(recipe.id))}
                          isStarred={starredIds.has(String(recipe.id))}
                          onToggleSelect={handleSearchSelect}
                          onToggleStar={toggleStar} />
                      ))}
                    </div>
                    {recipes.length > 0 && <div className="border-t border-orange-100 my-4" />}
                  </div>
                )}

                {searchLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="w-7 h-7 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                  </div>
                ) : recipes.length > 0 ? (
                  (() => {
                    const isPaid  = !!(preferences?.puter_token_hint || preferences?.is_gifted);
                    const isBYOK  = !isPaid && !!(preferences?.gemini_api_key_hint);
                    const limit   = isPaid ? Infinity : isBYOK ? 8 : 4;
                    const visible = recipes.slice(0, limit);
                    const lockedCount = Math.max(0, recipes.length - limit);
                    const lockMsg = isBYOK
                      ? `${lockedCount} more recipe${lockedCount !== 1 ? 's' : ''} in the full library — upgrade for all results.`
                      : `${lockedCount} more recipe${lockedCount !== 1 ? 's' : ''} — add your Gemini key for more, or upgrade for the full library.`;
                    const lockLabel = isBYOK ? 'Upgrade for full access' : 'Add a key for more results';
                    return (
                      <div className="space-y-3">
                        <p className="text-sm text-orange-600 font-medium">{recipes.length} recipe{recipes.length !== 1 ? "s" : ""} found</p>
                        {visible.map((recipe) => (
                          <RecipeCard key={recipe.id} recipe={recipe}
                            isSelected={selectedIds.has(String(recipe.id))}
                            isStarred={starredIds.has(String(recipe.id))}
                            onToggleSelect={handleSearchSelect}
                            onToggleStar={toggleStar} />
                        ))}
                        {lockedCount > 0 && (
                          <>
                            {[0, 1].map((i) => (
                              <div key={i} className="relative rounded-2xl border border-orange-100 bg-white overflow-hidden">
                                <div className="px-4 py-4 space-y-2.5 pointer-events-none select-none" style={{ filter: 'blur(4px)' }}>
                                  <div className="flex items-center gap-3">
                                    <div className="w-5 h-5 rounded-full bg-orange-100 flex-shrink-0" />
                                    <div className="h-3.5 bg-orange-100 rounded-full" style={{ width: `${55 + i * 15}%` }} />
                                  </div>
                                  <div className="h-3 bg-orange-50 rounded-full w-2/3" />
                                  <div className="h-3 bg-orange-50 rounded-full w-1/2" />
                                </div>
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/75">
                                  <svg className="w-4 h-4 text-orange-400 mb-1.5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V7a4.5 4.5 0 00-9 0v3.5M5 10.5h14a1 1 0 011 1V20a1 1 0 01-1 1H5a1 1 0 01-1-1v-8.5a1 1 0 011-1z" /></svg>
                                  <p className="text-xs font-medium text-orange-900">{lockLabel}</p>
                                </div>
                              </div>
                            ))}
                            <div className="text-center py-3">
                              <p className="text-xs text-orange-600 mb-2">{lockMsg}</p>
                              <button
                                onClick={() => { setSearchQuery(''); setActiveTab("profile"); }}
                                className="text-xs px-4 py-1.5 bg-orange-500 text-white rounded-full font-semibold hover:bg-orange-600 transition"
                              >
                                Open Settings
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-center py-12 text-orange-400">
                    <Search size={48} className="mx-auto mb-3 opacity-50" />
                    <p className="font-medium text-orange-400">Search or apply filters to discover recipes</p>
                    <p className="text-sm mt-1">quality recipes, adjusted to you</p>
                  </div>
                )}
              </div>
            ) : viewItems.length > 0 || showEmptyGrid ? (
              <>
                {/* Header row */}
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="font-display text-xl font-semibold text-orange-900 leading-none">
                      {viewWeek === currentWeekStart ? 'This week' : viewWeek < currentWeekStart ? 'Past week' : 'Upcoming week'}
                    </h2>
                    {viewItems.length > 0 && (
                      <p className="text-xs text-orange-400 mt-0.5">{viewItems.length} meal{viewItems.length !== 1 ? 's' : ''} planned</p>
                    )}
                    {viewItems.length > 0 && (!clearWeekConfirm ? (
                      <button onClick={() => setClearWeekConfirm(true)} className="text-[10px] text-orange-200 hover:text-orange-400 transition mt-0.5">Clear week</button>
                    ) : (
                      <span className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-orange-600">Remove all?</span>
                        <button onClick={clearWeekPlan} className="text-[10px] text-red-500 font-semibold hover:text-red-700 transition">Yes</button>
                        <button onClick={() => setClearWeekConfirm(false)} className="text-[10px] text-orange-400 hover:text-orange-600 transition">No</button>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    {viewItems.length > 0 && (
                      <button onClick={() => setShowBagModal(true)}
                        className="px-3 py-1.5 border border-dashed border-orange-200 text-orange-400 rounded-full text-xs hover:border-orange-400 hover:text-orange-600 transition">
                        What've I got?
                      </button>
                    )}
                    <button onClick={() => setShowWeekSuggest(true)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-full text-sm font-semibold hover:bg-orange-600 transition shadow-warm">
                      <Sparkles size={13} />
                      {viewItems.length > 0 ? 'Replan' : 'Plan week'}
                    </button>
                  </div>
                </div>

                {viewItems.length > 0 && <WeeklyNutritionCard recipes={viewItems.map((i) => i.recipe_data)} />}

                {/* Day-by-day calendar */}
                <div className="space-y-3">
                  {DAYS.map((day) => {
                    // All items for this day, split into dinner (primary) + extras
                    const allDayItems = viewItems.filter((i) => {
                      const pd = i.recipe_data?._plannedDay;
                      return pd && String(pd).toLowerCase().startsWith(day.toLowerCase().slice(0, 3));
                    });
                    const isNotAtHome = allDayItems.some((i) => i.recipe_data?._notAtHome);
                    const dinnerItem = allDayItems.find((i) => (!i.recipe_data?._mealType && !i.recipe_data?._notAtHome) || i.recipe_data?._mealType === 'dinner');
                    // Sort extras by time of day so they appear in chronological order
                    const MEAL_TIME_ORDER = { breakfast: 0, lunch: 1 };
                    const extraItems = allDayItems
                      .filter((i) => i.recipe_data?._mealType && i.recipe_data?._mealType !== 'dinner' && !i.recipe_data?._notAtHome)
                      .sort((a, b) => (MEAL_TIME_ORDER[a.recipe_data._mealType] ?? 2) - (MEAL_TIME_ORDER[b.recipe_data._mealType] ?? 2));
                    const recipe = dinnerItem?.recipe_data;
                    const rid = recipe ? String(recipe.id) : null;
                    const isToday = viewWeek === currentWeekStart && todayName === day;
                    const isCooked = rid ? !!cookedRecipes[rid] : false;
                    const hasBreakfast = extraItems.some((i) => i.recipe_data?._mealType === 'breakfast');
                    const hasLunch = extraItems.some((i) => i.recipe_data?._mealType === 'lunch');
                    // Accordion: expanding any meal in this day closes all others
                    const allDayRids = allDayItems.map((i) => String(i.recipe_data.id));
                    const toggleDayMeal = (targetRid) => setExpandedRecipes((p) => {
                      const next = { ...p };
                      allDayRids.forEach((r) => { next[r] = r === targetRid ? !p[r] : false; });
                      return next;
                    });

                    // Helper: render an extra meal row (breakfast/lunch/other)
                    const renderExtraRow = (item) => {
                      const xr = item.recipe_data;
                      const xrid = String(xr.id);
                      const typeLabel = xr._mealType === 'breakfast' ? 'Breakfast' : xr._mealType === 'lunch' ? 'Lunch' : (xr._mealType || 'Extra');
                      const xTime = (xr.prepTime || 0) + (xr.cookTime || 0);
                      const xIsCooked = !!cookedRecipes[xrid];
                      const xExpanded = !!expandedRecipes[xrid];
                      const xIsSkipped = !!xr._skipped;
                      return (
                        <div key={xrid} className={`border-b border-orange-50 transition-all ${xIsCooked ? 'bg-sage-100/20' : ''} ${xIsSkipped ? 'opacity-50' : ''}`}>
                          <div
                            className="flex items-center gap-3 px-4 py-2.5 cursor-pointer"
                            onClick={() => !xIsSkipped && toggleDayMeal(xrid)}
                          >
                            <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider w-16 flex-shrink-0">{typeLabel}</span>
                            {xr._plannerPhoto?.url && !xIsSkipped && (
                              <img src={xr._plannerPhoto.thumbnail || xr._plannerPhoto.url} alt={xr._plannerPhoto.alt || xr.name}
                                loading="lazy" className="w-9 h-9 rounded-[10px] object-cover flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold leading-snug truncate ${xIsSkipped || xIsCooked ? 'line-through text-orange-300' : 'text-orange-900'}`}>{xr.name}</p>
                              {!xIsSkipped && <p className="text-xs text-orange-400 mt-0.5">{[xTime > 0 ? `${xTime} min` : null, (xr._aiSuggestion || xr._quickEntry) && (!xr.ingredients || !xr.ingredients.length) ? '· tap to fill in' : null].filter(Boolean).join(' ')}</p>}
                              {xIsSkipped && <p className="text-xs text-orange-300 mt-0.5 font-display italic">not happening</p>}
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {xIsSkipped ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleMealSkip(item.id); }}
                                  className="text-xs text-orange-400 hover:text-orange-600 transition px-2 py-0.5 border border-dashed border-orange-200 hover:border-orange-400 rounded-full">
                                  Restore
                                </button>
                              ) : (
                                <>
                                  {xIsCooked && <Check size={14} className="text-sage-500" />}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); toggleMealSkip(item.id); }}
                                    className="text-orange-300 hover:text-orange-500 transition p-1" title="Skip this meal">
                                    <MinusCircle size={13} />
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); toggleSelectedRecipe(xr); }} className="text-orange-300 hover:text-red-400 transition p-1"><X size={13} /></button>
                                  {xExpanded ? <ChevronUp size={16} className="text-orange-400" /> : <ChevronDown size={16} className="text-orange-400" />}
                                </>
                              )}
                            </div>
                          </div>
                          {xExpanded && !xIsSkipped && (
                            <div className="border-t border-orange-50">
                              {(xr._plannerPhoto?.url || xr._plannerReason || xr._plannerLeftoverFor || (xr._plannerUsesPantry || []).length > 0) && (
                                <div className="bg-orange-50/50 border-b border-orange-100">
                                  {xr._plannerPhoto?.url && (
                                    <div className="relative h-40 w-full bg-orange-100 overflow-hidden">
                                      <img src={xr._plannerPhoto.url} alt={xr._plannerPhoto.alt || xr.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                                      {xr._plannerPhoto.photographer && (
                                        <a href={xr._plannerPhoto.photographer_url || 'https://www.pexels.com'} target="_blank" rel="noopener noreferrer"
                                          className="absolute bottom-1.5 right-1.5 text-[9px] bg-black/40 text-white px-1.5 py-0.5 rounded-full hover:bg-black/60 transition"
                                          onClick={(e) => e.stopPropagation()}>{xr._plannerPhoto.photographer}</a>
                                      )}
                                    </div>
                                  )}
                                  <div className="px-4 py-3 space-y-2">
                                    {xr._plannerReason && <p className="font-display italic text-orange-600 text-xs leading-snug">— {xr._plannerReason}</p>}
                                    {((xr._plannerUsesPantry || []).length > 0 || xr._plannerLeftoverFor) && (
                                      <div className="flex flex-wrap gap-1">
                                        {xr._plannerLeftoverFor && <span className="text-[10px] bg-amber-100 text-orange-700 px-1.5 py-0.5 rounded-full font-semibold">→ {xr._plannerLeftoverFor}</span>}
                                        {(xr._plannerUsesPantry || []).map((pi) => <span key={pi} className="text-[10px] bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded-full border border-orange-100"><span className="font-display italic">from pantry</span> · {pi}</span>)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              <SelectedRecipeCard recipe={xr} expanded={true} onToggleExpand={() => {}} onToggleCooked={toggleCookedRecipe} isCooked={xIsCooked}
                                customIngredients={customIngredients} onAddCustom={addCustomIngredient} onRemoveCustom={removeCustomIngredient} onRemove={toggleSelectedRecipe}
                                newIngredientInput={newIngredientInput} onInputChange={(id, val) => setNewIngredientInput((p) => ({ ...p, [id]: val }))}
                                preferences={preferences} starredRecipes={starredRecipes} onAcceptSubstitution={acceptSubstitution}
                                onGenerateRecipe={generateAndSaveRecipe} onShareRecipe={shareRecipe} rating={recipeRatings[xrid] || null} inlineExpanded />
                            </div>
                          )}
                        </div>
                      );
                    };

                    return (
                      <div key={day} className={`rounded-2xl border-2 overflow-hidden transition-all ${
                        isNotAtHome ? 'border-dashed border-orange-100 bg-orange-50/30' :
                        isCooked ? 'border-sage-200 bg-sage-100/40' :
                        recipe ? 'border-orange-100 bg-white' :
                        'border-dashed border-orange-100 bg-white/50'
                      }`}>

                        {/* ── Breakfast slot — always show if planned ── */}
                        {hasBreakfast && extraItems.filter((i) => i.recipe_data._mealType === 'breakfast').map(renderExtraRow)}

                        {/* ── Lunch slot — always show if planned ──────── */}
                        {hasLunch && extraItems.filter((i) => i.recipe_data._mealType === 'lunch').map(renderExtraRow)}

                        {/* ── Other extras (snacks etc.) ───────────────── */}
                        {extraItems.filter((i) => !['breakfast','lunch'].includes(i.recipe_data._mealType)).map(renderExtraRow)}

                        {/* ── Dinner slot (primary) ─────────────────── */}
                        <div>
                          <div className="flex items-center gap-3 px-4 py-3.5 cursor-pointer"
                            onClick={() => !isNotAtHome && recipe && toggleDayMeal(rid)}>
                            <div className="w-16 flex-shrink-0">
                              <p className={`text-xs font-bold uppercase tracking-wider ${isToday ? 'text-orange-600' : 'text-orange-400'}`}>{day.slice(0, 3)}</p>
                              <p className={`text-[10px] font-medium text-orange-400 ${isToday ? '' : 'invisible'}`}>today</p>
                            </div>
                            {isNotAtHome ? (
                              <>
                                <p className="flex-1 text-sm text-orange-300 italic">Not at home</p>
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleNotAtHome(day); }}
                                  className="text-xs text-orange-400 hover:text-orange-600 transition px-2 py-1 rounded-full border border-dashed border-orange-200 hover:border-orange-400">
                                  Undo
                                </button>
                              </>
                            ) : recipe ? (
                              <>
                                {recipe._plannerPhoto?.url && (
                                  <img src={recipe._plannerPhoto.thumbnail || recipe._plannerPhoto.url} alt={recipe._plannerPhoto.alt || recipe.name}
                                    loading="lazy" className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className={`font-semibold text-sm leading-snug ${isCooked ? 'line-through text-orange-400' : 'text-orange-900'}`}>{recipe.name}</p>
                                  <p className="text-xs text-orange-400 mt-0.5">
                                    {[(recipe.prepTime||0)+(recipe.cookTime||0) > 0 ? `${(recipe.prepTime||0)+(recipe.cookTime||0)} min` : null,
                                      recipe.servings ? `${recipe.servings} servings` : null,
                                      (recipe._aiSuggestion || recipe._quickEntry) && (!recipe.ingredients || !recipe.ingredients.length) ? '· tap to fill in' : null,
                                    ].filter(Boolean).join(' · ')}
                                  </p>
                                  {recipe._plannerLeftoverFor && (
                                    <span className="inline-block mt-1 text-[10px] bg-amber-100 text-orange-700 px-1.5 py-0.5 rounded-full font-semibold">→ {recipe._plannerLeftoverFor}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {isCooked && <Check size={14} className="text-sage-500" />}
                                  {expandedRecipes[rid] ? <ChevronUp size={16} className="text-orange-400" /> : <ChevronDown size={16} className="text-orange-400" />}
                                </div>
                              </>
                            ) : quickEntryDay === day ? (
                              // ── Quick free-text entry mode ──────────
                              <div className="flex-1 flex items-center gap-2 mr-2" onClick={(e) => e.stopPropagation()}>
                                <input
                                  autoFocus
                                  type="text"
                                  placeholder="What are you making?"
                                  value={quickEntryValue}
                                  onChange={(e) => setQuickEntryValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') submitQuickEntry(day);
                                    if (e.key === 'Escape') { setQuickEntryDay(null); setQuickEntryValue(''); }
                                  }}
                                  className="flex-1 min-w-0 text-sm border-b border-orange-300 bg-transparent focus:outline-none focus:border-orange-500 text-orange-900 placeholder-orange-300 py-0.5"
                                />
                                <button onClick={() => submitQuickEntry(day)}
                                  className="flex-shrink-0 text-xs px-3 py-1 bg-orange-500 text-white rounded-full hover:bg-orange-600 transition disabled:opacity-50"
                                  disabled={!quickEntryValue.trim()}>
                                  Save
                                </button>
                                <button onClick={() => { setQuickEntryDay(null); setQuickEntryValue(''); }}
                                  className="flex-shrink-0 text-orange-400 hover:text-orange-600 transition p-1">
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <>
                                <p className="flex-1 text-sm text-orange-400 italic">Free evening</p>
                                <div className="flex items-center gap-1.5">
                                  <button onClick={(e) => { e.stopPropagation(); setQuickEntryDay(day); setQuickEntryValue(''); }}
                                    className="text-xs px-3 py-1 border border-orange-200 text-orange-400 rounded-full hover:border-orange-400 hover:text-orange-600 transition">Write it in</button>
                                  <button onClick={(e) => { e.stopPropagation(); toggleSelectedRecipe({ id: `leftovers-${day}`, name: 'Leftovers', source: 'My Recipes', overview: 'Using up leftovers from earlier in the week.', _plannedDay: day, _isLeftovers: true, servings: 2, ingredients: [], steps: [], keywords: ['leftovers'], macros: {} }); }}
                                    className="text-xs px-3 py-1 border border-dashed border-orange-200 text-orange-400 rounded-full hover:border-orange-400 hover:text-orange-600 transition">Leftovers</button>
                                  <button onClick={(e) => { e.stopPropagation(); setSearchTargetDay(day); setTimeout(() => searchInputRef.current?.focus(), 0); }}
                                    className="text-xs px-3 py-1 border border-dashed border-orange-200 text-orange-400 rounded-full hover:border-orange-400 hover:text-orange-600 transition">+ Search</button>
                                  <button onClick={(e) => { e.stopPropagation(); toggleNotAtHome(day); }}
                                    className="text-xs px-3 py-1 border border-dashed border-orange-200 text-orange-400 rounded-full hover:border-orange-400 hover:text-orange-600 transition">Away</button>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Side dish + meal add buttons + away toggle */}
                          {!isNotAtHome && recipe && (
                            <div className="px-4 pb-2 -mt-1 flex items-center flex-wrap gap-1.5">
                              {recipe._sideDish ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs bg-orange-50 text-orange-600 border border-orange-200 rounded-full px-2.5 py-1 font-medium">+ {recipe._sideDish.name}</span>
                                  <button onClick={(e) => { e.stopPropagation(); saveSideDish(rid, null); }}
                                    className="text-orange-400 hover:text-orange-600 transition text-xs" title="Remove side dish">×</button>
                                </div>
                              ) : (
                                <button onClick={(e) => { e.stopPropagation(); const p = { key: `${day}-side`, mainRecipe: recipe, rid, input: '', loading: true, suggestions: [], error: '' }; setSideDishPanel(p); fetchSideSuggestions(p.key, recipe, ''); }}
                                  className="text-xs text-orange-400 hover:text-orange-600 transition border border-dashed border-orange-200 rounded-full px-3 py-1 hover:border-orange-400">+ Add a side</button>
                              )}
                              {!hasBreakfast && (
                                <button onClick={(e) => { e.stopPropagation(); addExtraMeal(day, 'breakfast', ''); }}
                                  disabled={generatingExtra === `${day}-breakfast`}
                                  className="text-xs text-orange-300 hover:text-orange-600 transition border border-dashed border-orange-100 hover:border-orange-300 rounded-full px-2.5 py-1 disabled:opacity-50">
                                  {generatingExtra === `${day}-breakfast` ? 'Adding…' : '+ Breakfast'}
                                </button>
                              )}
                              {!hasLunch && (
                                <button onClick={(e) => { e.stopPropagation(); addExtraMeal(day, 'lunch', ''); }}
                                  disabled={generatingExtra === `${day}-lunch`}
                                  className="text-xs text-orange-300 hover:text-orange-600 transition border border-dashed border-orange-100 hover:border-orange-300 rounded-full px-2.5 py-1 disabled:opacity-50">
                                  {generatingExtra === `${day}-lunch` ? 'Adding…' : '+ Lunch'}
                                </button>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); toggleNotAtHome(day); }}
                                className="text-xs text-orange-300 hover:text-orange-600 transition border border-dashed border-orange-100 hover:border-orange-300 rounded-full px-2.5 py-1">Away</button>
                            </div>
                          )}

                          {/* Expanded dinner recipe */}
                          {!isNotAtHome && recipe && expandedRecipes[rid] && (
                            <div className="border-t border-orange-100">
                              {(recipe._plannerPhoto?.url || recipe._plannerReason || recipe._plannerLeftoverFor || (recipe._plannerUsesPantry || []).length > 0) && (
                                <div className="bg-orange-50/50 border-b border-orange-100">
                                  {recipe._plannerPhoto?.url && (
                                    <div className="relative h-40 w-full bg-orange-100 overflow-hidden">
                                      <img src={recipe._plannerPhoto.url} alt={recipe._plannerPhoto.alt || recipe.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                                      {recipe._plannerPhoto.photographer && (
                                        <a href={recipe._plannerPhoto.photographer_url || 'https://www.pexels.com'} target="_blank" rel="noopener noreferrer"
                                          className="absolute bottom-1.5 right-1.5 text-[9px] bg-black/40 text-white px-1.5 py-0.5 rounded-full hover:bg-black/60 transition"
                                          onClick={(e) => e.stopPropagation()}>{recipe._plannerPhoto.photographer}</a>
                                      )}
                                    </div>
                                  )}
                                  <div className="px-4 py-3 space-y-2">
                                    {recipe._plannerReason && <p className="font-display italic text-orange-600 text-xs leading-snug">— {recipe._plannerReason}</p>}
                                    {((recipe._plannerUsesPantry || []).length > 0 || recipe._plannerLeftoverFor) && (
                                      <div className="flex flex-wrap gap-1">
                                        {recipe._plannerLeftoverFor && <span className="text-[10px] bg-amber-100 text-orange-700 px-1.5 py-0.5 rounded-full font-semibold">→ {recipe._plannerLeftoverFor}</span>}
                                        {(recipe._plannerUsesPantry || []).map((item) => <span key={item} className="text-[10px] bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded-full border border-orange-100"><span className="font-display italic">from pantry</span> · {item}</span>)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              <SelectedRecipeCard recipe={recipe} expanded={true} onToggleExpand={() => {}} onToggleCooked={toggleCookedRecipe} isCooked={isCooked}
                                customIngredients={customIngredients} onAddCustom={addCustomIngredient} onRemoveCustom={removeCustomIngredient} onRemove={toggleSelectedRecipe}
                                newIngredientInput={newIngredientInput} onInputChange={(id, val) => setNewIngredientInput((p) => ({ ...p, [id]: val }))}
                                preferences={preferences} starredRecipes={starredRecipes} onAcceptSubstitution={acceptSubstitution}
                                onGenerateRecipe={generateAndSaveRecipe} onShareRecipe={shareRecipe} rating={recipeRatings[rid] || null} inlineExpanded />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Unscheduled recipes (added from search without a day) */}
                {viewItems.filter((i) => {
                  const pd = i.recipe_data?._plannedDay;
                  if (!pd) return true;
                  const matches = DAYS.some((d) => String(pd).toLowerCase().startsWith(d.toLowerCase().slice(0, 3)));
                  return !matches;
                }).length > 0 && (
                  <div className="mt-6">
                    <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide mb-3">Not assigned to a day</p>
                    <div className="space-y-3">
                      {viewItems.filter((i) => {
                        const pd = i.recipe_data?._plannedDay;
                        if (!pd) return true;
                        const matches = DAYS.some((d) => String(pd).toLowerCase().startsWith(d.toLowerCase().slice(0, 3)));
                        return !matches;
                      }).map((item) => {
                        const recipe = item.recipe_data;
                        const rid = String(recipe.id);
                        return (
                          <SelectedRecipeCard
                            key={rid}
                            recipe={recipe}
                            expanded={!!expandedRecipes[rid]}
                            onToggleExpand={(id) => setExpandedRecipes((p) => ({ ...p, [id]: !p[id] }))}
                            onToggleCooked={toggleCookedRecipe}
                            isCooked={!!cookedRecipes[rid]}
                            customIngredients={customIngredients}
                            onAddCustom={addCustomIngredient}
                            onRemoveCustom={removeCustomIngredient}
                            onRemove={toggleSelectedRecipe}
                            newIngredientInput={newIngredientInput}
                            onInputChange={(id, val) => setNewIngredientInput((p) => ({ ...p, [id]: val }))}
                            preferences={preferences}
                            starredRecipes={starredRecipes}
                            onAcceptSubstitution={acceptSubstitution}
                            onGenerateRecipe={generateAndSaveRecipe}
                            rating={recipeRatings[rid] || null}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Saved templates */}
                {viewItems.length > 0 && <div className="mt-6 mb-2">
                  <button onClick={() => setShowTemplates((v) => !v)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-orange-400 hover:text-orange-600 transition">
                    <Calendar size={13} />
                    {showTemplates ? 'Hide saved weeks' : 'Saved week templates'}
                    {showTemplates ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  {showTemplates && (
                    <div className="mt-2 bg-white rounded-2xl border border-orange-100 p-4 space-y-3">
                      {templates.length > 0 && (
                        <div className="space-y-2">
                          {templates.map((t) => (
                            <div key={t.id} className="flex items-center justify-between bg-orange-50 rounded-xl px-3 py-2.5">
                              <div>
                                <p className="text-sm font-semibold text-orange-900">{t.name}</p>
                                <p className="text-xs text-orange-400">{t.recipes.length} recipe{t.recipes.length !== 1 ? 's' : ''}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button onClick={() => loadTemplate(t)}
                                  className="text-xs px-3 py-1.5 bg-orange-500 text-white rounded-full font-medium hover:bg-orange-600 transition">
                                  Load
                                </button>
                                <button onClick={() => deleteTemplate(t.id)} className="text-orange-400 hover:text-red-400 transition">
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {viewRecipeObjects.length > 0 && (
                        <div className="flex gap-2 pt-1">
                          <input type="text" placeholder="Name this week…"
                            value={templateName} onChange={(e) => setTemplateName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveTemplate()}
                            className="flex-1 border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-400 placeholder-orange-300"
                          />
                          <button onClick={saveTemplate} disabled={!templateName.trim()}
                            className="flex-shrink-0 px-4 py-2 bg-orange-500 text-white rounded-full text-sm font-medium hover:bg-orange-600 transition disabled:opacity-50">
                            Save
                          </button>
                        </div>
                      )}
                      {templates.length === 0 && viewRecipeObjects.length === 0 && (
                        <p className="text-xs text-orange-400">Plan a week first, then save it here to reuse.</p>
                      )}
                    </div>
                  )}
                </div>}
              </>
            ) : viewWeek !== currentWeekStart ? (
              /* ── Empty state for past/future weeks ── */
              <div className="py-10 text-center">
                <Calendar size={36} className="mx-auto mb-3 text-orange-200" />
                <p className="font-semibold text-orange-900 mb-1">
                  {viewWeek < currentWeekStart ? 'No meals recorded for this week' : 'No plan yet for this week'}
                </p>
                <p className="text-sm text-orange-400 mb-5">
                  {viewWeek < currentWeekStart
                    ? 'Past plans you save in the future will appear here.'
                    : 'Generate a plan and it will be saved here.'}
                </p>
                <button onClick={() => setShowWeekSuggest(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-full text-sm font-semibold hover:bg-orange-600 transition shadow-warm">
                  <Sparkles size={14} />
                  Plan this week
                </button>
              </div>
            ) : (
              /* ── Empty state for current week ── */
              <div className="py-6">
                <p className="font-display italic text-orange-600/80 text-xs tracking-wide mb-2">— no plan yet</p>
                <h3 className="font-display text-[2rem] sm:text-4xl font-semibold text-orange-900 leading-[0.95] mb-6 tracking-tight">
                  Start your{' '}
                  <span className="relative inline-block italic font-normal text-orange-600">
                    first
                    <Scribble className="absolute left-0 -bottom-2 w-full text-orange-600/70 pointer-events-none" aria-hidden="true" />
                  </span>{' '}
                  week.
                </h3>
                <ol className="space-y-6">
                  <li>
                    <button onClick={() => setShowWeekSuggest(true)}
                      className="group grid grid-cols-[auto_1fr_auto] gap-4 sm:gap-5 items-start w-full text-left py-2 pr-2 rounded-2xl hover:bg-orange-50/60 transition">
                      <span className="font-display italic text-4xl sm:text-5xl text-orange-400 group-hover:text-orange-600 leading-none pt-1 select-none transition-colors">01</span>
                      <span className="pt-1">
                        {/* TODO: replace "Let AI plan the week" with app-name-driven copy */}
                        <span className="block font-display text-lg sm:text-xl font-semibold text-orange-900 mb-0.5">Let AI plan the week</span>
                        <span className="block text-sm text-orange-900/80 leading-relaxed max-w-md">Seven dinners picked to your household's taste. Swap anything you don't fancy.</span>
                      </span>
                      <span className="text-orange-400 group-hover:text-orange-600 transition-colors pt-2 pl-1"><GlyphPot /></span>
                    </button>
                  </li>
                  <li>
                    <button onClick={() => setTimeout(() => searchInputRef.current?.focus(), 0)}
                      className="group grid grid-cols-[auto_1fr_auto] gap-4 sm:gap-5 items-start w-full text-left py-2 pr-2 rounded-2xl hover:bg-orange-50/60 transition">
                      <span className="font-display italic text-4xl sm:text-5xl text-orange-400 group-hover:text-orange-600 leading-none pt-1 select-none transition-colors">02</span>
                      <span className="pt-1">
                        <span className="block font-display text-lg sm:text-xl font-semibold text-orange-900 mb-0.5">Search and star</span>
                        <span className="block text-sm text-orange-900/80 leading-relaxed max-w-md">Search recipes and star your favourites for the planner to use.</span>
                      </span>
                      <span className="text-orange-400 group-hover:text-orange-600 transition-colors pt-2 pl-1"><GlyphSpyglass /></span>
                    </button>
                  </li>
                  <li>
                    <button onClick={() => { setTimeout(() => document.querySelector('input[type=url]')?.focus(), 0); }}
                      className="group grid grid-cols-[auto_1fr_auto] gap-4 sm:gap-5 items-start w-full text-left py-2 pr-2 rounded-2xl hover:bg-orange-50/60 transition">
                      <span className="font-display italic text-4xl sm:text-5xl text-orange-400 group-hover:text-orange-600 leading-none pt-1 select-none transition-colors">03</span>
                      <span className="pt-1">
                        <span className="block font-display text-lg sm:text-xl font-semibold text-orange-900 mb-0.5">Import a recipe you love</span>
                        <span className="block text-sm text-orange-900/80 leading-relaxed max-w-md">Paste any recipe URL and we'll pull the ingredients automatically.</span>
                      </span>
                      <span className="text-orange-400 group-hover:text-orange-600 transition-colors pt-2 pl-1"><GlyphLink /></span>
                    </button>
                  </li>
                  <li>
                    <button onClick={() => setShowBagModal(true)}
                      className="group grid grid-cols-[auto_1fr_auto] gap-4 sm:gap-5 items-start w-full text-left py-2 pr-2 rounded-2xl hover:bg-orange-50/60 transition">
                      <span className="font-display italic text-4xl sm:text-5xl text-orange-400 group-hover:text-orange-600 leading-none pt-1 select-none transition-colors">04</span>
                      <span className="pt-1">
                        <span className="block font-display text-lg sm:text-xl font-semibold text-orange-900 mb-0.5">Cook from what you've got</span>
                        <span className="block text-sm text-orange-900/80 leading-relaxed max-w-md">Too Good To Go bag, fridge bits, market find — describe what you've got and we'll find something to cook.</span>
                      </span>
                      <span className="text-orange-400 group-hover:text-orange-600 transition-colors pt-2 pl-1"><GlyphBasket /></span>
                    </button>
                  </li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* ── BASKET TAB (shopping + pantry) ── */}
        {activeTab === "basket" && (
          <div>
            {/* Segmented toggle */}
            <div className="flex gap-1 p-1 bg-orange-50 rounded-2xl mb-4">
              {["shopping", "pantry"].map((section) => (
                <button key={section} onClick={() => setBasketSection(section)}
                  className={`flex-1 py-2 text-sm font-medium rounded-xl transition ${basketSection === section ? "bg-white text-orange-900 shadow-warm" : "text-orange-400 hover:text-orange-600"}`}>
                  {section.charAt(0).toUpperCase() + section.slice(1)}
                </button>
              ))}
            </div>

            {basketSection === "shopping" && (
              <>
            {shoppingList.length > 0 ? (
              <>
                <div className="bg-white rounded-2xl border border-orange-100 p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <ShoppingCart size={16} className="text-orange-600" />
                      <span className="text-sm font-semibold text-orange-900">{shoppingList.length} items</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-orange-600">{checkedCount}/{shoppingList.length} checked</span>
                      {checkedCount > 0 && (
                        <button onClick={clearCheckedItems} className="text-xs text-orange-400 hover:text-orange-600 transition">Clear</button>
                      )}
                    </div>
                  </div>
                  <div className="w-full bg-orange-100 rounded-full h-2">
                    <div className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${shoppingList.length ? (checkedCount / shoppingList.length) * 100 : 0}%` }} />
                  </div>
                  {checkedCount === shoppingList.length && shoppingList.length > 0 && (
                    <p className="text-center text-sm text-sage-600 font-semibold mt-2">All done! Happy cooking!</p>
                  )}
                  {shoppingList.filter((i) => !i.inPantry && !checkedItems[i.name]).length > 0 && (
                    <button
                      onClick={() => setShowGrocerHandoff(true)}
                      className="w-full mt-3 py-2.5 bg-orange-900 text-white rounded-full font-semibold text-sm hover:bg-orange-800 transition flex items-center justify-center gap-2"
                    >
                      <ShoppingBag size={14} />
                      Send to AH, Jumbo or Picnic
                    </button>
                  )}
                  {!wasteInsights ? (
                    <button
                      onClick={fetchWasteInsights}
                      className="w-full mt-2 py-2 border border-dashed border-orange-200 text-orange-400 rounded-full text-sm hover:border-orange-400 hover:text-orange-600 transition flex items-center justify-center gap-1.5"
                    >
                      Reduce waste tips
                    </button>
                  ) : wasteInsights.loading ? (
                    <div className="flex items-center justify-center gap-2 mt-2 py-2 text-xs text-orange-400">
                      <div className="w-3.5 h-3.5 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                      Checking your list for waste…
                    </div>
                  ) : null}
                </div>

                {/* Waste insights panel */}
                {wasteInsights && !wasteInsights.loading && (
                  <div className="bg-sage-100/50 border border-sage-200 rounded-2xl p-4 mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-sage-600 uppercase tracking-wide">Waste reduction</p>
                      <button onClick={() => setWasteInsights(null)} className="text-sage-400 hover:text-sage-600 transition"><X size={14} /></button>
                    </div>
                    {wasteInsights.error ? (
                      <p className="text-xs text-red-500">{wasteInsights.error}</p>
                    ) : wasteInsights.insights.length === 0 ? (
                      <p className="text-xs text-sage-600">Looks great — no obvious waste for this week's plan!</p>
                    ) : (
                      <div className="space-y-3">
                        {wasteInsights.insights.map((ins, i) => (
                          <div key={i} className="flex gap-2.5">
                            <span className="text-sage-400 font-bold text-base leading-none mt-0.5 flex-shrink-0">–</span>
                            <div>
                              <p className="text-sm font-semibold text-sage-600 capitalize">{ins.ingredient}</p>
                              <p className="text-xs text-sage-600 mt-0.5 leading-relaxed">{ins.tip}</p>
                              {ins.suggestion && (
                                <p className="text-[11px] font-medium text-sage-500 mt-1 italic">→ {ins.suggestion}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-white rounded-2xl border border-orange-100 divide-y divide-orange-50 overflow-hidden">
                  {[...shoppingList]
                    .sort((a, b) => {
                      const ac = checkedItems[a.name] ? 1 : 0;
                      const bc = checkedItems[b.name] ? 1 : 0;
                      return ac - bc || a.name.localeCompare(b.name);
                    })
                    .map((item) => {
                      const checked = !!checkedItems[item.name];
                      return (
                        <button key={item.name} onClick={() => !item.inPantry && toggleItem(item.name)}
                          className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition active:bg-orange-100 ${item.inPantry ? "opacity-50 cursor-default" : "hover:bg-orange-50"}`}>
                          <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                            item.inPantry ? "bg-orange-100 border-orange-200" : checked ? "bg-sage-500 border-sage-500 text-white" : item.isCustom ? "border-amber-300" : "border-orange-300"}`}>
                            {(checked || item.inPantry) && <Check size={13} className={item.inPantry ? "text-orange-400" : ""} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className={`text-sm font-medium transition-all ${checked || item.inPantry ? "line-through text-orange-400" : "text-orange-900"}`}>
                              {item.name}
                              {item.isCustom && <span className="ml-1.5 text-xs text-orange-600 font-normal">custom</span>}
                              {item.inPantry && <span className="ml-1.5 text-xs text-orange-400 font-normal">in pantry</span>}
                            </span>
                          </div>
                          {item.amount && (
                            <span className={`text-xs flex-shrink-0 ${checked ? "text-orange-400" : "text-orange-600"}`}>{item.amount}</span>
                          )}
                        </button>
                      );
                    })}
                </div>
              </>
            ) : (
              <div className="text-center py-16 text-orange-400">
                <ShoppingCart size={48} className="mx-auto mb-3 opacity-50" />
                <p className="font-medium text-orange-400">Your shopping list is empty</p>
                <p className="text-sm mt-1">Select recipes to build your list</p>
                <button onClick={() => setActiveTab("week")}
                  className="mt-4 px-5 py-2.5 bg-orange-500 text-white rounded-full text-sm font-medium hover:bg-orange-600 transition">
                  Find Recipes
                </button>
              </div>
            )}
              </>
            )}

            {basketSection === "pantry" && (
              <div>
                <div className="bg-white rounded-2xl border border-orange-100 p-4 mb-4">
                  <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide mb-3">What's already at home</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. 500g pasta, olive oil…"
                      value={pantryInput}
                      onChange={(e) => setPantryInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addPantryItem()}
                      className="flex-1 border border-orange-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-400 placeholder-orange-300"
                    />
                    <button onClick={addPantryItem} disabled={!pantryInput.trim()}
                      className="flex-shrink-0 px-4 py-2.5 bg-orange-500 text-white rounded-full text-sm font-medium hover:bg-orange-600 transition disabled:opacity-50">
                      Add
                    </button>
                  </div>
                  <p className="text-xs text-orange-400 mt-2">Items here are skipped (greyed out) in your shopping list.</p>
                  {pantryNudge && (
                    <div className="mt-3 p-3 bg-orange-50 rounded-xl border border-orange-200">
                      {pantryNudge.loading ? (
                        <p className="text-xs text-orange-400 flex items-center gap-2">
                          <span className="inline-block w-3 h-3 border-2 border-orange-300 border-t-orange-500 rounded-full animate-spin" />
                          Checking ingredient…
                        </p>
                      ) : (
                        <>
                          <p className="text-xs font-medium text-orange-700 mb-2">Which type of <em>{pantryNudge.original}</em>?</p>
                          <div className="flex flex-wrap gap-1.5">
                            {pantryNudge.suggestions.map((s) => (
                              <button key={s} onClick={() => confirmPantryNudge(s)}
                                className="text-xs px-3 py-1 bg-white border border-orange-300 text-orange-700 rounded-full hover:bg-orange-100 transition capitalize">
                                {s}
                              </button>
                            ))}
                            <button onClick={() => confirmPantryNudge(pantryNudge.original)}
                              className="text-xs px-3 py-1 border border-dashed border-orange-200 text-orange-400 rounded-full hover:border-orange-400 transition">
                              Keep "{pantryNudge.original}"
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {pantryItems.length > 0 ? (
                  <div className="bg-white rounded-2xl border border-orange-100 divide-y divide-orange-50 overflow-hidden">
                    {pantryItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <span className="text-sm font-medium text-orange-900">{item.name}</span>
                          {item.amount && <span className="text-xs text-orange-400 ml-2">{item.amount}</span>}
                        </div>
                        <button onClick={() => removePantryItem(item.id)}
                          className="text-orange-400 hover:text-red-400 transition ml-3">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16 text-orange-400">
                    <Package size={48} className="mx-auto mb-3 opacity-50" />
                    <p className="font-medium text-orange-400">Your pantry is empty</p>
                    <p className="text-sm mt-1">Add ingredients you already have at home</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── PROFILE TAB ── */}
        {activeTab === "profile" && (
          <div className="space-y-4 pb-4">
            {/* User card */}
            <div className="bg-white rounded-2xl border border-orange-100 p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                  <span className="font-display text-xl font-bold text-orange-600">
                    {(memberProfile?.display_name || user?.email || '?')[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-orange-900 leading-snug">{memberProfile?.display_name || 'You'}</p>
                  <p className="text-xs text-orange-400 truncate">{user?.email}</p>
                  {(() => {
                    const isGifted = !!preferences?.is_gifted;
                    const hasPuter = !!preferences?.puter_token_hint;
                    const hasGemini = !!preferences?.gemini_api_key_hint;
                    let label, labelClass, upgradeText;
                    if (isGifted) {
                      label = 'Gifted — unlimited AI';
                      labelClass = 'text-orange-700 bg-amber-50';
                    } else if (hasPuter) {
                      label = 'Puter AI — unlimited';
                      labelClass = 'text-orange-600 bg-orange-50';
                    } else if (hasGemini) {
                      label = 'Gemini key connected';
                      labelClass = 'text-orange-600 bg-orange-50';
                      upgradeText = 'Connect Puter for unlimited';
                    } else {
                      label = 'Free plan';
                      labelClass = 'text-orange-400 bg-orange-50';
                      upgradeText = 'Upgrade for more';
                    }
                    return (
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${labelClass}`}>{label}</span>
                        {upgradeText && (
                          <button
                            onClick={() => setShowSettings(true)}
                            className="text-[11px] font-semibold text-orange-600 hover:text-orange-900 transition underline underline-offset-2"
                          >
                            {upgradeText} →
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <button onClick={() => setShowSettings((v) => !v)}
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition ${showSettings ? 'bg-orange-100 text-orange-600' : 'text-orange-400 hover:bg-orange-50 hover:text-orange-600'}`}
                  title="Settings">
                  <Settings size={15} />
                </button>
                <ThemeToggle />
                <button onClick={() => supabase.auth.signOut()}
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-orange-400 hover:bg-orange-50 hover:text-orange-600 transition"
                  title="Sign out">
                  <LogOut size={15} />
                </button>
              </div>
            </div>

            {/* Household switcher — only renders when user has 2+ households */}
            <HouseholdSwitcher
              memberships={memberships}
              activeId={household?.id}
              onSwitch={switchHousehold}
            />

            {/* Settings overlay — covers the profile tab when open */}
            {showSettings && (
              <div className="fixed inset-0 z-40 bg-white overflow-y-auto pb-24">
                <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
                  {/* Keep user card visible at top */}
                  <div className="bg-white rounded-2xl border border-orange-100 p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                        <span className="font-display text-xl font-bold text-orange-600">
                          {(memberProfile?.display_name || user?.email || '?')[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-orange-900 leading-snug">{memberProfile?.display_name || 'You'}</p>
                        <p className="text-xs text-orange-400 truncate">{user?.email}</p>
                      </div>
                      <button onClick={() => setShowSettings(false)}
                        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-orange-100 text-orange-600 hover:bg-orange-200 transition"
                        title="Close settings">
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                  <PreferencesModal household={household} section="settings" inline={true} initialPrefs={preferences} onPrefsChange={(p) => setPreferences((prev) => ({ ...prev, ...p }))} onClose={() => { loadPreferences(); setShowSettings(false); }} />
                </div>
              </div>
            )}

            {/* Notifications */}
            <div className="bg-white rounded-2xl border border-orange-100 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-orange-50">
                <span className="text-sm font-semibold text-orange-900">Notifications</span>
                {notifUnread > 0 && (
                  <button onClick={markAllNotifsRead}
                    className="text-xs text-orange-600 hover:text-orange-900 font-medium flex items-center gap-1 transition">
                    <Check size={11} /> Mark all read
                  </button>
                )}
              </div>
              {notifications.length === 0 ? (
                <div className="text-center py-6 text-orange-400">
                  <Bell size={24} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No activity yet</p>
                  <p className="text-xs mt-0.5 text-orange-400/70">Changes your partner makes will appear here</p>
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto">
                  {notifications.map((n) => (
                    <div key={n.id}
                      className={`flex items-start gap-2 px-4 py-3 border-b border-orange-50 last:border-0 ${n.read ? '' : 'bg-orange-50/60'}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-orange-900 leading-snug">{n.message}</p>
                        <p className="text-xs text-orange-400 mt-0.5">{formatNotifTime(n.timestamp)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                        {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
                        <button onClick={() => dismissNotif(n.id)} className="text-orange-400 hover:text-orange-600 transition">
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Household card */}
            <div className="bg-white rounded-2xl border border-orange-100 p-4">
              <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide mb-3">Household</p>
              {editingHouseholdName ? (
                <div className="flex gap-2 mb-3">
                  <input
                    autoFocus
                    value={householdNameDraft}
                    onChange={(e) => setHouseholdNameDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveHouseholdName(); if (e.key === 'Escape') setEditingHouseholdName(false); }}
                    className="flex-1 text-sm border border-orange-300 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-300/50 text-orange-900"
                  />
                  <button onClick={saveHouseholdName} className="px-3 py-1.5 bg-orange-500 text-white rounded-full text-xs font-medium hover:bg-orange-600 transition">Save</button>
                  <button onClick={() => setEditingHouseholdName(false)} className="px-3 py-1.5 text-orange-400 hover:text-orange-600 transition text-xs">Cancel</button>
                </div>
              ) : (
                <button
                  onClick={() => { setHouseholdNameDraft(household.name); setEditingHouseholdName(true); }}
                  className="flex items-center gap-1.5 mb-3 group"
                >
                  <span className="text-sm font-semibold text-orange-900">{household.name}</span>
                  <PenLine size={12} className="text-orange-400 opacity-0 group-hover:opacity-100 transition" />
                </button>
              )}
              {householdMembers.length > 0 && (
                <div className="space-y-2 mb-4">
                  {householdMembers.map((m, i) => {
                    const isSelf = m.user_id === user?.id;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-orange-600">{(m.display_name || '?')[0].toUpperCase()}</span>
                        </div>
                        <span className="text-sm text-orange-900 flex-1">{m.display_name || 'Member'}{isSelf && ' (you)'}</span>
                        {!isSelf && householdMembers.length > 1 && (
                          <button
                            onClick={() => removeMember(m.user_id, m.display_name)}
                            className="text-xs text-orange-400 hover:text-red-500 transition"
                            title="Remove from household"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {householdMembers.length > 1 && (
                    <button
                      onClick={leaveHousehold}
                      className="w-full mt-2 text-xs text-orange-400 hover:text-red-500 transition flex items-center justify-center gap-1 py-1.5"
                    >
                      Leave this household
                    </button>
                  )}
                </div>
              )}
              <div className="border-t border-orange-50 pt-3 space-y-2">
                <div className="flex gap-2">
                  <input readOnly value={inviteUrl}
                    className="flex-1 text-xs border border-orange-200 rounded-xl px-2 py-2 bg-orange-50 text-orange-900 truncate" />
                  <button onClick={shareInviteLink}
                    className="flex-shrink-0 px-3 py-2 bg-orange-500 text-white rounded-full text-xs font-medium hover:bg-orange-600 transition flex items-center gap-1.5">
                    <Link2 size={12} />
                    Invite
                  </button>
                </div>
                {/* Desktop share panel — shown when Web Share API isn't available */}
                {showInviteSharePanel && (
                  <div className="bg-orange-50 rounded-2xl p-3 space-y-2">
                    <p className="text-[11px] text-orange-400 font-medium uppercase tracking-wide">Share via</p>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent('Come plan meals with me — one shared list, no more "what\'s for dinner?" texts. ' + inviteUrl)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-orange-200 bg-white text-xs font-medium text-orange-900 hover:border-orange-400 transition"
                      >
                        WhatsApp
                      </a>
                      <a
                        href={`https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent('Come plan meals with me — one shared list, no more "what\'s for dinner?" texts.')}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-orange-200 bg-white text-xs font-medium text-orange-900 hover:border-orange-400 transition"
                      >
                        Telegram
                      </a>
                      <button
                        onClick={copyInviteLink}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-orange-200 bg-white text-xs font-medium text-orange-900 hover:border-orange-400 transition"
                      >
                        {inviteCopied ? <Check size={11} className="text-sage-500" /> : <Link2 size={11} />}
                        {inviteCopied ? 'Copied!' : 'Copy link'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Dietary wishes — always visible */}
            <div className="bg-white rounded-2xl border border-orange-100 p-4">
              <PreferencesModal household={household} section="dietary" inline={true} initialPrefs={preferences} onPrefsChange={(p) => setPreferences((prev) => ({ ...prev, ...p }))} onClose={loadPreferences} />
            </div>

            {/* Data export + account deletion */}
            <AccountActions />
          </div>
        )}
      </main>

      <InstallBanner />
      <UpdateToast />

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/90 backdrop-blur-md border-t border-orange-100 safe-bottom">
        <div className="max-w-2xl mx-auto flex items-stretch">
          {[
            { id: "week",    icon: Calendar,     label: "Week" },
            { id: "basket",  icon: ShoppingCart, label: "Basket",  badge: (() => { const u = shoppingList.filter((i) => !i.inPantry && !checkedItems[i.name]).length; return u > 0 ? u : null; })() },
            { id: "profile", icon: User,         label: "Profile", badge: notifUnread > 0 ? notifUnread : null },
          ].map(({ id, icon: Icon, label, badge }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 transition-all relative ${
                activeTab === id ? "text-orange-600" : "text-orange-400 hover:text-orange-400"}`}>
              {activeTab === id && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-orange-500 rounded-full" />
              )}
              <div className="relative">
                <Icon size={22} />
                {badge > 0 && (
                  <span className="absolute -top-1 -right-2 bg-orange-500 text-white text-xs font-bold min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center leading-none">
                    {badge}
                  </span>
                )}
              </div>
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
