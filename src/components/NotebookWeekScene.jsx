import React from 'react';
import { GlyphSprig, GlyphBasket } from './glyphs';

// A hand-drawn notebook page showing a week-in-progress: seven rough
// boxes, one dish crossed out and swapped, a margin note, and a curved
// arrow pointing from the grid to a small basket labelled "list".
// Composed in layout rather than a single monolithic SVG so the
// handwritten margin notes can use real Fraunces italic.
//
// Not a glyph — lives in its own module rather than glyphs.jsx, which is
// reserved for 32×32 single-pass icons (see DESIGN.md).
export default function NotebookWeekScene() {
  const days = [
    { d: 'mon', n: 'pasta' },
    { d: 'tue', n: 'curry' },
    { d: 'wed', n: 'tofu bowl', strike: true },
    { d: 'thu', n: 'salad' },
    { d: 'fri', n: 'pizza' },
    { d: 'sat', n: 'roast' },
    { d: 'sun', n: 'soup' },
  ];

  return (
    <div className="relative mx-auto max-w-2xl select-none" aria-hidden="true">
      {/* Sprig peeking in from the top-left, rotated like a pressed leaf */}
      <div className="absolute -top-4 -left-2 sm:-left-6 text-orange-300/70 -rotate-[18deg]">
        <GlyphSprig className="w-10 h-10" />
      </div>

      {/* The notebook sheet */}
      <div className="relative bg-white/80 backdrop-blur-sm rounded-[22px] border border-orange-100 pt-7 pb-10 px-5 sm:px-9 shadow-warm">
        {/* Page header */}
        <div className="flex items-baseline justify-between mb-5">
          <p className="font-display italic text-orange-500 text-sm tracking-wide">wk of 13 oct</p>
          <p className="font-display italic text-orange-400 text-xs">— for two</p>
        </div>

        {/* Seven rough-edged day boxes with slight rotation */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {days.map((day, i) => (
            <div key={day.d} className="relative">
              <p className="text-orange-400 text-[9px] sm:text-[10px] mb-1 tracking-wider font-display italic">{day.d}</p>
              <div
                className={`aspect-square rounded-[10px] border-[1.5px] border-orange-300/80 flex items-center justify-center px-0.5 text-center font-display text-[10px] sm:text-xs text-orange-800 ${
                  i === 0 ? '-rotate-[1deg]' : i === 2 ? 'rotate-[1.5deg]' : i === 4 ? '-rotate-[0.5deg]' : i === 6 ? 'rotate-[0.5deg]' : ''
                }`}
              >
                <span className={day.strike ? 'line-through decoration-[1.5px] text-orange-400' : ''}>{day.n}</span>
              </div>

              {/* Swap arrow + margin note pinned to the crossed-out day */}
              {day.strike && (
                <span className="absolute -bottom-7 -left-1 font-display italic text-orange-500 text-[10px] sm:text-xs whitespace-nowrap">
                  → ramen
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Margin scribble pointing down at the week */}
        <div className="mt-10 flex items-start gap-3">
          <svg viewBox="0 0 80 40" className="w-16 h-8 text-orange-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M4 4 C 20 6, 38 22, 58 30" />
            <path d="M58 30 L 52 26 M 58 30 L 56 22" />
          </svg>
          <p className="font-display italic text-orange-700/80 text-sm leading-snug pt-1">
            list builds itself — tick milk at the shop, everyone sees it at home.
          </p>
        </div>
      </div>

      {/* Basket floating off the bottom-right like a tagged marginal */}
      <div className="absolute -bottom-6 -right-2 sm:-right-6 flex items-center gap-2 rotate-[3deg]">
        <span className="font-display italic text-orange-500 text-xs">list →</span>
        <div className="bg-orange-100/70 border border-orange-200 rounded-[14px] p-2 text-orange-700">
          <GlyphBasket className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
