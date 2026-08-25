import React, { useEffect, useState } from 'react';
import Poster from './ui/Poster';
import Button from './ui/Button';
import { api, type SubtitleSearchResult } from '../api';
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

// Per-episode subtitle search/download UI state, keyed by episode title.
interface SubUi {
  status?: string | null;
  results?: SubtitleSearchResult[] | null;
  searching?: boolean;
  downloadingId?: string | null;
}

const SeasonPage: React.FC<SeasonPageProps> = ({ serverId, folderName, showTitle, seasonName, onBack, onPlay }) => {
  const { data, loading, error } = useAsync<SeasonData>(async () => {
    const seasons = (await api.getSeasons(serverId, folderName, showTitle)).media;
    const cover = seasons.find(s => s.title === seasonName)?.imageUrl;
    const episodes = (await api.getEpisodes(serverId, folderName, showTitle, seasonName)).media;
    return { cover, episodes };
  }, [serverId, folderName, showTitle, seasonName]);

  // Local copy so downloaded subtitles can update an episode's track list live.
  const [episodes, setEpisodes] = useState<MediaItem[]>([]);
  const [subUi, setSubUi] = useState<Record<string, SubUi>>({});
  useEffect(() => { if (data) setEpisodes(data.episodes); }, [data]);

  const patchUi = (title: string, patch: SubUi) =>
    setSubUi(prev => ({ ...prev, [title]: { ...prev[title], ...patch } }));

  const findSubs = async (ep: MediaItem) => {
    patchUi(ep.title, { searching: true, status: null, results: null });
    try {
      const res = await api.findEpisodeSubtitles(serverId, folderName, showTitle, seasonName, ep.title);
      if (res.stub) patchUi(ep.title, { status: res.message || 'No subtitle provider configured.' });
      else if (res.results) patchUi(ep.title, { results: res.results, status: res.results.length ? `Found ${res.results.length} result(s).` : 'No results.' });
      else patchUi(ep.title, { status: res.error || 'Search failed.' });
    } catch (e) { patchUi(ep.title, { status: e instanceof Error ? e.message : 'Search failed.' }); }
    finally { patchUi(ep.title, { searching: false }); }
  };

  const downloadSub = async (ep: MediaItem, r: SubtitleSearchResult) => {
    if (r.fileId == null) { patchUi(ep.title, { status: 'This result has no downloadable file.' }); return; }
    patchUi(ep.title, { downloadingId: r.id, status: null });
    try {
      const res = await api.downloadEpisodeSubtitle(serverId, folderName, showTitle, seasonName, ep.title, r.fileId, r.language);
      if (res.stub) patchUi(ep.title, { status: res.message || 'No subtitle provider configured.' });
      else if (res.success) {
        if (res.subtitles) setEpisodes(prev => prev.map(e => e.title === ep.title ? { ...e, subtitles: res.subtitles as SubtitleTrack[] } : e));
        const left = res.remaining != null ? ` (${res.remaining} downloads left today)` : '';
        patchUi(ep.title, { status: `Saved ${res.fileName}${left}.` });
      } else patchUi(ep.title, { status: res.error || 'Download failed.' });
    } catch (e) { patchUi(ep.title, { status: e instanceof Error ? e.message : 'Download failed.' }); }
    finally { patchUi(ep.title, { downloadingId: null }); }
  };

  if (loading) return <div>Loading season...</div>;
  if (error) return <div>Error: {error}</div>;

  const cover = data?.cover;

  return (
    <div className="season-page">
      <button className="back-btn" onClick={onBack}>&larr; Back</button>
      {cover && <Poster src={cover} alt={seasonName} width={200} height={200} />}
      <h1>{seasonName}</h1>
      <h2 style={{ marginTop: 32 }}>Episodes</h2>
      {episodes.length > 0 ? (
        <div className="media-flex-row">
          {episodes.map((ep, idx) => {
            const ui = subUi[ep.title] || {};
            return (
              <div key={ep.title + '-' + idx} style={{ textAlign: 'center', width: 180 }}>
                <Poster src={ep.imageUrl} alt={ep.title} width={120} height={120} quality={ep.quality} />
                <div className="card-title">{ep.title}</div>
                <div className="mm-muted" style={{ fontSize: 12 }}>
                  {ep.subtitles && ep.subtitles.length > 0
                    ? `${ep.subtitles.length} subtitle${ep.subtitles.length === 1 ? '' : 's'}`
                    : 'No subtitles found'}
                </div>
                {ep.mediaUrl && (
                  <Button style={{ marginTop: 8 }} onClick={() => onPlay(ep.title, ep.mediaUrl as string, cover, ep.subtitles)}>Play</Button>
                )}
                <Button style={{ marginTop: 8 }} onClick={() => findSubs(ep)} disabled={ui.searching}>
                  {ui.searching ? 'Searching…' : '🔍 Find subs'}
                </Button>
                {ui.results && ui.results.length > 0 && (
                  <ul style={{ marginTop: 8, fontSize: 12, listStyle: 'none', padding: 0, textAlign: 'left' }}>
                    {ui.results.map(r => (
                      <li key={r.id} style={{ marginBottom: 6 }}>
                        <div>{r.language} — {r.release} {r.downloads != null ? `(${r.downloads} dl)` : ''}</div>
                        <Button
                          onClick={() => downloadSub(ep, r)}
                          disabled={ui.downloadingId != null || r.fileId == null}
                          title={r.fileId == null ? 'No downloadable file' : 'Download + keep beside this episode'}
                        >
                          {ui.downloadingId === r.id ? 'Saving…' : '⬇ Download'}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {ui.status && <p className="mm-status" style={{ fontSize: 12 }}>{ui.status}</p>}
              </div>
            );
          })}
        </div>
      ) : (
        <p><em>No episodes found in this season.</em></p>
      )}
    </div>
  );
};

export default SeasonPage;
