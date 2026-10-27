// Helpers for turning a play URL into the underlying file on disk.
const enc = encodeURIComponent;

/**
 * The raw-file URL (`/media/<folder>/<path>`) behind a play URL, or null if it
 * can't be derived. Direct-play URLs already are one; remux/HLS URLs
 * (`/api/media/stream?folderName=&path=`) are mapped back to the source file.
 */
export function rawFileUrl(mediaUrl: string | null | undefined): string | null {
  if (!mediaUrl) return null;
  if (mediaUrl.startsWith('/media/')) return mediaUrl.split('?')[0];
  try {
    const u = new URL(mediaUrl, window.location.origin);
    const folder = u.searchParams.get('folderName');
    const rel = u.searchParams.get('path');
    if (folder && rel) return `/media/${enc(folder)}/${rel.split('/').map(enc).join('/')}`;
  } catch { /* not a URL we understand */ }
  return null;
}

/** Same file as an attachment (browser "save as"), keeping its original name. */
export function downloadUrl(mediaUrl: string | null | undefined): string | null {
  const raw = rawFileUrl(mediaUrl);
  return raw ? `${raw}?download=1` : null;
}
