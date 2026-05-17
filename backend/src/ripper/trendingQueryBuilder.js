/** Sujet / domaine (général + discovery) */
const SUBJECTS_GENERAL = [
  'documentaire',
  'reportage',
  'court métrage',
  'voyage',
  'cuisine',
  'science',
  'technologie',
  'histoire',
  'nature',
  'sport',
  'humour',
  'gaming',
  'musique',
  'cinéma',
  'photographie',
  'artisanat',
  'bricolage',
  'jardinage',
  'automobile',
  'vélo',
  'randonnée',
  'plongée',
  'astronomie',
  'psychologie',
  'économie',
  'politique',
  'société',
  'écologie',
  'architecture',
  'design',
  'mode',
  'beauté',
  'fitness',
  'yoga',
  'méditation',
  'podcast',
  'interview',
  'débat',
  'vulgarisation',
  'expérience',
  'street food',
  'pâtisserie',
  'fromage',
  'vin',
  'café',
  'urbex',
  'vanlife',
  'roadtrip',
  'camping',
  'pêche',
  'escalade',
  'surf',
  'ski',
  'boxe',
  'danse',
  'théâtre',
  'stand up',
  'magie',
  'origami',
  'peinture',
  'poterie',
  'menuiserie',
  'électronique',
  'robotique',
  'impression 3d',
  'cybersécurité',
  'intelligence artificielle',
  'espace',
  'océan',
  'volcan',
  'archéologie',
  'mythologie',
  'linguistique',
  'philosophie',
  'religion',
  'météo',
  'tempête',
  'catastrophe',
  'survie',
  'bushcraft',
  'minimalisme',
  'zéro déchet',
  'permaculture',
  'apiculture',
  'mycologie',
  'jazz',
  'techno',
  'live',
  'concert',
  'radio amateur',
  'vhs',
  'cassette',
  'caméscope',
  'mini dv',
  'archive tv',
  'festival local',
  'association',
  'lycée',
  'vlog',
  'exploration',
  'film étudiant',
  'drone',
  'enquête',
];

const VERBS_GENERAL = [
  'découverte',
  'making of',
  'analyse',
  'critique',
  'test',
  'comparaison',
  'tutoriel',
  'explication',
  'histoire de',
  'enquête',
  'investigation',
  'témoignage',
  'portrait',
  'visite',
  'exploration',
  'challenge',
  'expérience',
  'réaction',
  'défi',
  'compilation',
  'best of',
  'fail',
  'succès',
  'avant après',
  'restauration',
  'démystification',
  'mythe',
  'vérité sur',
  'secrets de',
  'coulisses',
  'jour dans la vie',
  '24 heures',
  'première fois',
  'dernier épisode',
  'épisode complet',
  'intégrale',
  'résumé',
  'synthèse',
  'débat',
  'archive',
  'captation',
  'numérisation',
  'rediffusion',
  'version rare',
  'improvisation',
  'freestyle',
];

const MODIFIERS_GENERAL = [
  'français',
  'france',
  'francophone',
  'belge',
  'québécois',
  'europe',
  'paris',
  'province',
  'rural',
  'urbain',
  'amateur',
  'indépendant',
  'local',
  'régional',
  'underground',
  'rare',
  'oublié',
  'vintage',
  'rétro',
  'nostalgie',
  '2024',
  '2025',
  '2026',
  'récent',
  'nouveau',
  'court format',
  'long format',
  'ambiance',
  'relax',
  'éducatif',
  'inspirant',
  'surprenant',
  'insolite',
  'bizarre',
  'touchant',
  'drôle',
  'sérieux',
  'profond',
  'léger',
  'analogique',
  'introuvable',
  'faible audience',
  'petite chaîne',
  'nouveau créateur',
  'passionné',
  'old school',
  'caméra embarquée',
];

/** Termes « archive / long tail » (général) */
const RARE_TERMS = [
  'archive perdue',
  'reupload',
  'rip tv',
  'captation oubliée',
  'émission oubliée',
  'concert perdu',
  'vidéo supprimée',
  'numérisé',
  'cassette retrouvée',
  'vhs rare',
  'version introuvable',
  'première vidéo',
];

/** Meta YouTube / découverte — poids faible dans les patterns */
const DISCOVERY_TERMS = [
  'petit youtubeur',
  'chaîne inconnue',
  'micro créateur',
  'vidéo cachée',
  'pépite',
  'rabbit hole',
  'hidden gem',
  'trouvé par hasard',
  'recommandation étrange',
];

const RARE_TERMS_MUSIC = [
  'bootleg',
  'session perdue',
  'concert oublié',
  'maquette',
  'démo rare',
  'version studio inédite',
];

const SUBJECTS_MUSIC = [
  'chanson',
  'album',
  'single',
  'clip',
  'live',
  'concert',
  'session',
  'acoustique',
  'piano',
  'guitare',
  'violon',
  'batterie',
  'voix',
  'chorale',
  'orchestre',
  'jazz',
  'blues',
  'rock',
  'metal',
  'punk',
  'rap',
  'hip hop',
  'rnb',
  'soul',
  'funk',
  'électro',
  'house',
  'techno',
  'trance',
  'dubstep',
  'reggae',
  'ska',
  'country',
  'folk',
  'celtique',
  'classique',
  'opéra',
  'bande originale',
  'remix',
  'cover',
  'medley',
  'mashup',
  'beat',
  'instrumental',
  'a cappella',
  'playlist',
  'mix',
  'dj set',
  'festival',
  'scène',
];

const VERBS_MUSIC = [
  'live',
  'session',
  'cover',
  'remix',
  'reprise',
  'version',
  'acoustique',
  'unplugged',
  'studio',
  'répétition',
  'improvisation',
  'jam',
  'battle',
  'freestyle',
  'feat',
  'mashup',
  'médley',
  'slow',
  'speed up',
  'nightcore',
  'lofi',
  'chill',
  'relax',
  'énergique',
  'festif',
  'tribute',
  'hommage',
  'reaction',
  'écoute',
  'découverte',
];

const MODIFIERS_MUSIC = [
  'français',
  'france',
  'francophone',
  'belge',
  'québécois',
  'indie',
  'underground',
  'émergent',
  'nouveau talent',
  'amateur',
  '2024',
  '2025',
  '2026',
  'viral',
  'tendance',
  'rare',
  'oublié',
  'vinyle',
  'cassette',
  'nostalgie',
  'acoustique',
  'électrique',
  'symphonique',
  'minimal',
  'orchestral',
  'nocturne',
  'matinal',
  'été',
  'hiver',
  'pluie',
];

/**
 * @typedef {object} PatternCtx
 * @property {string} subject
 * @property {string} verb
 * @property {string} modifier
 * @property {string} rare
 * @property {string} discovery
 */

/**
 * @typedef {object} QueryPattern
 * @property {number} weight
 * @property {string} id
 * @property {(ctx: PatternCtx) => string} build
 * @property {(ctx: PatternCtx) => { subject: string, verb: string, modifier: string }} fields
 */

/** @type {QueryPattern[]} */
const QUERY_PATTERNS_GENERAL = [
  {
    weight: 10,
    id: 'svo',
    build: (c) => `${c.subject} ${c.verb} ${c.modifier}`,
    fields: (c) => ({ subject: c.subject, verb: c.verb, modifier: c.modifier }),
  },
  {
    weight: 7,
    id: 'sm',
    build: (c) => `${c.subject} ${c.modifier}`,
    fields: (c) => ({ subject: c.subject, verb: '', modifier: c.modifier }),
  },
  {
    weight: 6,
    id: 'vs',
    build: (c) => `${c.verb} ${c.subject}`,
    fields: (c) => ({ subject: c.subject, verb: c.verb, modifier: '' }),
  },
  {
    weight: 6,
    id: 'sr',
    build: (c) => `${c.subject} ${c.rare}`,
    fields: (c) => ({ subject: c.subject, verb: c.rare, modifier: '' }),
  },
  {
    weight: 5,
    id: 'sd',
    build: (c) => `${c.subject} ${c.discovery}`,
    fields: (c) => ({ subject: c.subject, verb: c.discovery, modifier: '' }),
  },
  {
    weight: 4,
    id: 'smr',
    build: (c) => `${c.subject} ${c.modifier} ${c.rare}`,
    fields: (c) => ({ subject: c.subject, verb: c.rare, modifier: c.modifier }),
  },
  {
    weight: 3,
    id: 'sdm',
    build: (c) => `${c.subject} ${c.discovery} ${c.modifier}`,
    fields: (c) => ({
      subject: c.subject,
      verb: c.discovery,
      modifier: c.modifier,
    }),
  },
];

/** Musique : pas de termes type « rabbit hole » */
/** @type {QueryPattern[]} */
const QUERY_PATTERNS_MUSIC = [
  {
    weight: 12,
    id: 'svo',
    build: (c) => `${c.subject} ${c.verb} ${c.modifier}`,
    fields: (c) => ({ subject: c.subject, verb: c.verb, modifier: c.modifier }),
  },
  {
    weight: 8,
    id: 'sm',
    build: (c) => `${c.subject} ${c.modifier}`,
    fields: (c) => ({ subject: c.subject, verb: '', modifier: c.modifier }),
  },
  {
    weight: 6,
    id: 'vs',
    build: (c) => `${c.verb} ${c.subject}`,
    fields: (c) => ({ subject: c.subject, verb: c.verb, modifier: '' }),
  },
  {
    weight: 5,
    id: 'sr',
    build: (c) => `${c.subject} ${c.rare}`,
    fields: (c) => ({ subject: c.subject, verb: c.rare, modifier: '' }),
  },
];

/** Créateurs FR — tirage rare */
export const YOUTUBERS_FR = [
  'squeezie',
  'mcfly et carlito',
  'le rire jaune',
  'cyprien',
  'norman',
  'norman fait des vidéos',
  'joueur du grenier',
  'e-pensé',
  'idriss aberkane',
  'revue du monde',
  'poisson fécond',
  'gotaga',
  'michou',
  'inoxtag',
  'natoo',
  'amixem',
  'fastgoodcuisine',
  'xari',
  'domingo',
  'lebouseuh',
  'fuze iii',
  'maghla',
  'joyca',
  'enjoyphoenix',
  'sananas',
  'lena situations',
  'just riadh',
  'doc seven',
  'doc nozman',
  'une baguette',
  'dirty biology',
  'science étonnante',
  'nota bene',
  'seb la frite',
  'tim',
  'mister v',
  'le fossoyeur de films',
  'durendal',
  'chroma',
  'crossed',
  'tibo inshape',
  'terrafrost',
  'hugo décrypte',
  'chef michel dumas',
  'la petite bette',
  'chat sceptique',
  'dans ton corps',
  'max bird',
  'linguisticae',
  "jimmy fait l'con",
  'la ferme jérôme',
  'superconnerie',
  'georges',
  'cilabus',
  'exclarrogatif',
  'les freres poulain',
  "le journal de l'espace",
  'curionautes des sciences',
  'Ludikids',
];

/** Probabilité d’utiliser un nom de chaîne au lieu d’une phrase composée */
export const CREATOR_QUERY_CHANCE = 0.1;

const RECENT_MAX = 100;
const MAX_BUILD_ATTEMPTS = 20;
const QUERY_MAX_LEN = 80;

/** @type {string[]} */
const recentQueries = [];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * @template T
 * @param {Array<{ weight: number } & T>} items
 * @returns {T}
 */
function weightedPick(items) {
  const pool = items.flatMap((item) => Array(item.weight).fill(item));
  return pick(pool);
}

function normalizeQuery(q) {
  return q.replace(/\s+/g, ' ').trim().slice(0, QUERY_MAX_LEN);
}

function rememberQuery(query) {
  recentQueries.push(query);
  while (recentQueries.length > RECENT_MAX) recentQueries.shift();
}

function isRecent(query) {
  return recentQueries.includes(query);
}

/**
 * @param {string[]} modifiersPool
 * @param {boolean} musicOnly
 */
function pickWeightedModifier(modifiersPool, musicOnly) {
  if (musicOnly) {
    return weightedPick([
      { value: 'rare', weight: 8 },
      { value: 'oublié', weight: 7 },
      { value: pick(modifiersPool), weight: 5 },
    ]);
  }
  return weightedPick([
    { value: 'rare', weight: 10 },
    { value: 'oublié', weight: 9 },
    { value: 'underground', weight: 8 },
    { value: pick(modifiersPool), weight: 5 },
  ]);
}

/**
 * @param {string[]} pool
 * @param {string} subject
 */
function pickVerb(pool, subject) {
  for (let i = 0; i < 4; i++) {
    const verb = pick(pool);
    if (verb !== subject) return verb;
  }
  return pick(pool);
}

/**
 * @param {QueryPattern} pattern
 * @param {PatternCtx} ctx
 */
function buildFromPattern(pattern, ctx) {
  const query = normalizeQuery(pattern.build(ctx));
  const { subject, verb, modifier } = pattern.fields(ctx);
  const source = pattern.id === 'svo' ? 'composed' : 'pattern';
  return { query, subject, verb, modifier, source, pattern: pattern.id };
}

/**
 * @param {string} name
 */
function buildCreatorQuery(name) {
  return {
    query: name,
    subject: name,
    verb: 'créateur',
    modifier: '',
    source: 'creator',
  };
}

function tryPickCreatorQuery() {
  for (let attempt = 0; attempt < MAX_BUILD_ATTEMPTS; attempt++) {
    const name = pick(YOUTUBERS_FR);
    if (!isRecent(name)) {
      rememberQuery(name);
      return buildCreatorQuery(name);
    }
  }
  const name = pick(YOUTUBERS_FR);
  rememberQuery(name);
  return buildCreatorQuery(name);
}

/**
 * @param {boolean} musicOnly
 */
function buildPatternQuery(musicOnly) {
  const subjects = musicOnly ? SUBJECTS_MUSIC : SUBJECTS_GENERAL;
  const verbs = musicOnly ? VERBS_MUSIC : VERBS_GENERAL;
  const modifiersPool = musicOnly ? MODIFIERS_MUSIC : MODIFIERS_GENERAL;
  const patterns = musicOnly ? QUERY_PATTERNS_MUSIC : QUERY_PATTERNS_GENERAL;
  const rarePool = musicOnly ? RARE_TERMS_MUSIC : RARE_TERMS;

  for (let attempt = 0; attempt < MAX_BUILD_ATTEMPTS; attempt++) {
    const subject = pick(subjects);
    const verb = pickVerb(verbs, subject);
    const modifier = pickWeightedModifier(modifiersPool, musicOnly);
    const rare = pick(rarePool);
    const discovery = musicOnly ? '' : pick(DISCOVERY_TERMS);

    /** @type {PatternCtx} */
    const ctx = { subject, verb, modifier, rare, discovery };
    const pattern = weightedPick(patterns);
    const built = buildFromPattern(pattern, ctx);

    if (built.query && !isRecent(built.query)) {
      rememberQuery(built.query);
      return built;
    }
  }

  const subject = pick(subjects);
  const modifier = pickWeightedModifier(modifiersPool, musicOnly);
  const query = normalizeQuery(`${subject} ${modifier} rare`);
  rememberQuery(query);
  return {
    query,
    subject,
    verb: 'rare',
    modifier,
    source: 'fallback',
  };
}

/**
 * @param {boolean} musicOnly
 * @returns {{
 *   query: string,
 *   subject: string,
 *   verb: string,
 *   modifier: string,
 *   source: 'composed' | 'creator' | 'pattern' | 'fallback',
 *   pattern?: string
 * }}
 */
export function buildTrendingQuery(musicOnly = false) {
  if (Math.random() < CREATOR_QUERY_CHANCE) {
    return tryPickCreatorQuery();
  }
  return buildPatternQuery(musicOnly);
}

/** @deprecated utiliser buildTrendingQuery */
export function pickTrendingKeyword(musicOnly) {
  return buildTrendingQuery(musicOnly).query;
}
