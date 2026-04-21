import React, { useState, useEffect } from 'react';
import { X, Check, Eye, EyeOff, Trash2, Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import ThemeToggle from './ThemeToggle';
import PuterConnect from './PuterConnect';

// section: 'dietary' | 'settings' | undefined (all)
// initialPrefs: the preferences object from App.jsx state (avoids a second DB round-trip)
export default function PreferencesModal({ household, onClose, inline = false, section, initialPrefs }) {
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
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [extrasText, setExtrasText] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [savedPrefs, setSavedPrefs] = useState(false);
  const [savedKey, setSavedKey] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Sync from App.jsx preferences state when provided — this is the primary
  // data source for inline usage and avoids a separate DB query that can fail
  // if the client session hasn't fully initialised yet.
  useEffect(() => {
    if (!initialPrefs) return;
    setText(initialPrefs.preferences_text || '');
    setExtrasText(initialPrefs.plan_extras_text || '');
    setReminderEnabled(initialPrefs.reminder_enabled || false);
    setReminderDay(initialPrefs.reminder_day || 'sunday');
    setNotificationsEnabled(initialPrefs.notifications_enabled !== false);
    setKeyHint(initialPrefs.gemini_api_key_hint || null);
    setPuterHint(initialPrefs.puter_token_hint || null);
  }, [initialPrefs]);

  // Fallback DB query used when opened as a standalone modal (no initialPrefs).
  useEffect(() => {
    if (initialPrefs) return;
    supabase
      .from('household_preferences')
      .select('preferences_text, gemini_api_key_hint, puter_token_hint, reminder_enabled, reminder_day, plan_extras_text, notifications_enabled')
      .eq('household_id', household.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error('[PreferencesModal] load error:', error.message);
        if (data) {
          setText(data.preferences_text || '');
          setKeyHint(data.gemini_api_key_hint || null);
          setPuterHint(data.puter_token_hint || null);
          setReminderEnabled(data.reminder_enabled || false);
          setReminderDay(data.reminder_day || 'sunday');
          setExtrasText(data.plan_extras_text || '');
          setNotificationsEnabled(data.notifications_enabled !== false);
        }
      });
  }, [household.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSavePrefs() {
    setSavingPrefs(true);
    setSaveError('');
    try {
      const { error } = await supabase.from('household_preferences').upsert(
        { household_id: household.id, preferences_text: text, plan_extras_text: extrasText, updated_at: new Date().toISOString() },
        { onConflict: 'household_id' }
      );
      if (error) throw error;
      setSavedPrefs(true);
      setTimeout(() => setSavedPrefs(false), 2000);
      onClose?.();
    } catch (err) {
      setSaveError(err.message || 'Could not save — try again');
    } finally {
      setSavingPrefs(false);
    }
  }

  async function handleSaveKey() {
    setKeyError('');
    setSavingKey(true);
    try {
      const data = await apiFetch('/api/household/save-key', {
        method: 'POST',
        body: { key: keyInput },
      });
      setKeyHint(data.hint || null);
      setKeyInput('');
      setSavedKey(true);
      setTimeout(() => setSavedKey(false), 2000);
    } catch (err) {
      setKeyError(err.message || 'Could not save key');
    } finally {
      setSavingKey(false);
    }
  }

  async function handleSaveReminder(enabled, day) {
    await supabase.from('household_preferences').upsert(
      { household_id: household.id, reminder_enabled: enabled, reminder_day: day, updated_at: new Date().toISOString() },
      { onConflict: 'household_id' }
    );
  }

  async function handleRemoveKey() {
    setSavingKey(true);
    try {
      await apiFetch('/api/household/save-key', { method: 'POST', body: { key: '' } });
    } catch { /* surface nothing — the visual "removed" state is enough */ }
    setSavingKey(false);
    setKeyHint(null);
    setKeyInput('');
  }

  async function handleSavePuter() {
    setPuterError('');
    setSavingPuter(true);
    try {
      const data = await apiFetch('/api/household/save-key', {
        method: 'POST',
        body: { token: puterInput },
      });
      setPuterHint(data.hint || null);
      setPuterInput('');
      setSavedPuter(true);
      setTimeout(() => setSavedPuter(false), 2000);
    } catch (err) {
      setPuterError(err.message || 'Could not save token');
    } finally {
      setSavingPuter(false);
    }
  }

  async function handleRemovePuter() {
    setSavingPuter(true);
    try {
      await apiFetch('/api/household/save-key', { method: 'POST', body: { token: '' } });
    } catch { /* surface nothing — the visual "removed" state is enough */ }
    setSavingPuter(false);
    setPuterHint(null);
    setPuterInput('');
  }

  const showSettings = !section || section === 'settings';
  const showDietary  = !section || section === 'dietary';

  const inner = (
    <div className={inline ? "space-y-5" : "px-5 pb-5 space-y-5"}>
          {/* ── Appearance ── */}
          {showSettings && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide">Appearance</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-orange-900 font-medium">Theme</span>
              <ThemeToggle />
            </div>
          </div>
          )}

          {/* ── Dietary & taste preferences + also plan ── */}
          {showDietary && (
          <div className={`space-y-3 ${showSettings ? 'border-t border-orange-100 pt-4' : ''}`}>
            <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide">Dietary &amp; taste preferences</p>
            <textarea
              rows={4}
              placeholder="e.g. We're gluten intolerant and Thom doesn't eat pork. Evelina uses oat milk instead of regular milk. We prefer mostly plant-based meals during the week but enjoy chicken or fish on weekends. We love spicy food and prefer lighter meals — nothing too heavy or creamy."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full border border-orange-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-orange-300 resize-none leading-relaxed"
            />
            <div>
              <p className="text-xs text-orange-400 mb-1.5">Dinner's always in. Describe anything else you'd like planned.</p>
              <textarea
                rows={2}
                placeholder="e.g. Quick breakfasts Mon–Fri. Packed lunches for Tom. A bake for Sunday afternoon."
                value={extrasText}
                onChange={(e) => setExtrasText(e.target.value)}
                className="w-full border border-orange-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-orange-300 resize-none leading-relaxed"
              />
            </div>
            <button onClick={handleSavePrefs} disabled={savingPrefs}
              className="w-full py-2.5 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition disabled:opacity-50 text-sm flex items-center justify-center gap-2">
              {savedPrefs ? <><Check size={14} /> Saved</> : savingPrefs ? 'Saving…' : 'Save preferences'}
            </button>
            {saveError && <p className="text-xs text-red-500">{saveError}</p>}
          </div>
          )}

          {/* ── Reminders & notifications ── */}
          {showSettings && (<>
          <div className="space-y-3 border-t border-orange-100 pt-4">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-orange-600" />
              <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide">Reminders &amp; notifications</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-orange-900 font-medium">Weekly planning reminder</span>
                <p className="text-xs text-orange-400">Nudge when you haven't planned yet</p>
              </div>
              <button
                onClick={() => {
                  const next = !reminderEnabled;
                  setReminderEnabled(next);
                  handleSaveReminder(next, reminderDay);
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${reminderEnabled ? 'bg-orange-500' : 'bg-orange-200'}`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${reminderEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {reminderEnabled && (
              <select
                value={reminderDay}
                onChange={(e) => { setReminderDay(e.target.value); handleSaveReminder(reminderEnabled, e.target.value); }}
                className="w-full border border-orange-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 text-orange-900 bg-white"
              >
                {['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map((d) => (
                  <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                ))}
              </select>
            )}
            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="text-sm text-orange-900 font-medium">Activity notifications</span>
                <p className="text-xs text-orange-400">Badge when plan or starred recipes change</p>
              </div>
              <button
                onClick={async () => {
                  const next = !notificationsEnabled;
                  setNotificationsEnabled(next);
                  setSavingNotifications(true);
                  await supabase.from('household_preferences').upsert(
                    { household_id: household.id, notifications_enabled: next },
                    { onConflict: 'household_id' }
                  );
                  setSavingNotifications(false);
                }}
                disabled={savingNotifications}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 flex-shrink-0 ${notificationsEnabled ? 'bg-orange-500' : 'bg-orange-200'}`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${notificationsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>

          {/* ── Gemini API key ── */}
          <div className="space-y-2 border-t border-orange-100 pt-4">
            <div>
              <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide">Personal Gemini API key</p>
              <p className="text-xs text-orange-400 mt-0.5">
                Optional — the app has a built-in key. Add your own for unlimited use.{' '}
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"
                  className="underline hover:text-orange-600">Get a free key →</a>
              </p>
            </div>

            {keyHint ? (
              <div className="flex items-center justify-between bg-sage-100/50 border border-sage-200 rounded-xl px-3 py-2.5">
                <span className="text-sm text-sage-600">
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-orange-400 hover:text-orange-600 transition">
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
              <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide">Pay-as-you-go via Puter</p>
              <p className="text-xs text-orange-400 mt-0.5">
                Connect a Puter account for unlimited AI — Claude, GPT, Gemini and more. Puter bills you directly for what you use. Overrides the Gemini key above when set.
              </p>
            </div>

            {puterHint ? (
              <div className="flex items-center justify-between bg-sage-100/50 border border-sage-200 rounded-xl px-3 py-2.5">
                <span className="text-sm text-sage-600">
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
                {savedPuter && <p className="text-xs text-sage-600 flex items-center gap-1"><Check size={12} /> Connected.</p>}

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
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-orange-400 hover:text-orange-600 transition">
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
          </>)}
        </div>
  );

  if (inline) return inner;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-warm-lg w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-base font-bold text-orange-900">Household preferences</h2>
            <p className="text-xs text-orange-600 mt-0.5">Shared with your household</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-orange-400 hover:bg-orange-50 transition">
            <X size={16} />
          </button>
        </div>
        {inner}
      </div>
    </div>
  );
}
