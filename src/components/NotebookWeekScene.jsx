import React, { useState, useEffect } from 'react';
import { GlyphSprig, GlyphBasket } from './glyphs';

// An interactive notebook-page preview of the week. Click a day to open
// that night's menu card; click the basket to peek at the shopping list
// (with checkable items). The idea is a tiny sandbox of the real app
// without signup — not a marketing diagram.
//
// Not a glyph — lives in its own module rather than glyphs.jsx, which is
// reserved for 32×32 single-pass icons (see DESIGN.md).

const DAYS = [
  {
    d: 'mon',
    label: 'pasta',
    dish: 'Lemony carbonara',
    overview: 'Bacon, egg yolks, pecorino, a squeeze of lemon to lift it.',
    cuisine: 'Italian',
    time: '20 min',
  },
  {
    d: 'tue',
    label: 'curry',
    dish: 'Coconut dal',
    overview: 'Red lentils, coconut milk, a handful of spinach right at the end.',
    cuisine: 'Indian',
    time: '25 min',
  },
  {
    d: 'wed',
    label: 'tofu bowl',
    strike: true,
    swap: 'ramen',
    dish: 'Miso ramen',
    overview: 'Swapped in for the tofu bowl — quicker and everyone loves it.',
    cuisine: 'Japanese',
    time: '15 min',
  },
  {
    d: 'thu',
    label: 'salad',
    dish: 'Halloumi grain salad',
    overview: 'Charred halloumi, freekeh, mint, a lemon-tahini dressing.',
    cuisine: 'Mediterranean',
    time: '20 min',
  },
  {
    d: 'fri',
    label: 'pizza',
    away: "Vera\u2019s",
    dish: "Pizza at Vera\u2019s",
    overview: "Vera invited us over — she\u2019s making, we\u2019re bringing wine.",
    cuisine: 'Italian',
    time: '19:30',
  },
  {
    d: 'sat',
    label: 'roast',
    dish: 'Sunday-style roast chicken',
    overview: 'An hour in the oven. The kind of meal that makes the flat smell like home.',
    cuisine: 'British',
    time: '1 h 20',
  },
  {
    d: 'sun',
    label: 'soup',
    dish: 'Roasted squash soup',
    overview: 'Weekend project, freezes well, good with a hunk of sourdough.',
    cuisine: 'British',
    time: '45 min',
  },
];

const LIST = [
  {
    aisle: 'veg',
    items: ['onions', 'garlic', 'spinach', 'butternut squash', 'lemon'],
  },
  {
    aisle: 'pantry',
    items: ['dried pasta', 'red lentils', 'miso paste', 'freekeh'],
  },
  {
    aisle: 'dairy',
    items: ['pecorino', 'halloumi', 'eggs'],
  },
  {
    aisle: 'meat',
    items: ['pancetta', 'whole chicken'],
  },
];

export default function NotebookWeekScene() {
  const [active, setActive] = useState(null); // { type: 'day', idx } | { type: 'list' } | null
  // { name: 'you' | 'alex' } — tracked separately so we can show who ticked what.
  const [ticked, setTicked] = useState({});
  const [toast, setToast] = useState(null);

  // Esc closes whichever card is open.
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => { if (e.key === 'Escape') setActive(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  // When the list opens, simulate a flatmate ticking something off after a
  // beat — the realtime shared-list bit is the headline feature, so the
  // sandbox should actually show it happening.
  useEffect(() => {
    if (active?.type !== 'list') { setToast(null); return; }
    const tickIt = setTimeout(() => {
      setTicked((prev) => (prev.pecorino ? prev : { ...prev, pecorino: 'alex' }));
      setToast({ who: 'Alex', item: 'pecorino' });
    }, 2200);
    const clearToast = setTimeout(() => setToast(null), 6500);
    return () => { clearTimeout(tickIt); clearTimeout(clearToast); };
  }, [active]);

  const activeDay = active?.type === 'day' ? DAYS[active.idx] : null;
  const toggleTick = (name) => setTicked((t) => {
    const next = { ...t };
    if (next[name]) delete next[name]; else next[name] = 'you';
    return next;
  });

  return (
    <div className="relative mx-auto max-w-2xl select-none">
      {/* Sprig peeking in from the top-left, rotated like a pressed leaf */}
      <div className="absolute -top-4 -left-2 sm:-left-6 text-orange-300/70 -rotate-[18deg] pointer-events-none" aria-hidden="true">
        <GlyphSprig className="w-10 h-10" />
      </div>

      {/* The notebook sheet */}
      <div className="relative bg-white/80 backdrop-blur-sm rounded-[22px] border border-orange-100 pt-7 pb-10 px-5 sm:px-9 shadow-warm">
        {/* Page header */}
        <div className="flex items-baseline justify-between mb-5">
          <p className="font-display italic text-orange-500 text-sm tracking-wide">wk of 13 oct</p>
          <p className="font-display italic text-orange-400 text-xs">— for two</p>
        </div>

        {/* Seven rough-edged day boxes — each a button that opens the menu */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {DAYS.map((day, i) => {
            const isActive = active?.type === 'day' && active.idx === i;
            const rotation = i === 0 ? '-rotate-[1deg]' : i === 2 ? 'rotate-[1.5deg]' : i === 4 ? '-rotate-[0.5deg]' : i === 6 ? 'rotate-[0.5deg]' : '';
            return (
              <div key={day.d} className="relative">
                <p className="text-orange-400 text-[9px] sm:text-[10px] mb-1 tracking-wider font-display italic">{day.d}</p>
                <button
                  type="button"
                  onClick={() => setActive(isActive ? null : { type: 'day', idx: i })}
                  aria-expanded={isActive}
                  aria-label={`${day.d}: ${day.dish}`}
                  className={`w-full aspect-square rounded-[10px] border-[1.5px] flex items-center justify-center px-0.5 text-center font-display text-[10px] sm:text-xs transition ${rotation} ${
                    isActive
                      ? day.away
                        ? 'border-sage-500 bg-sage-100/70 text-sage-700 shadow-warm'
                        : 'border-orange-500 bg-orange-50 text-orange-900 shadow-warm'
                      : day.away
                        ? 'border-dashed border-sage-400/80 text-sage-700 hover:bg-sage-100/60'
                        : 'border-orange-300/80 text-orange-800 hover:border-orange-400 hover:bg-orange-50/60'
                  }`}
                >
                  <span className={day.strike ? 'line-through decoration-[1.5px] text-orange-400' : ''}>{day.label}</span>
                </button>

                {day.swap && (
                  <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 font-display italic text-orange-500 text-[10px] sm:text-xs whitespace-nowrap pointer-events-none">
                    → {day.swap}
                  </span>
                )}
                {day.away && (
                  <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 font-display italic text-sage-600 text-[10px] sm:text-xs whitespace-nowrap pointer-events-none">
                    @ {day.away}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Inline card below the grid — either the day's menu or the list.
            Appears in the same sheet so the notebook page feels alive,
            not a modal popping on top. */}
        {activeDay && (
          <div className={`mt-10 relative rounded-[16px] border px-5 py-4 shadow-warm ${
            activeDay.away ? 'border-sage-300/70 bg-sage-100/50' : 'border-orange-200 bg-orange-50/70'
          }`}>
            <button
              type="button"
              onClick={() => setActive(null)}
              aria-label="Close menu"
              className={`absolute top-2 right-3 text-lg leading-none transition ${
                activeDay.away ? 'text-sage-500 hover:text-sage-700' : 'text-orange-400 hover:text-orange-700'
              }`}
            >×</button>
            <div className="flex items-center gap-2 mb-0.5">
              <p className={`font-display italic text-xs tracking-wide ${activeDay.away ? 'text-sage-600' : 'text-orange-500'}`}>
                {activeDay.d} night
              </p>
              {activeDay.away && (
                <span className="text-[10px] font-display italic bg-sage-500 text-white rounded-full px-2 py-0.5 tracking-wide">
                  eating out
                </span>
              )}
            </div>
            <p className={`font-display text-xl font-semibold mt-0.5 leading-tight ${activeDay.away ? 'text-sage-800' : 'text-orange-900'}`}>
              {activeDay.dish}
            </p>
            <p className="text-sm text-orange-800/85 leading-relaxed mt-2 max-w-md">{activeDay.overview}</p>
            <div className={`mt-3 flex items-center gap-2 text-xs font-display italic ${activeDay.away ? 'text-sage-600' : 'text-orange-600'}`}>
              <span>{activeDay.away ? `${activeDay.time} at ${activeDay.away}` : activeDay.time}</span>
              <span className={activeDay.away ? 'text-sage-300' : 'text-orange-300'}>·</span>
              <span>{activeDay.cuisine}</span>
            </div>
          </div>
        )}

        {active?.type === 'list' && (
          <div className="mt-10 relative rounded-[16px] border border-orange-200 bg-white/90 px-5 py-4 shadow-warm">
            <button
              type="button"
              onClick={() => setActive(null)}
              aria-label="Close list"
              className="absolute top-2 right-3 text-orange-400 hover:text-orange-700 text-lg leading-none"
            >×</button>
            <div className="flex items-baseline justify-between mb-3 pr-6">
              <p className="font-display text-lg font-semibold text-orange-900">Shopping list</p>
              <p className="font-display italic text-orange-400 text-xs">tick as you go</p>
            </div>

            {toast && (
              <div className="absolute -top-3 left-5 right-5 sm:left-auto sm:right-5 sm:max-w-[14rem] bg-sage-500 text-white rounded-full px-3 py-1.5 shadow-warm flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-display italic flex-shrink-0">A</span>
                <span className="text-xs font-display italic leading-tight">{toast.who} ticked {toast.item} at the shop</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {LIST.map(({ aisle, items }) => (
                <div key={aisle}>
                  <p className="font-display italic text-orange-500 text-xs tracking-wide mb-1.5">{aisle}</p>
                  <ul className="space-y-1">
                    {items.map((name) => {
                      const by = ticked[name];
                      const on = !!by;
                      return (
                        <li key={name}>
                          <button
                            type="button"
                            onClick={() => toggleTick(name)}
                            className={`flex items-center gap-2 text-sm transition text-left w-full ${
                              on ? 'text-orange-400 line-through' : 'text-orange-800 hover:text-orange-900'
                            }`}
                          >
                            <span className={`w-3.5 h-3.5 rounded-[4px] border-[1.5px] flex-shrink-0 flex items-center justify-center ${
                              on ? 'bg-sage-500 border-sage-500' : 'border-orange-300'
                            }`}>
                              {on && (
                                <svg viewBox="0 0 10 10" className="w-2 h-2 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M1.5 5.5 L4 8 L8.5 2.5" />
                                </svg>
                              )}
                            </span>
                            <span className="flex-1">{name}</span>
                            {by === 'alex' && (
                              <span className="text-[9px] font-display italic text-sage-600 bg-sage-100 rounded-full px-1.5 py-0.5 tracking-wide">Alex</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Margin scribble — stays put as the orienting note */}
        {!active && (
          <div className="mt-10 flex items-start gap-3">
            <svg viewBox="0 0 80 40" className="w-16 h-8 text-orange-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M4 4 C 20 6, 38 22, 58 30" />
              <path d="M58 30 L 52 26 M 58 30 L 56 22" />
            </svg>
            <p className="font-display italic text-orange-700/80 text-sm leading-snug pt-1">
              tap a day to see the dish — or the basket for the list.
            </p>
          </div>
        )}
      </div>

      {/* Basket — now a button that opens the list card inside the sheet */}
      <button
        type="button"
        onClick={() => setActive(active?.type === 'list' ? null : { type: 'list' })}
        aria-expanded={active?.type === 'list'}
        aria-label="Open shopping list"
        className={`absolute -bottom-6 -right-2 sm:-right-6 flex items-center gap-2 rotate-[3deg] group transition ${
          active?.type === 'list' ? 'scale-105' : 'hover:scale-105'
        }`}
      >
        <span className="font-display italic text-orange-500 text-xs group-hover:text-orange-700 transition">list →</span>
        <div className={`border rounded-[14px] p-2 transition shadow-warm ${
          active?.type === 'list'
            ? 'bg-orange-500 border-orange-500 text-white'
            : 'bg-orange-100/70 border-orange-200 text-orange-700 group-hover:bg-orange-200/80'
        }`}>
          <GlyphBasket className="w-6 h-6" />
        </div>
      </button>
    </div>
  );
}
