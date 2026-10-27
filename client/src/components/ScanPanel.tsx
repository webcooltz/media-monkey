import React, { useCallback, useEffect, useRef, useState } from 'react';
import Button from './ui/Button';
import { api } from '../api';
import type { ScanStatus } from '../types';

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.round(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)} h ago`;
  return `${Math.round(secs / 86400)} d ago`;
}

// Settings panel: shows background-scan status and lets you trigger one.
const ScanPanel: React.FC<{ onScanned?: () => void }> = ({ onScanned }) => {
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };

  const refresh = useCallback(async () => {
    const s = await api.getScanStatus();
    setStatus(s);
    return s;
  }, []);

  useEffect(() => {
    api.getScanStatus().then(setStatus).catch(() => {});
    return stop;
  }, []);

  const scanNow = async () => {
    setError(null);
    try {
      await api.startScan();
      stop();
      timer.current = setInterval(async () => {
        try {
          const s = await refresh();
          if (!s.running) { stop(); onScanned?.(); }
        } catch { stop(); }
      }, 700);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the scan');
    }
  };

  const r = status?.lastResult;
  return (
    <div className="mm-panel" style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18 }}>Library scan</h2>
      <p className="mm-muted" style={{ fontSize: 13, margin: '0 0 12px' }}>
        {status?.enabled
          ? `Rescans automatically every ${status.intervalMinutes} min (change AUTO_SCAN_MINUTES in server/.env).`
          : 'Automatic rescans are off (AUTO_SCAN_MINUTES=0).'}
        {' '}Last scan: {ago(status?.lastFinishedAt ?? null)}
        {r && !status?.running ? ` — +${r.added} / −${r.removed}${r.skipped ? `, ${r.skipped} unavailable folder${r.skipped === 1 ? '' : 's'} skipped` : ''}` : ''}.
      </p>
      <Button onClick={scanNow} disabled={status?.running}>{status?.running ? 'Scanning…' : 'Scan now'}</Button>
      {error && <span style={{ color: '#e55', marginLeft: 12 }}>{error}</span>}
    </div>
  );
};

export default ScanPanel;
