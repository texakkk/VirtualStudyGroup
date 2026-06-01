import React from 'react';
import { useSettings } from '../../hooks/useSettings';
import { settingsOptions } from '../../features/settings/settingsSlice';

const SettingsPanel = ({ isOpen, onClose }) => {
  const {
    theme,
    font,
    language,
    accessibility,
    layout,
    preferences,
    updateTheme,
    updateFont,
    updateLanguage,
    updateAccessibility,
    updateLayout,
    updatePreferences,
    resetAllSettings,
    toggleTheme,
    toggleSidebar,
    error,
    clearError,
  } = useSettings();

  if (!isOpen) return null;

  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="settings-content">
          {/* Error Display */}
          {error && (
            <div className="error-message">
              <span>{error}</span>
              <button onClick={clearError} className="error-close">×</button>
            </div>
          )}

          {/* Theme Settings */}
          <div className="setting-group">
            <h3>🎨 Theme</h3>
            <div className="setting-item">
              <label>Current Theme: {theme}</label>
              <div className="theme-buttons">
                {settingsOptions.themes.map((themeOption) => (
                  <button
                    key={themeOption}
                    className={`btn ${theme === themeOption ? 'btn-primary' : ''}`}
                    onClick={() => updateTheme(themeOption)}
                  >
                    {themeOption.charAt(0).toUpperCase() + themeOption.slice(1)}
                  </button>
                ))}
                <button className="btn" onClick={toggleTheme}>
                  Toggle Theme
                </button>
              </div>
            </div>
          </div>

          {/* Font Settings */}
          <div className="setting-group">
            <h3>🔤 Font</h3>
            <div className="setting-item">
              <label htmlFor="font-family">Font Family</label>
              <select
                id="font-family"
                className="input"
                value={font.family}
                onChange={(e) => updateFont({ family: e.target.value })}
              >
                {settingsOptions.fontFamilies.map((fontFamily) => (
                  <option key={fontFamily.value} value={fontFamily.value}>
                    {fontFamily.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="setting-item">
              <label htmlFor="font-size">Font Size</label>
              <select
                id="font-size"
                className="input"
                value={font.size}
                onChange={(e) => updateFont({ size: e.target.value })}
              >
                {settingsOptions.fontSizes.map((fontSize) => (
                  <option key={fontSize.value} value={fontSize.value}>
                    {fontSize.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Language Settings */}
          <div className="setting-group">
            <h3>🌍 Language</h3>
            <div className="setting-item">
              <label htmlFor="language">Language</label>
              <select
                id="language"
                className="input"
                value={language}
                onChange={(e) => updateLanguage(e.target.value)}
              >
                {settingsOptions.languages.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.flag} {lang.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Accessibility Settings */}
          <div className="setting-group">
            <h3>♿ Accessibility</h3>
            <div className="setting-item">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={accessibility.highContrast}
                  onChange={(e) => updateAccessibility({ highContrast: e.target.checked })}
                />
                High Contrast Mode
              </label>
            </div>
            <div className="setting-item">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={accessibility.reducedMotion}
                  onChange={(e) => updateAccessibility({ reducedMotion: e.target.checked })}
                />
                Reduce Motion
              </label>
            </div>
          </div>

          {/* Layout Settings */}
          <div className="setting-group">
            <h3>📐 Layout</h3>
            <div className="setting-item">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={layout.sidebarCollapsed}
                  onChange={toggleSidebar}
                />
                Collapse Sidebar
              </label>
            </div>
            <div className="setting-item">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={layout.compactMode}
                  onChange={(e) => updateLayout({ compactMode: e.target.checked })}
                />
                Compact Mode
              </label>
            </div>
          </div>

          {/* Preferences */}
          <div className="setting-group">
            <h3>⚙️ Preferences</h3>
            <div className="setting-item">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={preferences.autoSave}
                  onChange={(e) => updatePreferences({ autoSave: e.target.checked })}
                />
                Auto Save
              </label>
            </div>
            <div className="setting-item">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={preferences.notifications}
                  onChange={(e) => updatePreferences({ notifications: e.target.checked })}
                />
                Enable Notifications
              </label>
            </div>
            <div className="setting-item">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={preferences.soundEnabled}
                  onChange={(e) => updatePreferences({ soundEnabled: e.target.checked })}
                />
                Sound Effects
              </label>
            </div>
          </div>

          {/* Reset Settings */}
          <div className="setting-group">
            <button
              className="btn btn-danger"
              onClick={resetAllSettings}
            >
              🔄 Reset All Settings
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .settings-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }

        .settings-panel {
          background-color: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 0.5rem;
          width: 90%;
          max-width: 500px;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: 0 4px 6px var(--shadow);
        }

        .settings-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          border-bottom: 1px solid var(--border-color);
        }

        .settings-header h2 {
          margin: 0;
          color: var(--text-primary);
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: var(--text-secondary);
          padding: 0;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .close-btn:hover {
          color: var(--text-primary);
        }

        .settings-content {
          padding: 1rem;
        }

        .setting-group {
          margin-bottom: 1.5rem;
        }

        .setting-group h3 {
          margin: 0 0 1rem 0;
          color: var(--text-primary);
          font-size: 1.1rem;
        }

        .setting-item {
          margin-bottom: 1rem;
        }

        .setting-item label {
          display: block;
          margin-bottom: 0.5rem;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .theme-buttons {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .theme-buttons .btn {
          flex: 1;
          min-width: 80px;
        }

        .input, .btn {
          width: 100%;
        }

        .theme-buttons .btn {
          width: auto;
        }

        .error-message {
          background-color: var(--error);
          color: white;
          padding: 0.75rem;
          border-radius: 0.375rem;
          margin-bottom: 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .error-close {
          background: none;
          border: none;
          color: white;
          cursor: pointer;
          font-size: 1.2rem;
          padding: 0;
          width: 20px;
          height: 20px;
        }

        .checkbox-label {
          display: flex !important;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          margin-bottom: 0.5rem !important;
        }

        .checkbox-label input[type="checkbox"] {
          width: auto !important;
          margin: 0;
        }

        .btn-danger {
          background-color: var(--error);
          color: white;
          border-color: var(--error);
        }

        .btn-danger:hover {
          opacity: 0.9;
        }
      `}</style>
    </div>
  );
};

export default SettingsPanel;