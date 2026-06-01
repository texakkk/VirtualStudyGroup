import React, { useState } from 'react';
import { Card, Button, Space, Alert, Divider } from 'antd';
import { FileManagement } from './index';

/**
 * Demo component for File Management System
 * Showcases all features of the file management components
 */
const FileManagementDemo = () => {
  const [groupId, setGroupId] = useState('demo-group-123');
  const [showDemo, setShowDemo] = useState(true);

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <Card>
        <h1>File Management System Demo</h1>
        <p>
          This demo showcases the comprehensive file and media management system
          with drag-and-drop uploads, file organization, and processing feedback.
        </p>

        <Alert
          message="Demo Mode"
          description={
            <div>
              <p><strong>Features demonstrated:</strong></p>
              <ul>
                <li>✓ Drag-and-drop file upload with progress indicators</li>
                <li>✓ File type validation and preview generation</li>
                <li>✓ Resumable upload functionality for large files</li>
                <li>✓ File browser with search and filtering</li>
                <li>✓ Tag management and organization</li>
                <li>✓ File sharing and permission management</li>
                <li>✓ Processing status indicators</li>
                <li>✓ Storage usage monitoring</li>
                <li>✓ Automatic optimization feedback</li>
              </ul>
              <p><strong>Group ID:</strong> {groupId}</p>
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />

        <Space style={{ marginBottom: 24 }}>
          <Button 
            type="primary" 
            onClick={() => setShowDemo(!showDemo)}
          >
            {showDemo ? 'Hide' : 'Show'} File Management
          </Button>
          <Button onClick={() => setGroupId(`demo-group-${Date.now()}`)}>
            Change Group
          </Button>
        </Space>

        <Divider />

        {showDemo && (
          <div style={{ marginTop: 24 }}>
            <FileManagement groupId={groupId} />
          </div>
        )}

        <Divider />

        <div style={{ marginTop: 24 }}>
          <h3>Testing Instructions</h3>
          <ol>
            <li>
              <strong>Upload Tab:</strong>
              <ul>
                <li>Drag and drop files or click to select</li>
                <li>Upload multiple files at once</li>
                <li>Watch real-time progress indicators</li>
                <li>Test pause/resume functionality</li>
                <li>Try uploading different file types</li>
              </ul>
            </li>
            <li>
              <strong>File Browser Tab:</strong>
              <ul>
                <li>Search for files by name</li>
                <li>Filter by file type</li>
                <li>Filter by tags</li>
                <li>Manage file tags</li>
                <li>Download files</li>
                <li>Delete files (with confirmation)</li>
              </ul>
            </li>
            <li>
              <strong>Storage & Processing Tab:</strong>
              <ul>
                <li>View processing status for uploaded files</li>
                <li>Monitor storage usage</li>
                <li>Check storage breakdown by type</li>
                <li>Adjust optimization settings</li>
                <li>View security scan results</li>
              </ul>
            </li>
          </ol>

          <h3>Requirements Validation</h3>
          <ul>
            <li>✓ <strong>Requirement 8.1:</strong> Supports multiple file formats (PDF, Word, images, videos)</li>
            <li>✓ <strong>Requirement 8.2:</strong> Large files upload with progress indicators and resume capability</li>
            <li>✓ <strong>Requirement 8.3:</strong> Media automatically optimized with feedback</li>
            <li>✓ <strong>Requirement 8.4:</strong> Storage limits trigger warnings and management options</li>
            <li>✓ <strong>Requirement 8.5:</strong> Corrupted files detected and handled gracefully</li>
            <li>✓ <strong>Requirement 8.6:</strong> Users can create folders and tag files</li>
          </ul>
        </div>
      </Card>
    </div>
  );
};

export default FileManagementDemo;
