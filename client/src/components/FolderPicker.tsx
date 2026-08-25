import React, { useCallback, useEffect, useState } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { api } from '../api';
import type { DirEntry } from '../types';

interface FolderPickerProps {
  initialPath?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

const FolderPicker: React.FC<FolderPickerProps> = ({ initialPath, onSelect, onClose }) => {
  const [currentPath, setCurrentPath] = useState('');
  const [parent, setParent] = useState<string | null>(null);
  const [directories, setDirectories] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const browse = useCallback(async (targetPath: string) => {
    setLoading(true);
    setError(null);
    const load = async (p: string) => {
      const data = await api.browse(p || undefined);
      setCurrentPath(data.path);
      setParent(data.parent);
      setDirectories(data.directories);
    };
    try {
      await load(targetPath);
    } catch (e) {
      // A bad starting path shouldn't strand the picker — fall back to the drive/root list.
      if (targetPath) {
        try { await load(''); return; } catch { /* fall through to error */ }
      }
      setError(e instanceof Error ? e.message : 'Failed to browse');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial directory load on open — a legitimate fetch-on-mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { browse(initialPath || ''); }, [browse, initialPath]);

  return (
    <Modal
      title="Pick a folder"
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!currentPath} onClick={() => onSelect(currentPath)}>Select this folder</Button>
        </>
      }
    >
      <div className="folder-picker__path">{currentPath || 'Drives'}</div>
      <div className="folder-picker__list">
        {parent !== null && (
          <button className="folder-picker__row" onClick={() => browse(parent)}>⬆ ..</button>
        )}
        {loading && <div className="mm-muted" style={{ padding: '0.75rem' }}>Loading…</div>}
        {error && <div style={{ padding: '0.75rem', color: '#e77' }}>{error}</div>}
        {!loading && !error && directories.length === 0 && (
          <div className="mm-muted" style={{ padding: '0.75rem' }}>No subfolders here.</div>
        )}
        {!loading && directories.map(dir => (
          <button key={dir.path} className="folder-picker__row" onClick={() => browse(dir.path)}>📁 {dir.name}</button>
        ))}
      </div>
    </Modal>
  );
};

export default FolderPicker;
