import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function NotificationBell({ household }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef(null);
  const buttonRef = useRef(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Subscribe to household activity after mount — only new events create notifications
  useEffect(() => {
    if (!household) return;

    const channel = supabase
      .channel(`notif-${household.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'meal_plan_items', filter: `household_id=eq.${household.id}` },
        (payload) => {
          const name = payload.new?.recipe_data?.name || 'A recipe';
          addNotification(`${name} was added to the meal plan`);
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'meal_plan_items', filter: `household_id=eq.${household.id}` },
        (payload) => {
          const name = payload.old?.recipe_data?.name || 'A recipe';
          addNotification(`${name} was removed from the meal plan`);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'starred_recipes', filter: `household_id=eq.${household.id}` },
        (payload) => {
          const name = payload.new?.recipe_data?.name || 'A recipe';
          addNotification(`${name} was starred`);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [household?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function addNotification(message) {
    setNotifications((prev) => [
      { id: Date.now(), message, timestamp: new Date(), read: false },
      ...prev,
    ].slice(0, 20)); // keep last 20
  }

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function dismiss(id) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  // Close popover when clicking outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target) &&
          buttonRef.current && !buttonRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function formatTime(date) {
    const mins = Math.round((Date.now() - date) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-9 rounded-full flex items-center justify-center text-orange-400 hover:bg-orange-50 transition relative"
        title="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center px-0.5">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-11 bg-white rounded-xl shadow-lg border border-orange-100 w-80 z-40 max-h-96 flex flex-col"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-orange-50">
            <span className="text-sm font-semibold text-orange-900">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-orange-600 hover:text-orange-900 font-medium flex items-center gap-1 transition"
              >
                <Check size={11} /> Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="text-center py-8 text-orange-400">
                <Bell size={28} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No activity yet</p>
                <p className="text-xs mt-0.5">Changes your partner makes will appear here</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-2 px-4 py-3 border-b border-orange-50 last:border-0 transition-colors ${n.read ? '' : 'bg-orange-50/60'}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-orange-900 leading-snug">{n.message}</p>
                    <p className="text-xs text-orange-400 mt-0.5">{formatTime(n.timestamp)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                    {!n.read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                    )}
                    <button
                      onClick={() => dismiss(n.id)}
                      className="text-orange-400 hover:text-orange-600 transition"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
