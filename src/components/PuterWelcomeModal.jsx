import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import PuterConnect from './PuterConnect';

// Shown after signup when the user chose the pay-as-you-go plan.
// Triggered by the `mp-pending-puter-connect` localStorage flag set on the
// plan screen. Clears the flag on dismiss or after a successful connect.
export default function PuterWelcomeModal({ onClose }) {
  const [connected, setConnected] = useState(false);
  const [hint, setHint] = useState('');

  function dismiss() {
    try { localStorage.removeItem('mp-pending-puter-connect'); } catch {}
    onClose?.();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-warm-lg border border-orange-100 w-full max-w-md p-7 relative">
        <button onClick={dismiss} className="absolute top-4 right-4 text-orange-400 hover:text-orange-600 transition">
          <X size={18} />
        </button>

        {!connected ? (
          <>
            <p className="font-display italic text-orange-600/80 text-xs tracking-wide mb-2">One last step</p>
            <h2 className="font-display text-2xl font-semibold text-orange-900 leading-tight mb-2">
              Connect Puter to unlock the AI.
            </h2>
            <p className="text-sm text-orange-900/80 leading-relaxed mb-5">
              Puter runs the AI for your household and bills you directly. A popup will open — sign in or create a Puter account, then come back here. You can top up a few euros and it'll cover weeks of planning.
            </p>
            <PuterConnect
              label="Open Puter and connect"
              onConnected={(h) => { setHint(h || ''); setConnected(true); }}
            />
            <button onClick={dismiss} className="w-full text-center text-xs text-orange-600 hover:text-orange-900 mt-4 transition">
              Skip for now — I'll do this in Settings
            </button>
          </>
        ) : (
          <>
            <div className="w-12 h-12 bg-sage-100 rounded-full flex items-center justify-center mb-4">
              <Check className="w-6 h-6 text-sage-600" />
            </div>
            <h2 className="font-display text-2xl font-semibold text-orange-900 leading-tight mb-2">You're in.</h2>
            <p className="text-sm text-orange-900/80 leading-relaxed mb-5">
              Puter is connected{hint && <> (ending <code className="text-xs bg-orange-50 px-1.5 py-0.5 rounded">…{hint}</code>)</>}. Your household can now use unlimited AI — pick a recipe and hit <em>Suggest adaptations</em> to try it.
            </p>
            <button
              onClick={dismiss}
              className="w-full py-3 bg-orange-500 text-white rounded-full font-medium hover:bg-orange-600 transition text-sm shadow-warm"
            >
              Start cooking
            </button>
          </>
        )}
      </div>
    </div>
  );
}
