const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/mediaController');

// GET all media (updates and returns all servers/folders)
router.get('/', mediaController.getAllMedia);

// POST update settings
router.post('/', mediaController.updateMediaSettings);

// GET subtitle file as WebVTT for browser playback
router.get('/subtitles', mediaController.getSubtitleFile);

// GET episodes for a specific season in a show
router.get('/:serverId/:folderName/:itemTitle/:seasonName', mediaController.getSeasonEpisodes);

// GET seasons for a specific show in a folder
router.get('/:serverId/:folderName/:itemTitle', mediaController.getShowSeasons);

// GET media for a specific folder (updates and returns media for that folder)
router.get('/:serverId/:folderName', mediaController.getFolderMedia);

module.exports = router;
