import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function PreferencesModal({ household, onClose }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase
      .from('household_preferences')
      .select('preferences_text')
      .eq('household_id', household.id)
      .single()
      .then(({ data }) => { if (data) setText(data.preferences_text || ''); });
  }, [household.id]);

  async function handleSave() {
    setSaving(true);
    await supabase.from('household_preferences').upsert(
      { household_id: household.id, preferences_text: text, updated_at: new Date().toISOString() },
      { onConflict: 'household_id' }
    );
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-base font-bold text-orange-900">Household preferences</h2>
            <p className="text-xs text-orange-500 mt-0.5">Shared with your partner · used by AI to adapt recipes</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-orange-300 hover:bg-orange-50 transition">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-3">
          <textarea
            rows={5}
            placeholder={"Describe your preferences in plain English, for example:\n\n\"We're gluten intolerant and don't eat pork. Tom doesn't like mushrooms. We prefer lighter meals and love a bit of spice.\""}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full border border-orange-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-orange-300 resize-none leading-relaxed"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2.5 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition disabled:opacity-50 text-sm flex items-center justify-center gap-2"
          >
            {saved ? <><Check size={15} /> Saved</> : saving ? 'Saving…' : 'Save preferences'}
          </button>
        </div>
      </div>
    </div>
  );
}
