import React, { useState } from 'react';
import MediaCard from './MediaCard';
import Button from './ui/Button';
import { api } from '../api';
import { useAsync } from '../hooks/useAsync';
import type { CollectionSummary } from '../types';

interface CollectionsPageProps {
  onOpen: (name: string) => void;
}

const CollectionsPage: React.FC<CollectionsPageProps> = ({ onOpen }) => {
  const { data, loading, error, setData } = useAsync<CollectionSummary[]>(
    async () => (await api.getCollections()).collections, []);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const createCollection = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await api.createCollection(name);
      setData((await api.getCollections()).collections);
      setNewName('');
    } finally { setBusy(false); }
  };

  if (loading) return <div>Loading collections...</div>;
  if (error) return <div>Error: {error}</div>;
  const collections = data ?? [];

  return (
    <div className="folder-details">
      <h2>Collections</h2>
      <p className="mm-muted" style={{ marginTop: -8 }}>
        Group movies and TV shows together. Items still appear in their own tabs.
      </p>

      <div style={{ display: 'flex', gap: 8, margin: '12px 0 20px', maxWidth: 420 }}>
        <input
          type="text"
          value={newName}
          placeholder="New collection name…"
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') createCollection(); }}
          style={{ flex: 1 }}
        />
        <Button variant="primary" onClick={createCollection} disabled={busy || !newName.trim()}>+ Create</Button>
      </div>

      {collections.length > 0 ? (
        <div className="media-grid">
          {collections.map(c => (
            <div key={c.name} onClick={() => onOpen(c.name)} style={{ cursor: 'pointer' }}>
              <MediaCard item={{ title: c.name, type: 'collection', imageUrl: c.imageUrl || undefined }} />
              <div className="mm-muted" style={{ fontSize: 12, textAlign: 'center', marginTop: -6 }}>
                {c.count} item{c.count === 1 ? '' : 's'}{c.hasDisk ? '' : ' · custom'}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p><em>No collections yet. Create one above, or a movie folder with sub-folders becomes one automatically.</em></p>
      )}
    </div>
  );
};

export default CollectionsPage;
