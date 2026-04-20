import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, LogOut, Users } from 'lucide-react';

// Renders nothing if the user only belongs to one household — there's nothing
// to switch between, and the household name is already visible elsewhere.
//
// variant: 'card' (default) renders inside a panel for the Profile tab.
//          'chip' renders a compact pill with a popover; suits a sticky header.
// onLeave: optional — when provided, a "Leave this household" row is rendered
//          at the bottom of the dropdown (only in the chip variant for now;
//          the card variant already has a dedicated Leave button elsewhere).
export default function HouseholdSwitcher({ memberships, activeId, onSwitch, onLeave, variant = 'card' }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  // Close the popover when clicking outside the chip variant.
  useEffect(() => {
    if (variant !== 'chip' || !open) return;
    function handle(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [variant, open]);

  if (!memberships || memberships.length < 2) return null;

  const active = memberships.find((m) => m.household_id === activeId);
  const activeName = active?.households?.name || 'Unknown';

  function pickList() {
    return memberships.map((m) => {
      const isActive = m.household_id === activeId;
      return (
        <button
          key={m.household_id}
          onClick={() => { onSwitch(m.household_id); setOpen(false); }}
          className={`w-full flex items-center gap-2 px-4 py-2.5 text-left transition ${
            isActive ? 'bg-orange-50' : 'hover:bg-orange-50'
          }`}
        >
          <span className={`text-sm flex-1 truncate ${isActive ? 'font-semibold text-orange-900' : 'text-orange-700'}`}>
            {m.households?.name || 'Unknown'}
          </span>
          {isActive && <Check size={14} className="text-orange-600 flex-shrink-0" />}
        </button>
      );
    });
  }

  if (variant === 'chip') {
    return (
      <div ref={wrapperRef} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full bg-white border border-orange-200 hover:border-orange-300 transition text-xs"
          title="Switch household"
        >
          <Users size={12} className="text-orange-600" />
          <span className="font-semibold text-orange-900 max-w-[140px] truncate">{activeName}</span>
          <ChevronDown size={12} className={`text-orange-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="absolute right-0 mt-1.5 w-56 bg-white rounded-2xl border border-orange-100 shadow-warm-lg overflow-hidden z-40">
            <div className="px-4 py-2 border-b border-orange-50 text-[10px] uppercase tracking-wide text-orange-400 font-semibold">
              Your households
            </div>
            {pickList()}
            {onLeave && (
              <button
                onClick={() => { setOpen(false); onLeave(activeId); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-left border-t border-orange-50 hover:bg-red-50 transition"
              >
                <LogOut size={12} className="text-orange-400" />
                <span className="text-xs text-orange-400 hover:text-red-500 flex-1">Leave {activeName}</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-orange-100 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 transition"
      >
        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
          <Users size={14} className="text-orange-600" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-xs text-orange-400">Active household</p>
          <p className="text-sm font-semibold text-orange-900 truncate">{activeName}</p>
        </div>
        <ChevronDown
          size={16}
          className={`text-orange-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && <div className="border-t border-orange-50">{pickList()}</div>}
    </div>
  );
}
