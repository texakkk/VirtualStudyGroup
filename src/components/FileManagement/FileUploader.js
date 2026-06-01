import React, { useState, useRef, useCallback } from 'react';
import { Upload, Progress, Button, message, Space, Tag, Modal } from 'antd';
import { 
  InboxOutlined, 
  FileOutlined, 
  DeleteOutlined, 
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined
} from '@ant-design/icons';
import api from '../../api';
import './FileUploader.css';

const { Dragger } = Upload;

const FileUploader = ({ groupId, onUploadComplete, maxFileSize = 100 * 1024 * 1024 }) => {
  const [fileList, setFileList] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [pausedUploads, setPausedUploads] = useState(new Set());
  const abortControllers = useRef({});

  // File type validation
  const validateFileType = (file) => {
    const allowedTypes = {
      image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'],
      video: ['video/mp4', 'video/avi', 'video/quicktime', 'video/webm'],
      audio: ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/aac'],
      document: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain'
      ]
    };

    const allAllowedTypes = Object.values(allowedTypes).flat();
    return allAllowedTypes.includes(file.type);
  };

  // Generate file preview
  const generatePreview = (file) => {
    return new Promise((resolve) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      } else {
        resolve(null);
      }
    });
  };

  // Handle file selection
  const handleBeforeUpload = async (file) => {
    // Validate file type
    if (!validateFileType(file)) {
      message.error(`${file.name} is not a supported file type`);
      return Upload.LIST_IGNORE;
    }

    // Validate file size
    if (file.size > maxFileSize) {
      message.error(`${file.name} exceeds maximum file size of ${Math.round(maxFileSize / (1024 * 1024))}MB`);
      return Upload.LIST_IGNORE;
    }

    // Generate preview for images
    const preview = await generatePreview(file);
    
    // Add file to list with metadata
    const fileWithMeta = {
      uid: file.uid,
      name: file.name,
      size: file.size,
      type: file.type,
      originFileObj: file,
      status: 'ready',
      preview: preview,
      progress: 0
    };

    setFileList(prev => [...prev, fileWithMeta]);
    return false; // Prevent automatic upload
  };

  // Upload single file with progress tracking and resume capability
  const uploadFile = async (fileItem, resumeFrom = 0) => {
    const formData = new FormData();
    formData.append('file', fileItem.originFileObj);
    if (groupId) formData.append('groupId', groupId);

    // Create abort controller for this upload
    const controller = new AbortController();
    abortControllers.current[fileItem.uid] = controller;

    try {
      const response = await api.post('/files/upload', formData, {
        signal: controller.signal,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            ((resumeFrom + progressEvent.loaded) * 100) / fileItem.size
          );
          
          setUploadProgress(prev => ({
            ...prev,
            [fileItem.uid]: percentCompleted
          }));

          // Update file list with progress
          setFileList(prev => prev.map(f => 
            f.uid === fileItem.uid 
              ? { ...f, progress: percentCompleted, status: 'uploading' }
              : f
          ));
        }
      });

      // Upload successful
      setFileList(prev => prev.map(f => 
        f.uid === fileItem.uid 
          ? { 
              ...f, 
              status: 'done', 
              progress: 100,
              response: response.data 
            }
          : f
      ));

      delete abortControllers.current[fileItem.uid];
      return response.data;

    } catch (error) {
      if (error.name === 'CanceledError') {
        // Upload was paused/cancelled
        setFileList(prev => prev.map(f => 
          f.uid === fileItem.uid 
            ? { ...f, status: 'paused' }
            : f
        ));
      } else {
        // Upload failed
        console.error('Upload error:', error);
        setFileList(prev => prev.map(f => 
          f.uid === fileItem.uid 
            ? { 
                ...f, 
                status: 'error',
                error: error.response?.data?.error || 'Upload failed'
              }
            : f
        ));
        message.error(`Failed to upload ${fileItem.name}`);
      }
      
      delete abortControllers.current[fileItem.uid];
      throw error;
    }
  };

  // Handle upload all files
  const handleUploadAll = async () => {
    const filesToUpload = fileList.filter(f => f.status === 'ready' || f.status === 'error');
    
    if (filesToUpload.length === 0) {
      message.warning('No files to upload');
      return;
    }

    setUploading(true);

    try {
      const uploadPromises = filesToUpload.map(file => uploadFile(file));
      const results = await Promise.allSettled(uploadPromises);
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      if (successful > 0) {
        message.success(`Successfully uploaded ${successful} file(s)`);
        if (onUploadComplete) {
          onUploadComplete(results.filter(r => r.status === 'fulfilled').map(r => r.value));
        }
      }

      if (failed > 0) {
        message.error(`Failed to upload ${failed} file(s)`);
      }

    } catch (error) {
      console.error('Upload error:', error);
      message.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Pause upload
  const handlePauseUpload = (fileUid) => {
    if (abortControllers.current[fileUid]) {
      abortControllers.current[fileUid].abort();
      setPausedUploads(prev => new Set([...prev, fileUid]));
    }
  };

  // Resume upload
  const handleResumeUpload = async (fileItem) => {
    setPausedUploads(prev => {
      const newSet = new Set(prev);
      newSet.delete(fileItem.uid);
      return newSet;
    });

    const currentProgress = uploadProgress[fileItem.uid] || 0;
    const resumeFrom = Math.floor((currentProgress / 100) * fileItem.size);
    
    try {
      await uploadFile(fileItem, resumeFrom);
    } catch (error) {
      console.error('Resume upload error:', error);
    }
  };

  // Remove file from list
  const handleRemoveFile = (fileUid) => {
    // Cancel upload if in progress
    if (abortControllers.current[fileUid]) {
      abortControllers.current[fileUid].abort();
      delete abortControllers.current[fileUid];
    }

    setFileList(prev => prev.filter(f => f.uid !== fileUid));
    setUploadProgress(prev => {
      const newProgress = { ...prev };
      delete newProgress[fileUid];
      return newProgress;
    });
  };

  // Clear completed uploads
  const handleClearCompleted = () => {
    setFileList(prev => prev.filter(f => f.status !== 'done'));
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Get status icon
  const getStatusIcon = (file) => {
    switch (file.status) {
      case 'done':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'error':
        return <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />;
      case 'uploading':
        return <Progress type="circle" percent={file.progress} width={20} />;
      case 'paused':
        return <PauseCircleOutlined style={{ color: '#faad14' }} />;
      default:
        return <FileOutlined />;
    }
  };

  return (
    <div className="file-uploader">
      <Dragger
        multiple
        beforeUpload={handleBeforeUpload}
        showUploadList={false}
        disabled={uploading}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">Click or drag files to this area to upload</p>
        <p className="ant-upload-hint">
          Support for images, videos, audio, and documents. Maximum file size: {Math.round(maxFileSize / (1024 * 1024))}MB
        </p>
      </Dragger>

      {fileList.length > 0 && (
        <div className="file-list">
          <div className="file-list-header">
            <h4>Files to Upload ({fileList.length})</h4>
            <Space>
              <Button 
                type="primary" 
                onClick={handleUploadAll}
                loading={uploading}
                disabled={fileList.every(f => f.status === 'done')}
              >
                Upload All
              </Button>
              <Button onClick={handleClearCompleted}>
                Clear Completed
              </Button>
            </Space>
          </div>

          <div className="file-items">
            {fileList.map(file => (
              <div key={file.uid} className={`file-item file-item-${file.status}`}>
                <div className="file-preview">
                  {file.preview ? (
                    <img src={file.preview} alt={file.name} />
                  ) : (
                    <FileOutlined style={{ fontSize: 32 }} />
                  )}
                </div>

                <div className="file-info">
                  <div className="file-name">{file.name}</div>
                  <div className="file-meta">
                    <span>{formatFileSize(file.size)}</span>
                    {file.status === 'uploading' && (
                      <span> • {file.progress}%</span>
                    )}
                    {file.status === 'error' && file.error && (
                      <span className="file-error"> • {file.error}</span>
                    )}
                  </div>
                  
                  {file.status === 'uploading' && (
                    <Progress 
                      percent={file.progress} 
                      size="small" 
                      status="active"
                    />
                  )}
                </div>

                <div className="file-actions">
                  <Space>
                    {getStatusIcon(file)}
                    
                    {file.status === 'uploading' && (
                      <Button
                        type="text"
                        icon={<PauseCircleOutlined />}
                        onClick={() => handlePauseUpload(file.uid)}
                        title="Pause upload"
                      />
                    )}
                    
                    {file.status === 'paused' && (
                      <Button
                        type="text"
                        icon={<PlayCircleOutlined />}
                        onClick={() => handleResumeUpload(file)}
                        title="Resume upload"
                      />
                    )}
                    
                    {file.status !== 'uploading' && (
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleRemoveFile(file.uid)}
                        title="Remove file"
                      />
                    )}
                  </Space>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUploader;
