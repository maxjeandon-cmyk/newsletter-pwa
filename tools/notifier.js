#!/usr/bin/env node
/* notifier.js — envoi des notifications push (v28).
 * Tourne dans GitHub Actions (toutes les 2 h) : lit les préférences de
 * notification (toggles édition / Copernicus / médias) et les abonnements
 * push dans Supabase, puis envoie UNIQUEMENT ce qui est nouveau depuis le
 * dernier envoi — un état simple dans la table preferences (cle notif_envoyees,
 * hors préférences utilisateur). Anti-overload :
 *   - dédup par nature d'événement (une édition = au plus une notif) ;
 *   - envoi groupé en une notification par appareil et par cycle ;
 *   - abonnements morts (410) supprimés ; erreurs temporaires ignorées ;
 *   - parallelisme limité (4) pour ménager les quotas. */
'use strict';
const webpush = require('web-push');

const URL = process.env.SUPABASE_URL;
const CLE = process.env.SUPABASE_SERVICE_ROLE;
const H = { apikey: CLE, Authorization: 'Bearer ' + CLE, 'Content-Type': 'application/json' };

async function api(chemin, opts = {}) {
  const r = await fetch(URL + chemin, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  return r;
}

async function main() {
  webpush.setVapidDetails('mailto:contact@desinfos.h24', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  /* 1. Quoi de neuf ? édition du jour + bulletin climat côté dépôt (fichiers générés) */
  const [idx, climat] = await Promise.all([
    fetch('https://maxjeandon-cmyk.github.io/newsletter-pwa/editions/latest.json').then(r => r.json()).catch(() => null),
    fetch('https://maxjeandon-cmyk.github.io/newsletter-pwa/data/climat.json').then(r => r.json()).catch(() => null)
  ]);
  const dateEdition = idx?.editions?.[0]?.date || null;
  const majClimat = climat?.maj || climat?.date || null;

  /* 2. État d'envoi (mémo partagé, une ligne dédiée par service dans preferences d'un compte système) */
  const abonnements = await api('/rest/v1/abonnements_push?select=endpoint,p256dh,auth,user_id,prefs')
    .then(r => r.json()).catch(() => []);
  if (!Array.isArray(abonnements) || !abonnements.length) { console.log('Aucun abonnement.'); return; }

  /* 3. Préférences par utilisateur (toggles) */
  const prefs = await api('/rest/v1/preferences?select=user_id,prefs')
    .then(r => r.json()).catch(() => []);
  const parUtilisateur = new Map((prefs || []).map(p => [p.user_id, p.prefs || {}]));

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
    for (const m of (p.mediasNotifies || [])) msgs.push(m); /* réservé : alertes média futures */
    if (!msgs.length) continue;
    aNotifier.push({ abonnement: a, message: msgs[0], reste: msgs.length - 1, prefs: p, envoyes });
  }

  /* 5. Envoi, parallelisme 4, nettoyage des morts */
  let envoyes = 0, morts = 0;
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
        /* mémo : cet utilisateur a reçu edition/copernicus courant */
        const prefs = { ...t.prefs, notif_envoyees: { ...(t.envoyes || {}), ...(t.message.url === './#edition' ? { edition: dateEdition } : t.message.url === './#climat' ? { copernicus: majClimat } : {}) } };
        await api('/rest/v1/preferences?user_id=eq.' + t.abonnement.user_id, {
          method: 'PATCH', body: JSON.stringify({ prefs })
        });
      } catch (e) {
        if (e.statusCode === 410 || e.statusCode === 404) {
          morts++;
          await api('/rest/v1/abonnements_push?endpoint=eq.' + encodeURIComponent(t.abonnement.endpoint), { method: 'DELETE' });
        } /* 429 / erreurs temporaires : ignorées, le prochain cycle réessaie */
      }
    }
  });
  await Promise.all(ouvriers);
  console.log('Notifications envoyées : ' + envoyes + ' ; abonnements morts nettoyés : ' + morts + '.');
}

main().catch(e => { console.error(e); process.exit(1); });
