const fs = require('fs');
const catalog = require('./catalog');
const config = require('../config');

// Background library rescan. A full refresh picks up new/removed files, posters
// and subtitles without anyone clicking "Refresh". Folders whose path is missing
// or unreadable (e.g. an unmounted drive) are skipped so a disconnected disk
// can never wipe its catalog entries.

const state = {
  enabled: false,
  intervalMinutes: 0,
  running: false,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastResult: null,
};

let timer = null;

function isReadableDir(p) {
  try {
    return !!p && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

const yieldToEventLoop = () => new Promise(resolve => setImmediate(resolve));

// Rescan every configured folder. Returns a summary; concurrent calls are ignored.
async function scanAll() {
  if (state.running) return { skipped: true, reason: 'A scan is already running' };
  state.running = true;
  state.lastStartedAt = new Date().toISOString();
  const started = Date.now();
  const result = { folders: 0, skipped: 0, added: 0, removed: 0, errors: 0 };
  try {
    for (const folder of catalog.listFolders()) {
      if (!isReadableDir(folder.media_location)) { result.skipped++; continue; }
      try {
        const before = folder.item_count;
        const { media } = catalog.getFolderMedia(folder.server_id, folder.name, { refresh: true });
        const after = media ? media.length : before;
        if (after > before) result.added += after - before;
        else result.removed += before - after;
        result.folders++;
      } catch (e) {
        result.errors++;
        console.error(`[autoscan] ${folder.name}: ${e.message}`);
      }
      await yieldToEventLoop(); // keep the server responsive between folders (sync fs scans)
    }
  } finally {
    result.durationMs = Date.now() - started;
    state.running = false;
    state.lastFinishedAt = new Date().toISOString();
    state.lastResult = result;
  }
  return result;
}

function start(minutes = config.AUTO_SCAN_MINUTES) {
  stop();
  state.intervalMinutes = minutes;
  state.enabled = minutes > 0;
  if (!state.enabled) return;
  timer = setInterval(() => {
    scanAll().catch(e => console.error('[autoscan] failed:', e.message));
  }, minutes * 60 * 1000);
  timer.unref();
  console.log(`[autoscan] rescanning every ${minutes} min`);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  state.enabled = false;
}

function status() {
  return { ...state };
}

module.exports = { scanAll, start, stop, status };
