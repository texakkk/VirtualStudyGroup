
import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api';
import './ModerationDashboard.css';

const defaultModerationSettings = {
  autoModeration: false,
  bannedWords: [],
  reportThreshold: 3,
  requireApproval: {
    newMembers: false,
    fileUploads: false,
    posts: false
  }
};

const ModerationDashboard = ({ groupId, onClose }) => {
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [filterStatus, setFilterStatus] = useState('pending');
  const [moderationSettings, setModerationSettings] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const fetchReports = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get(`/content-moderation/${groupId}/reports`, {
        params: { status: filterStatus, limit: 50 },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setReports(response.data.reports);
      }
    } catch (error) {
      setNotification({
        message: error.response?.data?.message || 'Failed to load reports',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  }, [groupId, filterStatus]);

  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get(`/content-moderation/${groupId}/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setStats(response.data.stats);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }, [groupId]);

  const fetchModerationSettings = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get(`/group/${groupId}/settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success && response.data.settings) {
        setModerationSettings({
          ...defaultModerationSettings,
          ...(response.data.settings.GroupSettings_moderation || {}),
          requireApproval: {
            ...defaultModerationSettings.requireApproval,
            ...(response.data.settings.GroupSettings_moderation?.requireApproval || {})
          }
        });
      }
    } catch (error) {
      console.error('Failed to load moderation settings:', error);
      setModerationSettings(defaultModerationSettings);
    }
  }, [groupId]);

  useEffect(() => {
    const loadData = async () => {
      if (groupId) {
        await fetchReports();
        await fetchStats();
        await fetchModerationSettings();
      }
    };
    loadData();
  }, [groupId, filterStatus, fetchReports, fetchStats, fetchModerationSettings]);

  const handleUpdateModerationSettings = async (updatedSettings) => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.put(
        `/group/${groupId}/settings`,
        { moderation: updatedSettings },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setModerationSettings({
          ...defaultModerationSettings,
          ...(response.data.settings?.GroupSettings_moderation || updatedSettings)
        });
        setNotification({ message: 'Moderation settings updated successfully', type: 'success' });
      }
    } catch (error) {
      setNotification({
        message: error.response?.data?.message || 'Failed to update settings',
        type: 'error'
      });
    }
  };

  const handleTakeAction = async (reportId, action, reason) => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.post(
        `/content-moderation/${groupId}/reports/${reportId}/action`,
        { action, reason, notes: '' },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        fetchReports();
        setNotification({ message: 'Action taken successfully', type: 'success' });
      }
    } catch (error) {
      setNotification({
        message: error.response?.data?.message || 'Failed to take action',
        type: 'error'
      });
    }
  };

  const handleResolveReport = async (reportId, resolutionNotes, finalAction) => {
    try {
      const token = localStorage.getItem('token');
      await api.patch(
        `/content-moderation/${groupId}/reports/${reportId}/resolve`,
        { resolutionNotes, finalAction },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      fetchReports();
      setNotification({ message: 'Report resolved successfully', type: 'success' });
    } catch (error) {
      setNotification({
        message: error.response?.data?.message || 'Failed to resolve report',
        type: 'error'
      });
    }
  };

  if (loading) {
    return <div className="moderation-loading">Loading...</div>;
  }

  return (
    <div className="moderation-dashboard-modal">
      <div className="moderation-header">
        <h2>Content Moderation</h2>
        <button className="close-button" onClick={onClose}>x</button>
      </div>

      {notification.message && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}

      {stats && (
        <div className="moderation-stats">
          <div className="stat-card">
            <span className="stat-value">{stats.pendingReports || 0}</span>
            <span className="stat-label">Pending Reports</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.totalReports || 0}</span>
            <span className="stat-label">Total Reports</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.resolvedReports || 0}</span>
            <span className="stat-label">Resolved</span>
          </div>
        </div>
      )}

      <div className="filter-bar">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="pending">Pending</option>
          <option value="under-review">Under Review</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
          <option value="all">All</option>
        </select>
        <button className="settings-btn" onClick={() => setShowSettings(!showSettings)}>
          Moderation Settings
        </button>
      </div>

      {showSettings && moderationSettings && (
        <div className="moderation-settings-panel">
          <h3>Automated Moderation Controls</h3>
          <div className="settings-grid">
            <div className="setting-item">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={moderationSettings.autoModeration}
                  onChange={(e) => {
                    const updated = { ...moderationSettings, autoModeration: e.target.checked };
                    handleUpdateModerationSettings(updated);
                  }}
                />
                <span className="toggle-slider"></span>
                <span>Enable Auto-Moderation</span>
              </label>
              <p className="setting-description">
                Automatically flag content containing banned words or phrases
              </p>
            </div>

            <div className="setting-item">
              <label>Report Threshold</label>
              <input
                type="number"
                min="1"
                max="10"
                value={moderationSettings.reportThreshold}
                onChange={(e) => {
                  const updated = { ...moderationSettings, reportThreshold: parseInt(e.target.value) };
                  handleUpdateModerationSettings(updated);
                }}
                className="threshold-input"
              />
              <p className="setting-description">
                Number of reports before content is automatically hidden
              </p>
            </div>

            <div className="setting-item full-width">
              <label>Banned Words/Phrases</label>
              <textarea
                value={moderationSettings.bannedWords?.join(', ') || ''}
                onChange={(e) => {
                  const words = e.target.value.split(',').map(w => w.trim()).filter(Boolean);
                  const updated = { ...moderationSettings, bannedWords: words };
                  setModerationSettings(updated);
                }}
                onBlur={() => handleUpdateModerationSettings(moderationSettings)}
                placeholder="Enter words separated by commas"
                className="banned-words-input"
              />
              <p className="setting-description">
                Content containing these words will be automatically flagged for review
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="reports-list">
        {reports.length === 0 ? (
          <p className="no-reports">No reports found</p>
        ) : (
          reports.map(report => (
            <div key={report._id} className="report-card">
              <div className="report-header">
                <span className={`severity-badge ${report.ContentReport_severity}`}>
                  {report.ContentReport_severity}
                </span>
                <span className="report-type">{report.ContentReport_contentType}</span>
              </div>
              <h4>{report.ContentReport_reason}</h4>
              <p>{report.ContentReport_description}</p>
              <div className="report-meta">
                <span>Reported by: {report.ContentReport_reportedBy?.User_name}</span>
                <span>Status: {report.ContentReport_status}</span>
              </div>
              <div className="report-actions">
                <button onClick={() => handleTakeAction(report._id, 'content-removed', 'Violates guidelines')}>
                  Remove Content
                </button>
                <button onClick={() => handleTakeAction(report._id, 'warning-issued', 'First warning')}>
                  Issue Warning
                </button>
                <button onClick={() => handleResolveReport(report._id, 'Resolved', 'content-removed')}>
                  Resolve
                </button>
                <button onClick={() => handleTakeAction(report._id, 'dismissed', 'No policy violation found')}>
                  Dismiss
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ModerationDashboard;
