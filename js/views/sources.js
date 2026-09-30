/* views/sources.js — 📚 Sources de l'édition (v17, extrait de views.js). */
import { $, state, esc, fmtDate } from '../core.js';

export function vueSources() {
  const view = $('#view');
  const src = state.edition?.sources || [];
  if (!src.length) { view.innerHTML = '<div class="empty">Sources indisponibles.</div>'; return; }
  view.innerHTML =
    '<div class="summary-card"><h2>📚 Toutes les sources de l’édition — ' + esc(fmtDate(state.edition.date)) + '</h2>' +
    '<p class="meta-count">' + src.length + ' sources · fiabilité sur 5</p></div>' +
    '<table class="sources-table"><tr><th>Source</th><th>Fiabilité</th><th>MàJ</th></tr>' +
    src.map(s => {
      const estLien = /^https?:\/\//.test(s.ref || '');
      const label = estLien
        ? '<a href="' + esc(s.ref) + '" target="_blank" rel="noopener">' + esc(s.label) + '</a>'
        : esc(s.label);
      return '<tr><td>' + label + (s.ref ? '<div class="src-ref">' + esc(s.ref) + '</div>' : '') + '</td>' +
        '<td>' + esc(s.fiabilite) + '</td><td>' + esc(s.maj) + '</td></tr>';
    }).join('') +
    '</table>';
}
