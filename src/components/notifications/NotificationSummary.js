import React, { useEffect, useState } from 'react';
import { FaBell, FaComment, FaTasks, FaUsers, FaVideo, FaAt } from 'react-icons/fa';
import { useNotification } from '../../contexts/NotificationContext';
import { useNavigate } from 'react-router-dom';
import './NotificationSummary.css';

const NotificationSummary = () => {
  const { notifications, unreadCount, fetchNotifications } = useNotification();
  const [summary, setSummary] = useState({
    total: 0,
    message: 0,
    task: 0,
    group: 0,
    video: 0,
    mention: 0
  });
  const navigate = useNavigate();

  useEffect(() => {
    // Load notifications when component mounts
    fetchNotifications(1, true); // Load only unread notifications
  }, [fetchNotifications]);

  useEffect(() => {
    // Calculate summary from notifications
    const unreadNotifications = notifications.filter(n => !n.Notification_read);
    
    const newSummary = {
      total: unreadNotifications.length,
      message: unreadNotifications.filter(n => n.Notification_type === 'message').length,
      task: unreadNotifications.filter(n => n.Notification_type === 'task').length,
      group: unreadNotifications.filter(n => n.Notification_type === 'group').length,
      video: unreadNotifications.filter(n => n.Notification_type === 'video').length,
      mention: unreadNotifications.filter(n => n.Notification_type === 'mention').length
    };
    
    setSummary(newSummary);
  }, [notifications]);

  const handleViewAll = () => {
    navigate('/dashboard/notifications');
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'message': return <FaComment className="summary-icon message" />;
      case 'task': return <FaTasks className="summary-icon task" />;
      case 'group': return <FaUsers className="summary-icon group" />;
      case 'video': return <FaVideo className="summary-icon video" />;
      case 'mention': return <FaAt className="summary-icon mention" />;
      default: return <FaBell className="summary-icon default" />;
    }
  };

  const summaryItems = [
    { type: 'message', label: 'Messages', count: summary.message },
    { type: 'task', label: 'Tasks', count: summary.task },
    { type: 'group', label: 'Groups', count: summary.group },
    { type: 'video', label: 'Video Calls', count: summary.video },
    { type: 'mention', label: 'Mentions', count: summary.mention }
  ];

  if (summary.total === 0) {
    return (
      <div className="notification-summary">
        <div className="summary-header">
          <FaBell className="header-icon" />
          <h3>Notifications</h3>
        </div>
        <div className="no-notifications-summary">
          <p>All caught up! No new notifications.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="notification-summary">
      <div className="summary-header">
        <FaBell className="header-icon" />
        <h3>Notifications</h3>
        {unreadCount > 0 && (
          <span className="unread-badge">{unreadCount}</span>
        )}
        <span className="total-count">{summary.total}</span>
      </div>
      
      <div className="summary-grid">
        {summaryItems.map(item => (
          item.count > 0 && (
            <div key={item.type} className="summary-item">
              {getTypeIcon(item.type)}
              <div className="summary-details">
                <span className="summary-count">{item.count}</span>
                <span className="summary-label">{item.label}</span>
              </div>
            </div>
          )
        ))}
      </div>
      
      <button className="view-all-summary" onClick={handleViewAll}>
        View All Notifications
      </button>
    </div>
  );
};

export default NotificationSummary;