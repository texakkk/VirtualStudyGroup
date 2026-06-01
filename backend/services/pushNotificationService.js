const User = require('../models/User');

/**
 * Push Notification Service
 * Handles sending push notifications to mobile devices via Firebase Cloud Messaging
 * 
 * Note: This service requires Firebase Admin SDK to be configured.
 * For production use, install firebase-admin and configure with service account:
 * npm install firebase-admin
 * 
 * Initialize in server.js with:
 * const admin = require('firebase-admin');
 * const serviceAccount = require('./path/to/serviceAccountKey.json');
 * admin.initializeApp({
 *   credential: admin.credential.cert(serviceAccount)
 * });
 */

class PushNotificationService {
  constructor() {
    this.fcmAvailable = false;
    this.admin = null;
    
    // Try to initialize Firebase Admin SDK
    try {
      this.admin = require('firebase-admin');
      
      // Check if already initialized
      if (this.admin.apps.length === 0) {
        // In production, initialize with service account
        // For now, we'll just mark as unavailable if not configured
        console.log('⚠️ Firebase Admin SDK not configured. Push notifications disabled.');
        console.log('💡 To enable: Install firebase-admin and configure with service account');
      } else {
        this.fcmAvailable = true;
        console.log('✅ Firebase Cloud Messaging initialized');
      }
    } catch (error) {
      console.log('⚠️ Firebase Admin SDK not installed. Push notifications disabled.');
      console.log('💡 To enable: npm install firebase-admin');
    }
  }

  /**
   * Send push notification to a single user
   */
  async sendToUser(userId, notification) {
    try {
      if (!this.fcmAvailable) {
        console.log('📱 Push notification skipped (FCM not configured):', notification.title);
        return { success: false, reason: 'FCM not configured' };
      }

      // Get user's device tokens
      const user = await User.findById(userId).select('User_deviceTokens User_notificationPreferences');
      
      if (!user || !user.User_deviceTokens || user.User_deviceTokens.length === 0) {
        console.log('📱 No device tokens found for user:', userId);
        return { success: false, reason: 'No device tokens' };
      }

      // Check if user has push notifications enabled
      const pushEnabled = user.User_notificationPreferences?.push?.enabled !== false;
      if (!pushEnabled) {
        console.log('📱 Push notifications disabled for user:', userId);
        return { success: false, reason: 'Push disabled by user' };
      }

      // Check notification type preferences
      const notificationType = notification.type || 'other';
      const typeEnabled = user.User_notificationPreferences?.push?.[notificationType] !== false;
      if (!typeEnabled) {
        console.log(`📱 Push notifications for ${notificationType} disabled for user:`, userId);
        return { success: false, reason: `${notificationType} notifications disabled` };
      }

      // Extract device tokens
      const tokens = user.User_deviceTokens.map(dt => dt.token).filter(Boolean);
      
      if (tokens.length === 0) {
        return { success: false, reason: 'No valid tokens' };
      }

      // Prepare FCM message
      const message = {
        notification: {
          title: notification.title,
          body: notification.message
        },
        data: {
          type: notification.type || 'other',
          referenceId: notification.referenceId?.toString() || '',
          groupId: notification.groupId?.toString() || '',
          priority: notification.priority || 'medium'
        },
        tokens: tokens
      };

      // Send multicast message
      const response = await this.admin.messaging().sendMulticast(message);

      // Handle failed tokens
      if (response.failureCount > 0) {
        const failedTokens = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            failedTokens.push(tokens[idx]);
            console.error('Failed to send to token:', tokens[idx], resp.error);
          }
        });

        // Remove invalid tokens from user
        if (failedTokens.length > 0) {
          await this.removeInvalidTokens(userId, failedTokens);
        }
      }

      console.log(`📱 Push notification sent to ${response.successCount}/${tokens.length} devices`);
      
      return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount
      };
    } catch (error) {
      console.error('Error sending push notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send push notification to multiple users
   */
  async sendToUsers(userIds, notification) {
    try {
      const results = await Promise.allSettled(
        userIds.map(userId => this.sendToUser(userId, notification))
      );

      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.length - successful;

      console.log(`📱 Batch notification: ${successful} successful, ${failed} failed`);

      return {
        success: true,
        totalUsers: userIds.length,
        successful,
        failed
      };
    } catch (error) {
      console.error('Error sending batch push notifications:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send push notification to all members of a group
   */
  async sendToGroup(groupId, notification, excludeUserIds = []) {
    try {
      const GroupMember = require('../models/GroupMember');
      
      // Get all group members
      const members = await GroupMember.find({ 
        GroupMember_groupId: groupId 
      }).select('GroupMember_userId');

      // Filter out excluded users
      const userIds = members
        .map(m => m.GroupMember_userId.toString())
        .filter(id => !excludeUserIds.includes(id));

      if (userIds.length === 0) {
        return { success: false, reason: 'No users to notify' };
      }

      return await this.sendToUsers(userIds, notification);
    } catch (error) {
      console.error('Error sending group push notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification for new message
   */
  async sendMessageNotification(messageData, recipientIds) {
    const notification = {
      title: `New message in ${messageData.groupName}`,
      message: `${messageData.senderName}: ${messageData.content.substring(0, 100)}`,
      type: 'messages',
      referenceId: messageData.messageId,
      groupId: messageData.groupId,
      priority: 'medium'
    };

    return await this.sendToUsers(recipientIds, notification);
  }

  /**
   * Send notification for task assignment
   */
  async sendTaskNotification(taskData, recipientIds) {
    const notification = {
      title: `New task: ${taskData.taskName}`,
      message: `${taskData.assignerName} assigned you a task in ${taskData.groupName}`,
      type: 'tasks',
      referenceId: taskData.taskId,
      groupId: taskData.groupId,
      priority: 'high'
    };

    return await this.sendToUsers(recipientIds, notification);
  }

  /**
   * Send notification for mention
   */
  async sendMentionNotification(mentionData, recipientIds) {
    const notification = {
      title: `You were mentioned in ${mentionData.groupName}`,
      message: `${mentionData.senderName} mentioned you`,
      type: 'mentions',
      referenceId: mentionData.messageId,
      groupId: mentionData.groupId,
      priority: 'high'
    };

    return await this.sendToUsers(recipientIds, notification);
  }

  /**
   * Send notification for group update
   */
  async sendGroupUpdateNotification(groupData, recipientIds) {
    const notification = {
      title: groupData.title,
      message: groupData.message,
      type: 'groupUpdates',
      referenceId: groupData.groupId,
      groupId: groupData.groupId,
      priority: 'medium'
    };

    return await this.sendToUsers(recipientIds, notification);
  }

  /**
   * Remove invalid device tokens from user
   */
  async removeInvalidTokens(userId, invalidTokens) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.User_deviceTokens) return;

      user.User_deviceTokens = user.User_deviceTokens.filter(
        dt => !invalidTokens.includes(dt.token)
      );

      await user.save();
      console.log(`🗑️ Removed ${invalidTokens.length} invalid tokens for user ${userId}`);
    } catch (error) {
      console.error('Error removing invalid tokens:', error);
    }
  }

  /**
   * Test if FCM is available
   */
  isAvailable() {
    return this.fcmAvailable;
  }
}

// Export singleton instance
module.exports = new PushNotificationService();
