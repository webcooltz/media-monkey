import React from 'react';

interface SidePanelProps {
  servers: Array<{
    id: string;
    name: string;
    folders: Array<{ name: string }>;
  }> | null;
  openFolderMenu: { serverId: string; folder: string } | null;
  setPage: (page: SidePanelPage) => void;
  setOpenFolderMenu: (menu: { serverId: string; folder: string } | null) => void;
}

type SidePanelPage =
  | { type: 'home' }
  | { type: 'settings' }
  | { type: 'server'; serverId: string }
  | { type: 'folder'; serverId: string; folder: string }
  | { type: 'edit-folder'; serverId: string; folder: string };

const SidePanel: React.FC<SidePanelProps> = ({ servers, openFolderMenu, setPage, setOpenFolderMenu }) => (
  <aside className="sidebar">
    <button className="sidebar-home-btn" onClick={() => setPage({ type: 'home' })}>🏠 Home</button>
    <button className="sidebar-settings-btn" onClick={() => setPage({ type: 'settings' })}>⚙️ Settings</button>
    <h2 className="sidebar-title">Servers</h2>
    <ul className="server-list">
      {servers && servers.map(server => (
        <li key={server.id} className="server-list-item">
          <div className="server-row">
            <button className="server-btn" onClick={() => setPage({ type: 'server', serverId: server.id })}>{server.name}</button>
            <button className="kebab-menu-btn" aria-label="Server actions">
              <span className="kebab-dots">⋮</span>
            </button>
          </div>
          <ul className="folder-list">
            {server.folders.map(folder => (
              <li key={folder.name} className="folder-list-item" style={{ position: 'relative' }}>
                <div className="folder-row">
                  <button className="folder-btn" onClick={() => setPage({ type: 'folder', serverId: server.id, folder: folder.name })}>{folder.name}</button>
                  <button
                    className="kebab-menu-btn"
                    aria-label="Folder actions"
                    onClick={e => {
                      e.stopPropagation();
                      setOpenFolderMenu(openFolderMenu && openFolderMenu.serverId === server.id && openFolderMenu.folder === folder.name ? null : { serverId: server.id, folder: folder.name });
                    }}
                  >
                    <span className="kebab-dots">⋮</span>
                  </button>
                  {openFolderMenu && openFolderMenu.serverId === server.id && openFolderMenu.folder === folder.name && (
                    <div className="kebab-dropdown" onClick={e => e.stopPropagation()}>
                      <button
                        className="kebab-dropdown-item"
                        onClick={() => {
                          setPage({ type: 'edit-folder', serverId: server.id, folder: folder.name });
                          setOpenFolderMenu(null);
                        }}
                      >Edit</button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  </aside>
);

export default SidePanel;
