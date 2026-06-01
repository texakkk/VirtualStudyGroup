// models/Notification.js
const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  Notification_userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  Notification_type: {
    type: String,
    enum: ['message', 'task', 'group', 'video', 'mention', 'reaction', 'reminder', 'insight', 'summary', 'other'],
    required: true,
  },
  Notification_title: {
    type: String,
    required: true,
  },
  Notification_message: {
    type: String,
    required: true,
  },
  Notification_referenceId: {
    type: mongoose.Schema.Types.ObjectId, // Reference to related entity (task, group, message)
    refPath: 'Notification_referenceModel', // Dynamic reference model
  },
  Notification_referenceModel: {
    type: String,
    enum: ['Message', 'Task', 'Group', 'VideoChatMessage', 'VideoSession', 'User'],
  },
  Notification_groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    index: true,
  },
  Notification_fromUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  Notification_read: {
    type: Boolean,
    default: false,
    index: true,
  },
  Notification_priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  },
  Notification_createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  Notification_updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: {
    createdAt: 'Notification_createdAt',
    updatedAt: 'Notification_updatedAt',
    currentTime: () => new Date()
  }
});

// Index for efficient queries
NotificationSchema.index({ Notification_userId: 1, Notification_read: 1 });
NotificationSchema.index({ Notification_userId: 1, Notification_createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
