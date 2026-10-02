#!/usr/bin/env node
/* tools/feedback.js — Résumé quotidien des messages de feedback (v31).
 * Lit les messages de ces dernières 48 h dans Supabase (clé service_role),
 * en fait un résumé orienté action, et publie data/feedback.json sur la branche
 * main via l'API GitHub (contenu versionné, lu par l'onglet Feedback).
 * Aucune dépendance : fetch natif (Node >= 18).
 * Env : SUPABASE_URL, SUPABASE_SERVICE_ROLE, GH_TOKEN (fine-grained, Contents: RW). */
'use strict';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const GH_TOKEN = process.env.GH_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY || 'maxjeandon-cmyk/newsletter-pwa';
const FICHIER = 'data/feedback.json';

async function apiSupabase(chemin) {
  const r = await fetch(URL + chemin, {
    headers: { apikey: KEY, authorization: 'Bearer ' + KEY }
  });
  if (!r.ok) throw new Error('Supabase ' + r.status);
  return r.json();
}

/* Résumé heuristique : compte, mots fréquents (hors mots vides), extraits des
 * messages les plus longs (souvent les plus détaillés). Sans IA externe. */
const MOTS_VIDES = new Set(('le la les un une des de du au aux et ou mais donc or ni car que qui quoi dont a à en dans sur pour par avec sans sous plus moins pas très trop est sont être avoir fait faire ce cet cette ces mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs je tu il elle on nous vous ils elles se ne y n\'est c\'est d\'un d\'une s\'il j\'ai c j n s l d qu m t').split(' '));

function resumer(messages) {
  const freq = new Map();
  for (const m of messages) {
    for (const mot of m.message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(w => w.length > 3 && !MOTS_VIDES.has(w))) {
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }
  const themes = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w, n]) => w + ' (' + n + ')');
  const detailles = messages.slice().sort((a, b) => b.message.length - a.message.length).slice(0, 3)
    .map(m => m.message.length > 200 ? m.message.slice(0, 200) + '…' : m.message);
  return { themes, detailles };
}

async function main() {
  if (!URL || !KEY || !GH_TOKEN) {
    console.error('Il manque SUPABASE_URL, SUPABASE_SERVICE_ROLE ou GH_TOKEN.');
    process.exit(1);
  }
  const depuis = new Date(Date.now() - 48 * 3600e3).toISOString();
  const messages = await apiSupabase('/rest/v1/feedback?select=id,message,created_at&created_at=gte.' + depuis + '&order=created_at.asc&limit=500');
  const resume = resumer(messages || []);
  const date = new Date().toLocaleDateString('fr-FR');
  const contenu = JSON.stringify({
    date,
    total: (messages || []).length,
    points: [
      ...((messages || []).length ? ['Thèmes récurrents : ' + resume.themes.join(', ')] : []),
      ...resume.detailles.map(d => 'Message détaillé : « ' + d + ' »')
    ]
  }, null, 2) + '\n';

  /* Publication GitHub : lire le SHA courant puis committer la mise à jour */
  const headers = { authorization: 'Bearer ' + GH_TOKEN, accept: 'application/vnd.github+json' };
  let sha = null;
  const actuel = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + FICHIER, { headers });
  if (actuel.ok) sha = (await actuel.json()).sha;

  const put = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + FICHIER, {
    method: 'PUT',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: 'Résumé feedback du ' + date + ' (' + (messages || []).length + ' message(s))',
      content: Buffer.from(contenu).toString('base64'),
      sha: sha || undefined
    })
  });
  if (!put.ok) throw new Error('GitHub ' + put.status + ' : ' + (await put.text()).slice(0, 200));
  console.log('Résumé publié — ' + (messages || []).length + ' message(s), ' + resume.themes.length + ' thème(s).');
}

main().catch(e => { console.error(e.message); process.exit(1); });
