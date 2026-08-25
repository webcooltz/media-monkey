import React, { useState } from 'react';
import FolderPicker from './FolderPicker';
import Button from './ui/Button';
import { api } from '../api';
import type { ServerSettings } from '../types';

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
