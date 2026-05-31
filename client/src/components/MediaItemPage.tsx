import React, { useEffect, useState } from 'react';
// ...existing code...
import SeasonPage from './SeasonPage';

interface MediaItemPageProps {
  apiBase: string;
  serverId: string;
  folderName: string;
  itemTitle: string;
  onBack: () => void;
  onPlay: (title: string, mediaUrl: string, posterUrl?: string, subtitles?: SubtitleTrack[]) => void;
}

interface SubtitleTrack {
  label: string;
  fileName: string;
  url: string;
}

interface MediaItem {
  title: string;
  type: string;
  imageUrl?: string;
  mediaUrl?: string | null;
  subtitles?: SubtitleTrack[];
}

interface Season {
  title: string;
  imageUrl?: string;
  mediaUrl?: string | null;
  subtitles?: SubtitleTrack[];
}

const MediaItemPage: React.FC<MediaItemPageProps> = ({ apiBase, serverId, folderName, itemTitle, onBack, onPlay }) => {
  const [mediaItem, setMediaItem] = useState<MediaItem | null | undefined>(undefined);
  const [seasons, setSeasons] = useState<Season[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const isInvalid = !serverId || !folderName || !itemTitle;

  useEffect(() => {
    if (isInvalid) {
      return;
    }

    let cancelled = false;

    const loadMedia = async () => {
      try {
        const folderResponse = await fetch(`${apiBase}/media/${encodeURIComponent(serverId)}/${encodeURIComponent(folderName)}`);
        const folderData = await folderResponse.json();
        if (cancelled) return;

        let fetchedItem: MediaItem | null = null;
        if (Array.isArray(folderData.media)) {
          const found = folderData.media.find((m: MediaItem) => m.title === itemTitle);
          fetchedItem = found || null;
          setMediaItem(fetchedItem);
        } else {
          setMediaItem(null);
        }

        if (fetchedItem?.type === 'show' || fetchedItem?.type === 'collection') {
          const showResponse = await fetch(`${apiBase}/media/${encodeURIComponent(serverId)}/${encodeURIComponent(folderName)}/${encodeURIComponent(itemTitle)}`);
          const showData = await showResponse.json();
          if (cancelled) return;
          setSeasons(Array.isArray(showData.media) ? showData.media : []);
        } else {
          setSeasons([]);
        }
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load media item.');
        setMediaItem(null);
        setSeasons([]);
      }
    };

    loadMedia();

    return () => {
      cancelled = true;
    };
  }, [serverId, folderName, itemTitle, apiBase, isInvalid]);

  if (isInvalid) return <div style={{ color: 'red', padding: 24 }}>Invalid media item: missing server, folder, or item title.</div>;
  if (mediaItem === undefined || seasons === undefined) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!mediaItem) return <div>Media item not found.</div>;

  if (selectedSeason) {
    return (
      <SeasonPage
        key={`${serverId}:${folderName}:${itemTitle}:${selectedSeason}`}
        serverId={serverId}
        folderName={folderName}
        showTitle={itemTitle}
        seasonName={selectedSeason}
        apiBase={apiBase}
        onBack={() => setSelectedSeason(null)}
        onPlay={onPlay}
      />
    );
  }

  return (
    <div className="media-item-page" style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      <button
        onClick={onBack}
        style={{ marginBottom: 16 }}
      >&larr; Back</button>
      {mediaItem.imageUrl && (
        <img src={mediaItem.imageUrl} alt={mediaItem.title} style={{ width: 220, height: 330, objectFit: 'cover', borderRadius: 10, border: '1px solid #ccc', marginBottom: 16 }} />
      )}
      <h1>{mediaItem.title}</h1>
      {mediaItem.mediaUrl && (
        <button onClick={() => onPlay(mediaItem.title, mediaItem.mediaUrl as string, mediaItem.imageUrl, mediaItem.subtitles)} style={{ marginBottom: 24 }}>
          Play
        </button>
      )}
      {mediaItem.type !== 'collection' && (
      <div style={{ marginBottom: 24, padding: 16, border: '1px solid #ddd', borderRadius: 10, background: '#f8f8f8' }}>
        <h3 style={{ marginTop: 0 }}>Available Subtitles</h3>
        {mediaItem.subtitles && mediaItem.subtitles.length > 0 ? (
          <ul>
            {mediaItem.subtitles.map(track => (
              <li key={track.url}>{track.fileName}</li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: 0, color: '#666' }}>No subtitle files were found for this item.</p>
        )}
      </div>
      )}
      {/* Add more details here if available */}
      {seasons.length > 0 && mediaItem.type === 'collection' && (
        <div style={{ marginTop: 32 }}>
          <h2>Movies</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
            {seasons.map(movie => (
              <div key={movie.title} style={{ textAlign: 'center' }}>
                {movie.imageUrl ? (
                  <img src={movie.imageUrl} alt={movie.title} style={{ width: 120, height: 180, objectFit: 'cover', borderRadius: 8, border: '1px solid #ccc', marginBottom: 8 }} />
                ) : (
                  <div style={{ width: 120, height: 180, background: '#eee', borderRadius: 8, border: '1px solid #ccc', margin: '0 auto 8px auto', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>No Image</div>
                )}
                <div style={{ fontWeight: 500, marginBottom: 6 }}>{movie.title}</div>
                {movie.mediaUrl && (
                  <button onClick={() => onPlay(movie.title, movie.mediaUrl as string, movie.imageUrl, movie.subtitles)}>Play</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {seasons.length > 0 && mediaItem.type === 'show' && (
        <div style={{ marginTop: 32 }}>
          <h2>Seasons</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
            {seasons.map(season => (
              <div key={season.title} style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => setSelectedSeason(season.title)}>
                {season.imageUrl ? (
                  <img src={season.imageUrl} alt={season.title} style={{ width: 120, height: 180, objectFit: 'cover', borderRadius: 8, border: '1px solid #ccc', marginBottom: 8 }} />
                ) : (
                  <div style={{ width: 120, height: 180, background: '#eee', borderRadius: 8, border: '1px solid #ccc', margin: '0 auto 8px auto', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>No Image</div>
                )}
                <div style={{ fontWeight: 500 }}>{season.title}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaItemPage;
