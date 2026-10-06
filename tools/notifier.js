#!/usr/bin/env node
/* notifier.js — envoi des notifications push (v88).
 * Tourne dans GitHub Actions (filet horaire + push sur editions/latest.json,
 * data/climat.json, data/notif-test.json) : lit les préférences de
 * notification (toggles édition / Copernicus / médias) et les abonnements
 * push dans Supabase, puis envoie UNIQUEMENT ce qui est nouveau depuis le
 * dernier envoi — un état simple dans la table preferences (cle notif_envoyees,
 * hors préférences utilisateur). Anti-overload :
 *   - dédup par nature d'événement (une édition = au plus une notif) ;
 *   - envoi groupé en une notification par appareil et par cycle ;
 *   - abonnements morts (410) supprimés ; erreurs temporaires ignorées ;
 *   - parallelisme limité (4) pour ménager les quotas.
 * MODE TEST : marqueur data/notif-test.json présent au checkout (ou input
 * workflow_dispatch `test`) → une notification test à CHAQUE abonnement,
 * hors préférences et hors dédup. Le token du marqueur est mémosé dans
 * notif_envoyees.test : un même marqueur ne re-teste pas deux fois ; on
 * supprime le marqueur du dépôt après le run. */
'use strict';
const webpush = require('web-push');
const fs = require('fs');

/* v89 : journal d'envoi publié dans data/notif-envois.json (meilleur effort).
 * Chaque envoi y est trace par DOMAINE de l'endpoint (jamais l'URL complete,
 * jamais les cles) et son statut HTTP : 201 = accepte par le service push
 * (Apple/Google/Mozilla), 410/404 = abonnement mort (app desinstallee). */
const STATS = {
  date: new Date().toISOString(),
  mode: 'normal',
  abonnements: 0,
  envoyes: 0,
  morts: 0,
  resultats: []
};
function noterEnvoi(endpoint, ok, status, corps) {
  let domaine = '?';
  try { domaine = String(endpoint).split('/')[2] || '?'; } catch (e) { /* endpoint illisible */ }
  STATS.resultats.push({ domaine, ok: !!ok, status: status || null, corps: corps ? String(corps).slice(0, 200) : undefined });
}
async function publierJournal() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY || 'maxjeandon-cmyk/newsletter-pwa';
  if (!token) return; /* pas de token : le journal reste dans les logs du run */
  try {
    const chemin = 'data/notif-envois.json';
    const headers = { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json' };
    let sha = null;
    const actuel = await fetch('https://api.github.com/repos/' + repo + '/contents/' + chemin, { headers });
    if (actuel.ok) sha = (await actuel.json()).sha;
    const put = await fetch('https://api.github.com/repos/' + repo + '/contents/' + chemin, {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Journal envois notifs ' + STATS.mode + ' : ' + STATS.envoyes + ' envoyee(s)', content: Buffer.from(JSON.stringify(STATS, null, 2), 'utf8').toString('base64'), sha: sha || undefined })
    });
    if (!put.ok) console.error('Journal non publie : GitHub ' + put.status);
  } catch (e) { console.error('Journal non publie : ' + String(e.message || e).slice(0, 120)); }
}

/* URL de base Supabase : le secret peut contenir une barre finale ou un suffixe
 * /rest/v1 (cas observe en prod) — on normalise, sinon le chemin double
 * (/rest/v1/rest/v1/...) echoue en PGRST125 et le run croit a zero abonnement. */
const URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
const CLE = process.env.SUPABASE_SERVICE_ROLE;
const H = { apikey: CLE, Authorization: 'Bearer ' + CLE, 'Content-Type': 'application/json' };

async function api(chemin, opts = {}) {
  const r = await AVEC_DELAI(fetch(URL + chemin, { ...opts, headers: { ...H, ...(opts.headers || {}) } }));
  return r;
}

/* v88 : garde-fou anti-blocage. Un appel réseau qui ne répond JAMAIS (endpoint
 * push mort, Supabase ou raw.githubusercontent muet) suspendait le run entier
 * — observe en prod le 05/10/2026 : deux runs test restes in_progress plus
 * de 15 min. On abandonne apres 30 s : l'envoi est traite comme temporaire
 * (le prochain cycle reessaiera), le run se termine proprement. */
const DELAI_MS = +(process.env.NOTIF_DELAI_MS || 30000);
function AVEC_DELAI(promesse, ms = DELAI_MS) {
  return Promise.race([
    promesse,
    new Promise((_, rej) => {
      const t = setTimeout(() => rej(new Error('delai depasse (' + ms + ' ms) — appel reseau muet, on passe a la suite')), ms);
      if (t.unref) t.unref(); /* ne retient pas le processus a la fin du travail */
    })
  ]);
}

/* Mode test : input dispatch (NOTIF_TEST=true) ou marqueur data/notif-test.json (token unique).
 * v89 : le marqueur historique est { "test": "…" } — l'ancien code lisait
 * m.token (champ inexistant) et renvoyait donc TOUJOURS la constante
 * 'marqueur' : apres le premier test, memo.test === 'marqueur' et TOUS les
 * tests suivants etaient sautes en silence (runs verts, 0 envoi). On accepte
 * les deux formes de champ. */
function modeTest() {
  if (process.env.NOTIF_TEST === 'true') return 'dispatch';
  try {
    const m = JSON.parse(fs.readFileSync('data/notif-test.json', 'utf8'));
    return m.test || m.token || 'marqueur';
  } catch (e) { return null; }
}

/* Écriture des préférences en lot : 1 requête par tranche de 100 (limite PostgREST). */
async function ecrirePrefs(lots) {
  for (let i = 0; i < lots.length; i += 100) {
    await api('/rest/v1/preferences?on_conflict=user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(lots.slice(i, i + 100).map(({ __uid, ...p }) => ({ user_id: __uid, prefs: p })))
    }).catch(() => {});
  }
}

async function main() {
  webpush.setVapidDetails('mailto:contact@desinfos.h24', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  /* v104 : diagnostic 403 Apple — l app souscrit avec la cle publique de
   * data/compte.json, le notifier signe avec les secrets VAPID_* ; si les
   * deux ne designent pas la meme paire, Apple repond 403 a jamais. On ne
   * journalise QUE le boolean (jamais la cle elle-meme). */
  try {
    const compte = JSON.parse(fs.readFileSync('data/compte.json', 'utf8'));
    STATS.cleMatch = !!(process.env.VAPID_PUBLIC_KEY && compte.push && compte.push.cle_publique && process.env.VAPID_PUBLIC_KEY === compte.push.cle_publique);
  } catch (e) { STATS.cleMatch = null; }

  /* 1. Abonnements push + préférences par utilisateur (toggles).
   * AVEC_DELAI emballe TOUTE la chaine (en-têtes + lecture du corps .json()) :
   * une réponse qui envoie ses en-têtes puis stall son corps pendant des
   * heures ne bloque plus le run — cas observe le 05/10/2026 (Supabase muet
   * en pleine nuit : trois runs test restes in_progress). */
  const abonnements = await AVEC_DELAI(api('/rest/v1/abonnements_push?select=endpoint,p256dh,auth,user_id')
    .then(r => { if (!r.ok) throw new Error('Supabase ' + r.status + ' sur ' + r.url.slice(0, 80)); return r.json(); }))
    .catch(e => { console.error('ERREUR lecture abonnements (envoye comme 0) : ' + (e && e.message ? e.message : e)); return []; });
  if (!Array.isArray(abonnements) || !abonnements.length) { console.log('Aucun abonnement.'); return; }

  const prefs = await AVEC_DELAI(api('/rest/v1/preferences?select=user_id,prefs').then(r => r.json())).catch(() => []);
  const parUtilisateur = new Map((prefs || []).map(p => [p.user_id, p.prefs || {}]));

  /* v88 : l'app enregistre les toggles sous prefs.notifications (la clé
   * locale nl.notifications est remontée telle quelle par envoyerPrefs) —
   * avant ce correctif, le notifier cherchait prefs.edition au niveau du
   * haut : aucun toggle n'était jamais vu, donc AUCUNE notification envoyée
   * malgré des abonnements enregistrés (runs verts silencieux). On lit les
   * deux formes : imbriquée (réelle) + niveau du haut (historique). */
  function togglesActifs(p) {
    const n = (p && typeof p.notifications === 'object' && p.notifications) || {};
    return {
      edition: !!(p.edition || n.edition),
      copernicus: !!(p.copernicus || n.copernicus),
      lyceens: !!(p.lyceens || n.lyceens)
    };
  }

  /* 2. MODE TEST : notification test à chaque abonnement, hors préférences et hors dédup */
  const test = modeTest();
  if (test) {
    STATS.mode = 'test';
    let envoyes = 0, morts = 0;
    const majPrefs = new Map();
    for (const a of abonnements) {
      const p = parUtilisateur.get(a.user_id) || {};
      const memo = p.notif_envoyees || {};
      if (test !== 'dispatch' && memo.test === test) continue; /* déjà testé pour ce marqueur */
      try {
        await AVEC_DELAI(webpush.sendNotification(
          { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
          JSON.stringify({ titre: '🔔 Test des notifications', corps: 'Si tu lis ça, le push fonctionne !', url: './#reglages' })
        ));
        envoyes++;
        noterEnvoi(a.endpoint, true, 201);
        majPrefs.set(a.user_id, { __uid: a.user_id, ...p, notif_envoyees: { ...memo, test } });
      } catch (e) {
        noterEnvoi(a.endpoint, false, e.statusCode || null, e.body || e.message);
        /* v90 : 403 = abonnement cree avec une autre cle VAPID — irrecuperable, on nettoie aussi */
        if (e.statusCode === 410 || e.statusCode === 404 || e.statusCode === 403) {
          morts++;
          await api('/rest/v1/abonnements_push?endpoint=eq.' + encodeURIComponent(a.endpoint), { method: 'DELETE' });
        } /* 429 / erreurs temporaires : ignorées */
      }
    }
    await ecrirePrefs([...majPrefs.values()]);
    STATS.abonnements = abonnements.length; STATS.envoyes = envoyes; STATS.morts = morts;
    console.log('Notifications TEST envoyées : ' + envoyes + ' ; abonnements morts nettoyés : ' + morts + ' ; token : ' + test + '.');
    await publierJournal();
    return;
  }

  /* 3. Quoi de neuf ? édition du jour + bulletin climat + relevé lycéens
   * + chronique « Version des étudiants » côté dépôt (fichiers générés) */
  const [idx, climat, lyceens, etudiants] = await Promise.all([
    AVEC_DELAI(fetch('https://raw.githubusercontent.com/maxjeandon-cmyk/newsletter-pwa/main/editions/latest.json').then(r => r.json())).catch(() => null),
    AVEC_DELAI(fetch('https://raw.githubusercontent.com/maxjeandon-cmyk/newsletter-pwa/main/data/climat.json').then(r => r.json())).catch(() => null),
    AVEC_DELAI(fetch('https://raw.githubusercontent.com/maxjeandon-cmyk/newsletter-pwa/main/data/lyceens.json').then(r => r.json())).catch(() => null),
    AVEC_DELAI(fetch('https://raw.githubusercontent.com/maxjeandon-cmyk/newsletter-pwa/main/data/etudiants/index.json').then(r => r.json())).catch(() => null)
  ]);
  const dateEdition = idx?.editions?.[0]?.date || null;
  const majClimat = climat?.maj || climat?.date || null;
  /* Relevé lycéens : identifié par horodatage de mise à jour + volumes des listes
   * (la maintenance régénère data/lyceens.json toutes les 6 h ; on ne notifie
   * qu'une fois par relevé réellement différent — maj change seulement quand
   * le fichier est republié). */
  const majLyceens = lyceens && (lyceens.maj || (lyceens.faits || []).length)
    ? (lyceens.maj || '') + '/' + (lyceens.faits || []).length + '/' + (lyceens.version_gouvernement || []).length
    : null;
  /* Chronique « Version des étudiants » : notifiée seulement quand un NOUVEAU
   * chapitre est publié — la signature change si et seulement si le nombre de
   * chapitres bouge ou que l'identifiant du dernier chapitre change (ni maj,
   * ni taille de fichiers : éditer un chapitre existant ne notifie pas). */
  const chapitres = (etudiants && Array.isArray(etudiants.chapitres) && etudiants.chapitres) || [];
  const dernierChapitre = chapitres.length ? chapitres[chapitres.length - 1] : null;
  const majEtudiants = dernierChapitre
    ? chapitres.length + '/' + dernierChapitre.id
    : null;

  /* 4. Déjà envoyé ? (dans prefs.notif_envoyees, mis à jour après succès) */
  const aNotifier = [];
  for (const a of abonnements) {
    const p = parUtilisateur.get(a.user_id) || {};
    const envoyes = p.notif_envoyees || {};
    const t = togglesActifs(p);
    const msgs = [];
    if (t.edition && dateEdition && envoyes.edition !== dateEdition)
      msgs.push({ titre: '📰 Édition du ' + dateEdition, corps: 'La nouvelle édition est prête.', url: './#edition' });
    if (t.copernicus && majClimat && envoyes.copernicus !== majClimat)
      msgs.push({ titre: '🌡️ Bulletin Copernicus', corps: 'Nouveau bulletin climat disponible.', url: './#climat' });
    if (t.lyceens && majLyceens && envoyes.lyceens !== majLyceens)
      msgs.push({ titre: '✊ Lycéens 2026', corps: (lyceens.faits || []).length + ' fait(s) vérifié(s) sur le mouvement lycéen — relevé actualisé.', url: './#lyceens' });
    if (t.lyceens && majEtudiants && envoyes.etudiants !== majEtudiants)
      msgs.push({ titre: '✊ Lycéens 2026', corps: 'Nouveau chapitre de la chronique « Version des étudiants » : « ' + (dernierChapitre.titre || dernierChapitre.id) + ' ».', url: './#lyceens/etudiants' });
    for (const m of (p.mediasNotifies || [])) msgs.push(m); /* réservé : alertes média futures */
    if (!msgs.length) continue;
    aNotifier.push({ abonnement: a, message: msgs[0], reste: msgs.length - 1, prefs: p, envoyes });
  }

  /* 5. Envoi, parallelisme 4, nettoyage des morts, PATCH par lot (v29) */
  let envoyes = 0, morts = 0;
  const majPrefs = new Map();
  const file = [...aNotifier];
  const ouvriers = Array.from({ length: Math.min(4, file.length) }, async () => {
    while (file.length) {
      const t = file.shift();
      try {
        await AVEC_DELAI(webpush.sendNotification(
          { endpoint: t.abonnement.endpoint, keys: { p256dh: t.abonnement.p256dh, auth: t.abonnement.auth } },
          JSON.stringify(t.message)
        ));
        envoyes++;
        noterEnvoi(t.abonnement.endpoint, true, 201);
        /* mémo : cet utilisateur a reçu edition/copernicus/lyceens/etudiants courant */
        const memo = { ...(t.envoyes || {}), ...(t.message.url === './#edition' ? { edition: dateEdition } : t.message.url === './#climat' ? { copernicus: majClimat } : t.message.url === './#lyceens' ? { lyceens: majLyceens } : t.message.url === './#lyceens/etudiants' ? { etudiants: majEtudiants } : {}) };
        /* PATCH différé : on accumule et on écrit par lot après la boucle (v29). */
        majPrefs.set(t.abonnement.user_id, { __uid: t.abonnement.user_id, ...t.prefs, notif_envoyees: memo });
      } catch (e) {
        noterEnvoi(t.abonnement.endpoint, false, e.statusCode || null, e.body || e.message);
        /* v90 : 403 = abonnement cree avec une autre cle VAPID — irrecuperable, on nettoie aussi */
        if (e.statusCode === 410 || e.statusCode === 404 || e.statusCode === 403) {
          morts++;
          await api('/rest/v1/abonnements_push?endpoint=eq.' + encodeURIComponent(t.abonnement.endpoint), { method: 'DELETE' });
        } /* 429 / erreurs temporaires : ignorées, le prochain cycle réessaie */
      }
    }
  });
  await Promise.all(ouvriers);
  await ecrirePrefs([...majPrefs.values()]);
  STATS.abonnements = abonnements.length; STATS.envoyes = envoyes; STATS.morts = morts;
  console.log('Notifications envoyées : ' + envoyes + ' ; abonnements morts nettoyés : ' + morts + ' ; prefs mises à jour : ' + majPrefs.size + '.');
  await publierJournal();
}

/* v88 : sortie explicite des que le travail est fini — un envoi abandonne
 * par le delai laisse sa requete https ouverte en arriere-plan (socket
 * zombie) et le processus Node restait vivant des minutes apres la fin
 * reelle du travail, laissant le run Actions « in_progress » pour rien. */
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
