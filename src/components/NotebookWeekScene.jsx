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
    dish: 'Friday pizza night',
    overview: 'Shop-bought base, whatever\u2019s in the fridge, the oven on high.',
    cuisine: 'Italian',
    time: '30 min',
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
  const [ticked, setTicked] = useState({});

  // Esc closes whichever card is open.
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => { if (e.key === 'Escape') setActive(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  const activeDay = active?.type === 'day' ? DAYS[active.idx] : null;
  const toggleTick = (name) => setTicked((t) => ({ ...t, [name]: !t[name] }));

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
                      ? 'border-orange-500 bg-orange-50 text-orange-900 shadow-warm'
                      : 'border-orange-300/80 text-orange-800 hover:border-orange-400 hover:bg-orange-50/60'
                  }`}
                >
                  <span className={day.strike ? 'line-through decoration-[1.5px] text-orange-400' : ''}>{day.label}</span>
                </button>

                {day.swap && (
                  <span className="absolute -bottom-7 -left-1 font-display italic text-orange-500 text-[10px] sm:text-xs whitespace-nowrap pointer-events-none">
                    → {day.swap}
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
          <div className="mt-10 relative rounded-[16px] border border-orange-200 bg-orange-50/70 px-5 py-4 shadow-warm">
            <button
              type="button"
              onClick={() => setActive(null)}
              aria-label="Close menu"
              className="absolute top-2 right-3 text-orange-400 hover:text-orange-700 text-lg leading-none"
            >×</button>
            <p className="font-display italic text-orange-500 text-xs tracking-wide">{activeDay.d} night</p>
            <p className="font-display text-xl font-semibold text-orange-900 mt-0.5 leading-tight">{activeDay.dish}</p>
            <p className="text-sm text-orange-800/85 leading-relaxed mt-2 max-w-md">{activeDay.overview}</p>
            <div className="mt-3 flex items-center gap-2 text-xs font-display italic text-orange-600">
              <span>{activeDay.time}</span>
              <span className="text-orange-300">·</span>
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
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {LIST.map(({ aisle, items }) => (
                <div key={aisle}>
                  <p className="font-display italic text-orange-500 text-xs tracking-wide mb-1.5">{aisle}</p>
                  <ul className="space-y-1">
                    {items.map((name) => {
                      const on = !!ticked[name];
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
                            <span>{name}</span>
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
