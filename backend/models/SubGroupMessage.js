const mongoose = require('mongoose');

const SubGroupMessageSchema = new mongoose.Schema({
  SubGroupMessage_subGroupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubGroup',
    required: true,
    index: true
  },
  SubGroupMessage_parentGroupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  SubGroupMessage_senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  SubGroupMessage_content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  SubGroupMessage_type: {
    type: String,
    enum: ['text', 'file', 'image', 'link', 'announcement', 'poll', 'task-reference'],
    default: 'text'
  },
  SubGroupMessage_metadata: {
    // For file messages
    fileName: String,
    fileSize: Number,
    fileType: String,
    fileUrl: String,
    
    // For link messages
    linkUrl: String,
    linkTitle: String,
    linkDescription: String,
    linkImage: String,
    
    // For polls
    pollOptions: [{
      option: String,
      votes: [{
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        votedAt: {
          type: Date,
          default: Date.now
        }
      }]
    }],
    pollExpiresAt: Date,
    
    // For task references
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task'
    },
    
    // For announcements
    isPinned: {
      type: Boolean,
      default: false
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal'
    }
  },
  SubGroupMessage_replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubGroupMessage',
    default: null
  },
  SubGroupMessage_reactions: [{
    emoji: {
      type: String,
      required: true
    },
    users: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      reactedAt: {
        type: Date,
        default: Date.now
      }
    }]
  }],
  SubGroupMessage_mentions: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    mentionType: {
      type: String,
      enum: ['user', 'everyone', 'here'],
      default: 'user'
    }
  }],
  SubGroupMessage_isEdited: {
    type: Boolean,
    default: false
  },
  SubGroupMessage_editHistory: [{
    content: String,
    editedAt: {
      type: Date,
      default: Date.now
    }
  }],
  SubGroupMessage_isDeleted: {
    type: Boolean,
    default: false
  },
  SubGroupMessage_deletedAt: {
    type: Date,
    default: null
  },
  SubGroupMessage_readBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  SubGroupMessage_createdAt: { type: Date, default: Date.now },
  SubGroupMessage_updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: {
    createdAt: 'SubGroupMessage_createdAt',
    updatedAt: 'SubGroupMessage_updatedAt',
    currentTime: () => new Date()
  },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient querying
SubGroupMessageSchema.index({ 
  SubGroupMessage_subGroupId: 1, 
  SubGroupMessage_createdAt: -1 
});
SubGroupMessageSchema.index({ SubGroupMessage_senderId: 1 });
SubGroupMessageSchema.index({ 'SubGroupMessage_mentions.userId': 1 });
SubGroupMessageSchema.index({ SubGroupMessage_replyTo: 1 });

// Virtual for sender details
SubGroupMessageSchema.virtual('sender', {
  ref: 'User',
  localField: 'SubGroupMessage_senderId',
  foreignField: '_id',
  justOne: true
});

// Virtual for sub-group details
SubGroupMessageSchema.virtual('subGroup', {
  ref: 'SubGroup',
  localField: 'SubGroupMessage_subGroupId',
  foreignField: '_id',
  justOne: true
});

// Virtual for reply details
SubGroupMessageSchema.virtual('replyToMessage', {
  ref: 'SubGroupMessage',
  localField: 'SubGroupMessage_replyTo',
  foreignField: '_id',
  justOne: true
});

// Method to add reaction
SubGroupMessageSchema.methods.addReaction = function(emoji, userId) {
  let reaction = this.SubGroupMessage_reactions.find(r => r.emoji === emoji);
  
  if (!reaction) {
    reaction = { emoji, users: [] };
    this.SubGroupMessage_reactions.push(reaction);
  }
  
  // Check if user already reacted with this emoji
  const existingReaction = reaction.users.find(u => 
    u.userId.toString() === userId.toString()
  );
  
  if (!existingReaction) {
    reaction.users.push({ userId, reactedAt: new Date() });
  }
  
  return this.save();
};

// Method to remove reaction
SubGroupMessageSchema.methods.removeReaction = function(emoji, userId) {
  const reaction = this.SubGroupMessage_reactions.find(r => r.emoji === emoji);
  
  if (reaction) {
    reaction.users = reaction.users.filter(u => 
      u.userId.toString() !== userId.toString()
    );
    
    // Remove reaction if no users left
    if (reaction.users.length === 0) {
      this.SubGroupMessage_reactions = this.SubGroupMessage_reactions.filter(r => 
        r.emoji !== emoji
      );
    }
  }
  
  return this.save();
};

// Method to mark as read by user
SubGroupMessageSchema.methods.markAsRead = function(userId) {
  const existingRead = this.SubGroupMessage_readBy.find(r => 
    r.userId.toString() === userId.toString()
  );
  
  if (!existingRead) {
    this.SubGroupMessage_readBy.push({ userId, readAt: new Date() });
    return this.save();
  }
  
  return Promise.resolve(this);
};

// Method to edit message
SubGroupMessageSchema.methods.editMessage = function(newContent) {
  // Save current content to history
  this.SubGroupMessage_editHistory.push({
    content: this.SubGroupMessage_content,
    editedAt: new Date()
  });
  
  this.SubGroupMessage_content = newContent;
  this.SubGroupMessage_isEdited = true;
  
  return this.save();
};

// Method to soft delete message
SubGroupMessageSchema.methods.softDelete = function() {
  this.SubGroupMessage_isDeleted = true;
  this.SubGroupMessage_deletedAt = new Date();
  return this.save();
};

// Method to check if user can edit/delete message
SubGroupMessageSchema.methods.canUserModify = function(userId) {
  return this.SubGroupMessage_senderId.toString() === userId.toString();
};

// Method to get unread count for user
SubGroupMessageSchema.statics.getUnreadCount = function(subGroupId, userId, lastReadAt) {
  const query = {
    SubGroupMessage_subGroupId: subGroupId,
    SubGroupMessage_isDeleted: false
  };
  
  if (lastReadAt) {
    query.SubGroupMessage_createdAt = { $gt: lastReadAt };
  }
  
  // Exclude messages read by the user
  query['SubGroupMessage_readBy.userId'] = { $ne: userId };
  
  return this.countDocuments(query);
};

// Method to get messages with pagination
SubGroupMessageSchema.statics.getMessages = function(subGroupId, options = {}) {
  const {
    limit = 50,
    before = null,
    after = null,
    includeDeleted = false
  } = options;
  
  let query = { SubGroupMessage_subGroupId: subGroupId };
  
  if (!includeDeleted) {
    query.SubGroupMessage_isDeleted = false;
  }
  
  if (before) {
    query.SubGroupMessage_createdAt = { $lt: new Date(before) };
  }
  
  if (after) {
    query.SubGroupMessage_createdAt = { $gt: new Date(after) };
  }
  
  return this.find(query)
    .populate('SubGroupMessage_senderId', 'User_name User_email')
    .populate('SubGroupMessage_replyTo')
    .populate('SubGroupMessage_mentions.userId', 'User_name')
    .sort({ SubGroupMessage_createdAt: -1 })
    .limit(limit);
};

// Static method to search messages
SubGroupMessageSchema.statics.searchMessages = function(subGroupId, searchTerm, options = {}) {
  const { limit = 20 } = options;
  
  return this.find({
    SubGroupMessage_subGroupId: subGroupId,
    SubGroupMessage_isDeleted: false,
    SubGroupMessage_content: { $regex: searchTerm, $options: 'i' }
  })
    .populate('SubGroupMessage_senderId', 'User_name User_email')
    .sort({ SubGroupMessage_createdAt: -1 })
    .limit(limit);
};

// Pre-save hook to update sub-group statistics
SubGroupMessageSchema.post('save', async function(doc) {
  if (this.isNew && !doc.SubGroupMessage_isDeleted) {
    try {
      const SubGroup = mongoose.model('SubGroup');
      await SubGroup.findByIdAndUpdate(
        doc.SubGroupMessage_subGroupId,
        { 
          $inc: { 'SubGroup_statistics.totalMessages': 1 },
          $set: { 'SubGroup_statistics.lastActivity': new Date() }
        }
      );
    } catch (error) {
      console.error('Error updating sub-group statistics:', error);
    }
  }
});

const SubGroupMessage = mongoose.model('SubGroupMessage', SubGroupMessageSchema);

module.exports = SubGroupMessage;