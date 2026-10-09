/* views/edition.js — 📄 Édition du jour (v17, extrait de views.js).
 * v97 : plus de carte « 5 points du jour » au-dessus de l’édition — l’édition
 * HTML commence déjà par le résumé exécutif, c’était redondant.
 * v98 : intro météo du jour au-dessus de l’édition — ville choisie dans
 * Réglages → 📍 Localisation météo (Open-Meteo, sans clé).
 * v118 (demande de Maxime du 09/10/2026 — « sortir les chapitres de la
 * Newsletter de l’encart News, fini le Canvas dans Canvas ») : fini l’iframe,
 * l’édition du jour est rendue NATIVEMENT dans la page. L’encart News garde
 * le titre, l’intro et le résumé exécutif ; les chapitres déroulants vivent
 * en dessous, en cartes natives comme tout le site ; la table des sources
 * reste repliée derrière son bouton. Le <script> de l’édition n’est JAMAIS
 * injecté : les boutons btn-partage sont câblés ici (même texte de partage
 * que le script des éditions), les btn-replier relèvent de la délégation
 * globale v115 de common.js (même classe, même geste) ; les styles du
 * squelette des éditions (stables, format.md) sont portés dans styles.css
 * scopés sous .edition-native — la CSP (style-src 'self') interdit d’injecter
 * la feuille <style> de l’édition en inline. Le lien profond #edition?c=<id>
 * (partage v96) ouvre le chapitre natif et y défile. Anciennes éditions sans
 * chapitres déroulants (avant le 06/10/2026, jamais « l’édition du jour »
 * depuis) : tout le corps vit dans l’encart, rien en dessous — jamais de crash. */
import { $, state, esc } from '../core.js';
import { chargerMeteo, villeMeteo } from '../meteo.js';

/* Intro météo : une ligne discrète, vide si aucune ville n'est choisie. */
function afficherMeteo() {
  const el = $('#meteo-intro');
  if (!el) return;
  const v = villeMeteo();
  if (!v) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = '🔎 Météo du jour en cours…';
  chargerMeteo().then(d => {
    if (!d) { el.innerHTML = '📍 <strong>Météo du jour</strong> — ' + esc(v.nom) + ' : momentanément indisponible.'; return; }
    el.innerHTML = d.emoji + ' <strong>' + esc(d.ville) + '</strong> · <strong>météo du jour</strong> : ' + d.temp + '°, ' + esc(d.desc) +
      ' · max ' + d.max + '° / min ' + d.min + '° · vent ' + d.vent + ' km/h' +
      (d.tendance ? ' · journée : ' + esc(d.tendance) : '') +
      ' <span class="hint">météo du jour (l\'édition est celle de la veille) · actualisée à ' + d.heure + '</span>';
  }).catch(() => { el.hidden = true; });
}

/* Découpe du corps de l’édition (pure, testée par tools/test/edition-native.js) :
 * le <script> est retiré (jamais injecté), l’encart = tout ce qui précède le
 * premier chapitre déroulant (titre, intro, résumé exécutif), le reste =
 * chapitres + notes de sources. Édition sans chapitres déroulants (avant le
 * 06/10/2026) : tout dans l’encart, rien en dessous. */
export function decouperEdition(html) {
  const corps = (html.split(/<body[^>]*>/)[1] || '').split('</body>')[0]
    .replace(/<script[\s\S]*?<\/script>/g, '');
  const coupe = corps.search(/<details[^>]*class="chapitre"/);
  return {
    entete: coupe === -1 ? corps : corps.slice(0, coupe),
    reste: coupe === -1 ? '' : corps.slice(coupe),
  };
}

export async function vueEdition() {
  const view = $('#view');
  if (!state.edition) { view.innerHTML = '<div class="empty">Aucune édition disponible pour l’instant.</div>'; return; }
  view.innerHTML =
    '<div id="meteo-intro" class="meteo-intro" hidden></div>' +
    '<div id="edition-native" class="edition-native"><div class="empty">Chargement de l’édition…</div></div>';
  afficherMeteo();
  const conteneur = $('#edition-native');
  let html = '';
  try {
    html = await (await fetch(state.edition.html, { cache: 'no-store' })).text();
  } catch (e) { /* réseau muet — message ci-dessous */ }
  if (!conteneur || !conteneur.isConnected) return; /* la vue a été re-rendue entre-temps */
  if (!html) {
    conteneur.innerHTML = '<div class="empty">Édition momentanément indisponible — ⟳ pour retenter dans un instant. 🌱</div>';
    return;
  }
  const dec = decouperEdition(html);
  conteneur.innerHTML =
    '<div class="summary-card edition-encart">' + dec.entete + '</div>' +
    dec.reste;
  /* Table des sources : première ligne en <thead> (visible au défilement du
   * bloc) et repli derrière le bouton — même UX que l’ancienne iframe. */
  const tbl = conteneur.querySelector('table');
  if (tbl) {
    tbl.classList.add('table-sources');
    const tr = tbl.querySelector('tr');
    if (tr) {
      const tete = document.createElement('thead');
      tbl.insertBefore(tete, tbl.firstChild);
      tete.appendChild(tr);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-sources';
    btn.textContent = '▼ Afficher toutes les sources';
    btn.addEventListener('click', () => { tbl.classList.remove('table-sources'); btn.remove(); });
    tbl.after(btn);
  }
  /* Partage par chapitre (v96) : même texte que le script de l’édition, câblé
   * nativement — l’URL profonde reste le lien canonique du site. */
  [...conteneur.querySelectorAll('.btn-partage')].forEach(b => {
    b.addEventListener('click', () => {
      const url = 'https://diyeah24.fr/#edition?c=' + b.dataset.id;
      const texte = b.dataset.titre + ' — ' + b.dataset.resume;
      if (navigator.share) { navigator.share({ title: 'DiY/H24', text: texte, url: url }).catch(() => {}); return; }
      const ok = () => { b.textContent = '✅'; setTimeout(() => { b.textContent = '🔗 Partager'; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texte + ' ' + url).then(ok, ok);
      else if (window.prompt) window.prompt('Lien :', url);
    });
  });
  /* Lien profond #edition?c=<id> (partage v96) : ouvrir le chapitre visé et
   * y défiler — le bloc porte id="c-<id>" dans le HTML généré. */
  if (state.editionChapitre) {
    const cible = document.getElementById('c-' + state.editionChapitre);
    if (cible) {
      cible.open = true;
      cible.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}
