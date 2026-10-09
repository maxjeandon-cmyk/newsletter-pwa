/* views/newsletters.js — 🗞️ Newsletters (v85) : Bulletin Copernicus
 * et lettres d’information des grandes ONG. Chaque source vit dans une carte
 * repliable (<details> natifs, même accordéons que Réglages) pour économiser
 * l’espace ; l’abonnement se fait sur le site de chaque organisation.
 * Données : Copernicus = data/climat.json (maintenance quotidienne), ONG =
 * data/newsletters.json (network-first — modifier les données suffit, sans
 * livraison de code). Règle d’hygiène : tout texte des données passe par esc(). */
import { $, state, esc } from '../core.js';
import { boutonReplier } from './common.js';

/* Chargement paresseux, en cache dans state après le premier passage. */
async function chargerNewsletters() {
  if (!state.newsletters) {
    try { state.newsletters = await (await fetch('data/newsletters.json', { cache: 'no-store' })).json(); }
    catch (e) { state.newsletters = { organisations: [], erreur: true }; }
  }
  return state.newsletters;
}

/* ————— Bulletin Copernicus : même contenu que l’ancien onglet Climat ————— */
function carteCopernicus() {
  const c = state.climat;
  if (!c || !c.titre) return '';
  return '<details class="carte-regl"><summary>🌡️ Bulletin Copernicus</summary>' +
    '<p class="meta-count">' + esc(c.titre) + (c.source ? ' · ' + esc(c.source) : '') + (c.periode ? ' · ' + esc(c.periode) : '') + '</p>' +
    (c.resume ? '<p>' + esc(c.resume) + '</p>' : '') +
    (c.points?.length
      ? '<ul>' + c.points.map(p => '<li>' + esc(p) + '</li>').join('') + '</ul>'
      : '') +
    '<div class="form-actions">' +
    '<a class="filter-btn active" href="' + esc(c.lien || '#') + '" target="_blank" rel="noopener">📄 Lire le rapport Copernicus</a>' +
    (c.lien_rapport ? '<a class="filter-btn" href="' + esc(c.lien_rapport) + '" target="_blank" rel="noopener">Tous les bulletins</a>' : '') +
    '</div>' +
    '<p class="hint">Mis à jour le ' + esc(c.maj || '?') + ' — le bulletin mensuel Copernicus paraît vers le 10 de chaque mois ; rafraîchi par la maintenance quotidienne.</p>' +
    boutonReplier() +
    '</details>';
}

/* ————— Une ONG, une carte repliable construite comme le bulletin Copernicus ————— */
function carteOng(o) {
  return '<details class="carte-regl"><summary>' + esc(o.emoji || '🗞️') + ' ' + esc(o.nom || o.id) +
    (o.theme ? ' <span class="meta-count">' + esc(o.theme) + '</span>' : '') +
    '</summary>' +
    (o.frequence ? '<p class="meta-count">Fréquence : ' + esc(o.frequence) + '</p>' : '') +
    (o.description ? '<p>' + esc(o.description) + '</p>' : '') +
    (o.derniere
      ? '<p class="meta-count">🗞️ Dernière édition en ligne — relevé du ' + esc(o.derniere.releve || '?') + '</p>' +
        (o.derniere.points?.length
          ? '<ul>' + o.derniere.points.map(p => '<li>' + esc(p) + '</li>').join('') + '</ul>'
          : '')
      : '') +
    '<div class="form-actions">' +
    (o.lien ? '<a class="filter-btn active" href="' + esc(o.lien) + '" target="_blank" rel="noopener">✉️ ' + esc(o.libelle || 'S’abonner') + '</a>' : '') +
    (o.lien_autre ? '<a class="filter-btn" href="' + esc(o.lien_autre) + '" target="_blank" rel="noopener">' + esc(o.libelle_autre || 'En savoir plus') + '</a>' : '') +
    (o.lien_actu ? '<a class="filter-btn" href="' + esc(o.lien_actu) + '" target="_blank" rel="noopener">📰 Lire l’actualité du site</a>' : '') +
    '</div>' +
    boutonReplier() +
    '</details>';
}

/* ————— Vue de l’onglet Newsletters (id « climat », inchangé) ————— */
export function vueNewsletters() {
  const view = $('#view');
  const d = state.newsletters;
  const ong = (d && Array.isArray(d.organisations)) ? d.organisations : [];
  view.innerHTML =
    '<div class="summary-card"><h2>🗞️ Newsletters</h2>' +
    '<p class="meta-count">' + esc((d && d.intro) || 'Les lettres d’information des grandes ONG et le bulletin climatique Copernicus. Chaque carte se déplie à la demande.') + '</p>' +
    ((d && d.note_releve) ? '<p class="hint">📌 ' + esc(d.note_releve) + '</p>' : '') +
    '</div>' +
    carteCopernicus() +
    (d && d.erreur
      ? '<div class="empty">Lettres des ONG momentanément indisponibles — elles reviennent dès que data/newsletters.json répondra.</div>'
      : '') +
    ong.map(carteOng).join('') +
    (!d
      ? '<div class="empty">Chargement des lettres d’information…</div>'
      : '');
  if (!d) {
    chargerNewsletters()
      .then(() => { if (state.activeTab === 'climat') vueNewsletters(); })
      .catch(() => {});
  }
}
