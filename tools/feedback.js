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
 * Usage : node tools/feedback.js   (sortie : JSON {total, themes, citations})
 */
'use strict';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;

async function apiSupabase(chemin) {
  const r = await fetch(URL + chemin, {
    headers: { apikey: KEY, authorization: 'Bearer ' + KEY }
  });
  if (!r.ok) throw new Error('Supabase ' + r.status);
  return r.json();
}

/* Mots vides : uniquement pour compter les thèmes récurrents. */
const MOTS_VIDES = new Set(('le la les un une des de du au aux et ou mais donc or ni car que qui quoi dont a à en dans sur pour par avec sans sous plus moins pas très trop est sont être avoir fait faire ce cet cette ces mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs je tu il elle on nous vous ils elles se ne y n\'est c\'est d\'un d\'une s\'il j\'ai c j n s l d qu m t aussi alors quand puis parce comme très bien quoi votre notre faut soit')
  .split(' '));

/* Résumé heuristique, strictement factuel : comptages et citations exactes. */
function resumer(messages) {
  const freq = new Map();
  for (const m of messages) {
    for (const mot of String(m.message || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(w => w.length > 3 && !MOTS_VIDES.has(w))) {
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }
  const themes = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([w, n]) => w + ' (' + n + ')');
  /* Citations verbatim (tronquées avec marque de troncature), les plus longues d'abord. */
  const citations = messages.slice().sort((a, b) => String(b.message || '').length - String(a.message || '').length).slice(0, 3)
    .map(m => {
      const t = String(m.message || '').trim().replace(/\s+/g, ' ');
      return t.length > 200 ? t.slice(0, 200).trimEnd() + '…' : t;
    }).filter(Boolean);
  return { themes, citations };
}

async function main() {
  if (!URL || !KEY) {
    console.error('Il manque SUPABASE_URL ou SUPABASE_SERVICE_ROLE.');
    process.exit(1);
  }
  const depuis = new Date(Date.now() - 48 * 3600e3).toISOString();
  const messages = (await apiSupabase('/rest/v1/feedback?select=id,message,created_at&created_at=gte.' + depuis + '&order=created_at.asc&limit=500')) || [];
  const resume = resumer(messages);
  process.stdout.write(JSON.stringify({ total: messages.length, ...resume }) + '\n');
}

main().catch(e => { console.error(e.message); process.exit(1); });
