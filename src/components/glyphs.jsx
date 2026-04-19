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

export function GlyphCalendar({ className = 'w-7 h-7' }) {
  return (
    <svg {...GLYPH_PROPS} className={className}>
      <rect x="5" y="7" width="22" height="21" rx="2" />
      <path d="M5 13 H27" />
      <path d="M10 4 V10" />
      <path d="M22 4 V10" />
      <circle cx="11" cy="18" r="0.9" fill="currentColor" />
      <circle cx="16" cy="18" r="0.9" fill="currentColor" />
      <circle cx="21" cy="18" r="0.9" fill="currentColor" />
      <circle cx="11" cy="23" r="0.9" fill="currentColor" />
      <circle cx="16" cy="23" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function GlyphBasket({ className = 'w-7 h-7' }) {
  return (
    <svg {...GLYPH_PROPS} className={className}>
      <path d="M4 12 H28 L25 26 H7 Z" />
      <path d="M10 12 L14 5" />
      <path d="M22 12 L18 5" />
      <path d="M12 17 V22" />
      <path d="M16 17 V22" />
      <path d="M20 17 V22" />
    </svg>
  );
}

export function GlyphStar({ className = 'w-7 h-7' }) {
  return (
    <svg {...GLYPH_PROPS} className={className}>
      <path d="M16 5 L19.4 12 L27 13 L21.5 18.3 L23 26 L16 22.5 L9 26 L10.5 18.3 L5 13 L12.6 12 Z" />
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
