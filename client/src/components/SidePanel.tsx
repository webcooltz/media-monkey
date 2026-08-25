import React from 'react';
import { useNavigate } from 'react-router-dom';
import { paths } from '../routes';

interface SidePanelProps {
  servers: Array<{
    id: string;
    name: string;
    folders: Array<{ name: string }>;
  }> | null;
  openFolderMenu: { serverId: string; folder: string } | null;
  setOpenFolderMenu: (menu: { serverId: string; folder: string } | null) => void;
  onRefreshFolder: (serverId: string, folderName: string) => void;
  refreshingFolder: { serverId: string; folder: string } | null;
  onLogout?: () => void;
}

const SidePanel: React.FC<SidePanelProps> = ({ servers, openFolderMenu, setOpenFolderMenu, onRefreshFolder, refreshingFolder, onLogout }) => {
  const navigate = useNavigate();
  return (
    <aside className="sidebar">
      <button className="sidebar-home-btn" onClick={() => navigate(paths.home())}>🏠 Home</button>
      <button className="sidebar-settings-btn" onClick={() => navigate(paths.settings())}>⚙️ Settings</button>
      <h2 className="sidebar-title">Servers</h2>
      <ul className="server-list">
        {servers && servers.map(server => (
          <li key={server.id} className="server-list-item">
            <div className="server-row">
              <button className="server-btn" onClick={() => navigate(paths.server(server.id))}>{server.name}</button>
              <button className="kebab-menu-btn" aria-label="Server actions">
                <span className="kebab-dots">⋮</span>
              </button>
            </div>
            <ul className="folder-list">
              <li className="folder-list-item">
                <div className="folder-row">
                  <button className="folder-btn" onClick={() => navigate(paths.collections())}>🗂️ Collections</button>
                </div>
              </li>
              {server.folders.map(folder => (
                <li key={folder.name} className="folder-list-item" style={{ position: 'relative' }}>
                  <div className="folder-row">
                    <button className="folder-btn" onClick={() => navigate(paths.folder(server.id, folder.name))}>{folder.name}</button>
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
                            navigate(paths.folder(server.id, folder.name));
                            setOpenFolderMenu(null);
                          }}
                        >Open</button>
                        <button
                          className="kebab-dropdown-item"
                          disabled={!!refreshingFolder && refreshingFolder.serverId === server.id && refreshingFolder.folder === folder.name}
                          onClick={() => {
                            onRefreshFolder(server.id, folder.name);
                            setOpenFolderMenu(null);
                          }}
                        >
                          {refreshingFolder && refreshingFolder.serverId === server.id && refreshingFolder.folder === folder.name ? 'Refreshing…' : 'Refresh'}
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {onLogout && (
        <button className="sidebar-settings-btn" style={{ marginTop: 'auto' }} onClick={onLogout}>🔒 Log out</button>
      )}
    </aside>
  );
};

export default SidePanel;
