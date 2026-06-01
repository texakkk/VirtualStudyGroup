const Notification = require('../models/Notification');
const User = require('../models/User');
const Group = require('../models/Group');
const pushNotificationService = require('./pushNotificationService');
const { serializeNotification } = require('../utils/notificationSerializer');

class NotificationService {
  constructor(io, notificationNamespace = null) {
    this.io = io;
    this.notificationNamespace = notificationNamespace;
    this.pushService = pushNotificationService;
  }

  // Create and send notification
  async createNotification(notificationData = {}) {
    try {
      const allowedTypes = new Set(['message', 'task', 'group', 'video', 'mention', 'reaction', 'reminder', 'insight', 'summary', 'other']);
      const userId = notificationData.userId || notificationData.Notification_userId;
      const type = notificationData.type || notificationData.Notification_type || 'other';
      const title = notificationData.title || notificationData.Notification_title || 'Notification';
      const message = notificationData.message || notificationData.Notification_message || '';
      const referenceId = notificationData.referenceId || notificationData.Notification_referenceId || null;
      const referenceModel = notificationData.referenceModel || notificationData.Notification_referenceModel || null;
      const groupId = notificationData.groupId || notificationData.Notification_groupId || null;
      const fromUserId = notificationData.fromUserId || notificationData.Notification_fromUserId || null;
      const priority = notificationData.priority || notificationData.Notification_priority || 'medium';

      const notification = new Notification({
        Notification_userId: userId,
        Notification_type: allowedTypes.has(type) ? type : 'other',
        Notification_title: title,
        Notification_message: message,
        Notification_referenceId: referenceId,
        Notification_referenceModel: referenceModel,
        Notification_groupId: groupId,
        Notification_fromUserId: fromUserId,
        Notification_priority: priority
      });

      await notification.save();

      // Populate the notification for real-time sending
      const populatedNotification = await Notification.findById(notification._id)
        .populate('Notification_fromUserId', 'User_name User_email')
        .populate('Notification_groupId', 'Group_name')
        .lean();
      const serializedNotification = serializeNotification(populatedNotification);

      // Send real-time notification via socket
      this.sendRealTimeNotification(userId, serializedNotification);

      return serializedNotification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  // Send real-time notification via socket
  sendRealTimeNotification(userId, notification) {
    console.log(`📢 Sending notification to user ${userId}:`, notification.Notification_title);
    
    // Use dedicated notification namespace if available
    if (this.notificationNamespace && this.notificationNamespace.sendToUser) {
      this.notificationNamespace.sendToUser(userId.toString(), 'newNotification', {
        notification
      });
      
      // Also send updated unread count
      this.sendUnreadCount(userId);
    } else if (this.io) {
      // Fallback to main namespace
      console.log('📢 Using fallback main namespace for notifications');
      this.io.emit('newNotification', {
        userId: userId.toString(),
        notification
      });
    } else {
      console.warn('📢 No socket connection available for notifications');
    }

    // Send push notification to mobile devices
    this.sendPushNotification(userId, notification);
  }

  // Send push notification to mobile devices
  async sendPushNotification(userId, notification) {
    try {
      if (!this.pushService.isAvailable()) {
        return; // Push notifications not configured
      }

      const pushData = {
        title: notification.Notification_title,
        message: notification.Notification_message,
        type: notification.Notification_type,
        referenceId: notification.Notification_referenceId,
        groupId: notification.Notification_groupId,
        priority: notification.Notification_priority
      };

      await this.pushService.sendToUser(userId, pushData);
    } catch (error) {
      console.error('Error sending push notification:', error);
      // Don't throw - push notification failure shouldn't break the flow
    }
  }

  // Send updated unread count to user
  async sendUnreadCount(userId) {
    try {
      const unreadCount = await Notification.countDocuments({
        Notification_userId: userId,
        Notification_read: false
      });

      if (this.notificationNamespace && this.notificationNamespace.sendToUser) {
        this.notificationNamespace.sendToUser(userId.toString(), 'notificationCount', {
          unreadCount
        });
      }
    } catch (error) {
      console.error('Error sending unread count:', error);
    }
  }

  // Create message notification
  async createMessageNotification(messageData, groupMembers) {
    try {
      const { Message_sender, Message_groupId, Message_content, _id } = messageData;
      
      // Get group info
      const group = await Group.findById(Message_groupId);
      if (!group) return;

      // Get sender info
      const sender = await User.findById(Message_sender);
      if (!sender) return;

      // Create notifications for all group members except sender
      const notifications = [];
      console.log(`📢 Creating message notifications. Sender: ${Message_sender}, Group: ${group.Group_name}`);
      
      for (const member of groupMembers) {
        const memberUserId = member.GroupMember_userId.toString();
        const senderUserId = Message_sender.toString();
        
        console.log(`📢 Checking member ${memberUserId} vs sender ${senderUserId}`);
        
        if (memberUserId !== senderUserId) {
          console.log(`📢 Creating notification for member ${memberUserId}`);
          const notification = await this.createNotification({
            userId: member.GroupMember_userId,
            type: 'message',
            title: `New message in ${group.Group_name}`,
            message: `${sender.User_name}: ${Message_content.substring(0, 100)}${Message_content.length > 100 ? '...' : ''}`,
            referenceId: _id,
            referenceModel: 'Message',
            groupId: Message_groupId,
            fromUserId: Message_sender,
            priority: 'medium'
          });
          notifications.push(notification);
        } else {
          console.log(`📢 Skipping notification for sender ${memberUserId}`);
        }
      }

      return notifications;
    } catch (error) {
      console.error('Error creating message notifications:', error);
      throw error;
    }
  }

  // Create task notification
  async createTaskNotification(taskData, type = 'task') {
    try {
      const { Task_name, Task_assignedTo, Task_groupId, Task_createdBy, _id } = taskData;
      
      // Get group and creator info
      const [group, creator] = await Promise.all([
        Group.findById(Task_groupId),
        User.findById(Task_createdBy)
      ]);

      if (!group || !creator) return;

      const notifications = [];
      
      // Notify assigned users
      if (Task_assignedTo && Task_assignedTo.length > 0) {
        for (const assigneeId of Task_assignedTo) {
          if (assigneeId.toString() !== Task_createdBy.toString()) {
            const notification = await this.createNotification({
              userId: assigneeId,
              type: 'task',
              title: `New task assigned: ${Task_name}`,
              message: `${creator.User_name} assigned you a task in ${group.Group_name}`,
              referenceId: _id,
              referenceModel: 'Task',
              groupId: Task_groupId,
              fromUserId: Task_createdBy,
              priority: 'high'
            });
            notifications.push(notification);
          }
        }
      }

      return notifications;
    } catch (error) {
      console.error('Error creating task notifications:', error);
      throw error;
    }
  }

  // Create group notification
  async createGroupNotification(groupData, memberIds, type = 'group') {
    try {
      const { Group_name, Group_createdBy, _id } = groupData;
      
      const creator = await User.findById(Group_createdBy);
      if (!creator) return;

      const notifications = [];
      
      for (const memberId of memberIds) {
        if (memberId.toString() !== Group_createdBy.toString()) {
          const notification = await this.createNotification({
            userId: memberId,
            type: 'group',
            title: `Added to group: ${Group_name}`,
            message: `${creator.User_name} added you to the group "${Group_name}"`,
            referenceId: _id,
            referenceModel: 'Group',
            groupId: _id,
            fromUserId: Group_createdBy,
            priority: 'medium'
          });
          notifications.push(notification);
        }
      }

      return notifications;
    } catch (error) {
      console.error('Error creating group notifications:', error);
      throw error;
    }
  }

  // Create video session notification
  async createVideoNotification(sessionData, groupMembers) {
    try {
      const { VideoSession_groupId, VideoSession_hostUserId, _id } = sessionData;
      
      const [group, host] = await Promise.all([
        Group.findById(VideoSession_groupId),
        User.findById(VideoSession_hostUserId)
      ]);

      if (!group || !host) return;

      const notifications = [];
      
      for (const member of groupMembers) {
        if (member.GroupMember_userId.toString() !== VideoSession_hostUserId.toString()) {
          const notification = await this.createNotification({
            userId: member.GroupMember_userId,
            type: 'video',
            title: `Video call started in ${group.Group_name}`,
            message: `${host.User_name} started a video call`,
            referenceId: _id,
            referenceModel: 'VideoSession',
            groupId: VideoSession_groupId,
            fromUserId: VideoSession_hostUserId,
            priority: 'high'
          });
          notifications.push(notification);
        }
      }

      return notifications;
    } catch (error) {
      console.error('Error creating video notifications:', error);
      throw error;
    }
  }

  // Create mention notification
  async createMentionNotification(messageData, mentionedUserIds) {
    try {
      const { Message_sender, Message_groupId, Message_content, _id } = messageData;
      
      const [group, sender] = await Promise.all([
        Group.findById(Message_groupId),
        User.findById(Message_sender)
      ]);

      if (!group || !sender) return;

      const notifications = [];
      
      for (const userId of mentionedUserIds) {
        if (userId.toString() !== Message_sender.toString()) {
          const notification = await this.createNotification({
            userId: userId,
            type: 'mention',
            title: `You were mentioned in ${group.Group_name}`,
            message: `${sender.User_name} mentioned you: ${Message_content.substring(0, 100)}${Message_content.length > 100 ? '...' : ''}`,
            referenceId: _id,
            referenceModel: 'Message',
            groupId: Message_groupId,
            fromUserId: Message_sender,
            priority: 'high'
          });
          notifications.push(notification);
        }
      }

      return notifications;
    } catch (error) {
      console.error('Error creating mention notifications:', error);
      throw error;
    }
  }
}

module.exports = NotificationService;
