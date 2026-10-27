import React, { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import { api } from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import Button from './ui/Button';
import DownloadLink from './DownloadLink';

interface MediaPlayerPageProps {
  title: string;
  mediaUrl: string;
  posterUrl?: string;
  subtitles?: SubtitleTrack[];
  watchTarget?: { serverId: string; folderName: string; itemTitle: string };
  onBack: () => void;
}

interface SubtitleTrack {
  label: string;
  fileName: string;
  url: string;
}

type PlaybackProgress = {
  currentTime: number;
  duration: number;
  updatedAt: number;
};

// How the browser should play a non-directplay file, resolved via /streaminfo.
//   directplay → plain <video src> on the raw file (full seek)
//   remux      → plain <video src> on the stream-copy mp4 pipe (start-only seek)
//   hls        → HLS playlist loaded via hls.js / native (true seek)
type PlaybackMode = 'directplay' | 'remux' | 'hls';
type ResolvedPlayback = { mode: PlaybackMode; url: string };

const MAX_BUFFER_BYTES = 1.5 * 1024 * 1024 * 1024; // keep in-memory copies to a sane size
const PROGRESS_PREFIX = 'media-progress:';

function getSavedResumeTime(progressKey: string) {
  try {
    const rawValue = localStorage.getItem(progressKey);
    if (!rawValue) {
      return null;
    }

    const savedProgress = JSON.parse(rawValue) as PlaybackProgress;
    return savedProgress.currentTime > 5 ? savedProgress.currentTime : null;
  } catch {
    return null;
  }
}

const MediaPlayerPage: React.FC<MediaPlayerPageProps> = ({ title, mediaUrl, posterUrl, subtitles = [], watchTarget, onBack }) => {
  useDocumentTitle(title);
  const playerRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const lastReport = useRef(0);
  const isStream = useMemo(() => mediaUrl.startsWith('/api/media/stream'), [mediaUrl]);
  const mediaType = useMemo(() => {
    const path = mediaUrl.split('?')[0].toLowerCase();
    return /\.(mp3|m4a|aac|wav|flac)$/i.test(path) ? 'audio' : 'video';
  }, [mediaUrl]);

  // Stream URLs need a /streaminfo round-trip to learn the playback mode; every
  // other URL (raw /media, audio) is a direct source.
  const [playback, setPlayback] = useState<ResolvedPlayback | null>(
    isStream ? null : { mode: 'directplay', url: mediaUrl },
  );
  // Only remux streams have an unstable timeline — directplay + HLS seek reliably.
  const seekLimited = playback?.mode === 'remux';

  const progressKey = `${PROGRESS_PREFIX}${mediaUrl}`;
  // Resume point is known once the timeline's seekability is (remux timelines aren't seek-stable).
  const [finished, setFinished] = useState(false);
  const savedResume = useMemo(
    () => (!playback || playback.mode === 'remux' ? null : getSavedResumeTime(progressKey)),
    [playback, progressKey],
  );
  const resumeTime = finished ? null : savedResume;
  const [playbackError, setPlaybackError] = useState(false);

  // "Load whole file": download the video into memory first so playback never
  // stalls on a slow link. Direct-play only (remux/HLS are generated on the fly).
  const [buffer, setBuffer] = useState<{ state: 'idle' | 'loading' | 'done' | 'error'; pct: number; message?: string }>({ state: 'idle', pct: 0 });
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const swapRef = useRef<{ t: number; playing: boolean } | null>(null);
  useEffect(() => () => { abortRef.current?.abort(); }, []);
  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  // Resolve the playback mode for stream URLs.
  useEffect(() => {
    if (!isStream) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the source changes
    setPlayback(null);
    setPlaybackError(false);
    fetch(mediaUrl.replace('/api/media/stream', '/api/media/streaminfo'))
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`streaminfo ${res.status}`))))
      .then((info: ResolvedPlayback) => { if (!cancelled) setPlayback(info); })
      .catch(() => { if (!cancelled) setPlaybackError(true); });
    return () => { cancelled = true; };
  }, [mediaUrl, isStream]);

  // Load HLS sources: hls.js where unsupported natively, native <video src> on Safari.
  useEffect(() => {
    if (!playback || playback.mode !== 'hls') return;
    const video = playerRef.current as HTMLVideoElement | null;
    if (!video) return;

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(playback.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_evt, data) => { if (data.fatal) setPlaybackError(true); });
      return () => hls.destroy();
    }
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playback.url; // Safari plays HLS natively
    } else {
      setPlaybackError(true);
    }
  }, [playback]);

  const saveProgress = () => {
    if (seekLimited || swapRef.current) return; // remux timeline / mid-swap isn't seek-stable — don't persist resume points
    const player = playerRef.current;
    if (!player || !Number.isFinite(player.currentTime)) {
      return;
    }

    const duration = Number.isFinite(player.duration) ? player.duration : 0;
    const isNearlyFinished = duration > 0 && player.currentTime >= Math.max(duration - 10, duration * 0.95);

    if (isNearlyFinished) {
      localStorage.removeItem(progressKey);
      reportWatch(player.currentTime, duration); // server marks watched past 95%
      return;
    }

    const progress: PlaybackProgress = {
      currentTime: player.currentTime,
      duration,
      updatedAt: Date.now(),
    };
    localStorage.setItem(progressKey, JSON.stringify(progress));
    reportWatch(player.currentTime, duration);
  };

  // Persist resume progress to the server (throttled), so the poster overlay shows
  // a progress bar / watched check across devices. No-op without a watch target.
  const reportWatch = (currentTime: number, duration: number) => {
    if (!watchTarget || !duration) return;
    const now = Date.now();
    const finished = currentTime >= Math.max(duration - 10, duration * 0.95);
    if (!finished && now - lastReport.current < 10000) return; // throttle
    lastReport.current = now;
    api.setWatchProgress(watchTarget.serverId, watchTarget.folderName, watchTarget.itemTitle, currentTime, duration).catch(() => {});
  };

  const handleLoadedMetadata = () => {
    const player = playerRef.current;
    const swap = swapRef.current;
    if (swap && player) { // source was just swapped to the in-memory copy: pick up where we were
      swapRef.current = null;
      player.currentTime = swap.t;
      if (swap.playing) player.play().catch(() => {});
      return;
    }
    if (!player || resumeTime == null) {
      return;
    }

    if (player.duration && resumeTime < player.duration - 2) {
      player.currentTime = resumeTime;
    }
  };

  const handleEnded = () => {
    localStorage.removeItem(progressKey);
    if (watchTarget) api.setWatched(watchTarget.serverId, watchTarget.folderName, watchTarget.itemTitle, true).catch(() => {});
    setFinished(true);
  };

  // For HLS the source is attached in the effect above, so leave src unset.
  const videoSrc = blobUrl ?? (playback && playback.mode !== 'hls' ? playback.url : undefined);

  const canBuffer = playback?.mode === 'directplay' && !blobUrl;

  const bufferAhead = async () => {
    if (!playback || playback.mode !== 'directplay') return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBuffer({ state: 'loading', pct: 0 });
    try {
      const res = await fetch(playback.url, { signal: ctrl.signal });
      if (!res.ok || !res.body) throw new Error(`Server returned ${res.status}`);
      const total = Number(res.headers.get('content-length')) || 0;
      if (total > MAX_BUFFER_BYTES) throw new Error('File is too large to hold in memory — use Download instead.');
      const reader = res.body.getReader();
      const chunks: BlobPart[] = [];
      let got = 0;
      let lastPct = -1;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value as BlobPart);
        got += value.length;
        if (got > MAX_BUFFER_BYTES) { ctrl.abort(); throw new Error('File is too large to hold in memory — use Download instead.'); }
        const pct = total ? Math.floor((got / total) * 100) : 0;
        if (pct !== lastPct) { lastPct = pct; setBuffer({ state: 'loading', pct }); }
      }
      const player = playerRef.current;
      if (player) swapRef.current = { t: player.currentTime, playing: !player.paused };
      setBlobUrl(URL.createObjectURL(new Blob(chunks, { type: res.headers.get('content-type') || undefined })));
      setBuffer({ state: 'done', pct: 100 });
    } catch (e) {
      if (ctrl.signal.aborted && abortRef.current !== ctrl) return; // cancelled / unmounted
      setBuffer({ state: 'error', pct: 0, message: e instanceof Error ? e.message : 'Could not load the file' });
    }
  };

  const cancelBuffer = () => { abortRef.current = null; setBuffer({ state: 'idle', pct: 0 }); };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
      <button onClick={onBack} style={{ marginBottom: 16 }}>&larr; Back</button>
      <h1 style={{ marginBottom: 16 }}>{title}</h1>
      {resumeTime != null && (
        <p style={{ marginBottom: 12, color: '#666' }}>
          Resuming from {Math.floor(resumeTime / 60)}:{`${Math.floor(resumeTime % 60)}`.padStart(2, '0')}
        </p>
      )}
      {mediaType === 'video' && (
        <div style={{ marginBottom: 12, padding: 12, border: '1px solid #ddd', borderRadius: 10, background: '#f8f8f8' }}>
          <strong>Subtitles</strong>
          <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
            {subtitles.length > 0
              ? 'Use the player menu to turn subtitles on or off.'
              : 'No subtitle tracks found for this file.'}
          </div>
        </div>
      )}
      {playbackError && (
        <div style={{ marginBottom: 12, padding: 12, border: '1px solid #f0c0c0', borderRadius: 10, background: '#fff5f5', color: '#a33' }}>
          Couldn't play this file. If it needs transcoding, make sure ffmpeg is installed on the
          server — or convert it to h264 mp4, or play it on a device that supports the codec.
        </div>
      )}
      {isStream && !playback && !playbackError && (
        <div style={{ marginBottom: 12, fontSize: 13, color: '#888' }}>Preparing stream…</div>
      )}
      {playback?.mode === 'hls' && !playbackError && (
        <div style={{ marginBottom: 12, fontSize: 13, color: '#888' }}>
          Transcoding on the fly (HLS) — seeking and resume work; playback may pause briefly while it catches up.
        </div>
      )}
      {seekLimited && !playbackError && (
        <div style={{ marginBottom: 12, fontSize: 13, color: '#888' }}>
          Streaming (remuxed on the fly) — seeking and resume are limited for this format.
        </div>
      )}
      {mediaType === 'audio' ? (
        <audio
          ref={playerRef as React.RefObject<HTMLAudioElement>}
          controls
          autoPlay
          preload="auto"
          src={videoSrc}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={saveProgress}
          onPause={saveProgress}
          onEnded={handleEnded}
          style={{ width: '100%' }}
        >
          Your browser does not support this media format.
        </audio>
      ) : (
        <video
          ref={playerRef as React.RefObject<HTMLVideoElement>}
          controls
          autoPlay
          preload="auto"
          crossOrigin="anonymous"
          poster={posterUrl}
          src={videoSrc}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={saveProgress}
          onPause={saveProgress}
          onEnded={handleEnded}
          onError={() => { if (playback && playback.mode !== 'hls') setPlaybackError(true); }}
          style={{ width: '100%', maxHeight: '70vh', borderRadius: 12, background: '#000' }}
        >
          {subtitles.map((track, index) => (
            <track
              key={track.url}
              src={track.url}
              label={track.fileName}
              kind="captions"
              srcLang="en"
              default={index === 0}
            />
          ))}
          Your browser does not support this media format.
        </video>
      )}
      <div className="player-tools">
        {canBuffer && buffer.state === 'idle' && (
          <Button onClick={bufferAhead} title="Download the whole file first so playback never stalls">⏬ Load whole file</Button>
        )}
        {buffer.state === 'loading' && (
          <>
            <progress value={buffer.pct} max={100} aria-label="Loading file" />
            <span className="mm-muted">{buffer.pct}%</span>
            <Button variant="ghost" onClick={cancelBuffer}>Cancel</Button>
          </>
        )}
        {buffer.state === 'done' && <span className="mm-muted">✓ Fully loaded — playing from memory</span>}
        {buffer.state === 'error' && <span style={{ color: '#e55' }}>{buffer.message}</span>}
        <DownloadLink mediaUrl={mediaUrl} />
      </div>
    </div>
  );
};

export default MediaPlayerPage;
