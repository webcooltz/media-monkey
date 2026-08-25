import React, { useEffect, useState } from 'react';
import MediaCard from './MediaCard';
import Button from './ui/Button';
import { api } from '../api';
import { useAsync } from '../hooks/useAsync';
import { categoryForFolder } from '../mediaCategories';
import type { MediaItem } from '../types';

interface FolderProps {
  serverId: string;
  folderName: string;
  onSelectMediaItem: (itemTitle: string) => void;
}

const Folder: React.FC<FolderProps> = ({ serverId, folderName, onSelectMediaItem }) => {
  const invalid = !serverId || !folderName;
  const { data, loading, error } = useAsync<MediaItem[]>(
    async () => (invalid ? [] : (await api.getFolderMedia(serverId, folderName)).media),
    [serverId, folderName]
  );

  const [media, setMedia] = useState<MediaItem[]>([]);
  const [fetchingAll, setFetchingAll] = useState(false);
  const [fetchStatus, setFetchStatus] = useState<string | null>(null);
  useEffect(() => { if (data) setMedia(data); }, [data]);

  // Only movies/TV items have fetchable metadata.
  const cat = categoryForFolder(folderName);
  const canFetch = cat?.key === 'movies' || cat?.key === 'tv';
  const missingCount = media.filter(m => (m.type === 'movie' || m.type === 'show') && !m.metadata).length;

  const fetchAll = async () => {
    setFetchingAll(true); setFetchStatus('Fetching…');
    try {
      const res = await api.batchFetchMetadata(serverId, folderName);
      if (res.stub) setFetchStatus(res.message || 'No metadata provider configured.');
      else {
        if (res.media) setMedia(res.media);
        setFetchStatus(`Applied ${res.applied ?? 0}, ${res.review ?? 0} need review${res.none ? `, ${res.none} no match` : ''}${res.failed ? `, ${res.failed} failed` : ''}.`);
      }
    } catch (e) { setFetchStatus(e instanceof Error ? e.message : 'Fetch failed.'); }
    finally { setFetchingAll(false); }
  };

  if (invalid) return <div style={{ color: 'red', padding: 24 }}>Invalid folder: missing server or folder name.</div>;
  if (loading) return <div>Loading folder...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="folder-details">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>{folderName}</h2>
        {canFetch && (
          <Button onClick={fetchAll} disabled={fetchingAll} title="Fetch metadata for all items missing it">
            {fetchingAll ? 'Fetching…' : `🔎 Fetch all metadata${missingCount ? ` (${missingCount})` : ''}`}
          </Button>
        )}
        {fetchStatus && <span className="mm-status">{fetchStatus}</span>}
      </div>
      {media.length > 0 ? (
        <div className="media-grid">
          {media.map((item, idx) => (
            <div key={item.title + '-' + idx} onClick={() => onSelectMediaItem(item.title)}>
              <MediaCard item={item} />
            </div>
          ))}
        </div>
      ) : (
        <p><em>No media found in this folder.</em></p>
      )}
    </div>
  );
};

export default Folder;
