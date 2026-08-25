import type { BrowseResponse, MediaItem, ServerSettings, SubtitleTrack } from './types';

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
  language?: string;
  release?: string;
  downloads?: number;
}

export const api = {
  getAuthStatus: () => request<{ authRequired: boolean; authenticated: boolean }>('/auth/status'),
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
    request<{ found?: boolean; stub?: boolean; provider?: string; item?: MediaItem; message?: string; error?: string }>(
      `${itemBase(serverId, folderName, itemTitle)}/metadata`, { method: 'POST' }),

  findSubtitles: (serverId: string, folderName: string, itemTitle: string) =>
    request<{ stub?: boolean; message?: string; results?: SubtitleSearchResult[]; error?: string }>(
      `${itemBase(serverId, folderName, itemTitle)}/find-subtitles`, { method: 'POST' }),

  runCleanvid: (serverId: string, folderName: string, itemTitle: string) =>
    request<{ stub?: boolean; success?: boolean; outputPath?: string; message?: string; error?: string }>(
      `${itemBase(serverId, folderName, itemTitle)}/cleanvid`, { method: 'POST' }),

  uploadCover: (serverId: string, folderName: string, itemTitle: string, image: string) =>
    request<{ success: boolean; imageUrl: string; item: MediaItem }>(
      `${itemBase(serverId, folderName, itemTitle)}/cover`, json({ image })),

  browse: (path?: string) =>
    request<BrowseResponse>(`/media/browse${path ? `?path=${seg(path)}` : ''}`),
};

export type { SubtitleTrack };
