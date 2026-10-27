import React, { useCallback, useEffect, useState } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { api } from '../api';
import { applyTheme, DEFAULT_PRIMARY, DEFAULT_SECONDARY } from '../theme';
import type { Profile } from '../types';

interface ProfileSwitcherProps {
  activeId: number | null;
  onSwitch: (id: number) => void;
}

// "Who's watching?" selector. Profiles have no passwords — they only keep
// separate watched/resume state.
const ProfileSwitcher: React.FC<ProfileSwitcherProps> = ({ activeId, onSwitch }) => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [managing, setManaging] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [primary, setPrimary] = useState(DEFAULT_PRIMARY);
  const [secondary, setSecondary] = useState(DEFAULT_SECONDARY);

  const load = useCallback(() => api.getProfiles().then(d => {
    setProfiles(d.profiles);
    const me = d.profiles.find(p => p.id === activeId) ?? d.profiles.find(p => p.id === d.current);
    applyTheme(me?.primaryColor, me?.secondaryColor);
    setPrimary(me?.primaryColor ?? DEFAULT_PRIMARY);
    setSecondary(me?.secondaryColor ?? DEFAULT_SECONDARY);
    // Stored id may point at a deleted profile — fall back to the server's choice.
    if (!d.profiles.some(p => p.id === activeId)) onSwitch(d.current);
  }).catch(() => {}), [activeId, onSwitch]);

  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong'); }
  };

  const add = () => run(async () => {
    const { profile } = await api.createProfile(newName);
    setNewName('');
    onSwitch(profile.id);
  });

  // Closing discards any unsaved colour preview by re-applying the stored theme.
  const closeManager = () => { setManaging(false); setError(null); load(); };

  const preview = (p: string, s: string) => {
    setPrimary(p); setSecondary(s);
    applyTheme(p, s, { cache: false }); // live preview; saved on "Save colors"
  };

  const saveColors = (p: string | null, s: string | null) => run(async () => {
    if (activeId == null) return;
    await api.updateProfile(activeId, { primaryColor: p, secondaryColor: s });
  });

  const rename = (p: Profile) => {
    const name = window.prompt('Rename profile', p.name);
    if (name && name.trim() && name !== p.name) run(() => api.renameProfile(p.id, name));
  };

  const remove = (p: Profile) => {
    if (!window.confirm(`Delete “${p.name}” and its watch history?`)) return;
    run(async () => {
      await api.deleteProfile(p.id);
      if (p.id === activeId) {
        const rest = profiles.filter(x => x.id !== p.id);
        if (rest[0]) onSwitch(rest[0].id);
      }
    });
  };

  return (
    <div className="profile-switcher">
      <label className="profile-switcher__label" htmlFor="profile-select">Watching as</label>
      <div className="profile-switcher__row">
        <select
          id="profile-select"
          className="profile-switcher__select"
          value={activeId ?? ''}
          onChange={e => onSwitch(Number(e.target.value))}
        >
          {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="profile-switcher__manage" onClick={() => setManaging(true)} aria-label="Manage profiles" title="Manage profiles">⚙</button>
      </div>

      {managing && (
        <Modal title="Profiles" onClose={closeManager} width={420}
          footer={<Button onClick={closeManager}>Done</Button>}>
          <p className="mm-muted" style={{ fontSize: 13, marginTop: 0 }}>
            Each profile keeps its own watched marks and resume points. No passwords — just pick who's watching.
          </p>
          <ul className="profile-list">
            {profiles.map(p => (
              <li key={p.id} className="profile-list__row">
                <span className="profile-list__name">
                  {p.name}{p.id === activeId && <em> (active)</em>}
                </span>
                <Button variant="ghost" onClick={() => rename(p)}>Rename</Button>
                <Button variant="danger" onClick={() => remove(p)} disabled={profiles.length <= 1}>Delete</Button>
              </li>
            ))}
          </ul>
          <form className="profile-list__add" onSubmit={e => { e.preventDefault(); if (newName.trim()) add(); }}>
            <input
              type="text" value={newName} maxLength={40} placeholder="New profile name"
              onChange={e => setNewName(e.target.value)} aria-label="New profile name"
            />
            <Button variant="primary" type="submit" disabled={!newName.trim()}>Add</Button>
          </form>
          <div className="theme-editor">
            <h4>Colors for {profiles.find(p => p.id === activeId)?.name ?? 'this profile'}</h4>
            <div className="theme-editor__row">
              <label>Primary
                <input type="color" value={primary} onChange={e => preview(e.target.value, secondary)} />
              </label>
              <label>Accent
                <input type="color" value={secondary} onChange={e => preview(primary, e.target.value)} />
              </label>
              <Button variant="primary" onClick={() => saveColors(primary, secondary)}>Save colors</Button>
              <Button variant="ghost" onClick={() => { preview(DEFAULT_PRIMARY, DEFAULT_SECONDARY); saveColors(null, null); }}>Reset</Button>
            </div>
            <p className="mm-muted" style={{ fontSize: 12 }}>Primary colors buttons and highlights; accent colors headings and text highlights. Stored per profile.</p>
          </div>
          {error && <p style={{ color: '#e55', marginTop: 8 }}>{error}</p>}
        </Modal>
      )}
    </div>
  );
};

export default ProfileSwitcher;
