import React, { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';

interface MediaPlayerPageProps {
  title: string;
  mediaUrl: string;
  posterUrl?: string;
  subtitles?: SubtitleTrack[];
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

const MediaPlayerPage: React.FC<MediaPlayerPageProps> = ({ title, mediaUrl, posterUrl, subtitles = [], onBack }) => {
  const playerRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
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
  const [resumeTime, setResumeTime] = useState<number | null>(null);
  const [playbackError, setPlaybackError] = useState(false);

  // Resolve the playback mode for stream URLs.
  useEffect(() => {
    if (!isStream) return;
    let cancelled = false;
    setPlayback(null);
    setPlaybackError(false);
    fetch(mediaUrl.replace('/api/media/stream', '/api/media/streaminfo'))
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`streaminfo ${res.status}`))))
      .then((info: ResolvedPlayback) => { if (!cancelled) setPlayback(info); })
      .catch(() => { if (!cancelled) setPlaybackError(true); });
    return () => { cancelled = true; };
  }, [mediaUrl, isStream]);

  // Set the resume point once we know whether the timeline is seekable.
  useEffect(() => {
    if (!playback) return;
    setResumeTime(playback.mode === 'remux' ? null : getSavedResumeTime(progressKey));
  }, [playback, progressKey]);

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
    if (seekLimited) return; // remux timeline isn't seek-stable — don't persist resume points
    const player = playerRef.current;
    if (!player || !Number.isFinite(player.currentTime)) {
      return;
    }

    const duration = Number.isFinite(player.duration) ? player.duration : 0;
    const isNearlyFinished = duration > 0 && player.currentTime >= Math.max(duration - 10, duration * 0.95);

    if (isNearlyFinished) {
      localStorage.removeItem(progressKey);
      return;
    }

    const progress: PlaybackProgress = {
      currentTime: player.currentTime,
      duration,
      updatedAt: Date.now(),
    };
    localStorage.setItem(progressKey, JSON.stringify(progress));
  };

  const handleLoadedMetadata = () => {
    const player = playerRef.current;
    if (!player || resumeTime == null) {
      return;
    }

    if (player.duration && resumeTime < player.duration - 2) {
      player.currentTime = resumeTime;
    }
  };

  const handleEnded = () => {
    localStorage.removeItem(progressKey);
    setResumeTime(null);
  };

  // For HLS the source is attached in the effect above, so leave src unset.
  const videoSrc = playback && playback.mode !== 'hls' ? playback.url : undefined;

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
    </div>
  );
};

export default MediaPlayerPage;
