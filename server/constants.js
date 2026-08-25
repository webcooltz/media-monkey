// File-type sets and folder-category rules — single source of truth for scanning.

const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
const playableExtensions = ['.mp4', '.m4v', '.webm', '.mov', '.mkv', '.avi', '.mp3', '.m4a', '.aac', '.wav', '.flac'];
const subtitleExtensions = ['.vtt', '.srt'];

// A folder is categorised by its name. `kind` drives how its contents are scanned.
const categories = [
  { key: 'tv', match: n => n.includes('tv') },
  { key: 'movies', match: n => n.includes('movie') },
  { key: 'music', match: n => n.includes('music') },
  { key: 'audiobooks', match: n => n.includes('audiobook') },
];

function folderKind(folderName) {
  const n = String(folderName).toLowerCase();
  const cat = categories.find(c => c.match(n));
  return cat ? cat.key : null;
}

module.exports = {
  imageExtensions,
  playableExtensions,
  subtitleExtensions,
  categories,
  folderKind,
};
