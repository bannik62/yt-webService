/** Sujet / domaine */
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
  'sans commentaire',
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

/** Créateurs FR (ancienne liste tendances) — tirage rare */
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

const RECENT_MAX = 80;
const MAX_BUILD_ATTEMPTS = 12;

/** @type {string[]} */
const recentQueries = [];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rememberQuery(query) {
  recentQueries.push(query);
  while (recentQueries.length > RECENT_MAX) recentQueries.shift();
}

/**
 * @param {string} name
 * @returns {{ query: string, subject: string, verb: string, modifier: string, source: 'creator' }}
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
    if (!recentQueries.includes(name)) {
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
 * @returns {{ query: string, subject: string, verb: string, modifier: string, source?: 'composed' | 'creator' }}
 */
export function buildTrendingQuery(musicOnly = false) {
  if (Math.random() < CREATOR_QUERY_CHANCE) {
    return tryPickCreatorQuery();
  }

  const subjects = musicOnly ? SUBJECTS_MUSIC : SUBJECTS_GENERAL;
  const verbs = musicOnly ? VERBS_MUSIC : VERBS_GENERAL;
  const modifiers = musicOnly ? MODIFIERS_MUSIC : MODIFIERS_GENERAL;

  for (let attempt = 0; attempt < MAX_BUILD_ATTEMPTS; attempt++) {
    const subject = pick(subjects);
    const verb = pick(verbs);
    const modifier = pick(modifiers);
    const query = `${subject} ${verb} ${modifier}`.replace(/\s+/g, ' ').trim();

    if (!recentQueries.includes(query)) {
      rememberQuery(query);
      return { query, subject, verb, modifier, source: 'composed' };
    }
  }

  const subject = pick(subjects);
  const verb = pick(verbs);
  const modifier = pick(modifiers);
  const query = `${subject} ${verb} ${modifier}`;
  return { query, subject, verb, modifier, source: 'composed' };
}

/** @deprecated utiliser buildTrendingQuery */
export function pickTrendingKeyword(musicOnly) {
  return buildTrendingQuery(musicOnly).query;
}
