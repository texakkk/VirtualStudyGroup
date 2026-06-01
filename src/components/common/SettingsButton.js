import React, { useState } from 'react';
import SettingsPanel from './SettingsPanel';
import { useSettings } from '../../hooks/useSettings';

const SettingsButton = ({ className = '', style = {} }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { theme } = useSettings();

  const buttonStyle = {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    width: '50px',
    height: '50px',
    borderRadius: '50%',
    backgroundColor: 'var(--accent-primary)',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    boxShadow: '0 2px 10px var(--shadow)',
    zIndex: 999,
    transition: 'all 0.3s ease',
    ...style,
  };

  return (
    <>
      <button
        className={`settings-button ${className}`}
        style={buttonStyle}
        onClick={() => setIsSettingsOpen(true)}
        title="Open Settings"
        onMouseEnter={(e) => {
          e.target.style.transform = 'scale(1.1)';
        }}
        onMouseLeave={(e) => {
          e.target.style.transform = 'scale(1)';
        }}
      >
        ⚙️
      </button>
      
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
};

export default SettingsButton;