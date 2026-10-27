const config = require('./config');
const app = require('./app');
const auth = require('./auth');
const { closeDb } = require('./db');
const autoscan = require('./services/autoscan');

const PORT = config.PORT;

// A stray error in one request/job (bad file, dropped drive, ffmpeg hiccup) must not
// take the whole media server down. Log it and keep serving; pm2/systemd still
// restart the process if it ever truly dies.
process.on('unhandledRejection', reason => {
  console.error('[server] Unhandled rejection (continuing):', reason);
});
process.on('uncaughtException', err => {
  console.error('[server] Uncaught exception (continuing):', err);
});

const server = app.listen(PORT, config.HOST || undefined, () => {
  console.log(`Server running on port ${PORT}`);
  autoscan.start();
  if (!auth.authEnabled()) {
    console.warn('[server] AUTH_PASSWORD is not set — anyone who can reach this port can browse and stream your library. Set it before exposing the server.');
  }
});

// Startup problems (port taken, no permission) are unrecoverable: say why, exit cleanly.
server.on('error', err => {
  console.error(`[server] Could not listen on port ${PORT}: ${err.message}`);
  process.exit(1);
});

// Graceful shutdown so SQLite WAL is checkpointed and in-flight requests finish.
function shutdown(signal) {
  console.log(`[server] ${signal} received, shutting down`);
  autoscan.stop();
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
