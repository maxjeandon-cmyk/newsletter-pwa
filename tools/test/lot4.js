/* tools/test/lot4.js — Harnas du lot 4 (v112) : resumes d'edition plus riches.
 * Regression sur fixtures reelles (editions/2026-10-06 v15, 2026-09-27 historique),
 * enchainement des <p> courts, regle date-aware >= 120 dans validate-edition.js.
 * Usage : node tools/test/lot4.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const RACINE = path.join(__dirname, '..', '..');
let ok = 0, ko = 0;
function t(nom, cond, detail) {
  if (cond) { ok++; console.log('  ok  ' + nom); }
  else { ko++; console.log('KO !!  ' + nom + (detail ? ' — ' + detail : '')); }
}
function run(cmd, args) {
  return execFileSync(process.execPath, cmd, { cwd: RACINE, encoding: 'utf8', args });
}

/* ——— 1. Fixture v15 reelle : editions/2026-10-06 ——— */
console.log('— regression : edition v15 reelle du 06/10/2026');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lot4-'));
const OUT = path.join(TMP, '1006.json');
execFileSync(process.execPath, ['tools/build-edition-json.js', 'editions/2026-10-06.html', '2026-10-06', OUT], { cwd: RACINE, encoding: 'utf8' });
const regen = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const orig = JSON.parse(fs.readFileSync(path.join(RACINE, 'editions', '2026-10-06.json'), 'utf8'));
t('14 chapitres extraits', regen.chapitres.length === 14);
t('tous les resumes non vides', regen.chapitres.every(c => c.resume.length > 30));
let memes = 0, coupesPropres = 0;
orig.chapitres.forEach((c, i) => {
  const r = regen.chapitres[i].resume;
  if (r === c.resume) memes++;
  else if (r.startsWith(c.resume.slice(0, 60)) && r.length >= 180) coupesPropres++;
});
t('resumes extraits a l identique ou coupe propre (prefixe conserve)',
  memes + coupesPropres === 14, 'identiques=' + memes + ' coupesPropres=' + coupesPropres);
t('tout resume long reste >= 300 caracteres', regen.chapitres.every(c => c.resume.length < 400 || c.resume.length >= 300));
t('re-execution deterministe : 2e run identique', (() => {
  const OUT2 = path.join(TMP, '1006b.json');
  execFileSync(process.execPath, ['tools/build-edition-json.js', 'editions/2026-10-06.html', '2026-10-06', OUT2], { cwd: RACINE, encoding: 'utf8' });
  const a = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const b = JSON.parse(fs.readFileSync(OUT2, 'utf8'));
  delete a.genere_le; delete b.genere_le;
  return JSON.stringify(a) === JSON.stringify(b);
})());

/* ——— 2. Enchainement : <p> court puis <p> suivant ——— */
console.log('— enchainement des <p> courts');
const src = fs.readFileSync(path.join(RACINE, 'tools', 'build-edition-json.js'), 'utf8');
const m = src.match(/function resumeDeChapitre\(html, nom, id, v15\) \{([\s\S]*?)\n\}/);
const fn = new Function('escapeRe', 'AP', 'return function resumeDeChapitre(html,nom,id,v15){' + m[1] + '}');
const AP = "['\u2019]";
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const r = fn(escapeRe, AP);
const HTML_COURT = '<details open id="c-intelligence-artificielle"><summary>IA</summary><p>OpenAI leve 40 milliards de dollars.</p><p>La valorisation atteint 350 milliards, un record historique pour une entreprise privee de l intelligence artificielle, et le tour de table confirme la position dominante du laboratoire.</p></details><details open id="c-spatial">NEXT</details>';
const res = r(HTML_COURT, 'Intelligence artificielle', 'intelligence-artificielle', true);
t('<p> court enchaîne jusqu a >= 180', res.length >= 180, 'len=' + res.length);
t('commence par le premier <p>', res.startsWith('OpenAI leve'));
t('jamais coupe en plein milieu d un mot (borne 400)', (() => {
  const long = '<details open id="c-x"><p>' + 'motif repetitif tres long pour tester la coupe propre. '.repeat(20) + '</p></details>';
  const out = r(long, 'X', 'x', true);
  return out.length <= 401 && (out.endsWith('…') || out.length <= 400);
})());

/* ——— 3. validate-edition.js : regle date-aware ——— */
console.log('— validation : regle date-aware >= 120 a partir du 2026-10-08');
const V = path.join(RACINE, 'tools', 'validate-edition.js');
/* editions reelles anterieures au 08/10 : toujours valides (regle historique) */
const r27 = execFileSync(process.execPath, [V, 'editions/2026-09-28.json'], { cwd: RACINE, encoding: 'utf8' });
t('edition historique 28/09 : conforme', r27.includes('publication valid\u00e9e') || r27.includes('conforme'));
const r06 = execFileSync(process.execPath, [V, 'editions/2026-10-06.json'], { cwd: RACINE, encoding: 'utf8' });
t('edition v15 06/10 (anterieure au 08/10) : conforme', r06.includes('publication validée'));
/* JSON synthetique date 2026-10-08 avec resume de 80 caracteres : doit echouer */
const court = JSON.parse(JSON.stringify(orig));
court.date = '2026-10-08';
court.chapitres.forEach(c => { c.resume = c.resume.slice(0, 80); });
const P_COURT = path.join(TMP, 'court.json');
fs.writeFileSync(P_COURT, JSON.stringify(court));
let rCourt = '';
try { rCourt = execFileSync(process.execPath, [V, P_COURT], { cwd: RACINE, encoding: 'utf8' }); } catch (e) { rCourt = (e.stdout || '') + (e.stderr || ''); }
t('edition du 08/10 avec resume de 80 : bloquee (>= 120 requis)', rCourt.includes('BLOQUANTS'));
/* meme JSON court mais date 2026-10-07 : passe (regle historique) */
const court07 = JSON.parse(JSON.stringify(court));
court07.date = '2026-10-07';
const P_07 = path.join(TMP, 'court07.json');
fs.writeFileSync(P_07, JSON.stringify(court07));
let r07 = '';
try { r07 = execFileSync(process.execPath, [V, P_07], { cwd: RACINE, encoding: 'utf8' }); } catch (e) { r07 = (e.stdout || ''); }
t('meme JSON date 07/10 : regle historique (pas de bloc resume >= 120)', !/resume.{0,40}120/.test(r07));

fs.rmSync(TMP, { recursive: true, force: true });
console.log('\n' + (ko === 0 ? 'LOT4 : ' + ok + ' tests OK' : 'LOT4 : ' + ko + ' ECHECS / ' + ok + ' OK'));
process.exit(ko === 0 ? 0 : 1);
