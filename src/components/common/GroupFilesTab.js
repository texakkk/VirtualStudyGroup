import React, { useState, useEffect } from 'react';
import api from '../../api';
import './GroupFilesTab.css';

const GroupFilesTab = ({ groupId }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [stats, setStats] = useState(null);

  // Fetch group files
  const fetchGroupFiles = async (type = 'all') => {
    if (!groupId) return;
    
    setLoading(true);
    try {
      const params = type !== 'all' ? `?type=${type}` : '';
      // Ensure groupId is a string
      const groupIdStr = typeof groupId === 'object' ? groupId.toString() : groupId;
      const response = await api.get(`/message/files/group/${groupIdStr}${params}`);
      setFiles(response.data.files);
    } catch (error) {
      console.error('Error fetching group files:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch file statistics
  const fetchFileStats = async () => {
    if (!groupId) return;
    
    try {
      // Ensure groupId is a string
      const groupIdStr = typeof groupId === 'object' ? groupId.toString() : groupId;
      const response = await api.get(`/message/files/stats/${groupIdStr}`);
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching file stats:', error);
    }
  };

  useEffect(() => {
    fetchGroupFiles(filter);
    fetchFileStats();
  }, [groupId, filter]);

  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
    fetchGroupFiles(newFilter);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (type) => {
    switch (type) {
      case 'image': return '🖼️';
      case 'video': return '🎥';
      case 'audio': return '🎵';
      case 'document': return '📄';
      default: return '📎';
    }
  };

  return (
    <div className="group-files-tab">
      <div className="files-header">
        <h3>Group Files</h3>
        
        {/* File Statistics */}
        {stats && (
          <div className="file-stats">
            <span>Total: {stats.total.totalFiles} files</span>
            <span>Size: {formatFileSize(stats.total.totalSize)}</span>
          </div>
        )}
      </div>

      {/* Filter Buttons */}
      <div className="file-filters">
        {['all', 'image', 'document', 'video', 'audio', 'other'].map(type => (
          <button
            key={type}
            className={`filter-btn ${filter === type ? 'active' : ''}`}
            onClick={() => handleFilterChange(type)}
          >
            {type === 'all' ? '📁 All' : `${getFileIcon(type)} ${type}`}
          </button>
        ))}
      </div>

      {/* Files Grid */}
      <div className="files-grid">
        {loading ? (
          <div className="loading">Loading files...</div>
        ) : files.length === 0 ? (
          <div className="no-files">No files found</div>
        ) : (
          files.map(file => (
            <div key={file._id} className="file-card">
              <div className="file-icon">
                {getFileIcon(file.File_type)}
              </div>
              
              <div className="file-info">
                <div className="file-name" title={file.File_originalName}>
                  {file.File_originalName}
                </div>
                
                <div className="file-meta">
                  <span className="file-size">
                    {file.File_sizeFormatted || formatFileSize(file.File_size)}
                  </span>
                  <span className="file-uploader">
                    by {file.File_uploadedBy?.User_name || 'Unknown'}
                  </span>
                </div>
                
                <div className="file-date">
                  {new Date(file.File_createdAt).toLocaleDateString()}
                </div>
              </div>
              
              <div className="file-actions">
                <a 
                  href={file.File_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="download-btn"
                >
                  📥 Download
                </a>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default GroupFilesTab;