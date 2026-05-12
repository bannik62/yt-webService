/** Découverte variée — mot-clé tiré au hasard (liste générale) */
export const TRENDING_KEYWORDS_GENERAL = [
  // Musique & Culture
  'hits 2026',
  'top musique 2026 francais',
  'nouveaux artistes francais 2026',
  'rap francais 2026',
  'concert live francais',
  
  // Viral & Tendances
  'viral this week francais',
  'trending france',
  'buzz du moment francais',
  'meme francais 2026',
  'tiktok compilation francais',
  
  // Cinéma & Séries
  'short film francais',
  'film entier en francais',
  'bande annonce vf 2026',
  'critique film francais',
  'analyse série francais',
  
  // Documentaires & Reportages
  'documentary francais',
  'reportage France francais',
  'investigation francais',
  'documentaire nature francais',
  'reportage société francais 2026',
  
  // Tech & Innovation
  'tech review francais',
  'test high tech francais',
  'nouveauté tech 2026 francais',
  'smartphone test francais',
  'IA actualité francais 2026',
  
  // Gaming
  'gaming highlights francais',
  'clash royale francais',
  'gameplay francais 2026',
  'let\'s play francais',
  'esport france',
  'gaming news francais',
  
  // Cuisine & Lifestyle
  'cooking recipe',
  'recette facile francais',
  'chef cuisine francais',
  'street food france',
  
  // Science & Éducation
  'science explained francais',
  'vulgarisation scientifique francais',
  'TED talk français',
  'deep dive explained francais',
  'c\'est pas sorcier',
  
  // Humour & Divertissement
  'comedy sketch francais',
  'sketch humour français',
  'stand up francais 2026',
  'parodie francais',
  'best of humour francais',
  
  // Voyage & Aventure
  'travel vlog francais',
  'voyage france 2026',
  'roadtrip francais',
  'backpacking francais',
  'vanlife',
  'autonomie francais',
  'permaculture francais',
  
  // Sport & Fitness
  'workout motivation francais',
  'musculation francais',
  'coaching sport francais',
  'yoga francais',
  
  // Créateurs & Behind the Scenes
  'making of',
  'behind the scenes francais',
  'doc nozman francais',
  'squeezie',
  'mcfly et carlito',
  'le rire jaune',
  'cyprien',
  'norman',
  'joueur du grenier',
  'e-pensé',
  'idriss aberkane',
  'revue du monde',
  'poisson fécond',
  // Gaming & Divertissement (10M+)
  'squeezie',
  'gotaga',
  'michou',
  'inoxtag',
  
  // Humour & Sketches (5M+)
  'cyprien',
  'norman fait des vidéos',
  'natoo',
  'mcfly et carlito',
  'le rire jaune',
  'amixem',
  'fastgoodcuisine',
  
  // Gaming & Let's Play
  'joueur du grenier',
  'xari',
  'domingo',
  'lebouseuh',
  'fuze iii',
  'maghla',
  'joyca',
  
  // Lifestyle & Vlogs
  'enjoyphoenix',
  'sananas',
  'lena situations',
  'just riadh',
  'lebouseuh',
  
  // Tech & Science
  'doc seven',
  'poisson fécond',
  'une baguette',
  'dirty biology',
  'science étonnante',
  'nota bene',
  
  // Musique & Rap
  'squeezie gaming',
  'seb la frite',
  'tim',
  'mister v',
  'domingo',
  
  // Cinéma & Critique
  'le fossoyeur de films',
  'durendal',
  'chroma',
  'crossed',
  
  // Sport & Aventure
  'tibo inshape',
  'terrafrost',
  'hugo décrypte',
  
  // Cuisine
  'chef michel dumas',
  'fastgoodcuisine',
  'la petite bette',
  
  // Éducation & Vulgarisation
  'e-penser',
  'chat sceptique',
  'dans ton corps',
  'max bird',
  'linguisticae',
  
  // Inclassables & Multi-formats
  'jimmy fait l\'con',
  'la ferme jérôme',
  'superconnerie',
  'georges',
  'cilabus',
  'exclarrogatif',
  'les freres poulain',
  'le journal de l \'espace',
  
  
  // Podcasts & Interviews
  'podcast interview francais',
  'podcast actualité francais 2026',
  'interview exclusive francais',
  
  // Animation & Créatif
  'animation short francais',
  'motion design francais',
  'court métrage animation',
  
  // Dev & Code (ton domaine)
  'nouveauté css 2026 francais',
  'nouveauté html 2026 francais',
  'nouveauté javascript 2026 francais',
  'nouveauté svelte 2026 francais',
  'tuto dev web francais 2026',
  'fullstack tutorial francais',
  'node.js francais 2026',
  
  // Cybersécurité
  'sécurité informatique',
  'cybersecurity français',
  'cybersecurity en français',
  'cybersecurity en français 2026',
  'hacking ethique francais',
  'pentesting francais',
  
  // Formats spécifiques
  'reaction video francais',
  'défi challenge francais',
  'vlog quotidien francais',
  'asmr francais',
  'unboxing francais 2026',
];

export const TRENDING_KEYWORDS_MUSIC = [
  'clip officiel',
  'nouveautés musique 2026',
  'live acoustique',
  'remix viral',
  'jazz lounge',
  'hip hop francophone',
  'rock live session',
  'deep house mix',
  'chanson française 2026',
  'acoustic cover',
  'classical piano relax',
  'pop hits 2026',
  'indie music 2026',
  'festival live music',
  'slow jam R&B',
  'electro français'
];

export function pickTrendingKeyword(musicOnly) {
  const list = musicOnly ? TRENDING_KEYWORDS_MUSIC : TRENDING_KEYWORDS_GENERAL;
  return list[Math.floor(Math.random() * list.length)];
}
