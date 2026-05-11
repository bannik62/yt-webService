/** Découverte variée — mot-clé tiré au hasard (liste générale) */
export const TRENDING_KEYWORDS_GENERAL = [
  'hits 2026',
  'viral this week',
  'short film',
  'documentary',
  'tech review',
  'gaming highlights',
  'cooking recipe',
  'science explained',
  'comedy sketch',
  'travel vlog',
  'workout motivation',
  'making of',
  'podcast interview',
  'reportage France',
  'test high tech',
  'animation short',
  'behind the scenes',
  'TED talk français',
  'sketch humour français',
  'deep dive explained'
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
