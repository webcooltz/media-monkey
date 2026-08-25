import React from 'react';

interface PosterProps {
  src?: string | null;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
}

// Cover image with a consistent placeholder when no image is available.
const Poster: React.FC<PosterProps> = ({ src, alt, width = 120, height = 180, className = '' }) => {
  const size = { width, height };
  if (src) {
    return <img src={src} alt={alt} className={`mm-poster ${className}`.trim()} style={size} />;
  }
  return (
    <div className={`mm-poster mm-poster--placeholder ${className}`.trim()} style={size} aria-label={`${alt} (no cover)`}>
      No Cover
    </div>
  );
};

export default Poster;
