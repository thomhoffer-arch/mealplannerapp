import React, { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { apiFetch, setActiveHouseholdId } from '../lib/api';

// Danger-zone actions that live at the bottom of the Profile tab:
//   - Export all household data as JSON (GDPR-friendly)
//   - Soft-delete the account (bans auth user for 30 days, strips
//     memberships, schedules hard-purge via deleted_accounts ledger)
export default function AccountActions() {
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleExport() {
    setError('');
    setExporting(true);
    try {
      const data = await apiFetch('/api/account');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mealplanner-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Could not export data');
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    const confirm1 = window.confirm(
      "Delete your account?\n\n" +
      "All your data will be removed from every household. If you're the only member of a household, that household is deleted too.\n\n" +
      "You'll be signed out and unable to sign back in for 30 days. After that the account is purged for good."
    );
    if (!confirm1) return;
    const confirm2 = window.prompt('Type DELETE to confirm.');
    if (confirm2 !== 'DELETE') return;

    setError('');
    setDeleting(true);
    try {
      await apiFetch('/api/account', { method: 'DELETE' });
      setActiveHouseholdId(null);
      await supabase.auth.signOut();
      window.location.reload();
    } catch (err) {
      setError(err.message || 'Could not delete account');
      setDeleting(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-orange-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-orange-50">
        <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide">Your data</p>
      </div>
      <button
        onClick={handleExport}
        disabled={exporting}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 transition text-left disabled:opacity-50"
      >
        <Download size={15} className="text-orange-600 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-orange-900">{exporting ? 'Preparing download…' : 'Download my data'}</p>
          <p className="text-xs text-orange-400">JSON of your households, meals, starred recipes and preferences.</p>
        </div>
      </button>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 transition text-left border-t border-orange-50 disabled:opacity-50"
      >
        <Trash2 size={15} className="text-red-500 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-red-600">{deleting ? 'Deleting…' : 'Delete my account'}</p>
          <p className="text-xs text-orange-400">Removes you from every household and bans sign-in for 30 days.</p>
        </div>
      </button>
      {error && <p className="px-4 py-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
