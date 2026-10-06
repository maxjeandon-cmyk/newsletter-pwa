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
import { jetonActif } from './compte.js';

const ABONNEMENTS = 'notifications';  // préférences locales : { edition, copernicus, medias: {id:bool} }
const ENDPOINT = 'push.endpoint';     // endpoint local pour éviter les doublons d'abonnement
const ESSAI = 'push.dernier_essai';   // v66 : dernier résultat d'enregistrement, affiché dans Réglages

/* Préférences de notification (toggles) — préférences locales classiques (nl.*) */
/* v70 : normalisation — une préférence sauvegardée par une ancienne version
 * peut ne pas avoir la clé medias (ou lyceens) : Object.values(undefined)
 * levait une TypeError dans basculerNotification AVANT tout noterEssai,
 * laissant la ligne d'état sur « jamais confirmé » en boucle. */
export function prefsNotifications() {
  const p = getStore(ABONNEMENTS, {}) || {};
  return { edition: !!p.edition, copernicus: !!p.copernicus, lyceens: !!p.lyceens, medias: (p.medias && typeof p.medias === 'object') ? p.medias : {} };
}
export async function basculerNotification(categorie, mediaId) {
  const p = prefsNotifications();
  if (categorie === 'medias') { if (!p.medias) p.medias = {}; p.medias[mediaId] = !p.medias[mediaId]; }
  else p[categorie] = !p[categorie];
  setStore(ABONNEMENTS, p);
  /* S'assurer qu'un abonnement push existe si au moins un toggle est actif */
  if (p.edition || p.copernicus || p.lyceens || Object.values(p.medias).some(Boolean)) await souscrire();
  return p;
}

/* Support : HTTPS + service worker + Push API. Sur iOS, le push n'existe que
 * dans la PWA installée sur l'écran d'accueil (iOS 16.4+) — jamais dans l'onglet
 * Safari : on le détecte pour guider l'utilisateur au lieu d'échouer en silence. */
export function pushDisponible() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/* iOS dans l'onglet Safari : PushManager absent — la PWA installée l'expose. */
export function safariOngletSansPush() {
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); /* iPadOS */
  return iOS && !pushDisponible();
}

/* v101 : contexte navigateur/plateforme pour guider les cas Firefox mobile.
 * - Firefox iPhone : WebKit imposé, PushManager réservé aux apps installées
 *   DEPUIS SAFARI — Firefox ne peut pas installer de PWA push, jamais.
 * - Firefox Android : Push API présente, mais la connexion au service push
 *   de Mozilla ne vit que tant que Firefox est ouvert — notifications
 *   possibles seulement navigateur actif (pas de réveil en arrière-plan). */
export function ctxNotifications() {
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const firefox = /Firefox|FxiOS|Focus/.test(ua) && !/Seamonkey/.test(ua);
  return {
    firefox,
    plateforme: iOS ? 'ios' : android ? 'android' : (ua.includes('Mobile') ? 'mobile' : 'desktop'),
    push: pushDisponible()
  };
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
  const ctx = ctxNotifications();
  if (!pushDisponible()) {
    const detail = ctx.firefox && ctx.plateforme === 'ios'
      ? 'Firefox sur iPhone ne peut pas recevoir de notifications (WebKit : le push est réservé aux apps installées depuis Safari). Ouvre diyeah24.fr dans Safari → Partager → Sur l\u2019écran d\u2019accueil.'
      : ctx.firefox
        ? 'push indisponible dans ce Firefox — vérifie la version (Android : Push API depuis Firefox 120) ou installe l\u2019app depuis un navigateur Chromium/Safari'
        : "push indisponible dans ce contexte (Safari iOS ? installe l'app sur l'écran d'accueil)";
    noterEssai({ ok: false, etape: 'support', message: detail });
    return { erreur: 'non-supporte' };
  }
  noterEssai({ ok: false, etape: 'permission', message: 'demande de permission en cours…' });
  let perm; try { perm = await Notification.requestPermission(); } catch (e) { noterEssai({ ok: false, etape: 'permission', message: String(e && e.message || e).slice(0, 140) }); return { erreur: 'permission' }; }
  if (perm !== 'granted') { noterEssai({ ok: false, etape: 'permission', message: 'permission refusée ou non donnée' }); return { erreur: 'permission' }; }
  const cle = await clePublique();
  if (!cle) { noterEssai({ ok: false, etape: 'configuration', message: 'clé publique push introuvable (data/compte.json)' }); return { erreur: 'configuration' }; }
  /* v72 : chaque étape est marquée AVANT d'être attendue — si la ligne
   * reste sur une étape « en cours… », on sait exactement quel await ne
   * revient jamais (permission ou abonnement navigateur). */
  noterEssai({ ok: false, etape: 'abonnement', message: 'abonnement navigateur en cours…' });
  try {
    /* v77 : avant d'attendre .ready (qui ne revient JAMAIS s'il n'y a pas
     * de SW actif), on inspecte l'enregistrement réel et on pose un
     * timeout — le gel devient un diagnostic explicite. */
    /* v78 : auto-réparation — si aucun SW n'est enregistré (échec silencieux
     * au chargement), on retente ICI et on note le résultat. */
    let reg0 = await navigator.serviceWorker.getRegistration();
    if (!reg0) {
      try { reg0 = await navigator.serviceWorker.register('sw.js'); } catch (e) {
        noterEssai({ ok: false, etape: 'support', message: 'enregistrement du service worker impossible : ' + String(e && e.message || e).slice(0, 140) });
        return { erreur: 'sw' };
      }
    }
    const etatSW = !reg0 ? 'aucun service worker enregistré — recharge la page d\u2019abord'
      : !reg0.active ? ('SW pas actif (installing=' + (reg0.installing ? reg0.installing.state : 'non') + ', waiting=' + (reg0.waiting ? reg0.waiting.state : 'non') + ') — purge le cache puis recharge')
      : 'actif (' + (reg0.active.state || '?') + ')';
    noterEssai({ ok: false, etape: 'abonnement', message: 'service worker : ' + etatSW });
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, rej) => setTimeout(() => rej(new Error('service worker jamais prêt : ' + etatSW)), 10000))
    ]);
    noterEssai({ ok: false, etape: 'abonnement', message: 'lecture abonnement existant…' });
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      noterEssai({ ok: false, etape: 'abonnement', message: 'création abonnement navigateur…' });
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(cle)
      });
    }
    noterEssai({ ok: false, etape: 'serveur', message: 'enregistrement dans Supabase…' });
    /* v102 : le contournement v80 (skip du POST si l'endpoint est en stockage
     * local) créait des « confirmé » de FANTÔME : la ligne serveur peut avoir
     * été supprimée (purge des abonnements morts côté Actions, purge du cache
     * côté utilisateur) alors que le cache local gardait l'endpoint — l'app
     * affichait « déjà enregistré » sans jamais re-POSTer. Désormais on
     * VÉRIFIE en table : absent → POST ; présent → vrai déjà-enregistré. */
    const dejaLa = await dejaEnregistreDistant(sub.endpoint);
    const res = dejaLa
      ? { ok: true, status: 200, message: 'déjà enregistré côté serveur (vérifié en table)' }
      : await enregistrerDistant(sub.toJSON());
    /* v64 : on ne mémorise l'endpoint QUE si l'enregistrement serveur a réussi.
     * v66 : le résultat complet (statut HTTP, message serveur) est conservé et
     * affiché dans Réglages — plus aucun échec ne peut passer pour un succès. */
    noterEssai(res);
    if (res.ok) setStore(ENDPOINT, sub.endpoint);
    return { ok: res.ok };
  } catch (e) { noterEssai({ ok: false, etape: 'abonnement', message: String(e && e.message || e).slice(0, 140) }); return { erreur: 'reseau' }; }
}

/* v66 : mémorise le dernier essai d'enregistrement (statut + message serveur),
 * affiché tel quel dans Réglages > Notifications. */
/* v74 : chaque jalon est aussi diffusé comme événement — la ligne d'état
 * dans Réglages se rafraîchit EN DIRECT pendant l'abonnement, au lieu
 * d'attendre la fin du await (qui peut se bloquer). */
function noterEssai(res) {
  const essai = { quand: Date.now(), ...res };
  setStore(ESSAI, essai);
  try { window.dispatchEvent(new CustomEvent('push-essai', { detail: essai })); } catch (e) { /* rien */ }
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
  /* v64 : jeton rafraichi si expiré (avant : jeton brut du store, qui
   * expirait au bout d'une heure et faisait échouer l'insertion en silence). */
  return await jetonActif();
}

async function enregistrerDistant(sub) {
  const t = await jeton();
  if (!t) return { ok: false, etape: 'session', message: 'session expirée — reconnecte-toi dans Profil puis re-bascule le toggle' };
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
    if (r.ok) return { ok: true, status: r.status, message: 'enregistré côté serveur' };
    let corps = '';
    try { corps = (await r.text()).slice(0, 140); } catch (e) { /* rien */ }
    /* 42501 : l'upsert a buté sur la policy UPDATE (l'endpoint existe déjà en
     * table) — la ligne EST enregistrée, on ne fait pas passer ça pour un échec
     * (c'était le piège que le contournement v80 essayait d'éviter). */
    if (r.status === 42501) return { ok: true, status: 200, message: 'déjà enregistré (mise à jour non nécessaire)' };
    return { ok: false, status: r.status, message: corps || ('HTTP ' + r.status) };
  } catch (e) { return { ok: false, etape: 'réseau', message: String(e && e.message || e).slice(0, 140) }; }
}

/* v102 : l'endpoint est-il réellement en table ? (vrai vérification serveur,
 * remplace la confiance aveugle au cache local du contournement v80). */
async function dejaEnregistreDistant(endpoint) {
  const t = await jeton();
  if (!t || !endpoint) return false;
  const cfg = state.compteCfg || {};
  try {
    const r = await fetch(cfg.url + '/rest/v1/abonnements_push?endpoint=eq.' + encodeURIComponent(endpoint) + '&select=endpoint', {
      headers: { 'apikey': cfg.anon_key, 'Authorization': 'Bearer ' + t }
    });
    if (!r.ok) return false; /* SELECT impossible (policy ?) : on tente le POST */
    const lignes = await r.json();
    return Array.isArray(lignes) && lignes.length > 0;
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
