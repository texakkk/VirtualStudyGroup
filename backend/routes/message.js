const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const { authenticateUser } = require('../middleware/authMiddleware');
const Message = require('../models/Message'); // Import Message model
const File = require('../models/File'); // Import File model
const Group = require('../models/Group'); // Import Group model
const GroupMember = require('../models/GroupMember');
const NotificationService = require('../services/notificationService');
const ReadReceiptService = require('../services/readReceiptService');
const cacheService = require('../services/cacheService');
const { invalidateCache } = require('../middleware/cacheMiddleware');
const router = express.Router();

// Set up multer for file uploads, saving to the 'backend/uploads' folder
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/')); 
  },
  filename: (req, file, cb) => {
    // Set a unique filename for each uploaded file
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });


// Route for fetching messages by groupId with sender's name populated
router.get('/group/:groupId', authenticateUser, async (req, res) => {
  const { groupId } = req.params;
  const userId = req.user._id;

  // Validate groupId format
  const trimmedGroupId = typeof groupId === 'string' ? groupId.trim() : groupId;
  if (!mongoose.Types.ObjectId.isValid(trimmedGroupId)) {
    console.log('Invalid group ID format:', trimmedGroupId);
    return res.status(400).json({ message: 'Invalid group ID format' });
  }

  try {
    console.log(`Fetching messages for group ID: ${trimmedGroupId}`);
    
    // Check if the group exists
    const group = await Group.findById(trimmedGroupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Fetch messages for the group, sorting by creation date, and populate sender, file, and reply info
    const messages = await Message.find({ Message_groupId: trimmedGroupId })
      .sort({ Message_createdAt: 1 })
      .populate('Message_sender', 'User_name User_email')
      .populate('Message_fileId', 'File_originalName File_url File_type File_size File_sizeFormatted')
      .populate({
        path: 'Message_replyTo',
        populate: [
          {
            path: 'Message_sender',
            select: 'User_name User_email' 
          },
          {
            path: 'Message_fileId',
            select: 'File_originalName File_type'
          }
        ],
        select: 'Message_content Message_sender Message_createdAt Message_replyTo Message_type Message_fileId'
      });

    // Get read status for all messages for this user
    const messageIds = messages.map(msg => msg._id);
    
    let readStatus = {};
    let readReceiptError = null;
    
    try {
      readStatus = await ReadReceiptService.getUserReadStatus(messageIds, userId);
    } catch (readError) {
      console.error('Error getting read status:', readError);
      readReceiptError = readError;
      // Continue without read status if there's an error
    }

    // Add read status to each message
    const messagesWithReadStatus = messages.map(message => {
      const messageObj = message.toObject();
      return {
        ...messageObj,
        isReadByUser: readReceiptError ? false : !!readStatus[message._id.toString()],
        readAt: readReceiptError ? null : (readStatus[message._id.toString()] || null),
        Message_readCount: readReceiptError ? 0 : (messageObj.Message_readCount || 0)
      };
    });
    
    res.json({ messages: messagesWithReadStatus });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Error fetching messages', error: error.message });
  }
});
router.post('/', authenticateUser, async (req, res) => { 
  const { Message_groupId, Message_content, Message_timestamp, Message_replyTo } = req.body;
  const Message_sender = req.user._id;
  
  // Validate required fields
  if (!Message_groupId || !Message_timestamp || (!Message_content && !Message_replyTo)) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  // Validate groupId format
  const trimmedGroupId = typeof Message_groupId === 'string' ? Message_groupId.trim() : Message_groupId;
  if (!mongoose.Types.ObjectId.isValid(trimmedGroupId)) {
    return res.status(400).json({ message: 'Invalid group ID format' });
  }

  try {
    const group = await Group.findById(trimmedGroupId);
    if (!group) { 
      return res.status(404).json({ message: 'Group not found' });
    }

    // Determine message type
    let messageType = 'text';
    if (Message_replyTo) {
      messageType = 'reply';
    }

    const newMessage = new Message({
      Message_groupId: trimmedGroupId,
      Message_sender,
      Message_content,
      Message_type: messageType,
      Message_replyTo: Message_replyTo || null,
      Message_timestamp
    });

    await newMessage.save();

    // Populate sender and reply info before returning
    const savedMessage = await Message.findById(newMessage._id)
      .populate('Message_sender', 'User_name User_email')
      .populate({
        path: 'Message_replyTo',
        populate: [
          {
            path: 'Message_sender',
            select: 'User_name User_email' 
          },
          {
            path: 'Message_fileId',
            select: 'File_originalName File_type'
          }
        ],
        select: 'Message_content Message_sender Message_type Message_fileId'
      })

    // Create notifications for group members (except sender)
    try {
      const groupMembers = await GroupMember.find({ 
        GroupMember_groupId: trimmedGroupId 
      });
      
      if (groupMembers.length > 0) {
        const io = req.app.get('io');
        const notificationNamespace = req.app.get('notificationNamespace');
        const notificationService = new NotificationService(io, notificationNamespace);
        await notificationService.createMessageNotification(savedMessage, groupMembers);
      }
    } catch (notificationError) {
      console.error('Error creating message notifications:', notificationError);
      // Don't fail the message creation if notification fails
    }

    res.status(201).json(savedMessage);
  } catch (error) {
    console.error('Error saving message:', error);
    res.status(500).json({ message: 'Error saving message', error: error.message });
  }
});


router.post('/upload', authenticateUser, upload.single('file'), async (req, res) => {
  const { groupId, timestamp, replyTo, content } = req.body;

  if (!req.file || !groupId || !timestamp) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  // Validate groupId format
  const trimmedGroupId = typeof groupId === 'string' ? groupId.trim() : groupId;
  if (!mongoose.Types.ObjectId.isValid(trimmedGroupId)) {
    return res.status(400).json({ message: 'Invalid group ID format' });
  }

  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  
  // Determine file type based on MIME type
  let fileType = 'other';
  if (req.file.mimetype.startsWith('image/')) fileType = 'image';
  else if (req.file.mimetype.startsWith('video/')) fileType = 'video';
  else if (req.file.mimetype.startsWith('audio/')) fileType = 'audio';
  else if (req.file.mimetype.includes('pdf') || req.file.mimetype.includes('document')) fileType = 'document';

  try {
    const group = await Group.findById(trimmedGroupId);
    if (!group) {
      return res.status(400).json({ message: 'Group not found' });
    }

    // Create File record first
    const newFile = new File({
      File_originalName: req.file.originalname,
      File_fileName: req.file.filename,
      File_filePath: req.file.path,
      File_url: fileUrl,
      File_fileSize: req.file.size,
      File_mimeType: req.file.mimetype,
      File_type: fileType,
      File_category: fileType,
      File_uploadedBy: req.user._id,
      File_groupId: trimmedGroupId
    });

    await newFile.save();

    // Determine message type
    let messageType = 'file';
    if (content && content.trim()) {
      messageType = 'mixed'; // Has both text and file
    }
    if (replyTo) {
      messageType = 'reply'; // Reply takes precedence
    }

    // Create Message record with file reference
    const newMessage = new Message({
      Message_groupId: trimmedGroupId,
      Message_sender: req.user._id,
      Message_content: content || '',
      Message_type: messageType,
      Message_fileId: newFile._id,
      Message_replyTo: replyTo || null,
      Message_timestamp: timestamp
    });

    await newMessage.save();

    // Update file with message reference
    newFile.File_messageId = newMessage._id;
    await newFile.save();

    // Populate sender and file info before returning
    const savedMessage = await Message.findById(newMessage._id)
      .populate('Message_sender', 'User_name User_email')
      .populate('Message_fileId', 'File_originalName File_url File_type File_size File_sizeFormatted')
      .populate({
        path: 'Message_replyTo',
        populate: [
          {
            path: 'Message_sender',
            select: 'User_name User_email' 
          },
          {
            path: 'Message_fileId',
            select: 'File_originalName File_type'
          }
        ],
        select: 'Message_content Message_sender Message_type Message_fileId'
      })

    // Create notifications for group members (except sender)
    try {
      const groupMembers = await GroupMember.find({ 
        GroupMember_groupId: trimmedGroupId 
      });
      
      if (groupMembers.length > 0) {
        const io = req.app.get('io');
        const notificationNamespace = req.app.get('notificationNamespace');
        const notificationService = new NotificationService(io, notificationNamespace);
        await notificationService.createMessageNotification(savedMessage, groupMembers);
      }
    } catch (notificationError) {
      console.error('Error creating file message notifications:', notificationError);
      // Don't fail the message creation if notification fails
    }

    res.status(201).json(savedMessage);
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ message: 'Error uploading file', error: error.message });
  }
});

router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id; // Extract userId from the token

    // Fetch messages based on the userId
    const messages = await Message.find({ Message_sender: userId })
    .populate({ path: 'Message_sender', select: 'User_name User_email', strictPopulate: false })
  .exec();

    res.status(200).json({ messages });
  } catch (err) {
    console.error('Error fetching all messages:', err.message);
    res.status(500).json({ message: 'Error fetching all messages', error: err.message });
  }
});

// Add an emoji reaction to a message
router.post('/:messageId/reactions', authenticateUser, async (req, res) => {
  const { messageId } = req.params;
  const { emoji } = req.body;
  const userId = req.user.id;

  try {
    const message = await Message.findOneAndUpdate(
      { _id: messageId, 'Message_emojiReactions.emoji': emoji },
      {
        $addToSet: { 'Message_emojiReactions.$.users': userId },
        $inc: { 'Message_emojiReactions.$.count': 1 },
      },
      { returnDocument: 'after' }
    );

    // If the emoji does not exist, add it as a new reaction
    if (!message) {
      await Message.findByIdAndUpdate(
        messageId,
        {
          $push: {
            Message_emojiReactions: { emoji, count: 1, users: [userId] },
          },
        },
        { returnDocument: 'after' }
      );
    }

    res.status(200).json({ message: 'Reaction added' });
  } catch (error) {
    console.error('Error adding reaction:', error);
    res.status(500).json({ message: 'Failed to add reaction' });
  }
});

// Remove an emoji reaction
router.delete('/:messageId/reactions', authenticateUser, async (req, res) => {
  const { messageId } = req.params;
  const { emoji } = req.body;
  const userId = req.user.id;

  try {
    await Message.findOneAndUpdate(
      { _id: messageId, 'Message_emojiReactions.emoji': emoji },
      {
        $pull: { 'Message_emojiReactions.$.users': userId },
        $inc: { 'Message_emojiReactions.$.count': -1 },
      },
      { returnDocument: 'after' }
    );

    res.status(200).json({ message: 'Reaction removed' });
  } catch (error) {
    console.error('Error removing reaction:', error);
    res.status(500).json({ message: 'Failed to remove reaction' });
  }
});


// @desc    Edit/Update a message
// @route   PUT /api/message/:messageId
// @access  Private
router.put('/:messageId', authenticateUser, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { Message_content } = req.body;
    const userId = req.user._id;

    // Validate input
    if (!Message_content || !Message_content.trim()) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    // Find the message
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Check if the user is the sender
    if (message.Message_sender.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Not authorized to edit this message' });
    }

    // Only allow editing text messages (not files)
    if (message.Message_type === 'file' && !message.Message_content) {
      return res.status(400).json({ message: 'Cannot edit file-only messages' });
    }

    // Update the message
    const updatedMessage = await Message.findByIdAndUpdate(
      messageId,
      { 
        Message_content: Message_content.trim(),
        Message_updatedAt: new Date(),
        Message_isEdited: true,
        Message_editedAt: new Date()
      },
      { returnDocument: 'after' }
    ).populate('Message_sender', 'User_name User_email')
     .populate('Message_fileId', 'File_originalName File_url File_type File_size File_sizeFormatted')
     .populate({
       path: 'Message_replyTo',
       populate: [
         {
           path: 'Message_sender',
           select: 'User_name User_email' 
          },
         {
           path: 'Message_fileId',
           select: 'File_originalName File_type'
         }
       ],
       select: 'Message_content Message_sender Message_createdAt Message_replyTo Message_type Message_fileId'
     });

    res.json({ 
      success: true,
      message: 'Message updated successfully',
      data: updatedMessage
    });
  } catch (error) {
    console.error('Error updating message:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Delete a message (soft delete or hard delete)
// @route   DELETE /api/message/:messageId
// @access  Private
router.delete('/:messageId', authenticateUser, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    // Find the message
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Check if the user is the sender or an admin
    const isSender = message.Message_sender.toString() === userId;
    const isAdmin = req.user.User_role === 'admin';

    if (!isSender && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized to delete this message' });
    }

    // Check if soft delete (default) or hard delete is requested
    const hardDelete = req.query.hard === 'true';

    if (hardDelete && isAdmin) {
      // Hard delete (only for admins)
      await Message.findByIdAndDelete(messageId);
      return res.json({ message: 'Message permanently deleted', hardDelete: true });
    } else {
      // Regular user delete (also hard delete for now)
      await Message.findByIdAndDelete(messageId);
      return res.json({ 
        message: 'Message deleted successfully',
        hardDelete: true
      });
    }
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Mark messages as read for a user in a specific group
router.post('/mark-read/:groupId', authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    console.log('Mark as read request:', { groupId, userId: userId.toString() });

    // Get all messages in the group that aren't sent by this user
    const messages = await Message.find({ 
      Message_groupId: groupId,
      Message_sender: { $ne: userId }
    }).select('_id');

    const messageIds = messages.map(msg => msg._id);

    if (messageIds.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No messages to mark as read',
        modifiedCount: 0
      });
    }

    // Use ReadReceiptService to mark messages as read
    const result = await ReadReceiptService.markMultipleAsRead(messageIds, userId);

    console.log('Mark as read result:', { 
      upsertedCount: result.upsertedCount,
      modifiedCount: result.modifiedCount
    });

    res.json({ 
      success: true, 
      message: 'Messages marked as read',
      modifiedCount: result.upsertedCount
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error marking messages as read', 
      error: error.message 
    });
  }
});

// Mark a specific message as read
router.post('/mark-read-single/:messageId', authenticateUser, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    // Don't mark own messages as read
    if (message.Message_sender.toString() === userId.toString()) {
      return res.json({ success: true, message: 'Cannot mark own message as read' });
    }

    // Use ReadReceiptService to mark message as read
    const result = await ReadReceiptService.markAsRead(messageId, userId);

    res.json({ 
      success: true, 
      message: 'Message marked as read',
      readAt: result.readAt
    });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error marking message as read', 
      error: error.message 
    });
  }
});

// Get unread message count for a user
router.get('/unread-count', authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id;
    const { groupId } = req.query;

    if (groupId) {
      // Get unread count for specific group
      const unreadCount = await ReadReceiptService.getUnreadCount(groupId, userId);
      res.json({ 
        success: true, 
        unreadCount,
        groupId
      });
    } else {
      // Get total unread count across all groups
      // This requires getting all groups the user is in first
      const userGroups = await GroupMember.find({ 
        GroupMember_userId: userId 
      }).select('GroupMember_groupId');
      
      let totalUnreadCount = 0;
      for (const group of userGroups) {
        const count = await ReadReceiptService.getUnreadCount(group.GroupMember_groupId, userId);
        totalUnreadCount += count;
      }

      res.json({ 
        success: true, 
        unreadCount: totalUnreadCount,
        groupId: 'all'
      });
    }
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error getting unread count', 
      error: error.message 
    });
  }
});

// Get who read a specific message
router.get('/:messageId/readers', authenticateUser, async (req, res) => {
  try {
    const { messageId } = req.params;
    const limit = parseInt(req.query.limit) || 20;

    const readers = await ReadReceiptService.getMessageReaders(messageId, limit);

    res.json({ 
      success: true, 
      readers: readers.map(reader => ({
        userId: reader.userId._id,
        userName: reader.userId.User_name,
        readAt: reader.readAt
      }))
    });
  } catch (error) {
    console.error('Error getting message readers:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error getting message readers', 
      error: error.message 
    });
  }
});

// Get read count for a specific message
router.get('/:messageId/read-count', authenticateUser, async (req, res) => {
  try {
    const { messageId } = req.params;

    const readCount = await ReadReceiptService.getReadCount(messageId);

    res.json({ 
      success: true, 
      readCount
    });
  } catch (error) {
    console.error('Error getting read count:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error getting read count', 
      error: error.message 
    });
  }
});

// Multi-group messaging endpoint
router.post('/multi-group', authenticateUser, async (req, res) => {
  const { groupIds, Message_content, Message_timestamp } = req.body;
  const Message_sender = req.user._id;
  
  // Validate required fields
  if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
    return res.status(400).json({ message: 'Group IDs array is required' });
  }
  
  if (!Message_content || !Message_timestamp) {
    return res.status(400).json({ message: 'Message content and timestamp are required' });
  }

  try {
    const results = [];
    const errors = [];

    // Send message to each group
    for (const groupId of groupIds) {
      try {
        // Verify group exists and user is a member
        const group = await Group.findById(groupId);
        if (!group) {
          errors.push({ groupId, error: 'Group not found' });
          continue;
        }

        // Check if user is a member of the group
        const isMember = await GroupMember.findOne({
          GroupMember_groupId: groupId,
          GroupMember_userId: Message_sender
        });

        if (!isMember) {
          errors.push({ groupId, error: 'User is not a member of this group' });
          continue;
        }

        // Create message for this group
        const newMessage = new Message({
          Message_groupId: groupId,
          Message_sender,
          Message_content,
          Message_type: 'text',
          Message_timestamp
        });

        await newMessage.save();

        // Populate sender and file info before returning
        const savedMessage = await Message.findById(newMessage._id)
          .populate('Message_sender', 'User_name')
          .populate('Message_fileId', 'File_originalName File_url File_type File_size File_sizeFormatted')
          .populate({
            path: 'Message_replyTo',
            populate: [
              {
                path: 'Message_sender',
                select: 'User_name' 
              },
              {
                path: 'Message_fileId',
                select: 'File_originalName File_type'
              }
            ],
            select: 'Message_content Message_sender Message_type Message_fileId'
          });

        results.push({
          groupId,
          message: savedMessage,
          success: true
        });

        // Create notifications for group members (except sender)
        try {
          const groupMembers = await GroupMember.find({ 
            GroupMember_groupId: groupId 
          });
          
          if (groupMembers.length > 0) {
            const io = req.app.get('io');
            const notificationNamespace = req.app.get('notificationNamespace');
            const notificationService = new NotificationService(io, notificationNamespace);
            await notificationService.createMessageNotification(savedMessage, groupMembers);
          }
        } catch (notificationError) {
          console.error('Error creating multi-group message notifications:', notificationError);
          // Don't fail the message creation if notification fails
        }

      } catch (error) {
        console.error(`Error sending message to group ${groupId}:`, error);
        errors.push({ groupId, error: error.message });
      }
    }

    res.status(201).json({
      success: true,
      results,
      errors,
      totalSent: results.length,
      totalFailed: errors.length
    });

  } catch (error) {
    console.error('Error in multi-group messaging:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error sending multi-group message', 
      error: error.message 
    });
  }
});

// Multi-group file upload endpoint
router.post('/multi-group-upload', authenticateUser, upload.single('file'), async (req, res) => {
  const { groupIds, timestamp, content } = req.body;

  if (!req.file) {
    return res.status(400).json({ message: 'File is required' });
  }

  if (!groupIds) {
    return res.status(400).json({ message: 'Group IDs are required' });
  }

  // Parse groupIds if it's a string
  let parsedGroupIds;
  try {
    parsedGroupIds = typeof groupIds === 'string' ? JSON.parse(groupIds) : groupIds;
  } catch (error) {
    return res.status(400).json({ message: 'Invalid group IDs format' });
  }

  if (!Array.isArray(parsedGroupIds) || parsedGroupIds.length === 0) {
    return res.status(400).json({ message: 'Group IDs must be a non-empty array' });
  }

  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  
  // Determine file type based on MIME type
  let fileType = 'other';
  if (req.file.mimetype.startsWith('image/')) fileType = 'image';
  else if (req.file.mimetype.startsWith('video/')) fileType = 'video';
  else if (req.file.mimetype.startsWith('audio/')) fileType = 'audio';
  else if (req.file.mimetype.includes('pdf') || req.file.mimetype.includes('document')) fileType = 'document';

  try {
    const results = [];
    const errors = [];

    // Send file to each group
    for (const groupId of parsedGroupIds) {
      try {
        // Verify group exists and user is a member
        const group = await Group.findById(groupId);
        if (!group) {
          errors.push({ groupId, error: 'Group not found' });
          continue;
        }

        // Check if user is a member of the group
        const isMember = await GroupMember.findOne({
          GroupMember_groupId: groupId,
          GroupMember_userId: req.user._id
        });

        if (!isMember) {
          errors.push({ groupId, error: 'User is not a member of this group' });
          continue;
        }

        // Create File record for this group
        const newFile = new File({
          File_originalName: req.file.originalname,
          File_fileName: req.file.filename,
          File_filePath: req.file.path,
          File_url: fileUrl,
          File_fileSize: req.file.size,
          File_mimeType: req.file.mimetype,
          File_type: fileType,
          File_category: fileType,
          File_uploadedBy: req.user._id,
          File_groupId: groupId
        });

        await newFile.save();

        // Determine message type
        let messageType = 'file';
        if (content && content.trim()) {
          messageType = 'mixed'; // Has both text and file
        }

        // Create Message record with file reference
        const newMessage = new Message({
          Message_groupId: groupId,
          Message_sender: req.user._id,
          Message_content: content || '',
          Message_type: messageType,
          Message_fileId: newFile._id,
          Message_timestamp: timestamp
        });

        await newMessage.save();

        // Update file with message reference
        newFile.File_messageId = newMessage._id;
        await newFile.save();

        // Populate sender and file info before returning
        const savedMessage = await Message.findById(newMessage._id)
          .populate('Message_sender', 'User_name')
          .populate('Message_fileId', 'File_originalName File_url File_type File_size File_sizeFormatted')
          .populate({
            path: 'Message_replyTo',
            populate: [
              {
                path: 'Message_sender',
                select: 'User_name' 
              },
              {
                path: 'Message_fileId',
                select: 'File_originalName File_type'
              }
            ],
            select: 'Message_content Message_sender Message_type Message_fileId'
          });

        results.push({
          groupId,
          message: savedMessage,
          success: true
        });

        // Create notifications for group members (except sender)
        try {
          const groupMembers = await GroupMember.find({ 
            GroupMember_groupId: groupId 
          });
          
          if (groupMembers.length > 0) {
            const io = req.app.get('io');
            const notificationNamespace = req.app.get('notificationNamespace');
            const notificationService = new NotificationService(io, notificationNamespace);
            await notificationService.createMessageNotification(savedMessage, groupMembers);
          }
        } catch (notificationError) {
          console.error('Error creating multi-group file message notifications:', notificationError);
          // Don't fail the message creation if notification fails
        }

      } catch (error) {
        console.error(`Error sending file to group ${groupId}:`, error);
        errors.push({ groupId, error: error.message });
      }
    }

    res.status(201).json({
      success: true,
      results,
      errors,
      totalSent: results.length,
      totalFailed: errors.length
    });

  } catch (error) {
    console.error('Error in multi-group file upload:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error uploading file to multiple groups', 
      error: error.message 
    });
  }
});

module.exports = router;
// Search messages
router.get('/search', authenticateUser, async (req, res) => {
  try {
    const { q, limit = 5, type } = req.query;
    const userId = req.user._id;

    if (!q || q.trim().length === 0) {
      return res.json({ messages: [] });
    }

    // Get groups where user is a member
    const userGroups = await GroupMember.find({ 
      GroupMember_userId: userId 
    }).select('GroupMember_groupId');
    
    const groupIds = userGroups.map(member => member.GroupMember_groupId);

    // Build search query
    let searchQuery = {
      Message_groupId: { $in: groupIds },
      $or: [
        { Message_content: { $regex: q, $options: 'i' } }
      ]
    };

    // Add message type filter if specified
    if (type && ['text', 'file', 'mixed', 'reply'].includes(type)) {
      searchQuery.Message_type = type;
    }

    // Search messages in user's groups
    const messages = await Message.find(searchQuery)
      .limit(parseInt(limit))
      .populate('Message_sender', 'User_name User_email')
      .populate('Message_groupId', 'Group_name')
      .populate('Message_fileId', 'File_originalName File_type File_url')
      .sort({ Message_createdAt: -1 });

    // Format messages for frontend
    const formattedMessages = messages.map(message => ({
      ...message.toObject(),
      senderName: message.Message_sender?.User_name,
      groupName: message.Message_groupId?.Group_name,
      fileName: message.Message_fileId?.File_originalName,
      fileType: message.Message_fileId?.File_type,
      fileUrl: message.Message_fileId?.File_url
    }));

    res.json({ 
      success: true, 
      messages: formattedMessages,
      total: formattedMessages.length
    });
  } catch (error) {
    console.error('Message search error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error searching messages', 
      error: error.message 
    });
  }
});

// Get messages by type
router.get('/by-type/:type', authenticateUser, async (req, res) => {
  try {
    const { type } = req.params;
    const { groupId, limit = 20 } = req.query;
    const userId = req.user._id;

    if (!['text', 'file', 'mixed', 'reply'].includes(type)) {
      return res.status(400).json({ message: 'Invalid message type' });
    }

    let query = { Message_type: type };

    if (groupId) {
      query.Message_groupId = groupId;
    } else {
      // Get groups where user is a member
      const userGroups = await GroupMember.find({ 
        GroupMember_userId: userId 
      }).select('GroupMember_groupId');
      
      const groupIds = userGroups.map(member => member.GroupMember_groupId);
      query.Message_groupId = { $in: groupIds };
    }

    const messages = await Message.find(query)
      .limit(parseInt(limit))
      .populate('Message_sender', 'User_name')
      .populate('Message_fileId', 'File_originalName File_url File_type File_size')
      .populate('Message_groupId', 'Group_name')
      .sort({ Message_createdAt: -1 });

    res.json({ 
      success: true, 
      messages,
      total: messages.length,
      type
    });
  } catch (error) {
    console.error('Error fetching messages by type:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching messages by type', 
      error: error.message 
    });
  }
});
// Get all files in a group
router.get('/files/group/:groupId', authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { type, limit = 50, page = 1 } = req.query;
    
    // Build query
    let query = { File_groupId: groupId };
    if (type && ['image', 'document', 'video', 'audio', 'other'].includes(type)) {
      query.File_type = type;
    }
    
    // Get files with pagination
    const files = await File.find(query)
      .populate('File_uploadedBy', 'User_name')
      .populate('File_messageId', 'Message_content Message_createdAt')
      .sort({ File_createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await File.countDocuments(query);
    
    res.json({
      success: true,
      files,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalFiles: total
      }
    });
  } catch (error) {
    console.error('Error fetching group files:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching group files', 
      error: error.message 
    });
  }
});

// Get group file statistics
router.get('/files/stats/:groupId', authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const stats = await File.aggregate([
      { $match: { File_groupId: mongoose.Types.ObjectId(groupId) } },
      {
        $group: {
          _id: '$File_type',
          count: { $sum: 1 },
          totalSize: { $sum: '$File_size' }
        }
      }
    ]);
    
    const totalStats = await File.aggregate([
      { $match: { File_groupId: mongoose.Types.ObjectId(groupId) } },
      {
        $group: {
          _id: null,
          totalFiles: { $sum: 1 },
          totalSize: { $sum: '$File_size' }
        }
      }
    ]);
    
    res.json({
      success: true,
      byType: stats,
      total: totalStats[0] || { totalFiles: 0, totalSize: 0 }
    });
  } catch (error) {
    console.error('Error fetching file stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching file stats', 
      error: error.message 
    });
  }
});
