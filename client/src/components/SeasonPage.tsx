import React from 'react';
import Poster from './ui/Poster';
import Button from './ui/Button';
import { api } from '../api';
import { useAsync } from '../hooks/useAsync';
import type { MediaItem, SubtitleTrack } from '../types';

interface SeasonPageProps {
  serverId: string;
  folderName: string;
  showTitle: string;
  seasonName: string;
  onBack: () => void;
  onPlay: (title: string, mediaUrl: string, posterUrl?: string, subtitles?: SubtitleTrack[]) => void;
}

interface SeasonData {
  cover?: string;
  episodes: MediaItem[];
}

const SeasonPage: React.FC<SeasonPageProps> = ({ serverId, folderName, showTitle, seasonName, onBack, onPlay }) => {
  const { data, loading, error } = useAsync<SeasonData>(async () => {
    const seasons = (await api.getSeasons(serverId, folderName, showTitle)).media;
    const cover = seasons.find(s => s.title === seasonName)?.imageUrl;
    const episodes = (await api.getEpisodes(serverId, folderName, showTitle, seasonName)).media;
    return { cover, episodes };
  }, [serverId, folderName, showTitle, seasonName]);

  if (loading) return <div>Loading season...</div>;
  if (error) return <div>Error: {error}</div>;

  const cover = data?.cover;
  const episodes = data?.episodes ?? [];

  return (
    <div className="season-page">
      <button className="back-btn" onClick={onBack}>&larr; Back</button>
      {cover && <Poster src={cover} alt={seasonName} width={200} height={200} />}
      <h1>{seasonName}</h1>
      <h2 style={{ marginTop: 32 }}>Episodes</h2>
      {episodes.length > 0 ? (
        <div className="media-flex-row">
          {episodes.map((ep, idx) => (
            <div key={ep.title + '-' + idx} style={{ textAlign: 'center', width: 140 }}>
              <Poster src={ep.imageUrl} alt={ep.title} width={120} height={120} />
              <div style={{ fontWeight: 500, margin: '6px 0' }}>{ep.title}</div>
              <div className="mm-muted" style={{ fontSize: 12 }}>
                {ep.subtitles && ep.subtitles.length > 0
                  ? `${ep.subtitles.length} subtitle${ep.subtitles.length === 1 ? '' : 's'}`
                  : 'No subtitles found'}
              </div>
              {ep.mediaUrl && (
                <Button style={{ marginTop: 8 }} onClick={() => onPlay(ep.title, ep.mediaUrl as string, cover, ep.subtitles)}>Play</Button>
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
