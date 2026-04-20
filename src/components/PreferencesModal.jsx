import React, { useState, useEffect } from 'react';
import { X, Check, Eye, EyeOff, Trash2, Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ThemeToggle from './ThemeToggle';
import PuterConnect from './PuterConnect';

export default function PreferencesModal({ household, onClose, inline = false }) {
  const [text, setText] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [keyHint, setKeyHint] = useState(null);
  const [puterInput, setPuterInput] = useState('');
  const [puterHint, setPuterHint] = useState(null);
  const [puterError, setPuterError] = useState('');
  const [savingPuter, setSavingPuter] = useState(false);
  const [savedPuter, setSavedPuter] = useState(false);
  const [showPuter, setShowPuter] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderDay, setReminderDay] = useState('sunday');
  const [savingReminder, setSavingReminder] = useState(false);
  const [extrasText, setExtrasText] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [savedPrefs, setSavedPrefs] = useState(false);
  const [savedKey, setSavedKey] = useState(false);

  useEffect(() => {
    supabase
      .from('household_preferences')
      .select('preferences_text, gemini_api_key_hint, puter_token_hint, reminder_enabled, reminder_day, plan_extras_text')
      .eq('household_id', household.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setText(data.preferences_text || '');
          setKeyHint(data.gemini_api_key_hint || null);
          setPuterHint(data.puter_token_hint || null);
          setReminderEnabled(data.reminder_enabled || false);
          setReminderDay(data.reminder_day || 'sunday');
          setExtrasText(data.plan_extras_text || '');
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

  async function handleSaveExtras() {
    await supabase.from('household_preferences').upsert(
      { household_id: household.id, plan_extras_text: extrasText },
      { onConflict: 'household_id' }
    );
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

  async function handleSaveReminder() {
    setSavingReminder(true);
    await supabase.from('household_preferences').upsert(
      { household_id: household.id, reminder_enabled: reminderEnabled, reminder_day: reminderDay, updated_at: new Date().toISOString() },
      { onConflict: 'household_id' }
    );
    setSavingReminder(false);
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

  async function handleSavePuter() {
    setPuterError('');
    setSavingPuter(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/household/save-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ token: puterInput }),
    });
    const data = await res.json();
    setSavingPuter(false);
    if (!res.ok) { setPuterError(data.error || 'Could not save token'); return; }
    setPuterHint(data.hint || null);
    setPuterInput('');
    setSavedPuter(true);
    setTimeout(() => setSavedPuter(false), 2000);
  }

  async function handleRemovePuter() {
    setSavingPuter(true);
    const { data: { session } } = await supabase.auth.getSession();
    await fetch('/api/household/save-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ token: '' }),
    });
    setSavingPuter(false);
    setPuterHint(null);
    setPuterInput('');
  }

  const inner = (
    <div className={inline ? "space-y-5" : "px-5 pb-5 space-y-5"}>
          {/* ── Appearance ── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Appearance</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-orange-800 font-medium">Theme</span>
              <ThemeToggle />
            </div>
          </div>

          {/* ── Dietary & taste preferences ── */}
          <div className="space-y-2 border-t border-orange-100 pt-4">
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

          {/* ── What else to plan ── */}
          <div className="space-y-2 border-t border-orange-100 pt-4">
            <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Also plan</p>
            <p className="text-xs text-orange-400">Dinner's always in. Describe anything else you'd like planned — the rest is up to you.</p>
            <textarea
              rows={3}
              placeholder="e.g. Quick breakfasts Mon–Fri. Packed lunches for Tom. A bake for Sunday afternoon."
              value={extrasText}
              onChange={(e) => setExtrasText(e.target.value)}
              onBlur={handleSaveExtras}
              className="w-full border border-orange-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-orange-300 resize-none leading-relaxed"
            />
          </div>

          {/* ── Planning reminder ── */}
          <div className="space-y-2 border-t border-orange-100 pt-4">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-orange-600" />
              <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Weekly planning reminder</p>
            </div>
            <p className="text-xs text-orange-400">Get an in-app nudge on your chosen day when you haven't planned yet.</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-orange-800 font-medium">Enable reminder</span>
              <button
                onClick={() => setReminderEnabled((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${reminderEnabled ? 'bg-orange-500' : 'bg-orange-200'}`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${reminderEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {reminderEnabled && (
              <select
                value={reminderDay}
                onChange={(e) => setReminderDay(e.target.value)}
                className="w-full border border-orange-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 text-orange-900 bg-white"
              >
                {['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map((d) => (
                  <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                ))}
              </select>
            )}
            <button onClick={handleSaveReminder} disabled={savingReminder}
              className="w-full py-2.5 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition disabled:opacity-50 text-sm">
              {savingReminder ? 'Saving…' : 'Save reminder'}
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

          {/* ── Puter token (pay-as-you-go) ── */}
          <div className="space-y-2 border-t border-orange-100 pt-4">
            <div>
              <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Pay-as-you-go via Puter</p>
              <p className="text-xs text-orange-400 mt-0.5">
                Connect a Puter account for unlimited AI — Claude, GPT, Gemini and more. Puter bills you directly for what you use. Overrides the Gemini key above when set.
              </p>
            </div>

            {puterHint ? (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                <span className="text-sm text-green-800">
                  Connected — token ending in <span className="font-mono font-semibold">···{puterHint}</span>
                </span>
                <button onClick={handleRemovePuter} disabled={savingPuter}
                  className="text-red-400 hover:text-red-600 transition ml-3" title="Disconnect">
                  <Trash2 size={15} />
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <PuterConnect
                  label="Connect with Puter"
                  onConnected={(hint) => { setPuterHint(hint || null); setSavedPuter(true); setTimeout(() => setSavedPuter(false), 2000); }}
                />
                {savedPuter && <p className="text-xs text-green-600 flex items-center gap-1"><Check size={12} /> Connected.</p>}

                <details className="text-xs text-orange-400">
                  <summary className="cursor-pointer hover:text-orange-600 transition">Paste a token manually instead</summary>
                  <div className="mt-2 space-y-2">
                    <p className="text-orange-400/80 italic">
                      Sign in at puter.com, open the browser console, and run <span className="font-mono">puter.authToken</span> to copy it.
                    </p>
                    <div className="relative">
                      <input
                        type={showPuter ? 'text' : 'password'}
                        placeholder="Puter auth token"
                        value={puterInput}
                        onChange={(e) => { setPuterInput(e.target.value); setPuterError(''); }}
                        className="w-full border border-orange-200 rounded-xl px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-orange-300"
                      />
                      <button onClick={() => setShowPuter((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-orange-300 hover:text-orange-500 transition">
                        {showPuter ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    {puterError && <p className="text-red-500">{puterError}</p>}
                    <button onClick={handleSavePuter} disabled={savingPuter || !puterInput.trim()}
                      className="w-full py-2.5 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition disabled:opacity-50 text-sm flex items-center justify-center gap-2">
                      {savingPuter ? 'Validating…' : 'Save token'}
                    </button>
                  </div>
                </details>
              </div>
            )}
          </div>
        </div>
  );

  if (inline) return inner;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-base font-bold text-orange-900">Household preferences</h2>
            <p className="text-xs text-orange-500 mt-0.5">Shared with your household</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-orange-300 hover:bg-orange-50 transition">
            <X size={16} />
          </button>
        </div>
        {inner}
      </div>
    </div>
  );
}
