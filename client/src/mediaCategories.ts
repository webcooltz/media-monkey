// Single source of truth for how folders map to the home-page rows.
// `match` tests a folder name (case-insensitive) to bucket its media.
export interface MediaCategory {
  key: string;
  label: string;
  match: (folderNameLower: string) => boolean;
}

export const mediaCategories: MediaCategory[] = [
  { key: 'tv', label: 'TV Shows', match: n => n.includes('tv') },
  { key: 'movies', label: 'Movies', match: n => n.includes('movie') },
  { key: 'music', label: 'Music', match: n => n.includes('music') },
  { key: 'audiobooks', label: 'Audiobooks', match: n => n.includes('audiobook') },
];

export function categoryForFolder(folderName: string): MediaCategory | undefined {
  const lower = folderName.toLowerCase();
  return mediaCategories.find(c => c.match(lower));
}
