import { requireAuth } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const ctx = await requireAuth(req, res, { allowAmbiguous: true });
  if (!ctx) return;

  const { name = '' } = req.body || {};
  const trimmed = name.trim();
  if (!trimmed) return res.status(400).json({ error: 'A household name is required.' });

  const { supabase, user } = ctx;

  const { data: hh, error: hhErr } = await supabase
    .from('households')
    .insert({ name: trimmed, created_by: user.id })
    .select()
    .single();
  if (hhErr) return res.status(500).json({ error: hhErr.message });

  const { error: memErr } = await supabase
    .from('household_members')
    .insert({ household_id: hh.id, user_id: user.id });
  if (memErr) return res.status(500).json({ error: memErr.message });

  return res.json({ household: hh });
}
