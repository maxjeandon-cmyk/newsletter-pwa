#!/usr/bin/env node
/* tools/maintenance.js — Agent de maintenance (v35).
 * Toutes les 6 h (3 h, 9 h, 15 h, 21 h heure de Paris) :
 *   1. Fusionne les NOUVEAUX messages de feedback de Supabase (clé
 *      service_role) dans le résumé global persistant via tools/feedback.js :
 *      seuls les messages postérieurs au watermark sont traités (thèmes,
 *      intentions, demandes) — rien n'est inventé ni reformulé, chaque
 *      demande tronquée est verbatim. Les demandes réalisées par un commit
 *      récent basculent d'elles-mêmes en « mises en place ».
 *   2. Exécute la maintenance du site : validation des éditions récentes
 *      (validate-latest.js) et contrôle du site public (check-site.js).
 *   3. Publie data/feedback.json + un rapport data/maintenance.json sur
 *      main via l'API GitHub (data/ est network-first : effet immédiat).
 *   4. Relevés ONG (ong-releve.js) : une fois par jour, relève les titres
 *      des dernières actualités des 10 ONG de l'onglet Newsletters et
 *      publie data/newsletters.json si un relevé a été rafraîchi (les sites
 *      muets ou injoignables conservent leur relevé précédent).
 *   5. Relevé « Lycéens 2026 » (lyceens.js) : moissonne les flux RSS de la
 *      presse, classe chaque info (version lycéens / version gouvernement /
 *      faits corroborés) et publie data/lyceens.json si le contenu a
 *      vraiment changé (pas de commit fantôme toutes les 6 h).
 * Aucune dépendance : fetch natif (Node >= 18).
 * Env : SUPABASE_URL, SUPABASE_SERVICE_ROLE, GH_TOKEN (Contents: RW).
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const GH_TOKEN = process.env.GH_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY || 'maxjeandon-cmyk/newsletter-pwa';
const FICHIER = 'data/feedback.json';
const RAPPORT = 'data/maintenance.json';
const RELEVES = 'data/newsletters.json';
const LYCEENS = 'data/lyceens.json';

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
    /* v88 : les toggles de notification vivent sous prefs.notifications (la
     * clé locale nl.notifications est remontée telle quelle par envoyerPrefs)
     * — avant ce correctif, la sonde cherchait prefs.edition au niveau du haut
     * et annonçait toujours « 0 toggle actif » alors que tout était en ordre. */
    const togglesActifs = (prefs || []).filter(p => {
      const pr = (p && p.prefs) || {};
      const n = (typeof pr.notifications === 'object' && pr.notifications) || {};
      return !!(pr.edition || pr.copernicus || pr.feedback || Object.values(pr.medias || {}).some(Boolean)
        || n.edition || n.copernicus || n.feedback || Object.values(n.medias || {}).some(Boolean));
    });
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

  /* 1. Résumé dynamique des messages (tools/feedback.js) : le script lit le
   * résumé global persistant, fusionne les NOUVEAUX messages (thèmes,
   * intentions, demandes) et écrit data/feedback.json lui-même ; les
   * demandes réalisées par un commit passent d'elles-mêmes en « mises en
   * place » et quittent le résumé. */
  let resume = { total: 0, nouveaux: 0, themes: 0, en_attente: 0, mises_en_place: 0, deplacees: [] };
  let feedbackOk = true;
  try {
    const sortie = execFileSync(process.execPath, ['tools/feedback.js'], {
      encoding: 'utf8', env: process.env, timeout: 120000
    });
    resume = JSON.parse(sortie);
  } catch (e) {
    console.error('Récupération feedback impossible : ' + (e.message || ''));
    feedbackOk = false;
  }
  const maintenant = new Date();
  const dateFr = maintenant.toLocaleDateString('fr-FR');
  const heureFr = maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (feedbackOk) {
    console.log('Feedback : ' + resume.nouveaux + ' nouveau(x) message(s) fusionné(s) — ' +
      resume.total + ' au total, ' + resume.themes + ' thème(s), ' +
      resume.en_attente + ' demande(s) en attente, ' + resume.mises_en_place + ' mise(s) en place.');
    for (const d of (resume.deplacees || [])) {
      console.log('Demande réalisée et déplacée : « ' + d.demande + ' » via ' + d.via);
    }
  }

  /* 2. Maintenance : validation des éditions + contrôle du site */
  const etat = await maintenance(maintenant.toISOString(), feedbackOk);

  /* 2 bis. Relevés ONG : rafraîchis une fois par jour par ong-releve.js
   * (les orgs déjà relevées aujourd'hui sont sautées, les échecs
   * conservent le relevé précédent — un site bloqué n'efface rien). */
  let ong = { modifie: false, rafraichis: 0, echecs: 10, details: {} };
  try {
    ong = JSON.parse(execFileSync(process.execPath, ['tools/ong-releve.js'], { encoding: 'utf8', env: process.env, timeout: 300000 }));
    console.log('Relevés ONG : ' + ong.rafraichis + ' rafraîchi(s), ' + ong.echecs + ' échec(s).');
  } catch (e) {
    console.error('Relevés ONG impossibles : ' + (e.stdout || e.message));
    ong.erreur = String(e.stdout || e.message || e).slice(0, 150);
  }

  /* 2 ter. Relevé « Lycéens 2026 » : tools/lyceens.js moissonne les flux
   * RSS de la presse (fenêtre 8 j), classe les infos en trois versions
   * (lycéens / gouvernement / faits corroborés) et réécrit lui-même
   * data/lyceens.json si le contenu a changé (hors horodatage : pas de
   * commit fantôme). La curation épinglée est préservée. */
  let lyc = { modifie: false, nouvelles: 0, fusionnees: 0, moissonnes: 0, total: 0, echecs: 0 };
  try {
    lyc = JSON.parse(execFileSync(process.execPath, ['tools/lyceens.js'], { encoding: 'utf8', env: process.env, timeout: 240000 }));
    console.log('Lycéens : ' + lyc.nouvelles + ' nouvelle(s) info, ' + lyc.fusionnees +
      ' fusionnée(s) sur ' + lyc.moissonnes + ' moissonnée(s) — ' + lyc.total + ' au total.');
  } catch (e) {
    console.error('Relevé lycéens impossible : ' + (e.stdout || e.message));
    lyc.erreur = String(e.stdout || e.message || e).slice(0, 150);
  }

  /* 3. Publication du résumé : tools/feedback.js a lui-même réécrit
   * data/feedback.json (fusion des nouveaux messages dans le résumé
   * global persistant) — on publie le fichier tel quel (data/ est
   * network-first : aucun bump CACHE requis). */
  let erreursFeedback = false;
  if (feedbackOk) {
    try {
      await publierFichier(FICHIER, fs.readFileSync(FICHIER, 'utf8'),
        'Resume feedback du ' + dateFr + ' (' + resume.nouveaux + ' nouveau(x), ' + resume.total + ' au total)');
      console.log('Résumé publié — ' + resume.nouveaux + ' nouveau(x), ' + resume.total +
        ' au total, ' + resume.en_attente + ' demande(s) en attente, ' + resume.mises_en_place + ' mise(s) en place.');
    } catch (e) {
      console.error('Publication feedback échouée : ' + e.message);
      erreursFeedback = true;
      etat.problemes.push('publication feedback');
    }
  }

  /* 3 bis. Publication des relevés ONG (data/ network-first, pas de bump CACHE). */
  if (ong.modifie) {
    try {
      await publierFichier(RELEVES, fs.readFileSync(RELEVES, 'utf8'),
        'Releves ONG du ' + dateFr + ' (' + ong.rafraichis + ' organisation(s) rafraichie(s))');
      console.log('Relevés ONG publiés (' + ong.rafraichis + ' organisation(s)).');
    } catch (e) {
      console.error('Publication des relevés ONG échouée : ' + e.message);
      ong.erreur = 'publication : ' + String(e.message).slice(0, 120);
    }
  }
  if (ong.rafraichis || ong.echecs || ong.erreur) {
    etat.verifs.push({
      nom: 'ong-releve.js',
      ok: !ong.erreur && (!ong.echecs || ong.rafraichis > 0 || Object.keys(ong.details).length === 0),
      detail: ong.erreur
        ? ong.erreur
        : ong.rafraichis + ' rafraîchi(s), ' + ong.echecs + ' échec(s) — relevé précédent conservé pour les sites muets'
    });
    if (ong.erreur) etat.problemes.push('relevés ONG');
  }

  /* 3 ter. Publication du relevé « Lycéens 2026 » (data/ network-first, pas de bump CACHE). */
  if (lyc.modifie && !lyc.erreur) {
    try {
      await publierFichier(LYCEENS, fs.readFileSync(LYCEENS, 'utf8'),
        'Releve lyceens du ' + dateFr + ' (' + lyc.nouvelles + ' nouvelle(s) info)');
      console.log('Relevé lycéens publié (' + lyc.nouvelles + ' nouvelle(s) info).');
    } catch (e) {
      console.error('Publication du relevé lycéens échouée : ' + e.message);
      lyc.erreur = 'publication : ' + String(e.message).slice(0, 120);
    }
  }
  etat.verifs.push({
    nom: 'lyceens.js',
    ok: !lyc.erreur,
    detail: lyc.erreur
      ? lyc.erreur
      : lyc.nouvelles + ' nouvelle(s) info, ' + lyc.fusionnees + ' fusionnée(s) sur ' +
        lyc.moissonnes + ' moissonnée(s) — ' + lyc.total + ' au total'
  });
  if (lyc.erreur) etat.problemes.push('relevé lycéens');

  const contenuRapport = JSON.stringify({
    date: dateFr,
    heure: heureFr,
    feedback: { messages: resume.total, nouveaux: resume.nouveaux, recupere: feedbackOk, publie: !erreursFeedback },
    relevesOng: { rafraichis: ong.rafraichis, echecs: ong.echecs, publie: ong.modifie && !ong.erreur },
    lyceens: { nouvelles: lyc.nouvelles, fusionnees: lyc.fusionnees, moissonnes: lyc.moissonnes, total: lyc.total, publie: lyc.modifie && !lyc.erreur },
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
