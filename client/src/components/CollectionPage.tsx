import React, { useState } from 'react';
import Poster from './ui/Poster';
import Button from './ui/Button';
import { api } from '../api';
import { useAsync } from '../hooks/useAsync';
import type { CollectionDetail, CollectionMember, ServerSettings, SubtitleTrack } from '../types';

interface CollectionPageProps {
  name: string;
  onBack: () => void;
  onPlay: (title: string, mediaUrl: string, posterUrl?: string, subtitles?: SubtitleTrack[]) => void;
  onOpenItem: (serverId: string, folderName: string, itemTitle: string) => void;
}

type Candidate = { serverId: string; folderName: string; title: string; type: string };

const CollectionPage: React.FC<CollectionPageProps> = ({ name, onBack, onPlay, onOpenItem }) => {
  const { data, loading, error, setData } = useAsync<CollectionDetail>(
    async () => await api.getCollection(name), [name]);
  // Candidate items to attach: every movie/show across all folders.
  const { data: servers } = useAsync<ServerSettings[]>(async () => (await api.getServers()).servers, []);
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);

  const members = data?.members ?? [];
  const memberKey = (m: { serverId: string; folderName: string; title: string }) => `${m.serverId}|${m.folderName}|${m.title}`;
  const memberKeys = new Set(members.filter(m => m.itemTitle).map(m => memberKey({ serverId: m.serverId, folderName: m.folderName, title: m.itemTitle as string })));

  const candidates: Candidate[] = [];
  servers?.forEach(s => s.folders.forEach(f => (f.media || []).forEach(it => {
    if ((it.type === 'movie' || it.type === 'show') && !memberKeys.has(`${s.id}|${f.name}|${it.title}`)) {
      candidates.push({ serverId: s.id, folderName: f.name, title: it.title, type: it.type });
    }
  })));

  const addSelected = async () => {
    if (!adding) return;
    const c = candidates.find(x => memberKey({ serverId: x.serverId, folderName: x.folderName, title: x.title }) === adding);
    if (!c) return;
    setBusy(true);
    try {
      setData(await api.addCollectionMember(name, c.serverId, c.folderName, c.title));
      setAdding('');
    } finally { setBusy(false); }
  };

  const removeMember = async (m: CollectionMember) => {
    setBusy(true);
    try {
      setData(await api.removeCollectionMember(name, m.serverId, m.folderName, m.itemTitle || m.title));
    } finally { setBusy(false); }
  };

  const setCover = async (m: CollectionMember) => {
    if (!m.imageUrl) return;
    setBusy(true);
    try { setData(await api.setCollectionCover(name, m.imageUrl)); }
    finally { setBusy(false); }
  };

  const stripQuery = (u?: string | null) => (u ? u.split('?')[0] : '');
  const isCover = (m: CollectionMember) => !!data?.coverUrl && stripQuery(m.imageUrl) === stripQuery(data.coverUrl);

  if (loading) return <div>Loading collection...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="folder-details">
      <button className="back-btn" onClick={onBack}>&larr; Back</button>
      <h2>{name}</h2>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0 20px', maxWidth: 520, flexWrap: 'wrap' }}>
        <select value={adding} onChange={e => setAdding(e.target.value)} style={{ flex: 1, minWidth: 240 }}>
          <option value="">Add a movie or show…</option>
          {candidates.map(c => (
            <option key={memberKey({ serverId: c.serverId, folderName: c.folderName, title: c.title })}
              value={memberKey({ serverId: c.serverId, folderName: c.folderName, title: c.title })}>
              {c.type === 'show' ? '📺' : '🎬'} {c.title} — {c.folderName}
            </option>
          ))}
        </select>
        <Button variant="primary" onClick={addSelected} disabled={busy || !adding}>+ Add</Button>
      </div>

      {members.length > 0 ? (
        <div className="media-flex-row">
          {members.map((m, idx) => (
            <div key={memberKey({ serverId: m.serverId, folderName: m.folderName, title: m.title }) + idx} style={{ textAlign: 'center', width: 140 }}>
              <div
                style={{ cursor: m.itemTitle || m.mediaUrl ? 'pointer' : 'default' }}
                onClick={() => {
                  if (m.itemTitle) onOpenItem(m.serverId, m.folderName, m.itemTitle);
                  else if (m.mediaUrl) onPlay(m.title, m.mediaUrl, m.imageUrl, m.subtitles);
                }}
              >
                <Poster src={m.imageUrl} alt={m.title} width={120} height={180} quality={m.quality} />
                <div className="card-title">{m.title}</div>
              </div>
              <div className="mm-muted" style={{ fontSize: 11 }}>
                {m.type === 'show' ? 'TV show' : 'Movie'}{m.source === 'attached' ? '' : ' · in folder'}
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                {m.imageUrl && (
                  isCover(m)
                    ? <span className="mm-muted" style={{ fontSize: 11, alignSelf: 'center' }}>★ Cover</span>
                    : <Button style={{ fontSize: 12 }} onClick={() => setCover(m)} disabled={busy} title="Use this poster as the collection cover">★ Set cover</Button>
                )}
                {m.source === 'attached' && (
                  <Button style={{ fontSize: 12 }} onClick={() => removeMember(m)} disabled={busy}>✕ Remove</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p><em>No items yet. Add movies or shows above.</em></p>
      )}
    </div>
  );
};

export default CollectionPage;
