/* views/feedback.js — 💬 Feedback (v31) : contribuer à la direction du site.
 * Le résumé quotidien des messages (généré par le workflow) s'affiche en haut,
 * la zone de contribution en dessous. Messages anonymes, 2000 caractères max. */
import { $, state, esc } from '../core.js';
import { envoyerFeedback, chargerResumeFeedback } from '../feedback.js';

const MSGS = {
  'court': 'Message trop court — quelques mots suffisent, mais il en faut quelques-uns. 🙂',
  'long': 'Message trop long : 2000 caractères maximum.',
  'trop-de-demandes': 'Trop de messages d\u2019un coup — patiente un instant. 🐢',
  'envoi': 'L\u2019envoi a échoué — retente dans un instant.',
  'reseau': 'Hors ligne ou réseau indisponible — retente une fois connecté.',
  'config': 'Service de feedback momentanément indisponible.'
};

export function vueFeedback() {
  const view = $('#view');
  const r = state.feedbackResume || null;
  view.innerHTML =
    '<div class="summary-card"><h2>\U0001F4AC Ta voix compte</h2>' +
    '<p class="meta-count">Ce site s\u2019améliore chaque jour grâce à ceux qui l\u2019utilisent. ' +
    'Une idée, un bug, une envie, une critique \u2014 écris-la ici : chaque message est lu et résumé ' +
    'quotidiennement pour guider la prochaine amélioration.</p></div>' +
    '<div id="fb-resume">' +
    (r
      ? '<div class="chapter-resume"><h2>\U0001F4CB Résumé de tes retours</h2>' +
        '<p class="meta-count">' + esc(r.total) + ' message(s) pris en compte \u00b7 analysé le ' + esc(r.date) + '</p>' +
        (Array.isArray(r.points) && r.points.length
          ? '<ul>' + r.points.map(p => '<li>' + esc(p) + '</li>').join('') + '</ul>'
          : '<p>Aucun nouveau message depuis le dernier résumé.</p>') +
        '</div>'
      : '') +
    '</div>' +
    '<div class="summary-card"><h2>\u2709\ufe0f Contribuer</h2>' +
    '<textarea id="fb-texte" rows="5" maxlength="2000" placeholder="Ce que tu penses, ce que tu voudrais, ce qui te g\u00eane\u2026" ' +
    'style="width:100%;box-sizing:border-box;padding:10px;background:var(--card);color:var(--text);border:1px solid var(--border);border-radius:8px;font:inherit;font-size:15px"></textarea>' +
    '<div class="form-actions"><button class="filter-btn active" id="fb-envoyer">Envoyer</button>' +
    '<span id="fb-info" class="meta-count" style="align-self:center"></span></div>' +
    '<p class="hint">Anonyme et sans donnée personnelle \u2014 juste ton message. Il rejoint le prochain résumé quotidien.</p></div>';

  const zone = $('#fb-texte');
  const info = $('#fb-info');
  $('#fb-envoyer').onclick = async () => {
    const btn = $('#fb-envoyer');
    btn.disabled = true; btn.textContent = '\u2026';
    const err = await envoyerFeedback(zone.value);
    btn.disabled = false; btn.textContent = 'Envoyer';
    if (err) {
      info.textContent = MSGS[err.erreur] || 'Erreur inconnue.';
    } else {
      zone.value = '';
      info.textContent = '\u2713 Merci \u2014 ton message est bien parti. Il sera lu et résumé ce soir.';
    }
  };

  if (!state.feedbackResume) {
    chargerResumeFeedback().then(d => {
      if (d) {
        state.feedbackResume = d;
        if (state.activeTab === 'feedback') vueFeedback();
      }
    }).catch(() => {});
  }
}
