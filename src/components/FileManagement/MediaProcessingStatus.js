import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Progress, 
  Alert, 
  Space, 
  Tag, 
  Button, 
  Select,
  Statistic,
  Row,
  Col,
  Modal,
  List,
  Badge
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  SyncOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  WarningOutlined,
  SettingOutlined
} from '@ant-design/icons';
import api from '../../api';
import './MediaProcessingStatus.css';

const { Option } = Select;

const MediaProcessingStatus = ({ fileId, groupId }) => {
  const [processingStatus, setProcessingStatus] = useState(null);
  const [storageStats, setStorageStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [optimizationSettings, setOptimizationSettings] = useState({
    quality: 'auto',
    format: 'auto'
  });
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  // Fetch processing status
  const fetchProcessingStatus = async () => {
    if (!fileId) return;
    
    setLoading(true);
    try {
      const response = await api.get(`/files/${fileId}/status`);
      setProcessingStatus(response.data.status);
    } catch (error) {
      console.error('Error fetching processing status:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch storage statistics
  const fetchStorageStats = async () => {
    if (!groupId) return;
    
    try {
      const response = await api.get(`/message/files/stats/${groupId}`);
      setStorageStats(response.data);
    } catch (error) {
      console.error('Error fetching storage stats:', error);
    }
  };

  useEffect(() => {
    fetchProcessingStatus();
    fetchStorageStats();

    // Poll for status updates if processing
    const interval = setInterval(() => {
      if (processingStatus?.processingStatus === 'processing') {
        fetchProcessingStatus();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [fileId, groupId]);

  // Get status icon and color
  const getStatusDisplay = (status) => {
    const displays = {
      pending: {
        icon: <ClockCircleOutlined />,
        color: 'default',
        text: 'Pending'
      },
      processing: {
        icon: <SyncOutlined spin />,
        color: 'processing',
        text: 'Processing'
      },
      completed: {
        icon: <CheckCircleOutlined />,
        color: 'success',
        text: 'Completed'
      },
      failed: {
        icon: <ExclamationCircleOutlined />,
        color: 'error',
        text: 'Failed'
      }
    };
    return displays[status] || displays.pending;
  };

  // Format bytes to readable size
  const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Calculate storage usage percentage
  const getStoragePercentage = () => {
    if (!storageStats?.total) return 0;
    const limit = 1024 * 1024 * 1024; // 1GB limit (example)
    return Math.round((storageStats.total.totalSize / limit) * 100);
  };

  // Get storage warning level
  const getStorageWarningLevel = () => {
    const percentage = getStoragePercentage();
    if (percentage >= 90) return 'error';
    if (percentage >= 75) return 'warning';
    return 'normal';
  };

  // Handle optimization settings change
  const handleOptimizationChange = async (settings) => {
    try {
      await api.put(`/files/${fileId}/optimization`, settings);
      setOptimizationSettings(settings);
      fetchProcessingStatus();
    } catch (error) {
      console.error('Error updating optimization settings:', error);
    }
  };

  if (!processingStatus && !storageStats) {
    return null;
  }

  const statusDisplay = processingStatus ? getStatusDisplay(processingStatus.processingStatus) : null;
  const storagePercentage = getStoragePercentage();
  const storageWarning = getStorageWarningLevel();

  return (
    <div className="media-processing-status">
      {/* Processing Status Card */}
      {processingStatus && (
        <Card 
          title="Processing Status" 
          className="status-card"
          extra={
            <Button 
              type="text" 
              icon={<SettingOutlined />}
              onClick={() => setSettingsModalVisible(true)}
            >
              Settings
            </Button>
          }
        >
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {/* Overall Status */}
            <div className="status-header">
              <Tag 
                icon={statusDisplay.icon} 
                color={statusDisplay.color}
                style={{ fontSize: 14, padding: '4px 12px' }}
              >
                {statusDisplay.text}
              </Tag>
              {processingStatus.processingStatus === 'processing' && (
                <span className="processing-text">
                  Your file is being optimized...
                </span>
              )}
            </div>

            {/* Processing Progress */}
            {processingStatus.processingStatus === 'processing' && (
              <div className="processing-progress">
                <Progress 
                  percent={processingStatus.progress || 0} 
                  status="active"
                  strokeColor={{
                    '0%': '#108ee9',
                    '100%': '#87d068',
                  }}
                />
                <div className="progress-details">
                  <span>Generating thumbnails and optimizing media...</span>
                </div>
              </div>
            )}

            {/* Processing Details */}
            {processingStatus.metadata && (
              <div className="processing-details">
                <h4>File Information</h4>
                <Row gutter={[16, 16]}>
                  {processingStatus.metadata.dimensions && (
                    <Col span={12}>
                      <Statistic 
                        title="Dimensions" 
                        value={`${processingStatus.metadata.dimensions.width} × ${processingStatus.metadata.dimensions.height}`}
                        valueStyle={{ fontSize: 16 }}
                      />
                    </Col>
                  )}
                  {processingStatus.metadata.duration && (
                    <Col span={12}>
                      <Statistic 
                        title="Duration" 
                        value={Math.round(processingStatus.metadata.duration)}
                        suffix="sec"
                        valueStyle={{ fontSize: 16 }}
                      />
                    </Col>
                  )}
                </Row>
              </div>
            )}

            {/* Processed Versions */}
            {processingStatus.processedVersions && processingStatus.processedVersions.length > 0 && (
              <div className="processed-versions">
                <h4>Optimized Versions</h4>
                <List
                  size="small"
                  dataSource={processingStatus.processedVersions}
                  renderItem={version => (
                    <List.Item>
                      <Space>
                        <CheckCircleOutlined style={{ color: '#52c41a' }} />
                        <span>{version.format}</span>
                        <Tag>{formatBytes(version.size)}</Tag>
                      </Space>
                    </List.Item>
                  )}
                />
              </div>
            )}

            {/* Security Scan Status */}
            {processingStatus.securityScan && (
              <Alert
                message="Security Scan"
                description={
                  processingStatus.securityScan.status === 'passed' 
                    ? 'File passed security checks'
                    : processingStatus.securityScan.status === 'failed'
                    ? 'Security threats detected'
                    : 'Security scan in progress'
                }
                type={
                  processingStatus.securityScan.status === 'passed' 
                    ? 'success' 
                    : processingStatus.securityScan.status === 'failed'
                    ? 'error'
                    : 'info'
                }
                showIcon
              />
            )}
          </Space>
        </Card>
      )}

      {/* Storage Usage Card */}
      {storageStats && (
        <Card 
          title="Storage Usage" 
          className="storage-card"
          extra={
            storageWarning !== 'normal' && (
              <Badge status={storageWarning === 'error' ? 'error' : 'warning'} text="Action Required" />
            )
          }
        >
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {/* Storage Progress */}
            <div className="storage-progress">
              <Progress 
                percent={storagePercentage} 
                status={storageWarning === 'error' ? 'exception' : 'normal'}
                strokeColor={
                  storageWarning === 'error' ? '#ff4d4f' :
                  storageWarning === 'warning' ? '#faad14' : '#52c41a'
                }
              />
              <div className="storage-info">
                <span>{formatBytes(storageStats.total.totalSize)} used</span>
                <span>of 1 GB</span>
              </div>
            </div>

            {/* Storage Warning */}
            {storageWarning !== 'normal' && (
              <Alert
                message={storageWarning === 'error' ? 'Storage Almost Full' : 'Storage Warning'}
                description={
                  storageWarning === 'error'
                    ? 'You are running out of storage space. Please delete some files or upgrade your plan.'
                    : 'You are approaching your storage limit. Consider managing your files.'
                }
                type={storageWarning === 'error' ? 'error' : 'warning'}
                showIcon
                icon={<WarningOutlined />}
                action={
                  <Button size="small" type="primary">
                    Manage Storage
                  </Button>
                }
              />
            )}

            {/* Storage Breakdown */}
            <div className="storage-breakdown">
              <h4>Storage by Type</h4>
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Statistic 
                    title="Images" 
                    value={storageStats.byType?.image?.count || 0}
                    suffix="files"
                    prefix={<span style={{ fontSize: 20 }}>🖼️</span>}
                  />
                  <div className="type-size">{formatBytes(storageStats.byType?.image?.totalSize || 0)}</div>
                </Col>
                <Col span={12}>
                  <Statistic 
                    title="Videos" 
                    value={storageStats.byType?.video?.count || 0}
                    suffix="files"
                    prefix={<span style={{ fontSize: 20 }}>🎥</span>}
                  />
                  <div className="type-size">{formatBytes(storageStats.byType?.video?.totalSize || 0)}</div>
                </Col>
                <Col span={12}>
                  <Statistic 
                    title="Documents" 
                    value={storageStats.byType?.document?.count || 0}
                    suffix="files"
                    prefix={<span style={{ fontSize: 20 }}>📄</span>}
                  />
                  <div className="type-size">{formatBytes(storageStats.byType?.document?.totalSize || 0)}</div>
                </Col>
                <Col span={12}>
                  <Statistic 
                    title="Other" 
                    value={storageStats.byType?.other?.count || 0}
                    suffix="files"
                    prefix={<span style={{ fontSize: 20 }}>📎</span>}
                  />
                  <div className="type-size">{formatBytes(storageStats.byType?.other?.totalSize || 0)}</div>
                </Col>
              </Row>
            </div>
          </Space>
        </Card>
      )}

      {/* Optimization Settings Modal */}
      <Modal
        title="Optimization Settings"
        open={settingsModalVisible}
        onCancel={() => setSettingsModalVisible(false)}
        footer={null}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <label>Quality</label>
            <Select
              value={optimizationSettings.quality}
              onChange={(value) => handleOptimizationChange({ ...optimizationSettings, quality: value })}
              style={{ width: '100%', marginTop: 8 }}
            >
              <Option value="auto">Auto (Recommended)</Option>
              <Option value="high">High Quality</Option>
              <Option value="medium">Medium Quality</Option>
              <Option value="low">Low Quality (Smaller Size)</Option>
            </Select>
          </div>

          <div>
            <label>Format</label>
            <Select
              value={optimizationSettings.format}
              onChange={(value) => handleOptimizationChange({ ...optimizationSettings, format: value })}
              style={{ width: '100%', marginTop: 8 }}
            >
              <Option value="auto">Auto (Recommended)</Option>
              <Option value="webp">WebP (Modern)</Option>
              <Option value="jpeg">JPEG (Compatible)</Option>
              <Option value="png">PNG (Lossless)</Option>
            </Select>
          </div>

          <Alert
            message="Automatic Optimization"
            description="Files are automatically optimized for different devices and connection speeds. You can adjust these settings to prioritize quality or file size."
            type="info"
            showIcon
          />
        </Space>
      </Modal>
    </div>
  );
};

export default MediaProcessingStatus;
