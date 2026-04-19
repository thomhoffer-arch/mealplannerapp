import React from 'react';

// Canonical hand-drawn glyph set. Every glyph shares the same stroke
// weight, caps and join so the whole pack reads like one illustrator's
// pencil. Add new glyphs here — never inline fresh SVGs in feature code.
//
// Rules for adding a glyph:
//   • 32×32 viewBox
//   • strokeWidth 1.5, round caps and joins, currentColor fill none
//   • no gradients, shadows, or multiple weights — single-pass line art
//   • aim for an object you could sketch on a napkin, not an icon set
//
// See DESIGN.md for the broader visual voice.
export const GLYPH_PROPS = {
  viewBox: '0 0 32 32',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function GlyphSprig({ className = 'w-7 h-7' }) {
  return (
    <svg {...GLYPH_PROPS} className={className}>
      <path d="M16 28 C 16 22 14.5 17 14 14 C 13.5 10 13.5 6 14.5 3" />
      <path d="M14 8 Q 10 7 7.5 9" />
      <path d="M14.4 12 Q 18 11 20.5 12.5" />
      <path d="M14.2 17 Q 10 16 7.5 18" />
      <path d="M15 22 Q 19 21 21.5 22.5" />
    </svg>
  );
}

// Notebook page — slightly warped rectangle, wavy header rule, binder
// rings sketched with a little arc so they don't feel ruler-perfect.
export function GlyphCalendar({ className = 'w-7 h-7' }) {
  return (
    <svg {...GLYPH_PROPS} className={className}>
      <path d="M5.5 8 Q 16 6.8 26.8 7.6 Q 27.4 17 26.6 27.2 Q 16 28.2 5.2 27.4 Q 4.7 17 5.5 8 Z" />
      <path d="M5.5 13.2 Q 16 12.4 26.8 13" />
      <path d="M10 4 Q 9.6 7 10.2 9.8" />
      <path d="M22 4 Q 22.4 7 21.8 9.8" />
      <path d="M10.2 17.6 Q 11.2 17.2 12 17.8" />
      <path d="M15.4 17.6 Q 16.4 17.2 17.2 17.8" />
      <path d="M20.6 17.6 Q 21.6 17.2 22.4 17.8" />
      <path d="M10.2 22.4 Q 11.2 22 12 22.6" />
      <path d="M15.4 22.4 Q 16.4 22 17.2 22.6" />
    </svg>
  );
}

// Wicker basket — curved belly, a handle that arcs overhead, three weave
// lines that bow with the shape. Drawn like someone sketching a picnic.
export function GlyphBasket({ className = 'w-7 h-7' }) {
  return (
    <svg {...GLYPH_PROPS} className={className}>
      <path d="M4.2 12.4 Q 16 11.2 27.8 12.4 Q 26.8 19.2 24.4 26 Q 16 27 7.6 26 Q 5.2 19.2 4.2 12.4 Z" />
      <path d="M9.4 12.4 Q 11.5 5.6 16 5.2 Q 20.5 5.6 22.6 12.4" />
      <path d="M11 16 Q 11.6 19.6 12.4 23" />
      <path d="M16 16 Q 16 19.6 16 23.2" />
      <path d="M21 16 Q 20.4 19.6 19.6 23" />
    </svg>
  );
}

// Five-point star, but drawn with quadratic curves between the points so
// the edges bulge slightly — a pencil star, not a geometric one. Inside
// trace loops back for that one-stroke doodle feel.
export function GlyphStar({ className = 'w-7 h-7' }) {
  return (
    <svg {...GLYPH_PROPS} className={className}>
      <path d="M16 4.6 Q 17.4 8.4 18.6 11.6 Q 22.6 12 26.6 12.8 Q 23.4 15.6 20.8 18.2 Q 21.6 22 22.8 26 Q 19.2 23.8 16 22.2 Q 12.8 23.8 9.2 26 Q 10.4 22 11.2 18.2 Q 8.6 15.6 5.4 12.8 Q 9.4 12 13.4 11.6 Q 14.6 8.4 16 4.6 Z" />
      <path d="M16 4.6 Q 15.6 5 15.4 5.6" />
    </svg>
  );
}

export function GlyphTwo({ className = 'w-7 h-7' }) {
  return (
    <svg {...GLYPH_PROPS} className={className}>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M5.5 24 Q 5.5 18 12 18 Q 14 18 15.5 18.5" />
      <circle cx="21" cy="14" r="3.5" />
      <path d="M14.5 26 Q 14.5 20 21 20 Q 27 20 27 26" />
    </svg>
  );
}

export function GlyphLink({ className = 'w-7 h-7' }) {
  return (
    <svg {...GLYPH_PROPS} className={className}>
      <path d="M14 10 H8.5 Q 4 10 4 14 Q 4 18 8.5 18 H14" />
      <path d="M18 22 H23.5 Q 28 22 28 18 Q 28 14 23.5 14 H18" />
      <path d="M10 16 H22" />
    </svg>
  );
}

// Simmering pot — "the week cooks itself." Used for AI week planner entries.
export function GlyphPot({ className = 'w-7 h-7' }) {
  return (
    <svg {...GLYPH_PROPS} className={className}>
      <path d="M11 5 Q 13 7 11 9" />
      <path d="M16 4 Q 18 6 16 8" />
      <path d="M21 5 Q 23 7 21 9" />
      <path d="M4 13 H28" />
      <path d="M6 13 L8 26 H24 L26 13" />
      <path d="M4 13 Q 2 13 2 15" />
      <path d="M28 13 Q 30 13 30 15" />
    </svg>
  );
}

// Magnifier — browsing, searching. Softer circle so it doesn't feel stock.
export function GlyphSpyglass({ className = 'w-7 h-7' }) {
  return (
    <svg {...GLYPH_PROPS} className={className}>
      <circle cx="13" cy="13" r="7.5" />
      <path d="M18.5 18.5 L26 26" />
      <path d="M10 10 Q 12 9 14 10" />
    </svg>
  );
}

// Hand-drawn scribble underline — the kind of mark a designer would
// make with a red pencil on a proof. Use under a single italic word
// in display headings. One per screen — don't over-use.
export function Scribble({ className = '' }) {
  return (
    <svg viewBox="0 0 200 14" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M4 9 C 28 3, 58 12, 92 6 S 158 12, 196 4" />
    </svg>
  );
}
