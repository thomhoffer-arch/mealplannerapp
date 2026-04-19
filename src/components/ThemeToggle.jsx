import React, { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { getPreference, setPreference } from '../lib/theme';

const OPTIONS = [
  { value: 'light',  icon: Sun,     label: 'Light'  },
  { value: 'system', icon: Monitor, label: 'System' },
  { value: 'dark',   icon: Moon,    label: 'Dark'   },
];

export default function ThemeToggle() {
  const [pref, setPref] = useState('system');

  useEffect(() => {
    setPref(getPreference());
    const handler = (e) => setPref(e.detail?.preference || getPreference());
    window.addEventListener('theme-change', handler);
    return () => window.removeEventListener('theme-change', handler);
  }, []);

  const choose = (value) => {
    setPref(value);
    setPreference(value);
  };

  return (
    <div className="inline-flex rounded-full border border-orange-200 bg-orange-50 p-0.5 gap-0">
      {OPTIONS.map(({ value, icon: Icon, label }) => {
        const active = pref === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => choose(value)}
            aria-label={`${label} theme`}
            title={label}
            className={`w-7 h-7 inline-flex items-center justify-center rounded-full transition-all ${
              active
                ? 'bg-white text-orange-800 shadow-sm'
                : 'text-orange-400 hover:text-orange-600'
            }`}
          >
            <Icon size={12} />
          </button>
        );
      })}
    </div>
  );
}
