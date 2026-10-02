/* views/lecture.js — 📖 Onglets de recherche (v25) : Tout / Livres /
 * Journaux / Magazines / Revues scientifiques / Thèses / BD / Manga —
 * chacun avec son menu déroulant de catégories et des recommandations
 * (5 à 10) dès qu'une catégorie est choisie. Lecteur intégré inchangé. */
import { $, state, esc, urlSure, getStore, setStore } from '../core.js';
import { chercher, ouvrirOuvrage, ouvrirVersion } from '../lecture.js';
import { renderView } from './common.js';

/* Onglets de recherche (v25) — l'ordre est le contrat demandé :
 * Tout / Livres / Journaux / Magazines / Revues scientifiques / Thèses / BD / Manga.
 * Chaque onglet porte ses catégories de recherche et des recommandations (5 à 10). */
const CATEGORIES = [
  { id: 'tout', nom: 'Tout', emoji: '🌐',
    cats: [
      { id: 'classiques', nom: 'Classiques de la littérature' },
      { id: 'sciences', nom: 'Sciences & découvertes' },
      { id: 'histoire', nom: 'Histoire & mémoire' },
      { id: 'economie', nom: 'Économie & société' },
      { id: 'technique', nom: 'Technique & numérique' },
      { id: 'arts', nom: 'Arts & spectacles' }
    ] },
  { id: 'livres', nom: 'Livres', emoji: '📚',
    cats: [
      { id: 'romans', nom: 'Romans & récits' },
      { id: 'classiques', nom: 'Classiques' },
      { id: 'poesie', nom: 'Poésie' },
      { id: 'theatre', nom: 'Théâtre' },
      { id: 'philosophie', nom: 'Philosophie & essais' },
      { id: 'histoire', nom: 'Histoire' },
      { id: 'sciences', nom: 'Sciences' },
      { id: 'biographies', nom: 'Biographies & mémoires' },
      { id: 'enfance', nom: 'Livres pour enfants' }
    ] },
  { id: 'journaux', nom: 'Journaux', emoji: '📰',
    cats: [
      { id: 'presse-nationale', nom: 'Presse nationale' },
      { id: 'presse-regionale', nom: 'Presse régionale' },
      { id: 'presse-ancienne', nom: 'Numéros anciens (XIXᵉ–XXᵉ)' },
      { id: 'presse-sport', nom: 'Presse sportive' },
      { id: 'presse-economie', nom: 'Presse économique' },
      { id: 'presse-culture', nom: 'Presse culturelle' }
    ] },
  { id: 'magazines', nom: 'Magazines', emoji: '📰',
    cats: [
      { id: 'actualite', nom: 'Actualité & hebdomadaires' },
      { id: 'sciences-humaines', nom: 'Sciences humaines' },
      { id: 'sciences-pop', nom: 'Sciences & vulgarisation' },
      { id: 'nature', nom: 'Nature & environnement' },
      { id: 'technologie', nom: 'Technologie' },
      { id: 'culture-loisirs', nom: 'Culture & loisirs' }
    ] },
  { id: 'revues', nom: 'Revues scientifiques', emoji: '🔬',
    cats: [
      { id: 'sante', nom: 'Santé & médecine' },
      { id: 'physique', nom: 'Physique & chimie' },
      { id: 'informatique', nom: 'Informatique & IA' },
      { id: 'mathematiques', nom: 'Mathématiques' },
      { id: 'environnement', nom: 'Environnement & climat' },
      { id: 'economie-recherche', nom: 'Économie & recherche' },
      { id: 'droit-recherche', nom: 'Droit' }
    ] },
  { id: 'theses', nom: 'Thèses', emoji: '🎓',
    cats: [
      { id: 'lettres', nom: 'Lettres & sciences humaines' },
      { id: 'histoire-these', nom: 'Histoire' },
      { id: 'sante-these', nom: 'Santé' },
      { id: 'sciences-these', nom: 'Sciences & ingénierie' },
      { id: 'droit-these', nom: 'Droit & politique' },
      { id: 'economie-these', nom: 'Économie' }
    ] },
  { id: 'bd', nom: 'BD', emoji: '💥',
    cats: [
      { id: 'bd-franco-belge', nom: 'Franco-belge' },
      { id: 'bd-classique', nom: 'Classiques' },
      { id: 'bd-graphique', nom: 'Roman graphique' },
      { id: 'bd-historique', nom: 'Historique & documentaire' },
      { id: 'bd-humour', nom: 'Humour' }
    ] },
  { id: 'manga', nom: 'Manga', emoji: '🇯🇵',
    cats: [
      { id: 'shonen', nom: 'Shōnen' },
      { id: 'shojo', nom: 'Shōjo' },
      { id: 'seinen', nom: 'Seinen' },
      { id: 'manga-classique', nom: 'Classiques du manga' }
    ] }
];

/* Recommandations par catégorie (entre 5 et 10, choix délibéré) :
 * chaque entrée = [titre affiché, texte descriptif, requête lancée]. */
const LIVRES_RECOS = {
  romans: [
    ['Les Misérables — Victor Hugo', 'Le panorama du XIXᵉ siècle français — un condamné, une sainte, une révolution.', 'Les Misérables Victor Hugo'],
    ['1984 — George Orwell', 'La dystopie de référence sur la surveillance et le pouvoir.', '1984 Orwell'],
    ['L’Étranger — Albert Camus', 'L’absurde en une centaine de pages de soleil algérien.', 'The Stranger Camus'],
    ['Voyage au bout de la nuit — Céline', 'La langue française poussée à bout, du front de 14-18 à l’Afrique coloniale.', 'Voyage au bout de la nuit Celine'],
    ['Orgueil et Préjugés — Jane Austen', 'Ironie, mariage et morale dans l’Angleterre georgienne.', 'Pride and Prejudice Austen']
  ],
  classiques: [
    ['Madame Bovary — Flaubert', 'Le réalisme à son sommet, phrase par phrase.', 'Madame Bovary Flaubert'],
    ['Le Rouge et le Noir — Stendhal', 'Ambition et passion sous la Restauration.', 'The Red and the Black Stendhal'],
    ['Bel-Ami — Maupassant', 'La conquête sociale d’un beau garçon sans scrupules.', 'Bel-Ami Maupassant'],
    ['Père Goriot — Balzac', 'Le père ruiné par ses filles — cœur de La Comédie humaine.', 'Pere Goriot Balzac'],
    ['Crime et Châtiment — Dostoïevski', 'Un meurtre, une conscience, Saint-Pétersbourg.', 'Crime and Punishment Dostoevsky'],
    ['Les Fleurs du mal — Baudelaire', 'La modernité poétique commence ici.', 'Les Fleurs du mal Baudelaire']
  ],
  poesie: [
    ['Les Fleurs du mal — Baudelaire', 'Spleen et idéal — le recueil qui a changé la poésie.', 'Les Fleurs du mal Baudelaire'],
    ['Alcools — Apollinaire', '« Zone » ouvre le recueil qui a modernisé le vers français.', 'Alcools Apollinaire'],
    ['Une saison en enfer — Rimbaud', 'L’adolescence géniale, brèlée en quelques pages.', 'A Season in Hell Rimbaud'],
    ['Demain, dès l’aube — Hugo', '« Je marcherai les yeux fixés sur mes pensées » — la tombe de sa fille.', 'Les Contemplations Hugo'],
    ['Fables — La Fontaine', 'Le rat, le lion et la morale, en vers inoubliables.', 'Fables La Fontaine']
  ],
  theatre: [
    ['Cyrano de Bergerac — Rostand', 'Panache, nez et amour lettré — cinq actes en alexandrins.', 'Cyrano de Bergerac Rostand'],
    ['Hamlet — Shakespeare', 'Être ou ne pas être — le drame de la conscience.', 'Hamlet Shakespeare'],
    ['Le Cid — Corneille', 'L’honneur contre l’amour.', 'Le Cid Corneille'],
    ['Hernani — Hugo', 'La bataille du romantisme, sous les sifflets de 1830.', 'Hernani Hugo'],
    ['En attendant Godot — Beckett', 'Deux clochards, un arbre — le théâtre moderne.', 'Waiting for Godot Beckett']
  ],
  philosophie: [
    ['Le Mythe de Sisyphe — Camus', 'Faut-il se donner la mort ? Réponse en trois actes.', 'The Myth of Sisyphus Camus'],
    ['Ainsi parlait Zarathoustra — Nietzsche', 'Créer ses propres valeurs, en prose poétique.', 'Thus Spoke Zarathustra Nietzsche'],
    ['Discours de la méthode — Descartes', 'Le doute méthodique, socle de la pensée moderne.', 'Discourse on Method Descartes'],
    ['Du contrat social — Rousseau', '« L’homme est né libre, et partout il est dans les fers. »', 'The Social Contract Rousseau'],
    ['La République — Platon', 'L’allégorie de la caverne et la cité juste.', 'The Republic Plato']
  ],
  histoire: [
    ['Mémoires de guerre — De Gaulle', 'La France libre racontée par son chef.', 'Memoires de guerre De Gaulle'],
    ['Le Dimanche de Bouvines — Georges Duby', 'Une bataille, une société entière reconstituée.', 'Le Dimanche de Bouvines Duby'],
    ['Montaillou, village occitan — Le Roy Ladurie', 'La vie d’un village cathare par les archives de l’Inquisition.', 'Montaillou Le Roy Ladurie'],
    ['La Civilisation de la Renaissance — Burckhardt', 'L’Italie qui invente la modernité.', 'The Civilization of the Renaissance Burckhardt'],
    ['Histoire de France — Bainville', 'Une chronique littéraire et polémique.', 'Histoire de France Bainville']
  ],
  sciences: [
    ['Sapiens — Yuval Noah Harari', 'Comment une espèce insignifiante a pris le contrôle de la planète.', 'Sapiens Harari'],
    ['Une brève histoire du temps — Stephen Hawking', 'Trous noirs et Big Bang, sans équations.', 'A Brief History of Time Hawking'],
    ['De l’origine des espèces — Darwin', 'Le texte fondateur, encore parfaitement lisible.', 'On the Origin of Species Darwin'],
    ['Silent Spring — Rachel Carson', 'Le livre qui a lancé l’écologie politique.', 'Silent Spring Rachel Carson'],
    ['La Science et l’Hypothèse — Poincaré', 'Les mathématiques comme libre création de l’esprit.', 'Science and Hypothesis Poincare']
  ],
  biographies: [
    ['Mémoires d’Hadrien — Marguerite Yourcenar', 'Un empereur se regarde vivre — biographie romanesque.', 'Memoirs of Hadrian Yourcenar'],
    ['Confessions — Rousseau', 'L’autobiographie qui invente l’intériorité moderne.', 'Confessions Rousseau'],
    ['La Vie de Samuel Johnson — Boswell', 'Le modèle de toutes les biographies.', 'Life of Samuel Johnson Boswell'],
    ['Marie Curie — Ève Curie', 'Une fille raconte sa mère, deux prix Nobel.', 'Madame Curie Eve Curie'],
    ['Autobiographie — Benjamin Franklin', 'Le self-made man à l'ancienne, raconté par lui-même.', 'Autobiography Benjamin Franklin']
  ],
  enfance: [
    ['Le Petit Prince — Saint-Exupéry', '« Dessine-moi un mouton » — le plus lu des livres français.', 'The Little Prince Saint-Exupery'],
    ['Alice au pays des merveilles — Carroll', 'Un terrier, un lapin, et la logique qui déraille.', 'Alice in Wonderland Carroll'],
    ['Les Contes de Perrault', 'Le Petit Chaperon rouge et compagnie, dans le texte d’origine.', 'Tales of Mother Goose Perrault'],
    ['Matilda — Roald Dahl', 'Une petite fille surdouée contre la directrice Trunchbull.', 'Matilda Roald Dahl'],
    ['Charlotte’s Web — E.B. White', 'L’amitié entre une araignée et un cochon.', 'Charlotte’s Web White']
  ]
};

const JOURNAUX_RECOS = {
  'presse-nationale': [
    ['Le Figaro (numérisé, 1826–1942)', 'Le quotidien le plus ancien de France, numérisé par Gallica.', 'Le Figaro'],
    ['Le Petit Parisien (1876–1944)', 'Le plus grand tirage de la presse française avant-guerre.', 'Le Petit Parisien'],
    ['Le Temps (1861–1942)', 'Le journal de référence de la Troisième République.', 'Le Temps journal'],
    ['L’Aurore (« J’accuse … ! », 1898)', 'Le numéro de Zola pour Dreyfus — pièce d’histoire.', 'L’Aurore J’accuse'],
    ['La Croix (numérisée, 1880–1944)', 'Le quotidien catholique, témoin des débats de son temps.', 'La Croix journal']
  ],
  'presse-regionale': [
    ['Ouest-France (numérisé)', 'Le premier quotidien régional français, archives sur Gallica.', 'Ouest-France'],
    ['La Dépêche du Midi', 'Le grand quotidien du Sud-Ouest, numérisé.', 'La Depeche du Midi'],
    ['Le Progrès de Lyon', 'Le journal de la région lyonnaise, archives accessibles.', 'Le Progres de Lyon'],
    ['L’Est Républicain', 'La presse de l’Est de la France, archives numérisées.', 'L’Est Republicain'],
    ['La Provence / Le Petit Marseillais', 'La presse marseillaise numérisée.', 'Le Petit Marseillais']
  ],
  'presse-ancienne': [
    ['La Gazette (1631–326)', 'Le premier hebdomadaire français, fondé par Théophraste Renaudot.', 'La Gazette Renaudot'],
    ['Le Journal de Paris (1777)', 'Le premier quotidien français.', 'Journal de Paris 1777'],
    ['Le Journal des débats (1789)', 'La Révolution et l’Empire commentées au jour le jour.', 'Journal des debats'],
    ['La Presse (Émile de Girardin, 1836)', 'Le journal moderne — réclame et roman-feuilleton.', 'La Presse Girardin'],
    ['L’Auto (1900–1944)', 'Le quotidien sportif qui a créé le Tour de France.', 'L’Auto Tour de France']
  ],
  'presse-sport': [
    ['L’Équipe (numérisée)', 'Née de L’Auto — le quotidien du sport français.', 'L’Equipe'],
    ['L’Auto (1900–1944)', 'Le journal qui a inventé le Tour de France.', 'L’Auto velo'],
    ['Miroir des sports', 'L’hebdomadaire sportif de l’entre-deux-guerres.', 'Miroir des sports'],
    ['Miroir sprint', 'Le sport en photos, de 1946 aux années 60.', 'Miroir sprint'],
    ['But ! (1927–1937)', 'L’hebdomadaire du football français.', 'But journal football']
  ],
  'presse-economie': [
    ['Les Échos (numérisés)', 'Le quotidien économique de référence, archives sur Gallica.', 'Les Echos'],
    ['La Vie économique (Revue)', 'La revue économique de l’entre-deux-guerres.', 'La Vie economique revue'],
    ['Journal des économistes (1841–1940)', 'La revue de la pensée économique libérale française.', 'Journal des economistes'],
    ['L’Économie française (périodique)', 'Témoin de la politique économique du XXᵉ siècle.', 'L’Economie francaise journal'],
    ['Le Capital (éditions commentées)', 'Marx dans les journaux de son temps.', 'Das Kapital']
  ],
  'presse-culture': [
    ['La Revue des deux mondes (numérisée)', 'La grande revue littéraire française — archives dès 1829.', 'Revue des deux mondes'],
    ['Les Temps modernes — Sartre', 'La revue existentialiste fondée en 1945.', 'Les Temps modernes Sartre'],
    ['La Nouvelle Revue française', 'La NRF — Gide et la littérature du XXᵉ.', 'Nouvelle Revue francaise'],
    ['Comœdia (1907–1937)', 'Le quotidien des arts et du théâtre.', 'Comoedia journal'],
    ['Le Mercure de France', 'La revue symboliste devenue institution.', 'Mercure de France']
  ]
};

const MAGASINES_RECOS = {
  actualite: [
    ['L’Illustration (1843–1944)', 'Le grand hebdomadaire illustré français — tous les événements du siècle en gravures.', 'L’Illustration'],
    ['Paris Match (numérisé)', 'L’actualité en images depuis 1949.', 'Paris Match'],
    ['Le Miroir (1910–1937)', 'L’hebdomadaire photographique de la Grande Guerre.', 'Le Miroir hebdo'],
    ['Vu (1928–1940)', 'Le magazine photographique de l’entre-deux-guerres — reportages et mise en page moderne.', 'Vu magazine'],
    ['Regards (1932–1938)', 'Le magazine ouvrier — reportages sociaux et photos célèbres.', 'Regards magazine']
  ],
  'sciences-humaines': [
    ['Annales. Histoire, sciences sociales', 'La revue fondée par Marc Bloch et Lucien Febvre — l’école des Annales.', 'Annales Histoire sciences sociales'],
    ['L’Homme (revue)', 'L’anthropologie française depuis 1961.', 'L’Homme revue anthropologie'],
    ['Population (revue)', 'La démographie française de référence.', 'Population revue demographie'],
    ['Actes de la recherche en sciences sociales — Bourdieu', 'La revue de Bourdieu — enquêtes et critique sociale.', 'Actes recherche sciences sociales Bourdieu'],
    ['Le Débat (revue)', 'La revue d’idées de la Maison des sciences de l’homme.', 'Le Debat revue']
  ],
  'sciences-pop': [
    ['La Nature (1873–1971)', 'Le magazine des sciences de son temps — archives numérisées.', 'La Nature revue sciences'],
    ['Science & Vie (numérisée)', 'La vulgarisation scientifique de référence.', 'Science et Vie'],
    ['Scientific American (archives)', 'La science expliquée depuis 1845.', 'Scientific American'],
    ['Pour la Science', 'L’édition française de Scientific American.', 'Pour la Science'],
    ['Ciel et Espace', 'L’astronomie de vulgarisation en français.', 'Ciel et Espace']
  ],
  nature: [
    ['La Terre (journal agricole)', 'Le monde rural suivi semaine par semaine.', 'La Terre journal agricole'],
    ['National Geographic (archives)', 'L’exploration en images depuis 1888.', 'National Geographic'],
    ['La Hulotte', 'Le journal « le plus lu dans les terriers » — naturaliste et drôle.', 'La Hulotte'],
    ['Terra Éco', 'L’environnement expliqué par le journal Le Monde.', 'Terra Eco'],
    ['La Recherche (numéros anciens)', 'La recherche scientifique française, archive numérisée.', 'La Recherche revue']
  ],
  technologie: [
    ['Science & Vie (numéros historiques)', 'L’électronique puis l’informatique racontées mois après mois.', 'Science et Vie'],
    ['Scientific American (années 50-70)', 'La révolution informatique commentée en direct.', 'Scientific American computer'],
    ['Usine Nouvelle / Sciences et Industries', 'La technique et l’industrie françaises.', 'Sciences et Industries'],
    ['Radioélectricité / Télévision (revues)', 'Les débuts de la radio et de la télé expliqués — archives.', 'TSF revue radioelectricite'],
    ['Wired (archives)', 'La culture numérique depuis 1993.', 'Wired magazine']
  ],
  'culture-loisirs': [
    ['L’Illustration — numéros spéciaux', 'Les grands événements culturels en couverture.', 'L’Illustration'],
    ['Télé 7 Jours / Télé Magazine (archives)', 'La télé et la radio vues par leurs programmes.', 'Tele 7 jours'],
    ['Elle (archives)', 'La mode et la société vues par le magazine féminin.', 'Elle magazine'],
    ['Paris Match — culture', 'Cinéma, théâtre et people.', 'Paris Match'],
    ['Salut les copains (1961–1976)', 'Le magazine du yéyé — témoin culturel majeur.', 'Salut les copains']
  ]
};

const REVUES_RECOS = {
  sante: [
    ['The Lancet', 'Le grand hebdomadaire médical britannique — depuis 1823.', 'The Lancet'],
    ['New England Journal of Medicine', 'La médecine clinique de référence.', 'New England Journal of Medicine'],
    ['Bulletin de l’Académie de médecine', 'La médecine française institutionnelle.', 'Bulletin Academie medecine'],
    ['Nature Medicine', 'La recherche médicale translationnelle.', 'Nature Medicine'],
    ['Europe PMC — santé publique', 'Résumés systématiques, accès souvent libre.', 'public health Europe PMC']
  ],
  physique: [
    ['Physical Review Letters', 'Les lettres de la physique — le sommet du domaine.', 'Physical Review Letters'],
    ['Reviews of Modern Physics', 'Les synthèses de référence.', 'Reviews of Modern Physics'],
    ['Nature Physics', 'La physique interdisciplinaire de haut niveau.', 'Nature Physics'],
    ['Journal de Physique (archives)', 'La physique française — archives numérisées.', 'Journal de Physique'],
    ['Comptes rendus de l’Académie des sciences', 'Les séances de l’Académie — depuis 1835.', 'Comptes rendus Academie sciences']
  ],
  informatique: [
    ['arXiv cs.AI — intelligence artificielle', 'Les prépublications IA, libres et au jour le jour.', 'artificial intelligence arXiv'],
    ['Communications of the ACM', 'La revue de l’Association for Computing Machinery.', 'Communications ACM'],
    ['Journal of Machine Learning Research', 'L’apprentissage machine en accès libre.', 'JMLR machine learning'],
    ['IEEE Transactions on Pattern Analysis', 'La vision par ordinateur et ses robots.', 'TPAMI computer vision'],
    ['Nature Machine Intelligence', 'L’IA vue par une grande revue interdisciplinaire.', 'Nature Machine Intelligence']
  ],
  mathematiques: [
    ['Annals of Mathematics', 'Le sommet des mathématiques pures.', 'Annals of Mathematics'],
    ['Inventiones Mathematicae', 'Les grandes découvertes du domaine.', 'Inventiones Mathematicae'],
    ['Bulletin de la SMF', 'La Société mathématique de France.', 'Bulletin SMF'],
    ['Journal de théorie des nombres de Bordeaux', 'L’arithmétique à la française.', 'journal theorie nombres Bordeaux'],
    ['Acta Mathematica', 'La revue fondatrice du domaine.', 'Acta Mathematica']
  ],
  environnement: [
    ['Nature Climate Change', 'Le climat dans Nature.', 'Nature Climate Change'],
    ['Environmental Research Letters', 'La recherche climatique en accès libre.', 'Environmental Research Letters'],
    ['Climatic Change', 'La revue historique du climat.', 'Climatic Change journal'],
    ['Bulletin Copernicus — état du climat', 'Le bulletin régulier de l’observation européenne.', 'Copernicus climate bulletin'],
    ['Global Change Biology', 'Le vivant face au changement climatique.', 'Global Change Biology']
  ],
  'economie-recherche': [
    ['American Economic Review', 'La revue de référence de la discipline.', 'American Economic Review'],
    ['Quarterly Journal of Economics', 'L’économie académique de haut vol.', 'Quarterly Journal of Economics'],
    ['Revue économique', 'L’économie française universitaire.', 'Revue economique'],
    ['Journal of Public Economics', 'Les finances et les politiques publiques.', 'Journal of Public Economics'],
    ['Annales d’économie et de statistique', 'L’économétrie française.', 'Annales economie statistique']
  ],
  'droit-recherche': [
    ['Revue de droit', 'La doctrine juridique française.', 'Revue de droit'],
    ['Revue trimestrielle de droit civil', 'Le droit civil français.', 'Revue trimestrielle droit civil'],
    ['Harvard Law Review', 'La revue juridique américaine de référence.', 'Harvard Law Review'],
    ['Dalloz (recueils)', 'La doctrine et la jurisprudence françaises.', 'Dalloz'],
    ['Revue internationale de droit comparé', 'Le droit comparé, entre systèmes.', 'Revue internationale droit compare']
  ]
};

const THESES_RECOS = {
  lettres: [
    ['Thèses de littérature française — HAL', 'Les thèses de doctorat déposées et souvent intégrales sur HAL.', 'these litterature francaise'],
    ['Thèses de linguistique — HAL', 'La langue et ses systèmes, au doctorat.', 'these linguistique'],
    ['Thèses de sciences du langage', 'Comment la langue se construit et se transmet.', 'these sciences du langage'],
    ['Thèses de traductologie', 'Passer d’une langue à l’autre, étudié au plus près.', 'these traductologie'],
    ['Thèses de philosophie — HAL', 'Le doctorat français de philosophie, souvent intégral.', 'these philosophie']
  ],
  'histoire-these': [
    ['Thèses d’histoire moderne', 'Les institutions, les sociétés et les révoltes du XVIᵉ–XVIIIᵉ.', 'these histoire moderne'],
    ['Thèses d’histoire médiévale', 'Le Moyen Âge étudié dans les archives.', 'these histoire medievale'],
    ['Thèses d’histoire contemporaine', 'Les XIXᵉ–XXIᵉ siècles au prisme du doctorat.', 'these histoire contemporaine'],
    ['Thèses d’histoire des femmes et du genre', 'Un champ doctoral devenu central.', 'these histoire genre'],
    ['Thèses d’histoire coloniale', 'Empires, colonisations, décolonisations.', 'these histoire coloniale']
  ],
  'sante-these': [
    ['Thèses de médecine — HAL', 'Le doctorat médical français, textes intégraux.', 'these medecine'],
    ['Thèses de biologie — HAL', 'Le vivant observé au microscope doctoral.', 'these biologie'],
    ['Thèses de pharmacie — HAL', 'Le médicament sous tous ses aspects.', 'these pharmacie'],
    ['Thèses de santé publique — HAL', 'Les systèmes de santé et leurs mesures.', 'these sante publique'],
    ['Thèses d’épidémiologie — HAL', 'Comment les épidémies se propagent — études doctorales.', 'these epidemiologie']
  ],
  'sciences-these': [
    ['Thèses de physique — HAL', 'Le doctorat français de physique, textes souvent intégraux.', 'these physique'],
    ['Thèses d’informatique — HAL', 'Des algorithmes aux architectures.', 'these informatique'],
    ['Thèses de chimie — HAL', 'Les molécules et leurs réactions, jusqu’au doctorat.', 'these chimie'],
    ['Thèses de mathématiques — HAL', 'Démonstrations et structures, au plus haut niveau.', 'these mathematiques'],
    ['Thèses d’ingénierie — HAL', 'Le doctorat appliqué, du laboratoire à l’industrie.', 'these ingenierie']
  ],
  'droit-these': [
    ['Thèses de droit privé', 'Les personnes, les biens, les contrats, au doctoral.', 'these droit prive'],
    ['Thèses de droit public — HAL', 'L’État, la Constitution et ses interprétations.', 'these droit public'],
    ['Thèses d’histoire du droit', 'Les racines médiévales et romaines de nos règles.', 'these histoire du droit'],
    ['Thèses de droit international', 'Les traités et la communauté des États.', 'these droit international'],
    ['Thèses de droit pénal', 'La faute, la peine et la société.', 'these droit penal']
  ],
  'economie-these': [
    ['Thèses de sciences économiques — HAL', 'Le doctorat français d’économie.', 'these sciences economiques'],
    ['Thèses de gestion — HAL', 'Entreprises, stratégies, organisations.', 'these gestion'],
    ['Thèses d’économétrie — HAL', 'La mesure économique et ses modèles.', 'these economometrie'],
    ['Thèses de finance — HAL', 'Marchés, risques et monnaie.', 'these finance'],
    ['Thèses de développement économique', 'Croissance et inégalités entre pays.', 'these developpement economique']
  ]
};

const BD_RECOS = {
  'bd-franco-belge': [
    ['Astérix le Gaulois — Goscinny & Uderzo', 'La potion magique et l’humour gaulois — depuis 1961.', 'Asterix the Gaul'],
    ['Tintin — Hergé', 'Le reporter à houppette, 24 albums.', 'Tintin adventures'],
    ['Le Chat du Rabbin — Joann Sfar', 'Théologie et humour dans le Paris des années 30.', 'Le Chat du Rabbin Sfar'],
    ['Gaston Lagaffe — Franquin', 'L’employé modèle du contraire — gaffophone inclus.', 'Gaston Lagaffe Franquin'],
    ['Blake et Mortimer — Jacobs', 'Mystère et anticipation à l’anglaise.', 'Blake and Mortimer'],
    ['Le Spirou de Franquin', 'Le groom et ses aventures de référence.', 'Spirou Franquin']
  ],
  'bd-classique': [
    ['Little Nemo in Slumberland — Winsor McCay', 'Le rêve en case, dès 1905 — la BD moderne avant l’heure.', 'Little Nemo in Slumberland'],
    ['Krazy Kat — George Herriman', 'Un chat, une souris, une brique — chef-d’œuvre absolu.', 'Krazy Kat'],
    ['Les Aventures de Tintin — Hergé', 'Le reportage dessiné de référence.', 'Tintin'],
    ['Astérix — Goscinny & Uderzo', 'Un village d’irréductibles Gaulois.', 'Asterix'],
    ['Peanuts — Charles Schulz', 'Charlie Brown, Snoopy et la mélancolie américaine.', 'Peanuts Schulz'],
    ['Popeye — E.C. Segar', 'Le marin aux épinards, dans le strip originel.', 'Popeye Segar']
  ],
  'bd-graphique': [
    ['Maus — Art Spiegelman', 'La Shoah en noir et blanc — prix Pulitzer 1992.', 'Maus Spiegelman'],
    ['Persepolis — Marjane Satrapi', 'L’enfance à Téhéran puis l’exil, en noir et blanc.', 'Persepolis Satrapi'],
    ['Watchmen — Alan Moore', 'Le super-héros déconstruit — sommet du genre.', 'Watchmen Moore'],
    ['L’Arabe du futur — Riad Sattouf', 'L’enfance en Syrie et en Libye — mémoire du quotidien.', 'The Arab of the Future Sattouf'],
    ['Blankets — Craig Thompson', 'Premier amour et neige du Midwest, 600 pages.', 'Blankets Craig Thompson'],
    ['Fun Home — Alison Bechdel', 'Une autobiographie familiale dessinée avec une précision confondante.', 'Fun Home Bechdel']
  ],
  'bd-historique': [
    ['Maus — Spiegelman', 'Des souris, des chats et la Shoah — indispensable.', 'Maus'],
    ['La Guerre d’Alan — Emmanuel Guibert', 'Les souvenirs d’un GI en Europe, dessinés au pinceau.', 'Alan’s War Guibert'],
    ['Il était une fois en France — Sylvain Runberg', 'Un juif français sous l’Occupation, l’histoire vraie de Joseph Joanovici.', 'Il etait une fois en France'],
    ['Le Transperceneige — Lob & Rochette', 'Les derniers humains dans un train sans fin.', 'Snowpiercer'],
    ['A.D. — la Nouvelle-Orléans après le déluge — Josh Neufeld', 'Katrina racontée case par case, reportage dessiné.', 'A.D. New Orleans Neufeld']
  ],
  'bd-humour': [
    ['Gaston Lagaffe — Franquin', 'Le gaffophone, les gadgets et les plantes vertes.', 'Gaston Lagaffe'],
    ['Le Chat — Philippe Geluck', 'Un chat philosophe, drôle et sans complaisance.', 'Le Chat Geluck'],
    ['Le Génie des alpages — F'murr', 'Des moutons philosophes dans un alpage absurde.', 'Le Genie des alpages Fmurr'],
    ['Sillage — Morvan & Buche', 'Une humaine adoptée par une galaxie — le best-seller de Soleil.', 'Sillage Morvan'],
    ['Lucien — Frank Margerin', 'Le rock, la banlieue et l’humour, depuis 1975.', 'Lucien Frank Margerin']
  ]
};

const MANGA_RECOS = {
  shonen: [
    ['One Piece — Eiichiro Oda', 'La quête du One Piece — un monde à lui seul.', 'One Piece Oda'],
    ['Naruto — Masashi Kishimoto', 'Le ninja orphelin qui veut devenir Hokage.', 'Naruto Kishimoto'],
    ['Dragon Ball — Akira Toriyama', 'Le voyage initiatique qui a défié la gravité.', 'Dragon Ball Toriyama'],
    ['Fullmetal Alchemist — Hiromu Arakawa', 'Alchimie, frères et une faute originelle.', 'Fullmetal Alchemist Arakawa'],
    ['L’Attaque des Titans — Hajime Isayama', 'L’humanité derrière les murs — et au-dehors.', 'Attack on Titan Isayama'],
    ['Hunter × Hunter — Yoshihiro Togashi', 'Gon veut retrouver son père — le système de chasseurs le plus riche du genre.', 'Hunter x Hunter Togashi']
  ],
  shojo: [
    ['Nana — Ai Yazawa', 'Deux Nana, une amitié indéfectible et le rock à Tokyo.', 'Nana Yazawa'],
    ['Fruits Basket — Natsuki Takaya', 'Une lycéenne, une famille maudite et le zodiaque chinois.', 'Fruits Basket Takaya'],
    ['Sailor Moon — Naoko Takeuchi', 'Les magical girls qui ont défini le genre.', 'Sailor Moon Takeuchi'],
    ['Kare Kano — Masami Tsuda', 'Deux premiers de classe tombent amoureux.', 'Kare Kano Tsuda'],
    ['Your Lie in April — Naoshi Arakawa', 'Un pianiste brisé, une violoniste libre.', 'Your Lie in April Arakawa'],
    ['A Silent Voice — Yoshitoki Ōima', 'Le harcèlement et la rédemption.', 'A Silent Voice Oima']
  ],
  seinen: [
    ['Monster — Naoki Urasawa', 'Un chirurgien, un tueur, l’Allemagne des années 90.', 'Monster Urasawa'],
    ['20th Century Boys — Naoki Urasawa', 'Un culte, une chanson, la fin du monde.', '20th Century Boys Urasawa'],
    ['Berserk — Kentaro Miura', 'L’épopée noire de Guts.', 'Berserk Miura'],
    ['Akira — Katsuhiro Otomo', 'Neo-Tokyo, 1988 — le manga qui a conquis l’Occident.', 'Akira Otomo'],
    ['Blame! — Tsutomu Nihei', 'Une architecture vertigineuse en errance cyberpunk.', 'Blame Nihei'],
    ['Vagabond — Takehiko Inoue', 'Miyamoto Musashi, le sabre et la peinture.', 'Vagabond Inoue']
  ],
  'manga-classique': [
    ['Astro Boy — Osamu Tezuka', 'Le dieu du manga, fondateur de tout le reste.', 'Astro Boy Tezuka'],
    ['Gon — Masashi Tanaka', 'Un petit dinosaure furieux — une BD muette virtuose.', 'Gon Masashi Tanaka'],
    ['Le Gen d’Hiroshima — Keiji Nakazawa', 'Le bombardement atomique raconté par un survivant.', 'Barefoot Gen Nakazawa'],
    ['Opus — Satoshi Kon', 'Le monde intérieur d'un mangaka — le dernier testament d'un cinéaste du neuf.', 'Opus Satoshi Kon'],
    ['GeGeGe no Kitaro — Shigeru Mizuki', 'Le maître du folklore et des yōkai.', 'Kitaro Shigeru Mizuki']
  ]
};

const TOUT_RECOS = {
  classiques: [
    ['Les Misérables — Victor Hugo', 'Un condamné au bagne, une sainte, une révolution.', 'Les Misérables Victor Hugo'],
    ['1984 — George Orwell', 'La dystopie de référence sur la surveillance et le pouvoir.', '1984 Orwell'],
    ['L’Étranger — Albert Camus', 'L’absurde au soleil d’Alger.', 'The Stranger Camus'],
    ['Crime et Châtiment — Dostoïevski', 'Un meurtre, une conscience, Saint-Pétersbourg.', 'Crime and Punishment Dostoevsky'],
    ['Madame Bovary — Flaubert', 'Le réalisme à son sommet.', 'Madame Bovary Flaubert']
  ],
  sciences: [
    ['Sapiens — Yuval Noah Harari', 'Comment une espèce insignifiante a pris le contrôle de la planète.', 'Sapiens Harari'],
    ['Une brève histoire du temps — Hawking', 'Trous noirs et Big Bang, sans équations.', 'A Brief History of Time Hawking'],
    ['De l’origine des espèces — Darwin', 'Le texte fondateur de la biologie.', 'On the Origin of Species Darwin'],
    ['Silent Spring — Rachel Carson', 'Le livre qui a lancé l’écologie politique.', 'Silent Spring Rachel Carson'],
    ['Le Mythe de Sisyphe — Camus', 'Le sens de la vie quand le monde est absurde.', 'The Myth of Sisyphus Camus']
  ],
  histoire: [
    ['Mémoires de guerre — De Gaulle', 'La France libre racontée par son chef.', 'Memoires de guerre De Gaulle'],
    ['Montaillou — Le Roy Ladurie', 'Un village cathare reconstitué par les archives de l’Inquisition.', 'Montaillou Le Roy Ladurie'],
    ['Le Dimanche de Bouvines — Duby', 'Une bataille, une société entière reconstituée.', 'Le Dimanche de Bouvines Duby'],
    ['Mémoires d’Hadrien — Yourcenar', 'Un empereur se regarde vivre.', 'Memoirs of Hadrian Yourcenar'],
    ['La Civilisation de la Renaissance — Burckhardt', 'L’Italie qui invente la modernité.', 'The Civilization of the Renaissance Burckhardt']
  ],
  economie: [
    ['Le Capital — Marx', 'Le texte économique le plus commenté de l’histoire.', 'Das Kapital Marx'],
    ['La Richesse des nations — Adam Smith', 'La main invisible et la naissance de l’économie politique.', 'Wealth of Nations Adam Smith'],
    ['Sapiens — Harari', 'L’économie vue à l’échelle de l’espèce.', 'Sapiens Harari'],
    ['Capital au XXIᵉ siècle — Piketty', 'Les inégalités mesurées sur trois siècles.', 'Capital in the Twenty-First Century Piketty'],
    ['Théorie de la classe de loisir — Veblen', 'La consommation ostensible décortiquée.', 'The Theory of the Leisure Class Veblen']
  ],
  technique: [
    ['Gödel, Escher, Bach — Hofstadter', 'Boucles étranges, esprit et machines.', 'Godel Escher Bach Hofstadter'],
    ['The Mythical Man-Month — Brooks', 'Pourquoi les projets logiciels prennent toujours du retard.', 'The Mythical Man-Month Brooks'],
    ['Structure of Scientific Revolutions — Kuhn', 'Les paradigmes et les révolutions scientifiques.', 'The Structure of Scientific Revolutions Kuhn'],
    ['Cybernetics — Wiener', 'La science du contrôle et de la communication.', 'Cybernetics Wiener'],
    ['Design Patterns — Gamma et al.', 'Les solutions récurrentes du génie logiciel.', 'Design Patterns Gamma']
  ],
  arts: [
    ['Histoire de l’art — Gombrich', '« L’art n’a pas d’histoire de l’art, il y a des artistes. » — la référence.', 'The Story of Art Gombrich'],
    ['Ways of Seeing — John Berger', 'Comment regarder les images autrement.', 'Ways of Seeing Berger'],
    ['Le Musée imaginaire — Malraux', 'L’art à l’ère de la reproduction.', 'Museum Without Walls Malraux'],
    ['Histoire de la musique — Roland Manuel', 'Du plain-chant au jazz en un volume.', 'Histoire de la musique Roland Manuel']
  ]
};

/* Recommandations par catégorie de recherche : liste [titre, texte, requête] */
function recosPour(tabId, catId) {
  const pool = { tout: TOUT_RECOS, livres: LIVRES_RECOS, journaux: JOURNAUX_RECOS, magazines: MAGASINES_RECOS,
    revues: REVUES_RECOS, theses: THESES_RECOS, bd: BD_RECOS, manga: MANGA_RECOS }[tabId];
  return pool?.[catId] || [];
}
/* Historique des recherches (préférence locale, max 8 — réutilisable en un clic) */
function historique() {
  return getStore('lecture:histo', []);
}
function pousserHisto(q) {
  const h = historique().filter(x => x !== q);
  h.unshift(q);
  setStore('lecture:histo', h.slice(0, 8));
}

/* Recommandations liées à la catégorie choisie (5 à 10) — un clic lance la recherche */
function blocRecommandations(tabId, catId) {
  const recos = recosPour(tabId, catId);
  if (!recos.length) return '';
  const cat = CATEGORIES.find(c => c.id === tabId);
  const sousCat = cat?.cats.find(s => s.id === catId);
  return '<div class="summary-card"><h2>✨ ' + esc(sousCat?.nom || 'Recommandations') + '</h2>' +
    '<p class="meta-count">Quelques pistes en lien — un clic lance la recherche.</p>' +
    '<ul class="reco-list">' +
    recos.map(r =>
      '<li><button class="reco-btn" data-q="' + esc(r[2]) + '">' +
      '<strong>' + esc(r[0]) + '</strong>' +
      '<span>' + esc(r[1]) + '</span></button></li>').join('') +
    '</ul></div>';
}

function badgeAcces(r) {
  return r.acces === 'ouvert' ? '<span class="badge-access ok">✓ accès libre</span>'
    : r.acces === 'emprunt' ? '<span class="badge-access mid">⤴ emprunt gratuit</span>'
    : r.acces === 'paywall' ? '<span class="badge-access warn">⚠️ paywall probable</span>'
    : '<span class="badge-access">papier seulement</span>';
}

function carteLecture(r, i) {
  const extraitDispo = !!r.extrait;
  const ouvrage = r.type === 'livre' || r.type === 'patrimoine';
  return '<div class="article lecture-item">' +
    '<h3>' + esc(r.titre) + '</h3><div class="meta">' +
    esc(r.auteurs.join(', ')) +
    (r.annee ? ' · ' + esc(String(r.annee)) : '') +
    (r.revue ? ' · ' + esc(r.revue) : '') +
    ' · ' + esc(r.source) + '</div>' +
    '<div class="meta">' + badgeAcces(r) + '</div>' +
    '<div class="lec-actions">' +
    (extraitDispo ? '<button class="filter-btn" data-lit="' + i + '">📖 Résumé</button>' : '') +
    (ouvrage ? '<button class="filter-btn active" data-ouvrir="' + i + '">📚 Ouvrir dans le lecteur</button>' : '') +
    (r.pdf ? '<a class="filter-btn" href="' + esc(urlSure(r.pdf)) + '" target="_blank" rel="noopener">PDF libre</a>' : '') +
    '<a class="filter-btn" href="' + esc(urlSure(r.lien)) + '" target="_blank" rel="noopener">Source ↗</a>' +
    '</div></div>';
}

export function vueLecture() {
  const view = $('#view');
  /* Lecteur d'ouvrage (agent d'ouverture) : prioritaire sur tout */
  if (state.lectureOuverture) return vueOuverture();
  /* Lecteur de résumé : prioritaire sur la liste */
  if (state.lectureLecture) return vueLecteur();
  const recherche = state.lecture || { q: '', cat: 'tout', sousCat: null, resultats: [], etat: null };
  const catActive = CATEGORIES.find(c => c.id === recherche.cat) || CATEGORIES[0];
  const histo = historique();
  view.innerHTML =
    '<div class="chapter-resume"><h2>📖 ' + esc(catActive.nom) + '</h2>' +
    '<p class="meta-count">' + (catActive.id === 'tout'
      ? 'Tous les catalogues fouillés en parallèle — livres, presse, revues, thèses, prépublications.'
      : 'Recherche ciblée — choisis une catégorie puis cherche, ou pars d\u2019une recommandation.') + '</p>' +
    '<form id="lec-form"><div class="subtabs">' +
    CATEGORIES.map(c =>
      '<button type="button" class="subtab' + (recherche.cat === c.id ? ' active' : '') + '" data-cat="' + c.id + '">' +
      c.emoji + ' ' + esc(c.nom) + '</button>').join('') +
    '</div>' +
    '<label class="regl-label">Catégorie de recherche' +
    '<select id="lec-souscat">' +
    '<option value="">— Choisir une catégorie —</option>' +
    catActive.cats.map(s =>
      '<option value="' + s.id + '"' + (recherche.sousCat === s.id ? ' selected' : '') + '>' + esc(s.nom) + '</option>').join('') +
    '</select></label>' +
    '<label>Rechercher…' +
    '<input id="lec-q" type="search" inputmode="search" autocomplete="off" placeholder="ex. Sapiens, Zola, climate change, intelligence artificielle…"' +
    ' value="' + esc(recherche.q) + '"></label>' +
    '<div class="form-actions"><button class="filter-btn active" type="submit">🔎 Chercher</button>' +
    (recherche.etat ? '<button type="button" class="filter-btn" id="lec-reset">✨ Recommandations</button>' : '') +
    '</div></form>' +
    (histo.length && !recherche.etat ? '<p class="hint">Récentes : ' + histo.map(h =>
      '<button type="button" class="tab lec-histo" data-q="' + esc(h) + '">' + esc(h) + '</button>').join(' ') + '</p>' : '') +
    '</div>' +
    (recherche.etat === 'encours'
      ? '<div class="empty">🔎 Recherche en cours…</div>'
      : recherche.etat === 'vide'
        ? '<div class="empty">Aucun résultat — essaie un autre titre, auteur ou mot-clé. 🌱</div>'
        : recherche.etat === 'ok'
          ? (recherche.resultats || []).map((r, i) => carteLecture(r, i)).join('')
          : blocRecommandations(recherche.cat, recherche.sousCat));
  const form = $('#lec-form');
  if (form) form.onsubmit = e => {
    e.preventDefault();
    lancerRechercheLecture(($('#lec-q').value || '').trim(), recherche.cat, $('#lec-souscat').value || null);
  };
  const reset = $('#lec-reset');
  if (reset) reset.onclick = () => {
    state.lecture = { q: '', cat: recherche.cat, sousCat: recherche.sousCat, resultats: [], etat: null };
    renderView();
  };
  const select = $('#lec-souscat');
  if (select) select.onchange = () => {
    state.lecture = { q: recherche.q, cat: recherche.cat, sousCat: select.value || null, resultats: [], etat: null };
    renderView();
  };
  [...document.querySelectorAll('[data-cat]')].forEach(b =>
    b.onclick = () => {
      state.lecture = { q: '', cat: b.dataset.cat, sousCat: null, resultats: [], etat: null };
      renderView();
    });
  [...document.querySelectorAll('.lec-histo, .reco-btn')].forEach(b =>
    b.onclick = () => { lancerRechercheLecture(b.dataset.q, recherche.cat, recherche.sousCat); });
  [...document.querySelectorAll('[data-lit]')].forEach(b =>
    b.onclick = () => {
      const r = (state.lecture?.resultats || [])[parseInt(b.dataset.lit, 10)];
      if (r) { state.lectureLecture = r; renderView(); window.scrollTo(0, 0); }
    });
  [...document.querySelectorAll('[data-ouvrir]')].forEach(b =>
    b.onclick = () => {
      const r = (state.lecture?.resultats || [])[parseInt(b.dataset.ouvrir, 10)];
      if (r) lancerOuverture(r);
    });
}

/* --- Agent d'ouverture : deep-search d'une version numérique, affichage dans
 *     le lecteur intégré — texte intégral paginé, ou conditions d'emprunt. --- */
export function lancerOuverture(r) {
  state.lectureOuverture = { etat: 'encours', base: r };
  renderView();
  ouvrirOuvrage(r)
    .then(res => {
      if (state.lectureOuverture?.base?.titre !== r.titre) return;
      state.lectureOuverture = { ...res, etat: res.type };
      if (res.type === 'texte') {
        state.lectureOuverture.page = 0;
        state.lectureOuverture.pages = paginer(res.texte);
      }
      renderView();
    })
    .catch(() => {
      if (state.lectureOuverture?.base?.titre !== r.titre) return;
      state.lectureOuverture = { type: 'indisponible', raison: 'reseau', lien: r.lien, titre: r.titre, etat: 'indisponible' };
      renderView();
    });
}

/* Découper le texte intégral en pages lisibles (~6 000 caractères, coupure
 * au prochain saut de ligne pour ne pas couper les mots). */
function paginer(texte, taille = 6000) {
  const pages = [];
  let i = 0;
  while (i < texte.length) {
    let fin = Math.min(i + taille, texte.length);
    if (fin < texte.length) {
      const coupure = texte.indexOf('\n', fin - 600);
      if (coupure > i) fin = coupure;
    }
    pages.push(texte.slice(i, fin).trim());
    i = fin;
  }
  return pages;
}

function blocVersion(ouverture) {
  const versions = ouverture.versions || [];
  if (versions.length < 2) return '';
  return '<div class="summary-card"><h2>🔀 Autres versions</h2>' +
    '<p class="meta-count">Autres éditions numériques — si la qualité déçoit (OCR, mise en page), change de version.</p>' +
    '<ul class="reco-list">' +
    versions.map(v =>
      '<li><button class="reco-btn" data-vers="' + esc(v.origine + ':' + v.id) + '">' +
      '<strong>' + esc(v.titre) + '</strong>' +
      '<span>' + (v.acces === 'ouvert' ? '✓ libre' : '⤴ emprunt') +
      ' · ' + esc(v.format || 'ebook') + (v.fr ? ' · 🇫🇷 français' : '') +
      ' · ' + esc(v.origine === 'gutenberg' ? 'Gutenberg #' + v.id : v.id) + '</span></button></li>').join('') +
    '</ul></div>';
}

function vueOuverture() {
  const o = state.lectureOuverture;
  const view = $('#view');
  if (o.etat === 'encours') {
    view.innerHTML =
      '<button class="back-btn" id="btn-back-lecture">← Retour aux résultats</button>' +
      '<div class="empty">🔎 L\u2019agent fouille les éditions numérisées à la recherche d\u2019une version libre et disponible…</div>';
  } else if (o.type === 'texte') {
    view.innerHTML =
      '<button class="back-btn" id="btn-back-lecture">← Retour aux résultats</button>' +
      '<div class="summary-card"><h2>📖 ' + esc(o.titre || o.base?.titre || '') + '</h2>' +
      '<p class="meta-count">Édition : ' + esc(o.edition) + ' · ' +
      (o.natif ? 'ebook natif (texte propre)' : 'OCR (qualité variable)') + '</p>' +
      '<div class="lec-nav">' +
      '<button class="filter-btn" id="lec-prev"' + (o.page === 0 ? ' disabled' : '') + '>← Précédent</button>' +
      '<span class="meta-count">Page ' + (o.page + 1) + ' / ' + o.pages.length + '</span>' +
      '<button class="filter-btn" id="lec-next"' + (o.page >= o.pages.length - 1 ? ' disabled' : '') + '>Suivant →</button>' +
      '</div></div>' +
      '<div class="summary-card lecteur-corps"><p>' + esc(o.pages[o.page]) + '</p></div>' +
      '<div class="form-actions">' +
      (o.epub ? '<a class="filter-btn" href="' + esc(urlSure(o.epub)) + '" target="_blank" rel="noopener" download>⤓ Télécharger l\u2019EPUB</a>' : '') +
      '<a class="filter-btn" href="' + esc(urlSure(o.lien)) + '" target="_blank" rel="noopener">Fiche complète ↗</a>' +
      '</div>' +
      blocVersion(o);
  } else if (o.type === 'emprunt') {
    const c = o.conditions;
    view.innerHTML =
      '<button class="back-btn" id="btn-back-lecture">← Retour aux résultats</button>' +
      '<div class="summary-card"><h2>📚 ' + esc(o.titre || o.base?.titre || '') + '</h2>' +
      '<p class="meta-count">Le texte intégral n\u2019est pas libre — voici les conditions d\u2019emprunt trouvées par l\u2019agent.</p></div>' +
      '<div class="summary-card lecteur-corps">' +
      '<h2 style="font-size:15px">Conditions d\u2019emprunt</h2>' +
      '<p>✓ Cette édition est <strong>prêtable gratuitement</strong> via Internet Archive (contrôle : un lecteur à la fois, comme une vraie bibliothèque).</p>' +
      '<p>· Statut de prêt : <strong>' + esc(c.statut || 'prêtable') + '</strong></p>' +
      '<p>· Collections : ' + esc(c.collections.join(', ')) + '</p>' +
      (c.formats?.length ? '<p>· Formats numériques : ' + esc(c.formats.join(', ')) + '</p>' : '') +
      '<p>· Durée usuelle : 1 heure (lecture en ligne) ou 14 jours (emprunt EPUB/PDF, selon l\u2019édition).</p>' +
      '<p>· Un <strong>compte Internet Archive gratuit</strong> est nécessaire pour emprunter.</p>' +
      '</div>' +
      '<div class="form-actions">' +
      '<a class="filter-btn active" href="' + esc(urlSure(o.lien)) + '" target="_blank" rel="noopener">⤴ Emprunter sur Archive.org</a>' +
      '</div>' +
      blocVersion(o);
  } else {
    const raisons = {
      gallica: 'Cette édition est sur Gallica — le lecteur intégré de la BnF l\u2019affichera directement.',
      numerique: 'Aucune édition numérisée libre n\u2019a été trouvée pour cet ouvrage.',
      protege: 'Des éditions numérisées existent mais aucune n\u2019est disponible en ce moment.',
      reseau: 'L\u2019agent n\u2019a pas pu joindre les catalogues — retente dans un instant.'
    };
    view.innerHTML =
      '<button class="back-btn" id="btn-back-lecture">← Retour aux résultats</button>' +
      '<div class="empty">ℹ️ ' + esc(raisons[o.raison] || raisons.numerique) + '</div>' +
      '<div class="form-actions">' +
      '<a class="filter-btn" href="' + esc(urlSure(o.lien || '#')) + '" target="_blank" rel="noopener">Voir sur le site source ↗</a>' +
      '</div>' +
      (o.versions ? blocVersion(o) : '');
  }
  const back = $('#btn-back-lecture');
  if (back) back.onclick = () => { state.lectureOuverture = null; renderView(); window.scrollTo(0, 0); };
  const prev = $('#lec-prev');
  if (prev) prev.onclick = () => { if (o.page > 0) { o.page--; renderView(); window.scrollTo(0, 0); } };
  const next = $('#lec-next');
  if (next) next.onclick = () => { if (o.page < o.pages.length - 1) { o.page++; renderView(); window.scrollTo(0, 0); } };
  [...document.querySelectorAll('[data-vers]')].forEach(b =>
    b.onclick = () => {
      const v = (o.versions || []).find(x => x.origine + ':' + x.id === b.dataset.vers);
      if (!v) return;
      o.etat = 'encours';
      renderView();
      ouvrirVersion(v, o.versions)
        .then(res => {
          if (res.type === 'texte') { res.pages = paginer(res.texte); res.page = 0; }
          state.lectureOuverture = { ...res, etat: res.type, base: o.base };
          renderView(); window.scrollTo(0, 0);
        })
        .catch(() => { o.etat = o.type; renderView(); });
    });
}

/* --- Lecteur intégré : le résumé dans l'app, bouton retour à la liste --- */
function vueLecteur() {
  const r = state.lectureLecture;
  const view = $('#view');
  view.innerHTML =
    '<button class="back-btn" id="btn-back-lecture">← Retour aux résultats</button>' +
    '<div class="summary-card"><h2>📖 ' + esc(r.titre) + '</h2>' +
    '<p class="meta-count">' + esc(r.auteurs.join(', ')) +
    (r.annee ? ' · ' + esc(String(r.annee)) : '') +
    (r.revue ? ' · ' + esc(r.revue) : '') +
    ' · ' + esc(r.source) + ' · ' + '</p>' +
    '<p class="meta-count">' + badgeAcces(r) + '</p></div>' +
    '<div class="summary-card lecteur-corps"><p>' + esc(r.extrait || 'Pas de résumé disponible pour ce document.') + '</p></div>' +
    '<div class="form-actions">' +
    (r.pdf ? '<a class="filter-btn active" href="' + esc(urlSure(r.pdf)) + '" target="_blank" rel="noopener">📄 PDF libre</a>' : '') +
    '<a class="filter-btn" href="' + esc(urlSure(r.lien)) + '" target="_blank" rel="noopener">Ouvrir la source ↗</a>' +
    '</div>';
  $('#btn-back-lecture').onclick = () => { state.lectureLecture = null; renderView(); window.scrollTo(0, 0); };
}

/* La recherche s'exécute sans re-rendu du champ (les valeurs tapées restent),
 * puis affiche les résultats — comme le formulaire d'ajout de médias. */
export function lancerRechercheLecture(q, cat, sousCat) {
  if (!q) return;
  state.lecture = { q, cat, sousCat: sousCat || null, resultats: [], etat: 'encours' };
  renderView();
  pousserHisto(q);
  chercher(cat, q)
    .then(resultats => {
      if (state.lecture?.q !== q) return; /* une nouvelle recherche a pris la main */
      state.lecture = { q, cat, sousCat: sousCat || null, resultats, etat: resultats.length ? 'ok' : 'vide' };
      renderView();
    })
    .catch(() => {
      if (state.lecture?.q !== q) return;
      state.lecture = { q, cat, sousCat: sousCat || null, resultats: [], etat: 'vide' };
      renderView();
    });
}
