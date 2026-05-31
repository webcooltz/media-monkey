import { useEffect, useState } from 'react';
import MediaCard from './MediaCard';

interface FolderProps {
  apiBase: string;
  serverId: string;
  folderName: string;
  onSelectMediaItem: (itemTitle: string) => void;
}

interface MediaItem {
  title: string;
  type: string;
  imageUrl?: string;
}

const Folder: React.FC<FolderProps> = ({ apiBase, serverId, folderName, onSelectMediaItem }) => {
  const [media, setMedia] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isInvalid = !serverId || !folderName;

  useEffect(() => {
    if (isInvalid) {
      return;
    }

    let cancelled = false;

    fetch(`${apiBase}/media/${encodeURIComponent(serverId)}/${encodeURIComponent(folderName)}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch folder media');
        return res.json();
      })
      .then(data => {
        if (cancelled) return;
        if (Array.isArray(data.media)) setMedia(data.media);
        else if (data.folder && Array.isArray(data.folder.media)) setMedia(data.folder.media);
        else setMedia([]);
        setError(null);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [serverId, folderName, apiBase, isInvalid]);

  if (isInvalid) {
    return <div style={{ color: 'red', padding: 24 }}>Invalid folder: missing server or folder name.</div>;
  }

  if (media === null) return <div>Loading folder...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="folder-details">
      <h2>{folderName}</h2>
      {media.length > 0 ? (
        <div className="media-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 24, marginTop: 24 }}>
          {media.map((item, idx) => (
            <div key={item.title + '-' + idx} style={{ cursor: 'pointer' }} onClick={() => onSelectMediaItem(item.title)}>
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
