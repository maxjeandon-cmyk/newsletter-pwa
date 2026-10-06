/* views/edition.js — 📄 Édition du jour (v17, extrait de views.js).
 * v97 : plus de carte « 5 points du jour » au-dessus de l'iframe — l'édition
 * HTML commence déjà par le résumé exécutif, c'était redondant. */
import { $, state, esc, nomJourEdition } from '../core.js';

export function vueEdition() {
  const view = $('#view');
  if (!state.edition) { view.innerHTML = '<div class="empty">Aucune édition disponible pour l’instant.</div>'; return; }
  view.innerHTML =
    '<iframe class="edition-frame" id="edition-frame" src="' + esc(state.edition.html) + '" title="Newsletter du ' + esc(nomJourEdition()) + '"></iframe>';
  const frame = $('#edition-frame');
  if (frame) frame.addEventListener('load', () => {
    try {
      const st = frame.contentDocument.createElement('style');
      st.textContent = 'table{table-layout:fixed;max-height:520px;overflow-y:auto;display:block}td,th{overflow-wrap:anywhere;word-break:break-word}td:first-child{width:70%}td:not(:first-child){width:15%}';
      frame.contentDocument.head.appendChild(st);
      const tbl = frame.contentDocument.querySelector('table');
      const head = frame.contentDocument.createElement('thead');
      const tr = tbl && tbl.rows[0];
      if (tbl && tr) {
        head.appendChild(tr);
        tbl.insertBefore(head, tbl.firstChild);
      }
      const btn = frame.contentDocument.createElement('button');
      btn.type = 'button';
      btn.textContent = '\u25bc Afficher toutes les sources';
      btn.setAttribute('style', 'display:block;width:100%;box-sizing:border-box;margin:12px 0;padding:10px;background:#1a1a22;color:#e8e8ec;border:1px solid #333;border-radius:8px;font:inherit;cursor:pointer');
      btn.addEventListener('click', () => {
        tbl.style.maxHeight = '';
        tbl.style.overflowY = '';
        btn.remove();
      });
      if (tbl) tbl.after(btn);
      /* v96 : lien profond #edition?c=<id> — l'édition s'ouvre sur le chapitre
       * partagé (les blocs déroulants portent id="c-<id>" dans le HTML généré). */
      if (state.editionChapitre) {
        const cible = frame.contentDocument.getElementById('c-' + state.editionChapitre);
        if (cible) {
          if (cible.open === false) cible.open = true;
          cible.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    } catch (e) { /* cross-origin */ }
  });
}
