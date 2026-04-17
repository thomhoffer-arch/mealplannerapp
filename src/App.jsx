import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search, ShoppingCart, Calendar, ChevronDown, ChevronUp,
  Check, Plus, X, Trash2, LogOut, Link2, Users,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import AuthScreen from "./components/AuthScreen";

// ─── Filter configuration ─────────────────────────────────────────────────────
const FILTERS = {
  dietary: ["gluten-free", "vegetarian", "high-protein", "traditional"],
  time: ["<20min", "20-40min", "40+min"],
  cuisine: ["light", "dutch"],
  season: ["spring", "summer", "autumn", "winter"],
};

const SOURCE_COLORS = {
  HelloFresh:    "bg-green-100 text-green-700",
  "Marley Spoon":"bg-purple-100 text-purple-700",
  "NYT Cooking": "bg-red-100 text-red-700",
  Spoonacular:   "bg-blue-100 text-blue-700",
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
function FilterSection({ title, options, selected, onToggle }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full text-xs font-semibold text-orange-700 uppercase tracking-wide mb-1.5"
      >
        <span>{title}</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => {
            const active = selected.includes(opt);
            return (
              <button
                key={opt}
                onClick={() => onToggle(opt)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  active
                    ? "bg-orange-500 text-white shadow-sm"
                    : "bg-white text-orange-700 border border-orange-200 hover:border-orange-400"
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RecipeCard({ recipe, isSelected, onToggleSelect }) {
  return (
    <div className={`rounded-xl border-2 p-4 transition-all ${isSelected ? "border-orange-400 bg-orange-50" : "border-orange-100 bg-white"}`}>
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
        <button
          onClick={() => onToggleSelect(recipe)}
          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
            isSelected ? "bg-orange-500 border-orange-500 text-white" : "border-orange-300 text-orange-300 hover:border-orange-500"
          }`}
          aria-label={isSelected ? "Remove from meal plan" : "Add to meal plan"}
        >
          {isSelected ? <Check size={18} /> : <Plus size={18} />}
        </button>
      </div>
    </div>
  );
}

function SelectedRecipeCard({
  recipe, expanded, onToggleExpand, onToggleCooked, isCooked,
  customIngredients, onAddCustom, onRemoveCustom, onRemove,
  newIngredientInput, onInputChange,
}) {
  const rid = String(recipe.id);
  const customs = customIngredients[rid] || [];
  return (
    <div className={`rounded-xl border-2 transition-all ${isCooked ? "border-green-300 bg-green-50 opacity-80" : "border-orange-100 bg-white"}`}>
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
                className="flex-1 border border-orange-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              <button
                onClick={() => onAddCustom(rid)}
                className="px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition text-sm font-medium"
              >
                Add
              </button>
            </div>
            {customs.length > 0 && (
              <ul className="mt-2 space-y-1">
                {customs.map((c) => (
                  <li key={c.id} className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-1.5">
                    <span className="text-sm text-blue-800">{c.amount ? `${c.amount} ${c.name}` : c.name}</span>
                    <button
                      onClick={() => onRemoveCustom(rid, c.id)}
                      className="text-blue-400 hover:text-red-500 transition ml-2"
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            onClick={() => onRemove(recipe)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 border-red-200 text-red-500 hover:bg-red-50 transition text-sm font-medium"
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
  const [authLoading, setAuthLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  // ── Search state
  const [activeTab, setActiveTab] = useState("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilters, setSelectedFilters] = useState({ dietary: [], time: [], cuisine: [], season: [] });
  const [recipes, setRecipes] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimer = useRef(null);

  // ── Supabase-backed shared state
  const [mealPlanItems, setMealPlanItems] = useState([]);   // [{ id, recipe_id, recipe_data }]
  const [customIngredients, setCustomIngredients] = useState({});  // { recipe_id: [{id,name,amount}] }
  const [cookedRecipes, setCookedRecipes] = useState({});   // { recipe_id: true }
  const [checkedItems, setCheckedItems] = useState({});     // { item_name: true }

  // ── Local UI state
  const [expandedRecipes, setExpandedRecipes] = useState({});
  const [newIngredientInput, setNewIngredientInput] = useState({});

  // ── Auth setup ────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setAuthLoading(false);
        setHousehold(null);
        setMealPlanItems([]);
        setCustomIngredients({});
        setCookedRecipes({});
        setCheckedItems({});
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Load household when user is ready ────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    loadHousehold();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadHousehold() {
    const { data: member } = await supabase
      .from("household_members")
      .select("household_id, households(*)")
      .eq("user_id", user.id)
      .single();

    if (member?.households) {
      setHousehold(member.households);
    } else {
      const { data: hid } = await supabase.rpc("create_household_for_user", { uid: user.id });
      const { data: h } = await supabase.from("households").select("*").eq("id", hid).single();
      setHousehold(h);
    }
    setAuthLoading(false);
  }

  // ── Load + subscribe when household is ready ──────────────────────────────
  useEffect(() => {
    if (!household) return;
    loadMealPlan();
    loadCustomIngredients();
    loadCookedRecipes();
    loadCheckedItems();

    const channel = supabase
      .channel(`hh-${household.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "meal_plan_items",    filter: `household_id=eq.${household.id}` }, loadMealPlan)
      .on("postgres_changes", { event: "*", schema: "public", table: "custom_ingredients", filter: `household_id=eq.${household.id}` }, loadCustomIngredients)
      .on("postgres_changes", { event: "*", schema: "public", table: "cooked_recipes",     filter: `household_id=eq.${household.id}` }, loadCookedRecipes)
      .on("postgres_changes", { event: "*", schema: "public", table: "shopping_checks",    filter: `household_id=eq.${household.id}` }, loadCheckedItems)
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
      .from("cooked_recipes").select("recipe_id").eq("household_id", household.id);
    const map = {};
    (data || []).forEach((r) => { map[r.recipe_id] = true; });
    setCookedRecipes(map);
  }

  async function loadCheckedItems() {
    const { data } = await supabase
      .from("shopping_checks").select("item_name").eq("household_id", household.id);
    const map = {};
    (data || []).forEach((r) => { map[r.item_name] = true; });
    setCheckedItems(map);
  }

  // ── Recipe search ─────────────────────────────────────────────────────────
  const fetchRecipes = useCallback(async (query, filters) => {
    const hasFilters = Object.values(filters).some((f) => f.length > 0);
    if (!query.trim() && !hasFilters) { setRecipes([]); return; }

    setSearchLoading(true);
    try {
      const params = new URLSearchParams({ q: query });
      if (filters.dietary.length) params.set("dietary", filters.dietary.join(","));
      if (filters.time.length)    params.set("time", filters.time[0]);
      if (filters.cuisine.length) params.set("cuisine", filters.cuisine.join(","));
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
    searchTimer.current = setTimeout(() => fetchRecipes(searchQuery, selectedFilters), 400);
    return () => clearTimeout(searchTimer.current);
  }, [searchQuery, selectedFilters, fetchRecipes]);

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
    }
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

  // ── Filter toggle ─────────────────────────────────────────────────────────
  function toggleFilter(category, value) {
    setSelectedFilters((prev) => {
      const cur = prev[category];
      return { ...prev, [category]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] };
    });
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
  const shoppingList = consolidateIngredients(selectedRecipeObjects, customIngredients);
  const checkedCount = shoppingList.filter((i) => checkedItems[i.name]).length;
  const totalFiltersActive = Object.values(selectedFilters).reduce((s, f) => s + f.length, 0);

  // ── Loading / auth gate ───────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-300 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !household) return <AuthScreen />;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 font-outfit">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-orange-100 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-orange-900 leading-none">Meal Planner</h1>
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
                <div className="absolute right-0 top-11 bg-white rounded-xl shadow-lg border border-orange-100 p-4 w-72 z-40">
                  <p className="text-sm font-semibold text-orange-900 mb-1">Invite your partner</p>
                  <p className="text-xs text-orange-500 mb-3">Share this link — they'll join your kitchen automatically.</p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={inviteUrl}
                      className="flex-1 text-xs border border-orange-200 rounded-lg px-2 py-2 bg-orange-50 text-orange-700 truncate"
                    />
                    <button
                      onClick={copyInviteLink}
                      className="flex-shrink-0 px-3 py-2 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600 transition flex items-center gap-1"
                    >
                      {inviteCopied ? <Check size={12} /> : <Link2 size={12} />}
                      {inviteCopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              )}
            </div>
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

      {/* Main content */}
      <main className="max-w-2xl mx-auto px-4 pt-4 pb-28">

        {/* ── SEARCH TAB ── */}
        {activeTab === "search" && (
          <div>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-300" size={18} />
              <input
                type="search"
                placeholder="Search recipes…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-orange-200 bg-white text-orange-900 placeholder-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-300 text-base"
              />
            </div>

            <div className="bg-white rounded-xl border border-orange-100 p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-orange-800">Filters</p>
                {totalFiltersActive > 0 && (
                  <button
                    onClick={() => setSelectedFilters({ dietary: [], time: [], cuisine: [], season: [] })}
                    className="text-xs text-orange-400 hover:text-orange-600 transition"
                  >
                    Clear all ({totalFiltersActive})
                  </button>
                )}
              </div>
              {Object.entries(FILTERS).map(([cat, opts]) => (
                <FilterSection key={cat} title={cat} options={opts}
                  selected={selectedFilters[cat]} onToggle={(v) => toggleFilter(cat, v)} />
              ))}
            </div>

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
                    onToggleSelect={toggleSelectedRecipe} />
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
            {selectedRecipeObjects.length > 0 ? (
              <>
                <p className="text-sm text-orange-600 font-medium mb-3">
                  {selectedRecipeObjects.length} recipe{selectedRecipeObjects.length !== 1 ? "s" : ""} in your meal plan
                </p>
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
                      />
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="text-center py-16 text-orange-300">
                <Calendar size={48} className="mx-auto mb-3 opacity-50" />
                <p className="font-medium text-orange-400">No recipes in your plan yet</p>
                <p className="text-sm mt-1">Search for recipes and add them</p>
                <button onClick={() => setActiveTab("search")}
                  className="mt-4 px-5 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition">
                  Browse Recipes
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── SHOPPING TAB ── */}
        {activeTab === "shopping" && (
          <div>
            {shoppingList.length > 0 ? (
              <>
                <div className="bg-white rounded-xl border border-orange-100 p-4 mb-4">
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
                </div>

                <div className="bg-white rounded-xl border border-orange-100 divide-y divide-orange-50 overflow-hidden">
                  {[...shoppingList]
                    .sort((a, b) => {
                      const ac = checkedItems[a.name] ? 1 : 0;
                      const bc = checkedItems[b.name] ? 1 : 0;
                      return ac - bc || a.name.localeCompare(b.name);
                    })
                    .map((item) => {
                      const checked = !!checkedItems[item.name];
                      return (
                        <button key={item.name} onClick={() => toggleItem(item.name)}
                          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-orange-50 transition active:bg-orange-100">
                          <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                            checked ? "bg-green-500 border-green-500 text-white" : item.isCustom ? "border-blue-300" : "border-orange-300"}`}>
                            {checked && <Check size={13} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className={`text-sm font-medium transition-all ${checked ? "line-through text-gray-400" : "text-orange-900"}`}>
                              {item.name}
                              {item.isCustom && <span className="ml-1.5 text-xs text-blue-500 font-normal">custom</span>}
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
                  className="mt-4 px-5 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition">
                  Find Recipes
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/90 backdrop-blur-md border-t border-orange-100 safe-bottom">
        <div className="max-w-2xl mx-auto flex items-stretch">
          {[
            { id: "search",   icon: Search,       label: "Search" },
            { id: "recipes",  icon: Calendar,     label: "Recipes",  badge: selectedIds.size },
            { id: "shopping", icon: ShoppingCart, label: "Shopping", badge: shoppingList.length > 0 ? shoppingList.length - checkedCount || null : null },
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
      </nav>
    </div>
  );
}
