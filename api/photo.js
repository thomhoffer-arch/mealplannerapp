import { applyCors } from './_lib/cors.js';
import { requireAuth } from './_lib/auth.js';
import { searchPhoto } from './_lib/pexels.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const name = (req.query.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });

  const photo = await searchPhoto(name);
  res.json({ photo: photo || null });
}
