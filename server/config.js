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
  // Downloading (not just searching) subtitles needs an OpenSubtitles account login
  // to mint a bearer token for the /download endpoint.
  OPENSUBTITLES_USERNAME: process.env.OPENSUBTITLES_USERNAME || '',
  OPENSUBTITLES_PASSWORD: process.env.OPENSUBTITLES_PASSWORD || '',
  // cleanvid needs python + ffmpeg on the host; off unless explicitly enabled
  CLEANVID_ENABLED: process.env.CLEANVID_ENABLED === 'true',
  CLEANVID_CMD: process.env.CLEANVID_CMD || 'cleanvid',
  // ffmpeg/ffprobe for on-the-fly remux streaming. Override if not on PATH
  // (e.g. a full path when the service user's PATH doesn't include them).
  FFMPEG_CMD: process.env.FFMPEG_CMD || 'ffmpeg',
  FFPROBE_CMD: process.env.FFPROBE_CMD || 'ffprobe',
  // Force the h264 transcode encoder (e.g. 'h264_v4l2m2m' for Pi 4 HW, or
  // 'libx264' to disable HW). Blank = auto-detect.
  FFMPEG_HW_ENCODER: process.env.FFMPEG_HW_ENCODER || '',
  // Auth: when AUTH_PASSWORD is set, all media/API routes require login.
  // Leave blank for local use (no auth). SESSION_SECRET auto-generated + persisted if unset.
  AUTH_PASSWORD: process.env.AUTH_PASSWORD || '',
  SESSION_SECRET: process.env.SESSION_SECRET || '',
  AUTH_COOKIE_SECURE: process.env.AUTH_COOKIE_SECURE === 'true',
};
