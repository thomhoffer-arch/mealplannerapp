// Hard-guardrail dietary checker. Runs client-side on free-text
// preferences and flags ingredients the household said they avoid.
// Deterministic keyword matching — not a substitute for medical advice,
// but catches the obvious "LLM slipped pork into a halal meal plan"
// cases that the prompt alone sometimes misses.

// Each entry: the triggering phrase (lowercased) → list of ingredient
// keywords to flag. Phrases are matched as substrings of the preferences
// text, so "no pork" and "we avoid pork" both trigger the pork rule.
const AVOID_RULES = [
  { triggers: ['vegetarian', 'no meat', 'meat-free'],
    avoid: ['chicken', 'pork', 'beef', 'lamb', 'veal', 'bacon', 'ham', 'sausage', 'prosciutto', 'pepperoni', 'salami', 'turkey', 'duck', 'rabbit'] },

  { triggers: ['vegan', 'plant-based', 'plant based', 'no animal products'],
    avoid: ['chicken', 'pork', 'beef', 'lamb', 'veal', 'bacon', 'ham', 'sausage', 'turkey', 'duck', 'rabbit', 'fish', 'salmon', 'tuna', 'shrimp', 'prawn', 'milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'egg', 'honey', 'gelatin', 'gelatine'] },

  { triggers: ['pescatarian'],
    avoid: ['chicken', 'pork', 'beef', 'lamb', 'veal', 'bacon', 'ham', 'sausage', 'turkey', 'duck'] },

  { triggers: ['gluten-free', 'gluten free', 'no gluten', 'coeliac', 'celiac'],
    avoid: ['wheat', 'flour', 'bread', 'pasta', 'noodle', 'couscous', 'bulgur', 'semolina', 'farro', 'barley', 'rye', 'soy sauce', 'seitan', 'panko', 'breadcrumb'] },

  { triggers: ['dairy-free', 'dairy free', 'lactose', 'no dairy'],
    avoid: ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'parmesan', 'mozzarella', 'feta', 'ricotta', 'brie', 'cheddar'] },

  { triggers: ['nut allergy', 'allergic to nuts', 'no nuts'],
    avoid: ['peanut', 'almond', 'cashew', 'walnut', 'pecan', 'hazelnut', 'pistachio', 'macadamia', 'brazil nut', 'pine nut'] },

  { triggers: ['shellfish', 'no shellfish'],
    avoid: ['shrimp', 'prawn', 'lobster', 'crab', 'mussel', 'clam', 'oyster', 'scallop', 'crayfish', 'langoustine'] },

  { triggers: ['halal', 'no pork'],
    avoid: ['pork', 'bacon', 'ham', 'prosciutto', 'pepperoni', 'salami', 'pancetta', 'chorizo'] },

  { triggers: ['kosher', 'no shellfish and no pork'],
    avoid: ['pork', 'bacon', 'ham', 'prosciutto', 'pepperoni', 'salami', 'shrimp', 'prawn', 'lobster', 'crab', 'mussel', 'clam', 'oyster', 'scallop'] },

  { triggers: ['no beef', 'hindu', 'vegetarian (hindu)'],
    avoid: ['beef', 'veal'] },
];

// Returns a map of { avoided_ingredient_keyword: [...reasons] } combining
// household-level prefs and every member's personal_prefs. Reasons are
// the triggering phrases — useful for explaining *why* something is flagged.
export function extractAvoids(householdPrefsText = '', memberPrefs = []) {
  const sources = [
    { who: 'household', text: householdPrefsText },
    ...(memberPrefs || []).map((m) => ({ who: m.display_name || 'a member', text: m.personal_prefs || '' })),
  ];

  const avoids = {};
  for (const { who, text } of sources) {
    const lower = (text || '').toLowerCase();
    if (!lower) continue;
    for (const rule of AVOID_RULES) {
      if (rule.triggers.some((t) => lower.includes(t))) {
        for (const ing of rule.avoid) {
          if (!avoids[ing]) avoids[ing] = [];
          const reason = `${who} said "${rule.triggers.find((t) => lower.includes(t))}"`;
          if (!avoids[ing].includes(reason)) avoids[ing].push(reason);
        }
      }
    }
  }
  return avoids;
}

// When an ingredient explicitly labels itself as the safe version of an
// avoided keyword ("gluten-free pasta" rather than "pasta", "oat milk"
// rather than "milk"), it's fine — don't flag it. Map from the avoid
// keyword to phrases that indicate the safe variant.
const SAFE_MARKERS = {
  wheat:   ['gluten-free', 'gluten free'],
  flour:   ['gluten-free', 'gluten free', 'almond flour', 'rice flour', 'chickpea flour', 'oat flour', 'buckwheat flour'],
  bread:   ['gluten-free', 'gluten free'],
  pasta:   ['gluten-free', 'gluten free'],
  noodle:  ['gluten-free', 'gluten free', 'rice noodle', 'glass noodle', 'shirataki'],
  couscous:['gluten-free', 'gluten free'],
  milk:    ['oat milk', 'almond milk', 'soy milk', 'coconut milk', 'rice milk', 'cashew milk', 'dairy-free', 'dairy free', 'plant-based', 'plant based'],
  cheese:  ['vegan', 'dairy-free', 'dairy free', 'plant-based'],
  butter:  ['vegan', 'dairy-free', 'dairy free', 'plant-based', 'peanut butter', 'almond butter'],
  cream:   ['coconut cream', 'cashew cream', 'vegan', 'dairy-free', 'dairy free'],
  yogurt:  ['vegan', 'dairy-free', 'coconut'],
  yoghurt: ['vegan', 'dairy-free', 'coconut'],
};

// Given a recipe and an avoids map, return an array of conflicts:
// [{ ingredient: "bacon", reasons: ["Thom said 'halal'"] }, ...]
// Matches on substring of the ingredient name, case-insensitive.
// Ignores hits when the ingredient explicitly labels itself as the
// safe variant (see SAFE_MARKERS).
export function checkRecipe(recipe, avoids) {
  const conflicts = [];
  const ingredients = (recipe?.ingredients || []).map((i) => (i.name || '').toLowerCase());
  for (const [avoid, reasons] of Object.entries(avoids)) {
    const safeMarkers = SAFE_MARKERS[avoid] || [];
    const hit = ingredients.find((ing) => {
      if (!ing.includes(avoid)) return false;
      return !safeMarkers.some((safe) => ing.includes(safe));
    });
    if (hit) conflicts.push({ ingredient: hit, avoid, reasons });
  }
  return conflicts;
}

// Convenience: short human-readable summary of conflicts, for alerts/toasts.
export function summarizeConflicts(conflicts) {
  if (!conflicts.length) return '';
  return conflicts.map((c) => `"${c.ingredient}" — ${c.reasons.join('; ')}`).join('\n');
}
