import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowRight } from 'lucide-react';
import { Scribble } from './glyphs';

// Shown once, after the first sign-in, before the user lands in the planner.
// Captures their name and a free-text preferences blob that we feed into the
// LLM prompt for recipe suggestions. Marks household_members.onboarded_at so
// we don't show it again.
export default function OnboardingScreen({ user, household, memberProfile, onDone }) {
  const initialName =
    memberProfile?.display_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    (user?.email ? user.email.split('@')[0] : '');

  const [name, setName] = useState(initialName);
  const [prefs, setPrefs] = useState(memberProfile?.personal_prefs || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleContinue() {
    setErr('');
    if (!name.trim()) {
      setErr('A name helps — even just a first name.');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from('household_members')
      .update({
        display_name:   name.trim(),
        personal_prefs: prefs.trim() || null,
        onboarded_at:   new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('household_id', household.id)
      .select();
    if (error) {
      setErr(error.message);
      setSaving(false);
      return;
    }
    // RLS silently drops rows the caller can't update. If the update
    // didn't match anything, surface a clear error instead of bouncing
    // the user back to this screen on every refresh.
    if (!data || data.length === 0) {
      setErr('Could not save — run supabase/migration_add_member_update_policy.sql in your Supabase project, then try again.');
      setSaving(false);
      return;
    }
    onDone?.();
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4 py-10">
      <div className="w-full max-w-xl">
        <p className="font-display italic text-orange-600/80 text-sm mb-3 tracking-wide text-center">— welcome to the kitchen.</p>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold text-orange-900 leading-[1] mb-2 text-center tracking-tight">
          Two quick{' '}
          <span className="relative inline-block italic font-normal text-orange-600">
            things.
            <Scribble className="absolute left-0 -bottom-2 w-full text-orange-600/70 pointer-events-none" aria-hidden="true" />
          </span>
        </h1>
        <p className="text-center text-orange-900/80 mt-4 mb-8 text-sm">
          Then we'll suggest a few dinners you might like.
        </p>

        <div className="bg-white rounded-[22px] border border-orange-200 shadow-warm p-7 sm:p-9 space-y-6">
          <div>
            <label className="font-display text-sm font-semibold text-orange-900 block mb-1.5">
              What shall we call you?
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First name is fine"
              className="w-full border border-orange-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-orange-400 placeholder-orange-300 bg-white"
            />
          </div>

          <div>
            <label className="font-display text-sm font-semibold text-orange-900 block mb-1.5">
              How do you eat, usually?
            </label>
            <p className="text-xs text-orange-900/75 mb-2 leading-relaxed">
              A sentence or two is plenty. Dietary stuff, things you hate, how much time you usually have — the planner will keep it in mind.
            </p>
            <textarea
              value={prefs}
              onChange={(e) => setPrefs(e.target.value)}
              rows={5}
              placeholder="e.g. Vegetarian but my partner eats chicken. Hate mushrooms. Weeknights should be under 30 min; we go slower at weekends."
              className="w-full border border-orange-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-orange-400 placeholder-orange-300 bg-white resize-none leading-relaxed"
            />
          </div>

          {err && <p className="text-sm text-red-500 bg-red-50 rounded-2xl px-4 py-3">{err}</p>}

          <button
            type="button"
            onClick={handleContinue}
            disabled={saving}
            className="w-full py-3.5 bg-orange-500 text-white rounded-full font-medium hover:bg-orange-600 transition disabled:opacity-50 text-sm flex items-center justify-center gap-2 shadow-warm-lg"
          >
            {saving ? 'Saving…' : <>See some suggestions <ArrowRight size={15} /></>}
          </button>
          <p className="text-center text-xs text-orange-600/70 -mt-2">
            You can update this any time in Settings.
          </p>
        </div>
      </div>
    </div>
  );
}
