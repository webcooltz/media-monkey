import React from 'react';

interface ModalProps {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}

// Overlay + dialog shell. Click outside or the × to close.
const Modal: React.FC<ModalProps> = ({ title, onClose, children, footer, width = 480 }) => (
  <div className="mm-modal-overlay" onClick={onClose}>
    <div className="mm-modal" style={{ width }} onClick={e => e.stopPropagation()}>
      <div className="mm-modal__header">
        <h3>{title}</h3>
        <button className="mm-modal__close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="mm-modal__body">{children}</div>
      {footer && <div className="mm-modal__footer">{footer}</div>}
    </div>
  </div>
);

export default Modal;
