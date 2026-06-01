const ReadReceipt = require('../models/ReadReceipt');
const Message = require('../models/Message');

class ReadReceiptService {
  
  // Mark a message as read by a user
  static async markAsRead(messageId, userId) {
    try {
      // Use upsert to avoid duplicates
      const result = await ReadReceipt.findOneAndUpdate(
        { messageId, userId },
        { readAt: new Date() },
        { upsert: true, returnDocument: 'after' }
      );

      // If this was a new read receipt, increment the message read count
      if (result.isNew !== false) {
        await Message.findByIdAndUpdate(
          messageId,
          { $inc: { Message_readCount: 1 } }
        );
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to mark message as read: ${error.message}`);
    }
  }

  // Get read status for multiple messages for a specific user
  static async getUserReadStatus(messageIds, userId) {
    try {
      const readReceipts = await ReadReceipt.find({
        messageId: { $in: messageIds },
        userId
      }).select('messageId readAt');

      // Convert to map for easy lookup
      const readMap = {};
      readReceipts.forEach(receipt => {
        readMap[receipt.messageId.toString()] = receipt.readAt;
      });

      return readMap;
    } catch (error) {
      throw new Error(`Failed to get read status: ${error.message}`);
    }
  }

  // Get who read a specific message
  static async getMessageReaders(messageId, limit = 20) {
    try {
      const readers = await ReadReceipt.find({ messageId })
        .populate('userId', 'User_name User_profilePicture')
        .sort({ readAt: -1 })
        .limit(limit);

      return readers;
    } catch (error) {
      throw new Error(`Failed to get message readers: ${error.message}`);
    }
  }

  // Get read count for a message
  static async getReadCount(messageId) {
    try {
      const count = await ReadReceipt.countDocuments({ messageId });
      return count;
    } catch (error) {
      throw new Error(`Failed to get read count: ${error.message}`);
    }
  }

  // Mark multiple messages as read (useful when user opens a chat)
  static async markMultipleAsRead(messageIds, userId) {
    try {
      const operations = messageIds.map(messageId => ({
        updateOne: {
          filter: { messageId, userId },
          update: { readAt: new Date() },
          upsert: true
        }
      }));

      const result = await ReadReceipt.bulkWrite(operations);
      
      // Update read counts for messages that got new reads
      if (result.upsertedCount > 0) {
        await Message.updateMany(
          { _id: { $in: messageIds } },
          { $inc: { Message_readCount: 1 } }
        );
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to mark multiple messages as read: ${error.message}`);
    }
  }

  // Get unread message count for a user in a group
  static async getUnreadCount(groupId, userId, lastReadMessageId = null) {
    try {
      // Get all messages in the group after the last read message
      const query = { Message_groupId: groupId };
      if (lastReadMessageId) {
        query._id = { $gt: lastReadMessageId };
      }

      const allMessages = await Message.find(query).select('_id');
      const messageIds = allMessages.map(msg => msg._id);

      if (messageIds.length === 0) return 0;

      // Get which ones the user has read
      const readMessages = await ReadReceipt.find({
        messageId: { $in: messageIds },
        userId
      }).select('messageId');

      const readMessageIds = new Set(readMessages.map(r => r.messageId.toString()));
      const unreadCount = messageIds.filter(id => !readMessageIds.has(id.toString())).length;

      return unreadCount;
    } catch (error) {
      throw new Error(`Failed to get unread count: ${error.message}`);
    }
  }
}

module.exports = ReadReceiptService;