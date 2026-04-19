import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search, ShoppingCart, ShoppingBag, Calendar, ChevronDown, ChevronUp,
  Check, Plus, X, Trash2, LogOut, Link2, Users, Settings, Sparkles, Star, Package, PenLine,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import AuthScreen from "./components/AuthScreen";
import OnboardingScreen from "./components/OnboardingScreen";
import PreferencesModal from "./components/PreferencesModal";
import WillingnessModal from "./components/WillingnessModal";
import InstallBanner from "./components/InstallBanner";
import CreateRecipeModal from "./components/CreateRecipeModal";
import StarredPanel from "./components/StarredPanel";
import WeekSuggestModal from "./components/WeekSuggestModal";
import PuterWelcomeModal from "./components/PuterWelcomeModal";
import GrocerHandoffModal from "./components/GrocerHandoffModal";
import NotificationBell from "./components/NotificationBell";
import UpdateToast from "./components/UpdateToast";
import ThemeToggle from "./components/ThemeToggle";
import { applyTheme } from "./lib/theme";
import { GlyphPot, GlyphSpyglass, GlyphLink, Scribble } from "./components/glyphs";

const SOURCE_COLORS = {
  HelloFresh:      "bg-green-100 text-green-700",
  "Marley Spoon":  "bg-purple-100 text-purple-700",
  "NYT Cooking":   "bg-red-100 text-red-700",
  Spoonacular:     "bg-blue-100 text-blue-700",
  "My Recipes":    "bg-amber-100 text-amber-700",
  "AI Suggestion": "bg-purple-100 text-purple-600",
  "Web import":    "bg-gray-100 text-gray-600",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function totalTime(r) { return (r.prepTime || 0) + (r.cookTime || 0); }

function consolidateIngredients(selectedRecipes, customIngredients) {
  const items = {};
  selectedRecipes.forEach((recipe) => {
    const rid = String(recipe.id);
    (recipe.ingredients || []).forEach(({ name, amount }) => {
      const key = name.toLowerCase().trim();
      if (items[key]) items[key].amounts.push(amount);
      else items[key] = { name, amounts: [amount] };
    });
    (customIngredients[rid] || []).forEach(({ name, amount }) => {
      const key = name.toLowerCase().trim();
      if (items[key]) items[key].amounts.push(amount || "");
      else items[key] = { name, amounts: [amount || ""], isCustom: true };
    });
  });
  return Object.values(items).map((item) => ({
    name: item.name,
    amount: item.amounts.filter(Boolean).join(" + "),
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
      <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-3">Weekly nutrition total</p>
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Calories", value: Math.round(totals.calories), unit: "" },
          { label: "Protein",  value: Math.round(totals.protein),  unit: "g" },
          { label: "Carbs",    value: Math.round(totals.carbs),    unit: "g" },
          { label: "Fat",      value: Math.round(totals.fat),      unit: "g" },
        ].map(({ label, value, unit }) => (
          <div key={label} className="bg-orange-50 rounded-lg p-2 text-center">
            <p className="text-sm font-bold text-orange-900">{value}{unit}</p>
            <p className="text-xs text-orange-500">{label}</p>
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
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SOURCE_COLORS[recipe.source] || "bg-gray-100 text-gray-600"}`}>
              {recipe.source}
            </span>
            <span className="text-xs text-orange-500">{totalTime(recipe)} min · {recipe.servings} servings</span>
          </div>
          <h3 className="font-semibold text-orange-900 text-base leading-snug">{recipe.name}</h3>
          <p className="text-sm text-orange-700 italic mt-0.5 leading-snug line-clamp-2">{recipe.overview}</p>
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
              isStarred ? "text-amber-400 bg-amber-50" : "text-orange-200 hover:text-amber-400"
            }`}
            aria-label={isStarred ? "Unstar recipe" : "Star recipe"}
          >
            <Star size={16} fill={isStarred ? "currentColor" : "none"} />
          </button>
          <button
            onClick={() => onToggleSelect(recipe)}
            className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
              isSelected ? "bg-orange-500 border-orange-500 text-white" : "border-orange-300 text-orange-300 hover:border-orange-500"
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
  rating,
}) {
  const rid = String(recipe.id);
  const customs = customIngredients[rid] || [];
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState(null);

  async function fetchSuggestions() {
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/ai/suggest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ recipe, preferences, starredRecipes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'AI request failed');
      }
      setAiResult(await res.json());
    } catch (err) {
      setAiError(err.message || 'Could not get suggestions. Try again.');
    } finally {
      setAiLoading(false);
    }
  }
  return (
    <div className={`rounded-2xl border-2 transition-all ${isCooked ? "border-green-300 bg-green-50 opacity-80" : "border-orange-100 bg-white"}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => onToggleCooked(rid)}
            className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center mt-0.5 transition-all ${isCooked ? "bg-green-500 border-green-500 text-white" : "border-gray-300"}`}
          >
            {isCooked && <Check size={12} />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SOURCE_COLORS[recipe.source] || "bg-gray-100 text-gray-600"}`}>
                {recipe.source}
              </span>
              <span className="text-xs text-orange-500">{totalTime(recipe)} min · {recipe.servings} servings</span>
            </div>
            <h3 className={`font-semibold text-base leading-snug ${isCooked ? "line-through text-gray-500" : "text-orange-900"}`}>
              {recipe.name}
            </h3>
            {rating && (
              <p className="text-xs mt-0.5">{"⭐".repeat(rating)}</p>
            )}
          </div>
          <button
            onClick={() => onToggleExpand(rid)}
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-orange-400 hover:bg-orange-50 transition"
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
        <div className="flex flex-wrap gap-1 mt-3">
          {(recipe.ingredients || []).map((ing) => (
            <span key={ing.name} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{ing.name}</span>
          ))}
          {customs.map((c) => (
            <span key={c.id} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{c.name}</span>
          ))}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-orange-100 p-4 space-y-4">
          {/* Macros */}
          <div>
            <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">Nutrition (per serving)</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Protein",   value: recipe.macros?.protein,   unit: "g" },
                { label: "Carbs",     value: recipe.macros?.carbs,     unit: "g" },
                { label: "Fat",       value: recipe.macros?.fat,       unit: "g" },
                { label: "Calories",  value: recipe.macros?.calories,  unit: "" },
              ].map(({ label, value, unit }) => (
                <div key={label} className="bg-orange-50 rounded-lg p-2 text-center">
                  <p className="text-sm font-bold text-orange-900">{value || "—"}{unit}</p>
                  <p className="text-xs text-orange-600">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Steps */}
          {(recipe.steps || []).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">Instructions</p>
              <ol className="space-y-2">
                {recipe.steps.map((step, i) => (
                  <li key={i} className="flex gap-2 text-sm text-orange-900">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-orange-200 text-orange-700 text-xs flex items-center justify-center font-semibold">{i + 1}</span>
                    <span className="leading-snug">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Custom ingredients */}
          <div>
            <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">Add Extra Ingredients</p>
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
                    <span className="text-sm text-amber-800">{c.amount ? `${c.amount} ${c.name}` : c.name}</span>
                    <button
                      onClick={() => onRemoveCustom(rid, c.id)}
                      className="text-amber-400 hover:text-red-500 transition ml-2"
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
              <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Adapt for your household</p>
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
                  <p className="text-xs text-orange-700 bg-white rounded-xl px-3 py-2 border border-orange-100">
                    This recipe already fits your household preferences.
                    {aiResult.tips && <span className="block mt-1 text-orange-500 italic">{aiResult.tips}</span>}
                  </p>
                ) : (
                  <>
                    {(aiResult.issues || []).length > 0 && (
                      <div className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2 space-y-0.5 border border-amber-100">
                        {aiResult.issues.map((issue, i) => (
                          <p key={i}>⚠ {issue}</p>
                        ))}
                      </div>
                    )}
                    {(aiResult.substitutions || []).map((sub, i) => (
                      <div key={i} className="bg-white rounded-xl border border-orange-100 px-3 py-2.5">
                        <p className="text-xs text-orange-300 line-through">{sub.original}</p>
                        <p className="text-sm font-medium text-orange-900">{sub.replacement}</p>
                        <p className="text-xs text-orange-500 mt-0.5">{sub.reason}</p>
                        <button
                          onClick={() => onAcceptSubstitution(rid, sub)}
                          className="mt-1.5 text-xs text-orange-600 font-semibold hover:text-orange-800 transition"
                        >
                          + Add as note
                        </button>
                      </div>
                    ))}
                    {aiResult.tips && (
                      <p className="text-xs text-orange-500 italic px-1">{aiResult.tips}</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

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
  // The current user's row in household_members, with display_name / prefs /
  // onboarded_at. When onboarded_at is null we render OnboardingScreen
  // instead of the main app.
  const [memberProfile, setMemberProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showSurvey, setShowSurvey] = useState(false);
  const [showCreateRecipe, setShowCreateRecipe] = useState(false);
  const [showStarred, setShowStarred] = useState(false);
  const [showWeekSuggest, setShowWeekSuggest] = useState(false);
  const [showPuterWelcome, setShowPuterWelcome] = useState(false);
  const [showGrocerHandoff, setShowGrocerHandoff] = useState(false);
  const [showReminderBanner, setShowReminderBanner] = useState(false);
  const [preferences, setPreferences] = useState({});

  // ── Search state
  const [activeTab, setActiveTab] = useState("search");
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
  const [pantryItems, setPantryItems] = useState([]);      // [{ id, name, amount }]
  const [pantryInput, setPantryInput] = useState("");
  const [templates, setTemplates] = useState([]);          // [{ id, name, recipes }]
  const [templateName, setTemplateName] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);

  // ── Local UI state
  const [expandedRecipes, setExpandedRecipes] = useState({});
  const [newIngredientInput, setNewIngredientInput] = useState({});

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

  async function loadHousehold() {
    setAuthLoading(true);
    const RLS_HINT =
      "If this is a 403, the RLS SELECT policies on household_members / households " +
      "are missing. Run supabase/migration_add_rls_select_policies.sql in the " +
      "Supabase SQL editor, then sign in again.";

    // limit(1) + maybeSingle so a duplicate-membership data bug can't
    // crash the query with PGRST116 — we just take the first one.
    const { data: member, error: memberErr } = await supabase
      .from("household_members")
      .select("household_id, display_name, personal_prefs, onboarded_at, households(*)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (memberErr) {
      console.error("[auth] household_members read failed:", memberErr, "\n" + RLS_HINT);
      await supabase.auth.signOut();
      setAuthLoading(false);
      return;
    }

    if (member?.households) {
      setHousehold(member.households);
      setMemberProfile({
        display_name:   member.display_name,
        personal_prefs: member.personal_prefs,
        onboarded_at:   member.onboarded_at,
      });
      setAuthLoading(false);
      return;
    }

    const { data: hid, error: rpcError } = await supabase.rpc("create_household_for_user", { uid: user.id });
    if (rpcError || !hid) {
      console.error("[auth] create_household_for_user failed:", rpcError);
      await supabase.auth.signOut();
      setAuthLoading(false);
      return;
    }

    const { data: h, error: hErr } = await supabase.from("households").select("*").eq("id", hid).single();
    if (hErr || !h) {
      console.error("[auth] households read after create failed:", hErr, "\n" + RLS_HINT);
      await supabase.auth.signOut();
      setAuthLoading(false);
      return;
    }
    setHousehold(h);
    // Brand-new membership — onboarded_at is null so the onboarding screen shows.
    setMemberProfile({ display_name: null, personal_prefs: null, onboarded_at: null });
    setAuthLoading(false);
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
    await supabase.from("pantry_items").insert({ household_id: household.id, name, amount });
    setPantryInput("");
  }

  async function removePantryItem(id) {
    await supabase.from("pantry_items").delete().eq("id", id);
  }

  async function loadTemplates() {
    const { data } = await supabase
      .from("plan_templates").select("id, name, recipes").eq("household_id", household.id).order("created_at");
    setTemplates(data || []);
  }

  async function saveTemplate() {
    const name = templateName.trim();
    if (!name || selectedRecipeObjects.length === 0) return;
    await supabase.from("plan_templates").insert({
      household_id: household.id,
      name,
      recipes: selectedRecipeObjects,
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
      await supabase.from("starred_recipes").delete()
        .eq("household_id", household.id).eq("recipe_id", rid);
    } else {
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

  // ── Recipe search ─────────────────────────────────────────────────────────
  async function importFromUrl() {
    const url = importUrl.trim();
    if (!url) return;
    setImportLoading(true);
    setImportError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/recipes/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      // Add directly to meal plan
      await toggleSelectedRecipe(data);
      setImportUrl("");
      setActiveTab("recipes");
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
      const params = new URLSearchParams({ q: query });
      const res = await fetch(`/api/recipes/search?${params}`);
      if (!res.ok) throw new Error("Search failed");
      setRecipes(await res.json());
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
      await supabase.from("meal_plan_items").delete().eq("id", existing.id);
    } else {
      await supabase.from("meal_plan_items").insert({
        household_id: household.id,
        recipe_id: rid,
        recipe_data: recipe,
      });
    }
  }

  async function toggleCookedRecipe(rid) {
    if (cookedRecipes[rid]) {
      await supabase.from("cooked_recipes").delete()
        .eq("household_id", household.id).eq("recipe_id", rid);
    } else {
      await supabase.from("cooked_recipes").insert({ household_id: household.id, recipe_id: rid });
      setRatingPrompt(rid);
    }
  }

  async function saveRating(rid, stars) {
    setRatingPrompt(null);
    setRecipeRatings((prev) => ({ ...prev, [rid]: stars }));
    await supabase.from("cooked_recipes")
      .update({ rating: stars })
      .eq("household_id", household.id).eq("recipe_id", rid);
  }

  // ── Custom ingredient handlers ────────────────────────────────────────────
  async function addCustomIngredient(rid) {
    const raw = (newIngredientInput[rid] || "").trim();
    if (!raw) return;
    const match = raw.match(/^([\d.]+\s*(?:g|kg|ml|l|tsp|tbsp|cup|cups|oz|lb|piece|pieces|slice|slices|handful|pinch)?\s*)/i);
    let amount = "", name = raw;
    if (match) { amount = match[0].trim(); name = raw.slice(match[0].length).trim() || raw; }
    await supabase.from("custom_ingredients").insert({
      household_id: household.id, recipe_id: rid, name, amount,
    });
    setNewIngredientInput((prev) => ({ ...prev, [rid]: "" }));
  }

  async function removeCustomIngredient(rid, ingredientId) {
    await supabase.from("custom_ingredients").delete().eq("id", ingredientId);
  }

  // ── Shopping list handlers ────────────────────────────────────────────────
  async function toggleItem(itemName) {
    if (checkedItems[itemName]) {
      await supabase.from("shopping_checks").delete()
        .eq("household_id", household.id).eq("item_name", itemName);
    } else {
      await supabase.from("shopping_checks").insert({ household_id: household.id, item_name: itemName });
    }
  }

  async function clearCheckedItems() {
    await supabase.from("shopping_checks").delete().eq("household_id", household.id);
  }

  // ── Invite link ───────────────────────────────────────────────────────────
  const inviteUrl = household
    ? `${window.location.origin}?invite=${household.invite_token}`
    : "";

  async function copyInviteLink() {
    await navigator.clipboard.writeText(inviteUrl);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const selectedRecipeObjects = mealPlanItems.map((i) => i.recipe_data);
  const selectedIds = new Set(mealPlanItems.map((i) => i.recipe_id));
  const starredIds = new Set(starredItems.map((s) => s.recipe_id));
  const starredRecipes = starredItems.map((s) => s.recipe_data);
  const pantryNames = new Set(pantryItems.map((p) => p.name.toLowerCase().trim()));
  const shoppingList = consolidateIngredients(selectedRecipeObjects, customIngredients)
    .map((item) => ({ ...item, inPantry: pantryNames.has(item.name.toLowerCase().trim()) }));
  const checkedCount = shoppingList.filter((i) => checkedItems[i.name]).length;

  // ── Loading / auth gate ───────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !household) return <AuthScreen />;

  // First-run gate: name + preferences. The member row exists (auth finished),
  // they just haven't filled in their profile yet.
  if (memberProfile && !memberProfile.onboarded_at) {
    return (
      <OnboardingScreen
        user={user}
        household={household}
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
    <div className="min-h-screen bg-paper font-outfit">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-orange-50/80 backdrop-blur-md border-b border-orange-100 px-4 py-3.5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold text-orange-900 leading-none tracking-tight">
              {memberProfile?.display_name ? `${memberProfile.display_name}'s kitchen` : 'Meal Planner'}
            </h1>
            <p className="text-xs text-orange-500 mt-0.5">{household.name}</p>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <span className="bg-orange-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                {selectedIds.size} meals
              </span>
            )}
            {/* Invite button */}
            <div className="relative">
              <button
                onClick={() => setShowInvite((v) => !v)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-orange-400 hover:bg-orange-50 transition"
                title="Invite partner"
              >
                <Users size={18} />
              </button>
              {showInvite && (
                <div className="absolute right-0 top-11 bg-white rounded-2xl shadow-lg border border-orange-100 p-4 w-72 z-40">
                  <p className="text-sm font-semibold text-orange-900 mb-1">Invite your partner</p>
                  <p className="text-xs text-orange-500 mb-3">Share this link — they'll join your kitchen automatically.</p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={inviteUrl}
                      className="flex-1 text-xs border border-orange-200 rounded-xl px-2 py-2 bg-orange-50 text-orange-700 truncate"
                    />
                    <button
                      onClick={copyInviteLink}
                      className="flex-shrink-0 px-3 py-2 bg-orange-500 text-white rounded-full text-xs font-medium hover:bg-orange-600 transition flex items-center gap-1"
                    >
                      {inviteCopied ? <Check size={12} /> : <Link2 size={12} />}
                      {inviteCopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              )}
            </div>
            {/* Notifications */}
            <NotificationBell household={household} />
            <ThemeToggle />

            {/* Preferences */}
            <button
              onClick={() => setShowPreferences(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-orange-400 hover:bg-orange-50 transition"
              title="Household preferences"
            >
              <Settings size={18} />
            </button>
            {/* Starred recipes panel */}
            <button
              onClick={() => setShowStarred(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-orange-400 hover:bg-orange-50 transition relative"
              title="Starred recipes"
            >
              <Star size={18} />
              {starredItems.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-amber-400 rounded-full text-white text-[9px] font-bold flex items-center justify-center">
                  {starredItems.length}
                </span>
              )}
            </button>
            {/* Sign out */}
            <button
              onClick={() => supabase.auth.signOut()}
              className="w-9 h-9 rounded-full flex items-center justify-center text-orange-400 hover:bg-orange-50 transition"
              title="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Reminder banner */}
      {showReminderBanner && (
        <div className="bg-orange-50 border-b border-orange-100 px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <p className="text-sm text-orange-800">
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
          onAddToPlan={(recipe) => { toggleSelectedRecipe(recipe); setShowStarred(false); setActiveTab("recipes"); }}
          onUnstar={toggleStar}
          onPlanWeek={() => { setShowStarred(false); setShowWeekSuggest(true); }}
        />
      )}

      {/* AI week suggestion modal */}
      {showWeekSuggest && (
        <WeekSuggestModal
          household={household}
          onClose={() => setShowWeekSuggest(false)}
          onLoadPlan={async (recipes) => {
            for (const recipe of recipes) await toggleSelectedRecipe(recipe);
            setActiveTab("recipes");
          }}
        />
      )}

      {/* Post-cook rating prompt */}
      {ratingPrompt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-6 text-center">
            <p className="text-2xl mb-2">🍽️</p>
            <h3 className="text-base font-bold text-orange-900 mb-1">How was it?</h3>
            <p className="text-xs text-orange-400 mb-4">Rate the recipe to help your household remember the winners.</p>
            <div className="flex justify-center gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => saveRating(ratingPrompt, s)}
                  className="text-3xl hover:scale-110 transition-transform">
                  ⭐
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

      {/* Main content */}
      <main className="max-w-2xl mx-auto px-4 pt-4 pb-28">

        {/* ── SEARCH TAB ── */}
        {activeTab === "search" && (
          <div>
            <div className="relative mb-4">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-orange-300" size={18} />
              <input
                type="search"
                placeholder="Search recipes — try "quick pasta" or "vegetarian under 30 min"…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-orange-200 bg-white text-orange-900 placeholder-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-400 text-sm"
              />
            </div>

            {/* URL import + manual create */}
            <div className="bg-white rounded-2xl border border-orange-100 p-4 mb-4">
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Import from any website</p>
                <button onClick={() => setShowCreateRecipe(true)}
                  className="flex items-center gap-1 text-xs font-semibold text-orange-500 hover:text-orange-700 transition">
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

            {/* User-created recipes */}
            {userRecipes.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-orange-600 font-medium mb-2">Your recipes</p>
                <div className="space-y-3">
                  {userRecipes.map((recipe) => (
                    <RecipeCard key={recipe.id} recipe={recipe}
                      isSelected={selectedIds.has(String(recipe.id))}
                      isStarred={starredIds.has(String(recipe.id))}
                      onToggleSelect={toggleSelectedRecipe}
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
              <div className="space-y-3">
                <p className="text-sm text-orange-600 font-medium">{recipes.length} recipe{recipes.length !== 1 ? "s" : ""} found</p>
                {recipes.map((recipe) => (
                  <RecipeCard key={recipe.id} recipe={recipe}
                    isSelected={selectedIds.has(String(recipe.id))}
                    isStarred={starredIds.has(String(recipe.id))}
                    onToggleSelect={toggleSelectedRecipe}
                    onToggleStar={toggleStar} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-orange-300">
                <Search size={48} className="mx-auto mb-3 opacity-50" />
                <p className="font-medium text-orange-400">Search or apply filters to discover recipes</p>
                <p className="text-sm mt-1">powered by Spoonacular &amp; HelloFresh</p>
              </div>
            )}
          </div>
        )}

        {/* ── RECIPES TAB ── */}
        {activeTab === "recipes" && (
          <div>
            {/* AI week planner button */}
            <button onClick={() => setShowWeekSuggest(true)}
              className="w-full mb-4 py-3 bg-orange-500 text-white rounded-full font-semibold text-sm hover:bg-orange-600 transition flex items-center justify-center gap-2 shadow-sm">
              <Sparkles size={14} />
              Plan my week with AI
            </button>

            {/* Templates panel */}
            <div className="mb-4">
              <button onClick={() => setShowTemplates((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 hover:text-orange-800 transition">
                <Calendar size={13} />
                {showTemplates ? "Hide templates" : "Saved week templates"}
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
                            <p className="text-xs text-orange-400">{t.recipes.length} recipe{t.recipes.length !== 1 ? "s" : ""}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => loadTemplate(t)}
                              className="text-xs px-3 py-1.5 bg-orange-500 text-white rounded-full font-medium hover:bg-orange-600 transition">
                              Load
                            </button>
                            <button onClick={() => deleteTemplate(t.id)}
                              className="text-orange-300 hover:text-red-400 transition">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedRecipeObjects.length > 0 && (
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        placeholder={'Name this week (e.g. "Light summer week")'}
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveTemplate()}
                        className="flex-1 border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-400 placeholder-orange-300"
                      />
                      <button onClick={saveTemplate} disabled={!templateName.trim()}
                        className="flex-shrink-0 px-4 py-2 bg-orange-500 text-white rounded-full text-sm font-medium hover:bg-orange-600 transition disabled:opacity-50">
                        Save
                      </button>
                    </div>
                  )}
                  {templates.length === 0 && selectedRecipeObjects.length === 0 && (
                    <p className="text-xs text-orange-400">Add recipes to your plan, then save the week as a template to reuse later.</p>
                  )}
                </div>
              )}
            </div>

            {selectedRecipeObjects.length > 0 ? (
              <>
                <p className="text-sm text-orange-600 font-medium mb-3">
                  {selectedRecipeObjects.length} recipe{selectedRecipeObjects.length !== 1 ? "s" : ""} in your meal plan
                </p>
                <WeeklyNutritionCard recipes={selectedRecipeObjects} />
                <div className="space-y-3">
                  {selectedRecipeObjects.map((recipe) => {
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
                        rating={recipeRatings[rid] || null}
                      />
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="py-6">
                <p className="font-display italic text-orange-500/80 text-xs tracking-wide mb-2">— no plan yet</p>
                <h3 className="font-display text-[2rem] sm:text-4xl font-semibold text-orange-900 leading-[0.95] mb-6 tracking-tight">
                  Start your{' '}
                  <span className="relative inline-block italic font-normal text-orange-600">
                    first
                    <Scribble className="absolute left-0 -bottom-2 w-full text-orange-500/70 pointer-events-none" aria-hidden="true" />
                  </span>{' '}
                  week.
                </h3>

                <ol className="space-y-6">
                  <li>
                    <button
                      onClick={() => setShowWeekSuggest(true)}
                      className="group grid grid-cols-[auto_1fr_auto] gap-4 sm:gap-5 items-start w-full text-left py-2 pr-2 rounded-2xl hover:bg-orange-50/60 transition"
                    >
                      <span className="font-display italic text-4xl sm:text-5xl text-orange-300 group-hover:text-orange-500 leading-none pt-1 select-none transition-colors">01</span>
                      <span className="pt-1">
                        <span className="block font-display text-lg sm:text-xl font-semibold text-orange-900 mb-0.5">Let AI plan the week</span>
                        <span className="block text-sm text-orange-800/80 leading-relaxed max-w-md">
                          Seven dinners picked to your household's taste. Swap anything you don't fancy.
                        </span>
                      </span>
                      <span className="text-orange-400 group-hover:text-orange-600 transition-colors pt-2 pl-1"><GlyphPot /></span>
                    </button>
                  </li>

                  <li>
                    <button
                      onClick={() => setActiveTab("search")}
                      className="group grid grid-cols-[auto_1fr_auto] gap-4 sm:gap-5 items-start w-full text-left py-2 pr-2 rounded-2xl hover:bg-orange-50/60 transition"
                    >
                      <span className="font-display italic text-4xl sm:text-5xl text-orange-300 group-hover:text-orange-500 leading-none pt-1 select-none transition-colors">02</span>
                      <span className="pt-1">
                        <span className="block font-display text-lg sm:text-xl font-semibold text-orange-900 mb-0.5">Browse and star</span>
                        <span className="block text-sm text-orange-800/80 leading-relaxed max-w-md">
                          Search, filter, and star the ones you keep coming back to.
                        </span>
                      </span>
                      <span className="text-orange-400 group-hover:text-orange-600 transition-colors pt-2 pl-1"><GlyphSpyglass /></span>
                    </button>
                  </li>

                  <li>
                    <button
                      onClick={() => { setActiveTab("search"); setTimeout(() => document.querySelector('input[type=url]')?.focus(), 0); }}
                      className="group grid grid-cols-[auto_1fr_auto] gap-4 sm:gap-5 items-start w-full text-left py-2 pr-2 rounded-2xl hover:bg-orange-50/60 transition"
                    >
                      <span className="font-display italic text-4xl sm:text-5xl text-orange-300 group-hover:text-orange-500 leading-none pt-1 select-none transition-colors">03</span>
                      <span className="pt-1">
                        <span className="block font-display text-lg sm:text-xl font-semibold text-orange-900 mb-0.5">Paste a recipe you love</span>
                        <span className="block text-sm text-orange-800/80 leading-relaxed max-w-md">
                          Any URL — we'll pull ingredients and steps straight in.
                        </span>
                      </span>
                      <span className="text-orange-400 group-hover:text-orange-600 transition-colors pt-2 pl-1"><GlyphLink /></span>
                    </button>
                  </li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* ── SHOPPING TAB ── */}
        {activeTab === "shopping" && (
          <div>
            {shoppingList.length > 0 ? (
              <>
                <div className="bg-white rounded-2xl border border-orange-100 p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <ShoppingCart size={16} className="text-orange-500" />
                      <span className="text-sm font-semibold text-orange-800">{shoppingList.length} items</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-orange-500">{checkedCount}/{shoppingList.length} checked</span>
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
                    <p className="text-center text-sm text-green-600 font-semibold mt-2">All done! Happy cooking!</p>
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
                </div>

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
                            item.inPantry ? "bg-gray-100 border-gray-200" : checked ? "bg-green-500 border-green-500 text-white" : item.isCustom ? "border-blue-300" : "border-orange-300"}`}>
                            {(checked || item.inPantry) && <Check size={13} className={item.inPantry ? "text-gray-400" : ""} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className={`text-sm font-medium transition-all ${checked || item.inPantry ? "line-through text-gray-400" : "text-orange-900"}`}>
                              {item.name}
                              {item.isCustom && <span className="ml-1.5 text-xs text-blue-500 font-normal">custom</span>}
                              {item.inPantry && <span className="ml-1.5 text-xs text-gray-400 font-normal">in pantry</span>}
                            </span>
                          </div>
                          {item.amount && (
                            <span className={`text-xs flex-shrink-0 ${checked ? "text-gray-300" : "text-orange-500"}`}>{item.amount}</span>
                          )}
                        </button>
                      );
                    })}
                </div>
              </>
            ) : (
              <div className="text-center py-16 text-orange-300">
                <ShoppingCart size={48} className="mx-auto mb-3 opacity-50" />
                <p className="font-medium text-orange-400">Your shopping list is empty</p>
                <p className="text-sm mt-1">Select recipes to build your list</p>
                <button onClick={() => setActiveTab("search")}
                  className="mt-4 px-5 py-2.5 bg-orange-500 text-white rounded-full text-sm font-medium hover:bg-orange-600 transition">
                  Find Recipes
                </button>
              </div>
            )}
          </div>
        )}
        {/* ── PANTRY TAB ── */}
        {activeTab === "pantry" && (
          <div>
            <div className="bg-white rounded-2xl border border-orange-100 p-4 mb-4">
              <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-3">What's already at home</p>
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
                      className="text-orange-300 hover:text-red-400 transition ml-3">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-orange-300">
                <Package size={48} className="mx-auto mb-3 opacity-50" />
                <p className="font-medium text-orange-400">Your pantry is empty</p>
                <p className="text-sm mt-1">Add ingredients you already have at home</p>
              </div>
            )}
          </div>
        )}
      </main>

      <InstallBanner />
      <UpdateToast />

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/90 backdrop-blur-md border-t border-orange-100 safe-bottom">
        <div className="max-w-2xl mx-auto flex items-stretch">
          {[
            { id: "search",   icon: Search,       label: "Search" },
            { id: "recipes",  icon: Calendar,     label: "Recipes",  badge: selectedIds.size },
            { id: "shopping", icon: ShoppingCart, label: "Shopping", badge: shoppingList.filter((i) => !i.inPantry).length - checkedCount > 0 ? shoppingList.filter((i) => !i.inPantry).length - checkedCount : null },
            { id: "pantry",   icon: Package,      label: "Pantry",   badge: pantryItems.length || null },
          ].map(({ id, icon: Icon, label, badge }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 transition-all relative ${
                activeTab === id ? "text-orange-600" : "text-gray-400 hover:text-orange-400"}`}>
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
        <p className="text-[10px] text-orange-300/70 text-center pb-0.5 select-none">
          v{import.meta.env.VITE_APP_VERSION || "dev"}
        </p>
      </nav>
    </div>
  );
}
