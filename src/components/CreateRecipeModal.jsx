import React, { useState } from 'react';
import { X, Plus, Trash2, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

function emptyIngredient() { return { id: Date.now() + Math.random(), name: '', amount: '' }; }
function emptyStep() { return { id: Date.now() + Math.random(), text: '' }; }

export default function CreateRecipeModal({ household, onClose, onAddToPlan }) {
  const [name, setName] = useState('');
  const [overview, setOverview] = useState('');
  const [servings, setServings] = useState(2);
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [ingredients, setIngredients] = useState([emptyIngredient(), emptyIngredient(), emptyIngredient()]);
  const [steps, setSteps] = useState([emptyStep(), emptyStep()]);
  const [addToPlan, setAddToPlan] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function updateIngredient(id, field, value) {
    setIngredients((prev) => prev.map((i) => i.id === id ? { ...i, [field]: value } : i));
  }
  function addIngredient() { setIngredients((prev) => [...prev, emptyIngredient()]); }
  function removeIngredient(id) { setIngredients((prev) => prev.filter((i) => i.id !== id)); }

  function updateStep(id, value) {
    setSteps((prev) => prev.map((s) => s.id === id ? { ...s, text: value } : s));
  }
  function addStep() { setSteps((prev) => [...prev, emptyStep()]); }
  function removeStep(id) { setSteps((prev) => prev.filter((s) => s.id !== id)); }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);

    const cleanIngredients = ingredients
      .filter((i) => i.name.trim())
      .map(({ name, amount }) => ({ name: name.trim(), amount: amount.trim() }));

    const cleanSteps = steps
      .filter((s) => s.text.trim())
      .map((s) => s.text.trim());

    const { data, error } = await supabase.from('user_recipes').insert({
      household_id: household.id,
      name: name.trim(),
      overview: overview.trim(),
      servings: Number(servings) || 2,
      prep_time: prepTime ? Number(prepTime) : null,
      cook_time: cookTime ? Number(cookTime) : null,
      ingredients: cleanIngredients,
      steps: cleanSteps,
    }).select().single();

    if (!error && addToPlan && data) {
      // Normalize to app recipe schema
      const recipe = {
        id: data.id,
        name: data.name,
        source: 'My Recipes',
        overview: data.overview,
        servings: data.servings,
        prepTime: data.prep_time,
        cookTime: data.cook_time,
        ingredients: data.ingredients,
        steps: data.steps,
        keywords: [],
        macros: {},
      };
      await onAddToPlan(recipe);
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 sticky top-0 bg-white border-b border-orange-50 z-10">
          <h2 className="text-base font-bold text-orange-900">Create your own recipe</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-orange-400 hover:bg-orange-50 transition">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-orange-900 uppercase tracking-wide mb-1">Recipe name *</label>
            <input
              type="text"
              placeholder="e.g. Grandma's tomato soup"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-orange-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-orange-300"
            />
          </div>

          {/* Overview */}
          <div>
            <label className="block text-xs font-semibold text-orange-900 uppercase tracking-wide mb-1">Description</label>
            <textarea
              rows={2}
              placeholder="A quick note about what makes this recipe special"
              value={overview}
              onChange={(e) => setOverview(e.target.value)}
              className="w-full border border-orange-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-orange-300 resize-none"
            />
          </div>

          {/* Times + servings */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Prep (min)', value: prepTime, set: setPrepTime },
              { label: 'Cook (min)', value: cookTime, set: setCookTime },
              { label: 'Servings', value: servings, set: setServings },
            ].map(({ label, value, set }) => (
              <div key={label}>
                <label className="block text-xs font-semibold text-orange-900 uppercase tracking-wide mb-1">{label}</label>
                <input
                  type="number"
                  min={1}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  className="w-full border border-orange-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 text-center"
                />
              </div>
            ))}
          </div>

          {/* Ingredients */}
          <div>
            <label className="block text-xs font-semibold text-orange-900 uppercase tracking-wide mb-2">Ingredients</label>
            <div className="space-y-2">
              {ingredients.map((ing) => (
                <div key={ing.id} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Amount"
                    value={ing.amount}
                    onChange={(e) => updateIngredient(ing.id, 'amount', e.target.value)}
                    className="w-20 border border-orange-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-orange-300"
                  />
                  <input
                    type="text"
                    placeholder="Ingredient"
                    value={ing.name}
                    onChange={(e) => updateIngredient(ing.id, 'name', e.target.value)}
                    className="flex-1 border border-orange-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-orange-300"
                  />
                  <button onClick={() => removeIngredient(ing.id)} className="text-orange-400 hover:text-red-400 transition flex-shrink-0">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addIngredient} className="mt-2 flex items-center gap-1 text-xs text-orange-600 hover:text-orange-900 transition font-medium">
              <Plus size={13} /> Add ingredient
            </button>
          </div>

          {/* Steps */}
          <div>
            <label className="block text-xs font-semibold text-orange-900 uppercase tracking-wide mb-2">Steps</label>
            <div className="space-y-2">
              {steps.map((step, idx) => (
                <div key={step.id} className="flex gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-orange-100 text-orange-600 text-xs flex items-center justify-center font-semibold mt-2">{idx + 1}</span>
                  <textarea
                    rows={2}
                    placeholder={`Step ${idx + 1}`}
                    value={step.text}
                    onChange={(e) => updateStep(step.id, e.target.value)}
                    className="flex-1 border border-orange-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-orange-300 resize-none"
                  />
                  <button onClick={() => removeStep(step.id)} className="text-orange-400 hover:text-red-400 transition flex-shrink-0 mt-2">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addStep} className="mt-2 flex items-center gap-1 text-xs text-orange-600 hover:text-orange-900 transition font-medium">
              <Plus size={13} /> Add step
            </button>
          </div>

          {/* Add to plan toggle */}
          <button onClick={() => setAddToPlan((v) => !v)}
            className={`flex items-center gap-2 text-sm font-medium transition ${addToPlan ? 'text-orange-900' : 'text-orange-400'}`}>
            <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition ${addToPlan ? 'bg-orange-500 border-orange-500' : 'border-orange-300'}`}>
              {addToPlan && <Check size={12} className="text-white" />}
            </div>
            Add to this week's meal plan
          </button>

          <button onClick={handleSave} disabled={saving || !name.trim()}
            className="w-full py-3 bg-orange-500 text-white rounded-xl font-semibold text-sm hover:bg-orange-600 transition disabled:opacity-50 flex items-center justify-center gap-2">
            {saved ? <><Check size={14} /> Saved!</> : saving ? 'Saving…' : 'Save recipe'}
          </button>
        </div>
      </div>
    </div>
  );
}
