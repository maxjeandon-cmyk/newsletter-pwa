#!/usr/bin/env node
/* tools/gen-icons.js — Genere les icones PNG RGBA de la PWA DiY/H24 (v82).
 * Design "media journalistique independant" : la une d'un journal — page
 * blanche, bandeau de titre bleu, colonnes d'articles, bloc photo — aux
 * couleurs du site (fond #0e0e12). Le meme motif vit dans icons/icon.svg.
 * PNG 100% Node (zlib inclus), aucune dependance.
 * Sorties :
 *   icons/icon-192.png         (favicon PNG / manifest, coins arrondis + transparence)
 *   icons/icon-512.png         (manifest, coins arrondis + transparence)
 *   icons/maskable-512.png     (manifest purpose maskable, fond carre opaque)
 *   icons/apple-touch-icon.png (iOS 180px, fond carre opaque)
 * Usage : node tools/gen-icons.js
 */
'use strict';
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

/* Couleurs de la marque */
const FOND = [0x0e, 0x0e, 0x12];
const PAPIER = [0xe8, 0xe8, 0xee];
const BLEU = [0x7f, 0xb4, 0xff];
const ENCRE = [0x0e, 0x0e, 0x12];
const PHOTO_C = [0x6a, 0x6a, 0x76];

/* Geometrie, tout en espace 512 — identique a icons/icon.svg */
const COIN = 96; /* rayon des coins du fond (variantes "any") */
const JOURNAL = { x: 112, y: 100, w: 288, h: 312, r: 20 }; /* la une : page blanche */
const TITRE = { x: 144, y: 128, w: 224, h: 48, r: 10 };    /* bandeau de titre bleu */
const EPAISSEUR = 14;                                      /* traits des colonnes */
const LIGNES = [
  /* colonne de gauche */
  [144, 216, 248, 216], [144, 252, 248, 252], [144, 288, 248, 288], [144, 324, 220, 324],
  /* colonne de droite */
  [264, 216, 368, 216], [264, 252, 368, 252], [264, 288, 368, 288], [264, 324, 320, 324]
];
const PHOTO = { x: 144, y: 352, w: 224, h: 32, r: 6 };     /* bloc photo */

/* ————— Primitives (espace 512) ————— */
function dansRectArrondi(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}
function distSeg(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}

/* ————— Rendu d'une image N x N (RGBA) avec sur-echantillonnage ————— */
/* plein = true : fond carre opaque (maskable / iOS).
 * plein = false : fond a coins arrondis, coins transparents.
 * Pour plein, le contenu est reduit a 75 % et recentre (zone de securite). */
function rendre(N, plein) {
  const S = 4;                       /* facteur de sur-echantillonnage */
  const P = N * S;                   /* pixels de sur-echantillonnage    */
  const buf = new Uint8Array(P * P * 4);
  const k = plein ? 0.75 : 1;         /* echelle du contenu en espace 512 */
  const off = plein ? 64 : 0;         /* recentrage (256 - 0.75*256)      */
  const tr = p => [off + p[0] * k, off + p[1] * k];

  /* pred est evalue en espace 512 ; bbox [x0, y0, x1, y1] en espace 512 */
  function peindre(pred, bbox, couleur) {
    const i0 = Math.max(0, Math.floor(bbox[0] * P / 512));
    const j0 = Math.max(0, Math.floor(bbox[1] * P / 512));
    const i1 = Math.min(P, Math.ceil(bbox[2] * P / 512));
    const j1 = Math.min(P, Math.ceil(bbox[3] * P / 512));
    for (let j = j0; j < j1; j++) {
      const py = (j + 0.5) * 512 / P;
      for (let i = i0; i < i1; i++) {
        const px = (i + 0.5) * 512 / P;
        if (pred(px, py)) {
          const o = (j * P + i) * 4;
          buf[o] = couleur[0]; buf[o + 1] = couleur[1]; buf[o + 2] = couleur[2]; buf[o + 3] = 255;
        }
      }
    }
  }
  function rectArrondi(forme, couleur) {
    const c = tr([forme.x, forme.y]);
    const w = forme.w * k, h = forme.h * k, r = forme.r * k;
    peindre((px, py) => dansRectArrondi(px, py, c[0], c[1], w, h, r), [c[0], c[1], c[0] + w, c[1] + h], couleur);
  }

  /* fond */
  if (plein) {
    peindre(() => true, [0, 0, 512, 512], FOND);
  } else {
    peindre((px, py) => dansRectArrondi(px, py, 0, 0, 512, 512, COIN), [0, 0, 512, 512], FOND);
  }
  /* la une du journal */
  rectArrondi(JOURNAL, PAPIER);
  rectArrondi(TITRE, BLEU);
  /* colonnes d'articles */
  const demi = EPAISSEUR * k / 2;
  for (const l of LIGNES) {
    const a = tr([l[0], l[1]]), b = tr([l[2], l[3]]);
    const bbox = [
      Math.min(a[0], b[0]) - demi, Math.min(a[1], b[1]) - demi,
      Math.max(a[0], b[0]) + demi, Math.max(a[1], b[1]) + demi
    ];
    peindre((px, py) => distSeg(px, py, a[0], a[1], b[0], b[1]) <= demi, bbox, ENCRE);
  }
  /* bloc photo */
  rectArrondi(PHOTO, PHOTO_C);

  /* moyennage S x S (premultiplie sur l'alpha pour des bords propres) */
  const img = Buffer.alloc(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
          const o = ((y * S + j) * P + x * S + i) * 4;
          const al = buf[o + 3];
          r += buf[o] * al; g += buf[o + 1] * al; b += buf[o + 2] * al; a += al;
        }
      }
      const o = (y * N + x) * 4;
      if (a === 0) { img[o + 3] = 0; continue; }
      img[o] = Math.round(r / a); img[o + 1] = Math.round(g / a);
      img[o + 2] = Math.round(b / a); img[o + 3] = Math.round(a / (S * S));
    }
  }
  return img;
}

/* ————— Ecriture PNG (RGBA 8 bits) ————— */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();
function chunk(type, donnees) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(donnees.length);
  const corps = Buffer.concat([Buffer.from(type, 'ascii'), donnees]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(corps));
  return Buffer.concat([len, corps, crc]);
}
function ecrirePNG(N, img) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4);
  ihdr[8] = 8; ihdr[9] = 6; /* RGBA 8 bits */
  const lignes = Buffer.alloc((N * 4 + 1) * N);
  for (let y = 0; y < N; y++) {
    lignes[y * (N * 4 + 1)] = 0; /* pas de filtre */
    img.copy(lignes, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
  }
  const idat = zlib.deflateSync(lignes, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ————— Generation ————— */
const SORTIES = [
  ['icons/icon-192.png', 192, false],
  ['icons/icon-512.png', 512, false],
  ['icons/maskable-512.png', 512, true],
  ['icons/apple-touch-icon.png', 180, true]
];
const racine = path.resolve(__dirname, '..');
for (const [rel, N, plein] of SORTIES) {
  const png = ecrirePNG(N, rendre(N, plein));
  const dest = path.join(racine, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, png);
  console.log(rel + ' : ' + N + 'x' + N + ' (' + png.length + ' octets)');
}
