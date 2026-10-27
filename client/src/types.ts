export interface SubtitleTrack {
  label: string;
  fileName: string;
  url: string;
}

export interface Metadata {
  tmdbId?: string | null;
  imdbId?: string | null;
  overview?: string | null;
  year?: string | null;
  rating?: number | null;
  updatedAt?: string | null;
}

export interface MetadataSuggestion {
  tmdbId: string;
  title: string;
  year?: string | null;
  overview?: string | null;
  rating?: number | null;
  posterUrl?: string | null;
  tmdbKind?: string;
}

export interface MediaItem {
  title: string;
  type: string;
  imageUrl?: string;
  mediaUrl?: string | null;
  quality?: string | null;
  sortTitle?: string; // per-item sort-name override (default: title without leading article)
  watched?: boolean;
  progressPct?: number; // resume position as a percentage (0 when none/watched)
  subtitles?: SubtitleTrack[];
  metadata?: Metadata | null;
  suggestions?: MetadataSuggestion[]; // stored fuzzy matches awaiting approve/deny
}

// A playable file inside a movie's folder (one of possibly several cuts).
export interface PlayableFile {
  fileName: string;
  title: string;
  quality?: string | null;
  mediaUrl: string;
  subtitles?: SubtitleTrack[];
}

export interface FolderSettings {
  name: string;
  mediaLocation: string;
  /** false when the folder's path can't be read (unplugged drive, moved path). */
  available?: boolean;
  media?: MediaItem[];
  children?: string[];
}

export interface ServerSettings {
  id: string;
  name: string;
  folders: FolderSettings[];
}

export interface DirEntry {
  name: string;
  path: string;
}

export interface BrowseResponse {
  path: string;
  parent: string | null;
  directories: DirEntry[];
}

export type MediaItemWithSource = MediaItem & { serverId: string; folderName: string };

export interface CollectionSummary {
  name: string;
  hasDisk: boolean;
  count: number;
  imageUrl?: string | null;
}

// A collection member: disk movies play directly; attached items carry itemTitle
// so they can navigate to their own item page.
export interface CollectionMember extends MediaItem {
  serverId: string;
  folderName: string;
  itemTitle?: string;
  source: 'disk' | 'attached';
  missing?: boolean;
}

export interface CollectionDetail {
  name: string;
  hasDisk: boolean;
  coverUrl?: string | null;
  members: CollectionMember[];
}

export interface SearchResult {
  kind: 'item' | 'collection';
  title: string;
  type: string;
  imageUrl?: string;
  year?: string;
  serverId?: string;
  folderName?: string;
}

export interface Profile {
  id: number;
  name: string;
  primaryColor: string | null;
  secondaryColor: string | null;
}

export interface ScanResult {
  folders: number;
  skipped: number;
  added: number;
  removed: number;
  errors: number;
  durationMs?: number;
  skippedRun?: boolean;
}

export interface ScanStatus {
  enabled: boolean;
  intervalMinutes: number;
  running: boolean;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastResult: ScanResult | null;
}

export interface SetupStatus {
  needsSetup: boolean;
  node: string;
  ffmpeg: boolean;
  keys: { tmdb: boolean; omdb: boolean; opensubtitles: boolean };
  authEnabled: boolean;
  autoScanMinutes: number;
  folders: Array<{ serverId: string; serverName: string; name: string; mediaLocation: string; exists: boolean; itemCount: number }>;
}
