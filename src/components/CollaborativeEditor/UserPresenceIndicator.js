import React from 'react';
import { Avatar, Tooltip } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import './UserPresenceIndicator.css';

const UserPresenceIndicator = ({ activeUsers = [] }) => {
  const colors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2'];

  const getUserColor = (index) => colors[index % colors.length];

  const getUserInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  if (activeUsers.length === 0) {
    return null;
  }

  return (
    <div className="user-presence-indicator">
      <Avatar.Group maxCount={5} maxStyle={{ color: '#f56a00', backgroundColor: '#fde3cf' }}>
        {activeUsers.map((user, index) => (
          <Tooltip key={user.userId} title={user.userName}>
            <Avatar
              style={{ backgroundColor: getUserColor(index) }}
              icon={<UserOutlined />}
            >
              {getUserInitials(user.userName)}
            </Avatar>
          </Tooltip>
        ))}
      </Avatar.Group>
      <span className="user-count-text">
        {activeUsers.length} {activeUsers.length === 1 ? 'user' : 'users'} editing
      </span>
    </div>
  );
};

export default UserPresenceIndicator;
