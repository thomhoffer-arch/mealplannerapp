import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Check, Sparkles, ShoppingCart, Star, Users, ArrowRight, ChevronDown } from 'lucide-react';

const FEATURES = [
  { emoji: '🔍', title: 'Search thousands of recipes', desc: 'HelloFresh, Marley Spoon, Spoonacular and more — filtered by diet, time, and cuisine.' },
  { emoji: '🤖', title: 'AI week planner', desc: 'Generate a full varied week of dinners in one tap, based on your taste and rotation priorities.' },
  { emoji: '🛒', title: 'Shared shopping list', desc: 'Ingredients from your plan auto-merged into one list. Check off items together in real time.' },
  { emoji: '⭐', title: 'Star your favourites', desc: 'Save recipes and set how often they rotate — every week, biweekly, or occasionally.' },
  { emoji: '👫', title: 'Built for couples & households', desc: 'Invite your partner — every change syncs instantly for both of you.' },
  { emoji: '🔗', title: 'Import from any website', desc: 'Paste any recipe URL and we parse it automatically. Or write your own from scratch.' },
];

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '€0',
    period: 'forever',
    highlight: false,
    features: [
      '50 AI suggestions per day',
      'Full recipe search & import',
      'Shared meal plan & shopping list',
      'Starred recipes + rotation priorities',
      'Pantry tracker & plan templates',
      'Partner sharing (1 household)',
    ],
    cta: 'Start for free',
  },
  {
    id: 'unlimited',
    name: 'Unlimited',
    price: 'Free',
    period: 'with your own key',
    highlight: true,
    features: [
      'Unlimited AI suggestions',
      'Everything in Free',
      'Add your Gemini API key in Settings',
      'Keys encrypted & stored securely',
      '',
      '',
    ],
    cta: 'Get started free',
    note: 'Get a free Gemini key at aistudio.google.com',
  },
];

export default function AuthScreen() {
  const [view, setView] = useState('landing'); // landing | plan | auth
  const [selectedPlan, setSelectedPlan] = useState('free');
  const [mode, setMode] = useState('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const inviteToken = new URLSearchParams(window.location.search).get('invite');

  // If arriving via invite link, skip landing and go straight to auth
  const initialView = inviteToken ? 'auth' : view;

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

        if (!user) {
          setDone(true);
          setLoading(false);
          return;
        }

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

  // ── Email confirmation sent ─────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-orange-100 p-8 w-full max-w-sm text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-7 h-7 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-orange-900 mb-2">Check your email</h2>
          <p className="text-sm text-orange-600">
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
          </p>
        </div>
      </div>
    );
  }

  // ── Landing page ────────────────────────────────────────────────────────────
  if (initialView === 'landing' && view === 'landing') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 font-outfit">

        {/* Nav */}
        <nav className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-orange-100 px-6 py-3 flex items-center justify-between">
          <span className="text-lg font-bold text-orange-900">Meal Planner</span>
          <button
            onClick={() => { setMode('login'); setView('auth'); }}
            className="text-sm text-orange-600 font-semibold hover:text-orange-800 transition"
          >
            Sign in
          </button>
        </nav>

        {/* Hero */}
        <section className="max-w-2xl mx-auto px-6 pt-16 pb-12 text-center">
          <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <Sparkles size={12} />
            AI-powered meal planning
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-orange-900 leading-tight mb-4">
            Plan your week.<br />
            <span className="text-orange-500">Together.</span>
          </h1>
          <p className="text-base text-orange-600 max-w-md mx-auto leading-relaxed mb-8">
            A shared meal planner for couples and households. Discover recipes, let AI plan your week, and build your shopping list automatically.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => setView('plan')}
              className="px-6 py-3 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition text-sm flex items-center justify-center gap-2"
            >
              Get started free <ArrowRight size={16} />
            </button>
            <button
              onClick={() => { setMode('login'); setView('auth'); }}
              className="px-6 py-3 border-2 border-orange-200 text-orange-700 rounded-xl font-semibold hover:border-orange-400 transition text-sm"
            >
              Sign in
            </button>
          </div>
        </section>

        {/* Feature grid */}
        <section className="max-w-2xl mx-auto px-6 pb-16">
          <h2 className="text-xl font-bold text-orange-900 text-center mb-8">Everything your kitchen needs</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-white rounded-2xl border border-orange-100 p-5">
                <div className="text-2xl mb-2">{f.emoji}</div>
                <p className="text-sm font-semibold text-orange-900 mb-1">{f.title}</p>
                <p className="text-xs text-orange-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="bg-white border-t border-b border-orange-100 py-14 px-6">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-xl font-bold text-orange-900 mb-10">How it works</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              {[
                { step: '1', title: 'Star your favourites', desc: 'Search recipes and star the ones you love. Set how often you want them in the rotation.' },
                { step: '2', title: 'Let AI plan your week', desc: 'One tap and AI builds a varied 7-day dinner plan around your preferences and starred picks.' },
                { step: '3', title: 'Shop together', desc: 'Your shopping list is auto-built from the plan. Check off items in real time with your partner.' },
              ].map((s) => (
                <div key={s.step} className="flex flex-col items-center">
                  <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-bold text-lg mb-3">{s.step}</div>
                  <p className="text-sm font-semibold text-orange-900 mb-1">{s.title}</p>
                  <p className="text-xs text-orange-500 leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA footer */}
        <section className="max-w-2xl mx-auto px-6 py-14 text-center">
          <h2 className="text-2xl font-bold text-orange-900 mb-3">Ready to plan smarter?</h2>
          <p className="text-sm text-orange-500 mb-6">Free to use. No credit card needed.</p>
          <button
            onClick={() => setView('plan')}
            className="px-8 py-3 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition text-sm"
          >
            Create your free account
          </button>
        </section>
      </div>
    );
  }

  // ── Plan selection ──────────────────────────────────────────────────────────
  if (view === 'plan') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 px-4 py-12 font-outfit">
        <div className="max-w-xl mx-auto">
          <button onClick={() => setView('landing')} className="text-xs text-orange-400 hover:text-orange-600 mb-6 transition">← Back</button>
          <h2 className="text-2xl font-bold text-orange-900 mb-1">Choose your plan</h2>
          <p className="text-sm text-orange-500 mb-8">All plans include every feature. The difference is AI usage limits.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {PLANS.map((plan) => (
              <button
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`text-left rounded-2xl border-2 p-5 transition-all ${
                  selectedPlan === plan.id
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-orange-100 bg-white hover:border-orange-300'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-base font-bold text-orange-900">{plan.name}</p>
                    <p className="text-xs text-orange-400">{plan.price} <span className="text-orange-300">{plan.period}</span></p>
                  </div>
                  {selectedPlan === plan.id && (
                    <div className="w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <Check size={11} className="text-white" />
                    </div>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {plan.features.filter(Boolean).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-orange-700">
                      <Check size={11} className="text-orange-400 mt-0.5 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                {plan.note && (
                  <p className="text-xs text-orange-400 mt-3 italic">{plan.note}</p>
                )}
              </button>
            ))}
          </div>

          <button
            onClick={() => { setMode('register'); setView('auth'); }}
            className="w-full py-3 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition text-sm flex items-center justify-center gap-2"
          >
            Continue with {PLANS.find((p) => p.id === selectedPlan)?.name} plan
            <ArrowRight size={15} />
          </button>
          <p className="text-xs text-orange-400 text-center mt-3">
            You can switch plans or add your own API key any time in Settings.
          </p>
        </div>
      </div>
    );
  }

  // ── Auth form ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 flex items-center justify-center p-4 font-outfit">
      <div className="bg-white rounded-2xl shadow-sm border border-orange-100 p-8 w-full max-w-sm">
        {!inviteToken && (
          <button onClick={() => setView(mode === 'register' ? 'plan' : 'landing')} className="text-xs text-orange-400 hover:text-orange-600 mb-4 transition">← Back</button>
        )}

        <h1 className="text-2xl font-bold text-orange-900 leading-none mb-1">Meal Planner</h1>
        <p className="text-xs text-orange-400 mb-5">HelloFresh · Spoonacular · and more</p>

        {inviteToken && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-5">
            <p className="text-sm text-green-700 font-medium">You've been invited!</p>
            <p className="text-xs text-green-600 mt-0.5">
              {mode === 'login' ? 'Sign in' : 'Create an account'} to join the shared kitchen.
            </p>
          </div>
        )}

        <p className="text-sm text-orange-600 font-medium mb-4">
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border border-orange-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-orange-300"
          />
          <input
            type="password"
            placeholder="Password (min. 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full border border-orange-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-orange-300"
          />
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition disabled:opacity-50 text-sm mt-1"
          >
            {loading ? 'Loading…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          onClick={() => { setMode((m) => (m === 'login' ? 'register' : 'login')); setError(''); }}
          className="w-full text-center text-sm text-orange-500 hover:text-orange-700 mt-4 transition"
        >
          {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
