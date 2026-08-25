const express = require('express');
const router = express.Router();
const collections = require('../services/collections');

// GET all collections (disk movie-collections + user-defined), with cover + count
router.get('/', (req, res) => {
  res.json({ collections: collections.list() });
});

// POST create an empty user-defined collection
router.post('/', (req, res) => {
  const name = req.body && req.body.name;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Missing collection name' });
  res.json({ collection: collections.create(String(name).trim()) });
});

// GET one collection's members (disk movies + attached items)
router.get('/:name', (req, res) => {
  res.json(collections.get(req.params.name));
});

// DELETE a user-defined collection (disk folder, if any, is untouched)
router.delete('/:name', (req, res) => {
  res.json(collections.remove(req.params.name));
});

// POST set the collection cover to a member's poster URL
router.post('/:name/cover', (req, res) => {
  const imageUrl = req.body && req.body.imageUrl;
  if (!imageUrl) return res.status(400).json({ error: 'Missing imageUrl' });
  res.json(collections.setCover(req.params.name, imageUrl));
});

// POST attach an existing movie/show to a collection
router.post('/:name/members', (req, res) => {
  const { serverId, folderName, itemTitle } = req.body || {};
  if (!serverId || !folderName || !itemTitle) {
    return res.status(400).json({ error: 'Missing serverId, folderName, or itemTitle' });
  }
  res.json(collections.addMember(req.params.name, serverId, folderName, itemTitle));
});

// DELETE detach a member from a collection
router.delete('/:name/members', (req, res) => {
  const { serverId, folderName, itemTitle } = req.body || {};
  if (!serverId || !folderName || !itemTitle) {
    return res.status(400).json({ error: 'Missing serverId, folderName, or itemTitle' });
  }
  res.json(collections.removeMember(req.params.name, serverId, folderName, itemTitle));
});

module.exports = router;
