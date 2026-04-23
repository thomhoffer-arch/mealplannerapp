import { requireAuth } from '../_lib/auth.js';

const HOUSEHOLD_NAMES = [
  'The Saffron Kitchen', 'Casa Umami', 'The Mise en Place', 'Herb Garden HQ',
  'The Slow Cookers', 'Roux House', 'The Dutch Oven', 'Paprika Palace',
  'The Wooden Spoon', 'Casa Piccola', 'The Sunday Roast', 'Miso Happy',
  'The Rolling Pin', 'Carte Blanche Kitchen', 'The Simmer Sisters',
  'Casa Focaccia', 'The Morning Brioche', 'Tagine & Thyme',
  'The Wok Chronicles', 'Gremolata Gang', 'The Sourdough Crew',
  'Casa Truffle', 'The Pantry Shelf', 'Fork & Ferment',
  'The Braising Room', 'Sauté & Chill', 'The Comfort Bowl',
  'Casa Pimento', 'The Golden Roux', 'Kimchi & Co',
  'The Caramel Corner', 'Bouquet Garni', 'The Mandoline Club',
  'Casa Cardamom', 'The Julienne Table', 'Harissa Heights',
  'The Pot au Feu', 'Smoky Larder', 'The Dashi Den',
  'Casa Oregano', 'The Mortar & Pestle', 'Nori & Friends',
  'The Blanquette House', 'Maison Ratatouille', 'The Bao Bunch',
  'Casa Chimichurri', 'The Galette Club', 'Labneh Lounge',
  'The Preserve Pantry', 'Casa Mole', 'The Zester',
  'Sumac & Saffron', 'The Confit Corner', 'Casa Shawarma',
  'The Tandoor House', 'Pho Real Kitchen', 'The Fondue Club',
  'Casa Polenta', 'The Beurre Blanc', 'Szechuan Suite',
];

export function randomHouseholdName() {
  return HOUSEHOLD_NAMES[Math.floor(Math.random() * HOUSEHOLD_NAMES.length)];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const ctx = await requireAuth(req, res, { allowAmbiguous: true });
  if (!ctx) return;

  const { name = '' } = req.body || {};
  const trimmed = name.trim() || randomHouseholdName();

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
