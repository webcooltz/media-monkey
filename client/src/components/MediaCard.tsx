import React from 'react';
import Poster from './ui/Poster';
import type { MediaItem } from '../types';

interface MediaCardProps {
  item: Pick<MediaItem, 'title' | 'type' | 'imageUrl' | 'quality' | 'suggestions'>;
  style?: React.CSSProperties;
}

const MediaCard: React.FC<MediaCardProps> = ({ item, style }) => (
  <div className="media-grid-item" style={style}>
    <Poster src={item.imageUrl} alt={item.title} quality={item.quality} />
    <div className="media-title">{item.title}</div>
    {item.suggestions && item.suggestions.length > 0 && (
      <div style={{ fontSize: 11, color: '#c77', fontWeight: 600 }}>⚠ Needs review</div>
    )}
  </div>
);

export default MediaCard;
