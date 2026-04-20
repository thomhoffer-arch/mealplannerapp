export function normalizeSpoonacular(r) {
  const readyIn = r.readyInMinutes || 30;
  const prepTime = Math.round(readyIn * 0.4);
  const cookTime = readyIn - prepTime;

  const nutrients = r.nutrition?.nutrients || [];
  const getNutrient = (name) =>
    Math.round(nutrients.find((n) => n.name === name)?.amount || 0);

  const dietary = [];
  const diets = r.diets || [];
  if (diets.some((d) => d.includes('vegetarian'))) dietary.push('vegetarian');
  if (r.glutenFree || diets.includes('gluten free')) dietary.push('gluten-free');
  if (getNutrient('Protein') >= 30) dietary.push('high-protein');

  const steps =
    r.analyzedInstructions?.[0]?.steps?.map((s) => s.step) ||
    (r.instructions ? [r.instructions] : []);

  const ingredients = (r.extendedIngredients || []).map((i) => ({
    name: i.nameClean || i.name || '',
    amount: `${i.amount} ${i.unit}`.trim(),
  }));

  const overview = (r.summary || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 250);

  return {
    id: String(r.id),
    name: r.title || 'Recipe',
    source: r.sourceName || 'Spoonacular',
    image: r.image || null,
    prepTime,
    cookTime,
    servings: r.servings || 2,
    dietary,
    cuisine: (r.cuisines?.[0] || '').toLowerCase() || 'international',
    season: 'all',
    overview,
    keywords: (r.dishTypes || []).slice(0, 5),
    macros: {
      protein: getNutrient('Protein'),
      carbs: getNutrient('Carbohydrates'),
      fat: getNutrient('Fat'),
      calories: getNutrient('Calories'),
    },
    steps,
    ingredients,
    sourceUrl: r.sourceUrl || null,
  };
}

export function normalizeHelloFresh(r) {
  const nutrients = r.nutrition || [];
  const getNutrient = (tag) =>
    Math.round(nutrients.find((n) => n.type === tag)?.amount || 0);

  const dietary = [];
  const tags = (r.tags || []).map((t) => t.name?.toLowerCase() || '');
  if (tags.some((t) => t.includes('veggie') || t.includes('vegetarian'))) dietary.push('vegetarian');
  if (tags.some((t) => t.includes('gluten'))) dietary.push('gluten-free');
  const protein = getNutrient('ENERC_KCAL') > 0 ? getNutrient('PROCNT') : 0;
  if (protein >= 30) dietary.push('high-protein');

  const ingredients = (r.ingredients || []).map((i) => ({
    name: i.name || '',
    amount: i.amount
      ? `${i.amount.quantity || ''} ${i.amount.unit?.name || ''}`.trim()
      : '',
  }));

  const steps = (r.steps || []).map((s) => s.instructionsMarkdown || s.instructions || '');

  return {
    id: `hf-${r.id}`,
    name: r.name || 'HelloFresh Recipe',
    source: 'HelloFresh',
    image: r.imagePath ? `https://img.hellofresh.com/f_auto,fl_lossy,q_auto,w_600/hellofresh_s3${r.imagePath}` : null,
    prepTime: r.prepTime || 10,
    cookTime: (r.totalTime || 30) - (r.prepTime || 10),
    servings: r.yields?.[0]?.yields || 2,
    dietary,
    cuisine: (r.cuisines?.[0]?.name || '').toLowerCase() || 'international',
    season: 'all',
    overview: r.description || '',
    keywords: (r.tags || []).slice(0, 5).map((t) => t.name || ''),
    macros: {
      protein: getNutrient('PROCNT'),
      carbs: getNutrient('CHOCDF'),
      fat: getNutrient('FAT'),
      calories: getNutrient('ENERC_KCAL'),
    },
    steps,
    ingredients,
    sourceUrl: `https://www.hellofresh.com/recipes/${r.slug}`,
  };
}
