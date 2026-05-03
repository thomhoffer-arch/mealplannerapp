// Countries in the southern hemisphere — seasons are inverted relative to
// the northern hemisphere.
const SOUTHERN = new Set([
  'australia', 'new zealand', 'south africa', 'argentina', 'chile', 'brazil',
  'peru', 'bolivia', 'paraguay', 'uruguay', 'namibia', 'botswana', 'zimbabwe',
  'zambia', 'mozambique', 'madagascar', 'lesotho', 'eswatini', 'swaziland',
  'angola', 'indonesia', 'east timor', 'timor-leste', 'papua new guinea',
]);

// Countries near the equator have no meaningful season — skip the hint.
const TROPICAL = new Set([
  'singapore', 'malaysia', 'thailand', 'philippines', 'vietnam', 'cambodia',
  'laos', 'myanmar', 'sri lanka', 'nigeria', 'ghana', 'kenya', 'ethiopia',
  'tanzania', 'uganda', 'rwanda', 'senegal', 'ivory coast', "côte d'ivoire",
  'colombia', 'ecuador', 'venezuela', 'panama', 'costa rica', 'cuba',
  'dominican republic', 'jamaica', 'haiti',
]);

/**
 * Returns a { season, hemisphere } object for the given country and month.
 * Returns null for tropical countries or an unrecognised country string.
 *
 * @param {string} country - Free-text country name from household preferences
 * @param {Date}   [date]  - Defaults to now
 */
export function getSeasonInfo(country, date = new Date()) {
  const key = (country || '').trim().toLowerCase();
  if (!key) return null;
  if (TROPICAL.has(key)) return null;

  const month = date.getMonth(); // 0 = January
  const isSouthern = SOUTHERN.has(key);
  const adjusted = isSouthern ? (month + 6) % 12 : month;

  let season;
  if (adjusted >= 2 && adjusted <= 4) season = 'spring';
  else if (adjusted >= 5 && adjusted <= 7) season = 'summer';
  else if (adjusted >= 8 && adjusted <= 10) season = 'autumn';
  else season = 'winter';

  return { season, hemisphere: isSouthern ? 'southern' : 'northern' };
}

/**
 * Builds the prompt section to inject into AI prompts.
 * Returns an empty string when country is not set.
 */
export function buildLocationSection(country) {
  if (!country?.trim()) return '';
  const info = getSeasonInfo(country);
  const seasonLine = info
    ? ` It is currently ${info.season} there — prefer seasonal produce and ingredients typical for this time of year.`
    : '';
  return `\nLOCATION: The household is based in ${country.trim()}.${seasonLine} Prefer ingredients that are locally available and familiar in that country.\n`;
}
