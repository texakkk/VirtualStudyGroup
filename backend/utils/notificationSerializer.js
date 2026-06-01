const serializeObjectId = (value) => {
  if (!value) return null;
  if (typeof value === 'object' && value._id) return value._id.toString();
  if (typeof value === 'object') return null;
  return value.toString();
};

const serializeUser = (user) => {
  if (!user) return null;

  return {
    _id: serializeObjectId(user),
    User_name: user.User_name || '',
    User_email: user.User_email || '',
  };
};

const serializeGroup = (group) => {
  if (!group) return null;

  return {
    _id: serializeObjectId(group),
    Group_name: group.Group_name || '',
  };
};

const serializeNotification = (notification) => {
  if (!notification) return null;

  const source = typeof notification.toObject === 'function'
    ? notification.toObject()
    : notification;

  return {
    _id: serializeObjectId(source._id),
    Notification_userId: serializeObjectId(source.Notification_userId),
    Notification_type: source.Notification_type || 'other',
    Notification_title: source.Notification_title || '',
    Notification_message: source.Notification_message || '',
    Notification_referenceId: serializeObjectId(source.Notification_referenceId),
    Notification_referenceModel: source.Notification_referenceModel || null,
    Notification_groupId: serializeGroup(source.Notification_groupId),
    Notification_fromUserId: serializeUser(source.Notification_fromUserId),
    Notification_read: Boolean(source.Notification_read),
    Notification_priority: source.Notification_priority || 'medium',
    Notification_createdAt: source.Notification_createdAt || source.createdAt || null,
    Notification_updatedAt: source.Notification_updatedAt || source.updatedAt || null,
  };
};

const serializeNotifications = (notifications = []) =>
  notifications.map(serializeNotification).filter(Boolean);

module.exports = {
  serializeNotification,
  serializeNotifications,
};
