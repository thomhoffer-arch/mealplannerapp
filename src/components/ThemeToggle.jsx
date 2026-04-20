import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { getPreference, setPreference } from '../lib/theme';

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const pref = getPreference();
    setDark(pref === 'dark');
    const handler = (e) => setDark((e.detail?.preference || getPreference()) === 'dark');
    window.addEventListener('theme-change', handler);
    return () => window.removeEventListener('theme-change', handler);
  }, []);

  function toggle() {
    const next = dark ? 'light' : 'dark';
    setDark(!dark);
    setPreference(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className="w-9 h-9 rounded-full flex items-center justify-center text-orange-400 hover:bg-orange-50 transition"
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
