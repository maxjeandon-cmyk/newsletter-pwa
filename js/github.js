/* github.js — publication des médias dans la config du site (v19).
 * « ➕ Ajouter » peut écrire directement dans data/medias.json du dépôt :
 * le média devient visible sur tous les écrans (data/ est servi network-first).
 * Sécurité : jeton d'accès GitHub fine-grained (Contents Read/Write sur CE dépôt
 * uniquement), stocké dans le localStorage de l'appareil (nl.jeton) — jamais
 * affiché à l'écran, jamais envoyé ailleurs qu'à api.github.com.
 * Renvoie des résultats doux : { ok, medias } ou { erreur } — jamais d'exception. */

import { getStore, setStore } from './core.js';

const DEPOT = 'maxjeandon-cmyk/newsletter-pwa';
const FICHIER = 'data/medias.json';
const API = 'https://api.github.com/repos/' + DEPOT + '/contents/' + FICHIER;

export const jetonPresent = () => !!getStore('jeton', '');
export function enregistrerJeton(t) { setStore('jeton', String(t || '').trim()); }
export function oublierJeton() { setStore('jeton', ''); }

/* base64 ⇄ UTF-8 : les noms de médias ont des accents et des emoji */
function versB64(texte) {
  const octets = new TextEncoder().encode(texte);
  let bin = '';
  for (let i = 0; i < octets.length; i += 2048) bin += String.fromCharCode(...octets.subarray(i, i + 2048));
  return btoa(bin);
}
function depuisB64(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const octets = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(octets);
}

/* Publication : GET (contenu + sha du fichier) → ajout → PUT.
 * Un 409 (édition concurrente) relance une fois avec un sha frais. */
export async function publierMedia(media) {
  const jeton = getStore('jeton', '');
  if (!jeton) return { erreur: 'jeton' };
  const tete = {
    Authorization: 'Bearer ' + jeton,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  try {
    for (let essai = 0; essai < 2; essai++) {
      const g = await fetch(API, { headers: tete });
      if (g.status === 401 || g.status === 403) return { erreur: 'jeton' };
      if (g.status === 404) return { erreur: 'depot' };
      if (!g.ok) return { erreur: 'reseau' };
      const f = await g.json();
      let config;
      try { config = JSON.parse(depuisB64(f.content || '')); } catch (e) { return { erreur: 'format' }; }
      const medias = Array.isArray(config.medias) ? config.medias : [];
      if (medias.some(m => m.id === media.id)) return { erreur: 'existe' };
      medias.push(media);
      const corps = JSON.stringify({ medias }, null, 2) + '\n';
      const p = await fetch(API, {
        method: 'PUT',
        headers: { ...tete, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'PWA: ajout du media ' + media.nom + (media.masque ? ' (masque par defaut)' : ''),
          content: versB64(corps),
          sha: f.sha
        })
      });
      if (p.status === 409) continue; /* sha périmé : on retente avec un fichier frais */
      if (p.status === 401 || p.status === 403) return { erreur: 'jeton' };
      if (!p.ok) return { erreur: 'reseau' };
      return { ok: true, medias };
    }
    return { erreur: 'conflit' };
  } catch (e) { return { erreur: 'reseau' }; }
}
