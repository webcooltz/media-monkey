import React from 'react';
import { downloadUrl } from '../mediaUrls';

interface DownloadLinkProps {
  mediaUrl: string | null | undefined;
  label?: string;
  className?: string;
}

// Styled like a Button, but a real link so the browser's download manager handles
// big files (resumable, no memory use). Renders nothing if there is no file.
const DownloadLink: React.FC<DownloadLinkProps> = ({ mediaUrl, label = '⬇ Download', className = '' }) => {
  const href = downloadUrl(mediaUrl);
  if (!href) return null;
  return <a className={`mm-btn ${className}`.trim()} href={href} download>{label}</a>;
};

export default DownloadLink;
