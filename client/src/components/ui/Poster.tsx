import React from 'react';

interface PosterProps {
  src?: string | null;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  quality?: string | null; // e.g. "1080p", "4K" — shown as a corner badge
}

// Cover image with a consistent placeholder when no image is available.
// When `quality` is set, overlays a resolution badge in the top-right corner.
const Poster: React.FC<PosterProps> = ({ src, alt, width = 120, height = 180, className = '', quality }) => {
  const size = { width, height };
  const inner = src
    ? <img src={src} alt={alt} className={`mm-poster ${className}`.trim()} style={size} />
    : (
      <div className={`mm-poster mm-poster--placeholder ${className}`.trim()} style={size} aria-label={`${alt} (no cover)`}>
        No Cover
      </div>
    );

  if (!quality) return inner;

  return (
    <div style={{ position: 'relative', display: 'inline-block', width, height, lineHeight: 0 }}>
      {inner}
      <span
        style={{
          position: 'absolute', top: 6, right: 6,
          background: 'rgba(0,0,0,0.78)', color: '#fff',
          fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
          padding: '2px 6px', borderRadius: 5, lineHeight: 1.2,
          pointerEvents: 'none',
        }}
      >
        {quality}
      </span>
    </div>
  );
};

export default Poster;
