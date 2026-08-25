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

export interface MediaItem {
  title: string;
  type: string;
  imageUrl?: string;
  mediaUrl?: string | null;
  subtitles?: SubtitleTrack[];
  metadata?: Metadata | null;
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
