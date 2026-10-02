/* views/edition.js — 📄 Édition du jour (v17, extrait de views.js). */
import { $, state, esc, fmtDate, nomJourEdition } from '../core.js';

export function vueEdition() {
  const view = $('#view');
  if (!state.edition) { view.innerHTML = '<div class="empty">Aucune édition disponible pour l’instant.</div>'; return; }
  view.innerHTML =
    '<div class="summary-card"><h2>📄 Édition du ' + esc(nomJourEdition()) + ' — ' + esc(fmtDate(state.edition.date)) + '</h2>' +
    '<ol>' + (state.edition.resume_executif || []).map(p => '<li>' + esc(p) + '</li>').join('') + '</ol></div>' +
    '<iframe class="edition-frame" id="edition-frame" src="' + esc(state.edition.html) + '" title="Newsletter du ' + esc(nomJourEdition()) + '"></iframe>';
  const frame = $('#edition-frame');
  if (frame) frame.addEventListener('load', () => {
    try {
      const st = frame.contentDocument.createElement('style');
      st.textContent = 'table{table-layout:fixed}td,th{overflow-wrap:anywhere;word-break:break-word}td:first-child{width:70%}td:not(:first-child){width:15%}';
      frame.contentDocument.head.appendChild(st);
    } catch (e) { /* cross-origin */ }
  });
}
