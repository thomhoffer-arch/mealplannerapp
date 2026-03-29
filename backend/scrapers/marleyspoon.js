/**
 * Marley Spoon scraper
 *
 * Attempts to extract recipe data from Marley Spoon's public pages.
 * Uses JSON-LD structured data when available, otherwise falls back
 * to HTML parsing.
 */

const axios = require("axios");
const cheerio = require("cheerio");
const { normaliseJsonLd, parseDuration } = require("./hellofresh");

const BASE_URL = "https://marleyspoon.com";
const RECIPE_LISTING = `${BASE_URL}/recipes`;
const TIMEOUT_MS = parseInt(process.env.API_TIMEOUT || "15") * 1000;

async function fetchPage(url) {
  const response = await axios.get(url, {
    timeout: TIMEOUT_MS,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) " +
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  return response.data;
}

async function scrape() {
  console.log("[MarleySpoon] Starting scrape...");
  const recipes = [];

  try {
    const html = await fetchPage(RECIPE_LISTING);
    const $ = cheerio.load(html);

    // JSON-LD first
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html());
        const items = Array.isArray(data) ? data : [data];
        items.forEach((item) => {
          if (item["@type"] === "Recipe") {
            const normalised = normaliseJsonLd(item, "Marley Spoon", "ms");
            // Override cuisine for Dutch recipes
            if (/dutch|stamppot|erwten|hutspot/i.test(normalised.name + normalised.overview)) {
              normalised.cuisine = "dutch";
            }
            recipes.push(normalised);
          }
        });
      } catch {
        // ignore
      }
    });

    // HTML card fallback
    if (recipes.length === 0) {
      $(".recipe-card, [class*='RecipeCard'], article").each((_, el) => {
        const $el = $(el);
        const name = $el.find("h2, h3, [class*='title']").first().text().trim();
        if (!name) return;

        const timeText = $el.find("[class*='time'], [class*='duration']").text();
        const time = parseInt(timeText) || 35;
        const isDutch = /dutch|stamppot|erwten|hutspot/i.test(name);

        recipes.push({
          id: `ms-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name,
          source: "Marley Spoon",
          prepTime: Math.round(time * 0.3),
          cookTime: Math.round(time * 0.7),
          servings: 2,
          dietary: ["traditional"],
          cuisine: isDutch ? "dutch" : "light",
          season: "all",
          overview: $el.find("p").first().text().trim() || `${name} from Marley Spoon.`,
          keywords: name.toLowerCase().split(" ").filter((w) => w.length > 3),
          macros: { protein: 30, carbs: 55, fat: 22, calories: 530 },
          steps: ["Follow the Marley Spoon recipe card included in your delivery."],
          ingredients: [],
        });
      });
    }
  } catch (err) {
    console.error("[MarleySpoon] Scrape failed:", err.message);
  }

  console.log(`[MarleySpoon] Found ${recipes.length} recipes`);
  return recipes;
}

module.exports = { scrape };
