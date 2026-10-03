#!/usr/bin/env node
/* notif-diag.js — diagnostic des notifications push, v2 (03/10/2026).
 * Interroge Supabase (service role) et publie le résultat DANS TOUS LES CAS
 * dans data/notif-diag.json via l'API GitHub — chaque étape enregistre son
 * propre succès ou son erreur, pour un diagnostic lisible même en échec partiel.
 * Aucune dépendance : fetch natif (Node >= 18).
 * Env : SUPABASE_URL, SUPABASE_SERVICE_ROLE, GH_TOKEN, GITHUB_TOKEN (repli).
 */
'use strict';

const SBASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const REPO = process.env.GITHUB_REPOSITORY || 'maxjeandon-cmyk/newsletter-pwa';

const diag = { date: new Date().toISOString(), etapes: {} };

function enregistrer(nom, promesse) {
  return promesse
    .then(v => { diag.etapes[nom] = { ok: true, ...v }; })
    .catch(e => { diag.etapes[nom] = { ok: false, erreur: String(e.message || e).slice(0, 400) }; });
}

async function supabaseGet(chemin) {
  const r = await fetch(SBASE + chemin, {
    headers: { apikey: KEY, authorization: 'Bearer ' + KEY }
  });
  if (!r.ok) throw new Error('Supabase ' + r.status + ' : ' + (await r.text()).slice(0, 300));
  return r.json();
}

async function publierFichier(token, chemin, contenu, message) {
  const headers = { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json' };
  let sha = null;
  const actuel = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + chemin, { headers });
  if (actuel.ok) sha = (await actuel.json()).sha;
  const put = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + chemin, {
    method: 'PUT',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ message, content: Buffer.from(contenu, 'utf8').toString('base64'), sha: sha || undefined })
  });
  if (!put.ok) throw new Error('GitHub ' + put.status + ' : ' + (await put.text()).slice(0, 300));
  return (await put.json());
}

async function main() {
  /* 1. Compter les abonnements push (service role = bypass RLS) */
  await enregistrer('abonnements', (async () => {
    const abos = await supabaseGet('/rest/v1/abonnements_push?select=*');
    if (!Array.isArray(abos)) throw new Error('Réponse inattendue : ' + JSON.stringify(abos).slice(0, 200));
    const users = new Set(abos.map(a => a.user_id).filter(Boolean));
    const dates = abos.map(a => a.created_at).filter(Boolean).sort();
    return {
      total: abos.length,
      utilisateurs: users.size,
      plus_recent: dates.length ? dates[dates.length - 1] : null,
      liste: abos.map(a => ({
        user_id: a.user_id || null,
        created_at: a.created_at || null,
        endpoint_debut: typeof a.endpoint === 'string' ? a.endpoint.slice(0, 55) : null
      }))
    };
  })());

  /* 2. Memo des tests envoyes (preuve que les runs test sont passes par la) */
  await enregistrer('memo_tests', (async () => {
    const rows = await supabaseGet('/rest/v1/preferences?cle=eq.notif_envoyees&select=*');
    return { valeur: Array.isArray(rows) && rows[0] ? (rows[0].valeur !== undefined ? rows[0].valeur : rows[0]) : null };
  })());

  /* 3. Publier le diagnostic (PAT puis GITHUB_TOKEN en repli) */
  const contenu = JSON.stringify(diag, null, 2) + '\n';
  const message = 'Diagnostic notifs v2 : ' + ((diag.etapes.abonnements && diag.etapes.abonnements.total) || '?') + ' abonnement(s)';
  let publie = false;
  if (process.env.GH_TOKEN) {
    await enregistrer('publication_pat', (async () => { await publierFichier(process.env.GH_TOKEN, 'data/notif-diag.json', contenu, message); publie = true; return {}; })());
  }
  if (!publie && process.env.GITHUB_TOKEN) {
    await enregistrer('publication_github_token', (async () => { await publierFichier(process.env.GITHUB_TOKEN, 'data/notif-diag.json', contenu, message); publie = true; return {}; })());
  }
  if (!publie) diag.etapes.publication = { ok: false, erreur: 'aucun token disponible' };
  console.log('DIAG ' + JSON.stringify(diag));
}

main().catch(e => { console.error('ECHEC GENERAL ' + String(e.message || e)); process.exit(1); });
