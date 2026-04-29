import React, { useState, useEffect } from 'react';
import { X, Check, Eye, EyeOff, Trash2, Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import ThemeToggle from './ThemeToggle';
import PuterConnect from './PuterConnect';

// section: 'dietary' | 'settings' | undefined (all)
// initialPrefs: the preferences object from App.jsx state (avoids a second DB round-trip)
// personalPrefs: the current user's personal_prefs string from household_members
// onSavePersonalPrefs(text): saves personal_prefs to household_members for the current user
export default function PreferencesModal({ household, onClose, onPrefsChange, inline = false, section, initialPrefs, personalPrefs: personalPrefsProp = '', onSavePersonalPrefs, memberName = '' }) {
  const [text, setText] = useState('');
  const [personalText, setPersonalText] = useState('');
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [savedPersonal, setSavedPersonal] = useState(false);
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
  const [showWeeklyMacros, setShowWeeklyMacros] = useState(true);
  const [savingMacros, setSavingMacros] = useState(false);
  const [mealPrepMode, setMealPrepMode] = useState(false);
  const [mealPrepSetByName, setMealPrepSetByName] = useState('');
  const [savingMealPrep, setSavingMealPrep] = useState(false);
  const [measurementSystem, setMeasurementSystem] = useState('metric');
  const [savingMeasurement, setSavingMeasurement] = useState(false);
  const [dietVariety, setDietVariety] = useState('balanced');
  const [savingDietVariety, setSavingDietVariety] = useState(false);
  const [extrasText, setExtrasText] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [savedPrefs, setSavedPrefs] = useState(false);
  const [savedKey, setSavedKey] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setPersonalText(personalPrefsProp || '');
  }, [personalPrefsProp]);

  async function handleSavePersonal() {
    setSavingPersonal(true);
    try {
      await onSavePersonalPrefs?.(personalText);
      setSavedPersonal(true);
      setTimeout(() => setSavedPersonal(false), 2000);
    } finally {
      setSavingPersonal(false);
    }
  }

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
    setShowWeeklyMacros(initialPrefs.show_weekly_macros !== false);
    setMealPrepMode(initialPrefs.meal_prep_mode || false);
    setMealPrepSetByName(initialPrefs.meal_prep_set_by_name || '');
    setMeasurementSystem(initialPrefs.measurement_system || 'metric');
    setDietVariety(initialPrefs.diet_variety || 'balanced');
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
      // Push saved values directly into App.jsx state — no re-query needed.
      onPrefsChange?.({ preferences_text: text, plan_extras_text: extrasText });
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
      onPrefsChange?.({ gemini_api_key_hint: data.hint || null });
    } catch (err) {
      setKeyError(err.message || 'Could not save key');
    } finally {
      setSavingKey(false);
    }
  }

  async function handleSaveReminder(enabled, day) {
    const { error } = await supabase.from('household_preferences').upsert(
      { household_id: household.id, reminder_enabled: enabled, reminder_day: day, updated_at: new Date().toISOString() },
      { onConflict: 'household_id' }
    );
    if (!error) onPrefsChange?.({ reminder_enabled: enabled, reminder_day: day });
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
      onPrefsChange?.({ puter_token_hint: data.hint || null });
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

  const showAppearance       = !section || section === 'settings' || section === 'appearance';
  const showReminder         = !section || section === 'settings' || section === 'reminder';
  const showPersonalDietary  = !section || section === 'dietary' || section === 'personal-dietary';
  const showHouseholdDietary = !section || section === 'dietary' || section === 'household-dietary';

  const inner = (
    <div className={inline ? "space-y-5" : "px-5 pb-5 space-y-5"}>
          {/* ── Appearance & units ── */}
          {showAppearance && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide">Appearance</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-orange-900 font-medium">Theme</span>
              <ThemeToggle />
            </div>
            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="text-sm text-orange-900 font-medium">Measurement system</span>
                <p className="text-xs text-orange-400">Shopping list amounts and recipe suggestions</p>
              </div>
              <div className="flex gap-1">
                {['metric', 'imperial'].map((sys) => (
                  <button
                    key={sys}
                    disabled={savingMeasurement}
                    onClick={async () => {
                      if (sys === measurementSystem) return;
                      setMeasurementSystem(sys);
                      setSavingMeasurement(true);
                      const { error } = await supabase.from('household_preferences').upsert(
                        { household_id: household.id, measurement_system: sys },
                        { onConflict: 'household_id' }
                      );
                      setSavingMeasurement(false);
                      if (!error) onPrefsChange?.({ measurement_system: sys });
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition disabled:opacity-50 ${sys === measurementSystem ? 'bg-orange-500 text-white' : 'bg-white border border-orange-200 text-orange-700 hover:bg-orange-100'}`}
                  >
                    {sys === 'metric' ? 'Metric' : 'Imperial'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          )}

          {/* ── Personal dietary preferences ── */}
          {showPersonalDietary && (
          <div className={`space-y-2 ${showAppearance ? 'border-t border-orange-100 pt-4' : ''}`}>
            <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide">Your dietary wishes</p>
            <p className="text-xs text-orange-400">Only applies to you — won't affect other household members.</p>
            <textarea
              rows={3}
              placeholder="e.g. I'm lactose intolerant. I don't eat red meat. I prefer lighter meals in the evening."
              value={personalText}
              onChange={(e) => setPersonalText(e.target.value)}
              className="w-full border border-orange-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-orange-300 resize-none leading-relaxed"
            />
            <button onClick={handleSavePersonal} disabled={savingPersonal}
              className="w-full py-2.5 border border-orange-200 text-orange-500 bg-orange-50 rounded-full font-medium text-sm hover:border-orange-300 hover:bg-orange-100 hover:text-orange-600 transition disabled:opacity-50 flex items-center justify-center gap-2">
              {savedPersonal ? <><Check size={14} /> Saved</> : savingPersonal ? 'Saving…' : 'Save my preferences'}
            </button>
          </div>
          )}

          {/* ── Shared household dietary preferences ── */}
          {showHouseholdDietary && (
          <div className={`space-y-2 ${showAppearance || showPersonalDietary ? 'border-t border-orange-100 pt-4' : ''}`}>
            <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide">Shared household preferences <span className="font-normal normal-case text-orange-400">(optional)</span></p>
            <p className="text-xs text-orange-400">Applies to everyone — cuisine styles, things you all agree on.</p>

            <textarea
              rows={3}
              placeholder="e.g. We prefer mostly plant-based during the week. We love spicy food. Nothing too heavy or creamy."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full border border-orange-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-orange-300 resize-none leading-relaxed"
            />
            <div>
              <p className="text-xs text-orange-400 mb-1.5">Dinner's always in. Describe anything else you'd all like planned.</p>
              <textarea
                rows={2}
                placeholder="e.g. Quick breakfasts Mon–Fri. Packed lunches for Tom. A bake for Sunday afternoon."
                value={extrasText}
                onChange={(e) => setExtrasText(e.target.value)}
                className="w-full border border-orange-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-orange-300 resize-none leading-relaxed"
              />
            </div>
            <button onClick={handleSavePrefs} disabled={savingPrefs}
              className="w-full py-2.5 border border-orange-200 text-orange-500 bg-orange-50 rounded-full font-medium text-sm hover:border-orange-300 hover:bg-orange-100 hover:text-orange-600 transition disabled:opacity-50 flex items-center justify-center gap-2">
              {savedPrefs ? <><Check size={14} /> Saved</> : savingPrefs ? 'Saving…' : 'Save household preferences'}
            </button>
            {saveError && <p className="text-xs text-red-500">{saveError}</p>}

            {/* Meal prep mode — at the bottom, description hidden by default */}
            <div className="border-t border-orange-50 pt-3">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-orange-900">Meal prep mode</p>
                  {mealPrepMode && mealPrepSetByName && (
                    <p className="text-[11px] text-orange-400 mt-0.5">Enabled by <span className="font-semibold text-orange-600">{mealPrepSetByName}</span></p>
                  )}
                </div>
                <button
                  onClick={async () => {
                    const next = !mealPrepMode;
                    const byName = next ? (memberName || '') : '';
                    setMealPrepMode(next);
                    setMealPrepSetByName(byName);
                    setSavingMealPrep(true);
                    const { error } = await supabase.from('household_preferences').upsert(
                      { household_id: household.id, meal_prep_mode: next, meal_prep_set_by_name: byName },
                      { onConflict: 'household_id' }
                    );
                    setSavingMealPrep(false);
                    if (!error) onPrefsChange?.({ meal_prep_mode: next, meal_prep_set_by_name: byName });
                  }}
                  disabled={savingMealPrep}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${mealPrepMode ? 'bg-orange-500' : 'bg-orange-200'}`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${mealPrepMode ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <details className="mt-1">
                <summary className="text-[11px] text-orange-400 cursor-pointer hover:text-orange-600 transition select-none">What's this?</summary>
                <p className="text-xs text-orange-400 mt-1 leading-relaxed">Plan around batch cooking — 2–3 dishes cooked in large portions, eaten across the week. Overrides the standard "varied dish each day" rule.</p>
              </details>
            </div>

            {/* Diet variety */}
            <div className="border-t border-orange-50 pt-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-orange-900">Variety level</p>
                  <p className="text-xs text-orange-400">How adventurous the weekly plan should be</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {[
                    { value: 'familiar',    label: 'Familiar' },
                    { value: 'balanced',    label: 'Balanced' },
                    { value: 'adventurous', label: 'Adventurous' },
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      disabled={savingDietVariety}
                      onClick={async () => {
                        if (value === dietVariety) return;
                        setDietVariety(value);
                        setSavingDietVariety(true);
                        const { error } = await supabase.from('household_preferences').upsert(
                          { household_id: household.id, diet_variety: value },
                          { onConflict: 'household_id' }
                        );
                        setSavingDietVariety(false);
                        if (!error) onPrefsChange?.({ diet_variety: value });
                      }}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold transition disabled:opacity-50 ${value === dietVariety ? 'bg-orange-500 text-white' : 'bg-white border border-orange-200 text-orange-700 hover:bg-orange-100'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          )}

          {/* ── Reminders & notifications ── */}
          {showReminder && (<>
          <div className={`space-y-3 ${showAppearance || showPersonalDietary || showHouseholdDietary ? 'border-t border-orange-100 pt-4' : ''}`}>
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
                  const { error } = await supabase.from('household_preferences').upsert(
                    { household_id: household.id, notifications_enabled: next },
                    { onConflict: 'household_id' }
                  );
                  setSavingNotifications(false);
                  if (!error) onPrefsChange?.({ notifications_enabled: next });
                }}
                disabled={savingNotifications}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 flex-shrink-0 ${notificationsEnabled ? 'bg-orange-500' : 'bg-orange-200'}`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${notificationsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="text-sm text-orange-900 font-medium">Weekly macros</span>
                <p className="text-xs text-orange-400">Show nutrition totals on the week view</p>
              </div>
              <button
                onClick={async () => {
                  const next = !showWeeklyMacros;
                  setShowWeeklyMacros(next);
                  setSavingMacros(true);
                  const { error } = await supabase.from('household_preferences').upsert(
                    { household_id: household.id, show_weekly_macros: next },
                    { onConflict: 'household_id' }
                  );
                  setSavingMacros(false);
                  if (!error) onPrefsChange?.({ show_weekly_macros: next });
                }}
                disabled={savingMacros}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 flex-shrink-0 ${showWeeklyMacros ? 'bg-orange-500' : 'bg-orange-200'}`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${showWeeklyMacros ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
          </>)}

          {/* ── Gemini API key ── */}
          {showAppearance && (<>
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
                  className="w-full py-2.5 border border-orange-200 text-orange-500 bg-orange-50 rounded-full font-medium text-sm hover:border-orange-300 hover:bg-orange-100 hover:text-orange-600 transition disabled:opacity-50 flex items-center justify-center gap-2">
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
                Connect a Puter account for unlimited suggestions — Claude, GPT, Gemini and more. Puter bills you directly for what you use. Overrides the Gemini key above when set.
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
                      className="w-full py-2.5 border border-orange-200 text-orange-500 bg-orange-50 rounded-full font-medium text-sm hover:border-orange-300 hover:bg-orange-100 hover:text-orange-600 transition disabled:opacity-50 flex items-center justify-center gap-2">
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
