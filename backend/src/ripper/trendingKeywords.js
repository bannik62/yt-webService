/** Découverte variée — mot-clé tiré au hasard (liste générale) */
export const TRENDING_KEYWORDS_GENERAL = [
  'hits 2026',
  'viral this week francais',
  'short film francais',
  'documentary francais',
  'tech review francais',
  'gaming highlights francais',
  'cooking recipe',
  'science explained francais',
  'comedy sketch francais',
  'travel vlog francais',
  'workout motivation francais',
  'making of',
  'podcast interview francais',
  'reportage France francais',
  'test high tech francais',
  'animation short francais',
  'behind the scenes francais',
  'TED talk français',
  'sketch humour français',
  'deep dive explained francais',
  'clash royale francais',
  'securité informatique',
  'cybersecurity français',
  'cybersecurity en français',
  'cybersecurity en français 2026',
  'nouveauté css 2026 francais',
  'nouveauté html 2026 francais',
  'nouveauté javascript 2026 francais',
  'nouveauté svelte 2026 francais',
  'doc nozman francais',
  'film entier en francais',
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
