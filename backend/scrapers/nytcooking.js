/**
 * NYT Cooking scraper
 *
 * NYT Cooking embeds recipe data as schema.org JSON-LD in their
 * article pages, making it relatively straightforward to extract.
 *
 * NOTE: Access to NYT Cooking recipe pages requires a subscription.
 * The scraper will only work for pages accessible without a paywall
 * or if you have valid session cookies configured.
 *
 * Set NYT_SESSION_COOKIE in your .env to authenticate:
 *   NYT_SESSION_COOKIE=NYT-S=<your_cookie_value>
 */

const axios = require("axios");
const cheerio = require("cheerio");
const { normaliseJsonLd } = require("./hellofresh");

const BASE_URL = "https://cooking.nytimes.com";
const SEARCH_URL = `${BASE_URL}/search`;
const TIMEOUT_MS = parseInt(process.env.API_TIMEOUT || "15") * 1000;

async function fetchPage(url) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) " +
      "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
  };

  if (process.env.NYT_SESSION_COOKIE) {
    headers["Cookie"] = process.env.NYT_SESSION_COOKIE;
  }

  const response = await axios.get(url, { timeout: TIMEOUT_MS, headers });
  return response.data;
}

async function scrapeRecipePage(url) {
  const html = await fetchPage(url);
  const $ = cheerio.load(html);
  const recipes = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      const items = Array.isArray(data) ? data : [data];
      items.forEach((item) => {
        if (item["@type"] === "Recipe") {
          recipes.push(normaliseJsonLd(item, "NYT Cooking", "nyt"));
        }
      });
    } catch {
      // ignore
    }
  });

  return recipes;
}

async function scrape() {
  console.log("[NYTCooking] Starting scrape...");
  const recipes = [];

  try {
    // Scrape search results page
    const html = await fetchPage(SEARCH_URL);
    const $ = cheerio.load(html);

    // JSON-LD on listing page
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html());
        const items = Array.isArray(data) ? data : [data];
        items.forEach((item) => {
          if (item["@type"] === "Recipe") {
            recipes.push(normaliseJsonLd(item, "NYT Cooking", "nyt"));
          }
        });
      } catch {
        // ignore
      }
    });

    // Collect recipe page links and scrape each
    if (recipes.length === 0) {
      const links = [];
      $("a[href*='/recipes/']").each((_, el) => {
        const href = $(el).attr("href");
        if (href && !links.includes(href) && links.length < 10) {
          links.push(href.startsWith("http") ? href : `${BASE_URL}${href}`);
        }
      });

      for (const link of links) {
        try {
          const pageRecipes = await scrapeRecipePage(link);
          recipes.push(...pageRecipes);
        } catch (err) {
          console.warn(`[NYTCooking] Failed to scrape ${link}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error("[NYTCooking] Scrape failed:", err.message);
  }

  console.log(`[NYTCooking] Found ${recipes.length} recipes`);
  return recipes;
}

module.exports = { scrape };
