import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Routes, Route, useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import MediaCard from './components/MediaCard';
import Folder from './components/Folder';
import MediaItemPage from './components/MediaItemPage';
import SeasonPage from './components/SeasonPage';
import SetupWizard from './components/SetupWizard';
import CollectionsPage from './components/CollectionsPage';
import CollectionPage from './components/CollectionPage';
import SettingsPage from './components/SettingsPage';
import Button from './components/ui/Button';
import SidePanel from './components/SidePanel';
import LoginPage from './components/LoginPage';
import { paths } from './routes';
import { useBack } from './hooks/useBack';
import { api, getActiveProfileId, setActiveProfileId, setConnectionHandler, setUnauthorizedHandler } from './api';
import { mediaCategories, categoryForFolder } from './mediaCategories';
import type { CollectionSummary, MediaItemWithSource, ServerSettings, SubtitleTrack } from './types';
import './App.css';

// hls.js makes the player heavy — load it only when something is actually played.
const MediaPlayerPage = lazy(() => import('./components/MediaPlayerPage'));

const SETUP_DONE_KEY = 'mm_setup_done';
const setupDone = () => { try { return localStorage.getItem(SETUP_DONE_KEY) === '1'; } catch { return true; } };
const markSetupDone = () => { try { localStorage.setItem(SETUP_DONE_KEY, '1'); } catch { /* ignore */ } };

export type WatchTarget = { serverId: string; folderName: string; itemTitle: string };

// Shared play navigation (subtitles + watch target ride along in history state).
function usePlay() {
  const navigate = useNavigate();
  return (title: string, mediaUrl: string, posterUrl?: string, subtitles?: SubtitleTrack[], watch?: WatchTarget) =>
    navigate(paths.play(title, mediaUrl, posterUrl), { state: { subtitles, watch } });
}

function HomePage({ servers }: { servers: ServerSettings[] | null }) {
  const navigate = useNavigate();
  const rowRef = useRef<Record<string, HTMLDivElement | null>>({});
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  useEffect(() => { api.getCollections().then(d => setCollections(d.collections)).catch(() => {}); }, []);

  const buckets: Record<string, MediaItemWithSource[]> = Object.fromEntries(mediaCategories.map(c => [c.key, []]));
  servers?.forEach(server => server.folders.forEach(folder => {
    const cat = categoryForFolder(folder.name);
    if (cat && folder.media) buckets[cat.key].push(...folder.media.map(item => ({ ...item, serverId: server.id, folderName: folder.name })));
  }));

  const hasAnyLocation = !!servers?.some(sv => sv.folders.some(f => f.mediaLocation));
  const hasAnyMedia = !!servers?.some(sv => sv.folders.some(f => f.media && f.media.length > 0)) || collections.length > 0;

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
        <img className="library-header__logo" src="/logo.png" alt="" width={96} height={96} />
        <h1>Media Monkey</h1>
        <p>Browse and manage your personal collection</p>
      </header>
      {servers && !hasAnyMedia && (
        <section className="empty-state" role="status">
          <h2>{hasAnyLocation ? 'No media found yet' : 'Welcome — let’s add your media'}</h2>
          <p>
            {hasAnyLocation
              ? 'Your folders are set up but nothing was found. Check the paths in Settings, or use “Refresh” on a folder after adding files.'
              : 'Point media-monkey at the folders on your computer or server that hold your movies, TV shows, music and audiobooks.'}
          </p>
          <Button variant="primary" onClick={() => navigate(hasAnyLocation ? paths.settings() : '/setup')}>
            {hasAnyLocation ? 'Open Settings' : 'Start setup'}
          </Button>
        </section>
      )}
      <section className="media-lists">
        {collections.length > 0 && (
          <div className="media-list" key="collections">
            <h2>Collections</h2>
            <div className="media-row-wrapper">
              <div className="media-row">
                {collections.map((c, i) => (
                  <div key={'coll-' + i} style={{ cursor: 'pointer' }} onClick={() => navigate(paths.collection(c.name))}>
                    <MediaCard item={{ title: c.name, type: 'collection', imageUrl: c.imageUrl || undefined }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {hasAnyMedia && mediaCategories.map(cat => (
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
  const back = useBack(paths.folder(serverId, folderName));
  return (
    <MediaItemPage
      key={`${serverId}:${folderName}:${itemTitle}`}
      serverId={serverId}
      folderName={folderName}
      itemTitle={itemTitle}
      onBack={back}
      onSelectSeason={(seasonName) => navigate(paths.season(serverId, folderName, itemTitle, seasonName))}
      onPlay={play}
      onRenamed={(newTitle) => navigate(paths.item(serverId, folderName, newTitle), { replace: true })}
    />
  );
}

function SeasonRoute() {
  const { serverId = '', folderName = '', itemTitle = '', seasonName = '' } = useParams();
  const play = usePlay();
  const back = useBack(paths.item(serverId, folderName, itemTitle));
  return (
    <SeasonPage
      key={`${serverId}:${folderName}:${itemTitle}:${seasonName}`}
      serverId={serverId}
      folderName={folderName}
      showTitle={itemTitle}
      seasonName={seasonName}
      onBack={back}
      onPlay={play}
    />
  );
}

function PlayerRoute() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { subtitles?: SubtitleTrack[]; watch?: WatchTarget } | null;
  const src = params.get('src') || '';
  return (
    <MediaPlayerPage
      key={src}
      title={params.get('title') || ''}
      mediaUrl={src}
      posterUrl={params.get('poster') || undefined}
      subtitles={state?.subtitles || []}
      watchTarget={state?.watch}
      onBack={() => navigate(-1)}
    />
  );
}

function CollectionsRoute() {
  const navigate = useNavigate();
  return <CollectionsPage onOpen={(name) => navigate(paths.collection(name))} />;
}

function CollectionRoute() {
  const { name = '' } = useParams();
  const navigate = useNavigate();
  const back = useBack(paths.collections());
  return (
    <CollectionPage
      key={name}
      name={name}
      onBack={back}
      onOpenItem={(serverId, folderName, itemTitle) => navigate(paths.item(serverId, folderName, itemTitle))}
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
  const navigate = useNavigate();
  const location = useLocation();
  const [profileId, setProfileId] = useState<number | null>(getActiveProfileId());
  const [servers, setServers] = useState<ServerSettings[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [openFolderMenu, setOpenFolderMenu] = useState<{ serverId: string; folder: string } | null>(null);
  const [refreshingFolder, setRefreshingFolder] = useState<{ serverId: string; folder: string } | null>(null);
  const [auth, setAuth] = useState<{ required: boolean; authed: boolean } | null>(null);

  const fetchServers = () => { api.getServers().then(d => setServers(d.servers)).catch(() => {}); };

  // Check auth once, and flip back to login if any request later returns 401.
  useEffect(() => {
    setUnauthorizedHandler(() => setAuth({ required: true, authed: false }));
    api.getAuthStatus()
      .then(s => setAuth({ required: s.authRequired, authed: s.authenticated }))
      .catch(() => setAuth({ required: false, authed: true }));
  }, []);

  // Load the library once authenticated, and again whenever the active profile
  // changes (watched marks + progress are per profile).
  useEffect(() => { if (auth?.authed) fetchServers(); }, [auth?.authed, profileId, retryTick]);

  // Offline detection: any failed API call flips the banner on; a light /healthz
  // poll (fast while offline, slow otherwise) flips it off and reloads the data.
  useEffect(() => { setConnectionHandler(setOffline); }, []);
  useEffect(() => {
    const check = async () => {
      if (document.hidden && !offline) return; // don't wake a background tab just to ping
      try {
        const res = await fetch('/healthz', { cache: 'no-store' });
        if (!res.ok) throw new Error('unhealthy');
        if (offline) { setOffline(false); setRetryTick(t => t + 1); }
      } catch {
        setOffline(true);
      }
    };
    const id = setInterval(check, offline ? 3000 : 10000);
    document.addEventListener('visibilitychange', check); // re-check as soon as the tab is back
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', check); };
  }, [offline]);

  const offlineFolders = (servers ?? []).flatMap(s => s.folders.filter(f => f.mediaLocation && f.available === false).map(f => f.name));

  const switchProfile = useCallback((id: number) => {
    setActiveProfileId(id);
    setProfileId(id);
  }, []);

  // First run: nothing configured yet → guide the user through setup once.
  useEffect(() => {
    if (!servers || setupDone() || location.pathname !== '/') return;
    const anyPath = servers.some(s => s.folders.some(f => f.mediaLocation));
    if (!anyPath) navigate('/setup', { replace: true });
  }, [servers, location.pathname, navigate]);

  const refreshFolder = (serverId: string, folderName: string) => {
    setRefreshingFolder({ serverId, folder: folderName });
    api.getFolderMedia(serverId, folderName, true)
      .then(() => fetchServers())
      .catch(() => {})
      .finally(() => setRefreshingFolder(null));
  };

  const logout = () => { api.logout().finally(() => { setServers(null); setAuth({ required: true, authed: false }); }); };

  if (auth === null) return null; // brief: awaiting auth status
  if (auth.required && !auth.authed) return <LoginPage onLogin={() => setAuth({ required: true, authed: true })} />;

  return (
    <div className="app-layout">
      <SidePanel
        servers={servers}
        openFolderMenu={openFolderMenu}
        setOpenFolderMenu={setOpenFolderMenu}
        onRefreshFolder={refreshFolder}
        refreshingFolder={refreshingFolder}
        onLogout={auth.required ? logout : undefined}
        activeProfileId={profileId}
        onSwitchProfile={switchProfile}
      />
      <main className="library-home">
        {offline && (
          <div className="banner banner--error" role="alert">
            <strong>Server offline.</strong> Can’t reach Media Monkey — retrying automatically. Anything already loaded keeps working.
          </div>
        )}
        {!offline && offlineFolders.length > 0 && (
          <div className="banner banner--warn" role="status">
            <strong>{offlineFolders.join(', ')}</strong> {offlineFolders.length === 1 ? 'is' : 'are'} offline — the folder can’t be read (drive unplugged or path moved). Showing the last known library.
          </div>
        )}
        <Suspense fallback={<div style={{ padding: '2rem' }}>Loading…</div>}>
        <Routes key={`${profileId ?? 0}:${location.pathname.startsWith('/play') ? 0 : retryTick}`}>
          <Route path="/" element={<HomePage servers={servers} />} />
          <Route path="/setup" element={<SetupWizard servers={servers} onSaved={setServers} onFinish={() => { markSetupDone(); navigate('/'); }} />} />
          <Route path="/settings" element={servers ? <SettingsPage servers={servers} onSaved={setServers} /> : <div style={{ padding: '2rem' }}>Loading...</div>} />
          <Route path="/collections" element={<CollectionsRoute />} />
          <Route path="/collection/:name" element={<CollectionRoute />} />
          <Route path="/server/:serverId" element={<ServerRoute servers={servers} />} />
          <Route path="/folder/:serverId/:folderName" element={<FolderRoute />} />
          <Route path="/item/:serverId/:folderName/:itemTitle" element={<ItemRoute />} />
          <Route path="/item/:serverId/:folderName/:itemTitle/season/:seasonName" element={<SeasonRoute />} />
          <Route path="/play" element={<PlayerRoute />} />
          <Route path="*" element={<HomePage servers={servers} />} />
        </Routes>
        </Suspense>
      </main>
    </div>
  );
}

export default App;
