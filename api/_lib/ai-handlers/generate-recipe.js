import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../auth.js';
import { VOICE_GUIDE } from '../voice.js';
import { resolveAiProvider, callAi } from '../ai-call.js';
import { checkAndIncrementUsage, isGiftedHousehold } from '../usage.js';
import { buildDietaryGuardrails } from '../dietary-guardrails.js';

export default async function handleGenerateRecipe(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { recipe, request, language = 'English', week_context = [] } = req.body || {};
  if (!recipe?.name) return res.status(400).json({ error: 'recipe.name is required' });

  const isAdjust = typeof request === 'string' && request.trim().length > 0;

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const [{ provider, token, usingSharedKey }, { data: prefData }, { data: membersData }] = await Promise.all([
    resolveAiProvider(supabase, ctx.householdId),
    supabase.from('household_preferences').select('preferences_text, measurement_system').eq('household_id', ctx.householdId).maybeSingle(),
    supabase.from('household_members').select('display_name, personal_prefs').eq('household_id', ctx.householdId),
  ]);
  const householdPrefs = prefData?.preferences_text || '';
  const measurementSystem = prefData?.measurement_system || 'metric';
  const dietaryGuardrails = buildDietaryGuardrails(householdPrefs, membersData || []);

  if (!token) return res.status(503).json({ error: 'No AI provider configured' });

  if (usingSharedKey && !(await isGiftedHousehold(supabase, ctx.householdId, ctx.user.id))) {
    const limited = await checkAndIncrementUsage(supabase, ctx.householdId);
    if (limited) {
      return res.status(429).json({
        error: `Your kitchen's weekly AI limit has been reached. Upgrade for more, or wait until next week.`,
        code: 'weekly_limit_reached',
      });
    }
  }

  const prompt = isAdjust ? buildAdjustPrompt(recipe, request.trim(), householdPrefs, measurementSystem, dietaryGuardrails, language, week_context) : buildGeneratePrompt(recipe, householdPrefs, measurementSystem, dietaryGuardrails, language);

  let rawText;
  try {
    rawText = await callAi(provider, token, prompt);
  } catch (err) {
    return res.status(502).json({ error: err.message || 'AI service error' });
  }
  if (!rawText) return res.status(502).json({ error: 'Empty AI response' });

  let result;
  try { result = JSON.parse(rawText); } catch {
    return res.status(502).json({ error: 'Could not parse AI response' });
  }

  res.json(result);
}

function buildReviewFeedbackSection(recipe) {
  const feedback = (recipe._reviewFeedback || []).filter((f) => f?.note);
  if (!feedback.length) return '';
  return `\nPAST COOK FEEDBACK (apply these improvements — the household cooked this before and left notes):\n${feedback.map((f) => `  - [${f.stars}★] "${f.note}"`).join('\n')}\n`;
}

function buildGeneratePrompt(recipe, householdPrefs = '', measurementSystem = 'metric', dietaryGuardrails = '', language = 'English') {
  const { name, overview, cuisineType, prepTime, cookTime, _sideDish } = recipe;
  const totalTime = (prepTime || 0) + (cookTime || 0);
  const timeHint = totalTime > 0 ? ` Total time around ${totalTime} minutes.` : '';
  const cuisineHint = cuisineType ? ` Cuisine: ${cuisineType}.` : '';
  const overviewHint = overview ? `\nContext: ${overview}` : '';

  const hasSide = !!_sideDish?.name;
  const sideIngList = hasSide && (_sideDish.ingredients || []).length > 0
    ? ` Ingredients: ${_sideDish.ingredients.map((i) => `${i.amount || ''} ${i.name}`.trim()).join(', ')}.`
    : '';
  const sideSection = hasSide
    ? `\nThis dinner is served with a side dish: "${_sideDish.name}".${_sideDish.description ? ` ${_sideDish.description}` : ''}${sideIngList} Write 3–5 steps for the side dish in "side_dish_steps".`
    : '';
  const sideSchema = hasSide ? `,\n  "side_dish_steps": ["Heat oil in a small pan over medium heat...", "..."]` : '';

  const prefsSection = householdPrefs
    ? `\nHOUSEHOLD PREFERENCES:\n${householdPrefs}\n`
    : '';
  const guardrailsSection = dietaryGuardrails ? `\n${dietaryGuardrails}\n` : '';
  const reviewFeedbackSection = buildReviewFeedbackSection(recipe);
  const unitsLine = measurementSystem === 'imperial'
    ? 'Use imperial units for ingredient amounts (oz, lb, cups, tsp, tbsp).'
    : 'Use metric units for ingredient amounts (g, kg, ml, L). Use tsp/tbsp for small amounts like spices and seasonings.';
  const langLine = language && language !== 'English'
    ? `\nLANGUAGE: ${language}\nWrite all recipe steps, ingredient names, and any notes in ${language}. JSON field names stay in English.`
    : '';

  return `${VOICE_GUIDE}

---

Write a complete dinner recipe for "${name}".${overviewHint}
${cuisineHint}${timeHint}
Portions for 2 people. ${unitsLine}${langLine}
${prefsSection}${guardrailsSection}${reviewFeedbackSection}${sideSection}
If the dish name already implies a dietary adaptation (e.g. "with
gluten-free pasta", "vegetarian lasagne"), reflect that in the
ingredient list — label GF pasta as "gluten-free pasta", label
non-dairy alternatives explicitly. Don't silently swap to the
regular version.

Return ONLY a JSON object, no markdown:
{
  "ingredients": [{ "name": "chicken thighs, bone-in skin-on", "amount": "600 g" }],
  "steps": ["Pat the chicken dry and season generously on both sides..."],
  "servings": 2,
  "prepTime": <minutes as integer>,
  "cookTime": <minutes as integer>,
  "macros": { "calories": 520, "protein": 38, "carbs": 22, "fat": 28 }${sideSchema}
}

IMPORTANT: macros must be TOTALS for the whole recipe (all servings combined), not per person. Every ingredient MUST have a specific amount with a unit (e.g. "200 g", "2 tbsp", "1 tsp", "3 cloves", "400 ml"). Never leave amount empty or omit units. For whole items use count + unit (e.g. "2 chicken thighs" not just "2"). Each ingredient entry must be ONE purchasable item — never combine two distinct items with "and" in a single entry (write "carrots" and "peas" as two separate entries, not "carrots and peas"). Compound product names that contain "and" as part of their name (e.g. "pork and fennel sausages", "macaroni and cheese") are fine as a single entry.`;
}

function buildAdjustPrompt(recipe, request, householdPrefs = '', measurementSystem = 'metric', dietaryGuardrails = '', language = 'English', weekContext = []) {
  const ingredientsList = (recipe.ingredients || [])
    .map((i) => `  - ${i.amount ? `${i.amount} ` : ''}${i.name}`)
    .join('\n');

  const stepsList = (recipe.steps || [])
    .map((s, i) => `  ${i + 1}. ${s}`)
    .join('\n');

  const adjustmentLog = (recipe._adjustmentLog || []).filter(Boolean);
  const adjustmentSection = adjustmentLog.length
    ? `\nPREVIOUS ADJUSTMENTS (already applied — keep these changes, don't revert them):\n${adjustmentLog.map((r) => `  - "${r}"`).join('\n')}\n`
    : '';

  const existingMacros = recipe.macros || {};
  const macroHint = existingMacros.calories
    ? `(original was approx. calories: ${existingMacros.calories}, protein: ${existingMacros.protein}g, carbs: ${existingMacros.carbs}g, fat: ${existingMacros.fat}g — recalculate based on what changed)`
    : '(estimate from the adjusted ingredients — do not return zeros)';

  const prefsSection = householdPrefs
    ? `\nHOUSEHOLD PREFERENCES:\n${householdPrefs}\n`
    : '';
  const guardrailsSection = dietaryGuardrails ? `\n${dietaryGuardrails}\n` : '';
  const reviewFeedbackSection = buildReviewFeedbackSection(recipe);
  const unitsLine = measurementSystem === 'imperial'
    ? 'Use imperial units for ingredient amounts (oz, lb, cups, tsp, tbsp).'
    : 'Use metric units for ingredient amounts (g, kg, ml, L). Use tsp/tbsp for small amounts like spices and seasonings.';
  const langLine = language && language !== 'English'
    ? `\nLANGUAGE: ${language}\nWrite all recipe steps, ingredient names, and any notes in ${language}. JSON field names stay in English.`
    : '';

  return `${VOICE_GUIDE}

---

Adjust this recipe based on the user request. Change only what the request asks for. ${unitsLine}${langLine}
${prefsSection}${guardrailsSection}${reviewFeedbackSection}${adjustmentSection}${weekContext.length ? `\nOTHER DISHES PLANNED THIS WEEK: ${weekContext.join(', ')}\nVariety preference (soft guideline, not a hard rule): prefer ingredients that vary from what the other dishes already use — especially carb sources (e.g. if another dish has quinoa, lean toward a different carb like rice, potatoes, lentils, or pasta). Only apply this when the request leaves room for choice.\n` : ''}
RECIPE: ${recipe.name}
INGREDIENTS:
${ingredientsList || '  (none listed)'}
STEPS:
${stepsList || '  (none listed)'}

USER REQUEST: "${request}"

If the request adds an ingredient (e.g. "add rice", "add potatoes"), weave it fully into the
steps at the right moment — don't just list it in ingredients and append a side note at the end.
Update prep_time / cook_time if the addition changes the total cooking time.

Return ONLY a JSON object, no markdown:
{
  "ingredients": [{ "name": "...", "amount": "..." }],
  "steps": ["..."],
  "servings": ${recipe.servings || 2},
  "prepTime": <minutes as integer>,
  "cookTime": <minutes as integer>,
  "macros": { "calories": 520, "protein": 38, "carbs": 22, "fat": 28 }
}

For macros ${macroHint}. Macros must be TOTALS for the whole recipe (all servings combined), not per person. Each ingredient entry must be ONE purchasable item — never combine two distinct items with "and" in a single entry.`;
}
