import React, { useState, useEffect } from 'react';
import { X, Check, Eye, EyeOff, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function PreferencesModal({ household, onClose }) {
  const [text, setText] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [keyHint, setKeyHint] = useState(null);   // e.g. "xK9f" — means a key is stored
  const [showKey, setShowKey] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [savedPrefs, setSavedPrefs] = useState(false);
  const [savedKey, setSavedKey] = useState(false);

  useEffect(() => {
    supabase
      .from('household_preferences')
      .select('preferences_text, gemini_api_key_hint')
      .eq('household_id', household.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setText(data.preferences_text || '');
          setKeyHint(data.gemini_api_key_hint || null);
        }
      });
  }, [household.id]);

  async function handleSavePrefs() {
    setSavingPrefs(true);
    await supabase.from('household_preferences').upsert(
      { household_id: household.id, preferences_text: text, updated_at: new Date().toISOString() },
      { onConflict: 'household_id' }
    );
    setSavingPrefs(false);
    setSavedPrefs(true);
    setTimeout(() => setSavedPrefs(false), 2000);
  }

  async function handleSaveKey() {
    setKeyError('');
    setSavingKey(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/household/save-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ key: keyInput }),
    });
    const data = await res.json();
    setSavingKey(false);
    if (!res.ok) { setKeyError(data.error || 'Could not save key'); return; }
    setKeyHint(data.hint || null);
    setKeyInput('');
    setSavedKey(true);
    setTimeout(() => setSavedKey(false), 2000);
  }

  async function handleRemoveKey() {
    setSavingKey(true);
    const { data: { session } } = await supabase.auth.getSession();
    await fetch('/api/household/save-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ key: '' }),
    });
    setSavingKey(false);
    setKeyHint(null);
    setKeyInput('');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-base font-bold text-orange-900">Household preferences</h2>
            <p className="text-xs text-orange-500 mt-0.5">Shared with your partner</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-orange-300 hover:bg-orange-50 transition">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-5">
          {/* ── Dietary & taste preferences ── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Dietary &amp; taste preferences</p>
            <textarea
              rows={4}
              placeholder="e.g. We're gluten intolerant and Tom doesn't eat pork. Anna uses oat milk instead of regular milk. We prefer mostly plant-based meals during the week but enjoy chicken or fish on weekends. We love spicy food and prefer lighter meals — nothing too heavy or creamy."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full border border-orange-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-orange-300 resize-none leading-relaxed"
            />
            <button onClick={handleSavePrefs} disabled={savingPrefs}
              className="w-full py-2.5 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition disabled:opacity-50 text-sm flex items-center justify-center gap-2">
              {savedPrefs ? <><Check size={14} /> Saved</> : savingPrefs ? 'Saving…' : 'Save preferences'}
            </button>
          </div>

          {/* ── Gemini API key ── */}
          <div className="space-y-2 border-t border-orange-100 pt-4">
            <div>
              <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Personal Gemini API key</p>
              <p className="text-xs text-orange-400 mt-0.5">
                Optional — the app has a built-in key. Add your own for unlimited use.{' '}
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"
                  className="underline hover:text-orange-600">Get a free key →</a>
              </p>
            </div>

            {keyHint ? (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                <span className="text-sm text-green-800">
                  Active key ending in <span className="font-mono font-semibold">···{keyHint}</span>
                </span>
                <button onClick={handleRemoveKey} disabled={savingKey}
                  className="text-red-400 hover:text-red-600 transition ml-3" title="Remove key">
                  <Trash2 size={15} />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    placeholder="AIza…"
                    value={keyInput}
                    onChange={(e) => { setKeyInput(e.target.value); setKeyError(''); }}
                    className="w-full border border-orange-200 rounded-xl px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-orange-300"
                  />
                  <button onClick={() => setShowKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-orange-300 hover:text-orange-500 transition">
                    {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {keyError && <p className="text-xs text-red-500">{keyError}</p>}
                <button onClick={handleSaveKey} disabled={savingKey || !keyInput.trim()}
                  className="w-full py-2.5 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition disabled:opacity-50 text-sm flex items-center justify-center gap-2">
                  {savedKey ? <><Check size={14} /> Key saved</> : savingKey ? 'Validating…' : 'Save key'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
