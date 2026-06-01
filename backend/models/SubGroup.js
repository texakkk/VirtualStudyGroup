const mongoose = require('mongoose');

const SubGroupSchema = new mongoose.Schema({
  SubGroup_parentGroupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  SubGroup_name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  SubGroup_description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  SubGroup_type: {
    type: String,
    enum: ['channel', 'project', 'study-session', 'discussion', 'announcement'],
    required: true,
    default: 'channel'
  },
  SubGroup_createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  SubGroup_members: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['admin', 'moderator', 'member'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    lastActive: {
      type: Date,
      default: Date.now
    }
  }],
  SubGroup_settings: {
    isPrivate: {
      type: Boolean,
      default: false
    },
    allowAllParentMembers: {
      type: Boolean,
      default: true
    },
    requireApproval: {
      type: Boolean,
      default: false
    },
    maxMembers: {
      type: Number,
      default: null // null means unlimited
    }
  },
  SubGroup_permissions: {
    postMessages: {
      type: String,
      enum: ['admin', 'moderator', 'member'],
      default: 'member'
    },
    shareFiles: {
      type: String,
      enum: ['admin', 'moderator', 'member'],
      default: 'member'
    },
    inviteMembers: {
      type: String,
      enum: ['admin', 'moderator', 'member'],
      default: 'moderator'
    },
    manageContent: {
      type: String,
      enum: ['admin', 'moderator'],
      default: 'moderator'
    }
  },
  SubGroup_statistics: {
    totalMessages: {
      type: Number,
      default: 0
    },
    totalFiles: {
      type: Number,
      default: 0
    },
    activeMembers: {
      type: Number,
      default: 0
    },
    lastActivity: {
      type: Date,
      default: Date.now
    }
  },
  SubGroup_isActive: {
    type: Boolean,
    default: true
  },
  SubGroup_archivedAt: {
    type: Date,
    default: null
  },
  SubGroup_createdAt: { type: Date, default: Date.now },
  SubGroup_updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: {
    createdAt: 'SubGroup_createdAt',
    updatedAt: 'SubGroup_updatedAt',
    currentTime: () => new Date()
  },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound index to ensure unique sub-group names within a parent group
SubGroupSchema.index({ 
  SubGroup_parentGroupId: 1, 
  SubGroup_name: 1 
}, { unique: true });

// Index for efficient member queries
SubGroupSchema.index({ 'SubGroup_members.userId': 1 });

// Virtual for parent group details
SubGroupSchema.virtual('parentGroup', {
  ref: 'Group',
  localField: 'SubGroup_parentGroupId',
  foreignField: '_id',
  justOne: true
});

// Virtual for creator details
SubGroupSchema.virtual('creator', {
  ref: 'User',
  localField: 'SubGroup_createdBy',
  foreignField: '_id',
  justOne: true
});

// Method to check if a user is a member of this sub-group
SubGroupSchema.methods.isMember = function(userId) {
  return this.SubGroup_members.some(member => 
    member.userId.toString() === userId.toString()
  );
};

// Method to get a member's role in this sub-group
SubGroupSchema.methods.getMemberRole = function(userId) {
  const member = this.SubGroup_members.find(member => 
    member.userId.toString() === userId.toString()
  );
  return member ? member.role : null;
};

// Method to check if a user has permission for a specific action
SubGroupSchema.methods.hasPermission = function(userId, action) {
  const memberRole = this.getMemberRole(userId);
  if (!memberRole) return false;

  const requiredRole = this.SubGroup_permissions[action];
  if (!requiredRole) return false;

  // Role hierarchy: admin > moderator > member
  const roleHierarchy = {
    'admin': 3,
    'moderator': 2,
    'member': 1
  };

  return roleHierarchy[memberRole] >= roleHierarchy[requiredRole];
};

// Method to add a member to the sub-group
SubGroupSchema.methods.addMember = function(userId, role = 'member') {
  // Check if user is already a member
  const existingMemberIndex = this.SubGroup_members.findIndex(member => 
    member.userId.toString() === userId.toString()
  );

  if (existingMemberIndex !== -1) {
    // Update existing member's role
    this.SubGroup_members[existingMemberIndex].role = role;
    this.SubGroup_members[existingMemberIndex].lastActive = new Date();
  } else {
    // Add new member
    this.SubGroup_members.push({
      userId: userId,
      role: role,
      joinedAt: new Date(),
      lastActive: new Date()
    });
  }

  this.SubGroup_statistics.activeMembers = this.SubGroup_members.length;
  return this.save();
};

// Method to remove a member from the sub-group
SubGroupSchema.methods.removeMember = function(userId) {
  this.SubGroup_members = this.SubGroup_members.filter(member => 
    member.userId.toString() !== userId.toString()
  );
  this.SubGroup_statistics.activeMembers = this.SubGroup_members.length;
  return this.save();
};

// Method to update member's last active timestamp
SubGroupSchema.methods.updateMemberActivity = function(userId) {
  const member = this.SubGroup_members.find(member => 
    member.userId.toString() === userId.toString()
  );
  
  if (member) {
    member.lastActive = new Date();
    this.SubGroup_statistics.lastActivity = new Date();
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to archive the sub-group
SubGroupSchema.methods.archive = function() {
  this.SubGroup_isActive = false;
  this.SubGroup_archivedAt = new Date();
  return this.save();
};

// Method to restore the sub-group
SubGroupSchema.methods.restore = function() {
  this.SubGroup_isActive = true;
  this.SubGroup_archivedAt = null;
  return this.save();
};

// Method to increment message count
SubGroupSchema.methods.incrementMessageCount = function() {
  this.SubGroup_statistics.totalMessages += 1;
  this.SubGroup_statistics.lastActivity = new Date();
  return this.save();
};

// Method to increment file count
SubGroupSchema.methods.incrementFileCount = function() {
  this.SubGroup_statistics.totalFiles += 1;
  this.SubGroup_statistics.lastActivity = new Date();
  return this.save();
};

// Static method to find sub-groups by parent group
SubGroupSchema.statics.findByParentGroup = function(parentGroupId, includeArchived = false) {
  const query = { SubGroup_parentGroupId: parentGroupId };
  if (!includeArchived) {
    query.SubGroup_isActive = true;
  }
  return this.find(query).sort({ SubGroup_createdAt: -1 });
};

// Static method to find sub-groups where user is a member
SubGroupSchema.statics.findByMember = function(userId, includeArchived = false) {
  const query = { 'SubGroup_members.userId': userId };
  if (!includeArchived) {
    query.SubGroup_isActive = true;
  }
  return this.find(query).sort({ SubGroup_createdAt: -1 });
};

const SubGroup = mongoose.model('SubGroup', SubGroupSchema);

module.exports = SubGroup;