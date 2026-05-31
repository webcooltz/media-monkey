import React, { useState } from 'react';

interface FolderSettings {
  name: string;
  mediaLocation: string;
}

interface ServerSettings {
  id: string;
  name: string;
  folders: FolderSettings[];
}

interface SettingsPageProps {
  apiBase: string;
  servers: ServerSettings[] | null;
  onSaved: (servers: ServerSettings[]) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ apiBase, servers, onSaved }) => {
  const [draft, setDraft] = useState<ServerSettings[]>(servers ? JSON.parse(JSON.stringify(servers)) : []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const updateFolderPath = (serverId: string, folderName: string, newPath: string) => {
    setDraft(prev => prev.map(server =>
      server.id !== serverId ? server : {
        ...server,
        folders: server.folders.map(f =>
          f.name !== folderName ? f : { ...f, mediaLocation: newPath }
        ),
      }
    ));
    setSuccess(false);
  };

  const updateFolderName = (serverId: string, oldName: string, newName: string) => {
    setDraft(prev => prev.map(server =>
      server.id !== serverId ? server : {
        ...server,
        folders: server.folders.map(f =>
          f.name !== oldName ? f : { ...f, name: newName }
        ),
      }
    ));
    setSuccess(false);
  };

  const addFolder = (serverId: string) => {
    setDraft(prev => prev.map(server =>
      server.id !== serverId ? server : {
        ...server,
        folders: [...server.folders, { name: 'New Folder', mediaLocation: '' }],
      }
    ));
    setSuccess(false);
  };

  const removeFolder = (serverId: string, folderName: string) => {
    setDraft(prev => prev.map(server =>
      server.id !== serverId ? server : {
        ...server,
        folders: server.folders.filter(f => f.name !== folderName),
      }
    ));
    setSuccess(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch(`${apiBase}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servers: draft }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      // Re-scan by fetching all media fresh
      const scanRes = await fetch(`${apiBase}/media`);
      const data = await scanRes.json();
      if (data?.servers) {
        onSaved(data.servers);
        setDraft(JSON.parse(JSON.stringify(data.servers)));
      }
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 24 }}>
      <h1>Settings</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Edit your media folder paths here. Changes take effect after saving — the library will rescan automatically.
      </p>

      {draft.map(server => (
        <div key={server.id} style={{ marginBottom: 40 }}>
          <h2 style={{ marginBottom: 16 }}>{server.name}</h2>
          {server.folders.map(folder => (
            <div key={folder.name} style={{ marginBottom: 16, padding: 16, border: '1px solid #ddd', borderRadius: 10, background: '#fafafa' }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'center' }}>
                <label style={{ width: 90, fontWeight: 600, fontSize: 13, color: '#555' }}>Folder name</label>
                <input
                  type="text"
                  value={folder.name}
                  onChange={e => updateFolderName(server.id, folder.name, e.target.value)}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14 }}
                />
                <button
                  onClick={() => removeFolder(server.id, folder.name)}
                  style={{ padding: '6px 12px', background: '#e55', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                >
                  Remove
                </button>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <label style={{ width: 90, fontWeight: 600, fontSize: 13, color: '#555' }}>Path</label>
                <input
                  type="text"
                  value={folder.mediaLocation}
                  onChange={e => updateFolderPath(server.id, folder.name, e.target.value)}
                  placeholder="/mnt/media/Movies"
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14, fontFamily: 'monospace' }}
                />
              </div>
            </div>
          ))}
          <button
            onClick={() => addFolder(server.id)}
            style={{ padding: '8px 18px', background: '#4a90d9', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
          >
            + Add Folder
          </button>
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 24 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '10px 28px', background: '#2a7a2a', color: '#fff', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 600 }}
        >
          {saving ? 'Saving & rescanning...' : 'Save & Rescan'}
        </button>
        {success && <span style={{ color: '#2a7a2a', fontWeight: 600 }}>Saved! Library rescanned.</span>}
        {error && <span style={{ color: '#e55' }}>{error}</span>}
      </div>
    </div>
  );
};

export default SettingsPage;
