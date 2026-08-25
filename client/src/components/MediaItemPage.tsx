import React, { useState } from 'react';
import CoverEditor from './CoverEditor';
import Poster from './ui/Poster';
import Panel from './ui/Panel';
import Button from './ui/Button';
import { api, type SubtitleSearchResult, type MetadataSuggestion } from '../api';
import { useAsync } from '../hooks/useAsync';
import type { MediaItem, SubtitleTrack } from '../types';

interface MediaItemPageProps {
  serverId: string;
  folderName: string;
  itemTitle: string;
  onBack: () => void;
  onSelectSeason: (seasonName: string) => void;
  onPlay: (title: string, mediaUrl: string, posterUrl?: string, subtitles?: SubtitleTrack[]) => void;
  onRenamed: (newTitle: string) => void;
}

interface LoadedItem {
  item: MediaItem | null;
  seasons: MediaItem[];
}

const MediaItemPage: React.FC<MediaItemPageProps> = ({ serverId, folderName, itemTitle, onBack, onSelectSeason, onPlay, onRenamed }) => {
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
  const [metaSuggestions, setMetaSuggestions] = useState<MetadataSuggestion[] | null>(null);
  const [subStatus, setSubStatus] = useState<string | null>(null);
  const [subResults, setSubResults] = useState<SubtitleSearchResult[] | null>(null);
  const [cvStatus, setCvStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<'subs' | 'cv' | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [posterStatus, setPosterStatus] = useState<string | null>(null);
  const [fetchingPosters, setFetchingPosters] = useState(false);
  const [editingSeason, setEditingSeason] = useState<MediaItem | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [renameStatus, setRenameStatus] = useState<string | null>(null);

  const item = data?.item ?? null;
  const seasons = data?.seasons ?? [];
  const updateItem = (patch: Partial<MediaItem>) => item && setData({ item: { ...item, ...patch }, seasons });

  const fetchMetadata = async () => {
    setFetchingMeta(true); setMetaStatus(null); setMetaSuggestions(null);
    try {
      const res = await api.fetchMetadata(serverId, folderName, itemTitle);
      if (res.stub) setMetaStatus(res.message || 'No metadata provider configured.');
      else if (res.suggestions && res.suggestions.length) {
        setMetaSuggestions(res.suggestions);
        setMetaStatus('No exact match — pick the right one, or skip.');
      }
      else if (res.found === false) setMetaStatus('No match found.');
      else if (res.item) { setData({ item: res.item, seasons }); setMetaStatus(`Updated from ${res.provider}.`); }
      else setMetaStatus(res.error || 'Lookup failed.');
    } catch (e) { setMetaStatus(e instanceof Error ? e.message : 'Lookup failed.'); }
    finally { setFetchingMeta(false); }
  };

  const approveSuggestion = async (s: MetadataSuggestion, alsoRename = false) => {
    setFetchingMeta(true);
    try {
      const res = await api.applyMetadata(serverId, folderName, itemTitle, s.tmdbId);
      if (res.found && res.item) {
        setData({ item: res.item, seasons });
        setMetaSuggestions(null);
        setMetaStatus(`Applied “${s.title}”${s.year ? ` (${s.year})` : ''}.`);
        if (alsoRename && s.title) await doRename(s.year ? `${s.title} (${s.year})` : s.title);
      } else setMetaStatus(res.error || 'Apply failed.');
    } catch (e) { setMetaStatus(e instanceof Error ? e.message : 'Apply failed.'); }
    finally { setFetchingMeta(false); }
  };

  // Rename the item's folder on disk, then jump to its new route (title changed).
  const doRename = async (newTitle: string) => {
    const clean = newTitle.trim();
    if (!clean || clean === itemTitle) { setEditingTitle(false); return; }
    setRenameStatus('Renaming…');
    try {
      const res = await api.renameItem(serverId, folderName, itemTitle, clean);
      if (res.success && res.newTitle) { setEditingTitle(false); onRenamed(res.newTitle); }
      else setRenameStatus(res.error || 'Rename failed.');
    } catch (e) { setRenameStatus(e instanceof Error ? e.message : 'Rename failed.'); }
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

  const downloadSubtitle = async (r: SubtitleSearchResult) => {
    if (r.fileId == null) { setSubStatus('This result has no downloadable file.'); return; }
    setDownloadingId(r.id); setSubStatus(null);
    try {
      const res = await api.downloadSubtitle(serverId, folderName, itemTitle, r.fileId, r.language);
      if (res.stub) setSubStatus(res.message || 'No subtitle provider configured.');
      else if (res.success) {
        if (res.subtitles) updateItem({ subtitles: res.subtitles }); // keep + auto-load on playback
        const left = res.remaining != null ? ` (${res.remaining} downloads left today)` : '';
        setSubStatus(`Saved ${res.fileName}${left}.`);
      } else setSubStatus(res.error || 'Download failed.');
    } catch (e) { setSubStatus(e instanceof Error ? e.message : 'Download failed.'); }
    finally { setDownloadingId(null); }
  };

  const fetchSeasonPosters = async () => {
    setFetchingPosters(true); setPosterStatus(null);
    try {
      const res = await api.fetchSeasonPosters(serverId, folderName, itemTitle);
      if (res.stub) setPosterStatus(res.message || 'No metadata provider configured.');
      else if (res.success) {
        if (res.seasons && item) setData({ item, seasons: res.seasons });
        const miss = res.missing && res.missing.length ? ` (${res.missing.length} without a match)` : '';
        setPosterStatus(`Saved ${res.saved ?? 0} season poster(s)${miss}.`);
      } else setPosterStatus(res.error || 'Fetch failed.');
    } catch (e) { setPosterStatus(e instanceof Error ? e.message : 'Fetch failed.'); }
    finally { setFetchingPosters(false); }
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

      <div className="item-header">
        <div className="item-header__poster">
          <Poster src={item.imageUrl} alt={item.title} width={260} height={390} quality={item.quality} />
          {canEditCover && <Button onClick={() => setEditingCover(true)}>🖼️ Change cover</Button>}
        </div>

        <div className="item-header__info">
          {editingTitle ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <input
                type="text"
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') doRename(titleDraft); if (e.key === 'Escape') setEditingTitle(false); }}
                autoFocus
                style={{ fontSize: 20, flex: 1, minWidth: 240 }}
              />
              <Button variant="primary" onClick={() => doRename(titleDraft)}>Save</Button>
              <Button onClick={() => { setEditingTitle(false); setRenameStatus(null); }}>Cancel</Button>
            </div>
          ) : (
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {item.title}
              <Button style={{ fontSize: 13 }} onClick={() => { setTitleDraft(item.title); setEditingTitle(true); setRenameStatus(null); }} title="Rename this item's folder on disk">✏️ Rename</Button>
            </h1>
          )}
          {renameStatus && <p className="mm-status">{renameStatus}</p>}
          {item.mediaUrl && (
            <Button variant="primary" style={{ marginBottom: 16 }}
              onClick={() => onPlay(item.title, item.mediaUrl as string, item.imageUrl, item.subtitles)}>
              ▶ Play
            </Button>
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
            {metaSuggestions && metaSuggestions.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <strong style={{ fontSize: 13 }}>Suggestions</strong>
                  <Button onClick={() => setMetaSuggestions(null)} style={{ fontSize: 12 }}>Dismiss</Button>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {metaSuggestions.map(s => (
                    <li key={s.tmdbId} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                      {s.posterUrl
                        ? <img src={s.posterUrl} alt={s.title} style={{ width: 46, height: 69, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                        : <div style={{ width: 46, height: 69, borderRadius: 4, background: 'var(--border)', flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{s.title}{s.year ? ` (${s.year})` : ''}{s.rating ? ` · ⭐ ${s.rating}` : ''}</div>
                        {s.overview && <div className="mm-muted" style={{ fontSize: 12, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.overview}</div>}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                        <Button variant="primary" onClick={() => approveSuggestion(s)} disabled={fetchingMeta} style={{ fontSize: 12 }}>Approve</Button>
                        <Button onClick={() => approveSuggestion(s, true)} disabled={fetchingMeta} style={{ fontSize: 12 }} title="Apply info and rename the folder to this title">+ Rename</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
                <ul style={{ marginTop: 8, fontSize: 13, listStyle: 'none', padding: 0 }}>
                  {subResults.map(r => (
                    <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ flex: 1 }}>{r.language} — {r.release} {r.downloads != null ? `(${r.downloads} dl)` : ''}</span>
                      <Button
                        onClick={() => downloadSubtitle(r)}
                        disabled={downloadingId != null || r.fileId == null}
                        title={r.fileId == null ? 'No downloadable file' : 'Download + keep in this item’s folder'}
                      >
                        {downloadingId === r.id ? 'Saving…' : '⬇ Download'}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {cvStatus && <p className="mm-status" style={{ wordBreak: 'break-all' }}>{cvStatus}</p>}
            </Panel>
          )}
        </div>
      </div>

      {editingCover && (
        <CoverEditor
          serverId={serverId}
          folderName={folderName}
          itemTitle={itemTitle}
          currentImageUrl={item.imageUrl || undefined}
          onClose={() => setEditingCover(false)}
          onSaved={(imageUrl) => { updateItem({ imageUrl }); setEditingCover(false); }}
        />
      )}

      {editingSeason && item && (
        <CoverEditor
          serverId={serverId}
          folderName={folderName}
          itemTitle={itemTitle}
          seasonName={editingSeason.title}
          currentImageUrl={editingSeason.imageUrl || undefined}
          onClose={() => setEditingSeason(null)}
          onSaved={(imageUrl) => {
            setData({ item, seasons: seasons.map(s => s.title === editingSeason.title ? { ...s, imageUrl } : s) });
            setEditingSeason(null);
          }}
        />
      )}

      {seasons.length > 0 && item.type === 'collection' && (
        <div style={{ marginTop: 32 }}>
          <h2>Movies</h2>
          <div className="media-flex-row">
            {seasons.map(movie => (
              <div key={movie.title} style={{ textAlign: 'center' }}>
                <Poster src={movie.imageUrl} alt={movie.title} width={120} height={180} quality={movie.quality} />
                <div className="card-title">{movie.title}</div>
                {movie.mediaUrl && <Button onClick={() => onPlay(movie.title, movie.mediaUrl as string, movie.imageUrl, movie.subtitles)}>Play</Button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {seasons.length > 0 && item.type === 'show' && (
        <div style={{ marginTop: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Seasons</h2>
            <Button onClick={fetchSeasonPosters} disabled={fetchingPosters}>
              {fetchingPosters ? 'Fetching…' : '🖼️ Fetch season posters (TMDB)'}
            </Button>
            {posterStatus && <span className="mm-status">{posterStatus}</span>}
          </div>
          <div className="media-flex-row">
            {seasons.map(season => (
              <div key={season.title} style={{ textAlign: 'center', width: 120 }}>
                <div style={{ cursor: 'pointer' }} onClick={() => onSelectSeason(season.title)}>
                  <Poster src={season.imageUrl} alt={season.title} width={120} height={180} />
                  <div className="card-title">{season.title}</div>
                </div>
                <Button style={{ marginTop: 6, fontSize: 12 }} onClick={() => setEditingSeason(season)}>🖼️ Edit cover</Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaItemPage;
