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
  subtitles?: SubtitleTrack[];
  metadata?: Metadata | null;
  suggestions?: MetadataSuggestion[]; // stored fuzzy matches awaiting approve/deny
}

export interface FolderSettings {
  name: string;
  mediaLocation: string;
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
