import React from 'react';

type MediaItem = {
  title: string;
  type: string;
  imageUrl?: string;
};

interface MediaCardProps {
  item: MediaItem;
  style?: React.CSSProperties;
}

const MediaCard: React.FC<MediaCardProps> = ({ item, style }) => (
  <div className="media-grid-item" style={{ textAlign: 'center', width: 140, minHeight: 250, ...style }}>
    {item.imageUrl ? (
      <img src={item.imageUrl} alt={item.title} style={{ width: 120, height: 180, objectFit: 'cover', borderRadius: 8, border: '1px solid #ccc', marginBottom: 8 }} />
    ) : (
      <div style={{ width: 120, height: 180, background: '#eee', borderRadius: 8, border: '1px solid #ccc', margin: '0 auto 8px auto', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>No Image</div>
    )}
    <div className="media-title">{item.title}</div>
  </div>
);

export default MediaCard;
