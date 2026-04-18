import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Check, ArrowRight } from 'lucide-react';

const FEATURES = [
  { emoji: '🔍', title: 'Discover recipes',        desc: 'From HelloFresh, Marley Spoon, Spoonacular and more — filtered by diet, time, and cuisine.' },
  { emoji: '✨', title: 'AI week planner',          desc: 'Generate a full varied week of dinners in one tap, grounded in your favourites.' },
  { emoji: '🛒', title: 'Shared shopping list',     desc: 'Ingredients from your plan, auto-merged. Tick off items together in real time.' },
  { emoji: '⭐', title: 'Star your favourites',     desc: 'Save recipes and set how often they return — weekly, biweekly, or occasionally.' },
  { emoji: '👫', title: 'Made for two',             desc: 'Invite your partner. Every change syncs instantly on both phones.' },
  { emoji: '🔗', title: 'Import from anywhere',     desc: 'Paste a recipe URL and we parse it. Or write your own from scratch.' },
];

const PREMIUM_PRICE     = 5.99;
const PREMIUM_OWN_PRICE = 4.99;

// Google brand mark rendered inline so we don't need a separate asset.
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.79 2.72v2.26h2.9c1.7-1.56 2.69-3.86 2.69-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.36 0-4.36-1.6-5.07-3.74H.95v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.93 10.68A5.4 5.4 0 0 1 3.64 9c0-.58.1-1.15.29-1.68V4.99H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.01l2.98-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .95 4.99l2.98 2.33C4.64 5.18 6.64 3.58 9 3.58z"/>
    </svg>
  );
}

export default function AuthScreen() {
  const [view, setView] = useState('landing');
  const [selectedPlan, setSelectedPlan] = useState('free');
  const [premiumOwnKey, setPremiumOwnKey] = useState(false);
  const [mode, setMode] = useState('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [done, setDone] = useState(false);

  const inviteToken = new URLSearchParams(window.location.search).get('invite');
  const initialView = inviteToken ? 'auth' : view;

  async function handleGoogle() {
    setError('');
    setOauthLoading(true);
    try {
      const redirectTo = inviteToken
        ? `${window.location.origin}/?invite=${encodeURIComponent(inviteToken)}`
        : window.location.origin;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(err.message);
      setOauthLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        if (inviteToken) {
          const { data: { user } } = await supabase.auth.getUser();
          await supabase.rpc('join_household_by_token', { p_token: inviteToken, p_user_id: user.id });
          window.history.replaceState({}, '', window.location.pathname);
        }
      } else {
        const { data: { user }, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;
        if (!user) { setDone(true); setLoading(false); return; }
        if (inviteToken) {
          await supabase.rpc('join_household_by_token', { p_token: inviteToken, p_user_id: user.id });
          window.history.replaceState({}, '', window.location.pathname);
        } else {
          await supabase.rpc('create_household_for_user', { uid: user.id });
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Email confirmation sent ────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-warm-lg border border-orange-100 p-10 w-full max-w-sm text-center">
          <div className="w-14 h-14 bg-sage-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <Check className="w-7 h-7 text-sage-600" />
          </div>
          <h2 className="font-display text-2xl font-semibold text-orange-900 mb-2">Check your email</h2>
          <p className="text-sm text-orange-600 leading-relaxed">
            We sent a confirmation link to <strong className="text-orange-800">{email}</strong>. Click it to activate your account.
          </p>
        </div>
      </div>
    );
  }

  // ── Landing ────────────────────────────────────────────────────────────────
  if (initialView === 'landing' && view === 'landing') {
    return (
      <div className="min-h-screen bg-paper">

        {/* Nav */}
        <nav className="sticky top-0 z-20 bg-orange-50/80 backdrop-blur-md border-b border-orange-100 px-6 py-3.5 flex items-center justify-between">
          <span className="font-display text-lg font-semibold text-orange-900 tracking-tight">Meal Planner</span>
          <button
            onClick={() => { setMode('login'); setView('auth'); }}
            className="text-sm text-orange-700 font-medium hover:text-orange-900 transition"
          >
            Sign in
          </button>
        </nav>

        {/* Hero */}
        <section className="max-w-2xl mx-auto px-6 pt-24 pb-16 text-center">
          <h1 className="font-display text-5xl sm:text-6xl font-semibold text-orange-900 leading-[1.05] mb-6">
            Plan your week.<br />
            <span className="italic font-normal text-orange-600">Together.</span>
          </h1>
          <p className="text-base text-orange-700/80 max-w-md mx-auto leading-relaxed mb-9">
            A shared kitchen for the two of you. Save the recipes you love, plan the week in minutes, and let the shopping list build itself.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => setView('plan')}
              className="px-7 py-3.5 bg-orange-500 text-white rounded-full font-medium hover:bg-orange-600 transition text-sm flex items-center justify-center gap-2 shadow-warm-lg"
            >
              Get started free <ArrowRight size={16} />
            </button>
            <button
              onClick={() => { setMode('login'); setView('auth'); }}
              className="px-7 py-3.5 border border-orange-300 text-orange-800 rounded-full font-medium hover:bg-orange-50 transition text-sm"
            >
              I already have an account
            </button>
          </div>
        </section>

        {/* Feature grid */}
        <section className="max-w-2xl mx-auto px-6 pb-20">
          <h2 className="font-display text-2xl font-semibold text-orange-900 text-center mb-10">Everything your kitchen needs</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-white/70 backdrop-blur-sm rounded-2xl border border-orange-100 p-5 hover:border-orange-200 transition">
                <div className="text-2xl mb-3">{f.emoji}</div>
                <p className="font-display text-base font-semibold text-orange-900 mb-1">{f.title}</p>
                <p className="text-xs text-orange-700/80 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="bg-white/60 backdrop-blur-sm border-y border-orange-100 py-16 px-6">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="font-display text-2xl font-semibold text-orange-900 mb-12">How it works</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-10">
              {[
                { step: '1', title: 'Star your favourites', desc: 'Search recipes and star the ones you love. Set how often you want them in rotation.' },
                { step: '2', title: 'Let AI plan the week', desc: 'One tap and AI builds a varied 7-day dinner plan around your preferences.' },
                { step: '3', title: 'Shop together',        desc: 'Your list is auto-built from the plan. Check items off in real time with your partner.' },
              ].map((s) => (
                <div key={s.step} className="flex flex-col items-center">
                  <div className="w-11 h-11 rounded-full bg-orange-100 text-orange-700 font-display font-semibold text-lg flex items-center justify-center mb-4">{s.step}</div>
                  <p className="font-display font-semibold text-orange-900 mb-1.5">{s.title}</p>
                  <p className="text-xs text-orange-700/80 leading-relaxed max-w-[18ch]">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA footer */}
        <section className="max-w-2xl mx-auto px-6 py-20 text-center">
          <h2 className="font-display text-3xl font-semibold text-orange-900 mb-3">Cook together this week.</h2>
          <p className="text-sm text-orange-700/80 mb-7">Free to use. No credit card needed.</p>
          <button
            onClick={() => setView('plan')}
            className="px-8 py-3.5 bg-orange-500 text-white rounded-full font-medium hover:bg-orange-600 transition text-sm shadow-warm-lg"
          >
            Create your free account
          </button>
        </section>
      </div>
    );
  }

  // ── Plan selection ─────────────────────────────────────────────────────────
  if (view === 'plan') {
    const displayPrice = premiumOwnKey ? `€${PREMIUM_OWN_PRICE.toFixed(2)}` : `€${PREMIUM_PRICE.toFixed(2)}`;
    return (
      <div className="min-h-screen bg-paper px-4 py-14">
        <div className="max-w-lg mx-auto">
          <button onClick={() => setView('landing')} className="text-xs text-orange-500 hover:text-orange-700 mb-8 transition">← Back</button>
          <h2 className="font-display text-3xl font-semibold text-orange-900 mb-1.5">Choose your plan</h2>
          <p className="text-sm text-orange-700/80 mb-8">All core features are included in both.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">

            {/* Free */}
            <button
              onClick={() => setSelectedPlan('free')}
              className={`text-left rounded-2xl border-2 p-5 transition-all ${
                selectedPlan === 'free'
                  ? 'border-orange-500 bg-white shadow-warm-lg'
                  : 'border-orange-100 bg-white/70 hover:border-orange-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="font-display text-base font-semibold text-orange-900">Free</p>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${
                  selectedPlan === 'free' ? 'bg-orange-500 border-orange-500' : 'border-orange-300'
                }`}>
                  {selectedPlan === 'free' && <Check size={11} className="text-white" />}
                </div>
              </div>
              <p className="font-display text-2xl font-semibold text-orange-900 mb-0.5">
                €0 <span className="text-sm font-normal text-orange-500">/ forever</span>
              </p>
              <ul className="space-y-2 mt-5">
                {[
                  { ok: true,  text: '50 AI suggestions per day' },
                  { ok: true,  text: 'Add your own key → unlimited AI' },
                  { ok: true,  text: 'HelloFresh & Spoonacular recipes' },
                  { ok: true,  text: 'Shared plan, list & pantry' },
                  { ok: false, text: 'Extended recipe database' },
                ].map((f) => (
                  <li key={f.text} className="flex items-start gap-2">
                    {f.ok
                      ? <Check size={12} className="text-sage-500 mt-0.5 flex-shrink-0" />
                      : <span className="text-orange-200 text-xs mt-0.5 flex-shrink-0">✕</span>}
                    <span className={`text-xs leading-snug ${f.ok ? 'text-orange-800' : 'text-orange-300'}`}>{f.text}</span>
                  </li>
                ))}
              </ul>
              {selectedPlan === 'free' && (
                <p className="text-xs text-orange-500 mt-4 pt-3 border-t border-orange-100 italic leading-relaxed">
                  Add your free Gemini key in Settings after signup for unlimited AI.
                </p>
              )}
            </button>

            {/* Premium */}
            <button
              onClick={() => setSelectedPlan('premium')}
              className={`text-left rounded-2xl border-2 p-5 transition-all ${
                selectedPlan === 'premium'
                  ? 'border-sage-500 bg-white shadow-warm-lg'
                  : 'border-orange-100 bg-white/70 hover:border-orange-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <p className="font-display text-base font-semibold text-orange-900">Premium</p>
                  <span className="text-[10px] font-medium bg-sage-100 text-sage-600 px-2 py-0.5 rounded-full">Coming soon</span>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${
                  selectedPlan === 'premium' ? 'bg-sage-500 border-sage-500' : 'border-orange-300'
                }`}>
                  {selectedPlan === 'premium' && <Check size={11} className="text-white" />}
                </div>
              </div>
              <div className="flex items-baseline gap-2 mb-0.5">
                <p className="font-display text-2xl font-semibold text-orange-900">
                  {displayPrice} <span className="text-sm font-normal text-orange-500">/ month</span>
                </p>
                {premiumOwnKey && (
                  <span className="text-xs font-medium text-sage-600 bg-sage-100 px-1.5 py-0.5 rounded-full">16% off</span>
                )}
              </div>
              <ul className="space-y-2 mt-5">
                {[
                  'Unlimited AI suggestions',
                  'Extended recipe database',
                  'Shared plan, list & pantry',
                  'All core features',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <Check size={12} className="text-sage-500 mt-0.5 flex-shrink-0" />
                    <span className="text-xs leading-snug text-orange-800">{t}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 pt-3 border-t border-orange-100" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => { setSelectedPlan('premium'); setPremiumOwnKey((v) => !v); }}
                  className="flex items-center justify-between w-full group"
                >
                  <span className="text-xs text-orange-800 leading-snug text-left">
                    I'll use my own Gemini key
                    <span className="block text-orange-500 font-normal mt-0.5">Saves 16% — requires active key</span>
                  </span>
                  <div className={`relative flex-shrink-0 ml-3 h-5 w-9 rounded-full transition-colors ${premiumOwnKey ? 'bg-sage-500' : 'bg-orange-200'}`}>
                    <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${premiumOwnKey ? 'translate-x-4' : ''}`} />
                  </div>
                </button>
              </div>
            </button>
          </div>

          <button
            onClick={() => { setMode('register'); setView('auth'); }}
            className={`w-full py-3.5 text-white rounded-full font-medium transition text-sm flex items-center justify-center gap-2 shadow-warm-lg ${
              selectedPlan === 'premium' ? 'bg-sage-500 hover:bg-sage-600' : 'bg-orange-500 hover:bg-orange-600'
            }`}
          >
            {selectedPlan === 'premium' ? 'Join the waitlist' : 'Start for free'}
            <ArrowRight size={15} />
          </button>
          <p className="text-xs text-orange-500 text-center mt-4 leading-relaxed">
            You can upgrade or add your own API key any time in Settings.
          </p>
        </div>
      </div>
    );
  }

  // ── Auth form ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-warm-lg border border-orange-100 p-8 w-full max-w-sm">
        {!inviteToken && (
          <button onClick={() => setView(mode === 'register' ? 'plan' : 'landing')} className="text-xs text-orange-500 hover:text-orange-700 mb-5 transition">← Back</button>
        )}

        <h1 className="font-display text-3xl font-semibold text-orange-900 leading-none mb-1.5">Welcome</h1>
        <p className="text-xs text-orange-500 mb-6 leading-relaxed">
          {mode === 'login' ? 'Sign in to your shared kitchen.' : 'Start your shared kitchen — takes a minute.'}
        </p>

        {inviteToken && (
          <div className="bg-sage-100 border border-sage-400/40 rounded-2xl px-4 py-3 mb-5">
            <p className="text-sm text-sage-600 font-medium">You've been invited!</p>
            <p className="text-xs text-sage-600/80 mt-0.5">
              {mode === 'login' ? 'Sign in' : 'Create an account'} to join the shared kitchen.
            </p>
          </div>
        )}

        {/* Google OAuth */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={oauthLoading}
          className="w-full flex items-center justify-center gap-2.5 border border-orange-200 bg-white rounded-full px-4 py-3 text-sm font-medium text-orange-900 hover:bg-orange-50 transition disabled:opacity-50 mb-4"
        >
          <GoogleMark />
          {oauthLoading ? 'Redirecting…' : `Continue with Google`}
        </button>

        <div className="flex items-center gap-3 my-5">
          <div className="h-px bg-orange-100 flex-1" />
          <span className="text-[11px] uppercase tracking-wider text-orange-400">or email</span>
          <div className="h-px bg-orange-100 flex-1" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border border-orange-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-orange-400 placeholder-orange-300 bg-white"
          />
          <input
            type="password"
            placeholder="Password (min. 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full border border-orange-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-orange-400 placeholder-orange-300 bg-white"
          />
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-orange-500 text-white rounded-full font-medium hover:bg-orange-600 transition disabled:opacity-50 text-sm mt-1 shadow-warm"
          >
            {loading ? 'Loading…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          onClick={() => { setMode((m) => (m === 'login' ? 'register' : 'login')); setError(''); }}
          className="w-full text-center text-sm text-orange-600 hover:text-orange-800 mt-5 transition"
        >
          {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
