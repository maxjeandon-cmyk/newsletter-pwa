/* views/videos.js — 📺 Vidéos (v50) : mêmes règles que l'onglet Articles,
 * mais pour les vidéos YouTube des médias sélectionnés dans l'onglet Médias.
 * Le module feeds.js découvre la chaîne YouTube de chaque média visible et
 * agrège ses derniers uploads (cache TTL 20 min, clé nl.videos).
 * Un clic sur une carte lance la lecture intégrée (youtube-nocookie) —
 * le reste est identique à une carte d'article : titre · média · il y a X h. */
import { $, state, esc, fmtDateHour } from '../core.js';
import { chargerVideos } from '../feeds.js';
import { renderView } from './common.js';

/* Carte vidéo : même gabarit visuel qu'une carte article, miniature en tête */
function videoHtml(v, i) {
  const age = Math.max(0, Math.round((Date.now() - v.date.getTime()) / 3600e3));
  return '<button class="article vid-carte" data-v="' + i + '">' +
    '<img class="vid-mini" loading="lazy" alt="" src="https://i.ytimg.com/vi/' + esc(v.videoId) + '/mqdefault.jpg">' +
    '<h3>' + esc(v.titre) + '</h3><div class="meta">' + esc(v.mediaNom || '') + ' · il y a ' +
    (age < 1 ? 'moins d\u20191 h' : age + ' h') + '</div>' +
    (v.extrait ? '<div class="excerpt">' + esc(v.extrait) + '</div>' : '') +
    '</button>';
}

export function vueVideos() {
  const view = $('#view');
  const d = state.videosData || { time: 0, videos: [], ok: 0, total: 0 };
  const lecture = state.videoLecture; /* lecteur intégré prioritaire */
  if (lecture) {
    view.innerHTML =
      '<div class="chapter-resume"><h2>📺 Vidéo</h2>' +
      '<div class="vid-cadre"><iframe src="https://www.youtube-nocookie.com/embed/' +
      esc(lecture.videoId) + '?rel=0" title="Lecteur YouTube" allow="encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>' +
      '<h3 style="margin:12px 0 4px">' + esc(lecture.titre || '') + '</h3>' +
      '<div class="meta">' + esc(lecture.mediaNom || '') + '</div>' +
      '<div class="form-actions"><button class="filter-btn" id="vid-retour">← Toutes les vidéos</button></div>' +
      '</div>';
    $('#vid-retour').onclick = () => { state.videoLecture = null; renderView(); };
    return;
  }
  view.innerHTML =
    '<div class="chapter-resume"><h2>📺 Vidéos</h2>' +
    '<p class="meta-count">Dernières vidéos des médias suivis dans l\u2019onglet M\u00e9dias — lecture intégrée, un clic suffit.</p>' +
    '<p class="meta-count">' + d.ok + ' média(s) YouTube actifs sur ' + (d.total || 0) +
    ' · actualisé ' + (d.time ? esc(fmtDateHour(new Date(d.time).toISOString())) : '\u2014') + '</p></div>' +
    (d.videos.length
      ? d.videos.map(videoHtml).join('')
      : '<div class="empty">Aucune vidéo pour l\u2019instant — les chaînes YouTube des médias sont en cours de découverte, ouvre l\u2019onglet dans un instant. 📺</div>');

  chargerVideos().then(() => { if (state.activeTab === 'videos') renderView(); }).catch(() => {});

  [...document.querySelectorAll('.vid-carte')].forEach(b =>
    b.onclick = () => {
      const v = d.videos[+b.dataset.v];
      if (!v) return;
      state.videoLecture = { videoId: v.videoId, titre: v.titre, mediaNom: v.mediaNom };
      renderView();
    });
}
