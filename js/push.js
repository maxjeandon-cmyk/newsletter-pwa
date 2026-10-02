/* push.js — notifications push (v28) : abonnement côté navigateur.
 * L'utilisateur active les notifications dans Réglages > Notifications.
 * Chaque toggle (édition du jour, Copernicus, un média) crée/met à jour un
 * abonnement Web Push stocké dans Supabase (table abonnements_push, protégée
 * par RLS : chacun ne voit que ses abonnements).
 * L'ENVOI se fait côté serveur : le workflow GitHub Actions (notifier.yml)
 * lit les abonnements et pousse via web-push — jamais depuis le navigateur.
 * Clés VAPID : la publique dans data/compte.json (push.cle_publique), la
 * privée dans les secrets GitHub Actions (VAPID_PRIVATE_KEY). */
import { state, getStore, setStore, urlBase64ToUint8Array } from './core.js';

const ABONNEMENTS = 'notifications';  // préférences locales : { edition, copernicus, medias: {id:bool} }
const ENDPOINT = 'push.endpoint';     // endpoint local pour éviter les doublons d'abonnement

/* Préférences de notification (toggles) — préférences locales classiques (nl.*) */
export function prefsNotifications() { return getStore(ABONNEMENTS, { edition: false, copernicus: false, medias: {} }); }
export async function basculerNotification(categorie, mediaId) {
  const p = prefsNotifications();
  if (categorie === 'medias') p.medias[mediaId] = !p.medias[mediaId];
  else p[categorie] = !p[categorie];
  setStore(ABONNEMENTS, p);
  /* S'assurer qu'un abonnement push existe si au moins un toggle est actif */
  if (p.edition || p.copernicus || Object.values(p.medias).some(Boolean)) await souscrire();
  return p;
}

/* Support : HTTPS + service worker + Push API (iOS 16.4+ installé, Android, desktop) */
export function pushDisponible() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function clePublique() {
  if (!state.compteCfg) {
    try { state.compteCfg = await (await fetch('data/compte.json', { cache: 'no-store' })).json(); }
    catch (e) { state.compteCfg = {}; }
  }
  return state.compteCfg?.push?.cle_publique || null;
}

/* S'abonner au push (crée ou réutilise l'abonnement navigateur) puis l'enregistrer dans Supabase */
export async function souscrire() {
  if (!pushDisponible()) return { erreur: 'non-supporte' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { erreur: 'permission' };
  const cle = await clePublique();
  if (!cle) return { erreur: 'configuration' };
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(cle)
      });
    }
    const ok = await enregistrerDistant(sub.toJSON());
    setStore(ENDPOINT, sub.endpoint);
    return { ok };
  } catch (e) { return { erreur: 'reseau' }; }
}

/* Se désabonner complètement (plus aucun toggle actif) */
export async function desabonner() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await supprimerDistant(sub.endpoint); await sub.unsubscribe(); }
  } catch (e) { /* doux */ }
  setStore(ENDPOINT, '');
  return { ok: true };
}

/* --- Enregistrement dans Supabase (fetch direct, jeton de session) --- */
async function jeton() {
  const s = getStore('compte.session', null);
  return s?.access_token || null;
}

async function enregistrerDistant(sub) {
  const t = await jeton();
  if (!t) return false;
  const cfg = state.compteCfg || {};
  try {
    const r = await fetch(cfg.url + '/rest/v1/abonnements_push?on_conflict=endpoint', {
      method: 'POST',
      headers: {
        'apikey': cfg.anon_key, 'Authorization': 'Bearer ' + t,
        'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ endpoint: sub.endpoint, p256dh: sub.keys?.p256dh, auth: sub.keys?.auth })
    });
    return r.ok;
  } catch (e) { return false; }
}

async function supprimerDistant(endpoint) {
  const t = await jeton();
  if (!t) return false;
  const cfg = state.compteCfg || {};
  try {
    const r = await fetch(cfg.url + '/rest/v1/abonnements_push?endpoint=eq.' + encodeURIComponent(endpoint), {
      method: 'DELETE',
      headers: { 'apikey': cfg.anon_key, 'Authorization': 'Bearer ' + t }
    });
    return r.ok;
  } catch (e) { return false; }
}
