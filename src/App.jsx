import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  ShoppingCart,
  Calendar,
  ChevronDown,
  ChevronUp,
  Check,
  Plus,
  X,
  Trash2,
} from "lucide-react";
import { mockRecipes } from "./mockData";

// ─── Filter configuration ────────────────────────────────────────────────────
const FILTERS = {
  dietary: ["gluten-free", "vegetarian", "high-protein", "traditional"],
  time: ["<20min", "20-40min", "40+min"],
  cuisine: ["light", "dutch"],
  season: ["spring", "summer", "autumn", "winter"],
};

const SOURCE_COLORS = {
  HelloFresh: "bg-green-100 text-green-700",
  "Marley Spoon": "bg-purple-100 text-purple-700",
  "NYT Cooking": "bg-red-100 text-red-700",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function totalTime(r) {
  return r.prepTime + r.cookTime;
}

function matchesTimeFilter(recipe, timeFilters) {
  if (timeFilters.length === 0) return true;
  const t = totalTime(recipe);
  return timeFilters.some((f) => {
    if (f === "<20min") return t < 20;
    if (f === "20-40min") return t >= 20 && t <= 40;
    if (f === "40+min") return t > 40;
    return false;
  });
}

function consolidateIngredients(recipes, selectedIds, customIngredients) {
  const items = {};

  selectedIds.forEach((id) => {
    const recipe = recipes.find((r) => r.id === id);
    if (!recipe) return;

    recipe.ingredients.forEach(({ name, amount }) => {
      const key = name.toLowerCase().trim();
      if (items[key]) {
        items[key].amounts.push(amount);
      } else {
        items[key] = { name, amounts: [amount] };
      }
    });

    const customs = customIngredients[id] || [];
    customs.forEach(({ name, amount }) => {
      const key = name.toLowerCase().trim();
      const displayName = name.trim();
      if (items[key]) {
        items[key].amounts.push(amount || "");
      } else {
        items[key] = { name: displayName, amounts: [amount || ""], isCustom: true };
      }
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
    <div
      className={`rounded-xl border-2 p-4 transition-all ${
        isSelected ? "border-orange-400 bg-orange-50" : "border-orange-100 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                SOURCE_COLORS[recipe.source] || "bg-gray-100 text-gray-600"
              }`}
            >
              {recipe.source}
            </span>
            <span className="text-xs text-orange-500">
              {totalTime(recipe)} min · {recipe.servings} servings
            </span>
          </div>
          <h3 className="font-semibold text-orange-900 text-base leading-snug">{recipe.name}</h3>
          <p className="text-sm text-orange-700 italic mt-0.5 leading-snug">{recipe.overview}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {recipe.keywords.slice(0, 5).map((kw) => (
              <span key={kw} className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
                {kw}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={() => onToggleSelect(recipe.id)}
          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
            isSelected
              ? "bg-orange-500 border-orange-500 text-white"
              : "border-orange-300 text-orange-300 hover:border-orange-500"
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
  recipe,
  expanded,
  onToggleExpand,
  onToggleCooked,
  isCooked,
  customIngredients,
  onAddCustom,
  onRemoveCustom,
  onRemove,
  newIngredientInput,
  onInputChange,
}) {
  const customs = customIngredients[recipe.id] || [];

  return (
    <div
      className={`rounded-xl border-2 transition-all ${
        isCooked ? "border-green-300 bg-green-50 opacity-80" : "border-orange-100 bg-white"
      }`}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Cooked checkbox */}
          <button
            onClick={() => onToggleCooked(recipe.id)}
            className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center mt-0.5 transition-all ${
              isCooked ? "bg-green-500 border-green-500 text-white" : "border-gray-300"
            }`}
            aria-label={isCooked ? "Mark as not cooked" : "Mark as cooked"}
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
            onClick={() => onToggleExpand(recipe.id)}
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-orange-400 hover:bg-orange-50 transition"
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        {/* Ingredients pills – always visible */}
        <div className="flex flex-wrap gap-1 mt-3">
          {recipe.ingredients.map((ing) => (
            <span key={ing.name} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
              {ing.name}
            </span>
          ))}
          {customs.map((c, i) => (
            <span key={`custom-${i}`} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              {c.name}
            </span>
          ))}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-orange-100 p-4 space-y-4">
          {/* Macros */}
          <div>
            <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">Nutrition (per serving)</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Protein", value: recipe.macros.protein, unit: "g" },
                { label: "Carbs", value: recipe.macros.carbs, unit: "g" },
                { label: "Fat", value: recipe.macros.fat, unit: "g" },
                { label: "Calories", value: recipe.macros.calories, unit: "" },
              ].map(({ label, value, unit }) => (
                <div key={label} className="bg-orange-50 rounded-lg p-2 text-center">
                  <p className="text-sm font-bold text-orange-900">
                    {value}{unit}
                  </p>
                  <p className="text-xs text-orange-600">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Steps */}
          <div>
            <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">Instructions</p>
            <ol className="space-y-2">
              {recipe.steps.map((step, i) => (
                <li key={i} className="flex gap-2 text-sm text-orange-900">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-orange-200 text-orange-700 text-xs flex items-center justify-center font-semibold">
                    {i + 1}
                  </span>
                  <span className="leading-snug">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Custom ingredients */}
          <div>
            <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">Add Extra Ingredients</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. 100g breadcrumbs"
                value={newIngredientInput[recipe.id] || ""}
                onChange={(e) => onInputChange(recipe.id, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onAddCustom(recipe.id)}
                className="flex-1 border border-orange-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              <button
                onClick={() => onAddCustom(recipe.id)}
                className="px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition text-sm font-medium"
              >
                Add
              </button>
            </div>
            {customs.length > 0 && (
              <ul className="mt-2 space-y-1">
                {customs.map((c, i) => (
                  <li key={i} className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-1.5">
                    <span className="text-sm text-blue-800">{c.amount ? `${c.amount} ${c.name}` : c.name}</span>
                    <button
                      onClick={() => onRemoveCustom(recipe.id, i)}
                      className="text-blue-400 hover:text-red-500 transition ml-2"
                      aria-label="Remove ingredient"
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Remove button */}
          <button
            onClick={() => onRemove(recipe.id)}
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
  const [activeTab, setActiveTab] = useState("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilters, setSelectedFilters] = useState({
    dietary: [],
    time: [],
    cuisine: [],
    season: [],
  });
  const [recipes, setRecipes] = useState([]);
  const [selectedRecipes, setSelectedRecipes] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("selectedRecipes") || "[]");
    } catch {
      return [];
    }
  });
  const [expandedRecipes, setExpandedRecipes] = useState({});
  const [customIngredients, setCustomIngredients] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("customIngredients") || "{}");
    } catch {
      return {};
    }
  });
  const [newIngredientInput, setNewIngredientInput] = useState({});
  const [cookedRecipes, setCookedRecipes] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("cookedRecipes") || "{}");
    } catch {
      return {};
    }
  });
  const [checkedItems, setCheckedItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("checkedItems") || "{}");
    } catch {
      return {};
    }
  });
  const [shoppingList, setShoppingList] = useState([]);

  // ── Persist to localStorage ──────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem("selectedRecipes", JSON.stringify(selectedRecipes));
  }, [selectedRecipes]);

  useEffect(() => {
    localStorage.setItem("customIngredients", JSON.stringify(customIngredients));
  }, [customIngredients]);

  useEffect(() => {
    localStorage.setItem("cookedRecipes", JSON.stringify(cookedRecipes));
  }, [cookedRecipes]);

  useEffect(() => {
    localStorage.setItem("checkedItems", JSON.stringify(checkedItems));
  }, [checkedItems]);

  // ── Build shopping list whenever selections change ───────────────────────
  useEffect(() => {
    setShoppingList(consolidateIngredients(mockRecipes, selectedRecipes, customIngredients));
  }, [selectedRecipes, customIngredients]);

  // ── Filter / search logic ────────────────────────────────────────────────
  const applyFilters = useCallback(() => {
    const { dietary, time, cuisine, season } = selectedFilters;
    const hasFilters =
      dietary.length + time.length + cuisine.length + season.length > 0 ||
      searchQuery.trim().length > 0;

    if (!hasFilters) {
      setRecipes([]);
      return;
    }

    const filtered = mockRecipes.filter((r) => {
      if (searchQuery.trim() && !r.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (dietary.length > 0 && !dietary.some((d) => r.dietary.includes(d))) return false;
      if (!matchesTimeFilter(r, time)) return false;
      if (cuisine.length > 0 && !cuisine.includes(r.cuisine)) return false;
      if (season.length > 0 && r.season !== "all" && !season.includes(r.season)) return false;
      return true;
    });

    setRecipes(filtered);
  }, [selectedFilters, searchQuery]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function toggleFilter(category, value) {
    setSelectedFilters((prev) => {
      const current = prev[category];
      return {
        ...prev,
        [category]: current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value],
      };
    });
  }

  function toggleSelectedRecipe(id) {
    setSelectedRecipes((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  }

  function toggleRecipe(id) {
    setExpandedRecipes((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleCookedRecipe(id) {
    setCookedRecipes((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function addCustomIngredient(recipeId) {
    const raw = (newIngredientInput[recipeId] || "").trim();
    if (!raw) return;

    // Parse "amount name" e.g. "100g breadcrumbs" or just "salt"
    const match = raw.match(/^([\d.]+\s*(?:g|kg|ml|l|tsp|tbsp|cup|cups|oz|lb|piece|pieces|slice|slices|handful|pinch)?\s*)/i);
    let amount = "";
    let name = raw;
    if (match) {
      amount = match[0].trim();
      name = raw.slice(match[0].length).trim() || raw;
    }

    setCustomIngredients((prev) => ({
      ...prev,
      [recipeId]: [...(prev[recipeId] || []), { name, amount }],
    }));
    setNewIngredientInput((prev) => ({ ...prev, [recipeId]: "" }));
  }

  function removeCustomIngredient(recipeId, index) {
    setCustomIngredients((prev) => ({
      ...prev,
      [recipeId]: (prev[recipeId] || []).filter((_, i) => i !== index),
    }));
  }

  function toggleItem(itemName) {
    setCheckedItems((prev) => ({ ...prev, [itemName]: !prev[itemName] }));
  }

  function clearCheckedItems() {
    setCheckedItems({});
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const selectedRecipeObjects = mockRecipes.filter((r) => selectedRecipes.includes(r.id));
  const checkedCount = shoppingList.filter((i) => checkedItems[i.name]).length;
  const totalFiltersActive =
    selectedFilters.dietary.length +
    selectedFilters.time.length +
    selectedFilters.cuisine.length +
    selectedFilters.season.length;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 font-outfit">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-orange-100 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-orange-900 leading-none">Meal Planner</h1>
            <p className="text-xs text-orange-500 mt-0.5">HelloFresh · Marley Spoon · NYT Cooking</p>
          </div>
          <div className="flex items-center gap-2">
            {selectedRecipes.length > 0 && (
              <span className="bg-orange-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                {selectedRecipes.length} meals
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-2xl mx-auto px-4 pt-4 pb-28">

        {/* ── SEARCH TAB ── */}
        {activeTab === "search" && (
          <div>
            {/* Search input */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-300" size={18} />
              <input
                type="search"
                placeholder="Search by recipe name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-orange-200 bg-white text-orange-900 placeholder-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-300 text-base"
              />
            </div>

            {/* Filters */}
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
                <FilterSection
                  key={cat}
                  title={cat}
                  options={opts}
                  selected={selectedFilters[cat]}
                  onToggle={(val) => toggleFilter(cat, val)}
                />
              ))}
            </div>

            {/* Results */}
            {recipes.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-orange-600 font-medium">{recipes.length} recipe{recipes.length !== 1 ? "s" : ""} found</p>
                {recipes.map((recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    isSelected={selectedRecipes.includes(recipe.id)}
                    onToggleSelect={toggleSelectedRecipe}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-orange-300">
                <Search size={48} className="mx-auto mb-3 opacity-50" />
                <p className="font-medium text-orange-400">Apply filters to discover recipes</p>
                <p className="text-sm mt-1">or search by name above</p>
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
                  {selectedRecipeObjects.map((recipe) => (
                    <SelectedRecipeCard
                      key={recipe.id}
                      recipe={recipe}
                      expanded={!!expandedRecipes[recipe.id]}
                      onToggleExpand={toggleRecipe}
                      onToggleCooked={toggleCookedRecipe}
                      isCooked={!!cookedRecipes[recipe.id]}
                      customIngredients={customIngredients}
                      onAddCustom={addCustomIngredient}
                      onRemoveCustom={removeCustomIngredient}
                      onRemove={toggleSelectedRecipe}
                      newIngredientInput={newIngredientInput}
                      onInputChange={(id, val) =>
                        setNewIngredientInput((prev) => ({ ...prev, [id]: val }))
                      }
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-16 text-orange-300">
                <Calendar size={48} className="mx-auto mb-3 opacity-50" />
                <p className="font-medium text-orange-400">No recipes selected yet</p>
                <p className="text-sm mt-1">Search for recipes and add them to your plan</p>
                <button
                  onClick={() => setActiveTab("search")}
                  className="mt-4 px-5 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition"
                >
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
                {/* Progress */}
                <div className="bg-white rounded-xl border border-orange-100 p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <ShoppingCart size={16} className="text-orange-500" />
                      <span className="text-sm font-semibold text-orange-800">
                        {shoppingList.length} items
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-orange-500">
                        {checkedCount}/{shoppingList.length} checked
                      </span>
                      {checkedCount > 0 && (
                        <button
                          onClick={clearCheckedItems}
                          className="text-xs text-orange-400 hover:text-orange-600 transition"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="w-full bg-orange-100 rounded-full h-2">
                    <div
                      className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${(checkedCount / shoppingList.length) * 100}%`,
                      }}
                    />
                  </div>
                  {checkedCount === shoppingList.length && shoppingList.length > 0 && (
                    <p className="text-center text-sm text-green-600 font-semibold mt-2">
                      All done! Happy cooking!
                    </p>
                  )}
                </div>

                {/* Items */}
                <div className="bg-white rounded-xl border border-orange-100 divide-y divide-orange-50 overflow-hidden">
                  {shoppingList
                    .sort((a, b) => {
                      // unchecked first
                      const ac = checkedItems[a.name] ? 1 : 0;
                      const bc = checkedItems[b.name] ? 1 : 0;
                      return ac - bc || a.name.localeCompare(b.name);
                    })
                    .map((item) => {
                      const checked = !!checkedItems[item.name];
                      return (
                        <button
                          key={item.name}
                          onClick={() => toggleItem(item.name)}
                          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-orange-50 transition active:bg-orange-100"
                        >
                          <div
                            className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                              checked
                                ? "bg-green-500 border-green-500 text-white"
                                : item.isCustom
                                ? "border-blue-300"
                                : "border-orange-300"
                            }`}
                          >
                            {checked && <Check size={13} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span
                              className={`text-sm font-medium transition-all ${
                                checked ? "line-through text-gray-400" : "text-orange-900"
                              }`}
                            >
                              {item.name}
                              {item.isCustom && (
                                <span className="ml-1.5 text-xs text-blue-500 font-normal">custom</span>
                              )}
                            </span>
                          </div>
                          {item.amount && (
                            <span
                              className={`text-xs flex-shrink-0 transition-all ${
                                checked ? "text-gray-300" : "text-orange-500"
                              }`}
                            >
                              {item.amount}
                            </span>
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
                <p className="text-sm mt-1">Select recipes to build your shopping list</p>
                <button
                  onClick={() => setActiveTab("search")}
                  className="mt-4 px-5 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition"
                >
                  Find Recipes
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom tab navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/90 backdrop-blur-md border-t border-orange-100 safe-bottom">
        <div className="max-w-2xl mx-auto flex items-stretch">
          {[
            { id: "search", icon: Search, label: "Search" },
            { id: "recipes", icon: Calendar, label: "Recipes", badge: selectedRecipes.length },
            {
              id: "shopping",
              icon: ShoppingCart,
              label: "Shopping",
              badge: shoppingList.length > 0 ? shoppingList.length - checkedCount || null : null,
            },
          ].map(({ id, icon: Icon, label, badge }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 transition-all relative ${
                activeTab === id ? "text-orange-600" : "text-gray-400 hover:text-orange-400"
              }`}
            >
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
