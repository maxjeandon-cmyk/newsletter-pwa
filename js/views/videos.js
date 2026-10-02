/* views/videos.js — 📺 Onglet Vidéo (WiP) : lecteur YouTube intégré.
 * Coller l'URL ou l'identifiant d'une vidéo (ou d'une playlist) → lecture
 * intégrée via youtube-nocookie (pas de cookies de suivi tiers).
 * L'historique des vidéos vues est une préférence locale (nl.*), jamais
 * envoyée au réseau — l'onglet reste un WiP : rien d'automatisé pour
 * l'instant, tout est saisi à la main.
 */
import { $, state, esc, getStore, setStore } from '../core.js';
import { renderView } from './common.js';

/* Extraire l'identifiant d'une vidéo ou d'une playlist depuis une saisie
 * quelconque : URL courte (youtu.be), URL watch, URL embed, ID brut. */
function parseSaisie(s) {
  const brut = (s || '').trim();
  if (!brut) return null;
  if (/^[\w-]{11}$/.test(brut)) return { video: brut };
  try {
    const u = new URL(brut.startsWith('http') ? brut : 'https://' + brut);
    if (u.hostname === 'youtu.be') return { video: u.pathname.slice(1).split('/')[0] };
    if (u.hostname.includes('youtube')) {
      const liste = u.searchParams.get('list');
      if (u.pathname.startsWith('/embed/')) {
        const id = u.pathname.split('/')[2];
        return id ? { video: id, liste } : null;
      }
      if (u.pathname.startsWith('/playlist')) return liste ? { liste } : null;
      const v = u.searchParams.get('v');
      if (v) return { video: v, liste };
    }
  } catch { /* saisie non-URL : ignorée */ }
  return null;
}

function srcLecteur(cle) {
  let src = 'https://www.youtube-nocookie.com/embed/' + cle.video;
  const params = ['rel=0'];
  if (cle.liste) params.push('list=' + encodeURIComponent(cle.liste));
  return src + '?' + params.join('&');
}

/* Historique local des vidéos regardées (max 10, identifiants uniques) */
function historique() { return getStore('videos:histo', []); }
function pousserHisto(cle) {
  const h = historique().filter(x => x.video !== cle.video || x.liste !== cle.liste);
  h.unshift(cle);
  setStore('videos:histo', h.slice(0, 10));
}

export function vueVideos() {
  const cle = state.videoLecture || null;
  const histo = historique();
  $('#view').innerHTML =
    '<div class="chapter-resume"><h2>📺 Vidéo <span class="meta-count">WiP</span></h2>' +
    '<p class="meta-count">Collez l\u2019adresse d\u2019une vidéo YouTube (ou son identifiant) pour la lire ici. ' +
    'Historique local uniquement, aucun compte requis.</p>' +
    '<form id="vid-form"><div class="vid-input">' +
    '<input type="search" id="vid-url" placeholder="https://www.youtube.com/watch?v=…" ' +
    'value="' + esc(cle ? (cle.liste && !cle.video ? 'https://www.youtube.com/playlist?list=' + cle.liste : 'https://www.youtube.com/watch?v=' + cle.video) : '') + '">' +
    '<button class="filter-btn active" type="submit">▶ Lire</button></div></form>' +
    (cle ? '<div class="vid-cadre"><iframe src="' + esc(srcLecteur(cle)) +
      '" title="Lecteur YouTube" allow="encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>'
      : '') +
    (histo.length ? '<h3 class="reco-cat">Récemment regardées</h3><ul class="reco-list">' +
      histo.map(h => '<li><button class="reco-btn" data-vid="' +
        esc((h.video || '') + '|' + (h.liste || '')) + '"><strong>▶ ' +
        esc(h.titre || (h.liste && !h.video ? 'Playlist ' + h.liste : h.video)) + '</strong>' +
        '<span>' + esc(h.liste ? 'playlist' : 'vidéo') + '</span></button></li>').join('') + '</ul>'
      : '') +
    '</div>';

  $('#vid-form').onsubmit = e => {
    e.preventDefault();
    const cle2 = parseSaisie($('#vid-url').value);
    if (!cle2) { $('#vid-url').focus(); return; }
    state.videoLecture = cle2;
    pousserHisto(cle2);
    renderView();
  };
  [...document.querySelectorAll('[data-vid]')].forEach(b =>
    b.onclick = () => {
      const [video, liste] = b.dataset.vid.split('|');
      state.videoLecture = liste && !video ? { liste } : { video, liste: liste || undefined };
      renderView();
    });
}
