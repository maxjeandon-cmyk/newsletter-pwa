#!/usr/bin/env node
/* notif-diag.js — diagnostic des notifications push, v3 (03/10/2026).
 * PGRST125 recu en v2 : le chemin Supabase est invalide. Cette version
 * declare la FORME de l URL du secret (jamais la cle) et sonde plusieurs
 * candidates pour trouver celle qui repond, puis compte les abonnements.
 * Env : SUPABASE_URL, SUPABASE_SERVICE_ROLE, GH_TOKEN, GITHUB_TOKEN (repli).
 */
'use strict';

const SBASE = (process.env.SUPABASE_URL || '').trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const REPO = process.env.GITHUB_REPOSITORY || 'maxjeandon-cmyk/newsletter-pwa';

const diag = { date: new Date().toISOString(), etapes: {} };

function enregistrer(nom, promesse) {
  return promesse
    .then(v => { diag.etapes[nom] = { ok: true, ...v }; })
    .catch(e => { diag.etapes[nom] = { ok: false, erreur: String(e.message || e).slice(0, 400) }; });
}

async function get(url, opts) {
  const r = await fetch(url, {
    headers: { apikey: KEY, authorization: 'Bearer ' + KEY, ...(opts && opts.headers) },
    redirect: 'follow'
  });
  const texte = await r.text();
  return { status: r.status, ok: r.ok, corps: texte.slice(0, 300) };
}

/* Recuperation COMPLETE du corps (pour compter sans troncature) */
async function getComplet(url) {
  const r = await fetch(url, {
    headers: { apikey: KEY, authorization: 'Bearer ' + KEY, Prefer: 'count=exact' },
    redirect: 'follow'
  });
  const texte = await r.text();
  return { status: r.status, ok: r.ok, corps: texte, total: (r.headers.get('content-range') || '').match(/\/(\d+)$/)?.[1] || null };
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
}

async function main() {
  /* 1. FORME de l URL du secret (jamais la cle, jamais l URL complete avec cle) */
  diag.etapes.forme_url = (() => {
    try {
      const u = new URL(SBASE);
      return {
        ok: true,
        scheme: u.protocol,
        host: u.host,
        pathname: u.pathname,
        finit_par_slash: /\/$/.test(SBASE),
        se_termine_par_rest_v1: /\/rest\/v1\/?$/i.test(SBASE)
      };
    } catch (e) {
      return { ok: false, erreur: 'URL non constructible : ' + String(e.message || e).slice(0, 200), longueur: SBASE.length };
    }
  })();

  /* 2. Sondes : quelle base repond ? */
  const base = SBASE.replace(/\/+$/, '');
  const sondes = {};
  const essais = {
    brut_plus_rest: base + '/rest/v1/abonnements_push?select=user_id&limit=3',
    sans_rest_eventuel: base.replace(/\/rest\/v1$/i, '') + '/rest/v1/abonnements_push?select=user_id&limit=3',
    racine_rest: base + '/rest/v1/'
  };
  for (const [nom, url] of Object.entries(essais)) {
    try { sondes[nom] = await get(url); }
    catch (e) { sondes[nom] = { ok: false, erreur: String(e.message || e).slice(0, 200) }; }
  }
  diag.etapes.sondes = sondes;

  /* 3. Compter les abonnements via les deux candidates (corps complet) */
  await enregistrer('abonnements', (async () => {
    const r = await getComplet(essais.brut_plus_rest.replace('limit=3', 'limit=1000'));
    if (!r.ok) throw new Error('sonde brut en echec : ' + r.status);
    const abos = JSON.parse(r.corps);
    const users = new Set(abos.map(a => a.user_id).filter(Boolean));
    const dates = abos.map(a => a.created_at).filter(Boolean).sort();
    return {
      total_officiel: r.total,
      total_corps: abos.length,
      utilisateurs: users.size,
      plus_recent: dates.length ? dates[dates.length - 1] : null,
      /* details prives retires (v4) : comptages seulement */
    };
  })());

  /* repli : si brut echoue, essayer la variante sans /rest/v1 double */
  if (!diag.etapes.abonnements.ok) {
    await enregistrer('abonnements_variante', (async () => {
      const r = await getComplet(essais.sans_rest_eventuel.replace('limit=3', 'limit=1000'));
      if (!r.ok) throw new Error('variante en echec : ' + r.status + ' ' + r.corps.slice(0, 120));
      const abos = JSON.parse(r.corps);
      const users = new Set(abos.map(a => a.user_id).filter(Boolean));
      const dates = abos.map(a => a.created_at).filter(Boolean).sort();
      return {
        total_officiel: r.total,
        total_corps: abos.length,
        utilisateurs: users.size,
        plus_recent: dates.length ? dates[dates.length - 1] : null,
        /* details prives retires (v4) : comptages seulement */
      };
    })());
  }

  /* 4. Publier (PAT puis GITHUB_TOKEN) */
  const contenu = JSON.stringify(diag, null, 2) + '\n';
  const message = 'Diagnostic notifs v3 : forme de l URL Supabase + sondes + comptage';
  let publie = false;
  if (process.env.GH_TOKEN) {
    await enregistrer('publication_pat', (async () => { await publierFichier(process.env.GH_TOKEN, 'data/notif-diag.json', contenu, message); publie = true; return {}; })());
  }
  if (!publie && process.env.GITHUB_TOKEN) {
    await enregistrer('publication_github_token', (async () => { await publierFichier(process.env.GITHUB_TOKEN, 'data/notif-diag.json', contenu, message); publie = true; return {}; })());
  }
  console.log('DIAG ' + JSON.stringify(diag).slice(0, 600));
}

main().catch(e => { console.error('ECHEC GENERAL ' + String(e.message || e)); process.exit(1); });
