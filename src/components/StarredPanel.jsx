import React from 'react';
import { X, Star, Trash2, Plus, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';

const PRIORITY_CONFIG = [
  { value: 1, label: 'Every week',  color: 'bg-orange-500 text-white border-orange-500' },
  { value: 2, label: 'Biweekly',   color: 'bg-orange-100 text-orange-900 border-orange-200' },
  { value: 3, label: 'Occasional', color: 'bg-orange-50 text-orange-400 border-orange-200' },
];

export default function StarredPanel({ starredItems, household, onClose, onAddToPlan, onUnstar, onPlanWeek }) {
  async function setPriority(recipeId, priority) {
    await supabase
      .from('starred_recipes')
      .update({ rotation_priority: priority })
      .eq('household_id', household.id)
      .eq('recipe_id', recipeId);
  }

  function cyclePriority(item) {
    const next = ((item.rotation_priority || 2) % 3) + 1;
    setPriority(item.recipe_id, next);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-warm-lg w-full max-w-sm max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-orange-50">
          <div>
            <h2 className="text-base font-bold text-orange-900 flex items-center gap-2">
              <Star size={16} className="text-orange-600 fill-amber-400" />
              Starred recipes
            </h2>
            <p className="text-xs text-orange-400 mt-0.5">Set rotation priority — used by the week planner</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-orange-400 hover:bg-orange-50 transition">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
          {starredItems.length === 0 ? (
            <div className="text-center py-10">
              <Star size={36} className="mx-auto mb-3 text-orange-400" />
              <p className="text-sm text-orange-400 font-medium">No starred recipes yet</p>
              <p className="text-xs text-orange-400 mt-1">Star a recipe from the library and it'll appear here</p>
            </div>
          ) : (
            starredItems.map((item) => {
              const priority = PRIORITY_CONFIG.find((p) => p.value === (item.rotation_priority || 2));
              return (
                <div key={item.recipe_id} className="bg-orange-50 rounded-xl p-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-orange-900 leading-snug">{item.recipe_data?.name}</p>
                    <p className="text-xs text-orange-400 mt-0.5">{item.recipe_data?.source}</p>
                    {/* Priority cycle button */}
                    <button
                      onClick={() => cyclePriority(item)}
                      className={`mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-semibold transition hover:opacity-80 ${priority.color}`}
                      title="Tap to change rotation priority"
                    >
                      {priority.label}
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => onAddToPlan(item.recipe_data)}
                      className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 hover:bg-orange-200 transition"
                      title="Add to this week"
                    >
                      <Plus size={15} />
                    </button>
                    <button
                      onClick={() => onUnstar(item.recipe_data)}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-orange-400 hover:text-red-400 hover:bg-red-50 transition"
                      title="Remove from starred"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-5 py-4 border-t border-orange-50">
          <button
            onClick={onPlanWeek}
            className="w-full py-3 bg-orange-500 text-white rounded-full font-semibold text-sm hover:bg-orange-600 transition flex items-center justify-center gap-2"
          >
            <Sparkles size={15} />
            Plan my week
          </button>
        </div>
      </div>
    </div>
  );
}
