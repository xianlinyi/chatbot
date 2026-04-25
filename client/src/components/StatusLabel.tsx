import React from 'react';
import './StatusLabel.css';

interface StatusLabelProps {
  text: string;
  active?: boolean;
}

export const StatusLabel: React.FC<StatusLabelProps> = ({ text, active = false }) => {
  return (
    <span className={`status-label ${active ? 'active' : ''}`}>
      {text}
    </span>
  );
};
