#!/usr/bin/env node
/* fix-0610.js - normalisation ponctuelle de editions/2026-10-06.json :
 * fiabilite "N/5" (chaine) -> entier N, maj "JJ/MM/AAAA (consultation)" -> "JJ/MM/AAAA".
 * Idempotent : ne fait rien si le fichier est deja conforme. Outillage temporaire de maintenance.
 */
'use strict';
const fs = require('fs');
const p = 'editions/2026-10-06.json';
let t = fs.readFileSync(p, 'utf8');
const before = t;
t = t.replace(/"fiabilite":"([1-5])\/5"/g, '"fiabilite":$1');
t = t.replace(/"maj":"(\d{2}\/\d{2}\/\d{4}) \(consultation\)"/g, '"maj":"$1"');
JSON.parse(t);
if (t === before) { console.log('deja conforme, rien a faire'); process.exit(0); }
fs.writeFileSync(p, t);
console.log('corrige :', before.length, 'octets ->', t.length, 'octets');
