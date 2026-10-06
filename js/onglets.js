/* onglets.js — définition centrale des onglets (v93).
 * Source unique : l'ordre par défaut et les libellés des onglets vivent ici.
 * views.js (barre d'onglets) et views/reglages.js (éditeur d'ordre) la
 * consomment — ajouter un onglet ici le fait apparaître partout, sans
 * liste dupliquée à maintenir.
 * Onglets Lecture WiP et Feedback retirés le 06/10/2026 (nettoyage voulu
 * par Maxime, on les rouvrira quand on prendra le temps de les bosser) —
 * les vues js/views/lecture.js et feedback.js restent en place, et le
 * routeur retombe sur l'édition si un client garde un ancien onglet actif.
 */
export const ONGLETS_BASE = [
  { id: 'articles', nom: 'Articles du jour', emoji: '🔥' },
  { id: 'edition', nom: 'Édition du jour', emoji: '📄' },
  { id: 'archives', nom: 'Archives', emoji: '🗄️' },
  { id: 'medias', nom: 'Médias suivis', emoji: '🎬' },
  { id: 'climat', nom: 'Newsletters', emoji: '🗞️' },
  { id: 'videos', nom: 'Vidéos du jour', emoji: '📺' },
  { id: 'lyceens', nom: 'Lycéens 2026', emoji: '✊' },
  { id: 'reglages', nom: 'Réglages', emoji: '⚙️' }
];
