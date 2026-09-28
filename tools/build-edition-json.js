#!/usr/bin/env node
/* build-edition-json.js — Génère le JSON d'édition depuis le HTML de la newsletter.
 * Usage : node tools/build-edition-json.js <edition.html> <date YYYY-MM-DD> [out.json]
 * Schéma du format.md : resume_executif (5 points), chapitres (ordre imposé, résumé extrait du HTML), sources.
 */
'use strict';
const fs = require('fs');

const IDS = ['intelligence-artificielle','jeu-video-pop-culture','culture','sciences','climat','politique-francaise','etats-unis','chine','russie','geopolitique','grande-info-semaine'];
const NOMS = ['Intelligence artificielle','Jeu vidéo & pop culture','Culture','Sciences','Climat','Politique française','États-Unis','Chine','Russie','Géopolitique mondiale','Grande information de la semaine'];
const EMOJIS = ['🤖','🎮','🎭','🔬','🌍','🇫🇷','🇺🇸','🇨🇳','🇷🇺','🌐','📰'];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resumeDeChapitre(html, i) {
  const re = new RegExp('<h2>\\d+\\.\\s*[^<]*' + escapeRe(NOMS[i]) + '\\s*</h2>([\\s\\S]*?)(?=<hr>|<h2>|$)');
  const m = html.match(re);
  if (!m) return '';
  const bloc = m[1];
  const p = bloc.match(/<p>([\s\S]*?)<\/p>/) || bloc.match(/<li>([\s\S]*?)<\/li>/);
  if (!p) return '';
  return p[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 400);
}

function build(html, date) {
  const reSection = html.split('<h2>Résumé exécutif</h2>')[1] || '';
  const corpsResume = reSection.split('<hr>')[0];
  const points = [...corpsResume.matchAll(/<p><strong>\d+\.\s*<strong>(.*?)<\/strong>(.*?)<\/strong><\/p>/gs)].map(m =>
    (m[1] + ' :' + m[2]).replace(/<[^>]+>/g, '').replace(/\s*:\s*:\s*/, ' : ').replace(/\s+/g, ' ').trim());
  const sources = [...html.matchAll(/<tr><td>(.*?)<\/td><td>(\d)\/5<\/td><td>(.*?)<\/td><\/tr>/g)].map(m => {
    let label = m[1].replace(/<[^>]+>/g, '').trim();
    const urlM = label.match(/\((https?:\/\/[^)]+)\)/);
    if (urlM) label = label.replace(/\s*\([^)]*\)\s*$/, '').trim();
    return { label, ref: urlM ? urlM[1] : '', fiabilite: parseInt(m[2], 10), maj: m[3] };
  });
  const chapitres = IDS.map((id, i) => ({ id, emoji: EMOJIS[i], nom: NOMS[i], resume: resumeDeChapitre(html, i) }));
  return { date, genere_le: new Date().toISOString(), html: 'editions/' + date + '.html', resume_executif: points, chapitres, sources };
}

const [htmlPath, date, outPath] = process.argv.slice(2);
if (!htmlPath || !date) {
  console.error('Usage: node tools/build-edition-json.js <edition.html> <date> [out.json]');
  process.exit(2);
}
const j = build(fs.readFileSync(htmlPath, 'utf8'), date);
fs.writeFileSync(outPath || 'editions/' + date + '.json', JSON.stringify(j, null, 2));
console.log('JSON écrit : ' + (outPath || 'editions/' + date + '.json') + ' — ' + j.resume_executif.length + ' points, ' + j.chapitres.filter(c => c.resume).length + '/11 résumés, ' + j.sources.length + ' sources.');
if (j.resume_executif.length !== 5) { console.error('ATTENTION : résumé exécutif != 5 points.'); process.exit(1); }
if (j.chapitres.some(c => !c.resume)) { console.error('ATTENTION : au moins un résumé de chapitre est vide.'); process.exit(1); }
