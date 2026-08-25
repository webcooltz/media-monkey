const config = require('../config');

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
const OMDB_BASE = 'https://www.omdbapi.com/';

// "Bullet Train (2022)" -> { title: "Bullet Train", year: "2022" }
function parseTitleYear(raw) {
  const m = raw.match(/^(.*?)\s*\((\d{4})\)/);
  if (m) return { title: m[1].trim(), year: m[2] };
  return { title: raw.trim(), year: null };
}

function hasAnyKey() {
  return Boolean(config.TMDB_API_KEY || config.OMDB_API_KEY);
}

async function lookupTmdb(title, year, isShow) {
  const kind = isShow ? 'tv' : 'movie';
  const params = new URLSearchParams({ api_key: config.TMDB_API_KEY, query: title });
  if (year) params.set(isShow ? 'first_air_date_year' : 'year', year);
  const searchRes = await fetch(`${TMDB_BASE}/search/${kind}?${params}`);
  if (!searchRes.ok) throw new Error(`TMDB search ${searchRes.status}`);
  const search = await searchRes.json();
  const hit = search.results && search.results[0];
  if (!hit) return null;

  // external_ids for the IMDB id
  let imdbId = null;
  try {
    const extRes = await fetch(`${TMDB_BASE}/${kind}/${hit.id}/external_ids?api_key=${config.TMDB_API_KEY}`);
    if (extRes.ok) imdbId = (await extRes.json()).imdb_id || null;
  } catch {}

  const date = hit.release_date || hit.first_air_date || '';
  return {
    provider: 'tmdb',
    tmdbId: String(hit.id),
    imdbId,
    title: hit.title || hit.name,
    overview: hit.overview || null,
    year: date ? date.slice(0, 4) : year,
    rating: typeof hit.vote_average === 'number' ? hit.vote_average : null,
    posterUrl: hit.poster_path ? TMDB_IMG + hit.poster_path : null,
    extra: { popularity: hit.popularity, voteCount: hit.vote_count, tmdbKind: kind },
  };
}

async function lookupOmdb(title, year) {
  const params = new URLSearchParams({ apikey: config.OMDB_API_KEY, t: title });
  if (year) params.set('y', year);
  const res = await fetch(`${OMDB_BASE}?${params}`);
  if (!res.ok) throw new Error(`OMDb ${res.status}`);
  const data = await res.json();
  if (data.Response === 'False') return null;
  return {
    provider: 'omdb',
    tmdbId: null,
    imdbId: data.imdbID || null,
    title: data.Title,
    overview: data.Plot && data.Plot !== 'N/A' ? data.Plot : null,
    year: data.Year ? String(data.Year).slice(0, 4) : year,
    rating: data.imdbRating && data.imdbRating !== 'N/A' ? Number(data.imdbRating) : null,
    posterUrl: data.Poster && data.Poster !== 'N/A' ? data.Poster : null,
    extra: { imdbVotes: data.imdbVotes, rated: data.Rated, genre: data.Genre },
  };
}

// Returns { stub: true } when no key configured, null when nothing found, else metadata object.
async function lookup(rawTitle, { isShow = false } = {}) {
  if (!hasAnyKey()) return { stub: true };
  const { title, year } = parseTitleYear(rawTitle);
  if (config.TMDB_API_KEY) {
    const r = await lookupTmdb(title, year, isShow);
    if (r) return r;
  }
  if (config.OMDB_API_KEY) {
    const r = await lookupOmdb(title, year);
    if (r) return r;
  }
  return null;
}

module.exports = { lookup, parseTitleYear, hasAnyKey };
