import React, { useState, useEffect } from 'react';
import { useSettings } from '../hooks/useSettings';
import { 
  updateThemeSettings, 
  updateAccessibilitySettings,
  syncSettings 
} from '../services/settingsApi';
import './ThemeCustomization.css';

const ThemeCustomization = () => {
  const { theme, font, accessibility, updateTheme, updateFont, updateAccessibility } = useSettings();
  
  const [selectedTheme, setSelectedTheme] = useState(theme);
  const [selectedFontSize, setSelectedFontSize] = useState(font.size);
  const [accessibilityOptions, setAccessibilityOptions] = useState(accessibility);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [error, setError] = useState('');

  // Theme options with descriptions
  const themeOptions = [
    {
      value: 'light',
      label: 'Light',
      icon: '☀️',
      description: 'Bright and clean interface'
    },
    {
      value: 'dark',
      label: 'Dark',
      icon: '🌙',
      description: 'Easy on the eyes in low light'
    },
    {
      value: 'high-contrast',
      label: 'High Contrast',
      icon: '⚫⚪',
      description: 'Maximum readability'
    }
  ];

  // Font size options
  const fontSizeOptions = [
    { value: 'small', label: 'Small', size: '14px' },
    { value: 'medium', label: 'Medium', size: '16px' },
    { value: 'large', label: 'Large', size: '18px' },
    { value: 'extra-large', label: 'Extra Large', size: '20px' }
  ];

  // Handle theme change
  const handleThemeChange = async (newTheme) => {
    try {
      setSelectedTheme(newTheme);
      updateTheme(newTheme);
      
      // Sync with backend
      await updateThemeSettings({ theme: newTheme });
      setSyncMessage('Theme updated successfully');
      setTimeout(() => setSyncMessage(''), 3000);
    } catch (err) {
      setError('Failed to update theme');
      console.error('Theme update error:', err);
    }
  };

  // Handle font size change
  const handleFontSizeChange = async (newSize) => {
    try {
      setSelectedFontSize(newSize);
      const sizeValue = fontSizeOptions.find(opt => opt.value === newSize)?.size || '16px';
      updateFont({ size: sizeValue });
      
      // Sync with backend
      await updateThemeSettings({ fontSize: newSize });
      setSyncMessage('Font size updated successfully');
      setTimeout(() => setSyncMessage(''), 3000);
    } catch (err) {
      setError('Failed to update font size');
      console.error('Font size update error:', err);
    }
  };

  // Handle accessibility option change
  const handleAccessibilityChange = async (option, value) => {
    try {
      const newAccessibility = {
        ...accessibilityOptions,
        [option]: value
      };
      setAccessibilityOptions(newAccessibility);
      updateAccessibility(newAccessibility);
      
      // Sync with backend
      await updateAccessibilitySettings(newAccessibility);
      setSyncMessage('Accessibility settings updated');
      setTimeout(() => setSyncMessage(''), 3000);
    } catch (err) {
      setError('Failed to update accessibility settings');
      console.error('Accessibility update error:', err);
    }
  };

  // Sync settings across devices
  const handleSyncSettings = async () => {
    try {
      setIsSyncing(true);
      await syncSettings();
      setSyncMessage('Settings synced across all devices');
      setTimeout(() => setSyncMessage(''), 3000);
    } catch (err) {
      setError('Failed to sync settings');
      console.error('Sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="theme-customization">
      <div className="customization-header">
        <h2>Theme & Customization</h2>
        <p className="subtitle">Personalize your experience</p>
      </div>

      {/* Success Message */}
      {syncMessage && (
        <div className="message success-message">
          <span>✓ {syncMessage}</span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="message error-message">
          <span>✗ {error}</span>
          <button onClick={() => setError('')} className="close-message">×</button>
        </div>
      )}

      {/* Theme Selection */}
      <div className="customization-section">
        <h3>🎨 Theme</h3>
        <p className="section-description">Choose your preferred color scheme</p>
        <div className="theme-options">
          {themeOptions.map((option) => (
            <button
              key={option.value}
              className={`theme-card ${selectedTheme === option.value ? 'active' : ''}`}
              onClick={() => handleThemeChange(option.value)}
              aria-label={`Select ${option.label} theme`}
            >
              <div className="theme-icon">{option.icon}</div>
              <div className="theme-label">{option.label}</div>
              <div className="theme-description">{option.description}</div>
              {selectedTheme === option.value && (
                <div className="active-indicator">✓</div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Font Size Selection */}
      <div className="customization-section">
        <h3>🔤 Font Size</h3>
        <p className="section-description">Adjust text size for better readability</p>
        <div className="font-size-options">
          {fontSizeOptions.map((option) => (
            <button
              key={option.value}
              className={`font-size-card ${selectedFontSize === option.size ? 'active' : ''}`}
              onClick={() => handleFontSizeChange(option.value)}
              aria-label={`Select ${option.label} font size`}
            >
              <div className="font-preview" style={{ fontSize: option.size }}>
                Aa
              </div>
              <div className="font-label">{option.label}</div>
              {selectedFontSize === option.size && (
                <div className="active-indicator">✓</div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Accessibility Preferences */}
      <div className="customization-section">
        <h3>♿ Accessibility</h3>
        <p className="section-description">Customize for your needs</p>
        <div className="accessibility-options">
          <label className="accessibility-option">
            <input
              type="checkbox"
              checked={accessibilityOptions.highContrast || false}
              onChange={(e) => handleAccessibilityChange('highContrast', e.target.checked)}
            />
            <div className="option-content">
              <div className="option-label">High Contrast</div>
              <div className="option-description">Increase contrast for better visibility</div>
            </div>
          </label>

          <label className="accessibility-option">
            <input
              type="checkbox"
              checked={accessibilityOptions.reducedMotion || false}
              onChange={(e) => handleAccessibilityChange('reducedMotion', e.target.checked)}
            />
            <div className="option-content">
              <div className="option-label">Reduce Motion</div>
              <div className="option-description">Minimize animations and transitions</div>
            </div>
          </label>

          <label className="accessibility-option">
            <input
              type="checkbox"
              checked={accessibilityOptions.screenReader || false}
              onChange={(e) => handleAccessibilityChange('screenReader', e.target.checked)}
            />
            <div className="option-content">
              <div className="option-label">Screen Reader Support</div>
              <div className="option-description">Optimize for screen readers</div>
            </div>
          </label>

          <label className="accessibility-option">
            <input
              type="checkbox"
              checked={accessibilityOptions.keyboardNavigation || false}
              onChange={(e) => handleAccessibilityChange('keyboardNavigation', e.target.checked)}
            />
            <div className="option-content">
              <div className="option-label">Keyboard Navigation</div>
              <div className="option-description">Enhanced keyboard shortcuts</div>
            </div>
          </label>
        </div>
      </div>

      {/* Device Sync */}
      <div className="customization-section">
        <h3>🔄 Device Synchronization</h3>
        <p className="section-description">Keep your settings consistent across all devices</p>
        <button
          className="sync-button"
          onClick={handleSyncSettings}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <>
              <span className="spinner"></span>
              Syncing...
            </>
          ) : (
            <>
              <span>🔄</span>
              Sync Settings
            </>
          )}
        </button>
        <p className="sync-info">
          Your theme, font size, and accessibility preferences will be synchronized across all your devices.
        </p>
      </div>
    </div>
  );
};

export default ThemeCustomization;
