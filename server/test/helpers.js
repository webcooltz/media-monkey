const fs = require('fs');
const os = require('os');
const path = require('path');

// Point the server at a throwaway data dir. Must run BEFORE requiring any server
// module (config.js reads the environment once at load). `node --test` runs each
// test file in its own process, so files never share state.
function isolatedEnv(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-monkey-test-'));
  process.env.DB_PATH = path.join(dir, 'data', 'media.db');
  process.env.AUTO_SCAN_MINUTES = '0';
  process.env.AUTH_PASSWORD = '';
  for (const [k, v] of Object.entries(extra)) process.env[k] = v;
  return {
    dir,
    cleanup() {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort on Windows */ }
    },
  };
}

// Create a tiny media library on disk:
//   <root>/Movies/<movie>/<movie>.1080p.mp4
//   <root>/TV Shows/<show>/Season 1/S01E0N.mp4
function makeLibrary(root, { movies = [], shows = [] } = {}) {
  const moviesDir = path.join(root, 'Movies');
  const showsDir = path.join(root, 'TV Shows');
  fs.mkdirSync(moviesDir, { recursive: true });
  fs.mkdirSync(showsDir, { recursive: true });
  for (const m of movies) {
    const d = path.join(moviesDir, m);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, `${m}.1080p.mp4`), '');
  }
  for (const s of shows) {
    const d = path.join(showsDir, s, 'Season 1');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'S01E01.mp4'), '');
    fs.writeFileSync(path.join(d, 'S01E02.mp4'), '');
  }
  return { moviesDir, showsDir };
}

// Standard server/folder layout pointing at a library made by makeLibrary.
function settingsFor({ moviesDir, showsDir }) {
  return [{
    id: 'server1',
    name: 'Test Server',
    folders: [
      { name: 'Movies', mediaLocation: moviesDir },
      { name: 'TV Shows', mediaLocation: showsDir },
    ],
  }];
}

// Start the Express app on an ephemeral port. Returns { base, close }.
async function startServer(app) {
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

module.exports = { isolatedEnv, makeLibrary, settingsFor, startServer };
