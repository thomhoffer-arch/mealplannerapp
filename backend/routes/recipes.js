const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const hellofresh = require("../scrapers/hellofresh");
const marleyspoon = require("../scrapers/marleyspoon");
const nytcooking = require("../scrapers/nytcooking");

const CACHE_FILE = path.join(__dirname, "../cache/recipes.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Cache helpers ────────────────────────────────────────────────────────────
function readCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return { recipes: [], updatedAt: null };
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    return data;
  } catch {
    return { recipes: [], updatedAt: null };
  }
}

function writeCache(recipes) {
  const data = { recipes, updatedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  return data;
}

function isCacheStale(updatedAt) {
  if (!updatedAt) return true;
  return Date.now() - new Date(updatedAt).getTime() > CACHE_TTL_MS;
}

// ─── Filter helpers ───────────────────────────────────────────────────────────
function totalTime(recipe) {
  return (recipe.prepTime || 0) + (recipe.cookTime || 0);
}

function matchesTimeFilter(recipe, timeFilters) {
  if (!timeFilters || timeFilters.length === 0) return true;
  const t = totalTime(recipe);
  return timeFilters.some((f) => {
    if (f === "<20min") return t < 20;
    if (f === "20-40min") return t >= 20 && t <= 40;
    if (f === "40+min") return t > 40;
    return false;
  });
}

function applyFilters(recipes, q, filters) {
  return recipes.filter((r) => {
    if (q && !r.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (filters.dietary?.length > 0 && !filters.dietary.some((d) => r.dietary?.includes(d))) return false;
    if (!matchesTimeFilter(r, filters.time)) return false;
    if (filters.cuisine?.length > 0 && !filters.cuisine.includes(r.cuisine)) return false;
    if (
      filters.season?.length > 0 &&
      r.season !== "all" &&
      !filters.season.includes(r.season)
    )
      return false;
    return true;
  });
}

// ─── GET /api/search ──────────────────────────────────────────────────────────
router.get("/search", (req, res) => {
  const q = (req.query.q || "").trim();
  let filters = {};
  try {
    filters = req.query.filters ? JSON.parse(req.query.filters) : {};
  } catch {
    return res.status(400).json({ error: "Invalid filters JSON" });
  }

  const { recipes } = readCache();
  const results = applyFilters(recipes, q, filters);
  res.json(results);
});

// ─── GET /api/recipes/:id ─────────────────────────────────────────────────────
router.get("/recipes/:id", (req, res) => {
  const { recipes } = readCache();
  const recipe = recipes.find((r) => r.id === req.params.id);
  if (!recipe) return res.status(404).json({ error: "Recipe not found" });
  res.json(recipe);
});

// ─── POST /api/custom-ingredients ────────────────────────────────────────────
const customIngredientStore = {};

router.post("/custom-ingredients", (req, res) => {
  const { recipeId, ingredient } = req.body;
  if (!recipeId || !ingredient?.name) {
    return res.status(400).json({ error: "recipeId and ingredient.name are required" });
  }
  // Sanitize input
  const clean = {
    name: ingredient.name.trim().slice(0, 100),
    amount: (ingredient.amount || "").trim().slice(0, 50),
  };
  if (!customIngredientStore[recipeId]) customIngredientStore[recipeId] = [];
  customIngredientStore[recipeId].push(clean);
  res.json({ recipeId, ingredients: customIngredientStore[recipeId] });
});

// ─── GET /api/scrape/update ───────────────────────────────────────────────────
router.get("/scrape/update", async (req, res) => {
  // Simple API key auth — set SCRAPE_API_KEY in env
  const apiKey = req.headers["x-api-key"] || req.query.key;
  if (process.env.SCRAPE_API_KEY && apiKey !== process.env.SCRAPE_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    console.log("Starting recipe scrape...");
    const [hfRecipes, msRecipes, nytRecipes] = await Promise.allSettled([
      hellofresh.scrape(),
      marleyspoon.scrape(),
      nytcooking.scrape(),
    ]);

    const combined = [
      ...(hfRecipes.status === "fulfilled" ? hfRecipes.value : []),
      ...(msRecipes.status === "fulfilled" ? msRecipes.value : []),
      ...(nytRecipes.status === "fulfilled" ? nytRecipes.value : []),
    ];

    const { updatedAt } = writeCache(combined);
    res.json({
      status: "ok",
      count: combined.length,
      updatedAt,
      sources: {
        hellofresh: hfRecipes.status === "fulfilled" ? hfRecipes.value.length : "failed",
        marleyspoon: msRecipes.status === "fulfilled" ? msRecipes.value.length : "failed",
        nytcooking: nytRecipes.status === "fulfilled" ? nytRecipes.value.length : "failed",
      },
    });
  } catch (err) {
    console.error("Scrape error:", err);
    res.status(500).json({ error: "Scrape failed", detail: err.message });
  }
});

module.exports = router;
