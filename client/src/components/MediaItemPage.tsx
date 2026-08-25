import React, { useState } from 'react';
import CoverEditor from './CoverEditor';
import Poster from './ui/Poster';
import Panel from './ui/Panel';
import Button from './ui/Button';
import { api, type SubtitleSearchResult } from '../api';
import { useAsync } from '../hooks/useAsync';
import type { MediaItem, SubtitleTrack } from '../types';

interface MediaItemPageProps {
  serverId: string;
  folderName: string;
  itemTitle: string;
  onBack: () => void;
  onSelectSeason: (seasonName: string) => void;
  onPlay: (title: string, mediaUrl: string, posterUrl?: string, subtitles?: SubtitleTrack[]) => void;
}

interface LoadedItem {
  item: MediaItem | null;
  seasons: MediaItem[];
}

const MediaItemPage: React.FC<MediaItemPageProps> = ({ serverId, folderName, itemTitle, onBack, onSelectSeason, onPlay }) => {
  const invalid = !serverId || !folderName || !itemTitle;

  const { data, loading, error, setData } = useAsync<LoadedItem>(async () => {
    if (invalid) return { item: null, seasons: [] };
    const { media } = await api.getFolderMedia(serverId, folderName);
    const item = media.find(m => m.title === itemTitle) || null;
    let seasons: MediaItem[] = [];
    if (item && (item.type === 'show' || item.type === 'collection')) {
      seasons = (await api.getSeasons(serverId, folderName, itemTitle)).media;
    }
    return { item, seasons };
  }, [serverId, folderName, itemTitle]);

  const [editingCover, setEditingCover] = useState(false);
  const [metaStatus, setMetaStatus] = useState<string | null>(null);
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [subStatus, setSubStatus] = useState<string | null>(null);
  const [subResults, setSubResults] = useState<SubtitleSearchResult[] | null>(null);
  const [cvStatus, setCvStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<'subs' | 'cv' | null>(null);

  const item = data?.item ?? null;
  const seasons = data?.seasons ?? [];
  const updateItem = (patch: Partial<MediaItem>) => item && setData({ item: { ...item, ...patch }, seasons });

  const fetchMetadata = async () => {
    setFetchingMeta(true); setMetaStatus(null);
    try {
      const res = await api.fetchMetadata(serverId, folderName, itemTitle);
      if (res.stub) setMetaStatus(res.message || 'No metadata provider configured.');
      else if (res.found === false) setMetaStatus('No match found.');
      else if (res.item) { setData({ item: res.item, seasons }); setMetaStatus(`Updated from ${res.provider}.`); }
      else setMetaStatus(res.error || 'Lookup failed.');
    } catch (e) { setMetaStatus(e instanceof Error ? e.message : 'Lookup failed.'); }
    finally { setFetchingMeta(false); }
  };

  const findSubtitles = async () => {
    setBusy('subs'); setSubStatus(null); setSubResults(null);
    try {
      const res = await api.findSubtitles(serverId, folderName, itemTitle);
      if (res.stub) setSubStatus(res.message || 'No subtitle provider configured.');
      else if (res.results) { setSubResults(res.results); setSubStatus(res.results.length ? `Found ${res.results.length} result(s).` : 'No results.'); }
      else setSubStatus(res.error || 'Search failed.');
    } catch (e) { setSubStatus(e instanceof Error ? e.message : 'Search failed.'); }
    finally { setBusy(null); }
  };

  const runCleanvid = async () => {
    setBusy('cv'); setCvStatus(null);
    try {
      const res = await api.runCleanvid(serverId, folderName, itemTitle);
      if (res.stub) setCvStatus(res.message || 'cleanvid disabled.');
      else if (res.success) setCvStatus(`Done → ${res.outputPath}`);
      else setCvStatus(res.error || 'cleanvid failed.');
    } catch (e) { setCvStatus(e instanceof Error ? e.message : 'cleanvid failed.'); }
    finally { setBusy(null); }
  };

  if (invalid) return <div style={{ color: 'red', padding: 24 }}>Invalid media item: missing server, folder, or item title.</div>;
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!item) return <div>Media item not found.</div>;

  const canEditCover = item.type !== 'music' && item.type !== 'audiobook';

  return (
    <div className="media-item-page">
      <button className="back-btn" onClick={onBack}>&larr; Back</button>

      <div style={{ marginBottom: 16 }}>
        <Poster src={item.imageUrl} alt={item.title} width={220} height={330} />
        {canEditCover && <Button onClick={() => setEditingCover(true)} style={{ marginTop: 8 }}>🖼️ Change cover</Button>}
      </div>

      <h1>{item.title}</h1>
      {item.mediaUrl && (
        <Button variant="primary" style={{ marginBottom: 24, marginRight: 12 }}
          onClick={() => onPlay(item.title, item.mediaUrl as string, item.imageUrl, item.subtitles)}>
          Play
        </Button>
      )}

      {editingCover && (
        <CoverEditor
          serverId={serverId}
          folderName={folderName}
          itemTitle={itemTitle}
          onClose={() => setEditingCover(false)}
          onSaved={(imageUrl) => { updateItem({ imageUrl }); setEditingCover(false); }}
        />
      )}

      <Panel
        title="Info"
        actions={<Button onClick={fetchMetadata} disabled={fetchingMeta}>{fetchingMeta ? 'Fetching…' : '🔎 Fetch info (TMDB/IMDB)'}</Button>}
      >
        {item.metadata ? (
          <div style={{ fontSize: 14 }}>
            <div style={{ marginBottom: 6 }}>
              {item.metadata.year && <span style={{ marginRight: 16 }}><strong>Year:</strong> {item.metadata.year}</span>}
              {item.metadata.rating != null && <span style={{ marginRight: 16 }}><strong>Rating:</strong> ⭐ {item.metadata.rating}</span>}
              {item.metadata.imdbId && <a href={`https://www.imdb.com/title/${item.metadata.imdbId}`} target="_blank" rel="noreferrer">IMDB ↗</a>}
            </div>
            {item.metadata.overview && <p style={{ margin: 0 }}>{item.metadata.overview}</p>}
          </div>
        ) : (
          <p className="mm-muted">No metadata yet. Click fetch to look it up.</p>
        )}
        {metaStatus && <p className="mm-status">{metaStatus}</p>}
      </Panel>

      {item.type !== 'collection' && (
        <Panel
          title="Subtitles"
          actions={
            <>
              <Button onClick={findSubtitles} disabled={busy === 'subs'}>{busy === 'subs' ? 'Searching…' : '🔍 Find online'}</Button>
              {item.mediaUrl && <Button onClick={runCleanvid} disabled={busy === 'cv'} title="Mute/remove profanity (cleanvid)">{busy === 'cv' ? 'Cleaning…' : '🧼 cleanvid'}</Button>}
            </>
          }
        >
          {item.subtitles && item.subtitles.length > 0 ? (
            <ul>{item.subtitles.map(t => <li key={t.url}>{t.fileName}</li>)}</ul>
          ) : (
            <p className="mm-muted">No local subtitle files found for this item.</p>
          )}
          {subStatus && <p className="mm-status">{subStatus}</p>}
          {subResults && subResults.length > 0 && (
            <ul style={{ marginTop: 8, fontSize: 13 }}>
              {subResults.map(r => <li key={r.id}>{r.language} — {r.release} {r.downloads != null ? `(${r.downloads} dl)` : ''}</li>)}
            </ul>
          )}
          {cvStatus && <p className="mm-status" style={{ wordBreak: 'break-all' }}>{cvStatus}</p>}
        </Panel>
      )}

      {seasons.length > 0 && item.type === 'collection' && (
        <div style={{ marginTop: 32 }}>
          <h2>Movies</h2>
          <div className="media-flex-row">
            {seasons.map(movie => (
              <div key={movie.title} style={{ textAlign: 'center' }}>
                <Poster src={movie.imageUrl} alt={movie.title} width={120} height={180} />
                <div style={{ fontWeight: 500, margin: '6px 0' }}>{movie.title}</div>
                {movie.mediaUrl && <Button onClick={() => onPlay(movie.title, movie.mediaUrl as string, movie.imageUrl, movie.subtitles)}>Play</Button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {seasons.length > 0 && item.type === 'show' && (
        <div style={{ marginTop: 32 }}>
          <h2>Seasons</h2>
          <div className="media-flex-row">
            {seasons.map(season => (
              <div key={season.title} style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => onSelectSeason(season.title)}>
                <Poster src={season.imageUrl} alt={season.title} width={120} height={180} />
                <div style={{ fontWeight: 500, marginTop: 6 }}>{season.title}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaItemPage;
