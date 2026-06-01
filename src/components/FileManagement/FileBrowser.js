import React, { useState, useEffect } from 'react';
import { 
  Table, 
  Input, 
  Select, 
  Button, 
  Space, 
  Tag, 
  Modal, 
  Form,
  Dropdown,
  message,
  Breadcrumb,
  Empty
} from 'antd';
import {
  FolderOutlined,
  FileOutlined,
  SearchOutlined,
  FilterOutlined,
  ShareAltOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  TagsOutlined,
  FolderAddOutlined,
  MoreOutlined
} from '@ant-design/icons';
import api from '../../api';
import './FileBrowser.css';

const { Search } = Input;
const { Option } = Select;

const FileBrowser = ({ groupId }) => {
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterTags, setFilterTags] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [folderModalVisible, setFolderModalVisible] = useState(false);
  const [tagModalVisible, setTagModalVisible] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [allTags, setAllTags] = useState([]);
  const [form] = Form.useForm();

  // Fetch files and folders
  const fetchFiles = async () => {
    if (!groupId) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (currentFolder) params.append('folderId', currentFolder);
      if (filterType !== 'all') params.append('type', filterType);
      if (searchQuery) params.append('search', searchQuery);
      if (filterTags.length > 0) params.append('tags', filterTags.join(','));

      const response = await api.get(`/message/files/group/${groupId}?${params.toString()}`);
      setFiles(response.data.files || []);
      
      // Extract unique tags
      const tags = new Set();
      response.data.files?.forEach(file => {
        file.File_tags?.forEach(tag => tags.add(tag));
      });
      setAllTags(Array.from(tags));
    } catch (error) {
      console.error('Error fetching files:', error);
      message.error('Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [groupId, currentFolder, filterType, filterTags]);

  // Handle search
  const handleSearch = (value) => {
    setSearchQuery(value);
    fetchFiles();
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Get file icon
  const getFileIcon = (type) => {
    const icons = {
      image: '🖼️',
      video: '🎥',
      audio: '🎵',
      document: '📄',
      folder: '📁'
    };
    return icons[type] || '📎';
  };

  // Handle file download
  const handleDownload = async (file) => {
    try {
      const response = await api.get(`/files/${file._id}/download`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.File_originalName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      message.success('File downloaded successfully');
    } catch (error) {
      console.error('Download error:', error);
      message.error('Failed to download file');
    }
  };

  // Handle file delete
  const handleDelete = async (fileId) => {
    Modal.confirm({
      title: 'Delete File',
      content: 'Are you sure you want to delete this file? This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        try {
          await api.delete(`/files/${fileId}`);
          message.success('File deleted successfully');
          fetchFiles();
        } catch (error) {
          console.error('Delete error:', error);
          message.error('Failed to delete file');
        }
      }
    });
  };

  // Handle share file
  const handleShare = (file) => {
    setSelectedFile(file);
    setShareModalVisible(true);
  };

  // Handle add tags
  const handleAddTags = (file) => {
    setSelectedFile(file);
    form.setFieldsValue({ tags: file.File_tags || [] });
    setTagModalVisible(true);
  };

  // Submit tags
  const handleTagSubmit = async (values) => {
    try {
      await api.put(`/files/${selectedFile._id}/tags`, {
        tags: values.tags
      });
      message.success('Tags updated successfully');
      setTagModalVisible(false);
      fetchFiles();
    } catch (error) {
      console.error('Tag update error:', error);
      message.error('Failed to update tags');
    }
  };

  // Table columns
  const columns = [
    {
      title: 'Name',
      dataIndex: 'File_originalName',
      key: 'name',
      render: (text, record) => (
        <Space>
          <span style={{ fontSize: 20 }}>{getFileIcon(record.File_type)}</span>
          <span>{text}</span>
        </Space>
      ),
      sorter: (a, b) => a.File_originalName.localeCompare(b.File_originalName)
    },
    {
      title: 'Type',
      dataIndex: 'File_type',
      key: 'type',
      render: (type) => <Tag color="blue">{type}</Tag>,
      filters: [
        { text: 'Image', value: 'image' },
        { text: 'Video', value: 'video' },
        { text: 'Audio', value: 'audio' },
        { text: 'Document', value: 'document' },
        { text: 'Other', value: 'other' }
      ],
      onFilter: (value, record) => record.File_type === value
    },
    {
      title: 'Size',
      dataIndex: 'File_size',
      key: 'size',
      render: (size) => formatFileSize(size),
      sorter: (a, b) => a.File_size - b.File_size
    },
    {
      title: 'Tags',
      dataIndex: 'File_tags',
      key: 'tags',
      render: (tags) => (
        <>
          {tags?.slice(0, 3).map(tag => (
            <Tag key={tag} color="green">{tag}</Tag>
          ))}
          {tags?.length > 3 && <Tag>+{tags.length - 3}</Tag>}
        </>
      )
    },
    {
      title: 'Uploaded By',
      dataIndex: 'File_uploadedBy',
      key: 'uploader',
      render: (uploader) => uploader?.User_name || 'Unknown'
    },
    {
      title: 'Date',
      dataIndex: 'File_createdAt',
      key: 'date',
      render: (date) => new Date(date).toLocaleDateString(),
      sorter: (a, b) => new Date(a.File_createdAt) - new Date(b.File_createdAt)
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => {
        const items = [
          {
            key: 'download',
            icon: <DownloadOutlined />,
            label: 'Download',
            onClick: () => handleDownload(record)
          },
          {
            key: 'tags',
            icon: <TagsOutlined />,
            label: 'Manage Tags',
            onClick: () => handleAddTags(record)
          },
          {
            key: 'share',
            icon: <ShareAltOutlined />,
            label: 'Share',
            onClick: () => handleShare(record)
          },
          {
            key: 'delete',
            icon: <DeleteOutlined />,
            label: 'Delete',
            danger: true,
            onClick: () => handleDelete(record._id)
          }
        ];

        return (
          <Dropdown menu={{ items }} trigger={['click']}>
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        );
      }
    }
  ];

  return (
    <div className="file-browser">
      <div className="file-browser-header">
        <h3>File Manager</h3>
        
        <div className="file-browser-controls">
          <Search
            placeholder="Search files..."
            allowClear
            onSearch={handleSearch}
            style={{ width: 300 }}
            prefix={<SearchOutlined />}
          />
          
          <Select
            value={filterType}
            onChange={setFilterType}
            style={{ width: 150 }}
            suffixIcon={<FilterOutlined />}
          >
            <Option value="all">All Types</Option>
            <Option value="image">Images</Option>
            <Option value="video">Videos</Option>
            <Option value="audio">Audio</Option>
            <Option value="document">Documents</Option>
            <Option value="other">Other</Option>
          </Select>

          {allTags.length > 0 && (
            <Select
              mode="multiple"
              placeholder="Filter by tags"
              value={filterTags}
              onChange={setFilterTags}
              style={{ minWidth: 200 }}
              maxTagCount={2}
            >
              {allTags.map(tag => (
                <Option key={tag} value={tag}>{tag}</Option>
              ))}
            </Select>
          )}
        </div>
      </div>

      <Table
        columns={columns}
        dataSource={files}
        loading={loading}
        rowKey="_id"
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showTotal: (total) => `Total ${total} files`
        }}
        locale={{
          emptyText: (
            <Empty
              description="No files found"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )
        }}
      />

      {/* Tag Management Modal */}
      <Modal
        title="Manage Tags"
        open={tagModalVisible}
        onCancel={() => setTagModalVisible(false)}
        footer={null}
      >
        <Form form={form} onFinish={handleTagSubmit} layout="vertical">
          <Form.Item
            name="tags"
            label="Tags"
            rules={[{ required: true, message: 'Please add at least one tag' }]}
          >
            <Select
              mode="tags"
              placeholder="Add tags"
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                Save Tags
              </Button>
              <Button onClick={() => setTagModalVisible(false)}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Share Modal */}
      <Modal
        title="Share File"
        open={shareModalVisible}
        onCancel={() => setShareModalVisible(false)}
        footer={null}
      >
        <div className="share-modal-content">
          <p>Share this file with group members or generate a shareable link.</p>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Button type="primary" block>
              Copy Shareable Link
            </Button>
            <Button block>
              Share with Group Members
            </Button>
          </Space>
        </div>
      </Modal>
    </div>
  );
};

export default FileBrowser;
