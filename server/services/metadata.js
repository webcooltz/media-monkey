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

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// TMDB search → lightweight candidate list (title, year, poster, overview) for the
// approve/deny suggestion UI. No per-result detail fetch (fast).
async function tmdbCandidates(title, year, isShow) {
  const kind = isShow ? 'tv' : 'movie';
  const params = new URLSearchParams({ api_key: config.TMDB_API_KEY, query: title });
  if (year) params.set(isShow ? 'first_air_date_year' : 'year', year);
  const searchRes = await fetch(`${TMDB_BASE}/search/${kind}?${params}`);
  if (!searchRes.ok) throw new Error(`TMDB search ${searchRes.status}`);
  const results = (await searchRes.json()).results || [];
  return results.slice(0, 6).map(hit => {
    const date = hit.release_date || hit.first_air_date || '';
    return {
      provider: 'tmdb',
      tmdbId: String(hit.id),
      title: hit.title || hit.name,
      year: date ? date.slice(0, 4) : null,
      overview: hit.overview || null,
      rating: typeof hit.vote_average === 'number' ? hit.vote_average : null,
      posterUrl: hit.poster_path ? TMDB_IMG + hit.poster_path : null,
      tmdbKind: kind,
    };
  });
}

// Resolve one TMDB id to a full metadata object (adds the IMDB id). Used both for
// an exact auto-match and when the user approves a suggestion.
async function resolveTmdbById(tmdbId, isShow) {
  const kind = isShow ? 'tv' : 'movie';
  const res = await fetch(`${TMDB_BASE}/${kind}/${tmdbId}?api_key=${config.TMDB_API_KEY}&append_to_response=external_ids`);
  if (!res.ok) throw new Error(`TMDB ${kind} ${res.status}`);
  const d = await res.json();
  const date = d.release_date || d.first_air_date || '';
  return {
    provider: 'tmdb',
    tmdbId: String(d.id),
    imdbId: (d.external_ids && d.external_ids.imdb_id) || null,
    title: d.title || d.name,
    overview: d.overview || null,
    year: date ? date.slice(0, 4) : null,
    rating: typeof d.vote_average === 'number' ? d.vote_average : null,
    posterUrl: d.poster_path ? TMDB_IMG + d.poster_path : null,
    extra: { popularity: d.popularity, voteCount: d.vote_count, tmdbKind: kind },
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

// Returns:
//   { stub: true }         — no provider key configured
//   null                   — nothing found anywhere
//   { suggestions: [...] }  — TMDB matches but none exact; user picks one
//   <metadata object>      — an exact/auto match, ready to apply
async function lookup(rawTitle, { isShow = false } = {}) {
  if (!hasAnyKey()) return { stub: true };
  const { title, year } = parseTitleYear(rawTitle);

  if (config.TMDB_API_KEY) {
    const candidates = await tmdbCandidates(title, year, isShow);
    if (candidates.length) {
      const exact = candidates.find(c => norm(c.title) === norm(title) && (!year || String(c.year) === String(year)));
      if (exact) return resolveTmdbById(exact.tmdbId, isShow);
      return { suggestions: candidates };
    }
  }
  if (config.OMDB_API_KEY) {
    const r = await lookupOmdb(title, year);
    if (r) return r;
  }
  return null;
}

// Look up all seasons of a TV show on TMDB (one detail call returns every season
// with its poster). Returns { stub } without a TMDB key, { seasons: [] } if no match.
async function lookupTvSeasons(rawTitle) {
  if (!config.TMDB_API_KEY) return { stub: true };
  const { title, year } = parseTitleYear(rawTitle);
  const params = new URLSearchParams({ api_key: config.TMDB_API_KEY, query: title });
  if (year) params.set('first_air_date_year', year);
  const searchRes = await fetch(`${TMDB_BASE}/search/tv?${params}`);
  if (!searchRes.ok) throw new Error(`TMDB search ${searchRes.status}`);
  const hit = (await searchRes.json()).results?.[0];
  if (!hit) return { seasons: [] };

  const detRes = await fetch(`${TMDB_BASE}/tv/${hit.id}?api_key=${config.TMDB_API_KEY}`);
  if (!detRes.ok) throw new Error(`TMDB tv ${detRes.status}`);
  const det = await detRes.json();
  const seasons = (det.seasons || []).map(s => ({
    seasonNumber: s.season_number,
    name: s.name,
    posterUrl: s.poster_path ? TMDB_IMG + s.poster_path : null,
  }));
  return { showTitle: det.name, seasons };
}

module.exports = { lookup, resolveTmdbById, lookupTvSeasons, parseTitleYear, hasAnyKey };
