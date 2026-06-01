import React, { useCallback, useEffect, useState } from 'react';
import { 
  FaBell, 
  FaCheck, 
  FaTrash, 
  FaComment, 
  FaTasks, 
  FaUsers, 
  FaVideo, 
  FaAt,
  FaCheckDouble
} from 'react-icons/fa';
import { useNotification } from '../../contexts/NotificationContext';
import './NotificationCenter.css';

const NotificationCenter = () => {
  const {
    notifications,
    unreadCount,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification
  } = useNotification();

  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all'); // all, unread, message, task, group, video
  const [page, setPage] = useState(1);

  const loadNotifications = useCallback(async (resetPage = true, activeFilter = filter) => {
    setLoading(true);
    try {
      const currentPage = resetPage ? 1 : page;
      const unreadOnly = activeFilter === 'unread';
      await fetchNotifications(currentPage, unreadOnly);
      if (resetPage) setPage(1);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [fetchNotifications, filter, page]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
    setPage(1);
  };

  const handleMarkAsRead = async (notificationId, event) => {
    event.stopPropagation();
    await markAsRead(notificationId);
  };

  const handleDelete = async (notificationId, event) => {
    event.stopPropagation();
    if (window.confirm('Are you sure you want to delete this notification?')) {
      await deleteNotification(notificationId);
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'message':
        return <FaComment className="notification-icon message" />;
      case 'task':
        return <FaTasks className="notification-icon task" />;
      case 'group':
        return <FaUsers className="notification-icon group" />;
      case 'video':
        return <FaVideo className="notification-icon video" />;
      case 'mention':
        return <FaAt className="notification-icon mention" />;
      default:
        return <FaBell className="notification-icon default" />;
    }
  };

  const formatTimeAgo = (date) => {
    if (!date) return '';
    const now = new Date();
    const notificationDate = new Date(date);
    if (isNaN(notificationDate.getTime())) return '';
    const diffInMinutes = Math.floor((now - notificationDate) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    if (diffInMinutes < 10080) return `${Math.floor(diffInMinutes / 1440)}d ago`;
    return notificationDate.toLocaleDateString();
  };

  // Normalise a notification object so both old (createdAt) and new
  // (Notification_createdAt) field names work correctly.
  const firstText = (...values) =>
    values.find((value) => typeof value === 'string' && value.trim())?.trim();

  const getShortId = (value) => {
    if (!value) return '';
    const id = typeof value === 'object' && value._id ? value._id : value;
    return id.toString().slice(-6);
  };

  const getDerivedTitle = (notification, type, message) => {
    const groupName = notification.Notification_groupId?.Group_name || notification.groupName || notification.group?.Group_name;
    const referenceModel = notification.Notification_referenceModel || notification.referenceModel;

    switch (type) {
      case 'message':
        return groupName ? `New message in ${groupName}` : 'New message';
      case 'task':
        return 'Task notification';
      case 'group':
        return groupName ? `Group update: ${groupName}` : 'Group update';
      case 'video':
        return groupName ? `Video call in ${groupName}` : 'Video call';
      case 'mention':
        return groupName ? `You were mentioned in ${groupName}` : 'You were mentioned';
      case 'reminder':
        return 'Reminder';
      case 'insight':
        return 'Study insight';
      case 'summary':
        return 'Study summary';
      default:
        if (message) return message.slice(0, 60);
        if (referenceModel) return `${referenceModel} notification`;
        return 'Notification update';
    }
  };

  const getDerivedMessage = (notification, type) => {
    const fromName = notification.Notification_fromUserId?.User_name || notification.fromUserName;
    const groupName = notification.Notification_groupId?.Group_name || notification.groupName || notification.group?.Group_name;
    const referenceModel = notification.Notification_referenceModel || notification.referenceModel;
    const referenceId = notification.Notification_referenceId || notification.referenceId;
    const receivedAt = notification.Notification_createdAt || notification.createdAt;

    if (fromName && groupName) return `${fromName} in ${groupName}`;
    if (fromName) return `From ${fromName}`;
    if (groupName) return `In ${groupName}`;
    if (referenceModel) return `Related to ${referenceModel}${getShortId(referenceId) ? ` #${getShortId(referenceId)}` : ''}`;
    if (receivedAt) return `Received ${formatTimeAgo(receivedAt)}`;
    return type === 'other'
      ? `Details unavailable${getShortId(notification._id) ? ` (#${getShortId(notification._id)})` : ''}`
      : `${type.charAt(0).toUpperCase()}${type.slice(1)} notification`;
  };

  const normalise = (n) => {
    const type = n.Notification_type || n.type || 'other';
    const message = firstText(n.Notification_message, n.Notification_Message, n.message, n.body, n.content) || '';
    const title = firstText(n.Notification_title, n.Notification_Title, n.notificationTitle, n.title, n.subject);
    const normalized = {
      ...n,
      _id:                         n._id                         || n.id || n.Notification_id || null,
      Notification_referenceId:    n.Notification_referenceId    || n.referenceId || null,
      Notification_referenceModel: n.Notification_referenceModel || n.referenceModel || null,
      Notification_type:           type,
      Notification_read:           n.Notification_read           ?? n.read      ?? false,
      Notification_priority:       n.Notification_priority       || n.priority  || 'medium',
      Notification_createdAt:      n.Notification_createdAt      || n.createdAt || null,
    };

    return {
      ...normalized,
      Notification_title:   title || getDerivedTitle(normalized, type, message),
      Notification_message: message || getDerivedMessage(normalized, type),
    };
  };

  const getNotificationKey = (notification, index) => {
    if (notification._id) return notification._id;

    return [
      notification.Notification_type,
      notification.Notification_title,
      notification.Notification_createdAt,
      index,
    ].join('-');
  };

  const filteredNotifications = notifications.map(normalise).filter(notification => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !notification.Notification_read;
    return notification.Notification_type === filter;
  });

  return (
    <div className="notification-center">
      <div className="notification-header">
        <div className="notification-title">
          <FaBell className="header-icon" />
          <h2>Notifications</h2>
          {unreadCount > 0 && (
            <span className="unread-badge">{unreadCount}</span>
          )}
        </div>
        
        <div className="notification-actions">
          {unreadCount > 0 && (
            <button 
              className="mark-all-read-btn"
              onClick={markAllAsRead}
              title="Mark all as read"
            >
              <FaCheckDouble />
              Mark all read
            </button>
          )}
        </div>
      </div>

      <div className="notification-filters">
        <button 
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => handleFilterChange('all')}
        >
          All
        </button>
        <button 
          className={`filter-btn ${filter === 'unread' ? 'active' : ''}`}
          onClick={() => handleFilterChange('unread')}
        >
          Unread ({unreadCount})
        </button>
        <button 
          className={`filter-btn ${filter === 'message' ? 'active' : ''}`}
          onClick={() => handleFilterChange('message')}
        >
          <FaComment /> Messages
        </button>
        <button 
          className={`filter-btn ${filter === 'task' ? 'active' : ''}`}
          onClick={() => handleFilterChange('task')}
        >
          <FaTasks /> Tasks
        </button>
        <button 
          className={`filter-btn ${filter === 'group' ? 'active' : ''}`}
          onClick={() => handleFilterChange('group')}
        >
          <FaUsers /> Groups
        </button>
        <button 
          className={`filter-btn ${filter === 'video' ? 'active' : ''}`}
          onClick={() => handleFilterChange('video')}
        >
          <FaVideo /> Video
        </button>
      </div>

      <div className="notification-list">
        {loading ? (
          <div className="notification-loading">
            <div className="loading-spinner"></div>
            <p>Loading notifications...</p>
          </div>
        ) : filteredNotifications.length > 0 ? (
          filteredNotifications.map((notification, index) => {
            return (
            <div 
              key={getNotificationKey(notification, index)} 
              className={`notification-item ${!notification.Notification_read ? 'unread' : ''} ${notification.Notification_priority}`}
            >
              <div className="notification-content">
                <div className="notification-main">
                  {getNotificationIcon(notification.Notification_type)}
                  <div className="notification-text">
                    <h4 className="notification-title-text">
                      {notification.Notification_title}
                    </h4>
                    <p className="notification-message">
                      {notification.Notification_message}
                    </p>
                    <div className="notification-meta">
                      {notification.Notification_fromUserId && (
                        <span className="notification-from">
                          From: {notification.Notification_fromUserId.User_name}
                        </span>
                      )}
                      {notification.Notification_groupId && (
                        <span className="notification-group">
                          in {notification.Notification_groupId.Group_name}
                        </span>
                      )}
                      <span className="notification-time">
                        {formatTimeAgo(notification.Notification_createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="notification-actions-item">
                  {!notification.Notification_read && (
                    <button
                      className="action-btn mark-read"
                      onClick={(e) => handleMarkAsRead(notification._id, e)}
                      title="Mark as read"
                    >
                      <FaCheck />
                    </button>
                  )}
                  <button
                    className="action-btn delete"
                    onClick={(e) => handleDelete(notification._id, e)}
                    title="Delete notification"
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>
              
              {!notification.Notification_read && (
                <div className="unread-indicator"></div>
              )}
            </div>
            );
          })
        ) : (
          <div className="no-notifications">
            <FaBell className="no-notifications-icon" />
            <h3>No notifications</h3>
            <p>
              {filter === 'unread' 
                ? "You're all caught up! No unread notifications."
                : filter === 'all'
                ? "You don't have any notifications yet."
                : `No ${filter} notifications found.`
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationCenter;
