/* tools/titres.js — Nettoyage des titres de presse (v109, lot 1).
 * Utilitaire partage, pur, sans I/O ni dependance :
 *   - nettoyerTitre(t) : retire les prefixes editoriaux des titres RSS
 *     (« EN DIRECT - », « DIRECT. », « SONDAGE - », « FORUM BFMTV - »...),
 *     liste extensible, comparaison insensible a la casse, espaces normalises.
 *   - Le nettoyage s'applique UNIQUEMENT au moment de l'assemblage visible
 *     (paragraphes de la chronique, faits) — jamais sur la signature de
 *     dedoublonnage, qui reste calculee sur le titre brut pour ne pas casser
 *     l'idempotence des releveSigs.
 */
'use strict';

const PREFIXES = [
  'en direct -', 'en direct.', 'en direct :', 'en direct,',
  'direct -', 'direct.', 'direct :', 'direct,',
  'le direct -', 'le direct.',
  'sondage -', 'sondage :', 'sondage.',
  'forum bfmtv -', 'forum bfmtv :',
  'grand entretien -', 'revue de presse -', 'edition speciale -',
  'exclusif -', 'exclusive -', 'alerte -', 'urgent -', 'breaking -',
  'live -', 'direct info -', 'analyse -', 'decryptage -', 'decryptage :',
  'video -', 'info -', 'actu -', 'le fil -', 'suivez -'
];

function nettoyerTitre(t) {
  let s = String(t || '').replace(/\s+/g, ' ').trim();
  let bouge = true;
  while (bouge) {
    bouge = false;
    const bas = s.toLowerCase();
    for (const p of PREFIXES) {
      if (bas.startsWith(p) && s.length > p.length) {
        s = s.slice(p.length).replace(/^[\s\-–—:,.]+/, '').replace(/\s+/g, ' ').trim();
        bouge = true;
        break;
      }
    }
  }
  return s;
}

module.exports = { nettoyerTitre, PREFIXES };
