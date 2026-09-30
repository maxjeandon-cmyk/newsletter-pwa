/* views/articles.js — 🔥 Articles d'aujourd'hui (v17, extrait de views.js). */
import { $, state, esc, getStore, setStore, fmtDateHour } from '../core.js';
import { estAFP } from '../feeds.js';
import { articleHtml, generationTime } from './common.js';
import { renderView } from './common.js';

export function vueArticles() {
  const view = $('#view');
  const gen = generationTime();
  const tous = (state.feed.articles || []).filter(a => a.date.getTime() > gen);
  const afpOnly = getStore('afpOnly', false);
  const arts = afpOnly ? tous.filter(estAFP) : tous;
  view.innerHTML =
    '<div class="chapter-resume"><h2>🔥 Articles d’aujourd’hui</h2>' +
    '<p class="meta-count">Articles parus après la génération de l’édition (' +
    esc(fmtDateHour(state.edition?.genere_le ?? new Date().toISOString())) + ') · toutes rubriques confondues · ' +
    state.feedStats.ok + '/' + state.feedStats.total + ' flux actifs. L’essentiel du jour est dans l’Édition.</p>' +
    '<button class="filter-btn' + (afpOnly ? ' active' : '') + '" id="btn-afp">📡 Dépêches AFP uniquement</button></div>' +
    (arts.length ? arts.map(articleHtml).join('')
      : '<div class="empty">' + (afpOnly
        ? 'Aucune dépêche AFP repérée depuis la génération de l’édition pour l’instant — retente dans un instant. 🌱'
        : 'Rien de neuf depuis la génération de l’édition — c’est plutôt bon signe. 🌙') + '</div>');
  const bAfp = $('#btn-afp');
  if (bAfp) bAfp.onclick = () => { setStore('afpOnly', !afpOnly); renderView(); };
}
