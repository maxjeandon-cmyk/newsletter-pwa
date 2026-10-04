/* onglets.js — définition centrale des onglets (v59).
 * Source unique : l'ordre par défaut et les libellés des onglets vivent ici.
 * views.js (barre d'onglets) et views/reglages.js (éditeur d'ordre) la
 * consomment — ajouter un onglet ici le fait apparaître partout, sans
 * liste dupliquée à maintenir.
 */
export const ONGLETS_BASE = [
  { id: 'articles', nom: 'Articles du jour', emoji: '🔥' },
  { id: 'edition', nom: 'Édition du jour', emoji: '📄' },
  { id: 'archives', nom: 'Archives', emoji: '🗄️' },
  { id: 'medias', nom: 'Médias suivis', emoji: '🎬' },
  { id: 'climat', nom: 'Newsletters', emoji: '🗞️' },
  { id: 'lecture', nom: 'Lecture WiP', emoji: '📖' },
  { id: 'videos', nom: 'Vidéos du jour', emoji: '📺' },
  { id: 'feedback', nom: 'Feedback', emoji: '💬' },
  { id: 'reglages', nom: 'Réglages', emoji: '⚙️' }
];
