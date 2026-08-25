const config = require('../config');
const subtitles = require('./subtitles');

// Report per-provider API-key status for the Settings page.
//
// Only OpenSubtitles exposes a live "requests remaining" figure (via /infos/user).
// TMDB v3 has no hard rate limit and no usage endpoint; OMDb has a daily cap but no
// remaining-count API — for those we can only report configured + valid.

async function tmdbStatus() {
  if (!config.TMDB_API_KEY) return { configured: false };
  try {
    const r = await fetch(`https://api.themoviedb.org/3/authentication?api_key=${config.TMDB_API_KEY}`);
    return { configured: true, valid: r.ok, quota: 'No per-key request limit (v3); no usage API.' };
  } catch {
    return { configured: true, valid: false, quota: 'No per-key request limit (v3); no usage API.' };
  }
}

async function omdbStatus() {
  if (!config.OMDB_API_KEY) return { configured: false };
  try {
    const r = await fetch(`https://www.omdbapi.com/?apikey=${config.OMDB_API_KEY}&t=matrix`);
    const d = await r.json();
    const valid = !(d.Response === 'False' && /invalid api key/i.test(d.Error || ''));
    return { configured: true, valid, quota: '1,000 requests/day (free); no remaining-count API.' };
  } catch {
    return { configured: true, valid: false, quota: '1,000 requests/day (free); no remaining-count API.' };
  }
}

async function opensubtitlesStatus() {
  if (!subtitles.hasKey()) return { configured: false };
  if (!subtitles.hasLogin()) {
    return { configured: true, loginConfigured: false, quota: 'Add username/password to see remaining downloads.' };
  }
  try {
    const info = await subtitles.userInfo();
    return { configured: true, loginConfigured: true, valid: true, ...info };
  } catch (e) {
    return { configured: true, loginConfigured: true, valid: false, error: e.message };
  }
}

async function all() {
  const [tmdb, omdb, opensubtitles] = await Promise.all([tmdbStatus(), omdbStatus(), opensubtitlesStatus()]);
  return { tmdb, omdb, opensubtitles };
}

module.exports = { all };
