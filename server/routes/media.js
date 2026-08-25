const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/mediaController');

// GET all media (updates and returns all servers/folders)
router.get('/', mediaController.getAllMedia);

// POST update settings
router.post('/', mediaController.updateMediaSettings);

// GET subtitle file as WebVTT for browser playback
router.get('/subtitles', mediaController.getSubtitleFile);

// GET playback plan for a non-directplay file: { mode: directplay|remux|hls, url }
router.get('/streaminfo', mediaController.streamInfo);

// GET video stream: remux-on-the-fly to browser-friendly mp4 (or redirect to raw)
router.get('/stream', mediaController.streamMedia);

// GET HLS playlist + segments for on-the-fly transcode (HEVC/AV1/… → h264, true seek)
router.get('/hls.m3u8', mediaController.hlsPlaylist);
router.get('/hls-segment.ts', mediaController.hlsSegment);

// GET directory listing for the settings folder picker
router.get('/browse', mediaController.browseDirectory);

// POST fetch + store external metadata (TMDB/OMDb) for one item
router.post('/:serverId/:folderName/:itemTitle/metadata', mediaController.fetchMetadata);

// POST apply a user-approved metadata suggestion (by TMDB id)
router.post('/:serverId/:folderName/:itemTitle/metadata/apply', mediaController.applyMetadata);

// POST rename an item's folder on disk (optionally to an approved TMDB title)
router.post('/:serverId/:folderName/:itemTitle/rename', mediaController.renameItem);

// POST search online subtitles (OpenSubtitles) for one item
router.post('/:serverId/:folderName/:itemTitle/find-subtitles', mediaController.findSubtitles);

// POST download a searched subtitle (by fileId) + save it into the item's folder
router.post('/:serverId/:folderName/:itemTitle/subtitles', mediaController.downloadSubtitle);

// TV episodes: search + download subtitles saved beside the episode file
router.post('/:serverId/:folderName/:itemTitle/:seasonName/:episodeTitle/find-subtitles', mediaController.findEpisodeSubtitles);
router.post('/:serverId/:folderName/:itemTitle/:seasonName/:episodeTitle/subtitles', mediaController.downloadEpisodeSubtitle);

// POST run cleanvid (profanity filter) on one item's video
router.post('/:serverId/:folderName/:itemTitle/cleanvid', mediaController.runCleanvid);

// POST upload a cover image (base64) — saved as poster.jpg in the item's folder
router.post('/:serverId/:folderName/:itemTitle/cover', mediaController.uploadCover);

// POST fetch + save each season's poster from TMDB into its season folder
router.post('/:serverId/:folderName/:itemTitle/season-posters', mediaController.fetchSeasonPosters);

// POST upload/crop a single season's cover (base64) — saved as poster.jpg in the season folder
router.post('/:serverId/:folderName/:itemTitle/:seasonName/cover', mediaController.uploadSeasonCover);

// GET episodes for a specific season in a show
router.get('/:serverId/:folderName/:itemTitle/:seasonName', mediaController.getSeasonEpisodes);

// GET seasons for a specific show in a folder
router.get('/:serverId/:folderName/:itemTitle', mediaController.getShowSeasons);

// GET media for a specific folder (updates and returns media for that folder)
router.get('/:serverId/:folderName', mediaController.getFolderMedia);

module.exports = router;
