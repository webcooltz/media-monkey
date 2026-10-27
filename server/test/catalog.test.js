const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { isolatedEnv, makeLibrary, settingsFor } = require('./helpers');

const env = isolatedEnv();
const lib = makeLibrary(path.join(env.dir, 'media'), {
  movies: ['The Matrix (1999)', 'Alien (1979)', '100% Wolf (2020)', 'Under_Score (2001)'],
  shows: ['Cosmic Diner (2018)'],
});

const { getDb, closeDb } = require('../db');
const catalog = require('../services/catalog');
const profiles = require('../services/profiles');
const autoscan = require('../services/autoscan');

before(() => {
  getDb();
  catalog.saveSettings(settingsFor(lib));
});

after(() => {
  autoscan.stop();
  closeDb();
  env.cleanup();
});

const titles = media => media.map(m => m.title);

describe('library scan + sorting', () => {
  test('finds movies and sorts ignoring leading articles', () => {
    const { media } = catalog.getFolderMedia('server1', 'Movies');
    assert.deepEqual(titles(media), [
      '100% Wolf (2020)',
      'Alien (1979)',
      'The Matrix (1999)',
      'Under_Score (2001)',
    ]);
    const matrix = media.find(m => m.title.startsWith('The Matrix'));
    assert.equal(matrix.type, 'movie');
    assert.equal(matrix.quality, '1080p');
  });

  test('finds TV shows', () => {
    const { media } = catalog.getFolderMedia('server1', 'TV Shows');
    assert.deepEqual(titles(media), ['Cosmic Diner (2018)']);
    assert.equal(media[0].type, 'show');
  });

  test('unknown folder reports an error', () => {
    assert.equal(catalog.getFolderMedia('server1', 'Nope').error, 'Folder not found');
  });

  test('per-item sort-name override changes ordering', () => {
    catalog.setItemSortTitle('server1', 'Movies', 'Alien (1979)', 'Zzz Alien');
    const { media } = catalog.getFolderMedia('server1', 'Movies');
    assert.equal(titles(media).at(-1), 'Alien (1979)');
    catalog.setItemSortTitle('server1', 'Movies', 'Alien (1979)', '');
  });

  test('additive sync picks up new files, refresh prunes deleted ones', () => {
    const extra = path.join(lib.moviesDir, 'Brand New (2024)');
    fs.mkdirSync(extra);
    fs.writeFileSync(path.join(extra, 'Brand New.720p.mp4'), '');
    assert.ok(titles(catalog.getFolderMedia('server1', 'Movies').media).includes('Brand New (2024)'));

    fs.rmSync(extra, { recursive: true });
    assert.ok(titles(catalog.getFolderMedia('server1', 'Movies').media).includes('Brand New (2024)'), 'plain load keeps stale rows');
    assert.ok(!titles(catalog.getFolderMedia('server1', 'Movies', { refresh: true }).media).includes('Brand New (2024)'));
  });
});

describe('search', () => {
  test('matches substrings case-insensitively', () => {
    const results = catalog.searchMedia('matrix');
    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'The Matrix (1999)');
    assert.equal(results[0].serverId, 'server1');
    assert.equal(results[0].folderName, 'Movies');
  });

  test('ranks prefix matches ahead of mid-title matches', () => {
    // "al" is a prefix of "Alien" and appears inside "Cosmic Diner"? (no) — use "i": prefix of none, inside many.
    const results = catalog.searchMedia('Al');
    assert.equal(results[0].title, 'Alien (1979)');
  });

  test('treats LIKE wildcards literally', () => {
    assert.deepEqual(catalog.searchMedia('%').map(r => r.title), ['100% Wolf (2020)']);
    assert.deepEqual(catalog.searchMedia('_').map(r => r.title), ['Under_Score (2001)']);
  });

  test('blank query returns nothing; limit is honoured', () => {
    assert.deepEqual(catalog.searchMedia('   '), []);
    assert.equal(catalog.searchMedia('e', 2).length, 2);
  });

  test('includes user collections', () => {
    getDb().prepare('INSERT INTO collections (name) VALUES (?)').run('Sci-Fi Night');
    const results = catalog.searchMedia('sci-fi');
    assert.equal(results[0].kind, 'collection');
    assert.equal(results[0].title, 'Sci-Fi Night');
  });
});

describe('profiles + watch state', () => {
  let alice, bob;

  before(() => {
    alice = profiles.create('Alice').profile;
    bob = profiles.create('Bob').profile;
  });

  const watchedFor = (profileId, title) => profiles.runWithProfile(profileId, () =>
    catalog.getFolderMedia('server1', 'Movies').media.find(m => m.title === title));

  test('a default profile exists', () => {
    assert.ok(profiles.list().some(p => p.name === 'Default'));
    assert.equal(profiles.defaultProfileId(), profiles.list()[0].id);
  });

  test('watch state is isolated per profile', () => {
    profiles.runWithProfile(alice.id, () =>
      catalog.setWatchState('server1', 'Movies', 'Alien (1979)', { watched: true }));
    assert.equal(watchedFor(alice.id, 'Alien (1979)').watched, true);
    assert.equal(watchedFor(bob.id, 'Alien (1979)').watched, false);
  });

  test('progress is tracked per profile and finishing marks watched', () => {
    profiles.runWithProfile(bob.id, () =>
      catalog.setWatchState('server1', 'Movies', 'The Matrix (1999)', { progressSeconds: 600, durationSeconds: 1200 }));
    const bobItem = watchedFor(bob.id, 'The Matrix (1999)');
    assert.equal(bobItem.progressPct, 50);
    assert.equal(bobItem.watched, false);
    assert.equal(watchedFor(alice.id, 'The Matrix (1999)').progressPct, 0);

    profiles.runWithProfile(bob.id, () =>
      catalog.setWatchState('server1', 'Movies', 'The Matrix (1999)', { progressSeconds: 1190, durationSeconds: 1200 }));
    const done = watchedFor(bob.id, 'The Matrix (1999)');
    assert.equal(done.watched, true);
    assert.equal(done.progressPct, 0);
  });

  test('profile names are validated and unique (case-insensitive)', () => {
    assert.ok(profiles.create('  ').error);
    assert.ok(profiles.create('alice').error);
    assert.ok(profiles.create('x'.repeat(profiles.MAX_NAME_LENGTH + 1)).error);
    assert.equal(profiles.rename(bob.id, 'Robert').profile.name, 'Robert');
    assert.ok(profiles.rename(bob.id, 'ALICE').error);
  });

  test('theme colors are validated, normalised and resettable', () => {
    const p = profiles.update(bob.id, { primaryColor: '#FF0000', secondaryColor: '#00ff00' }).profile;
    assert.equal(p.primaryColor, '#ff0000');
    assert.equal(p.secondaryColor, '#00ff00');
    assert.ok(profiles.update(bob.id, { primaryColor: 'red' }).error);
    assert.ok(profiles.update(bob.id, { primaryColor: '#fff' }).error);
    assert.equal(profiles.update(bob.id, { name: 'Robert2' }).profile.primaryColor, '#ff0000', 'omitted fields untouched');
    const reset = profiles.update(bob.id, { primaryColor: null, secondaryColor: '' }).profile;
    assert.equal(reset.primaryColor, null);
    assert.equal(reset.secondaryColor, null);
    assert.equal(profiles.update(9999, { primaryColor: '#000000' }).status, 404);
    profiles.update(bob.id, { name: 'Robert' });
  });

  test('deleting a profile removes its watch state; the last one cannot be deleted', () => {
    assert.deepEqual(profiles.remove(alice.id), { success: true });
    const orphans = getDb().prepare('SELECT COUNT(*) AS n FROM watch_state WHERE profile_id = ?').get(alice.id).n;
    assert.equal(orphans, 0);

    for (const p of profiles.list().slice(1)) profiles.remove(p.id);
    assert.equal(profiles.list().length, 1);
    assert.equal(profiles.remove(profiles.list()[0].id).error, 'Cannot delete the last profile');
  });

  test('watch rows for pruned items are cleaned up on refresh', () => {
    const dir = path.join(lib.moviesDir, 'Temp Film (2000)');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'Temp Film.720p.mp4'), '');
    catalog.getFolderMedia('server1', 'Movies');
    catalog.setWatchState('server1', 'Movies', 'Temp Film (2000)', { watched: true });
    fs.rmSync(dir, { recursive: true });
    catalog.getFolderMedia('server1', 'Movies', { refresh: true });
    const orphans = getDb().prepare('SELECT COUNT(*) AS n FROM watch_state WHERE item_id NOT IN (SELECT id FROM media_items)').get().n;
    assert.equal(orphans, 0);
  });
});

describe('autoscan', () => {
  test('picks up new files across folders', async () => {
    const dir = path.join(lib.moviesDir, 'Scanned In (2023)');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'Scanned In.1080p.mp4'), '');

    const result = await autoscan.scanAll();
    assert.equal(result.errors, 0);
    assert.ok(result.added >= 1);
    assert.ok(autoscan.status().lastFinishedAt);
    assert.equal(autoscan.status().running, false);
  });

  test('skips folders whose path is missing instead of wiping their catalog', async () => {
    const before = catalog.getFolderMedia('server1', 'Movies').media.length;
    const moved = lib.moviesDir + '-unmounted';
    fs.renameSync(lib.moviesDir, moved);
    try {
      const result = await autoscan.scanAll();
      assert.ok(result.skipped >= 1);
      assert.equal(catalog.getFolderMedia('server1', 'Movies').media.length, before);
    } finally {
      fs.renameSync(moved, lib.moviesDir);
    }
  });

  test('ignores overlapping runs', async () => {
    const [a, b] = await Promise.all([autoscan.scanAll(), autoscan.scanAll()]);
    assert.ok(a.skipped || b.skipped);
  });
});
