import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Check, ArrowRight } from 'lucide-react';
import { LayoutGroup, motion } from 'motion/react';
import { GlyphStar, GlyphCalendar, GlyphBasket, Scribble } from './glyphs';
import NotebookWeekScene from './NotebookWeekScene';
import { TextRotate } from './ui/text-rotate';
import { Button } from './ui/button';

const TESTIMONIALS = [
  {
    quote: "We've been using this for three months and I've stopped texting 'what do you want for dinner tonight?' That question alone was worth it.",
    name: 'Marit',
    location: 'Amsterdam',
    household: 'household of two',
    large: true,
    rotate: '-rotate-[0.5deg]',
  },
  {
    quote: "I starred about twenty recipes in the first week. Now the planner just… knows. The shopping list comes out pre-sorted by aisle, which is honestly ridiculous.",
    name: 'James',
    location: 'Edinburgh',
    household: 'three flatmates',
    large: false,
    rotate: 'rotate-[0.7deg]',
  },
  {
    quote: "We had pasta four nights in a row before this. No longer.",
    name: 'Sophie',
    location: 'London',
    household: 'couple',
    large: false,
    rotate: '-rotate-[0.4deg]',
  },
];

const CHAPTERS = [
  {
    glyph: GlyphStar,
    title: 'Star the ones you love',
    desc: "Search our recipe library, paste any URL and we'll pull the ingredients, or type one yourself — notes in the margins and all. Tell us how often you want each one back: weekly, biweekly, or just when the mood strikes.",
  },
  {
    glyph: GlyphCalendar,
    title: 'Let the week plan itself',
    desc: "One tap builds seven dinners from what you actually eat — filtered by what's in season and how long you've got. Swap anything you don't fancy; the rest shuffles around it.",
  },
  {
    glyph: GlyphBasket,
    title: 'Shop in sync, not by text',
    desc: 'The list builds itself from the plan, merged and sorted aisle by aisle. Tick off milk at the shop and the rest of your household sees it land at home. Send the whole lot straight to AH, Jumbo or Picnic.',
  },
];

const PREMIUM_PRICE     = 5.99;
const PREMIUM_OWN_PRICE = 4.99;

// Static hero-sized preview of the notebook planner. Deliberately not
// interactive — the real sandbox lives in NotebookWeekScene below. This
// is a visual above the fold so the hero isn't text-only.
const HERO_DAYS = [
  { d: 'mon', label: 'pasta' },
  { d: 'tue', label: 'curry' },
  { d: 'wed', label: 'ramen' },
  { d: 'thu', label: 'salad' },
  { d: 'fri', label: 'pizza', away: true },
  { d: 'sat', label: 'roast' },
  { d: 'sun', label: 'soup' },
];
const HERO_SHAPES = [
  { rotate: '-rotate-[0.8deg]', br: '10px 8px 9px 7px / 8px 10px 7px 9px' },
  { rotate:  'rotate-[1.2deg]', br:  '8px 10px 7px 9px / 9px 8px 10px 7px' },
  { rotate: '-rotate-[1.4deg]', br:  '9px 7px 10px 8px / 8px 9px 7px 10px' },
  { rotate:  'rotate-[0.6deg]', br:  '7px 9px 8px 10px / 10px 7px 9px 8px' },
  { rotate: '-rotate-[0.4deg]', br:  '9px 8px 10px 7px / 7px 10px 8px 9px' },
  { rotate:  'rotate-[1deg]',   br:  '8px 10px 7px 9px / 10px 7px 9px 8px' },
  { rotate: '-rotate-[0.7deg]', br: '10px 7px 9px 8px / 8px 9px 7px 10px' },
];

function HeroNotebookPreview() {
  return (
    <div className="relative rotate-[1.5deg]">
      <div className="bg-white rounded-[22px] border border-orange-200 shadow-warm-lg p-5 sm:p-6">
        <div className="flex items-baseline justify-between mb-4">
          <p className="font-display italic text-orange-600 text-xs tracking-wide">wk of 13 oct</p>
          <p className="font-display italic text-orange-400 text-[10px]">— for two</p>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {HERO_DAYS.map((day, i) => {
            const s = HERO_SHAPES[i];
            return (
              <div key={day.d}>
                <p className="text-orange-400 text-[8px] mb-0.5 tracking-wider font-display italic">{day.d}</p>
                <div
                  style={{ borderRadius: s.br }}
                  className={`aspect-square border-[1.5px] flex items-center justify-center text-center font-display text-[9px] sm:text-[10px] ${s.rotate} ${
                    day.away
                      ? 'border-dashed border-sage-400/80 text-sage-600'
                      : 'border-orange-300/80 text-orange-900'
                  }`}
                >
                  {day.label}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-5 flex items-center gap-2">
          <svg viewBox="0 0 60 12" className="w-14 h-3 text-orange-400" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
            <path d="M3 8 C 16 3, 30 10, 46 5" />
            <path d="M46 5 L 41 3 M 46 5 L 43 9" />
          </svg>
          <span className="font-display italic text-orange-600 text-xs">seven dinners.</span>
        </div>
      </div>
    </div>
  );
}

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
        }
        // household creation handled by loadHousehold() in App.jsx once onAuthStateChange fires
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
            We sent a confirmation link to <strong className="text-orange-900">{email}</strong>. Click it to activate your account.
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
        <nav className="sticky top-0 z-20 bg-orange-50/80 backdrop-blur-md border-b border-orange-100 px-6 py-3.5 flex items-center justify-end">
          <button
            onClick={() => { setMode('login'); setView('auth'); }}
            className="text-sm text-orange-900 font-medium hover:text-orange-900 transition"
          >
            Sign in
          </button>
        </nav>

        {/* Hero */}
        <section className="max-w-5xl mx-auto px-6 pt-20 sm:pt-28 pb-28 sm:pb-32">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
            <div className="lg:col-span-7">
              <p className="font-display italic text-orange-400 text-sm mb-5 tracking-wide">— for one, two, or a full flat.</p>
              <h1 className="font-display text-[3.25rem] sm:text-[5.5rem] font-semibold text-orange-900 leading-[0.95] mb-4 tracking-tight">
                Plan the<br />
                week.
                <span className="relative inline-block italic font-normal text-orange-600 ml-3 sm:ml-5">
                  Together.
                  <Scribble className="absolute left-0 -bottom-3 sm:-bottom-4 w-full text-orange-600/70 pointer-events-none" aria-hidden="true" />
                </span>
              </h1>
              <p className="mt-8 sm:mt-10 text-lg text-orange-900/85 leading-relaxed max-w-md">
                Enough dinners for the week, sorted in the time it takes the kettle to boil.
              </p>
              <div className="mt-10 flex flex-col items-start gap-4">
                <Button
                  onClick={() => setView('plan')}
                  size="lg"
                  className="rounded-full px-8 shadow-warm-lg"
                >
                  Start planning — it's free
                </Button>
                <p className="text-xs text-orange-900/70">No card needed. Takes 30 seconds.</p>
                <button
                  onClick={() => { setMode('login'); setView('auth'); }}
                  className="text-sm text-orange-900 hover:text-orange-900 transition underline underline-offset-4 decoration-orange-300 decoration-[1.5px]"
                >
                  Sign in to your account →
                </button>
              </div>
            </div>

            {/* Notebook preview — a tilted, static peek of the planner.
                The real interactive version lives below; this is here so the
                hero has a product visual above the fold. */}
            <div className="lg:col-span-5 hidden lg:block">
              <HeroNotebookPreview />
            </div>
          </div>
        </section>

        {/* How a week goes — the illustrated scene leads, three numbered
            chapters beneath, and a share-it-or-don't aside in the margin.
            Replaces the old bento + how-it-works pair which said the same
            thing twice. */}
        <section className="bg-white/60 backdrop-blur-sm border-y border-orange-100 py-20 sm:py-24 px-6">
          <div className="max-w-3xl mx-auto">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-orange-900 mb-1">How a week goes</h2>
            <p className="font-display italic text-orange-900/70 text-sm mb-12 max-w-lg">
              roughly like this —
            </p>

            {/* The notebook week — framed inside a minimal app chrome so it
                reads as "this is the actual app", not just an illustration. */}
            <div className="rounded-[22px] border border-orange-200 shadow-warm-lg overflow-hidden">
              <div className="bg-orange-50/60 border-b border-orange-100 px-4 py-2.5 flex items-center gap-2">
                <span className="font-display italic text-orange-600 text-xs">Meal Planner</span>
                <span className="text-orange-400 text-xs">·</span>
                <span className="font-display italic text-orange-400 text-xs">week of 13 oct</span>
              </div>
              <div className="bg-white px-4 py-5">
                <NotebookWeekScene />
              </div>
            </div>

            {/* Three chapters led by a hand-drawn glyph — sides alternate
                so the eye doesn't read three identical rows. */}
            <div className="mt-20 sm:mt-24 space-y-14 sm:space-y-16">
              {CHAPTERS.map((c, i) => {
                const Glyph = c.glyph;
                const glyphRight = i === 1;
                return (
                  <div key={c.title} className="flex gap-6 sm:gap-10 items-start">
                    {!glyphRight && (
                      <div className="text-orange-600 flex-shrink-0">
                        <Glyph className="w-12 h-12 sm:w-14 sm:h-14" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-xl sm:text-2xl font-semibold text-orange-900 mb-2 leading-tight">{c.title}</p>
                      <p className="text-[15px] text-orange-900/80 leading-relaxed max-w-lg">{c.desc}</p>
                    </div>
                    {glyphRight && (
                      <div className="text-orange-600 flex-shrink-0">
                        <Glyph className="w-12 h-12 sm:w-14 sm:h-14" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Aside — not numbered, italic, pinned slightly to the right
                so it reads as a margin note. Breaks the rhythm on purpose.
                No scribble here; the hero already has the one per screen. */}
            <p className="mt-16 sm:mt-20 ml-auto max-w-md text-right font-display italic text-orange-900/80 text-base leading-relaxed">
              — a kitchen's better with company. Invite a partner, a flatmate,
              your mum — the plan stays in sync, so nobody's texting "did we
              already have pasta this week?"
            </p>
          </div>
        </section>

        {/* Testimonials — scattered notebook notes, not a feature grid */}
        <section className="max-w-3xl mx-auto px-6 py-20 sm:py-24">
          <p className="font-display italic text-orange-600/80 text-sm mb-10 tracking-wide">— people who cook at home</p>

          {/* One large note + two smaller ones: deliberately non-identical layout */}
          <div className="space-y-5 sm:space-y-6">
            <blockquote className={`bg-white rounded-[22px] border border-orange-200 px-7 py-6 shadow-warm ${TESTIMONIALS[0].rotate}`}>
              <p className="font-display text-xl sm:text-2xl font-semibold text-orange-900 leading-snug mb-4">
                "{TESTIMONIALS[0].quote}"
              </p>
              <p className="font-display italic text-orange-600 text-sm">
                — {TESTIMONIALS[0].name}, {TESTIMONIALS[0].location} · {TESTIMONIALS[0].household}
              </p>
            </blockquote>

            <div className="grid sm:grid-cols-2 gap-5 sm:gap-6">
              {TESTIMONIALS.slice(1).map((t) => (
                <blockquote key={t.name} className={`bg-white rounded-[18px] border border-orange-200 px-6 py-5 shadow-warm ${t.rotate}`}>
                  <p className="text-orange-900/85 text-[15px] leading-relaxed mb-3">"{t.quote}"</p>
                  <p className="font-display italic text-orange-600 text-xs">
                    — {t.name}, {t.location} · {t.household}
                  </p>
                </blockquote>
              ))}
            </div>
          </div>
        </section>

        {/* CTA footer */}
        <section className="max-w-3xl mx-auto px-6 py-24 text-center flex flex-col items-center gap-6">
          <LayoutGroup>
            <motion.p
              className="flex flex-wrap items-baseline justify-center gap-x-3 font-display text-3xl sm:text-4xl font-semibold text-orange-900"
              layout
              transition={{ type: 'spring', damping: 30, stiffness: 400 }}
            >
              <motion.span layout transition={{ type: 'spring', damping: 30, stiffness: 400 }}>Give it a</motion.span>
              <TextRotate
                texts={['week.', 'try.', 'go.', 'Monday.', 'dinner.']}
                mainClassName="text-white px-3 bg-orange-500 overflow-hidden py-0.5 sm:py-1 justify-center rounded-full"
                staggerFrom="last"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '-120%' }}
                staggerDuration={0.025}
                splitLevelClassName="overflow-hidden pb-0.5"
                transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                rotationInterval={2500}
              />
            </motion.p>
          </LayoutGroup>
          <p className="text-sm text-orange-900/80">Free to use. No card needed.</p>
          <Button
            onClick={() => setView('plan')}
            size="lg"
            className="px-8 py-3.5 shadow-warm-lg"
          >
            Create your free account
          </Button>
        </section>
      </div>
    );
  }

  // ── Plan selection ─────────────────────────────────────────────────────────
  if (view === 'plan') {
    const displayPrice = premiumOwnKey ? `€${PREMIUM_OWN_PRICE.toFixed(2)}` : `€${PREMIUM_PRICE.toFixed(2)}`;
    return (
      <div className="min-h-screen bg-paper px-4 py-14">
        <div className="max-w-3xl mx-auto">
          <button onClick={() => setView('landing')} className="text-xs text-orange-600 hover:text-orange-900 mb-8 transition">← Back</button>
          <h2 className="font-display text-3xl font-semibold text-orange-900 mb-1.5">Choose your plan</h2>
          <p className="text-sm text-orange-900/80 mb-8">All core features are included in every plan. AI is the only difference.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">

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
                €0 <span className="text-sm font-normal text-orange-600">/ forever</span>
              </p>
              <ul className="space-y-2 mt-5">
                {[
                  { ok: true,  text: '15 AI suggestions per week' },
                  { ok: true,  text: 'Shared plan, list & pantry' },
                  { ok: true,  text: 'Up to 4 recipe results per search' },
                  { ok: false, text: 'Full recipe library' },
                  { ok: false, text: 'All features' },
                ].map((f) => (
                  <li key={f.text} className="flex items-start gap-2">
                    {f.ok
                      ? <Check size={12} className="text-sage-600 mt-0.5 flex-shrink-0" />
                      : <span className="text-orange-400 text-xs mt-0.5 flex-shrink-0">✕</span>}
                    <span className={`text-xs leading-snug ${f.ok ? 'text-orange-900' : 'text-orange-400'}`}>{f.text}</span>
                  </li>
                ))}
              </ul>
              {selectedPlan === 'free' && (
                <p className="text-xs text-orange-600 mt-4 pt-3 border-t border-orange-100 italic leading-relaxed">
                  Add your own Gemini key in Settings after signup — unlimited AI and up to 8 results per search.
                </p>
              )}
            </button>

            {/* Paid — full access */}
            <button
              onClick={() => setSelectedPlan('puter')}
              className={`text-left rounded-2xl border-2 p-5 transition-all ${
                selectedPlan === 'puter'
                  ? 'border-orange-900 bg-white shadow-warm-lg'
                  : 'border-orange-100 bg-white/70 hover:border-orange-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="font-display text-base font-semibold text-orange-900">Full access</p>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${
                  selectedPlan === 'puter' ? 'bg-orange-900 border-orange-900' : 'border-orange-300'
                }`}>
                  {selectedPlan === 'puter' && <Check size={11} className="text-white" />}
                </div>
              </div>
              <p className="font-display text-2xl font-semibold text-orange-900 mb-0.5">
                Paid <span className="text-sm font-normal text-orange-600">— we provide the key</span>
              </p>
              <p className="text-[11px] text-orange-600 mb-4">Pay via Puter, or directly once billing is live.</p>
              <ul className="space-y-2">
                {[
                  'Unlimited AI — no weekly cap',
                  'Full recipe library, all results',
                  'Everything included',
                  'Shared plan, list & pantry',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <Check size={12} className="text-sage-600 mt-0.5 flex-shrink-0" />
                    <span className="text-xs leading-snug text-orange-900">{t}</span>
                  </li>
                ))}
              </ul>
              {selectedPlan === 'puter' && (
                <p className="text-xs text-orange-600 mt-4 pt-3 border-t border-orange-100 italic leading-relaxed">
                  Currently via Puter — connect after signup. Top up a couple of euros and it covers weeks of planning.
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
                  {displayPrice} <span className="text-sm font-normal text-orange-600">/ month</span>
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
                    <Check size={12} className="text-sage-600 mt-0.5 flex-shrink-0" />
                    <span className="text-xs leading-snug text-orange-900">{t}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 pt-3 border-t border-orange-100" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => { setSelectedPlan('premium'); setPremiumOwnKey((v) => !v); }}
                  className="flex items-center justify-between w-full group"
                >
                  <span className="text-xs text-orange-900 leading-snug text-left">
                    I'll use my own Gemini key
                    <span className="block text-orange-600 font-normal mt-0.5">Saves 16% — requires active key</span>
                  </span>
                  <div className={`relative flex-shrink-0 ml-3 h-5 w-9 rounded-full transition-colors ${premiumOwnKey ? 'bg-sage-500' : 'bg-orange-200'}`}>
                    <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${premiumOwnKey ? 'translate-x-4' : ''}`} />
                  </div>
                </button>
              </div>
            </button>
          </div>

          <button
            onClick={() => {
              if (selectedPlan === 'puter') {
                try { localStorage.setItem('mp-pending-puter-connect', '1'); } catch {}
              }
              setMode('register');
              setView('auth');
            }}
            className={`w-full py-3.5 text-white rounded-full font-medium transition text-sm flex items-center justify-center gap-2 shadow-warm-lg ${
              selectedPlan === 'premium' ? 'bg-sage-500 hover:bg-sage-600'
              : selectedPlan === 'puter' ? 'bg-orange-900 hover:bg-orange-800'
              : 'bg-orange-500 hover:bg-orange-600'
            }`}
          >
            {selectedPlan === 'premium' ? 'Join the waitlist'
             : selectedPlan === 'puter'  ? 'Create account & connect Puter'
             : 'Start for free'}
            <ArrowRight size={15} />
          </button>
          <p className="text-xs text-orange-600 text-center mt-4 leading-relaxed">
            You can switch plans or add your own key any time in Settings.
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
          <button onClick={() => setView(mode === 'register' ? 'plan' : 'landing')} className="text-xs text-orange-600 hover:text-orange-900 mb-5 transition">← Back</button>
        )}

        <h1 className="font-display text-3xl font-semibold text-orange-900 leading-none mb-1.5">Welcome</h1>
        <p className="text-xs text-orange-600 mb-6 leading-relaxed">
          {mode === 'login' ? 'Good to see you again.' : 'Two fields and you\u2019re in.'}
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
            name="email"
            autoComplete="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border border-orange-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-orange-400 placeholder-orange-300 bg-white"
          />
          <input
            type="password"
            name="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
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
          className="w-full text-center text-sm text-orange-600 hover:text-orange-900 mt-5 transition"
        >
          {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
