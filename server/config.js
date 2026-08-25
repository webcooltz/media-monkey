const fs = require('fs');
const path = require('path');

// Load server/.env if present (Node 20.12+ has process.loadEnvFile — no dotenv dep).
const envPath = path.join(__dirname, '.env');
try {
  if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
  }
} catch {
  // ignore malformed .env — fall back to process defaults
}

module.exports = {
  PORT: process.env.PORT || 5000,
  DB_PATH: process.env.DB_PATH || path.join(__dirname, 'data', 'media.db'),
  TMDB_API_KEY: process.env.TMDB_API_KEY || '',
  OMDB_API_KEY: process.env.OMDB_API_KEY || '',
  OPENSUBTITLES_API_KEY: process.env.OPENSUBTITLES_API_KEY || '',
  // cleanvid needs python + ffmpeg on the host; off unless explicitly enabled
  CLEANVID_ENABLED: process.env.CLEANVID_ENABLED === 'true',
  CLEANVID_CMD: process.env.CLEANVID_CMD || 'cleanvid',
  // Auth: when AUTH_PASSWORD is set, all media/API routes require login.
  // Leave blank for local use (no auth). SESSION_SECRET auto-generated + persisted if unset.
  AUTH_PASSWORD: process.env.AUTH_PASSWORD || '',
  SESSION_SECRET: process.env.SESSION_SECRET || '',
  AUTH_COOKIE_SECURE: process.env.AUTH_COOKIE_SECURE === 'true',
};
