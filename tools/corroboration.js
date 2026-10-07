/* tools/corroboration.js — Moteur de corroboration partage (v111, lot 3).
 * Pur, sans I/O ni dependance :
 *   - corroborer(evenement) -> { nbSources, verifie: nbSources >= 2 }
 *     sur les sources distinctes (deja fusionnees par le rapprochement
 *     d evenements) ; une source presse compte une fois, quelle que soit
 *     la forme sous laquelle elle apparait.
 *   - marquer(items) -> ajoute verifie/nbSources a chaque item.
 * Le seuil (>= 2 medias distincts) est la garantie de veracite du
 * dispositif : une info a une seule source reste une piste, pas un fait.
 */
'use strict';

function corroborer(evenement) {
  const sources = evenement && Array.isArray(evenement.sources)
    ? evenement.sources
    : evenement && typeof evenement.source === 'string' && evenement.source
      ? [evenement.source]
      : [];
  const distinctes = [...new Set(sources.map(s => String(s).trim()).filter(Boolean))];
  const nbSources = distinctes.length;
  return { nbSources, verifie: nbSources >= 2 };
}

function marquer(items) {
  for (const it of (items || [])) {
    const { nbSources, verifie } = corroborer(it);
    it.nbSources = nbSources;
    it.verifie = verifie;
  }
  return items;
}

module.exports = { corroborer, marquer };
