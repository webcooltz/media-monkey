const config = require('../config');
const { parseTitleYear } = require('./metadata');

const OS_BASE = 'https://api.opensubtitles.com/api/v1';

function hasKey() {
  return Boolean(config.OPENSUBTITLES_API_KEY);
}

// Search OpenSubtitles for a title. Returns { stub:true } without a key.
async function find(rawTitle, { isShow = false, language = 'en' } = {}) {
  if (!hasKey()) return { stub: true };
  const { title, year } = parseTitleYear(rawTitle);
  const params = new URLSearchParams({ query: title, languages: language });
  if (year) params.set('year', year);
  if (isShow) params.set('type', 'episode'); else params.set('type', 'movie');

  const res = await fetch(`${OS_BASE}/subtitles?${params}`, {
    headers: {
      'Api-Key': config.OPENSUBTITLES_API_KEY,
      'User-Agent': 'media-monkey v1',
    },
  });
  if (!res.ok) throw new Error(`OpenSubtitles ${res.status}`);
  const data = await res.json();
  const results = (data.data || []).slice(0, 10).map(sub => ({
    id: sub.id,
    fileId: sub.attributes?.files?.[0]?.file_id || null,
    language: sub.attributes?.language,
    release: sub.attributes?.release,
    downloads: sub.attributes?.download_count,
  }));
  return { results };
}

// Importing requires an auth token + the /download endpoint; deferred until a key is configured.
async function importSubtitle() {
  if (!hasKey()) return { stub: true };
  return { notImplemented: true, message: 'Download/import wiring pending OpenSubtitles login token setup.' };
}

module.exports = { find, importSubtitle, hasKey };
