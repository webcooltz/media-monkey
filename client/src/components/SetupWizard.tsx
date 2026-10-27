import React, { useCallback, useEffect, useRef, useState } from 'react';
import Button from './ui/Button';
import FolderPicker from './FolderPicker';
import { api } from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { Profile, ScanStatus, ServerSettings, SetupStatus } from '../types';

interface SetupWizardProps {
  servers: ServerSettings[] | null;
  onSaved: (servers: ServerSettings[]) => void;
  onFinish: () => void;
}

const STEPS = ['Welcome', 'Media folders', 'Profiles', 'Scan'];

type Check = { ok: boolean | 'info'; label: string; detail: string };

function buildChecks(s: SetupStatus): Check[] {
  const keyCount = Object.values(s.keys).filter(Boolean).length;
  return [
    { ok: true, label: `Server running (Node ${s.node})`, detail: 'The API and database are up.' },
    s.ffmpeg
      ? { ok: true, label: 'ffmpeg found', detail: 'MKV, AVI and HEVC files can be streamed in the browser.' }
      : { ok: 'info', label: 'ffmpeg not found', detail: 'MP4/M4V/WebM still play directly. Install ffmpeg to stream MKV, AVI and HEVC.' },
    keyCount > 0
      ? { ok: true, label: `${keyCount} of 3 API keys configured`, detail: 'Posters, metadata and subtitles are enabled for the configured providers.' }
      : { ok: 'info', label: 'No API keys yet', detail: 'Optional. Add TMDB_API_KEY (and others) to server/.env for posters, metadata and subtitles.' },
    s.authEnabled
      ? { ok: true, label: 'Password login enabled', detail: 'Access requires AUTH_PASSWORD.' }
      : { ok: 'info', label: 'No password set', detail: 'Fine for a trusted home network. Set AUTH_PASSWORD in server/.env before exposing it to the internet.' },
  ];
}

const SetupWizard: React.FC<SetupWizardProps> = ({ servers, onSaved, onFinish }) => {
  useDocumentTitle('Setup');
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [draft, setDraft] = useState<ServerSettings[] | null>(null);
  const [picker, setPicker] = useState<{ serverId: string; folderName: string; path: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [newName, setNewName] = useState('');
  const [scan, setScan] = useState<ScanStatus | null>(null);
  const [scanning, setScanning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { api.getSetupStatus().then(setStatus).catch(() => {}); }, []);
  useEffect(() => { api.getProfiles().then(d => setProfiles(d.profiles)).catch(() => {}); }, []);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Seed the editable copy once the library config arrives.
  const working = draft ?? (servers ? servers.map(s => ({ ...s, folders: s.folders.map(f => ({ name: f.name, mediaLocation: f.mediaLocation })) })) : null);

  const setPath = (serverId: string, folderName: string, mediaLocation: string) => {
    if (!working) return;
    setDraft(working.map(s => s.id !== serverId ? s : {
      ...s, folders: s.folders.map(f => f.name === folderName ? { ...f, mediaLocation } : f),
    }));
  };

  const filled = working?.some(s => s.folders.some(f => f.mediaLocation.trim())) ?? false;

  const saveFolders = async () => {
    if (!working) return;
    setSaving(true); setError(null);
    try {
      await api.saveSettings(working);
      const fresh = await api.getServers();
      onSaved(fresh.servers);
      setDraft(null);
      setStatus(await api.getSetupStatus());
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save folders');
    } finally {
      setSaving(false);
    }
  };

  const addProfile = async () => {
    setError(null);
    try {
      const { profile } = await api.createProfile(newName);
      setProfiles(p => [...p, profile]);
      setNewName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add profile');
    }
  };

  const poll = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const s = await api.getScanStatus();
        setScan(s);
        if (!s.running && s.lastFinishedAt) {
          if (pollRef.current) clearInterval(pollRef.current);
          setScanning(false);
          const fresh = await api.getServers();
          onSaved(fresh.servers);
        }
      } catch { /* keep polling */ }
    }, 600);
  }, [onSaved]);

  const startScan = async () => {
    setScanning(true); setError(null); setScan(null);
    try {
      await api.startScan();
      poll();
    } catch (e) {
      setScanning(false);
      setError(e instanceof Error ? e.message : 'Could not start the scan');
    }
  };

  const total = status?.folders.reduce((n, f) => n + f.itemCount, 0) ?? 0;

  return (
    <div className="wizard">
      <ol className="wizard__steps" aria-label="Setup progress">
        {STEPS.map((label, i) => (
          <li key={label} className={`wizard__step${i === step ? ' is-active' : ''}${i < step ? ' is-done' : ''}`} aria-current={i === step ? 'step' : undefined}>
            <span className="wizard__dot">{i < step ? '✓' : i + 1}</span>
            <span className="wizard__step-label">{label}</span>
          </li>
        ))}
      </ol>

      <div className="wizard__card">
        {step === 0 && (
          <>
            <img className="wizard__logo" src="/logo.png" alt="" width={88} height={88} />
            <h1>Welcome to Media Monkey</h1>
            <p className="mm-muted">Let's get your library online. This takes about a minute.</p>
            <ul className="wizard__checks">
              {status ? buildChecks(status).map(c => (
                <li key={c.label} className="wizard__check">
                  <span className={`wizard__badge ${c.ok === true ? 'is-ok' : 'is-info'}`} aria-hidden="true">{c.ok === true ? '✓' : 'i'}</span>
                  <div><strong>{c.label}</strong><div className="mm-muted">{c.detail}</div></div>
                </li>
              )) : <li className="mm-muted">Checking your system…</li>}
            </ul>
            <div className="wizard__nav">
              <Button variant="ghost" onClick={onFinish}>Skip setup</Button>
              <Button variant="primary" onClick={() => setStep(1)}>Get started</Button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1>Where is your media?</h1>
            <p className="mm-muted">Point each category at a folder. Leave the ones you don't use blank — you can change this any time in Settings.</p>
            {!working && <p className="mm-muted">Loading…</p>}
            {working?.map(server => (
              <div key={server.id}>
                {working.length > 1 && <h2>{server.name}</h2>}
                {server.folders.map(folder => {
                  const known = status?.folders.find(f => f.serverId === server.id && f.name === folder.name);
                  const missing = known && known.mediaLocation && !known.exists && known.mediaLocation === folder.mediaLocation;
                  return (
                    <div key={folder.name} className="wizard__folder">
                      <label htmlFor={`path-${server.id}-${folder.name}`}>{folder.name}</label>
                      <div className="wizard__folder-row">
                        <input
                          id={`path-${server.id}-${folder.name}`}
                          type="text" className="settings-path" value={folder.mediaLocation}
                          placeholder={`/path/to/${folder.name}`}
                          onChange={e => setPath(server.id, folder.name, e.target.value)}
                        />
                        <Button onClick={() => setPicker({ serverId: server.id, folderName: folder.name, path: folder.mediaLocation })}>Browse…</Button>
                      </div>
                      {missing && <div className="wizard__warn">That folder doesn't exist on this machine.</div>}
                    </div>
                  );
                })}
              </div>
            ))}
            {error && <p style={{ color: '#e55' }}>{error}</p>}
            <div className="wizard__nav">
              <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
              <Button variant="primary" onClick={saveFolders} disabled={!filled || saving}>{saving ? 'Saving…' : 'Save & continue'}</Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1>Who's watching?</h1>
            <p className="mm-muted">Add a profile for everyone in the house so each person keeps their own watched marks and resume points. No passwords. Optional.</p>
            <ul className="wizard__chips">
              {profiles.map(p => <li key={p.id} className="wizard__chip">{p.name}</li>)}
            </ul>
            <form className="profile-list__add" onSubmit={e => { e.preventDefault(); if (newName.trim()) addProfile(); }}>
              <input type="text" value={newName} maxLength={40} placeholder="Name" aria-label="Profile name" onChange={e => setNewName(e.target.value)} />
              <Button type="submit" disabled={!newName.trim()}>Add profile</Button>
            </form>
            {error && <p style={{ color: '#e55' }}>{error}</p>}
            <div className="wizard__nav">
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button variant="primary" onClick={() => { setError(null); setStep(3); }}>Continue</Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1>Scan your library</h1>
            <p className="mm-muted">
              {status && status.autoScanMinutes > 0
                ? `New files are picked up automatically every ${status.autoScanMinutes} minutes. Run the first scan now.`
                : 'Automatic rescans are off (AUTO_SCAN_MINUTES=0). Run a scan now and any time you add files.'}
            </p>
            {scan?.lastFinishedAt && !scanning ? (
              <p className="wizard__result" role="status">
                ✓ Scanned {scan.lastResult?.folders ?? 0} folder{scan.lastResult?.folders === 1 ? '' : 's'} — {total} item{total === 1 ? '' : 's'} in your library.
              </p>
            ) : (
              <Button variant="primary" onClick={startScan} disabled={scanning}>{scanning ? 'Scanning…' : 'Scan now'}</Button>
            )}
            {error && <p style={{ color: '#e55' }}>{error}</p>}
            <div className="wizard__nav">
              <Button variant="ghost" onClick={() => setStep(2)} disabled={scanning}>Back</Button>
              <Button variant="primary" onClick={onFinish} disabled={scanning}>{scan?.lastFinishedAt ? 'Open my library' : 'Skip for now'}</Button>
            </div>
          </>
        )}
      </div>

      {picker && (
        <FolderPicker
          initialPath={picker.path}
          onSelect={p => { setPath(picker.serverId, picker.folderName, p); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
};

export default SetupWizard;
