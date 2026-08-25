import React from 'react';

interface PosterProps {
  src?: string | null;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  quality?: string | null; // e.g. "1080p", "4K" — shown as a corner badge
  watched?: boolean;        // green check in the top-left corner
  progressPct?: number;     // 1–99 -> resume progress bar along the bottom
}

// Cover image with a consistent placeholder when no image is available.
// Overlays: resolution badge (top-right), watched check (top-left), and a resume
// progress bar (bottom) when partway through.
const Poster: React.FC<PosterProps> = ({ src, alt, width = 120, height = 180, className = '', quality, watched, progressPct = 0 }) => {
  const size = { width, height };
  const inner = src
    ? <img src={src} alt={alt} className={`mm-poster ${className}`.trim()} style={size} />
    : (
      <div className={`mm-poster mm-poster--placeholder ${className}`.trim()} style={size} aria-label={`${alt} (no cover)`}>
        No Cover
      </div>
    );

  const showProgress = !watched && progressPct > 1 && progressPct < 99;
  if (!quality && !watched && !showProgress) return inner;

  return (
    <div style={{ position: 'relative', display: 'inline-block', width, height, lineHeight: 0 }}>
      {inner}
      {quality && (
        <span style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.78)', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: 0.3, padding: '2px 6px', borderRadius: 5, lineHeight: 1.2, pointerEvents: 'none' }}>
          {quality}
        </span>
      )}
      {watched && (
        <span title="Watched" style={{ position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: '50%', background: 'rgba(40,170,90,0.95)', color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          ✓
        </span>
      )}
      {showProgress && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, background: 'rgba(0,0,0,0.45)', pointerEvents: 'none' }}>
          <div style={{ width: `${progressPct}%`, height: '100%', background: 'var(--accent, #aa3bff)' }} />
        </div>
      )}
    </div>
  );
};

export default Poster;
