import { useEffect, useRef, useState } from 'react';
import { Routes, Route, useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import MediaCard from './components/MediaCard';
import Folder from './components/Folder';
import MediaItemPage from './components/MediaItemPage';
import SeasonPage from './components/SeasonPage';
import MediaPlayerPage from './components/MediaPlayerPage';
import SettingsPage from './components/SettingsPage';
import SidePanel from './components/SidePanel';
import { paths } from './routes';
import { api } from './api';
import { mediaCategories, categoryForFolder } from './mediaCategories';
import type { MediaItemWithSource, ServerSettings, SubtitleTrack } from './types';
import './App.css';

// Shared play navigation (subtitles ride along in history state).
function usePlay() {
  const navigate = useNavigate();
  return (title: string, mediaUrl: string, posterUrl?: string, subtitles?: SubtitleTrack[]) =>
    navigate(paths.play(title, mediaUrl, posterUrl), { state: { subtitles } });
}

function HomePage({ servers }: { servers: ServerSettings[] | null }) {
  const navigate = useNavigate();
  const rowRef = useRef<Record<string, HTMLDivElement | null>>({});

  const buckets: Record<string, MediaItemWithSource[]> = Object.fromEntries(mediaCategories.map(c => [c.key, []]));
  servers?.forEach(server => server.folders.forEach(folder => {
    const cat = categoryForFolder(folder.name);
    if (cat && folder.media) buckets[cat.key].push(...folder.media.map(item => ({ ...item, serverId: server.id, folderName: folder.name })));
  }));

  const Row = ({ items, k }: { items: MediaItemWithSource[]; k: string }) => {
    const scrollBy = 220;
    return (
      <div className="media-row-wrapper">
        <button className="media-row-arrow left" aria-label="Scroll left" onClick={() => { const el = rowRef.current[k]; if (el) el.scrollLeft -= scrollBy; }}>&#8592;</button>
        <div className="media-row" ref={el => { rowRef.current[k] = el; }}>
          {items.map((item, i) => (
            <div key={k + '-' + i} style={{ cursor: 'pointer' }} onClick={() => navigate(paths.item(item.serverId, item.folderName, item.title))}>
              <MediaCard item={item} />
            </div>
          ))}
        </div>
        <button className="media-row-arrow right" aria-label="Scroll right" onClick={() => { const el = rowRef.current[k]; if (el) el.scrollLeft += scrollBy; }}>&#8594;</button>
      </div>
    );
  };

  return (
    <>
      <header className="library-header">
        <h1>My Media Library</h1>
        <p>Browse and manage your personal collection</p>
      </header>
      <section className="media-lists">
        {mediaCategories.map(cat => (
          <div className="media-list" key={cat.key}>
            <h2>{cat.label}</h2>
            <Row items={buckets[cat.key]} k={cat.key} />
          </div>
        ))}
      </section>
    </>
  );
}

function FolderRoute() {
  const { serverId = '', folderName = '' } = useParams();
  const navigate = useNavigate();
  return (
    <Folder
      key={`${serverId}:${folderName}`}
      serverId={serverId}
      folderName={folderName}
      onSelectMediaItem={(itemTitle) => navigate(paths.item(serverId, folderName, itemTitle))}
    />
  );
}

function ItemRoute() {
  const { serverId = '', folderName = '', itemTitle = '' } = useParams();
  const navigate = useNavigate();
  const play = usePlay();
  return (
    <MediaItemPage
      key={`${serverId}:${folderName}:${itemTitle}`}
      serverId={serverId}
      folderName={folderName}
      itemTitle={itemTitle}
      onBack={() => navigate(paths.folder(serverId, folderName))}
      onSelectSeason={(seasonName) => navigate(paths.season(serverId, folderName, itemTitle, seasonName))}
      onPlay={play}
    />
  );
}

function SeasonRoute() {
  const { serverId = '', folderName = '', itemTitle = '', seasonName = '' } = useParams();
  const navigate = useNavigate();
  const play = usePlay();
  return (
    <SeasonPage
      key={`${serverId}:${folderName}:${itemTitle}:${seasonName}`}
      serverId={serverId}
      folderName={folderName}
      showTitle={itemTitle}
      seasonName={seasonName}
      onBack={() => navigate(paths.item(serverId, folderName, itemTitle))}
      onPlay={play}
    />
  );
}

function PlayerRoute() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const subtitles = (location.state as { subtitles?: SubtitleTrack[] } | null)?.subtitles || [];
  const src = params.get('src') || '';
  return (
    <MediaPlayerPage
      key={src}
      title={params.get('title') || ''}
      mediaUrl={src}
      posterUrl={params.get('poster') || undefined}
      subtitles={subtitles}
      onBack={() => navigate(-1)}
    />
  );
}

function ServerRoute({ servers }: { servers: ServerSettings[] | null }) {
  const { serverId = '' } = useParams();
  if (!servers) return <div style={{ padding: '2rem' }}>Loading...</div>;
  const server = servers.find(s => s.id === serverId);
  if (!server) return <div>Server not found.</div>;
  return (
    <div className="server-details">
      <h1>{server.name}</h1>
      <p>Server details and stats go here.</p>
    </div>
  );
}

function App() {
  const [servers, setServers] = useState<ServerSettings[] | null>(null);
  const [openFolderMenu, setOpenFolderMenu] = useState<{ serverId: string; folder: string } | null>(null);
  const [refreshingFolder, setRefreshingFolder] = useState<{ serverId: string; folder: string } | null>(null);

  const fetchServers = () => { api.getServers().then(d => setServers(d.servers)).catch(() => {}); };
  useEffect(() => { fetchServers(); }, []);

  const refreshFolder = (serverId: string, folderName: string) => {
    setRefreshingFolder({ serverId, folder: folderName });
    api.getFolderMedia(serverId, folderName, true)
      .then(() => fetchServers())
      .catch(() => {})
      .finally(() => setRefreshingFolder(null));
  };

  return (
    <div className="app-layout">
      <SidePanel
        servers={servers}
        openFolderMenu={openFolderMenu}
        setOpenFolderMenu={setOpenFolderMenu}
        onRefreshFolder={refreshFolder}
        refreshingFolder={refreshingFolder}
      />
      <main className="library-home">
        <Routes>
          <Route path="/" element={<HomePage servers={servers} />} />
          <Route path="/settings" element={servers ? <SettingsPage servers={servers} onSaved={setServers} /> : <div style={{ padding: '2rem' }}>Loading...</div>} />
          <Route path="/server/:serverId" element={<ServerRoute servers={servers} />} />
          <Route path="/folder/:serverId/:folderName" element={<FolderRoute />} />
          <Route path="/item/:serverId/:folderName/:itemTitle" element={<ItemRoute />} />
          <Route path="/item/:serverId/:folderName/:itemTitle/season/:seasonName" element={<SeasonRoute />} />
          <Route path="/play" element={<PlayerRoute />} />
          <Route path="*" element={<HomePage servers={servers} />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
