import { useState, useRef, useEffect } from 'react';
import Folder from './components/Folder';
import MediaCard from './components/MediaCard';
import MediaItemPage from './components/MediaItemPage';
import MediaPlayerPage from './components/MediaPlayerPage';
import SettingsPage from './components/SettingsPage';
import SidePanel from './components/SidePanel';
import './App.css';


type SubtitleTrack = { label: string; fileName: string; url: string };

type MediaItem = { title: string; type: string; imageUrl?: string; mediaUrl?: string | null; subtitles?: SubtitleTrack[] };
type FolderSettings = { name: string; mediaLocation: string; media?: MediaItem[] };
type ServerSettings = { id: string; name: string; folders: FolderSettings[] };


type Page =
  | { type: 'home' }
  | { type: 'settings' }
  | { type: 'server', serverId: string }
  | { type: 'folder', serverId: string, folder: string }
  | { type: 'edit-folder', serverId: string, folder: string }
  | { type: 'media-item', serverId: string, folderName: string, itemTitle: string }
  | { type: 'player', title: string, mediaUrl: string, posterUrl?: string, subtitles?: SubtitleTrack[], returnPage: Exclude<Page, { type: 'player' }> };

function App() {
  const API_BASE = '/api';
  const [page, setPage] = useState<Page>({ type: 'home' });
  const [openFolderMenu, setOpenFolderMenu] = useState<{ serverId: string; folder: string } | null>(null);
  const [servers, setServers] = useState<ServerSettings[] | null>(null);
  const rowRefs = {
    tv: useRef<HTMLDivElement>(null),
    movies: useRef<HTMLDivElement>(null),
    music: useRef<HTMLDivElement>(null),
    audiobooks: useRef<HTMLDivElement>(null),
  };

  // Load media from backend API on mount
  const fetchServers = () => {
    fetch(`${API_BASE}/media`)
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.servers)) setServers(data.servers);
      })
      .catch(() => {});
  };
  useEffect(() => {
    fetchServers();
  }, []);

  const createRowWithArrows = (items: Array<MediaItem & { serverId: string; folderName: string }>, rowKey: keyof typeof rowRefs) => {
    const rowRef = rowRefs[rowKey];
    const scrollBy = 220; // px
    return (
      <div className="media-row-wrapper">
        <button
          className="media-row-arrow left"
          aria-label="Scroll left"
          onClick={() => rowRef.current && (rowRef.current.scrollLeft -= scrollBy)}
        >
          &#8592;
        </button>
        <div className="media-row" ref={rowRef} style={{ display: 'flex', overflowX: 'auto', gap: 16 }}>
          {items.map((item, i) => (
            <div key={rowKey + '-' + i} style={{ cursor: 'pointer' }}
              onClick={() => setPage({ type: 'media-item', serverId: item.serverId, folderName: item.folderName, itemTitle: item.title })}>
              <MediaCard item={item} />
            </div>
          ))}
        </div>
        <button
          className="media-row-arrow right"
          aria-label="Scroll right"
          onClick={() => rowRef.current && (rowRef.current.scrollLeft += scrollBy)}
        >
          &#8594;
        </button>
      </div>
    );
  };


  const renderPageContent = () => {
    if (page.type === 'home') {
      const tvShows: Array<MediaItem & { serverId: string; folderName: string }> = [];
      const movies: Array<MediaItem & { serverId: string; folderName: string }> = [];
      const music: Array<MediaItem & { serverId: string; folderName: string }> = [];
      const audiobooks: Array<MediaItem & { serverId: string; folderName: string }> = [];
      servers?.forEach(server => {
        server.folders.forEach(folder => {
          if (folder.name.toLowerCase().includes('tv')) {
            if (folder.media) tvShows.push(...folder.media.map(item => ({ ...item, serverId: server.id, folderName: folder.name })));
          } else if (folder.name.toLowerCase().includes('movie')) {
            if (folder.media) movies.push(...folder.media.map(item => ({ ...item, serverId: server.id, folderName: folder.name })));
          } else if (folder.name.toLowerCase().includes('music')) {
            if (folder.media) music.push(...folder.media.map(item => ({ ...item, serverId: server.id, folderName: folder.name })));
          } else if (folder.name.toLowerCase().includes('audiobook')) {
            if (folder.media) audiobooks.push(...folder.media.map(item => ({ ...item, serverId: server.id, folderName: folder.name })));
          }
        });
      });
      return (
        <>
          <header className="library-header">
            <h1>My Media Library</h1>
            <p>Browse and manage your personal collection</p>
          </header>
          <section className="media-lists">
            <div className="media-list">
              <h2>TV Shows</h2>
              {createRowWithArrows(tvShows, 'tv')}
            </div>
            <div className="media-list">
              <h2>Movies</h2>
              {createRowWithArrows(movies, 'movies')}
            </div>
            <div className="media-list">
              <h2>Music</h2>
              {createRowWithArrows(music, 'music')}
            </div>
            <div className="media-list">
              <h2>Audiobooks</h2>
              {createRowWithArrows(audiobooks, 'audiobooks')}
            </div>
          </section>
        </>
      );
    }
  if (page.type === 'settings') {
      return (
        <SettingsPage
          apiBase={API_BASE}
          servers={servers}
          onSaved={(updatedServers) => setServers(updatedServers)}
        />
      );
    }
    if (!servers) {
      return <div style={{ padding: '2rem' }}>Loading...</div>;
    }
    if (page.type === 'server') {
      const server = servers.find(s => s.id === page.serverId);
      if (!server) return <div>Server not found.</div>;
      return (
        <div className="server-details">
          <h1>{server.name}</h1>
          <p>Server details and stats go here.</p>
        </div>
      );
    }
    if (page.type === 'folder') {
      return (
        <Folder
          key={`${page.serverId}:${page.folder}`}
          serverId={page.serverId}
          folderName={page.folder}
          apiBase={API_BASE}
          onSelectMediaItem={(itemTitle) => setPage({ type: 'media-item', serverId: page.serverId, folderName: page.folder, itemTitle })}
        />
      );
    }
    if (page.type === 'media-item') {
      return (
        <MediaItemPage
          key={`${page.serverId}:${page.folderName}:${page.itemTitle}`}
          serverId={page.serverId}
          folderName={page.folderName}
          itemTitle={page.itemTitle}
          apiBase={API_BASE}
          onBack={() => setPage({ type: 'folder', serverId: page.serverId, folder: page.folderName })}
          onPlay={(title, mediaUrl, posterUrl, subtitles) => setPage({
            type: 'player',
            title,
            mediaUrl,
            posterUrl,
            subtitles,
            returnPage: page,
          })}
        />
      );
    }
    if (page.type === 'player') {
      return (
        <MediaPlayerPage
          key={page.mediaUrl}
          title={page.title}
          mediaUrl={page.mediaUrl}
          posterUrl={page.posterUrl}
          subtitles={page.subtitles}
          onBack={() => setPage(page.returnPage)}
        />
      );
    }
    return null;
  };

  return (
    <div className="app-layout">
      <SidePanel
        servers={servers}
        openFolderMenu={openFolderMenu}
        setPage={setPage}
        setOpenFolderMenu={setOpenFolderMenu}
      />
      <main className="library-home">
        {renderPageContent()}
      </main>
    </div>
  );
}

export default App;
