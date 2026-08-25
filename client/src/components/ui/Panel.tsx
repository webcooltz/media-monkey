import React from 'react';

interface PanelProps {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

// Bordered content box with an optional header row (title + actions).
const Panel: React.FC<PanelProps> = ({ title, actions, children, className = '' }) => (
  <div className={`mm-panel ${className}`.trim()}>
    {(title || actions) && (
      <div className="mm-panel__header">
        {typeof title === 'string' ? <h3>{title}</h3> : title}
        {actions}
      </div>
    )}
    {children}
  </div>
);

export default Panel;
