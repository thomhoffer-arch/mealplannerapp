import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

export default function UpdateToast() {
  const [registration, setRegistration] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      setRegistration(e.detail);
      setDismissed(false);
    };
    window.addEventListener('sw-update-ready', handler);
    return () => window.removeEventListener('sw-update-ready', handler);
  }, []);

  if (!registration?.waiting || dismissed) return null;

  const applyUpdate = () => {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    // controllerchange listener in serviceWorker.js triggers the reload
  };

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-orange-500 text-white rounded-full shadow-warm-lg px-4 py-3 flex items-center gap-3 animate-slide-up">
      <RefreshCw size={18} />
      <span className="text-sm font-medium">New version available</span>
      <button
        onClick={applyUpdate}
        className="bg-white text-orange-600 px-3 py-1 rounded-full text-sm font-medium hover:bg-orange-50 transition"
      >
        Refresh
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="text-white/80 hover:text-white transition"
      >
        <X size={16} />
      </button>
    </div>
  );
}
