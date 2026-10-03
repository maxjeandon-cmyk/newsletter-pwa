#!/usr/bin/env node
/* notif-diag.js — diagnostic des notifications push (ajouté le 03/10/2026).
 * Compte les abonnements dans la table abonnements_push (service role, hors
 * RLS) et publie le résultat dans data/notif-diag.json via l'API GitHub.
 * Aucune dépendance : fetch natif (Node >= 18).
 * Env : SUPABASE_URL, SUPABASE_SERVICE_ROLE, GH_TOKEN (Contents: RW).
 */
'use strict';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const GH_TOKEN = process.env.GH_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY || 'maxjeandon-cmyk/newsletter-pwa';

async function supabase(chemin) {
  const r = await fetch(URL + chemin, {
    headers: { apikey: KEY, authorization: 'Bearer ' + KEY }
  });
  if (!r.ok) throw new Error('Supabase ' + r.status + ' : ' + (await r.text()).slice(0, 300));
  return r.json();
}

async function publierFichier(chemin, contenu, message) {
  const headers = { authorization: 'Bearer ' + GH_TOKEN, accept: 'application/vnd.github+json' };
  let sha = null;
  const actuel = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + chemin, { headers });
  if (actuel.ok) sha = (await actuel.json()).sha;
  const put = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + chemin, {
    method: 'PUT',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ message, content: Buffer.from(contenu).toString('base64'), sha: sha || undefined })
  });
  if (!put.ok) throw new Error('GitHub ' + put.status + ' : ' + (await put.text()).slice(0, 300));
}

async function main() {
  /* Compter les abonnements push (service role = bypass RLS) */
  const abos = await supabase('/rest/v1/abonnements_push?select=*');
  if (!Array.isArray(abos)) throw new Error('Réponse inattendue de Supabase : ' + JSON.stringify(abos).slice(0, 200));

  const users = new Set(abos.map(a => a.user_id).filter(Boolean));
  const dates = abos.map(a => a.created_at).filter(Boolean).sort();
  const memo = await supabase('/rest/v1/preferences?cle=eq.notif_envoyees&select=valeur')
    .then(rows => (Array.isArray(rows) && rows[0] && rows[0].valeur) ? rows[0].valeur : null)
    .catch(() => null);

  const diag = {
    date: new Date().toISOString(),
    abonnements: abos.length,
    utilisateurs: users.size,
    plus_recent_abonnement: dates.length ? dates[dates.length - 1] : null,
    memo_tests: memo
  };
  console.log('DIAG ' + JSON.stringify(diag));

  await publierFichier('data/notif-diag.json',
    JSON.stringify(diag, null, 2) + '\n',
    'Diagnostic notifs : ' + abos.length + ' abonnement(s)');
  console.log('Diagnostic publie dans data/notif-diag.json');
}

main().catch(e => { console.error('ECHEC ' + e.message); process.exit(1); });
