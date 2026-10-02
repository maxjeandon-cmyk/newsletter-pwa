/* compte.js — comptes utilisateurs & synchronisation des préférences (v23).
 * Objectif : chaque utilisateur peut créer un compte (identifiant, e-mail, mot de
 * passe) pour retrouver ses préférences (médias, revues, thème…) sur tous ses
 * appareils. Le site reste PLEINEMENT utilisable sans compte — localStorage
 * reste la source de vérité locale, le compte ne fait que synchroniser.
 *
 * Architecture : le site est 100 % statique (GitHub Pages) — l'authentification
 * et la base vivent chez Supabase (PostgreSQL + auth intégrée). On parle à
 * l'API REST directement en fetch : aucune dépendance, aucun bundler.
 *   - data/compte.json : url + anon_key du projet (chargé network-first).
 *   - supabase/schema.sql : tables + politiques RLS à exécuter dans la console.
 *
 * Sécurité :
 *   - le mot de passe ne JAMAIS transiter ni être stocké chez nous : il part
 *     en HTTPS directement à l'API auth de Supabase qui le hache (bcrypt) ;
 *   - la clé anon est publique par conception : les données sont protégées par
 *     les politiques RLS (chaque utilisateur ne voit QUE sa ligne) ;
 *   - la session vit dans localStorage (nl.compte.session) : déconnexion locale
 *     partout où elle est rangée, jamais dans un cookie tier qui fuit.
 *
 * Contrat doux : toutes les fonctions renvoient { ok, ... } ou { erreur } —
 * jamais d'exception vers l'appelant. */

import { $, state, getStore, setStore, esc } from './core.js';

const CFG_URL = 'data/compte.json';
const ABONNE = 'compte.abonne';      // id + e-mail de l'utilisateur connecté
const SESSION = 'compte.session';    // jeton de session Supabase (access/refresh) — persisté SI « Rester connecté »
const SOUVENIR = 'compte.souvenir';  // « Rester connecté » coché : la session survit aux purges et redémarrages
const PREFS = 'nl.compte.prefs';        // prefs distantes écrasées -> merge local

/* --- Config (chargée au démarrage, network-first par le SW) --- */
async function config() {
  if (!state.compteCfg) {
    try {
      const r = await fetch(CFG_URL, { cache: 'no-store' });
      state.compteCfg = await r.json();
    } catch (e) { state.compteCfg = {}; }
  }
  return state.compteCfg || {};
}

/* --- Client REST minimal (fetch direct, zéro dépendance) --- */
let sessions = getStore(SESSION, null);

function entetes(jeton) {
  const h = { 'apikey': state.compteCfg.anon_key, 'Content-Type': 'application/json' };
  if (jeton) h['Authorization'] = 'Bearer ' + jeton;
  return h;
}

async function appelAPI(chemin, corps, jeton) {
  const cfg = await config();
  if (!cfg.url || !cfg.anon_key) return { erreur: 'configuration' };
  try {
    const r = await fetch(cfg.url + chemin, {
      method: corps ? 'POST' : 'GET',
      headers: entetes(jeton || cfg.anon_key),
      body: corps ? JSON.stringify(corps) : undefined
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { erreur: traduire(j) };
    return j;
  } catch (e) { return { erreur: 'reseau' }; }
}

/* Messages d'erreur en français simple, jamais de détail technique qui aide un attaquant */
function traduire(j) {
  const m = (j.error || j.msg || j.message || String(j.error_description || j || '')).toLowerCase();
  if (j.error_code === 'user_already_exists' || /already exists|exists/.test(m)) return 'existe';
  if (/invalid login|wrong password|email not confirmed/i.test(m)) return 'identifiants';
  if (/at least 6 characters|too short|password should be/i.test(m)) return 'mdp-court';
  if (/invalid email|unable to validate email/i.test(m)) return 'email-invalide';
  if (/over_email_send_rate_limit|too many requests/i.test(m) ) return 'trop-de-demandes';
  if (/user not found/i.test(m)) return 'identifiants';
  return 'indisponible';
}

/* --- Session locale --- */
function rangerSession(s) {
  sessions = s;
  if (s && getStore(SOUVENIR, false)) setStore(SESSION, s);
  else localStorage.removeItem('nl.' + SESSION);
}
export function deconnexionLocale() {
  sessions = null;
  localStorage.removeItem('nl.' + SESSION);
  localStorage.removeItem('nl.' + ABONNE);
  localStorage.removeItem('nl.' + SOUVENIR);
}

async function rafraichirSiExpiré() {
  if (!sessions?.access_token) return null;
  if (Date.now() / 1000 < (sessions.expires_at || 0) - 60) return sessions.access_token;
  const cfg = await config();
  try {
    const r = await fetch(cfg.url + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'apikey': cfg.anon_key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: sessions.refresh_token })
    });
    const j = await r.json();
    if (!r.ok) { deconnexionLocale(); return null; }
    rangerSession(j);
    return j.access_token;
  } catch (e) { return null; }
}

/* --- Authentification --- */
export async function inscrire(email, mdp) {
  const j = await appelAPI('/auth/v1/signup', { email, password: mdp });
  if (j.erreur) return j;
  if (j.user) {
    if (j.user.confirmed_at || j.user.email_confirmed_at || j.session) {
      return { ok: true, session: j.session || null, confirmation: false };
    }
    return { ok: true, session: null, confirmation: true };
  }
  return { erreur: 'indisponible' };
}

export async function connecter(email, mdp, souvenir) {
  if (souvenir) setStore(SOUVENIR, true);
  const j = await appelAPI('/auth/v1/token?grant_type=password', { email, password: mdp });
  if (j.erreur) { if (souvenir) localStorage.removeItem('nl.' + SOUVENIR); return j; }
  if (j.access_token) { rangerSession(j); return { ok: true }; }
  return { erreur: 'identifiants' };
}

export async function deconnecter() {
  const cfg = await config();
  if (sessions?.access_token && cfg.url) {
    try {
      await fetch(cfg.url + '/auth/v1/logout', {
        method: 'POST', headers: entetes(sessions.access_token)
      });
    } catch (e) { /* déconnexion locale de toute façon */ }
  }
  deconnexionLocale();
  return { ok: true };
}

/* Restaurer la session au démarrage : silencieux, jamais bloquant */
export async function restaurerSession() {
  const t = await rafraichirSiExpiré();
  if (!t) return null;
  const j = await appelAPI('/auth/v1/user', null, t);
  if (j.erreur) { deconnexionLocale(); return null; }
  setStore(ABONNE, { id: j.id, email: j.email });
  return j;
}

/* --- Préférences : une ligne par utilisateur, protégée par RLS --- */
/* v27 : TOUT ce qui vit dans localStorage (clés nl.*) voyage avec le profil — présent et futur.
 * Seules exceptions : jetons de session (liés à l'appareil) et jeton GitHub (secret local).
 * Un futur réglage ajouté dans l'onglet Réglages sera donc synchronisé automatiquement. */
const HORS_SYNCO = ['compte.session', 'compte.abonne', 'compte.souvenir', 'jeton'];
function prefsLocales() {
  const p = {};
  for (const k of Object.keys(localStorage)) {
    if (!k.startsWith('nl.')) continue;
    const cle = k.slice('nl.'.length);
    if (HORS_SYNCO.includes(cle)) continue;
    try { p[cle] = JSON.parse(localStorage.getItem(k)); } catch (e) { /* illisible : ignorée */ }
  }
  return p;
}

async function jetonActif() {
  const t = await rafraichirSiExpiré();
  return t;
}

export async function envoyerPrefs() {
  const t = await jetonActif();
  if (!t) return { erreur: 'deconnecte' };
  const cfg = await config();
  try {
    const r = await fetch(cfg.url + '/rest/v1/preferences?on_conflict=user_id', {
      method: 'POST',
      headers: { ...entetes(t), 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ prefs: prefsLocales() })
    });
    if (!r.ok) return { erreur: 'indisponible' };
    return { ok: true };
  } catch (e) { return { erreur: 'reseau' }; }
}

export async function chargerPrefs() {
  const t = await jetonActif();
  if (!t) return { erreur: 'deconnecte' };
  const cfg = await config();
  try {
    const r = await fetch(cfg.url + '/rest/v1/preferences?select=prefs,updated_at&order=updated_at.desc&limit=1', {
      headers: entetes(t)
    });
    if (!r.ok) return { erreur: 'indisponible' };
    const lignes = await r.json();
    if (!lignes.length) return { erreur: 'vide' };
    return { ok: true, prefs: lignes[0].prefs || {}, maj: lignes[0].updated_at };
  } catch (e) { return { erreur: 'reseau' }; }
}

/* Au démarrage (connexion réussie) : les prefs locales plus récentes gagnent sur
 * les prefs distantes plus anciennes — on compare au poids du contenu, la plus
 * riche l'emporte en cas d'égalité d'ancienneté relative (heuristique simple,
 * jamais destructive : rien n'est effacé, au pire fusionné). */
export async function synchroniserPrefs() {
  const locales = prefsLocales();
  const dist = await chargerPrefs();
  if (dist.ok) {
    for (const [k, v] of Object.entries(dist.prefs)) {
      if (v === null || v === undefined || HORS_SYNCO.includes(k)) continue;
      setStore(k, v);
    }
  }
  await envoyerPrefs();
  return dist.ok ? { ok: true, maj: dist.maj } : { ok: true, initial: true };
}

export const abonne = () => getStore(ABONNE, null);
export const estConnecte = () => !!sessions?.access_token;
export const veutResterConnecte = () => getStore(SOUVENIR, false);
