import React from 'react';
import { Alert, Badge, Tooltip } from 'antd';
import { WifiOutlined, SyncOutlined, CloudOutlined, DisconnectOutlined } from '@ant-design/icons';
import { useOffline } from '../../hooks/useOffline';
import './OfflineIndicator.css';

const OfflineIndicator = () => {
  const { isOnline, connectionQuality, syncStatus, triggerSync } = useOffline();

  // Don't show anything if online with good connection and no pending syncs
  if (isOnline && connectionQuality === 'good' && syncStatus.queueCount === 0) {
    return null;
  }

  const getStatusIcon = () => {
    if (!isOnline) {
      return <DisconnectOutlined />;
    }
    if (syncStatus.isSyncing) {
      return <SyncOutlined spin />;
    }
    if (connectionQuality === 'poor') {
      return <WifiOutlined />;
    }
    return <CloudOutlined />;
  };

  const getStatusMessage = () => {
    if (!isOnline) {
      return 'You are offline. Changes will be synced when connection is restored.';
    }
    if (syncStatus.isSyncing) {
      return 'Syncing offline changes...';
    }
    if (syncStatus.queueCount > 0) {
      return `${syncStatus.queueCount} action${syncStatus.queueCount > 1 ? 's' : ''} pending sync`;
    }
    if (connectionQuality === 'poor') {
      return 'Poor connection. Some features may be limited.';
    }
    if (connectionQuality === 'moderate') {
      return 'Moderate connection quality';
    }
    return 'Connected';
  };

  const getAlertType = () => {
    if (!isOnline) return 'error';
    if (syncStatus.isSyncing) return 'info';
    if (connectionQuality === 'poor') return 'warning';
    return 'info';
  };

  const handleSyncClick = () => {
    if (isOnline && syncStatus.queueCount > 0 && !syncStatus.isSyncing) {
      triggerSync();
    }
  };

  return (
    <div className="offline-indicator">
      <Alert
        message={
          <div className="offline-indicator-content">
            <span className="offline-indicator-icon">{getStatusIcon()}</span>
            <span className="offline-indicator-message">{getStatusMessage()}</span>
            {isOnline && syncStatus.queueCount > 0 && !syncStatus.isSyncing && (
              <Tooltip title="Click to sync now">
                <button
                  className="offline-indicator-sync-btn"
                  onClick={handleSyncClick}
                  aria-label="Sync offline changes"
                >
                  Sync Now
                </button>
              </Tooltip>
            )}
          </div>
        }
        type={getAlertType()}
        banner
        closable={true}
        showIcon={false}
      />
    </div>
  );
};

// Compact version for navbar/header
export const OfflineStatusBadge = () => {
  const { isOnline, connectionQuality, syncStatus } = useOffline();

  const getStatusColor = () => {
    if (!isOnline) return 'red';
    if (syncStatus.isSyncing) return 'blue';
    if (connectionQuality === 'poor') return 'orange';
    if (syncStatus.queueCount > 0) return 'yellow';
    return 'green';
  };

  const getTooltipText = () => {
    if (!isOnline) return 'Offline';
    if (syncStatus.isSyncing) return 'Syncing...';
    if (syncStatus.queueCount > 0) return `${syncStatus.queueCount} pending`;
    if (connectionQuality === 'poor') return 'Poor connection';
    return 'Online';
  };

  return (
    <Tooltip title={getTooltipText()}>
      <Badge
        status={getStatusColor()}
        text={
          <span className="offline-status-badge-text">
            {!isOnline ? 'Offline' : syncStatus.queueCount > 0 ? `${syncStatus.queueCount}` : ''}
          </span>
        }
      />
    </Tooltip>
  );
};

export default OfflineIndicator;
