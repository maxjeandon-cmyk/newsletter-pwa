/* views/climat.js — 🌡️ Climat : dernier bulletin Copernicus (v17, extrait de views.js). */
import { $, state, esc } from '../core.js';

export function vueClimat() {
  const view = $('#view');
  const c = state.climat;
  if (!c || !c.titre) {
    view.innerHTML = '<div class="empty">Bulletin climatique indisponible pour l’instant — il reviendra dès que data/climat.json répondra. 🌱</div>';
    return;
  }
  view.innerHTML =
    '<div class="summary-card"><h2>🌡️ ' + esc(c.titre) + '</h2>' +
    '<p class="meta-count">' + esc(c.source || '') + (c.periode ? ' · ' + esc(c.periode) : '') + '</p>' +
    (c.resume ? '<p>' + esc(c.resume) + '</p>' : '') + '</div>' +
    (c.points?.length
      ? '<div class="summary-card"><h2>Ce que dit le bulletin</h2><ul>' +
        c.points.map(p => '<li>' + esc(p) + '</li>').join('') + '</ul></div>'
      : '') +
    '<div class="form-actions">' +
    '<a class="filter-btn active" href="' + esc(c.lien || '#') + '" target="_blank" rel="noopener">📄 Lire le rapport Copernicus</a>' +
    (c.lien_rapport ? '<a class="filter-btn" href="' + esc(c.lien_rapport) + '" target="_blank" rel="noopener">Tous les bulletins</a>' : '') +
    '</div>' +
    '<p class="hint">Mis à jour le ' + esc(c.maj || '?') + ' — le bulletin mensuel Copernicus paraît vers le 10 de chaque mois ; cet onglet est rafraîchi par la maintenance quotidienne.</p>';
}
