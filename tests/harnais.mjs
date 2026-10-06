/* tests/harnais.mjs — mini-harnais DOM maison (v91) : un document minimal
 * suffisant pour les vues (innerHTML, getElementById, querySelectorAll, onclick).
 * Aucune dépendance : Node ≥ 18 seul, pas de framework. */

export function creerDocumentMinimal() {
  const elements = new Map();
  let dernierId = 0;

  const creerElement = (nom) => {
    const el = {
      tagName: String(nom || '').toUpperCase(),
      id: '',
      innerHTML: '',
      style: {},
      dataset: {},
      children: [],
      onclick: null,
      scrollIntoView: null
    };
    el.getElementById = () => null;
    el.querySelectorAll = () => [];
    return el;
  };

  const racine = creerElement('#document');

  const parse = (html) => {
    /* Analyse minimaliste : balises ouvrantes/fermantes, attributs id/class/data-s. */
    const frags = [];
    const pile = [];
    const re = /<\/?([a-zA-Z][\w-]*)((?:\s+[\w-]+="[^"]*")*)\s*\/?>|([^<]+)/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      if (m[3] !== undefined) {
        if (pile.length) pile[pile.length - 1].children.push({ texte: m[3] });
        continue;
      }
      const attrs = {};
      const reA = /([\w-]+)="([^"]*)"/g;
      let ma;
      while ((ma = reA.exec(m[2] || '')) !== null) attrs[ma[1]] = ma[2];
      if (m[0].startsWith('</')) { pile.pop(); continue; }
      const el = creerElement(m[1]);
      if (attrs.id) el.id = attrs.id;
      if (attrs.class) el._classes = attrs.class.split(/\s+/);
      if (attrs['data-s']) el.dataset.s = attrs['data-s'];
      if (pile.length) pile[pile.length - 1].children.push(el);
      else frags.push(el);
      if (!/\/>$/.test(m[0])) pile.push(el);
    }
    return { frags, tous: () => {
      const out = [];
      const walk = n => { n.forEach ? n.forEach(x => { out.push(x); if (x.children) walk(x.children); }) : null; };
      walk(frags);
      return out.filter(x => x.tagName);
    } };
  };

  const vue = creerElement('#vue');
  Object.defineProperty(vue, 'innerHTML', {
    get() { return this._html || ''; },
    set(h) {
      this._html = String(h);
      this._dom = parse(this._html);
    }
  });

  const document = {
    getElementById(id) {
      if (id === 'view') return vue;
      const tous = (vue._dom ? vue._dom.tous() : []);
      return tous.find(el => el.id === id) || null;
    },
    querySelector(sel) {
      if (sel === '#view') return vue;
      return null;
    },
    querySelectorAll(sel) {
      const tous = vue._dom ? vue._dom.tous() : [];
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        return tous.filter(el => (el._classes || []).includes(cls));
      }
      return tous.filter(el => el.tagName === sel.toUpperCase());
    }
  };

  globalThis.document = document;
  globalThis.window = { scrollTo: () => {}, location: { hash: '' }, addEventListener: () => {} };
  return { document, vue };
}

/* Micro-runner d'assertions : chaque test = { nom, fn } (async autorisé). */
export async function lancerTests(tests, fichier) {
  let ok = 0, ko = 0;
  for (const t of tests) {
    try {
      await t.fn();
      ok++;
      console.log('  ok  ' + t.nom);
    } catch (e) {
      ko++;
      console.log('  KO  ' + t.nom + ' — ' + e.message);
    }
  }
  console.log(fichier + ' : ' + ok + ' ok, ' + ko + ' ko');
  if (ko) process.exitCode = 1;
}

export const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion echouee'); };
