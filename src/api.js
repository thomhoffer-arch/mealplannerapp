import axios from "axios";

const BASE_URL = process.env.REACT_APP_API_URL || "https://api.yourdomain.com";

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

export async function searchRecipes(query, filters) {
  try {
    const response = await api.get("/api/search", {
      params: { q: query, filters: JSON.stringify(filters) },
    });
    return response.data;
  } catch (err) {
    console.error("searchRecipes error:", err);
    throw new Error("Could not fetch recipes. Showing cached results.");
  }
}

export async function getRecipe(id) {
  try {
    const response = await api.get(`/api/recipes/${id}`);
    return response.data;
  } catch (err) {
    console.error("getRecipe error:", err);
    throw new Error("Could not load recipe details.");
  }
}

export async function updateRecipeCache() {
  try {
    const response = await api.get("/api/scrape/update");
    return response.data;
  } catch (err) {
    console.error("updateRecipeCache error:", err);
    throw new Error("Cache update failed.");
  }
}
