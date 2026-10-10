/* Mon harnas indépendant — exécute VRAIMENT vueRecettes sur les 3 sous-onglets,
 * avec un DOM factice : #view existe (comme index.html), querySelectorAll -> [].
 * Leçon v65/duo : le harnas du livreur ne suffit pas, on vérifie avec le sien. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

/* --- Stub DOM --- */
const elementFictif = (id) => ({
  id, innerHTML: '', hidden: false, value: '', checked: false, disabled: false,
  setAttribute() {}, getAttribute() { return null; }, classList: { toggle() {}, add() {} },
  textContent: '', dataset: {},
  closest() { return null; }, scrollIntoView() {}
});
const ELEMENTS = { '#view': elementFictif('view'), '#tabs': elementFictif('tabs') };
global.document = {
  querySelector: s => ELEMENTS[s] || null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  documentElement: elementFictif('html')
};
global.window = { location: { hash: '' }, addEventListener: () => {}, scrollTo: () => {} };
global.localStorage = (() => {
  const store = {};
  return {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => Object.keys(store)[i] || null
  };
})();
global.history = { replaceState() {} };

/* --- Imports des modules réels --- */
const { state, getStore } = await import('../../js/core.js');
const recettes = await import('../../js/views/recettes.js');

/* --- Catalogue réel --- */
const l = f => JSON.parse(readFileSync(new URL('../../data/' + f, import.meta.url), 'utf8'));
state.recettesCatalogue = [l('recettes.json'), l('recettes-2.json'), l('recettes-3.json'), l('recettes-4.json')]
  .reduce((a, s) => a.concat(s.recettes || []), []);
state.chainesBase = l('chaines.json').chaines;
assert.equal(state.recettesCatalogue.length, 120, 'catalogue = 120');

/* --- Test 1 : la vue idées rend dans #view SANS crash --- */
state.activeTab = 'recettes';
state.recettesSub = 'idees';
recettes.vueRecettes();
const htmlIdees = ELEMENTS['#view'].innerHTML;
assert.ok(htmlIdees.includes('Semaine du'), 'en-tête semaine présent');
assert.ok(htmlIdees.includes('Régénérer la semaine'), 'bouton régénérer présent');
assert.ok((htmlIdees.match(/recettes-jour/g) || []).length === 7, '7 cartes jours');
assert.ok(htmlIdees.includes('recette-fav'), 'boutons coeur présents');
assert.ok(htmlIdees.includes('Aliments à éviter'), 'filtre présent');
const ids = getStore('recettesSemaine', null);
assert.ok(ids, 'semaine persistée dans le store');
const tous = Object.values(ids.jours).flatMap(j => Object.values(j)).filter(Boolean);
assert.equal(tous.length, 28, '28 slots remplis');
assert.equal(new Set(tous).size, 28, '28 recettes distinctes');
console.log('✓ sous-onglet idées : rendu OK, 28 recettes distinctes');

/* --- Test 2 : sous-onglet chaînes --- */
state.recettesSub = 'chaines';
ELEMENTS['#view'].innerHTML = '';
recettes.vueRecettes();
const htmlChaines = ELEMENTS['#view'].innerHTML;
assert.ok(htmlChaines.includes('YouTube'), 'section YouTube');
assert.ok(htmlChaines.includes('Instagram'), 'section Instagram');
assert.ok(htmlChaines.includes('marmiton.org'), 'carte site Marmiton');
const nbBarres = (htmlChaines.match(/<div class="subtabs/g) || []).length;
assert.equal(nbBarres, 1, 'UNE SEULE barre de sous-onglets');
assert.ok((htmlChaines.match(/recettes-chaine-carte/g) || []).length >= 14, '14+ cartes chaînes');
console.log('✓ sous-onglet chaînes : rendu OK, une seule barre');

/* --- Test 3 : sous-onglet favorites (vide puis rempli) --- */
state.recettesSub = 'favorites';
ELEMENTS['#view'].innerHTML = '';
recettes.vueRecettes();
assert.ok(ELEMENTS['#view'].innerHTML.includes('Aucune recette favorite'), 'empty state favorites');
console.log('✓ sous-onglet favorites : empty state OK');

/* --- Test 4 : pas de <main> imbriqué (index.html a déjà <main id="view">) --- */
assert.ok(!htmlIdees.includes('<main'), 'pas de balise <main> imbriquée dans le rendu');
console.log('✓ pas de <main> imbriqué');

console.log('=== Harnas indépendant : OK ===');
