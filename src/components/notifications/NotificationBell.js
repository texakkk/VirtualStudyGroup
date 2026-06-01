import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FaBell, FaCheck, FaTrash, FaEye, FaComment, FaTasks, FaUsers, FaVideo, FaAt } from 'react-icons/fa';
import { useNotification } from '../../contexts/NotificationContext';
import { useNavigate } from 'react-router-dom';
import './NotificationBell.css';

const NotificationBell = () => {
  const {
    notifications,
    unreadCount,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification
  } = useNotification();

  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Load notifications when dropdown opens
  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      await fetchNotifications(1, false);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [fetchNotifications]);

  useEffect(() => {
    if (isOpen && notifications.length === 0) {
      loadNotifications();
    }
  }, [isOpen, notifications.length, loadNotifications]);

  const handleBellClick = () => {
    setIsOpen(!isOpen);
  };

  const handleMarkAsRead = async (notificationId, event) => {
    event.stopPropagation();
    await markAsRead(notificationId);
  };

  const handleDelete = async (notificationId, event) => {
    event.stopPropagation();
    await deleteNotification(notificationId);
  };

  const handleViewAll = () => {
    setIsOpen(false);
    navigate('/dashboard/notifications');
  };

  const handleNotificationClick = (notification) => {
    // Mark as read if unread
    if (!notification.Notification_read) {
      markAsRead(notification._id);
    }

    // Navigate based on notification type
    switch (notification.Notification_type) {
      case 'message':
        if (notification.Notification_groupId) {
          navigate(`/dashboard/chat/${notification.Notification_groupId._id}`);
        }
        break;
      case 'task':
        if (notification.Notification_groupId) {
          navigate(`/dashboard/task-manager/${notification.Notification_groupId._id}`);
        }
        break;
      case 'group':
        if (notification.Notification_groupId) {
          const groupId = typeof notification.Notification_groupId._id === 'object' 
            ? notification.Notification_groupId._id.toString() 
            : notification.Notification_groupId._id;
          navigate(`/dashboard/groups/${groupId}`);
        }
        break;
      case 'video':
        if (notification.Notification_groupId) {
          navigate(`/dashboard/chat/${notification.Notification_groupId._id}?video=true`);
        }
        break;
      default:
        navigate('/dashboard/notifications');
    }

    setIsOpen(false);
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
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const getNotificationTypeColor = (type) => {
    switch (type) {
      case 'message': return '#10b981';
      case 'task': return '#f59e0b';
      case 'group': return '#8b5cf6';
      case 'video': return '#ef4444';
      case 'mention': return '#06b6d4';
      default: return '#64748b';
    }
  };

  const getNotificationTypeIcon = (type) => {
    switch (type) {
      case 'message': return <FaComment aria-hidden="true" />;
      case 'task':    return <FaTasks aria-hidden="true" />;
      case 'group':   return <FaUsers aria-hidden="true" />;
      case 'video':   return <FaVideo aria-hidden="true" />;
      case 'mention': return <FaAt aria-hidden="true" />;
      default:        return <FaBell aria-hidden="true" />;
    }
  };

  // Show only recent notifications (last 5)
  const recentNotifications = (notifications || []).slice(0, 5);

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

  // Normalise a notification so both old and new field names work
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

  return (
    <div className="notification-bell-container" ref={dropdownRef}>
      <button 
        className={`notification-bell ${unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={handleBellClick}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={isOpen}
        aria-controls="notification-dropdown"
        aria-haspopup="true"
      >
        <FaBell aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="notification-count" aria-hidden="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div 
          id="notification-dropdown"
          className="notification-dropdown"
          role="dialog"
          aria-label="Notifications panel"
          aria-modal="false"
        >
          <div className="notification-dropdown-header">
            <h3 id="notification-heading">Notifications</h3>
            {unreadCount > 0 && (
              <button 
                className="mark-all-read-small"
                onClick={markAllAsRead}
                aria-label={`Mark all ${unreadCount} notifications as read`}
              >
                <FaCheck aria-hidden="true" />
              </button>
            )}
          </div>

          <div 
            className="notification-dropdown-content"
            role="list"
            aria-labelledby="notification-heading"
          >
            {loading ? (
              <div className="notification-loading-small" role="status" aria-live="polite">
                <div className="loading-spinner-small" aria-hidden="true"></div>
                <span>Loading notifications...</span>
              </div>
            ) : recentNotifications.length > 0 ? (
              <>
                {recentNotifications.map((raw, index) => {
                  const notification = normalise(raw);
                  return (
                  <div
                    key={getNotificationKey(notification, index)}
                    className={`notification-dropdown-item ${!notification.Notification_read ? 'unread' : ''}`}
                    onClick={() => handleNotificationClick(notification)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleNotificationClick(notification);
                      }
                    }}
                    role="listitem"
                    tabIndex={0}
                    aria-label={`${notification.Notification_title}. ${notification.Notification_message}. ${formatTimeAgo(notification.Notification_createdAt)}${!notification.Notification_read ? '. Unread' : ''}`}
                  >
                    <div className="notification-dropdown-content-main">
                      <div 
                        className="notification-type-indicator"
                        style={{ backgroundColor: getNotificationTypeColor(notification.Notification_type), color: '#fff' }}
                        aria-hidden="true"
                      >
                        {getNotificationTypeIcon(notification.Notification_type)}
                      </div>
                      
                      <div className="notification-dropdown-text">
                        <div className="notification-dropdown-title">
                          {notification.Notification_title}
                        </div>
                        <div className="notification-dropdown-message">
                          {notification.Notification_message ?? ''}
                        </div>
                        <div className="notification-dropdown-time">
                          {formatTimeAgo(notification.Notification_createdAt)}
                        </div>
                      </div>
                    </div>

                    <div className="notification-dropdown-actions">
                      {!notification.Notification_read && (
                        <button
                          className="notification-action-btn mark-read"
                          onClick={(e) => handleMarkAsRead(notification._id, e)}
                          aria-label="Mark notification as read"
                        >
                          <FaCheck aria-hidden="true" />
                        </button>
                      )}
                      <button
                        className="notification-action-btn delete"
                        onClick={(e) => handleDelete(notification._id, e)}
                        aria-label="Delete notification"
                      >
                        <FaTrash aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  );
                })}
              </>
            ) : (
              <div className="no-notifications-small" role="status">
                <FaBell aria-hidden="true" />
                <span>No notifications</span>
              </div>
            )}
          </div>

          <div className="notification-dropdown-footer">
            <button 
              className="view-all-btn"
              onClick={handleViewAll}
              aria-label="View all notifications"
            >
              <FaEye aria-hidden="true" />
              View All Notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
