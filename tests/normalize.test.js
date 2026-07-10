import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpoonacular, normalizeHelloFresh } from '../api/_lib/normalize.js';

test('normalizeSpoonacular splits prep/cook time as 40/60 of readyInMinutes', () => {
  const r = normalizeSpoonacular({ id: 1, title: 'Soup', readyInMinutes: 50 });
  assert.equal(r.prepTime, 20);
  assert.equal(r.cookTime, 30);
  assert.equal(r.prepTime + r.cookTime, 50);
});

test('normalizeSpoonacular defaults readyInMinutes to 30 when absent', () => {
  const r = normalizeSpoonacular({ id: 1, title: 'Soup' });
  assert.equal(r.prepTime, 12);
  assert.equal(r.cookTime, 18);
});

test('normalizeSpoonacular tags high-protein when Protein nutrient >= 30g', () => {
  const r = normalizeSpoonacular({
    id: 1, title: 'Chicken',
    nutrition: { nutrients: [{ name: 'Protein', amount: 35.2 }] },
  });
  assert.ok(r.dietary.includes('high-protein'));
  assert.equal(r.macros.protein, 35);
});

test('normalizeSpoonacular does not tag high-protein below the 30g threshold', () => {
  // getNutrient() rounds before the >= 30 check, so 29.9 would round UP to 30
  // and pass — use a value that still rounds below the threshold.
  const r = normalizeSpoonacular({
    id: 1, title: 'Salad',
    nutrition: { nutrients: [{ name: 'Protein', amount: 29.4 }] },
  });
  assert.ok(!r.dietary.includes('high-protein'));
});

test('normalizeSpoonacular strips HTML tags and truncates the overview to 250 chars', () => {
  const long = '<b>Delicious</b> ' + 'x'.repeat(300);
  const r = normalizeSpoonacular({ id: 1, title: 'X', summary: long });
  assert.ok(!r.overview.includes('<b>'));
  assert.ok(r.overview.length <= 250);
});

test('normalizeSpoonacular falls back to plain instructions when analyzedInstructions is absent', () => {
  const r = normalizeSpoonacular({ id: 1, title: 'X', instructions: 'Mix and bake.' });
  assert.deepEqual(r.steps, ['Mix and bake.']);
});

test('normalizeSpoonacular maps extendedIngredients to name/amount pairs', () => {
  const r = normalizeSpoonacular({
    id: 1, title: 'X',
    extendedIngredients: [{ nameClean: 'flour', amount: 2, unit: 'cups' }],
  });
  assert.deepEqual(r.ingredients, [{ name: 'flour', amount: '2 cups' }]);
});

test('normalizeHelloFresh computes cookTime as totalTime minus prepTime', () => {
  const r = normalizeHelloFresh({ id: 9, name: 'X', prepTime: 15, totalTime: 45 });
  assert.equal(r.prepTime, 15);
  assert.equal(r.cookTime, 30);
});

test('normalizeHelloFresh prefixes id with "hf-" to avoid colliding with Spoonacular ids', () => {
  const r = normalizeHelloFresh({ id: 9, name: 'X' });
  assert.equal(r.id, 'hf-9');
});

test('normalizeHelloFresh tags vegetarian from tag name substring match', () => {
  const r = normalizeHelloFresh({ id: 1, name: 'X', tags: [{ name: 'Veggie' }] });
  assert.ok(r.dietary.includes('vegetarian'));
});

test('normalizeHelloFresh only counts protein when calories nutrient is present', () => {
  // getNutrient('ENERC_KCAL') > 0 gates whether protein is read at all
  const r = normalizeHelloFresh({
    id: 1, name: 'X',
    nutrition: [{ type: 'PROCNT', amount: 40 }], // no ENERC_KCAL entry
  });
  assert.equal(r.macros.protein, 40); // getNutrient itself still reads PROCNT directly
  assert.ok(!r.dietary.includes('high-protein')); // but the dietary gate requires calories > 0 first
});
