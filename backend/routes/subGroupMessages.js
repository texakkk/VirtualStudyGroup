const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const SubGroupMessage = require("../models/SubGroupMessage");
const SubGroup = require("../models/SubGroup");
const Group = require("../models/Group");
const GroupMember = require("../models/GroupMember");
const { authenticateUser } = require("../middleware/authMiddleware");

// Get messages for a sub-group
router.get("/:subGroupId/messages", authenticateUser, async (req, res) => {
  try {
    const { subGroupId } = req.params;
    const userId = req.user._id;
    const { 
      limit = 50, 
      before, 
      after, 
      search 
    } = req.query;

    // Check if sub-group exists and user has access
    const subGroup = await SubGroup.findById(subGroupId);
    if (!subGroup) {
      return res.status(404).json({
        success: false,
        message: "Sub-group not found",
      });
    }

    // Check if user is a member of the parent group
    const parentMembership = await GroupMember.findOne({
      GroupMember_groupId: subGroup.SubGroup_parentGroupId,
      GroupMember_userId: userId,
    });

    if (!parentMembership) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of the parent group",
      });
    }

    // Check if user has access to this sub-group
    const hasAccess = subGroup.SubGroup_settings.allowAllParentMembers || 
                     subGroup.isMember(userId);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this sub-group",
      });
    }

    let messages;
    
    if (search) {
      // Search messages
      messages = await SubGroupMessage.searchMessages(subGroupId, search, { limit });
    } else {
      // Get messages with pagination
      messages = await SubGroupMessage.getMessages(subGroupId, {
        limit: parseInt(limit),
        before,
        after
      });
    }

    // Mark messages as read for the user
    const unreadMessages = messages.filter(msg => 
      !msg.SubGroupMessage_readBy.some(r => 
        r.userId.toString() === userId.toString()
      )
    );

    // Mark unread messages as read
    await Promise.all(
      unreadMessages.map(msg => msg.markAsRead(userId))
    );

    res.status(200).json({
      success: true,
      messages,
      hasMore: messages.length === parseInt(limit),
    });
  } catch (error) {
    console.error("Error fetching sub-group messages:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch messages",
    });
  }
});

// Send a message to a sub-group
router.post("/:subGroupId/messages", authenticateUser, async (req, res) => {
  try {
    const { subGroupId } = req.params;
    const userId = req.user._id;
    const { 
      content, 
      type = 'text', 
      metadata = {}, 
      replyTo, 
      mentions = [] 
    } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message content is required",
      });
    }

    // Check if sub-group exists and user has access
    const subGroup = await SubGroup.findById(subGroupId);
    if (!subGroup) {
      return res.status(404).json({
        success: false,
        message: "Sub-group not found",
      });
    }

    // Check if user has permission to post messages
    if (!subGroup.hasPermission(userId, 'postMessages')) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to post messages in this sub-group",
      });
    }

    // Create the message
    const message = new SubGroupMessage({
      SubGroupMessage_subGroupId: subGroupId,
      SubGroupMessage_parentGroupId: subGroup.SubGroup_parentGroupId,
      SubGroupMessage_senderId: userId,
      SubGroupMessage_content: content.trim(),
      SubGroupMessage_type: type,
      SubGroupMessage_metadata: metadata,
      SubGroupMessage_replyTo: replyTo || null,
      SubGroupMessage_mentions: mentions
    });

    await message.save();

    // Update sub-group member activity
    await subGroup.updateMemberActivity(userId);

    // Populate the message for response
    const populatedMessage = await SubGroupMessage.findById(message._id)
      .populate('SubGroupMessage_senderId', 'User_name User_email')
      .populate('SubGroupMessage_replyTo')
      .populate('SubGroupMessage_mentions.userId', 'User_name');

    // Emit real-time event (if socket.io is available)
    const io = req.app.get('io');
    if (io) {
      io.to(`subgroup_${subGroupId}`).emit('new_message', populatedMessage);
    }

    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: populatedMessage,
    });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send message",
    });
  }
});

// Edit a message
router.put("/:subGroupId/messages/:messageId", authenticateUser, async (req, res) => {
  try {
    const { subGroupId, messageId } = req.params;
    const userId = req.user._id;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message content is required",
      });
    }

    const message = await SubGroupMessage.findOne({
      _id: messageId,
      SubGroupMessage_subGroupId: subGroupId,
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    // Check if user can edit this message
    if (!message.canUserModify(userId)) {
      return res.status(403).json({
        success: false,
        message: "You can only edit your own messages",
      });
    }

    // Check if message is not too old (e.g., 24 hours)
    const hoursSinceCreated = (new Date() - message.SubGroupMessage_createdAt) / (1000 * 60 * 60);
    if (hoursSinceCreated > 24) {
      return res.status(400).json({
        success: false,
        message: "Messages can only be edited within 24 hours of creation",
      });
    }

    await message.editMessage(content.trim());

    const updatedMessage = await SubGroupMessage.findById(messageId)
      .populate('SubGroupMessage_senderId', 'User_name User_email')
      .populate('SubGroupMessage_replyTo')
      .populate('SubGroupMessage_mentions.userId', 'User_name');

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`subgroup_${subGroupId}`).emit('message_edited', updatedMessage);
    }

    res.status(200).json({
      success: true,
      message: "Message updated successfully",
      data: updatedMessage,
    });
  } catch (error) {
    console.error("Error editing message:", error);
    res.status(500).json({
      success: false,
      message: "Failed to edit message",
    });
  }
});

// Delete a message
router.delete("/:subGroupId/messages/:messageId", authenticateUser, async (req, res) => {
  try {
    const { subGroupId, messageId } = req.params;
    const userId = req.user._id;

    const message = await SubGroupMessage.findOne({
      _id: messageId,
      SubGroupMessage_subGroupId: subGroupId,
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    // Check if user can delete this message (own message or moderator)
    const subGroup = await SubGroup.findById(subGroupId);
    const canDelete = message.canUserModify(userId) || 
                     subGroup.hasPermission(userId, 'manageContent');

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to delete this message",
      });
    }

    await message.softDelete();

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`subgroup_${subGroupId}`).emit('message_deleted', { messageId });
    }

    res.status(200).json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting message:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete message",
    });
  }
});

// Add reaction to a message
router.post("/:subGroupId/messages/:messageId/reactions", authenticateUser, async (req, res) => {
  try {
    const { subGroupId, messageId } = req.params;
    const userId = req.user._id;
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({
        success: false,
        message: "Emoji is required",
      });
    }

    // Check access to sub-group
    const subGroup = await SubGroup.findById(subGroupId);
    if (!subGroup) {
      return res.status(404).json({
        success: false,
        message: "Sub-group not found",
      });
    }

    const hasAccess = subGroup.SubGroup_settings.allowAllParentMembers || 
                     subGroup.isMember(userId);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this sub-group",
      });
    }

    const message = await SubGroupMessage.findOne({
      _id: messageId,
      SubGroupMessage_subGroupId: subGroupId,
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    await message.addReaction(emoji, userId);

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`subgroup_${subGroupId}`).emit('reaction_added', {
        messageId,
        emoji,
        userId
      });
    }

    res.status(200).json({
      success: true,
      message: "Reaction added successfully",
    });
  } catch (error) {
    console.error("Error adding reaction:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add reaction",
    });
  }
});

// Remove reaction from a message
router.delete("/:subGroupId/messages/:messageId/reactions/:emoji", authenticateUser, async (req, res) => {
  try {
    const { subGroupId, messageId, emoji } = req.params;
    const userId = req.user._id;

    const message = await SubGroupMessage.findOne({
      _id: messageId,
      SubGroupMessage_subGroupId: subGroupId,
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    await message.removeReaction(emoji, userId);

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`subgroup_${subGroupId}`).emit('reaction_removed', {
        messageId,
        emoji,
        userId
      });
    }

    res.status(200).json({
      success: true,
      message: "Reaction removed successfully",
    });
  } catch (error) {
    console.error("Error removing reaction:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove reaction",
    });
  }
});

// Get unread message count for a sub-group
router.get("/:subGroupId/unread-count", authenticateUser, async (req, res) => {
  try {
    const { subGroupId } = req.params;
    const userId = req.user._id;

    // Check access to sub-group
    const subGroup = await SubGroup.findById(subGroupId);
    if (!subGroup) {
      return res.status(404).json({
        success: false,
        message: "Sub-group not found",
      });
    }

    const hasAccess = subGroup.SubGroup_settings.allowAllParentMembers || 
                     subGroup.isMember(userId);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this sub-group",
      });
    }

    // Get user's last read timestamp for this sub-group
    const member = subGroup.SubGroup_members.find(m => 
      m.userId.toString() === userId.toString()
    );
    
    const lastReadAt = member ? member.lastActive : null;
    const unreadCount = await SubGroupMessage.getUnreadCount(subGroupId, userId, lastReadAt);

    res.status(200).json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    console.error("Error getting unread count:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get unread count",
    });
  }
});

// Mark all messages as read
router.post("/:subGroupId/mark-read", authenticateUser, async (req, res) => {
  try {
    const { subGroupId } = req.params;
    const userId = req.user._id;

    // Check access to sub-group
    const subGroup = await SubGroup.findById(subGroupId);
    if (!subGroup) {
      return res.status(404).json({
        success: false,
        message: "Sub-group not found",
      });
    }

    const hasAccess = subGroup.SubGroup_settings.allowAllParentMembers || 
                     subGroup.isMember(userId);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this sub-group",
      });
    }

    // Update user's last active timestamp in sub-group
    await subGroup.updateMemberActivity(userId);

    res.status(200).json({
      success: true,
      message: "Messages marked as read",
    });
  } catch (error) {
    console.error("Error marking messages as read:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark messages as read",
    });
  }
});

// Get message thread (replies to a specific message)
router.get("/:subGroupId/messages/:messageId/thread", authenticateUser, async (req, res) => {
  try {
    const { subGroupId, messageId } = req.params;
    const userId = req.user._id;

    // Check access to sub-group
    const subGroup = await SubGroup.findById(subGroupId);
    if (!subGroup) {
      return res.status(404).json({
        success: false,
        message: "Sub-group not found",
      });
    }

    const hasAccess = subGroup.SubGroup_settings.allowAllParentMembers || 
                     subGroup.isMember(userId);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this sub-group",
      });
    }

    // Get the original message
    const originalMessage = await SubGroupMessage.findOne({
      _id: messageId,
      SubGroupMessage_subGroupId: subGroupId,
    }).populate('SubGroupMessage_senderId', 'User_name User_email');

    if (!originalMessage) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    // Get all replies to this message
    const replies = await SubGroupMessage.find({
      SubGroupMessage_subGroupId: subGroupId,
      SubGroupMessage_replyTo: messageId,
      SubGroupMessage_isDeleted: false
    })
      .populate('SubGroupMessage_senderId', 'User_name User_email')
      .sort({ SubGroupMessage_createdAt: 1 });

    res.status(200).json({
      success: true,
      originalMessage,
      replies,
      totalReplies: replies.length,
    });
  } catch (error) {
    console.error("Error fetching message thread:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch message thread",
    });
  }
});

module.exports = router;