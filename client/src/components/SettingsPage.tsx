import React, { useEffect, useState } from 'react';
import FolderPicker from './FolderPicker';
import Button from './ui/Button';
import { api, type KeyStatus, type ProviderStatus } from '../api';
import type { ServerSettings } from '../types';

// One row in the API-keys panel: name, live status, and any quota/remaining detail.
function KeyStatusRow({ label, s, purpose }: { label: string; s?: ProviderStatus; purpose: string }) {
  let badge: React.ReactNode;
  let detail: string | null = null;

  if (!s) { badge = <span className="mm-muted">…</span>; }
  else if (!s.configured) { badge = <span className="mm-muted">Not set</span>; detail = 'Add the key to server/.env to enable.'; }
  else if (s.error) { badge = <span style={{ color: '#e55' }}>Error</span>; detail = s.error; }
  else if (s.valid === false) { badge = <span style={{ color: '#e55' }}>Invalid key</span>; }
  else if (s.remaining != null) {
    badge = <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{s.remaining} / {s.allowed} left today</span>;
    detail = `${s.used ?? 0} used${s.resetTime ? ` · resets in ${s.resetTime}` : ''}${s.level ? ` · ${s.level}` : ''}`;
  }
  else if (s.loginConfigured === false) { badge = <span style={{ color: 'var(--accent)' }}>Search only</span>; detail = s.quota || 'Add login for downloads.'; }
  else { badge = <span style={{ color: 'var(--accent)', fontWeight: 600 }}>OK</span>; detail = s.quota || null; }

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 150, fontWeight: 600 }}>{label}</div>
      <div style={{ width: 170 }}>{badge}</div>
      <div className="mm-muted" style={{ flex: 1, fontSize: 12 }}>{detail || purpose}</div>
    </div>
  );
}

interface SettingsPageProps {
  servers: ServerSettings[] | null;
  onSaved: (servers: ServerSettings[]) => void;
}

const clone = (servers: ServerSettings[]): ServerSettings[] => JSON.parse(JSON.stringify(servers));

const SettingsPage: React.FC<SettingsPageProps> = ({ servers, onSaved }) => {
  const [draft, setDraft] = useState<ServerSettings[]>(servers ? clone(servers) : []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [picker, setPicker] = useState<{ serverId: string; folderName: string; path: string } | null>(null);
  const [keys, setKeys] = useState<KeyStatus | null>(null);
  const [keysError, setKeysError] = useState<string | null>(null);

  useEffect(() => {
    api.getKeyStatus().then(setKeys).catch(e => setKeysError(e instanceof Error ? e.message : 'Failed to load key status'));
  }, []);

  const mutateFolder = (serverId: string, folderName: string, patch: Partial<{ name: string; mediaLocation: string }>) => {
    setDraft(prev => prev.map(server =>
      server.id !== serverId ? server : {
        ...server,
        folders: server.folders.map(f => (f.name !== folderName ? f : { ...f, ...patch })),
      }
    ));
    setSuccess(false);
  };

  const addFolder = (serverId: string) => {
    setDraft(prev => prev.map(server =>
      server.id !== serverId ? server : { ...server, folders: [...server.folders, { name: 'New Folder', mediaLocation: '' }] }
    ));
    setSuccess(false);
  };

  const removeFolder = (serverId: string, folderName: string) => {
    setDraft(prev => prev.map(server =>
      server.id !== serverId ? server : { ...server, folders: server.folders.filter(f => f.name !== folderName) }
    ));
    setSuccess(false);
  };

  const handleSave = async () => {
    setSaving(true); setError(null); setSuccess(false);
    try {
      await api.saveSettings(draft);
      const { servers: fresh } = await api.getServers();
      onSaved(fresh);
      setDraft(clone(fresh));
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-page">
      <h1>Settings</h1>
      <p className="mm-muted" style={{ marginBottom: 24 }}>
        Edit your media folder paths here. Changes take effect after saving — the library will rescan automatically.
      </p>

      <div className="mm-panel" style={{ marginBottom: 32 }}>
        <h2 style={{ marginTop: 0 }}>API keys</h2>
        <p className="mm-muted" style={{ fontSize: 13, marginTop: -4 }}>
          Set in <code>server/.env</code>. Only OpenSubtitles reports requests remaining — TMDB &amp; OMDb have no usage API.
        </p>
        {keysError && <p style={{ color: '#e55' }}>{keysError}</p>}
        <KeyStatusRow label="TMDB" s={keys?.tmdb} purpose="Posters, metadata, season covers." />
        <KeyStatusRow label="OMDb" s={keys?.omdb} purpose="Alternate IMDB metadata source." />
        <KeyStatusRow label="OpenSubtitles" s={keys?.opensubtitles} purpose="Subtitle search + download." />
      </div>

      {draft.map(server => (
        <div key={server.id} style={{ marginBottom: 40 }}>
          <h2>{server.name}</h2>
          {server.folders.map(folder => (
            <div key={folder.name} className="mm-panel">
              <div className="settings-field">
                <label>Folder name</label>
                <input type="text" value={folder.name} onChange={e => mutateFolder(server.id, folder.name, { name: e.target.value })} />
                <Button variant="danger" onClick={() => removeFolder(server.id, folder.name)}>Remove</Button>
              </div>
              <div className="settings-field">
                <label>Path</label>
                <input type="text" className="settings-path" value={folder.mediaLocation}
                  placeholder="/mnt/media/Movies"
                  onChange={e => mutateFolder(server.id, folder.name, { mediaLocation: e.target.value })} />
                <Button onClick={() => setPicker({ serverId: server.id, folderName: folder.name, path: folder.mediaLocation })}>Browse…</Button>
              </div>
            </div>
          ))}
          <Button variant="primary" onClick={() => addFolder(server.id)}>+ Add Folder</Button>
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 24 }}>
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving & rescanning...' : 'Save & Rescan'}
        </Button>
        {success && <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Saved! Library rescanned.</span>}
        {error && <span style={{ color: '#e55' }}>{error}</span>}
      </div>

      {picker && (
        <FolderPicker
          initialPath={picker.path}
          onSelect={selectedPath => { mutateFolder(picker.serverId, picker.folderName, { mediaLocation: selectedPath }); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
};

export default SettingsPage;
