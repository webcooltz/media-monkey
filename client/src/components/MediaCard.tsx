import React from 'react';
import Poster from './ui/Poster';
import type { MediaItem } from '../types';

interface MediaCardProps {
  item: Pick<MediaItem, 'title' | 'type' | 'imageUrl'>;
  style?: React.CSSProperties;
}

const MediaCard: React.FC<MediaCardProps> = ({ item, style }) => (
  <div className="media-grid-item" style={style}>
    <Poster src={item.imageUrl} alt={item.title} />
    <div className="media-title">{item.title}</div>
  </div>
);

export default MediaCard;
