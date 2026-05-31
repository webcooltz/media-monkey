import React, { useEffect, useState } from 'react';

interface SeasonPageProps {
  serverId: string;
  folderName: string;
  showTitle: string;
  seasonName: string;
  apiBase: string;
  onBack: () => void;
  onPlay: (title: string, mediaUrl: string, posterUrl?: string, subtitles?: SubtitleTrack[]) => void;
}

interface SubtitleTrack {
  label: string;
  fileName: string;
  url: string;
}

interface Episode {
  title: string;
  imageUrl?: string;
  mediaUrl?: string | null;
  subtitles?: SubtitleTrack[];
}

interface SeasonInfo {
  title: string;
  imageUrl?: string;
}

const SeasonPage: React.FC<SeasonPageProps> = ({ serverId, folderName, showTitle, seasonName, apiBase, onBack, onPlay }) => {
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [seasonCover, setSeasonCover] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadSeason = async () => {
      try {
        const showResponse = await fetch(`${apiBase}/media/${encodeURIComponent(serverId)}/${encodeURIComponent(folderName)}/${encodeURIComponent(showTitle)}`);
        const showData = await showResponse.json();
        if (cancelled) return;

        if (Array.isArray(showData.media)) {
          const season = showData.media.find((item: SeasonInfo) => item.title === seasonName);
          setSeasonCover(season?.imageUrl);
        }

        const seasonResponse = await fetch(`${apiBase}/media/${encodeURIComponent(serverId)}/${encodeURIComponent(folderName)}/${encodeURIComponent(showTitle)}/${encodeURIComponent(seasonName)}`);
        const seasonData = await seasonResponse.json();
        if (cancelled) return;
        setEpisodes(Array.isArray(seasonData.media) ? seasonData.media : []);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load season.');
        setEpisodes([]);
      }
    };

    loadSeason();

    return () => {
      cancelled = true;
    };
  }, [serverId, folderName, showTitle, seasonName, apiBase]);

  if (episodes === null) return <div>Loading season...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="season-page" style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      <button onClick={onBack} style={{ marginBottom: 16 }}>&larr; Back</button>
      {seasonCover && (
        <img src={seasonCover} alt={seasonName} style={{ width: 200, height: 200, objectFit: 'cover', borderRadius: 10, border: '1px solid #ccc', marginBottom: 16 }} />
      )}
      <h1>{seasonName}</h1>
      <h2 style={{ marginTop: 32 }}>Episodes</h2>
      {episodes.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 24, marginTop: 24 }}>
          {episodes.map((ep, idx) => (
            <div key={ep.title + '-' + idx} style={{ textAlign: 'center' }}>
              {ep.imageUrl ? (
                <img src={ep.imageUrl} alt={ep.title} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid #ccc', marginBottom: 8 }} />
              ) : (
                <div style={{ width: 120, height: 120, background: '#eee', borderRadius: 8, border: '1px solid #ccc', margin: '0 auto 8px auto', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>No Image</div>
              )}
              <div style={{ fontWeight: 500 }}>{ep.title}</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 6, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 8, background: '#f8f8f8' }}>
                {ep.subtitles && ep.subtitles.length > 0 ? (
                  <>
                    <div>{ep.subtitles.length} subtitle{ep.subtitles.length === 1 ? '' : 's'}</div>
                    {ep.subtitles.map(track => (
                      <div key={track.url}>{track.fileName}</div>
                    ))}
                  </>
                ) : (
                  <div>No subtitles found</div>
                )}
              </div>
              {ep.mediaUrl && (
                <button onClick={() => onPlay(ep.title, ep.mediaUrl as string, seasonCover, ep.subtitles)} style={{ marginTop: 8 }}>
                  Play
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p><em>No episodes found in this season.</em></p>
      )}
    </div>
  );
};

export default SeasonPage;
