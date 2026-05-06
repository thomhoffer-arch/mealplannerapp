import React, { useState, useEffect, useRef } from 'react';
import { X, Copy, Check, ExternalLink, ShoppingBag } from 'lucide-react';

// Deep-link handoff to the Dutch grocers. Not a real API connection —
// we can only open their search pre-filled; the user still taps "Add"
// in their app. The guided mode advances item-by-item and auto-ticks
// the shopping list as they go so the rhythm feels connected.
//
// Picnic has no reliable search URL, so we copy the item to clipboard
// and open the app at its root — the user pastes into their search.
const GROCERS = [
  {
    id:    'ah',
    name:  'Albert Heijn',
    color: 'bg-[#00ADE6]',
    url:   (q) => `https://www.ah.nl/zoeken?query=${encodeURIComponent(q)}`,
  },
  {
    id:    'jumbo',
    name:  'Jumbo',
    color: 'bg-[#EEB017]',
    url:   (q) => `https://www.jumbo.com/zoeken?searchTerms=${encodeURIComponent(q)}`,
  },
  {
    id:    'picnic',
    name:  'Picnic',
    color: 'bg-[#E1022F]',
    url:   () => 'https://picnic.app/nl',
    copyFirst: true,
    note:  'Picnic has no direct search link. We\u2019ll copy the item — paste it into the app\u2019s search.',
  },
];

export default function GrocerHandoffModal({ items, onClose, onMarkChecked }) {
  const [grocer, setGrocer] = useState(null);
  const [mode, setMode]     = useState(null);   // 'guided' | 'copy'
  const [step, setStep]     = useState(0);
  const [copiedAll, setCopiedAll] = useState(false);

  const current = items[step];
  const listText = items
    .map((i) => `${i.amount ? i.amount + ' ' : ''}${i.name}`)
    .join('\n');

  async function copyText(text, flag) {
    try { await navigator.clipboard.writeText(text); } catch {}
    if (flag) { setCopiedAll(true); setTimeout(() => setCopiedAll(false), 2000); }
  }

  // Picnic has no list-import or per-search deep link, so the only path is
  // paste-into-search, one item at a time. To collapse the round-trip, we
  // arm a flag when the user leaves for Picnic and, when they return to our
  // tab, tick the item they just added and pre-copy the next one — so the
  // clipboard is already primed for the next paste.
  const awaitingReturnRef = useRef(false);
  const liveRef = useRef({ items, onMarkChecked });
  liveRef.current = { items, onMarkChecked };

  useEffect(() => {
    if (grocer?.id !== 'picnic' || mode !== 'guided') return;
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      if (!awaitingReturnRef.current) return;
      awaitingReturnRef.current = false;
      setStep((s) => {
        const { items: its, onMarkChecked: omc } = liveRef.current;
        const cur = its[s];
        const nxt = its[s + 1];
        if (cur) omc?.(cur.name);
        if (nxt) copyText(nxt.name);
        return s + 1;
      });
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [grocer, mode]);

  function openCurrent() {
    if (!current) return;
    if (grocer.copyFirst) copyText(current.name);
    if (grocer.id === 'picnic') awaitingReturnRef.current = true;
    window.open(grocer.url(current.name), '_blank', 'noopener');
  }

  function next() {
    if (current) onMarkChecked?.(current.name);
    setStep((s) => s + 1);
  }
  function skip() { setStep((s) => s + 1); }

  const done = step >= items.length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-warm-lg border border-orange-100 w-full max-w-md relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-orange-400 hover:text-orange-600 transition z-10">
          <X size={18} />
        </button>

        {/* ── Step 1: pick a grocer ── */}
        {!grocer && (
          <div className="p-7">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingBag size={16} className="text-orange-600" />
              <p className="font-display italic text-orange-600/80 text-xs tracking-wide">Send to grocer</p>
            </div>
            <h2 className="font-display text-2xl font-semibold text-orange-900 leading-tight mb-2">
              Where are you shopping?
            </h2>
            <p className="text-sm text-orange-900/80 leading-relaxed mb-5">
              We'll open each item pre-filled in their search. You still tap <em>add</em>, but the list ticks itself off as you go.
            </p>
            <div className="space-y-2">
              {GROCERS.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGrocer(g)}
                  className="w-full flex items-center gap-3 rounded-2xl border border-orange-100 bg-white hover:border-orange-300 px-4 py-3 transition text-left"
                >
                  <span className={`${g.color} w-2 h-8 rounded-full`} />
                  <span className="text-sm font-semibold text-orange-900 flex-1">{g.name}</span>
                  <ExternalLink size={14} className="text-orange-400" />
                </button>
              ))}
            </div>
            <div className="border-t border-orange-100 mt-5 pt-4">
              <button
                onClick={() => copyText(listText, true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-orange-200 bg-white text-orange-900 hover:bg-orange-50 transition text-sm font-medium"
              >
                {copiedAll ? <Check size={14} className="text-sage-600" /> : <Copy size={14} />}
                {copiedAll ? 'Copied to clipboard' : 'Or just copy the whole list'}
              </button>
              <p className="text-[11px] text-orange-400 text-center mt-2 leading-relaxed">
                Paste into any app's list feature — AH boodschappenlijstje, Jumbo's list, Notes, wherever.
              </p>
            </div>
          </div>
        )}

        {/* ── Step 2: pick mode (after grocer) ── */}
        {grocer && mode === null && (
          <div className="p-7">
            <button onClick={() => setGrocer(null)} className="text-xs text-orange-600 hover:text-orange-900 mb-5 transition">← Change grocer</button>
            <h2 className="font-display text-2xl font-semibold text-orange-900 leading-tight mb-2">
              {grocer.name} — how?
            </h2>
            {grocer.note && (
              <p className="text-xs text-orange-600 italic mb-4 leading-relaxed">{grocer.note}</p>
            )}
            <div className="space-y-2 mt-3">
              <button
                onClick={() => { setMode('guided'); setStep(0); }}
                className="w-full text-left rounded-2xl border-2 border-orange-100 hover:border-orange-300 bg-white p-4 transition"
              >
                <p className="font-display text-base font-semibold text-orange-900 mb-0.5">Guided, item by item</p>
                <p className="text-xs text-orange-900/75 leading-snug">Tap once per item. We tick the list as you add to the basket. {items.length} items.</p>
              </button>
              <button
                onClick={() => setMode('copy')}
                className="w-full text-left rounded-2xl border-2 border-orange-100 hover:border-orange-300 bg-white p-4 transition"
              >
                <p className="font-display text-base font-semibold text-orange-900 mb-0.5">Copy the list</p>
                <p className="text-xs text-orange-900/75 leading-snug">Paste it straight into {grocer.name}'s own list feature.</p>
              </button>
            </div>
          </div>
        )}

        {/* ── Guided mode ── */}
        {grocer && mode === 'guided' && !done && current && (
          <div className="p-7">
            <button onClick={() => setMode(null)} className="text-xs text-orange-600 hover:text-orange-900 mb-4 transition">← Back</button>
            <div className="flex items-center justify-between mb-1">
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full text-white ${grocer.color}`}>
                {grocer.name}
              </span>
              <span className="text-xs text-orange-600 font-medium">{step + 1} of {items.length}</span>
            </div>
            <p className="font-display text-2xl font-semibold text-orange-900 leading-tight mt-3 mb-1">
              {current.name}
            </p>
            {current.amount && <p className="text-sm text-orange-600 mb-5">{current.amount}</p>}
            {!current.amount && <div className="mb-5" />}

            <div className="w-full bg-orange-100 rounded-full h-1.5 mb-5">
              <div className="bg-orange-500 h-1.5 rounded-full transition-all" style={{ width: `${(step / items.length) * 100}%` }} />
            </div>

            <button
              onClick={openCurrent}
              className="w-full flex items-center justify-center gap-2 py-3 bg-orange-900 text-white rounded-2xl font-medium hover:bg-orange-800 transition text-sm shadow-warm mb-2"
            >
              <ExternalLink size={14} />
              {step === 0 ? `Open in ${grocer.name}` : `Open ${grocer.name} again`}
            </button>
            <button
              onClick={next}
              className="w-full py-3 bg-orange-500 text-white rounded-2xl font-medium hover:bg-orange-600 transition text-sm shadow-warm"
            >
              Added — next
            </button>
            {grocer.id === 'picnic' && step > 0 && (
              <p className="text-[11px] text-orange-500 text-center mt-3 leading-relaxed">
                Tip: just switch back to Picnic — the next item is already on your clipboard, ready to paste.
              </p>
            )}
            <button onClick={skip} className="w-full text-xs text-orange-600 hover:text-orange-900 mt-3 transition">
              Skip this one
            </button>
          </div>
        )}

        {/* ── Guided done ── */}
        {grocer && mode === 'guided' && done && (
          <div className="p-7 text-center">
            <div className="w-12 h-12 bg-sage-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6 text-sage-600" />
            </div>
            <h2 className="font-display text-2xl font-semibold text-orange-900 leading-tight mb-2">That's the list.</h2>
            <p className="text-sm text-orange-900/80 leading-relaxed mb-5">
              Finish your basket in {grocer.name} and check out whenever you're ready.
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 bg-orange-500 text-white rounded-2xl font-medium hover:bg-orange-600 transition text-sm shadow-warm"
            >
              Done
            </button>
          </div>
        )}

        {/* ── Copy mode ── */}
        {grocer && mode === 'copy' && (
          <div className="p-7">
            <button onClick={() => setMode(null)} className="text-xs text-orange-600 hover:text-orange-900 mb-4 transition">← Back</button>
            <h2 className="font-display text-xl font-semibold text-orange-900 leading-tight mb-1">Copy &amp; paste</h2>
            <p className="text-sm text-orange-900/80 leading-relaxed mb-4">
              Copy this, then open {grocer.name} and paste it into their list.
            </p>
            <textarea
              readOnly
              value={listText}
              rows={Math.min(items.length + 1, 10)}
              className="w-full border border-orange-200 rounded-xl px-3 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-300 bg-orange-50/50 text-orange-900 resize-none mb-3"
            />
            <button
              onClick={() => copyText(listText, true)}
              className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500 text-white rounded-2xl font-medium hover:bg-orange-600 transition text-sm shadow-warm mb-2"
            >
              {copiedAll ? <Check size={14} /> : <Copy size={14} />}
              {copiedAll ? 'Copied' : 'Copy list'}
            </button>
            <button
              onClick={() => window.open(grocer.url(''), '_blank', 'noopener')}
              className="w-full py-3 border border-orange-200 bg-white text-orange-900 rounded-2xl font-medium hover:bg-orange-50 transition text-sm"
            >
              Open {grocer.name}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
