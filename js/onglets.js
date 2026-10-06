/* onglets.js — définition centrale des onglets (v100).
 * Source unique : l'ordre par défaut et les libellés des onglets vivent ici.
 * views.js (barre d'onglets) et views/reglages.js (éditeur d'ordre) la
 * consomment — ajouter un onglet ici le fait apparaître partout, sans
 * liste dupliquée à maintenir.
 * Onglets Lecture WiP et Feedback retirés le 06/10/2026 (nettoyage voulu
 * par Maxime, on les rouvrira quand on prendra le temps de les bosser) —
 * les vues js/views/lecture.js et feedback.js restent en place, et le
 * routeur retombe sur l'édition si un client garde un ancien onglet actif.
 * v100 : ordre par défaut choisi par Maxime — Lycéens en tête, puis
 * Édition, Articles, Vidéos, Médias, Archives, Newsletters, Réglages. */
export const ONGLETS_BASE = [
  { id: 'lyceens', nom: 'Lycéens 2026', emoji: '✊' },
  { id: 'edition', nom: 'Édition du jour', emoji: '📄' },
  { id: 'articles', nom: 'Articles du jour', emoji: '🔥' },
  { id: 'videos', nom: 'Vidéos du jour', emoji: '📺' },
  { id: 'medias', nom: 'Médias suivis', emoji: '🎬' },
  { id: 'archives', nom: 'Archives', emoji: '🗄️' },
  { id: 'climat', nom: 'Newsletters', emoji: '🗞️' },
  { id: 'reglages', nom: 'Réglages', emoji: '⚙️' }
];
