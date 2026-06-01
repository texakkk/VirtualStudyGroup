import React, { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import ThemeCustomization from '../components/common/ThemeCustomization';
import { fetchUserSettings } from '../features/settings/settingsSlice';
import './Settings.css';

const Settings = () => {
  const dispatch = useDispatch();
  const [activeTab, setActiveTab] = useState('theme');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch user settings from backend on component mount
    const loadSettings = async () => {
      try {
        await dispatch(fetchUserSettings()).unwrap();
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [dispatch]);

  const tabs = [
    { id: 'theme', label: 'Theme & Customization', icon: '🎨' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'privacy', label: 'Privacy', icon: '🔒' },
    { id: 'account', label: 'Account', icon: '👤' },
  ];

  if (isLoading) {
    return (
      <div className="settings-page">
        <div className="settings-loading">
          <div className="spinner-large"></div>
          <p>Loading your settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-container">
        <div className="settings-sidebar">
          <h1 className="settings-title">Settings</h1>
          <nav className="settings-nav">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`settings-nav-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="nav-icon">{tab.icon}</span>
                <span className="nav-label">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="settings-content">
          {activeTab === 'theme' && <ThemeCustomization />}
          {activeTab === 'notifications' && (
            <div className="settings-placeholder">
              <h2>Notifications</h2>
              <p>Notification settings coming soon...</p>
            </div>
          )}
          {activeTab === 'privacy' && (
            <div className="settings-placeholder">
              <h2>Privacy</h2>
              <p>Privacy settings coming soon...</p>
            </div>
          )}
          {activeTab === 'account' && (
            <div className="settings-placeholder">
              <h2>Account</h2>
              <p>Account settings coming soon...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
