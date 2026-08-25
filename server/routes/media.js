const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/mediaController');

// GET all media (updates and returns all servers/folders)
router.get('/', mediaController.getAllMedia);

// POST update settings
router.post('/', mediaController.updateMediaSettings);

// GET subtitle file as WebVTT for browser playback
router.get('/subtitles', mediaController.getSubtitleFile);

// GET directory listing for the settings folder picker
router.get('/browse', mediaController.browseDirectory);

// POST fetch + store external metadata (TMDB/OMDb) for one item
router.post('/:serverId/:folderName/:itemTitle/metadata', mediaController.fetchMetadata);

// POST search online subtitles (OpenSubtitles) for one item
router.post('/:serverId/:folderName/:itemTitle/find-subtitles', mediaController.findSubtitles);

// POST run cleanvid (profanity filter) on one item's video
router.post('/:serverId/:folderName/:itemTitle/cleanvid', mediaController.runCleanvid);

// POST upload a cover image (base64) — saved as poster.jpg in the item's folder
router.post('/:serverId/:folderName/:itemTitle/cover', mediaController.uploadCover);

// GET episodes for a specific season in a show
router.get('/:serverId/:folderName/:itemTitle/:seasonName', mediaController.getSeasonEpisodes);

// GET seasons for a specific show in a folder
router.get('/:serverId/:folderName/:itemTitle', mediaController.getShowSeasons);

// GET media for a specific folder (updates and returns media for that folder)
router.get('/:serverId/:folderName', mediaController.getFolderMedia);

module.exports = router;
