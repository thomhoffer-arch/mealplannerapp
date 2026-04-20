import React, { useState } from 'react';
import { apiFetch } from '../lib/api';

// One-click Puter connect. Opens the Puter auth popup, grabs the session
// token, and stores it on the household via /api/household/save-puter-token.
//
// Props:
//   onConnected(hint)  — called after the token is saved; `hint` is the last 4 chars.
//   label              — button text (default: "Connect with Puter").
//   variant            — 'primary' | 'ghost' (default 'primary').
export default function PuterConnect({ onConnected, label = 'Connect with Puter', variant = 'primary' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleClick() {
    setError('');
    if (typeof window === 'undefined' || !window.puter) {
      setError('Puter is still loading — give it a second and try again.');
      return;
    }
    setBusy(true);
    try {
      // Opens Puter's sign-in popup. Resolves once the user signs in / creates
      // their Puter account. After this, `puter.authToken` is populated.
      await window.puter.auth.signIn();
      const token = window.puter.authToken;
      if (!token) throw new Error('Puter did not return a token.');

      const data = await apiFetch('/api/household/save-key', {
        method: 'POST',
        body: { token },
      });

      onConnected?.(data.hint);
    } catch (err) {
      setError(err.message || 'Could not connect to Puter.');
    } finally {
      setBusy(false);
    }
  }

  const base = 'w-full rounded-2xl font-medium transition text-sm flex items-center justify-center gap-2 disabled:opacity-50';
  const styles = variant === 'ghost'
    ? `${base} border border-orange-200 bg-white text-orange-900 hover:bg-orange-50 px-4 py-3`
    : `${base} bg-orange-900 text-white hover:bg-orange-800 px-4 py-3 shadow-warm`;

  return (
    <div>
      <button type="button" onClick={handleClick} disabled={busy} className={styles}>
        <PuterMark />
        {busy ? 'Opening Puter…' : label}
      </button>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  );
}

function PuterMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 20h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="11" r="2.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
