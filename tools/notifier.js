#!/usr/bin/env node
/* notifier.js — envoi des notifications push (v28).
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

const URL = process.env.SUPABASE_URL;
const CLE = process.env.SUPABASE_SERVICE_ROLE;
const H = { apikey: CLE, Authorization: 'Bearer ' + CLE, 'Content-Type': 'application/json' };

async function api(chemin, opts = {}) {
  const r = await fetch(URL + chemin, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  return r;
}

/* Mode test : input dispatch (NOTIF_TEST=true) ou marqueur data/notif-test.json (token unique). */
function modeTest() {
  if (process.env.NOTIF_TEST === 'true') return 'dispatch';
  try {
    const m = JSON.parse(fs.readFileSync('data/notif-test.json', 'utf8'));
    return m.token || 'marqueur';
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

  /* 1. Abonnements push + préférences par utilisateur (toggles) */
  const abonnements = await api('/rest/v1/abonnements_push?select=endpoint,p256dh,auth,user_id,prefs')
    .then(r => r.json()).catch(() => []);
  if (!Array.isArray(abonnements) || !abonnements.length) { console.log('Aucun abonnement.'); return; }

  const prefs = await api('/rest/v1/preferences?select=user_id,prefs')
    .then(r => r.json()).catch(() => []);
  const parUtilisateur = new Map((prefs || []).map(p => [p.user_id, p.prefs || {}]));

  /* 2. MODE TEST : notification test à chaque abonnement, hors préférences et hors dédup */
  const test = modeTest();
  if (test) {
    let envoyes = 0, morts = 0;
    const majPrefs = new Map();
    for (const a of abonnements) {
      const p = parUtilisateur.get(a.user_id) || {};
      const memo = p.notif_envoyees || {};
      if (test !== 'dispatch' && memo.test === test) continue; /* déjà testé pour ce marqueur */
      try {
        await webpush.sendNotification(
          { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
          JSON.stringify({ titre: '🔔 Test des notifications', corps: 'Si tu lis ça, le push fonctionne !', url: './#reglages' })
        );
        envoyes++;
        majPrefs.set(a.user_id, { __uid: a.user_id, ...p, notif_envoyees: { ...memo, test } });
      } catch (e) {
        if (e.statusCode === 410 || e.statusCode === 404) {
          morts++;
          await api('/rest/v1/abonnements_push?endpoint=eq.' + encodeURIComponent(a.endpoint), { method: 'DELETE' });
        } /* 429 / erreurs temporaires : ignorées */
      }
    }
    await ecrirePrefs([...majPrefs.values()]);
    console.log('Notifications TEST envoyées : ' + envoyes + ' ; abonnements morts nettoyés : ' + morts + ' ; token : ' + test + '.');
    return;
  }

  /* 3. Quoi de neuf ? édition du jour + bulletin climat + résumé feedback côté dépôt (fichiers générés) */
  const [idx, climat, feedback] = await Promise.all([
    fetch('https://raw.githubusercontent.com/maxjeandon-cmyk/newsletter-pwa/main/editions/latest.json').then(r => r.json()).catch(() => null),
    fetch('https://raw.githubusercontent.com/maxjeandon-cmyk/newsletter-pwa/main/data/climat.json').then(r => r.json()).catch(() => null),
    fetch('https://raw.githubusercontent.com/maxjeandon-cmyk/newsletter-pwa/main/data/feedback.json').then(r => r.json()).catch(() => null)
  ]);
  const dateEdition = idx?.editions?.[0]?.date || null;
  const majClimat = climat?.maj || climat?.date || null;
  /* Résumé feedback : identifié par date + nombre de messages (l'agent maintenance
   * régénère data/feedback.json toutes les 6 h ; on ne notifie qu'une fois par
   * résumé réellement différent). */
  const majFeedback = feedback && (feedback.date || feedback.total)
    ? (feedback.date || '') + '/' + (feedback.total || 0)
    : null;

  /* 4. Déjà envoyé ? (dans prefs.notif_envoyees, mis à jour après succès) */
  const aNotifier = [];
  for (const a of abonnements) {
    const p = parUtilisateur.get(a.user_id) || {};
    const envoyes = p.notif_envoyees || {};
    const msgs = [];
    if (p.edition && dateEdition && envoyes.edition !== dateEdition)
      msgs.push({ titre: '📰 Édition du ' + dateEdition, corps: 'La nouvelle édition est prête.', url: './#edition' });
    if (p.copernicus && majClimat && envoyes.copernicus !== majClimat)
      msgs.push({ titre: '🌡️ Bulletin Copernicus', corps: 'Nouveau bulletin climat disponible.', url: './#climat' });
    if (p.feedback && majFeedback && envoyes.feedback !== majFeedback)
      msgs.push({ titre: '💬 Résumé de tes retours', corps: (feedback.total || 0) + ' message(s) de feedback pris en compte.', url: './#feedback' });
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
        await webpush.sendNotification(
          { endpoint: t.abonnement.endpoint, keys: { p256dh: t.abonnement.p256dh, auth: t.abonnement.auth } },
          JSON.stringify(t.message)
        );
        envoyes++;
        /* mémo : cet utilisateur a reçu edition/copernicus/feedback courant */
        const memo = { ...(t.envoyes || {}), ...(t.message.url === './#edition' ? { edition: dateEdition } : t.message.url === './#climat' ? { copernicus: majClimat } : t.message.url === './#feedback' ? { feedback: majFeedback } : {}) };
        /* PATCH différé : on accumule et on écrit par lot après la boucle (v29). */
        majPrefs.set(t.abonnement.user_id, { __uid: t.abonnement.user_id, ...t.prefs, notif_envoyees: memo });
      } catch (e) {
        if (e.statusCode === 410 || e.statusCode === 404) {
          morts++;
          await api('/rest/v1/abonnements_push?endpoint=eq.' + encodeURIComponent(t.abonnement.endpoint), { method: 'DELETE' });
        } /* 429 / erreurs temporaires : ignorées, le prochain cycle réessaie */
      }
    }
  });
  await Promise.all(ouvriers);
  await ecrirePrefs([...majPrefs.values()]);
  console.log('Notifications envoyées : ' + envoyes + ' ; abonnements morts nettoyés : ' + morts + ' ; prefs mises à jour : ' + majPrefs.size + '.');
}

main().catch(e => { console.error(e); process.exit(1); });
