import React, { useState } from 'react';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardNavigation';
import { useAccessibilityFeatures } from '../../hooks/useAccessibilityFeatures';
import './KeyboardNavigationHelper.css';

/**
 * KeyboardNavigationHelper Component
 * Displays keyboard shortcuts and provides navigation hints
 */
const KeyboardNavigationHelper = () => {
  const [showHelp, setShowHelp] = useState(false);
  const { isKeyboardNavigationEnabled, announce } = useAccessibilityFeatures();

  const shortcuts = {
    '?': () => {
      setShowHelp(!showHelp);
      if (!showHelp) {
        announce('Keyboard shortcuts help opened', 'polite');
      }
    },
    'escape': () => {
      if (showHelp) {
        setShowHelp(false);
        announce('Keyboard shortcuts help closed', 'polite');
      }
    }
  };

  useKeyboardShortcuts(shortcuts, { enabled: isKeyboardNavigationEnabled });

  const keyboardShortcuts = [
    { key: 'Tab', description: 'Navigate between interactive elements' },
    { key: 'Shift + Tab', description: 'Navigate backwards' },
    { key: 'Enter', description: 'Activate buttons and links' },
    { key: 'Space', description: 'Activate buttons and checkboxes' },
    { key: 'Escape', description: 'Close modals and dialogs' },
    { key: 'Arrow Keys', description: 'Navigate lists and menus' },
    { key: '/', description: 'Focus search bar' },
    { key: '?', description: 'Show/hide keyboard shortcuts' },
    { key: 'Alt + N', description: 'Open notifications' },
    { key: 'Alt + S', description: 'Open settings' }
  ];

  if (!isKeyboardNavigationEnabled) {
    return null;
  }

  return (
    <>
      {showHelp && (
        <div 
          className="keyboard-help-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="keyboard-help-title"
        >
          <div className="keyboard-help-content">
            <div className="keyboard-help-header">
              <h2 id="keyboard-help-title">Keyboard Shortcuts</h2>
              <button
                onClick={() => setShowHelp(false)}
                aria-label="Close keyboard shortcuts help"
                className="keyboard-help-close"
              >
                ×
              </button>
            </div>
            <div className="keyboard-help-body">
              <table className="keyboard-shortcuts-table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {keyboardShortcuts.map((shortcut, index) => (
                    <tr key={index}>
                      <td>
                        <kbd className="keyboard-key">{shortcut.key}</kbd>
                      </td>
                      <td>{shortcut.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="keyboard-help-footer">
              <p>Press <kbd>?</kbd> or <kbd>Escape</kbd> to close this help</p>
            </div>
          </div>
        </div>
      )}
      
      <button
        className="keyboard-help-trigger"
        onClick={() => setShowHelp(true)}
        aria-label="Show keyboard shortcuts"
        title="Keyboard shortcuts (Press ?)"
      >
        <span aria-hidden="true">⌨️</span>
      </button>
    </>
  );
};

export default KeyboardNavigationHelper;
