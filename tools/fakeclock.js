/* tools/fakeclock.js — Harnas hors-ligne (charge via NODE_OPTIONS="--require ./tools/fakeclock.js").
 * Gele Date (instant fixe : 07/10/2026 15:00 UTC) et stubbe fetch pour servir
 * des flux RSS factices en dur — aucun reseau. Les scripts tools/ continuent
 * de tourner a l identique : Date.now()/new Date() constants, fetch(url)
 * renvoie le XML de FIXTURES[url] ou une erreur HTTP fixee par ECHECS[url].
 */
'use strict';
const INSTANT = Date.UTC(2026, 9, 7, 15, 0, 0);
const _Date = Date;
class DateGelee extends _Date {
  constructor(...a) { a.length ? super(...a) : super(INSTANT); }
  static now() { return INSTANT; }
}
globalThis.Date = DateGelee;
const FIXTURES = Object.create(null);
const ECHECS = Object.create(null);
function ajouterFixture(url, corps) { FIXTURES[url] = corps; }
function ajouterEchec(url, status) { ECHECS[url] = status; }
function rss(items) {
  return '<?xml version="1.0"?><rss version="2.0"><channel><title>flux</title>' +
    items.map(it =>
      '<item><title><![CDATA[' + (it.titre || '') + ']]></title>' +
      '<description><![CDATA[' + (it.desc || '') + ']]></description>' +
      '<link>' + (it.lien || 'https://exemple.fr/a') + '</link>' +
      '<pubDate>' + new _Date(INSTANT - (it.ageH || 1) * 3600000).toUTCString() + '</pubDate></item>'
    ).join('') + '</channel></rss>';
}
function atom(entries) {
  return '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">' +
    entries.map(e =>
      '<entry><title><![CDATA[' + (e.titre || '') + ']]></title>' +
      '<content type="html"><![CDATA[' + (e.desc || '') + ']]></content>' +
      '<link href="' + (e.lien || 'https://exemple.fr/e') + '"/>' +
      '<updated>' + new _Date(INSTANT - (e.ageH || 1) * 3600000).toISOString() + '</updated></entry>'
    ).join('') + '</feed>';
}
const _fetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u in ECHECS) {
    return { ok: false, status: ECHECS[u], text: async () => '', headers: new Map() };
  }
  if (u in FIXTURES) {
    return { ok: true, status: 200, text: async () => FIXTURES[u], headers: new Map() };
  }
  throw new Error('harnas : fetch inattendu vers ' + u);
};
module.exports = { ajouterFixture, ajouterEchec, rss, atom, INSTANT,
  reinitialiser() { for (const k of Object.keys(FIXTURES)) delete FIXTURES[k]; for (const k of Object.keys(ECHECS)) delete ECHECS[k]; } };
