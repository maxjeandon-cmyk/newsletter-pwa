#!/usr/bin/env node
/* tools/maintenance.js — Agent de maintenance (v32).
 * Toutes les 6 h (3 h, 9 h, 15 h, 21 h heure de Paris) :
 *   1. Récupère les messages de feedback de ces dernières 48 h dans Supabase
 *      (clé service_role) et construit un résumé STRICTEMENT factuel :
 *      thèmes par mots fréquents (hors mots vides), comptages exacts et
 *      citations verbatim tronquées — rien n'est inventé ni reformulé.
 *   2. Exécute la maintenance du site : validation des éditions récentes
 *      (validate-latest.js) et contrôle du site public (check-site.js).
 *   3. Publie data/feedback.json + un rapport data/maintenance.json sur
 *      main via l'API GitHub (data/ est network-first : effet immédiat).
 * Aucune dépendance : fetch natif (Node >= 18).
 * Env : SUPABASE_URL, SUPABASE_SERVICE_ROLE, GH_TOKEN (Contents: RW).
 */
'use strict';

const { execFileSync } = require('child_process');

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const GH_TOKEN = process.env.GH_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY || 'maxjeandon-cmyk/newsletter-pwa';
const FICHIER = 'data/feedback.json';
const RAPPORT = 'data/maintenance.json';

/* ————— Maintenance : validations locales + contrôle du site public ————— */

function runTool(cmd, args) {
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8' });
    return { ok: true, sortie: out.trim().split('\n').slice(-8).join('\n') };
  } catch (e) {
    return { ok: false, sortie: (e.stdout || '').trim().split('\n').slice(-8).join('\n') + (e.stderr || '') };
  }
}

/* Sonde chaîne notifications (v67) : compte les lignes côté Supabase.
 * ok si au moins un abonnement ; silence normal si aucun toggle actif ;
 * échec si des toggles sont actifs sans abonnement — le maillon
 * navigateur→Supabase casse (permission iOS, session, INSERT refusé). */
async function sondeNotifications() {
  const base = (URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const H = { apikey: KEY, authorization: 'Bearer ' + KEY };
  try {
    const [rA, rP] = await Promise.all([
      fetch(base + '/rest/v1/abonnements_push?select=id', { headers: H }),
      fetch(base + '/rest/v1/preferences?select=user_id,prefs', { headers: H })
    ]);
    if (!rA.ok || !rP.ok) return { nom: 'sonde notifications', ok: false, detail: 'Supabase injoignable (' + rA.status + '/' + rP.status + ')' };
    const abonnements = await rA.json();
    const prefs = await rP.json();
    const togglesActifs = (prefs || []).filter(p => p.prefs && (p.prefs.edition || p.prefs.copernicus || p.prefs.feedback || Object.values(p.prefs.medias || {}).some(Boolean)));
    const n = abonnements.length;
    const detail = n + ' abonnement(s) push, ' + togglesActifs.length + ' utilisateur(s) avec toggles actifs';
    if (n > 0) return { nom: 'sonde notifications', ok: true, detail };
    if (!togglesActifs.length) return { nom: 'sonde notifications', ok: true, detail: detail + ' — aucun toggle actif, silence normal' };
    return { nom: 'sonde notifications', ok: false, detail: detail + ' — toggles actifs sans abonnement enregistré : enregistrement navigateur→Supabase en échec (voir Réglages → Notifications sur l\'appareil)' };
  } catch (e) {
    return { nom: 'sonde notifications', ok: false, detail: 'sonde impossible : ' + String(e.message || e).slice(0, 120) };
  }
}

async function maintenance(editions, feedbackOk) {
  const verifs = [];
  const editionsOk = runTool(process.execPath, ['tools/validate-latest.js']);
  verifs.push({ nom: 'validate-latest.js', ok: editionsOk.ok, detail: editionsOk.sortie });
  const siteOk = runTool(process.execPath, ['tools/check-site.js']);
  verifs.push({ nom: 'check-site.js', ok: siteOk.ok, detail: siteOk.sortie });
  /* Sonde chaîne push (v67) : compte les abonnements et préférences de notification
   * via la clé service_role — un abonnement bloqué en amont (permission iOS, session,
   * INSERT refusé) se voit ici : 0 abonnement alors que des toggles sont actifs. */
  const sondePush = await sondeNotifications();
  verifs.push(sondePush);

  const problemes = verifs.filter(v => !v.ok).map(v => v.nom);
  if (!feedbackOk) problemes.push('récupération feedback');
  return {
    editions,
    verifs,
    problemes,
    intervention: problemes.length === 0
      ? 'Aucune intervention nécessaire : éditions et site publics conformes.'
      /* Aucune correction automatique risquée : l\'agent signale, l\'équipe corrige. */
      : 'Anomalies détectées — aucune correction automatique appliquée (éditions/ figé) : correction manuelle requise.'
  };
}

/* ————— Publication GitHub (contenu versionné) ————— */

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
  if (!put.ok) throw new Error('GitHub ' + put.status + ' : ' + (await put.text()).slice(0, 200));
}

async function main() {
  if (!URL || !KEY || !GH_TOKEN) {
    console.error('Il manque SUPABASE_URL, SUPABASE_SERVICE_ROLE ou GH_TOKEN.');
    process.exit(1);
  }

  /* 1. Récupération et résumé des messages (tools/feedback.js, 48 dernières heures) */
  let resume = { total: 0, points: [], condenses: [] };
  let feedbackOk = true;
  try {
    const sortie = execFileSync(process.execPath, ['tools/feedback.js'], {
      encoding: 'utf8', env: process.env
    });
    resume = JSON.parse(sortie);
  } catch (e) {
    console.error('Récupération feedback impossible : ' + (e.message || ''));
    feedbackOk = false;
  }
  const maintenant = new Date();
  const dateFr = maintenant.toLocaleDateString('fr-FR');
  const heureFr = maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const points = [];
  if (!feedbackOk) points.push('Récupération des messages momentanément impossible — résumé non actualisé.');
  if (resume.total) points.push('Points les plus demandés : ' + resume.points.join(', '));
  for (const c of resume.condenses) points.push('Message condensé : « ' + c + ' »');
  if (feedbackOk && !resume.total) points.push('Aucun message reçu sur les dernières 48 h.');

  const contenuFeedback = JSON.stringify({
    date: dateFr,
    total: resume.total,
    points
  }, null, 2) + '\n';

  /* 2. Maintenance : validation des éditions + contrôle du site */
  const etat = await maintenance(maintenant.toISOString(), feedbackOk);

  /* 3. Publication */
  let erreursFeedback = false;
  try {
    await publierFichier(FICHIER, contenuFeedback,
      'Résumé feedback du ' + dateFr + ' (' + resume.total + ' message(s))');
    console.log('Résumé publié — ' + resume.total + ' message(s), ' + resume.points.length + ' point(s) demandé(s).');
  } catch (e) {
    console.error('Publication feedback échouée : ' + e.message);
    erreursFeedback = true;
    etat.problemes.push('publication feedback');
  }

  const contenuRapport = JSON.stringify({
    date: dateFr,
    heure: heureFr,
    feedback: { messages: resume.total, recupere: feedbackOk, publie: !erreursFeedback },
    verifs: etat.verifs,
    problemes: etat.problemes,
    intervention: etat.intervention
  }, null, 2) + '\n';

  try {
    await publierFichier(RAPPORT, contenuRapport,
      'Rapport de maintenance du ' + dateFr + ' ' + heureFr + ' (' + etat.problemes.length + ' problème(s))');
    console.log('Rapport de maintenance publié — ' + etat.problemes.length + ' problème(s).');
    /* Notifications quasi instantanées : on déclenche le workflow push juste
     * après la publication — l'anti-spam de notifier.js (notif_envoyees) rend
     * l'appel sans risque, il n'enverra que ce qui est nouveau. */
    try {
      const r = await fetch('https://api.github.com/repos/' + REPO + '/actions/workflows/notifier.yml/dispatches', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + GH_TOKEN, accept: 'application/vnd.github+json' },
        body: JSON.stringify({ ref: 'main' })
      });
      console.log(r.ok ? 'Workflow notifications déclenché.' : 'Déclenchement notifications ignoré (HTTP ' + r.status + ').');
    } catch (e) { console.error('Déclenchement notifications impossible : ' + e.message); }
  } catch (e) {
    console.error('Publication du rapport échouée : ' + e.message);
    process.exit(1);
  }

  if (etat.problemes.length) {
    console.error('Anomalies : ' + etat.problemes.join(', '));
    process.exit(1);
  }
  console.log('Maintenance complète : site et éditions conformes. ♻️');
}

main().catch(e => { console.error(e.message); process.exit(1); });
