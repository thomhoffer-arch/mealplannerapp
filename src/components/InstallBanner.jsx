import React, { useState, useEffect } from 'react';
import { X, Download, Share } from 'lucide-react';

const DISMISSED_KEY = 'pwa_install_dismissed';

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
}

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIosHint, setShowIosHint]       = useState(false);
  const [visible, setVisible]               = useState(false);

  useEffect(() => {
    // Don't show if already installed or user dismissed before
    if (isInStandaloneMode()) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    // Android/Chrome: intercept the native install prompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Small delay so it doesn't pop up the moment the page loads
      setTimeout(() => setVisible(true), 8000);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS Safari: no beforeinstallprompt event — show manual hint instead
    if (isIos()) {
      setTimeout(() => { setShowIosHint(true); setVisible(true); }, 8000);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  }

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      localStorage.setItem(DISMISSED_KEY, '1');
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 left-0 right-0 z-40 px-4 pointer-events-none">
      <div className="max-w-sm mx-auto bg-white rounded-2xl shadow-xl border border-orange-100 p-4 pointer-events-auto animate-slide-up">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
            {showIosHint ? <Share size={18} className="text-orange-600" /> : <Download size={18} className="text-orange-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-orange-900">Add to Home Screen</p>
            {showIosHint ? (
              <p className="text-xs text-orange-600 mt-0.5 leading-relaxed">
                Tap <span className="inline-flex items-center gap-0.5 font-semibold">
                  <Share size={11} className="inline" /> Share
                </span> at the bottom of Safari, then{' '}
                <span className="font-semibold">Add to Home Screen</span>.
              </p>
            ) : (
              <p className="text-xs text-orange-600 mt-0.5">
                Install the app for the best experience — works offline too.
              </p>
            )}
          </div>
          <button onClick={dismiss}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-orange-400 hover:bg-orange-50 transition">
            <X size={14} />
          </button>
        </div>

        {!showIosHint && (
          <div className="flex gap-2 mt-3">
            <button onClick={dismiss}
              className="flex-1 py-2 rounded-xl border border-orange-200 text-sm text-orange-600 font-medium hover:bg-orange-50 transition">
              Not now
            </button>
            <button onClick={install}
              className="flex-1 py-2 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition">
              Install
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
