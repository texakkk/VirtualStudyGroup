import React, { useState, useEffect } from 'react';
import { Modal, Select, Button, List, message, Tag } from 'antd';
import { UserAddOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';

const WhiteboardPermissions = ({ whiteboardId, visible, onClose }) => {
  const [users, setUsers] = useState([]);
  const [permissions, setPermissions] = useState({ read: [], write: [], admin: [] });
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedPermission, setSelectedPermission] = useState('read');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      fetchPermissions();
      fetchUsers();
    }
  }, [visible, whiteboardId]);

  const fetchPermissions = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000'}/api/whiteboard/${whiteboardId}/permissions`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPermissions(response.data.permissions || { read: [], write: [], admin: [] });
    } catch (error) {
      message.error('Failed to fetch permissions');
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

  const handleAddPermission = async () => {
    if (!selectedUser) {
      message.warning('Please select a user');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000'}/api/whiteboard/${whiteboardId}/permissions`,
        { userId: selectedUser, permissionType: selectedPermission },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success('Permission added successfully');
      fetchPermissions();
      setSelectedUser(null);
    } catch (error) {
      message.error('Failed to add permission');
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePermission = async (userId, permissionType) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.delete(
        `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000'}/api/whiteboard/${whiteboardId}/permissions`,
        {
          headers: { Authorization: `Bearer ${token}` },
          data: { userId, permissionType }
        }
      );
      message.success('Permission removed successfully');
      fetchPermissions();
    } catch (error) {
      message.error('Failed to remove permission');
    } finally {
      setLoading(false);
    }
  };

  const getUserName = (userId) => {
    const user = users.find(u => u._id === userId);
    return user?.User_name || 'Unknown User';
  };

  const allPermissionUsers = [
    ...permissions.read.map(id => ({ id, type: 'read' })),
    ...permissions.write.map(id => ({ id, type: 'write' })),
    ...permissions.admin.map(id => ({ id, type: 'admin' }))
  ];

  return (
    <Modal
      title="Whiteboard Permissions"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={600}
    >
      <div style={{ marginBottom: 24 }}>
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
            onClick={handleAddPermission}
            loading={loading}
          >
            Add
          </Button>
        </div>

        <List
          dataSource={allPermissionUsers}
          renderItem={item => (
            <List.Item
              actions={[
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemovePermission(item.id, item.type)}
                  loading={loading}
                />
              ]}
            >
              <List.Item.Meta
                title={getUserName(item.id)}
                description={
                  <Tag color={
                    item.type === 'admin' ? 'red' :
                    item.type === 'write' ? 'blue' : 'green'
                  }>
                    {item.type.toUpperCase()}
                  </Tag>
                }
              />
            </List.Item>
          )}
        />
      </div>
    </Modal>
  );
};

export default WhiteboardPermissions;
