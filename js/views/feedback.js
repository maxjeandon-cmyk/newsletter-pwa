/* views/feedback.js — 💬 Feedback (v86) : contribuer à la direction du site.
 * Le résumé global des messages (fusionné toutes les 6 h par le workflow,
 * watermark inclus) s'affiche en haut : comptages, intentions, thèmes et
 * demandes en attente. Entre ce résumé et l'encart de contribution, la liste
 * des « mises en place » — les demandes réalisées quittent d'elles-mêmes
 * le résumé au fur et à mesure. Messages anonymes, 2000 caractères max.
 * Transition : ancien format (r.points) encore affiché si présent. */
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

/* Intentions comptées par la maintenance (clés plurielles de tools/feedback.js). */
const INTENTIONS = [
  ['problemes', '🛠️ problème(s)'],
  ['demandes', '🙋 demande(s)'],
  ['satisfactions', '😍 satisfaction(s)'],
  ['questions', '❓ question(s)']
];

function blocResume(r) {
  const lignes = [];
  lignes.push('<div class="chapter-resume"><h2>📊 Résumé de tes retours</h2>');
  lignes.push('<p class="meta-count">' + esc(r.total) + ' message(s) pris en compte · analysé le ' +
    esc(r.date) + (r.heure ? ' à ' + esc(r.heure) : '') + '</p>');
  /* Intentions cumulées (seulement celles non nulles). */
  if (r.intentions && typeof r.intentions === 'object') {
    const intents = INTENTIONS
      .filter(([k]) => r.intentions[k])
      .map(([k, label]) => esc(r.intentions[k]) + ' ' + label);
    if (intents.length) lignes.push('<p class="meta-count">' + intents.join(' · ') + '</p>');
  }
  /* Thèmes fusionnés (nouveau format) ou points (ancien format, transition ≤ 6 h). */
  if (Array.isArray(r.themes) && r.themes.length) {
    lignes.push('<ul>' + r.themes.map(t =>
      '<li>' + esc(t.label) + ' — ' + esc(t.messages) + ' message(s)</li>').join('') + '</ul>');
  } else if (Array.isArray(r.points) && r.points.length) {
    lignes.push('<ul>' + r.points.map(p => '<li>' + esc(p) + '</li>').join('') + '</ul>');
  } else if (!r.total) {
    lignes.push('<p>Aucun message pour l\u2019instant — le premier nourrira ce résumé. 🌱</p>');
  }
  /* Demandes encore en attente : elles quittent cette liste une fois réalisées. */
  if (Array.isArray(r.en_attente) && r.en_attente.length) {
    lignes.push('<h3>⏳ Demandes en attente</h3><ul>' + r.en_attente.map(d =>
      '<li>' + esc(d.texte) +
      (d.messages > 1 ? ' <span class="meta-count">(' + esc(d.messages) + ' message(s) depuis le ' + esc(d.depuis) + ')</span>' : '') +
      '</li>').join('') + '</ul>');
  }
  lignes.push('</div>');
  return lignes.join('');
}

/* Modifications demandées puis mises en place : entre le résumé et
 * l'encart de contribution. Chaque demande y arrive dès qu'un commit
 * la réalise (rapprochement automatique) — plus les 10 plus récentes. */
const MAX_MONTREES = 10;

function blocMisesEnPlace(r) {
  const liste = Array.isArray(r.mises_en_place) ? r.mises_en_place : [];
  if (!liste.length) return '';
  const montrees = liste.slice(0, MAX_MONTREES);
  const lignes = [];
  lignes.push('<div class="chapter-resume"><h2>✅ Mis en place grâce à tes retours</h2>');
  lignes.push('<ul>' + montrees.map(m =>
    '<li>' + esc(m.texte) +
    '<p class="meta-count">demandé le ' + esc(m.depuis) + ' · réalisé le ' + esc(m.realise) +
    (m.rappels ? ' · ' + esc(m.rappels) + ' rappel(s)' : '') + '</p>' +
    (m.via ? '<p class="hint">via ' + esc(m.via) + '</p>' : '') +
    '</li>').join('') + '</ul>');
  if (liste.length > montrees.length) {
    lignes.push('<p class="hint">… et ' + (liste.length - montrees.length) +
      ' autre(s) modification(s) plus anciennes.</p>');
  }
  lignes.push('</div>');
  return lignes.join('');
}

export function vueFeedback() {
  const view = $('#view');
  const r = state.feedbackResume || null;
  view.innerHTML =
    '<div class="summary-card"><h2>💬 Ta voix compte</h2>' +
    '<p class="meta-count">Ce site s\u2019améliore chaque jour grâce à ceux qui l\u2019utilisent. ' +
    'Une idée, un bug, une envie, une critique — écris-la ici : chaque message est lu, fusionné ' +
    'dans le résumé toutes les 6 h, et les demandes sont suivies jusqu\u2019à leur mise en place.</p></div>' +
    '<div id="fb-resume">' +
    (r ? blocResume(r) + blocMisesEnPlace(r) : '') +
    '</div>' +
    '<div class="summary-card"><h2>✉️ Contribuer</h2>' +
    '<textarea id="fb-texte" rows="5" maxlength="2000" placeholder="Ce que tu penses, ce que tu voudrais, ce qui te gêne…" ' +
    'style="width:100%;box-sizing:border-box;padding:10px;background:var(--card);color:var(--text);border:1px solid var(--border);border-radius:8px;font:inherit;font-size:15px"></textarea>' +
    '<div class="form-actions"><button class="filter-btn active" id="fb-envoyer">Envoyer</button>' +
    '<span id="fb-info" class="meta-count" style="align-self:center"></span></div>' +
    '<p class="hint">Anonyme et sans donnée personnelle — juste ton message. Il rejoint le prochain résumé (toutes les 6 h).</p></div>';

  const zone = $('#fb-texte');
  const info = $('#fb-info');
  $('#fb-envoyer').onclick = async () => {
    const btn = $('#fb-envoyer');
    btn.disabled = true; btn.textContent = '…';
    const err = await envoyerFeedback(zone.value);
    btn.disabled = false; btn.textContent = 'Envoyer';
    if (err) {
      info.textContent = MSGS[err.erreur] || 'Erreur inconnue.';
    } else {
      zone.value = '';
      info.textContent = '✓ Merci — ton message est bien parti. Il sera lu et fusionné dans les 6 h.';
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
