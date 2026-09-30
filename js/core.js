/* core.js — fondations de la PWA Newsletter (v16).
 * État partagé, helpers, stockage local, dates, thème.
 * Principe : aucun framework, aucune dépendance — chaque brique tient dans un écran. */

export const $ = s => document.querySelector(s);

export const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/* État applicatif unique : les vues le lisent, app.js l'alimente. */
export const state = {
  activeTab: 'edition',    // onglet ouvert : edition | sources | archives | articles | medias
  activeMedia: null,       // sous-onglet Médias ouvert (id du média)
  archiveSel: null,        // fichier HTML d'archive ouvert (onglet Archives)
  archiveMonth: null,      // mois affiché dans les Archives (YYYY-MM)
  archiveSub: 'editions',  // sous-onglet Archives : 'editions' | 'droit' | 'economie' (v20)
  edition: null,           // édition du jour (editions/YYYY-MM-DD.json)
  archiveIdx: [],          // liste des éditions (editions/latest.json)
  weeksIdx: null,          // index des récaps hebdo (editions/semaines/index.json)
  archivesThema: {},        // index des archives thématiques (editions/archives/{droit,economie}.json, v20)
  chapters: [],            // config des flux par chapitre (data/chapters.json)
  mediasBase: [],          // médias de la config serveur (data/medias.json)
  fluxCatalogue: [],       // catalogue de flux RSS vérifiés (data/flux-rss.json, v21)
  medias: [],              // médias effectifs = config serveur + ajouts personnels (nl.mediasPerso)
  mediasMode: null,        // sous-vue de l'onglet Médias : null | 'ajout' | 'gerer'
  feed: { time: 0, articles: [] },       // flux chaud de l'onglet Articles
  feedStats: { ok: 0, total: 0, time: 0 },
  mediaData: {},           // { mediaId: { time, articles, ok, total, stale } }
  publie: null             // dernier média publié pour tous les écrans (info affichée une fois dans 👁 Gérer)
};

/* --- Stockage local (clés préfixées « nl. » pour un nettoyage facile) --- */
const PREFIX = 'nl.';
export function getStore(k, d) {
  try { return JSON.parse(localStorage.getItem(PREFIX + k)) ?? d; } catch (e) { return d; }
}
export function setStore(k, v) {
  try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) { /* quota plein */ }
}
/* Purge du cache : tout effacer SAUF les préférences (conservées même après
 * « Purger le cache » — un média ajouté ne doit jamais disparaître par accident).
 * v19 : mediasAffiches (médias « masqués par défaut » réaffichés ici) et jeton
 * (GitHub, publication pour tous les écrans) sont aussi des préférences. */
const GARDEES = ['theme', 'masques', 'afpOnly', 'mediasPerso', 'mediasMasques', 'mediasAffiches', 'jeton'];
export function purgeStore() {
  Object.keys(localStorage)
    .filter(k => k.startsWith(PREFIX) && !GARDEES.includes(k.slice(PREFIX.length)))
    .forEach(k => localStorage.removeItem(k));
}

/* --- Échappement HTML : tout texte venu de l'extérieur (flux RSS) passe par ici
 *     avant toute insertion dans innerHTML — sécurité de base, jamais facultative. --- */
export const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* --- Dates --- */
export const fmtDate = iso => new Date(iso + 'T09:00:00+02:00').toLocaleDateString('fr-FR',
  { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fmtDateHour = iso => new Date(iso).toLocaleString('fr-FR',
  { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
export const fmtHeure = ts => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
export const fmtMonth = ym => new Date(ym + '-01T12:00:00').toLocaleDateString('fr-FR',
  { month: 'long', year: 'numeric' });
export const nomJourEdition = () => state.edition?.date
  ? JOURS[new Date(state.edition.date + 'T12:00:00').getDay()] : 'jour';

/* Numéro de semaine ISO (pour regrouper les archives) */
export function isoWeek(d) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const year = dt.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((dt - jan1) / 86400000 + 1) / 7);
  return { year, week };
}
export function weekKeyOf(dateStr) {
  const w = isoWeek(new Date(dateStr + 'T12:00:00'));
  return w.year + '-S' + String(w.week).padStart(2, '0');
}

/* --- Normalisation de texte (recherche, déduplication) --- */
export const norm = s => (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/* --- Thème --- */
export function applyTheme(t) {
  document.documentElement.dataset.theme =
    t === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
}
