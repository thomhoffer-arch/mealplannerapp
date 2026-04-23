// Server-side dietary guardrail builder.
// Parses household + member preference text into a hard prohibition block
// that is embedded verbatim into AI prompts. This makes dietary enforcement
// explicit rather than relying on the LLM inferring restrictions from casual
// preference prose.

const AVOID_RULES = [
  {
    triggers: ['vegetarian', 'no meat', 'meat-free', 'meat free', 'no-meat'],
    avoid: ['chicken', 'pork', 'beef', 'lamb', 'veal', 'bacon', 'ham', 'sausage',
            'prosciutto', 'pepperoni', 'salami', 'pancetta', 'chorizo', 'turkey',
            'duck', 'rabbit', 'venison', 'bison', 'lard', 'gelatin', 'gelatine'],
    label: 'vegetarian',
  },
  {
    triggers: ['vegan', 'plant-based', 'plant based', 'no animal products'],
    avoid: ['chicken', 'pork', 'beef', 'lamb', 'veal', 'bacon', 'ham', 'sausage',
            'turkey', 'duck', 'rabbit', 'fish', 'salmon', 'tuna', 'cod', 'shrimp',
            'prawn', 'milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt',
            'egg', 'honey', 'gelatin', 'gelatine', 'lard', 'ghee', 'whey',
            'casein', 'anchovies', 'worcestershire'],
    label: 'vegan',
  },
  {
    triggers: ['pescatarian', 'pescetarian'],
    avoid: ['chicken', 'pork', 'beef', 'lamb', 'veal', 'bacon', 'ham', 'sausage',
            'turkey', 'duck', 'rabbit', 'venison'],
    label: 'pescatarian',
  },
  {
    triggers: ['gluten-free', 'gluten free', 'no gluten', 'coeliac', 'celiac'],
    avoid: ['wheat', 'flour', 'bread', 'pasta', 'noodle', 'couscous', 'bulgur',
            'semolina', 'farro', 'barley', 'rye', 'seitan', 'panko', 'breadcrumb',
            'soy sauce', 'malt', 'spelt', 'orzo'],
    label: 'gluten-free',
  },
  {
    triggers: ['dairy-free', 'dairy free', 'no dairy', 'lactose', 'lactose intolerant'],
    avoid: ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'parmesan',
            'mozzarella', 'feta', 'ricotta', 'brie', 'cheddar', 'gouda', 'ghee',
            'crème fraîche', 'creme fraiche', 'mascarpone', 'whey', 'casein'],
    label: 'dairy-free',
  },
  {
    triggers: ['nut allergy', 'allergic to nuts', 'no nuts', 'nut-free', 'tree nut'],
    avoid: ['peanut', 'almond', 'cashew', 'walnut', 'pecan', 'hazelnut', 'pistachio',
            'macadamia', 'brazil nut', 'pine nut', 'satay', 'marzipan', 'praline'],
    label: 'nut-free',
  },
  {
    triggers: ['no peanut', 'peanut allergy', 'peanut-free'],
    avoid: ['peanut', 'groundnut', 'satay'],
    label: 'peanut-free',
  },
  {
    triggers: ['shellfish', 'no shellfish', 'shellfish allergy', 'shellfish-free'],
    avoid: ['shrimp', 'prawn', 'lobster', 'crab', 'mussel', 'clam', 'oyster',
            'scallop', 'crayfish', 'langoustine', 'squid', 'octopus'],
    label: 'shellfish-free',
  },
  {
    triggers: ['halal'],
    avoid: ['pork', 'bacon', 'ham', 'prosciutto', 'pepperoni', 'salami', 'pancetta',
            'chorizo', 'lard', 'gelatin', 'gelatine'],
    label: 'halal',
  },
  {
    triggers: ['no pork', 'pork-free'],
    avoid: ['pork', 'bacon', 'ham', 'prosciutto', 'pepperoni', 'salami', 'pancetta',
            'chorizo', 'lard'],
    label: 'pork-free',
  },
  {
    triggers: ['kosher'],
    avoid: ['pork', 'bacon', 'ham', 'prosciutto', 'pepperoni', 'salami', 'shrimp',
            'prawn', 'lobster', 'crab', 'mussel', 'clam', 'oyster', 'scallop'],
    label: 'kosher',
  },
  {
    triggers: ['no beef', 'beef-free', 'hindu'],
    avoid: ['beef', 'veal', 'bison'],
    label: 'no-beef',
  },
  {
    triggers: ['no fish', 'fish-free', 'no seafood', 'seafood-free'],
    avoid: ['fish', 'salmon', 'tuna', 'cod', 'bass', 'halibut', 'trout', 'anchovy',
            'sardine', 'mackerel', 'tilapia', 'shrimp', 'prawn', 'crab', 'lobster',
            'mussel', 'clam', 'oyster', 'scallop', 'squid', 'octopus', 'fish sauce'],
    label: 'no-fish',
  },
  {
    triggers: ['no alcohol', 'alcohol-free', 'no wine', 'no beer', 'teetotal'],
    avoid: ['wine', 'beer', 'spirits', 'brandy', 'rum', 'whiskey', 'vodka', 'sake',
            'vermouth', 'sherry', 'port', 'mirin', 'cooking wine'],
    label: 'no-alcohol',
  },
  {
    triggers: ['no spicy', 'not spicy', 'mild only', 'no heat', 'no chili', 'no chilli'],
    avoid: ['chili', 'chilli', 'jalapeño', 'jalapeño', 'sriracha', 'cayenne',
            'hot sauce', 'chili flakes', 'red pepper flakes', 'habanero', 'serrano',
            'bird\'s eye chili', 'gochujang', 'sambal'],
    label: 'no-spicy',
  },
  {
    triggers: ['no egg', 'egg-free', 'allergic to egg'],
    avoid: ['egg', 'mayonnaise', 'hollandaise', 'aioli', 'meringue'],
    label: 'egg-free',
  },
  {
    triggers: ['no soy', 'soy-free', 'soy allergy', 'allergic to soy'],
    avoid: ['soy sauce', 'tofu', 'tempeh', 'edamame', 'miso', 'tamari', 'soy milk',
            'soy cream', 'soya'],
    label: 'soy-free',
  },
];

// Parse free-text "no X" / "allergic to X" patterns that aren't covered by AVOID_RULES.
function parseFreeTextAvoids(text) {
  const lower = (text || '').toLowerCase();
  const avoids = new Map();

  // "allergic to X" / "allergy to X" — always treat as hard prohibition
  const allergyMatches = lower.matchAll(/allerg(?:ic to|y to|y:)\s+([\w\s]{2,30})/g);
  for (const m of allergyMatches) {
    const ing = m[1].trim().replace(/\s+/g, ' ');
    if (ing.length >= 2) avoids.set(ing, 'allergy');
  }

  // "we don't eat X" / "doesn't eat X" / "we avoid X" / "we hate X"
  const dontMatches = lower.matchAll(/(?:don't eat|doesn't eat|do not eat|avoid|we hate|can't eat|cannot eat)\s+([\w\s]{2,30})/g);
  for (const m of dontMatches) {
    const ing = m[1].trim().replace(/\s+/g, ' ').replace(/\s+(at all|ever|anymore)$/, '');
    if (ing.length >= 2 && !ing.includes(' and ')) avoids.set(ing, 'household rule');
  }

  return avoids;
}

// Build a hard-prohibition block for AI prompts from household and member preferences.
// Returns an empty string if no rules apply (so callers can safely include it with a newline prefix).
export function buildDietaryGuardrails(householdPrefsText = '', members = []) {
  const allTexts = [
    { who: 'household', text: householdPrefsText },
    ...(members || []).map((m) => ({ who: m.display_name || 'a member', text: m.personal_prefs || '' })),
  ];

  // ingredient → Set of reasons
  const blocklist = new Map();

  const addBlock = (ingredient, reason) => {
    if (!blocklist.has(ingredient)) blocklist.set(ingredient, new Set());
    blocklist.get(ingredient).add(reason);
  };

  for (const { who, text } of allTexts) {
    const lower = (text || '').toLowerCase();
    if (!lower) continue;

    for (const rule of AVOID_RULES) {
      const trigger = rule.triggers.find((t) => lower.includes(t));
      if (trigger) {
        for (const ingredient of rule.avoid) {
          addBlock(ingredient, `${who}: "${trigger}"`);
        }
      }
    }

    // Free-text avoids
    const freeText = parseFreeTextAvoids(text);
    for (const [ingredient, type] of freeText) {
      addBlock(ingredient, `${who}: ${type}`);
    }
  }

  if (blocklist.size === 0) return '';

  const lines = [...blocklist.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ing, reasons]) => `  - ${ing}  [reason: ${[...reasons].join('; ')}]`)
    .join('\n');

  return `HARD DIETARY PROHIBITIONS — ABSOLUTE RULES (not suggestions):
The following ingredients must NEVER appear in any recipe, dish name, ingredient list, or suggestion.
Violating even one prohibition is unacceptable regardless of how well the dish fits other criteria.
If a dish cannot be made without a prohibited ingredient, choose a completely different dish or use an
explicit plant-based / allergen-free substitution named in the ingredient list.
${lines}

Cross-check every ingredient in your response against this list before returning. If any prohibited
ingredient appears, replace the entire dish or swap the ingredient with a safe alternative.`;
}
