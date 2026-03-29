/**
 * HelloFresh scraper
 *
 * HelloFresh doesn't have an official public API, so this module
 * scrapes their recipe search/listing pages and normalises the result
 * into the app's standard schema.
 *
 * NOTE: Web scraping is subject to the site's terms of service.
 * Replace or supplement with HelloFresh's official API if one becomes
 * available.
 */

const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://www.hellofresh.com";
const SEARCH_URL = `${BASE_URL}/recipes`;

const TIMEOUT_MS = parseInt(process.env.API_TIMEOUT || "15") * 1000;

/**
 * Fetch a page with a realistic browser user-agent.
 */
async function fetchPage(url) {
  const response = await axios.get(url, {
    timeout: TIMEOUT_MS,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) " +
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  });
  return response.data;
}

/**
 * Parse a HelloFresh recipe card from a cheerio element.
 * HelloFresh renders recipe cards with `data-*` attributes and
 * schema.org JSON-LD blocks – we prefer the structured data when
 * available and fall back to HTML scraping.
 */
function parseRecipeCard($, el) {
  const $el = $(el);
  const name = $el.find('[data-test-id="recipe-name"], h3, h2').first().text().trim();
  if (!name) return null;

  const href = $el.find("a").first().attr("href") || "";
  const id = "hf-" + href.split("/").filter(Boolean).pop();
  const time = parseInt($el.find('[data-test-id="recipe-time"]').text()) || 30;
  const servings = 2;

  const dietaryText = $el.find('[data-test-id="recipe-tags"]').text().toLowerCase();
  const dietary = [];
  if (dietaryText.includes("vegeta")) dietary.push("vegetarian");
  if (dietaryText.includes("gluten")) dietary.push("gluten-free");
  if (dietaryText.includes("protein")) dietary.push("high-protein");

  return {
    id,
    name,
    source: "HelloFresh",
    prepTime: Math.round(time * 0.3),
    cookTime: Math.round(time * 0.7),
    servings,
    dietary: dietary.length ? dietary : ["traditional"],
    cuisine: "light",
    season: "all",
    overview: $el.find("p").first().text().trim() || `${name} from HelloFresh.`,
    keywords: name.toLowerCase().split(" ").filter((w) => w.length > 3),
    macros: { protein: 35, carbs: 55, fat: 20, calories: 540 },
    steps: ["Follow the HelloFresh recipe card included in your delivery."],
    ingredients: [],
  };
}

/**
 * Main scrape function – returns an array of normalised recipe objects.
 */
async function scrape() {
  console.log("[HelloFresh] Starting scrape...");
  const recipes = [];

  try {
    const html = await fetchPage(SEARCH_URL);
    const $ = cheerio.load(html);

    // Try schema.org JSON-LD first (most reliable)
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html());
        const items = Array.isArray(data) ? data : [data];
        items.forEach((item) => {
          if (item["@type"] === "Recipe") {
            recipes.push(normaliseJsonLd(item, "HelloFresh", "hf"));
          }
        });
      } catch {
        // ignore parse errors
      }
    });

    // Fall back to card scraping
    if (recipes.length === 0) {
      $('[data-test-id="recipe-card"], .recipe-card, article').each((_, el) => {
        const recipe = parseRecipeCard($, el);
        if (recipe) recipes.push(recipe);
      });
    }
  } catch (err) {
    console.error("[HelloFresh] Scrape failed:", err.message);
  }

  console.log(`[HelloFresh] Found ${recipes.length} recipes`);
  return recipes;
}

/**
 * Normalise a schema.org Recipe JSON-LD object into our standard format.
 */
function normaliseJsonLd(data, source, prefix) {
  const cookTime = parseDuration(data.cookTime) || 20;
  const prepTime = parseDuration(data.prepTime) || 10;

  const ingredients = (data.recipeIngredient || []).map((raw) => {
    const parts = raw.trim().split(" ");
    const amount = parts.slice(0, 2).join(" ");
    const name = parts.slice(2).join(" ") || raw;
    return { name: name.trim(), amount: amount.trim() };
  });

  const steps = (data.recipeInstructions || []).map((s) =>
    typeof s === "string" ? s : s.text || ""
  );

  const dietary = [];
  (data.suitableForDiet || []).forEach((d) => {
    const lower = (typeof d === "string" ? d : d["@id"] || "").toLowerCase();
    if (lower.includes("vegetarian")) dietary.push("vegetarian");
    if (lower.includes("gluten")) dietary.push("gluten-free");
  });

  const nutrition = data.nutrition || {};

  return {
    id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: data.name || "Untitled",
    source,
    prepTime,
    cookTime,
    servings: parseInt(data.recipeYield) || 2,
    dietary: dietary.length ? dietary : ["traditional"],
    cuisine: "light",
    season: "all",
    overview: (data.description || "").slice(0, 200),
    keywords: (data.keywords || "").split(",").map((k) => k.trim().toLowerCase()),
    macros: {
      protein: parseInt(nutrition.proteinContent) || 30,
      carbs: parseInt(nutrition.carbohydrateContent) || 50,
      fat: parseInt(nutrition.fatContent) || 20,
      calories: parseInt(nutrition.calories) || 480,
    },
    steps: steps.filter(Boolean),
    ingredients,
  };
}

/**
 * Parse ISO 8601 duration strings like "PT25M" → 25 (minutes).
 */
function parseDuration(str) {
  if (!str) return null;
  const match = str.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return null;
  return (parseInt(match[1] || 0) * 60) + parseInt(match[2] || 0);
}

module.exports = { scrape, normaliseJsonLd, parseDuration };
