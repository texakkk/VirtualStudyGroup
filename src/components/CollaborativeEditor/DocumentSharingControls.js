import React, { useState, useEffect } from 'react';
import { Modal, Select, Button, List, message, Tag, Switch } from 'antd';
import { UserAddOutlined, DeleteOutlined, LinkOutlined } from '@ant-design/icons';
import axios from 'axios';
import './DocumentSharingControls.css';

const DocumentSharingControls = ({ documentId, visible, onClose }) => {
  const [users, setUsers] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedPermission, setSelectedPermission] = useState('read');
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      fetchDocumentInfo();
      fetchUsers();
    }
  }, [visible, documentId]);

  const fetchDocumentInfo = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000'}/api/notes/${documentId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCollaborators(response.data.Note_collaborators || []);
      setIsPublic(response.data.Note_isPublic || false);
    } catch (error) {
      message.error('Failed to fetch document info');
    }
  };

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000'}/api/users`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUsers(response.data.users || []);
    } catch (error) {
      console.error('Failed to fetch users');
    }
  };

  const handleAddCollaborator = async () => {
    if (!selectedUser) {
      message.warning('Please select a user');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000'}/api/notes/${documentId}/share`,
        { userId: selectedUser, permission: selectedPermission },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success('Collaborator added successfully');
      fetchDocumentInfo();
      setSelectedUser(null);
    } catch (error) {
      message.error('Failed to add collaborator');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveCollaborator = async (userId) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.delete(
        `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000'}/api/notes/${documentId}/share/${userId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success('Collaborator removed successfully');
      fetchDocumentInfo();
    } catch (error) {
      message.error('Failed to remove collaborator');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePublic = async (checked) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000'}/api/notes/${documentId}`,
        { Note_isPublic: checked },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setIsPublic(checked);
      message.success(`Document is now ${checked ? 'public' : 'private'}`);
    } catch (error) {
      message.error('Failed to update document visibility');
    } finally {
      setLoading(false);
    }
  };

  const getUserName = (userId) => {
    const user = users.find(u => u._id === userId);
    return user?.User_name || 'Unknown User';
  };

  return (
    <Modal
      title="Document Sharing & Collaboration"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={600}
    >
      <div className="document-sharing-controls">
        <div className="public-toggle">
          <span>Make document public</span>
          <Switch
            checked={isPublic}
            onChange={handleTogglePublic}
            loading={loading}
          />
        </div>

        <div className="add-collaborator-section">
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <Select
              style={{ flex: 1 }}
              placeholder="Select user"
              value={selectedUser}
              onChange={setSelectedUser}
              showSearch
              filterOption={(input, option) =>
                option.children.toLowerCase().includes(input.toLowerCase())
              }
            >
              {users.map(user => (
                <Select.Option key={user._id} value={user._id}>
                  {user.User_name}
                </Select.Option>
              ))}
            </Select>

            <Select
              style={{ width: 120 }}
              value={selectedPermission}
              onChange={setSelectedPermission}
            >
              <Select.Option value="read">Read</Select.Option>
              <Select.Option value="write">Write</Select.Option>
              <Select.Option value="admin">Admin</Select.Option>
            </Select>

            <Button
              type="primary"
              icon={<UserAddOutlined />}
              onClick={handleAddCollaborator}
              loading={loading}
            >
              Add
            </Button>
          </div>
        </div>

        <div className="collaborators-list">
          <h4>Collaborators</h4>
          <List
            dataSource={collaborators}
            renderItem={userId => (
              <List.Item
                actions={[
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleRemoveCollaborator(userId)}
                    loading={loading}
                  />
                ]}
              >
                <List.Item.Meta
                  title={getUserName(userId)}
                  description={<Tag color="blue">COLLABORATOR</Tag>}
                />
              </List.Item>
            )}
          />
        </div>
      </div>
    </Modal>
  );
};

export default DocumentSharingControls;
