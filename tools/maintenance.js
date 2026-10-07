#!/usr/bin/env node
/* tools/maintenance.js — Agent de maintenance (v38).
 * Toutes les 6 h (3 h, 9 h, 15 h, 21 h heure de Paris) :
 * v37 : pipeline feedback supprime (onglet Feedback retire de l'app le
 * 07/10/2026) ; la table Supabase feedback reste en place, inerte.
 * v38 : chronique etudiants — un chapitre par jour de suivi (nouvel acte
 * a chaque changement de jour, index.chapitreJour), plus aucune scission
 * par taille (le seuil 28 Ko devient un simple avertissement).
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
/* Délai de sécurité : un fetch qui ne répond jamais ne doit pas suspendre
 * le run de maintenance pendant des heures (cas Supabase muet observe le
 * 05/10/2026 — le notifier a eu le meme piege, corrige pareil). */
const AVEC_DELAI = (promesse, ms = 30000) => Promise.race([
  promesse,
  new Promise((_, rej) => {
    const t = setTimeout(() => rej(new Error('delai depasse (' + ms + ' ms)')), ms);
    if (t.unref) t.unref();
  })
]);

async function sondeNotifications() {
  const base = (URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const H = { apikey: KEY, authorization: 'Bearer ' + KEY };
  try {
    const [rA, rP] = await Promise.all([
      AVEC_DELAI(fetch(base + '/rest/v1/abonnements_push?select=id', { headers: H })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })),
      AVEC_DELAI(fetch(base + '/rest/v1/preferences?select=user_id,prefs', { headers: H })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }))
    ]);
    const abonnements = rA;
    const prefs = rP;
    /* v88 : les toggles de notification vivent sous prefs.notifications (la
     * clé locale nl.notifications est remontée telle quelle par envoyerPrefs)
     * — avant ce correctif, la sonde cherchait prefs.edition au niveau du haut
     * et annonçait toujours « 0 toggle actif » alors que tout était en ordre. */
    const togglesActifs = (prefs || []).filter(p => {
      const pr = (p && p.prefs) || {};
      const n = (typeof pr.notifications === 'object' && pr.notifications) || {};
      return !!(pr.edition || pr.copernicus || pr.lyceens || Object.values(pr.medias || {}).some(Boolean)
        || n.edition || n.copernicus || n.lyceens || Object.values(n.medias || {}).some(Boolean));
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

async function maintenance(editions) {
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

    const maintenant = new Date();
  const dateFr = maintenant.toLocaleDateString('fr-FR');
  const heureFr = maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    /* 2. Maintenance : validation des éditions + contrôle du site */
  const etat = await maintenance(maintenant.toISOString());

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

  /* 2 quater. Chronique « Version des étudiants » : tools/etudiants.js
   * moissonne les flux RSS des dernières ~6 h et ajoute UN paragraphe
   * « relevé automatique » au chapitre du jour de data/etudiants/ — un
   * nouveau chapitre (nouvel acte) est créé à chaque changement de jour,
   * jamais par taille. Idempotent : si les mêmes items sont déjà dans le
   * dernier relevé, rien n'est écrit. */
  let etu = { modifie: false, ajoutes: 0, items: 0, fichier: null };
  try {
    etu = JSON.parse(execFileSync(process.execPath, ['tools/etudiants.js'], { encoding: 'utf8', env: process.env, timeout: 240000 }));
    console.log('Étudiants : ' + etu.items + ' info(s) des dernières heures, ' + etu.ajoutes +
      ' paragraphe(s) ajouté(s) au chapitre ' + etu.chapitre +
      (etu.nouveauChapitre ? ' (nouveau chapitre du jour)' : '') + '.');
  } catch (e) {
    console.error('Chronique étudiants impossible : ' + (e.stdout || e.message));
    etu.erreur = String(e.stdout || e.message || e).slice(0, 150);
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

  /* 3 quater. Publication de la chronique « Version des étudiants »
   * (chapitre modifié puis index, data/ network-first, pas de bump CACHE). */
  if (etu.modifie && !etu.erreur && etu.fichier) {
    try {
      await publierFichier(etu.fichier, fs.readFileSync(etu.fichier, 'utf8'),
        'Chronique etudiants du ' + dateFr + ' (' + etu.items + ' info(s) des dernieres heures)');
      await publierFichier('data/etudiants/index.json', fs.readFileSync('data/etudiants/index.json', 'utf8'),
        'Index chronique etudiants du ' + dateFr);
      console.log('Chronique étudiants publiée (' + etu.items + ' info(s)).');
      /* Les items corroborés du relevé alimentent aussi les « faits
       * vérifiés » de data/lyceens.json : on publie le fichier mis à jour
       * par etudiants.js si le relevé lyceens lui-même n'a rien changé
       * (sinon le bloc 3 ter l'a déjà publié à l'identique ou mieux). */
      if (etu.faits && !lyc.modifie) {
        await publierFichier(LYCEENS, fs.readFileSync(LYCEENS, 'utf8'),
          'Releve lyceens du ' + dateFr + ' (' + etu.faits + ' fait(s) verifie(s) via chronique etudiants)');
        console.log('Faits vérifiés enrichis (' + etu.faits + ' fait(s)).');
      }
    } catch (e) {
      console.error('Publication de la chronique étudiants échouée : ' + e.message);
      etu.erreur = 'publication : ' + String(e.message).slice(0, 120);
    }
  }
  etat.verifs.push({
    nom: 'etudiants.js',
    ok: !etu.erreur,
    detail: etu.erreur
      ? etu.erreur
      : etu.items + ' info(s) des dernières heures, ' + etu.ajoutes + ' paragraphe(s) ajouté(s)'
  });
  if (etu.erreur) etat.problemes.push('chronique étudiants');

  const contenuRapport = JSON.stringify({
    date: dateFr,
    heure: heureFr,
    relevesOng: { rafraichis: ong.rafraichis, echecs: ong.echecs, publie: ong.modifie && !ong.erreur },
    lyceens: { nouvelles: lyc.nouvelles, fusionnees: lyc.fusionnees, moissonnes: lyc.moissonnes, total: lyc.total, publie: lyc.modifie && !lyc.erreur },
    etudiants: { items: etu.items, ajoutes: etu.ajoutes, chapitre: etu.chapitre || null, nouveauChapitre: !!etu.nouveauChapitre, publie: etu.modifie && !etu.erreur },
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
