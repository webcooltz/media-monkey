import React, { useCallback, useEffect, useRef, useState } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { api } from '../api';

// Poster canvas is 2:3. Internal resolution 600x900, displayed at half size.
const CW = 600;
const CH = 900;
const DISPLAY_W = 300;
const DISPLAY_H = 450;
const CSS_TO_CANVAS = CW / DISPLAY_W; // 2

interface CoverEditorProps {
  serverId: string;
  folderName: string;
  itemTitle: string;
  onClose: () => void;
  onSaved: (imageUrl: string) => void;
}

const CoverEditor: React.FC<CoverEditorProps> = ({ serverId, folderName, itemTitle, onClose, onSaved }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [baseScale, setBaseScale] = useState(1);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, CW, CH);
    if (img) ctx.drawImage(img, tx, ty, img.width * scale, img.height * scale);
  }, [img, scale, tx, ty]);

  useEffect(() => { redraw(); }, [redraw]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const cover = Math.max(CW / image.width, CH / image.height);
      setImg(image);
      setBaseScale(cover);
      setScale(cover);
      setTx((CW - image.width * cover) / 2);
      setTy((CH - image.height * cover) / 2);
      URL.revokeObjectURL(url);
    };
    image.src = url;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!img) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tx, ty };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = (e.clientX - drag.current.x) * CSS_TO_CANVAS;
    const dy = (e.clientY - drag.current.y) * CSS_TO_CANVAS;
    setTx(drag.current.tx + dx);
    setTy(drag.current.ty + dy);
  };
  const onPointerUp = () => { drag.current = null; };

  const onZoom = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newScale = Number(e.target.value);
    // keep the canvas center anchored on the same image point
    const cx = CW / 2, cy = CH / 2;
    const imgX = (cx - tx) / scale;
    const imgY = (cy - ty) / scale;
    setTx(cx - imgX * newScale);
    setTy(cy - imgY * newScale);
    setScale(newScale);
  };

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    setSaving(true);
    setError(null);
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const data = await api.uploadCover(serverId, folderName, itemTitle, dataUrl);
      onSaved(data.imageUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Edit cover"
      onClose={onClose}
      width={380}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!img || saving}>{saving ? 'Saving…' : 'Save cover'}</Button>
        </>
      }
    >
      <input type="file" accept="image/*" onChange={onFile} style={{ marginBottom: 12 }} />

      <div style={{ position: 'relative', width: DISPLAY_W, height: DISPLAY_H, margin: '0 auto 12px', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', background: '#111' }}>
        <canvas
          ref={canvasRef}
          width={CW}
          height={CH}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{ width: DISPLAY_W, height: DISPLAY_H, cursor: img ? 'grab' : 'default', touchAction: 'none' }}
        />
        {!img && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#777', fontSize: 13, pointerEvents: 'none' }}>
            Pick an image to start
          </div>
        )}
      </div>

      {img && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text)' }}>Zoom</span>
          <input type="range" min={baseScale} max={baseScale * 4} step={baseScale / 100} value={scale} onChange={onZoom} style={{ flex: 1 }} />
        </div>
      )}
      <p className="mm-muted" style={{ fontSize: 12 }}>Drag to reposition, zoom to fit. Saved as the item's cover.</p>
      {error && <p style={{ color: '#e77', fontSize: 13 }}>{error}</p>}
    </Modal>
  );
};

export default CoverEditor;
