const mongoose = require('mongoose');

const WhiteboardElementSchema = new mongoose.Schema({
  elementId: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    enum: ['line', 'rectangle', 'circle', 'text', 'image', 'arrow', 'freehand'],
    required: true
  },
  data: {
    // For lines and freehand drawing
    points: [{
      x: Number,
      y: Number
    }],
    // For shapes (rectangle, circle)
    x: Number,
    y: Number,
    width: Number,
    height: Number,
    radius: Number,
    // For text
    text: String,
    fontSize: Number,
    fontFamily: String,
    // For images
    imageUrl: String,
    imageWidth: Number,
    imageHeight: Number,
    // Common styling properties
    strokeColor: {
      type: String,
      default: '#000000'
    },
    fillColor: {
      type: String,
      default: 'transparent'
    },
    strokeWidth: {
      type: Number,
      default: 2
    },
    opacity: {
      type: Number,
      default: 1,
      min: 0,
      max: 1
    },
    // Transformation properties
    rotation: {
      type: Number,
      default: 0
    },
    scaleX: {
      type: Number,
      default: 1
    },
    scaleY: {
      type: Number,
      default: 1
    }
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  zIndex: {
    type: Number,
    default: 0
  }
}, {
  _id: false // Don't create separate _id for subdocuments
});

const WhiteboardSchema = new mongoose.Schema({
  Whiteboard_name: {
    type: String,
    required: [true, 'Please provide a whiteboard name'],
    trim: true,
    maxlength: [100, 'Whiteboard name cannot exceed 100 characters']
  },
  Whiteboard_groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  Whiteboard_createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  Whiteboard_elements: [WhiteboardElementSchema],
  Whiteboard_permissions: {
    read: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    write: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    admin: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  },
  Whiteboard_settings: {
    backgroundColor: {
      type: String,
      default: '#ffffff'
    },
    gridEnabled: {
      type: Boolean,
      default: true
    },
    gridSize: {
      type: Number,
      default: 20
    },
    snapToGrid: {
      type: Boolean,
      default: false
    },
    width: {
      type: Number,
      default: 1920
    },
    height: {
      type: Number,
      default: 1080
    }
  },
  Whiteboard_activeUsers: [{
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
      x: {
        type: Number,
        default: 0
      },
      y: {
        type: Number,
        default: 0
      }
    },
    selectedTool: {
      type: String,
      enum: ['select', 'pen', 'line', 'rectangle', 'circle', 'text', 'eraser'],
      default: 'select'
    },
    toolSettings: {
      strokeColor: {
        type: String,
        default: '#000000'
      },
      fillColor: {
        type: String,
        default: 'transparent'
      },
      strokeWidth: {
        type: Number,
        default: 2
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
  Whiteboard_version: {
    type: Number,
    default: 1,
    min: 1
  },
  Whiteboard_isPublic: {
    type: Boolean,
    default: false
  },
  Whiteboard_createdAt: {
    type: Date,
    default: Date.now
  },
  Whiteboard_updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: {
    createdAt: 'Whiteboard_createdAt',
    updatedAt: 'Whiteboard_updatedAt'
  },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient querying
WhiteboardSchema.index({ Whiteboard_groupId: 1, Whiteboard_createdAt: -1 });
WhiteboardSchema.index({ Whiteboard_createdBy: 1, Whiteboard_createdAt: -1 });
WhiteboardSchema.index({ 'Whiteboard_permissions.read': 1 });
WhiteboardSchema.index({ 'Whiteboard_permissions.write': 1 });
WhiteboardSchema.index({ Whiteboard_isPublic: 1, Whiteboard_groupId: 1 });

// Method to check if user has read permission
WhiteboardSchema.methods.hasReadPermission = function(userId) {
  // Creator always has read permission
  if (this.Whiteboard_createdBy.toString() === userId.toString()) {
    return true;
  }
  
  // Check if user is in read permissions
  if (this.Whiteboard_permissions.read.some(id => id.toString() === userId.toString())) {
    return true;
  }
  
  // Check if user has write or admin permissions (which include read)
  if (this.Whiteboard_permissions.write.some(id => id.toString() === userId.toString()) ||
      this.Whiteboard_permissions.admin.some(id => id.toString() === userId.toString())) {
    return true;
  }
  
  return false;
};

// Method to check if user has write permission
WhiteboardSchema.methods.hasWritePermission = function(userId) {
  // Creator always has write permission
  if (this.Whiteboard_createdBy.toString() === userId.toString()) {
    return true;
  }
  
  // Check if user is in write permissions
  if (this.Whiteboard_permissions.write.some(id => id.toString() === userId.toString())) {
    return true;
  }
  
  // Check if user has admin permissions (which include write)
  if (this.Whiteboard_permissions.admin.some(id => id.toString() === userId.toString())) {
    return true;
  }
  
  return false;
};

// Method to check if user has admin permission
WhiteboardSchema.methods.hasAdminPermission = function(userId) {
  // Creator always has admin permission
  if (this.Whiteboard_createdBy.toString() === userId.toString()) {
    return true;
  }
  
  // Check if user is in admin permissions
  if (this.Whiteboard_permissions.admin.some(id => id.toString() === userId.toString())) {
    return true;
  }
  
  return false;
};

// Method to add active user
WhiteboardSchema.methods.addActiveUser = function(userId, userName, socketId) {
  // Remove existing entry for this user if exists
  this.Whiteboard_activeUsers = this.Whiteboard_activeUsers.filter(
    user => user.userId.toString() !== userId.toString()
  );
  
  // Add new entry
  this.Whiteboard_activeUsers.push({
    userId,
    userName,
    socketId,
    cursor: { x: 0, y: 0 },
    selectedTool: 'select',
    toolSettings: {
      strokeColor: '#000000',
      fillColor: 'transparent',
      strokeWidth: 2
    },
    lastActivity: new Date()
  });
  
  return this.save();
};

// Method to remove active user
WhiteboardSchema.methods.removeActiveUser = function(userId) {
  this.Whiteboard_activeUsers = this.Whiteboard_activeUsers.filter(
    user => user.userId.toString() !== userId.toString()
  );
  return this.save();
};

// Method to update user cursor
WhiteboardSchema.methods.updateUserCursor = function(userId, cursor) {
  const userIndex = this.Whiteboard_activeUsers.findIndex(
    user => user.userId.toString() === userId.toString()
  );
  
  if (userIndex !== -1) {
    this.Whiteboard_activeUsers[userIndex].cursor = cursor;
    this.Whiteboard_activeUsers[userIndex].lastActivity = new Date();
    return this.save();
  }
  
  return Promise.resolve(this);
};

// Method to update user tool
WhiteboardSchema.methods.updateUserTool = function(userId, selectedTool, toolSettings) {
  const userIndex = this.Whiteboard_activeUsers.findIndex(
    user => user.userId.toString() === userId.toString()
  );
  
  if (userIndex !== -1) {
    this.Whiteboard_activeUsers[userIndex].selectedTool = selectedTool;
    if (toolSettings) {
      this.Whiteboard_activeUsers[userIndex].toolSettings = {
        ...this.Whiteboard_activeUsers[userIndex].toolSettings,
        ...toolSettings
      };
    }
    this.Whiteboard_activeUsers[userIndex].lastActivity = new Date();
    return this.save();
  }
  
  return Promise.resolve(this);
};

// Method to add element
WhiteboardSchema.methods.addElement = function(elementId, type, data, userId, userName) {
  // Remove existing element with same ID if exists
  this.Whiteboard_elements = this.Whiteboard_elements.filter(
    element => element.elementId !== elementId
  );
  
  // Add new element
  this.Whiteboard_elements.push({
    elementId,
    type,
    data,
    userId,
    userName,
    timestamp: new Date(),
    isDeleted: false,
    zIndex: this.Whiteboard_elements.length
  });
  
  this.Whiteboard_version += 1;
  this.Whiteboard_updatedAt = new Date();
  
  return this.save();
};

// Method to update element
WhiteboardSchema.methods.updateElement = function(elementId, data, userId) {
  const elementIndex = this.Whiteboard_elements.findIndex(
    element => element.elementId === elementId && !element.isDeleted
  );
  
  if (elementIndex !== -1) {
    // Check if user has permission to edit this element
    const element = this.Whiteboard_elements[elementIndex];
    if (element.userId.toString() === userId.toString() || this.hasWritePermission(userId)) {
      this.Whiteboard_elements[elementIndex].data = {
        ...this.Whiteboard_elements[elementIndex].data,
        ...data
      };
      this.Whiteboard_elements[elementIndex].timestamp = new Date();
      this.Whiteboard_version += 1;
      this.Whiteboard_updatedAt = new Date();
      return this.save();
    }
  }
  
  return Promise.resolve(this);
};

// Method to delete element
WhiteboardSchema.methods.deleteElement = function(elementId, userId) {
  const elementIndex = this.Whiteboard_elements.findIndex(
    element => element.elementId === elementId && !element.isDeleted
  );
  
  if (elementIndex !== -1) {
    // Check if user has permission to delete this element
    const element = this.Whiteboard_elements[elementIndex];
    if (element.userId.toString() === userId.toString() || this.hasWritePermission(userId)) {
      this.Whiteboard_elements[elementIndex].isDeleted = true;
      this.Whiteboard_elements[elementIndex].timestamp = new Date();
      this.Whiteboard_version += 1;
      this.Whiteboard_updatedAt = new Date();
      return this.save();
    }
  }
  
  return Promise.resolve(this);
};

// Method to get active elements (not deleted)
WhiteboardSchema.methods.getActiveElements = function() {
  return this.Whiteboard_elements
    .filter(element => !element.isDeleted)
    .sort((a, b) => a.zIndex - b.zIndex);
};

// Method to add permission
WhiteboardSchema.methods.addPermission = function(userId, permissionType) {
  if (!['read', 'write', 'admin'].includes(permissionType)) {
    throw new Error('Invalid permission type');
  }
  
  if (!this.Whiteboard_permissions[permissionType].some(id => id.toString() === userId.toString())) {
    this.Whiteboard_permissions[permissionType].push(userId);
  }
  return this.save();
};

// Method to remove permission
WhiteboardSchema.methods.removePermission = function(userId, permissionType) {
  if (!['read', 'write', 'admin'].includes(permissionType)) {
    throw new Error('Invalid permission type');
  }
  
  this.Whiteboard_permissions[permissionType] = this.Whiteboard_permissions[permissionType].filter(
    id => id.toString() !== userId.toString()
  );
  return this.save();
};

const Whiteboard = mongoose.model('Whiteboard', WhiteboardSchema);
module.exports = Whiteboard;