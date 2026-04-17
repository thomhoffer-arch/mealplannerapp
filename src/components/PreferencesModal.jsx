import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

const RESTRICTION_OPTIONS = [
  'gluten-free', 'dairy-free', 'vegetarian', 'vegan',
  'nut-free', 'egg-free', 'halal', 'kosher',
];

export default function PreferencesModal({ household, onClose }) {
  const [restrictions, setRestrictions] = useState([]);
  const [dislikes, setDislikes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase
      .from('household_preferences')
      .select('*')
      .eq('household_id', household.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setRestrictions(data.dietary_restrictions || []);
          setDislikes(data.dislikes || '');
        }
      });
  }, [household.id]);

  function toggleRestriction(opt) {
    setRestrictions((prev) =>
      prev.includes(opt) ? prev.filter((r) => r !== opt) : [...prev, opt]
    );
  }

  async function handleSave() {
    setSaving(true);
    await supabase.from('household_preferences').upsert({
      household_id: household.id,
      dietary_restrictions: restrictions,
      intolerances: restrictions, // mirror restrictions as intolerances for the AI prompt
      dislikes,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'household_id' });
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-base font-bold text-orange-900">Household preferences</h2>
            <p className="text-xs text-orange-500 mt-0.5">Shared with your partner — used for AI recipe suggestions</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-orange-300 hover:bg-orange-50 transition">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Dietary restrictions */}
          <div>
            <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">Dietary restrictions &amp; intolerances</p>
            <div className="flex flex-wrap gap-2">
              {RESTRICTION_OPTIONS.map((opt) => {
                const active = restrictions.includes(opt);
                return (
                  <button key={opt} onClick={() => toggleRestriction(opt)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      active
                        ? 'bg-orange-500 text-white shadow-sm'
                        : 'bg-white text-orange-700 border border-orange-200 hover:border-orange-400'
                    }`}>
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dislikes */}
          <div>
            <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">Dislikes or ingredients to avoid</p>
            <textarea
              rows={2}
              placeholder="e.g. mushrooms, cilantro, blue cheese…"
              value={dislikes}
              onChange={(e) => setDislikes(e.target.value)}
              className="w-full border border-orange-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-orange-300 resize-none"
            />
          </div>

          {/* Save */}
          <button onClick={handleSave} disabled={saving}
            className="w-full py-2.5 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition disabled:opacity-50 text-sm flex items-center justify-center gap-2">
            {saved ? <><Check size={15} /> Saved</> : saving ? 'Saving…' : 'Save preferences'}
          </button>
        </div>
      </div>
    </div>
  );
}
