const STORAGE_KEY = 'mp-theme';

// Returns the user's preference — 'system' | 'light' | 'dark'.
export function getPreference() {
  const v = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

// Resolves the effective theme ('light' | 'dark') given a preference.
export function resolveTheme(preference = getPreference()) {
  if (preference === 'light' || preference === 'dark') return preference;
  return typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function applyTheme(preference = getPreference()) {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}

export function setPreference(preference) {
  if (preference === 'system') {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, preference);
  }
  applyTheme(preference);
  window.dispatchEvent(new CustomEvent('theme-change', { detail: { preference } }));
}

// Re-apply the theme when the OS preference changes, but only if the user
// hasn't explicitly chosen light or dark (i.e., they're on "system").
export function watchSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    if (getPreference() === 'system') applyTheme('system');
  };
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}
