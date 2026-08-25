// File-type sets and folder-category rules — single source of truth for scanning.

const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
const playableExtensions = ['.mp4', '.m4v', '.webm', '.mov', '.mkv', '.avi', '.mp3', '.m4a', '.aac', '.wav', '.flac'];
const subtitleExtensions = ['.vtt', '.srt'];

// Containers browsers play natively → serve raw (Direct Play, full byte-range seek).
// Other video containers route through the remux/transcode stream endpoint.
const directPlayContainers = ['.mp4', '.m4v', '.webm'];
// Video codecs a remux (stream copy) keeps as-is — browser decodes directly.
// Others (hevc, av1, vc1, mpeg2video, …) need a real transcode (not yet enabled).
const remuxableVideoCodecs = ['h264'];
// Audio codecs a remux keeps; others get re-encoded to aac (cheap even on a Pi).
const copyableAudioCodecs = ['aac', 'mp3'];
// HLS segment length (seconds) for on-the-fly transcode. Segments are generated
// on demand as the player requests them, so only watched time costs CPU.
const HLS_SEGMENT_SECONDS = 6;

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
  directPlayContainers,
  remuxableVideoCodecs,
  copyableAudioCodecs,
  HLS_SEGMENT_SECONDS,
  categories,
  folderKind,
};
