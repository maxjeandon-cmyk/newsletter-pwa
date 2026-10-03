#!/usr/bin/env node
/* tools/feedback.js — Récupère et résume les messages de feedback (v32).
 * Étape 1 de l'agent de maintenance (tools/maintenance.js) : ce script ne
 * fait que collecter les messages et produire un résumé STRICTEMENT
 * factuel sur stdout (JSON) — comptages exacts, thèmes par mots fréquents
 * (hors mots vides), citations verbatim tronquées. Rien n'est inventé ni
 * reformulé. La publication GitHub et la maintenance du site vivent dans
 * tools/maintenance.js.
 * Aucune dépendance : fetch natif (Node >= 18).
 * Env : SUPABASE_URL, SUPABASE_SERVICE_ROLE.
 * Usage : node tools/feedback.js   (sortie : JSON {total, points, condenses})
 */
'use strict';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;

async function apiSupabase(url) {
  const r = await fetch(url, {
    headers: { apikey: KEY, authorization: 'Bearer ' + KEY }
  });
  /* Le corps d'erreur aide au diagnostic (jeton expiré, projet erroné…) sans jamais contenir la clé. */
  if (!r.ok) throw new Error('Supabase ' + r.status + ' : ' + (await r.text()).slice(0, 200));
  return r.json();
}

/* Mots vides : uniquement pour compter les thèmes récurrents. */
const MOTS_VIDES = new Set(('le la les un une des de du au aux et ou mais donc or ni car que qui quoi dont a à en dans sur pour par avec sans sous plus moins pas très trop est sont être avoir fait faire ce cet cette ces mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs je tu il elle on nous vous ils elles se ne y n\'est c\'est d\'un d\'une s\'il j\'ai c j n s l d qu m t aussi alors quand puis parce comme très bien quoi votre notre faut soit')
  .split(' '));

/* Résumé heuristique, strictement factuel : comptages et citations exactes. */
function resumer(messages) {
  /* Points les plus demandés : mots-clés fréquents regroupés par radical simple
   * (troncature 5 derniers caractères), triés par nombre de messages distincts. */
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ');
  const racine = w => w.length > 7 ? w.slice(0, 7) : w;
  const demandes = new Map();
  for (const m of messages) {
    const vus = new Set();
    for (const mot of norm(m.message).split(/\s+/).filter(w => w.length > 3 && !MOTS_VIDES.has(w))) {
      const r = racine(mot);
      if (vus.has(r)) continue;
      vus.add(r);
      demandes.set(r, (demandes.get(r) || 0) + 1);
    }
  }
  const points = [...demandes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([r, n]) => r + ' (' + n + ')');
  /* Condensé : chaque message réduit à une ligne courte (max 110 caractères),
   * sans citation intégrale. */
  const condenses = messages.slice(-10).map(m => {
    const t = m.message.replace(/\s+/g, ' ').trim();
    return t.length > 110 ? t.slice(0, 110) + '…' : t;
  });
  return { points, condenses };
}

async function main() {
  if (!URL || !KEY) {
    console.error('Il manque SUPABASE_URL ou SUPABASE_SERVICE_ROLE.');
    process.exit(1);
  }
  /* Normalisation : certains secrets contiennent déjà « /rest/v1 » (ou des slashes
   * finaux) — on les retire pour reconstruire un chemin propre et éviter PGRST125. */
  const base = URL.replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const depuis = new Date(Date.now() - 48 * 3600e3).toISOString();
  const messages = (await apiSupabase(base + '/rest/v1/feedback?select=id,message,created_at&created_at=gte.' + depuis + '&order=created_at.asc&limit=500')) || [];
  const resume = resumer(messages);
  process.stdout.write(JSON.stringify({ total: messages.length, ...resume }) + '\n');
}

main().catch(e => { console.error(e.message); process.exit(1); });
