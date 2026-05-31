import React, { useMemo, useRef, useState } from 'react';

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
  const mediaType = useMemo(() => {
    const path = mediaUrl.split('?')[0].toLowerCase();
    return /\.(mp3|m4a|aac|wav|flac)$/i.test(path) ? 'audio' : 'video';
  }, [mediaUrl]);
  const progressKey = `${PROGRESS_PREFIX}${mediaUrl}`;
  const [resumeTime, setResumeTime] = useState<number | null>(() => getSavedResumeTime(progressKey));

  const saveProgress = () => {
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
      {mediaType === 'audio' ? (
        <audio
          ref={playerRef as React.RefObject<HTMLAudioElement>}
          controls
          autoPlay
          src={mediaUrl}
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
          src={mediaUrl}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={saveProgress}
          onPause={saveProgress}
          onEnded={handleEnded}
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
