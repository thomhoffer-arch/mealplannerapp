import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDietaryGuardrails } from '../api/_lib/dietary-guardrails.js';

test('returns empty string when no household or member preferences are set', () => {
  assert.equal(buildDietaryGuardrails('', []), '');
  assert.equal(buildDietaryGuardrails(undefined, undefined), '');
});

test('vegetarian trigger blocks all meats with a household reason', () => {
  const block = buildDietaryGuardrails('we are vegetarian', []);
  assert.match(block, /HARD DIETARY PROHIBITIONS/);
  assert.match(block, /chicken\s+\[reason: household: "vegetarian"\]/);
  assert.match(block, /bacon/);
  assert.doesNotMatch(block, /shrimp/); // vegetarian list has no seafood
});

test('vegan trigger blocks dairy and eggs in addition to meat', () => {
  const block = buildDietaryGuardrails('strictly vegan household', []);
  assert.match(block, /cheese/);
  assert.match(block, /egg\s+\[/);
  assert.match(block, /honey/);
});

test('per-member preferences are attributed to that member, not "household"', () => {
  const block = buildDietaryGuardrails('', [
    { display_name: 'Alex', personal_prefs: 'gluten-free' },
  ]);
  assert.match(block, /wheat\s+\[reason: Alex: "gluten-free"\]/);
});

test('free-text "allergic to X" is parsed as a hard allergy block', () => {
  const block = buildDietaryGuardrails('allergic to sesame', []);
  assert.match(block, /sesame\s+\[reason: household: allergy\]/);
});

test('free-text "we don\'t eat X" is parsed as a household rule', () => {
  const block = buildDietaryGuardrails("we don't eat cilantro", []);
  assert.match(block, /cilantro\s+\[reason: household: household rule\]/);
});

test('multiple overlapping rules merge reasons for the same ingredient', () => {
  const block = buildDietaryGuardrails('vegetarian and halal', []);
  // bacon is blocked by both the vegetarian and halal rules
  const baconLine = block.split('\n').find((l) => l.trim().startsWith('- bacon'));
  assert.ok(baconLine, 'expected a bacon line in the guardrail block');
  assert.match(baconLine, /vegetarian/);
  assert.match(baconLine, /halal/);
});

test('ingredient lines are sorted alphabetically', () => {
  const block = buildDietaryGuardrails('vegan', []);
  const ingredientLines = block
    .split('\n')
    .filter((l) => l.trim().startsWith('- '))
    .map((l) => l.trim().slice(2).split(' ')[0]);
  const sorted = [...ingredientLines].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(ingredientLines, sorted);
});
