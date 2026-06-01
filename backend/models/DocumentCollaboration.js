const mongoose = require('mongoose');

const DocumentCollaborationSchema = new mongoose.Schema({
  DocCollab_documentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Note',
    required: true
  },
  DocCollab_activeUsers: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    userName: {
      type: String,
      required: true
    },
    cursor: {
      type: Number,
      default: 0,
      min: 0
    },
    selection: {
      start: {
        type: Number,
        default: 0,
        min: 0
      },
      end: {
        type: Number,
        default: 0,
        min: 0
      }
    },
    lastActivity: {
      type: Date,
      default: Date.now
    },
    socketId: {
      type: String,
      required: true
    }
  }],
  DocCollab_changes: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    operation: {
      type: String,
      enum: ['insert', 'delete', 'format', 'replace'],
      required: true
    },
    position: {
      type: Number,
      required: true,
      min: 0
    },
    length: {
      type: Number,
      default: 0,
      min: 0
    },
    content: {
      type: String,
      default: ''
    },
    attributes: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    changeId: {
      type: String,
      required: true,
      unique: true
    }
  }],
  DocCollab_version: {
    type: Number,
    default: 1,
    min: 1
  },
  DocCollab_lastModified: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: {
    createdAt: 'DocCollab_createdAt',
    updatedAt: 'DocCollab_lastModified'
  }
});

// Indexes for efficient querying
DocumentCollaborationSchema.index({ DocCollab_documentId: 1 });
DocumentCollaborationSchema.index({ 'DocCollab_activeUsers.userId': 1 });
DocumentCollaborationSchema.index({ 'DocCollab_changes.timestamp': -1 });

// Method to add active user
DocumentCollaborationSchema.methods.addActiveUser = function(userId, userName, socketId) {
  // Remove existing entry for this user if exists
  this.DocCollab_activeUsers = this.DocCollab_activeUsers.filter(
    user => user.userId.toString() !== userId.toString()
  );
  
  // Add new entry
  this.DocCollab_activeUsers.push({
    userId,
    userName,
    socketId,
    cursor: 0,
    selection: { start: 0, end: 0 },
    lastActivity: new Date()
  });
  
  return this.save();
};

// Method to remove active user
DocumentCollaborationSchema.methods.removeActiveUser = function(userId) {
  this.DocCollab_activeUsers = this.DocCollab_activeUsers.filter(
    user => user.userId.toString() !== userId.toString()
  );
  return this.save();
};

// Method to update user cursor/selection
DocumentCollaborationSchema.methods.updateUserCursor = function(userId, cursor, selection) {
  const userIndex = this.DocCollab_activeUsers.findIndex(
    user => user.userId.toString() === userId.toString()
  );
  
  if (userIndex !== -1) {
    this.DocCollab_activeUsers[userIndex].cursor = cursor;
    if (selection) {
      this.DocCollab_activeUsers[userIndex].selection = selection;
    }
    this.DocCollab_activeUsers[userIndex].lastActivity = new Date();
    return this.save();
  }
  
  return Promise.resolve(this);
};

// Method to add change operation
DocumentCollaborationSchema.methods.addChange = function(userId, operation, position, length, content, attributes, changeId) {
  this.DocCollab_changes.push({
    userId,
    operation,
    position,
    length: length || 0,
    content: content || '',
    attributes: attributes || {},
    timestamp: new Date(),
    changeId
  });
  
  this.DocCollab_version += 1;
  this.DocCollab_lastModified = new Date();
  
  return this.save();
};

// Method to get changes since version
DocumentCollaborationSchema.methods.getChangesSinceVersion = function(version) {
  return this.DocCollab_changes.filter(change => {
    // Find the change that corresponds to the version
    const changeIndex = this.DocCollab_changes.indexOf(change);
    return changeIndex >= version - 1;
  });
};

// Method to clean up old changes (keep last 1000 changes)
DocumentCollaborationSchema.methods.cleanupOldChanges = function() {
  if (this.DocCollab_changes.length > 1000) {
    this.DocCollab_changes = this.DocCollab_changes.slice(-1000);
    return this.save();
  }
  return Promise.resolve(this);
};

// Static method to find or create collaboration session
DocumentCollaborationSchema.statics.findOrCreate = async function(documentId) {
  let collaboration = await this.findOne({ DocCollab_documentId: documentId });
  
  if (!collaboration) {
    collaboration = new this({
      DocCollab_documentId: documentId,
      DocCollab_activeUsers: [],
      DocCollab_changes: [],
      DocCollab_version: 1
    });
    await collaboration.save();
  }
  
  return collaboration;
};

const DocumentCollaboration = mongoose.model('DocumentCollaboration', DocumentCollaborationSchema);
module.exports = DocumentCollaboration;