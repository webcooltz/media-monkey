import React from 'react';
import MediaCard from './MediaCard';
import { api } from '../api';
import { useAsync } from '../hooks/useAsync';
import type { MediaItem } from '../types';

interface FolderProps {
  serverId: string;
  folderName: string;
  onSelectMediaItem: (itemTitle: string) => void;
}

const Folder: React.FC<FolderProps> = ({ serverId, folderName, onSelectMediaItem }) => {
  const invalid = !serverId || !folderName;
  const { data: media, loading, error } = useAsync<MediaItem[]>(
    async () => (invalid ? [] : (await api.getFolderMedia(serverId, folderName)).media),
    [serverId, folderName]
  );

  if (invalid) return <div style={{ color: 'red', padding: 24 }}>Invalid folder: missing server or folder name.</div>;
  if (loading) return <div>Loading folder...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="folder-details">
      <h2>{folderName}</h2>
      {media && media.length > 0 ? (
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
