const config = require('../config');
const { parseTitleYear } = require('./metadata');

const OS_BASE = 'https://api.opensubtitles.com/api/v1';

function hasKey() {
  return Boolean(config.OPENSUBTITLES_API_KEY);
}

function hasLogin() {
  return Boolean(config.OPENSUBTITLES_USERNAME && config.OPENSUBTITLES_PASSWORD);
}

const OS_HEADERS = () => ({
  'Api-Key': config.OPENSUBTITLES_API_KEY,
  'User-Agent': 'media-monkey v1',
});

// Search OpenSubtitles for a title. Returns { stub:true } without a key.
// For episodes pass season/episode numbers to narrow to the exact episode.
async function find(rawTitle, { isShow = false, language = 'en', season = null, episode = null } = {}) {
  if (!hasKey()) return { stub: true };
  const { title, year } = parseTitleYear(rawTitle);
  const params = new URLSearchParams({ query: title, languages: language });
  if (year) params.set('year', year);
  if (isShow) params.set('type', 'episode'); else params.set('type', 'movie');
  if (season != null) params.set('season_number', String(season));
  if (episode != null) params.set('episode_number', String(episode));

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

// OpenSubtitles bearer token (from account login) — required by /download.
// Tokens last ~24h; cache and refresh a bit early.
let _token = null;
let _tokenAt = 0;
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

async function login() {
  if (!hasLogin()) return null;
  if (_token && Date.now() - _tokenAt < TOKEN_TTL_MS) return _token;
  const res = await fetch(`${OS_BASE}/login`, {
    method: 'POST',
    headers: { ...OS_HEADERS(), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username: config.OPENSUBTITLES_USERNAME, password: config.OPENSUBTITLES_PASSWORD }),
  });
  if (!res.ok) throw new Error(`OpenSubtitles login ${res.status}`);
  const data = await res.json();
  if (!data.token) throw new Error('OpenSubtitles login returned no token');
  _token = data.token;
  _tokenAt = Date.now();
  return _token;
}

// Download one subtitle by its OpenSubtitles file_id. Requests a temporary link,
// then fetches the actual file. Returns { content, fileName } or a status flag.
async function download(fileId) {
  if (!hasKey()) return { stub: true };
  if (!hasLogin()) return { needsLogin: true };

  const token = await login();
  const res = await fetch(`${OS_BASE}/download`, {
    method: 'POST',
    headers: { ...OS_HEADERS(), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ file_id: Number(fileId) }),
  });
  if (!res.ok) throw new Error(`OpenSubtitles download ${res.status}`);
  const data = await res.json();
  if (!data.link) throw new Error('OpenSubtitles returned no download link');

  const fileRes = await fetch(data.link, { headers: { 'User-Agent': 'media-monkey v1' } });
  if (!fileRes.ok) throw new Error(`Subtitle file fetch ${fileRes.status}`);
  const content = await fileRes.text();
  return { content, fileName: data.file_name || null, remaining: data.remaining };
}

// Account quota for the configured login: how many downloads remain today, the
// daily allowance, and when it resets. Needs the API key + account login.
async function userInfo() {
  if (!hasKey() || !hasLogin()) return null;
  const token = await login();
  const res = await fetch(`${OS_BASE}/infos/user`, {
    headers: { ...OS_HEADERS(), Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`OpenSubtitles infos/user ${res.status}`);
  const d = (await res.json()).data || {};
  return {
    remaining: d.remaining_downloads,
    allowed: d.allowed_downloads,
    used: d.downloads_count,
    level: d.level,
    vip: d.vip,
    resetTime: d.reset_time,
  };
}

module.exports = { find, download, userInfo, hasKey, hasLogin };
