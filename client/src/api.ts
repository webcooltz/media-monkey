import type { BrowseResponse, CollectionDetail, CollectionSummary, MediaItem, MetadataSuggestion, ServerSettings, SubtitleTrack } from './types';

export const API_BASE = '/api';

// Notified when the server rejects a request as unauthenticated (expired/missing session),
// so the app can drop back to the login screen.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn; }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    throw new Error((data && (data.error as string)) || `Request failed (${res.status})`);
  }
  return data as T;
}

function json(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

const seg = encodeURIComponent;
const itemBase = (serverId: string, folderName: string, itemTitle: string) =>
  `/media/${seg(serverId)}/${seg(folderName)}/${seg(itemTitle)}`;

export interface SubtitleSearchResult {
  id: string;
  fileId?: number | null;
  language?: string;
  release?: string;
  downloads?: number;
}

export interface ProviderStatus {
  configured: boolean;
  valid?: boolean;
  loginConfigured?: boolean;
  quota?: string;
  error?: string;
  remaining?: number;
  allowed?: number;
  used?: number;
  level?: string;
  vip?: boolean;
  resetTime?: string;
}
export interface KeyStatus {
  tmdb: ProviderStatus;
  omdb: ProviderStatus;
  opensubtitles: ProviderStatus;
}

export const api = {
  getAuthStatus: () => request<{ authRequired: boolean; authenticated: boolean }>('/auth/status'),

  getKeyStatus: () => request<KeyStatus>('/keys/status'),
  login: (password: string) => request<{ success: boolean }>('/auth/login', json({ password })),
  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),

  getServers: () => request<{ servers: ServerSettings[] }>('/media'),

  saveSettings: (servers: ServerSettings[]) =>
    request<{ success: boolean }>('/media', json({ servers })),

  getFolderMedia: (serverId: string, folderName: string, refresh = false) =>
    request<{ media: MediaItem[] }>(`/media/${seg(serverId)}/${seg(folderName)}${refresh ? '?refresh=true' : ''}`),

  getSeasons: (serverId: string, folderName: string, itemTitle: string) =>
    request<{ media: MediaItem[] }>(itemBase(serverId, folderName, itemTitle)),

  getEpisodes: (serverId: string, folderName: string, itemTitle: string, seasonName: string) =>
    request<{ media: MediaItem[] }>(`${itemBase(serverId, folderName, itemTitle)}/${seg(seasonName)}`),

  fetchMetadata: (serverId: string, folderName: string, itemTitle: string) =>
    request<{ found?: boolean; stub?: boolean; provider?: string; item?: MediaItem; suggestions?: MetadataSuggestion[]; message?: string; error?: string }>(
      `${itemBase(serverId, folderName, itemTitle)}/metadata`, { method: 'POST' }),

  applyMetadata: (serverId: string, folderName: string, itemTitle: string, tmdbId: string) =>
    request<{ found?: boolean; provider?: string; item?: MediaItem; error?: string }>(
      `${itemBase(serverId, folderName, itemTitle)}/metadata/apply`, json({ tmdbId })),

  batchFetchMetadata: (serverId: string, folderName: string) =>
    request<{ done?: boolean; stub?: boolean; message?: string; total?: number; applied?: number; review?: number; none?: number; failed?: number; media?: MediaItem[] }>(
      `/media/${seg(serverId)}/${seg(folderName)}/fetch-all-metadata`, { method: 'POST' }),

  renameItem: (serverId: string, folderName: string, itemTitle: string, newTitle: string) =>
    request<{ success: boolean; newTitle: string; item?: MediaItem; error?: string }>(
      `${itemBase(serverId, folderName, itemTitle)}/rename`, json({ newTitle })),

  findSubtitles: (serverId: string, folderName: string, itemTitle: string) =>
    request<{ stub?: boolean; message?: string; results?: SubtitleSearchResult[]; error?: string }>(
      `${itemBase(serverId, folderName, itemTitle)}/find-subtitles`, { method: 'POST' }),

  downloadSubtitle: (serverId: string, folderName: string, itemTitle: string, fileId: number, language?: string) =>
    request<{ stub?: boolean; message?: string; success?: boolean; fileName?: string; remaining?: number; subtitles?: SubtitleTrack[]; error?: string }>(
      `${itemBase(serverId, folderName, itemTitle)}/subtitles`, json({ fileId, language })),

  findEpisodeSubtitles: (serverId: string, folderName: string, showTitle: string, seasonName: string, episodeTitle: string) =>
    request<{ stub?: boolean; message?: string; results?: SubtitleSearchResult[]; error?: string }>(
      `${itemBase(serverId, folderName, showTitle)}/${seg(seasonName)}/${seg(episodeTitle)}/find-subtitles`, { method: 'POST' }),

  downloadEpisodeSubtitle: (serverId: string, folderName: string, showTitle: string, seasonName: string, episodeTitle: string, fileId: number, language?: string) =>
    request<{ stub?: boolean; message?: string; success?: boolean; fileName?: string; remaining?: number; subtitles?: SubtitleTrack[]; error?: string }>(
      `${itemBase(serverId, folderName, showTitle)}/${seg(seasonName)}/${seg(episodeTitle)}/subtitles`, json({ fileId, language })),

  runCleanvid: (serverId: string, folderName: string, itemTitle: string) =>
    request<{ stub?: boolean; success?: boolean; outputPath?: string; message?: string; error?: string }>(
      `${itemBase(serverId, folderName, itemTitle)}/cleanvid`, { method: 'POST' }),

  uploadCover: (serverId: string, folderName: string, itemTitle: string, image: string) =>
    request<{ success: boolean; imageUrl: string; item: MediaItem }>(
      `${itemBase(serverId, folderName, itemTitle)}/cover`, json({ image })),

  uploadSeasonCover: (serverId: string, folderName: string, showTitle: string, seasonName: string, image: string) =>
    request<{ success: boolean; imageUrl: string | null; seasonName: string }>(
      `${itemBase(serverId, folderName, showTitle)}/${seg(seasonName)}/cover`, json({ image })),

  fetchSeasonPosters: (serverId: string, folderName: string, itemTitle: string) =>
    request<{ stub?: boolean; message?: string; success?: boolean; saved?: number; missing?: string[]; seasons?: MediaItem[]; error?: string }>(
      `${itemBase(serverId, folderName, itemTitle)}/season-posters`, { method: 'POST' }),

  browse: (path?: string) =>
    request<BrowseResponse>(`/media/browse${path ? `?path=${seg(path)}` : ''}`),

  getCollections: () => request<{ collections: CollectionSummary[] }>('/collections'),
  getCollection: (name: string) => request<CollectionDetail>(`/collections/${seg(name)}`),
  createCollection: (name: string) => request<{ collection: CollectionSummary }>('/collections', json({ name })),
  deleteCollection: (name: string) => request<{ removed: boolean }>(`/collections/${seg(name)}`, { method: 'DELETE' }),
  setCollectionCover: (name: string, imageUrl: string) =>
    request<CollectionDetail>(`/collections/${seg(name)}/cover`, json({ imageUrl })),
  addCollectionMember: (name: string, serverId: string, folderName: string, itemTitle: string) =>
    request<CollectionDetail>(`/collections/${seg(name)}/members`, json({ serverId, folderName, itemTitle })),
  removeCollectionMember: (name: string, serverId: string, folderName: string, itemTitle: string) =>
    request<CollectionDetail>(`/collections/${seg(name)}/members`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverId, folderName, itemTitle }),
    }),
};

export type { SubtitleTrack, MetadataSuggestion };
