import React, { useState } from 'react';
import { Tabs, Card } from 'antd';
import { 
  CloudUploadOutlined, 
  FolderOpenOutlined, 
  DashboardOutlined 
} from '@ant-design/icons';
import FileUploader from './FileUploader';
import FileBrowser from './FileBrowser';
import MediaProcessingStatus from './MediaProcessingStatus';
import './FileManagement.css';

const { TabPane } = Tabs;

const FileManagement = ({ groupId }) => {
  const [activeTab, setActiveTab] = useState('browser');
  const [selectedFileId, setSelectedFileId] = useState(null);

  const handleUploadComplete = (uploadedFiles) => {
    // Switch to browser tab after successful upload
    setActiveTab('browser');
    
    // If single file uploaded, show its processing status
    if (uploadedFiles.length === 1) {
      setSelectedFileId(uploadedFiles[0].file.id);
    }
  };

  return (
    <div className="file-management">
      <Card className="file-management-card">
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          size="large"
        >
          <TabPane
            tab={
              <span>
                <FolderOpenOutlined />
                File Browser
              </span>
            }
            key="browser"
          >
            <FileBrowser groupId={groupId} />
          </TabPane>

          <TabPane
            tab={
              <span>
                <CloudUploadOutlined />
                Upload Files
              </span>
            }
            key="upload"
          >
            <FileUploader 
              groupId={groupId} 
              onUploadComplete={handleUploadComplete}
            />
          </TabPane>

          <TabPane
            tab={
              <span>
                <DashboardOutlined />
                Storage & Processing
              </span>
            }
            key="status"
          >
            <MediaProcessingStatus 
              fileId={selectedFileId} 
              groupId={groupId}
            />
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default FileManagement;
