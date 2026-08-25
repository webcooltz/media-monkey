const { spawn, spawnSync } = require('child_process');
const { FFMPEG_CMD, FFPROBE_CMD, FFMPEG_HW_ENCODER } = require('../config');
const { remuxableVideoCodecs, copyableAudioCodecs, HLS_SEGMENT_SECONDS } = require('../constants');

// ffmpeg/ffprobe are host deps (same as cleanvid). Detected once, cached.
let _available = null;
function ffmpegAvailable() {
  if (_available !== null) return _available;
  try {
    const probe = spawnSync(FFPROBE_CMD, ['-version'], { stdio: 'ignore' });
    const ff = spawnSync(FFMPEG_CMD, ['-version'], { stdio: 'ignore' });
    _available = probe.status === 0 && ff.status === 0;
  } catch {
    _available = false;
  }
  return _available;
}

// Probe the first video + audio stream codecs + container duration.
// Returns { vcodec, acodec, duration } (duration in seconds, 0 if unknown) or null.
function probe(file) {
  const out = spawnSync(FFPROBE_CMD, [
    '-v', 'error',
    '-show_entries', 'stream=codec_type,codec_name:format=duration',
    '-of', 'json', file,
  ], { encoding: 'utf-8', maxBuffer: 1 << 20 });
  if (out.status !== 0) return null;
  try {
    const parsed = JSON.parse(out.stdout);
    const streams = parsed.streams || [];
    const v = streams.find(s => s.codec_type === 'video');
    const a = streams.find(s => s.codec_type === 'audio');
    const duration = Math.max(0, Number(parsed.format && parsed.format.duration) || 0);
    return { vcodec: v ? v.codec_name : null, acodec: a ? a.codec_name : null, duration };
  } catch {
    return null;
  }
}

// Pick the h264 video encoder for transcoding. Prefer a Pi 4 hardware encoder
// (h264_v4l2m2m) when present — software libx264 is the portable fallback.
// FFMPEG_HW_ENCODER forces a specific encoder (or 'libx264' to disable HW).
let _encoder = null;
function pickVideoEncoder() {
  if (_encoder !== null) return _encoder;
  if (FFMPEG_HW_ENCODER) { _encoder = FFMPEG_HW_ENCODER; return _encoder; }
  try {
    const out = spawnSync(FFMPEG_CMD, ['-hide_banner', '-encoders'], { encoding: 'utf-8', maxBuffer: 1 << 20 });
    _encoder = (out.status === 0 && /\bh264_v4l2m2m\b/.test(out.stdout)) ? 'h264_v4l2m2m' : 'libx264';
  } catch {
    _encoder = 'libx264';
  }
  return _encoder;
}

// Decide how to serve a file given its probed codecs.
//   'copy'      → remux (stream copy) into fragmented mp4 — cheap, keeps quality.
//   'transcode' → needs a real video re-encode — not enabled yet.
function playPlan({ vcodec, acodec }) {
  if (!remuxableVideoCodecs.includes(vcodec)) return { mode: 'transcode', vcodec };
  const audioCopy = copyableAudioCodecs.includes(acodec);
  return { mode: 'copy', audioCopy };
}

// Spawn ffmpeg to remux `file` into a streamable fragmented mp4 on stdout.
// `seek` (seconds) starts playback partway in (fast keyframe seek). `audioCopy`
// keeps the audio track; otherwise it's re-encoded to aac.
function remux(file, { seek = 0, audioCopy = true } = {}) {
  const args = ['-hide_banner', '-loglevel', 'error'];
  if (seek > 0) args.push('-ss', String(seek));
  args.push('-i', file);
  args.push('-c:v', 'copy');
  if (audioCopy) args.push('-c:a', 'copy');
  else args.push('-c:a', 'aac', '-b:a', '192k');
  args.push(
    '-avoid_negative_ts', 'make_zero',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4', 'pipe:1',
  );
  return spawn(FFMPEG_CMD, args, { stdio: ['ignore', 'pipe', 'pipe'] });
}

// Build a VOD HLS playlist for `duration` seconds, one entry per fixed-length
// segment. `segmentUrl(i)` returns the URL for segment i (caller wires in path
// params). Player uses these to seek to any point — only watched segments get
// transcoded (see transcodeSegment), so CPU tracks what's actually played.
function buildHlsPlaylist(duration, segmentUrl, segSeconds = HLS_SEGMENT_SECONDS) {
  const count = Math.max(1, Math.ceil(duration / segSeconds));
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${segSeconds}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:VOD',
  ];
  for (let i = 0; i < count; i++) {
    const remaining = duration - i * segSeconds;
    const inf = i === count - 1 && remaining > 0 ? remaining : segSeconds;
    lines.push(`#EXTINF:${inf.toFixed(3)},`);
    lines.push(segmentUrl(i));
  }
  lines.push('#EXT-X-ENDLIST');
  return lines.join('\n') + '\n';
}

// Transcode one HLS segment (index `i`, `segSeconds` long) of `file` to mpegts
// on stdout. Video → h264 (HW or libx264), audio → aac. Input seek (`-ss` before
// `-i`) resets the segment to a 0-based timeline so `-t` trims it correctly;
// `-output_ts_offset` then shifts timestamps back to the segment's real position
// so the player stitches + seeks cleanly across segments. A keyframe is forced at
// the segment start so each segment is independently decodable.
function transcodeSegment(file, i, { segSeconds = HLS_SEGMENT_SECONDS } = {}) {
  const encoder = pickVideoEncoder();
  const start = i * segSeconds;
  const args = [
    '-hide_banner', '-loglevel', 'error',
    '-ss', String(start),        // fast keyframe seek before input
    '-i', file,
    '-t', String(segSeconds),
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c:v', encoder,
  ];
  if (encoder === 'libx264') {
    args.push('-preset', 'veryfast', '-crf', '23');
  } else {
    args.push('-b:v', '3M'); // HW encoders (v4l2m2m) don't support crf
  }
  args.push(
    '-force_key_frames', 'expr:gte(t,0)',
    '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
    '-output_ts_offset', String(start),
    '-muxdelay', '0', '-muxpreload', '0',
    '-f', 'mpegts', 'pipe:1',
  );
  return spawn(FFMPEG_CMD, args, { stdio: ['ignore', 'pipe', 'pipe'] });
}

module.exports = {
  ffmpegAvailable, probe, playPlan, remux,
  pickVideoEncoder, buildHlsPlaylist, transcodeSegment,
};
