const mongoose = require('mongoose');

const GroupMemberSchema = new mongoose.Schema({
  GroupMember_groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  GroupMember_userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  GroupMember_role: {
    type: String,
    enum: ['admin', 'moderator', 'member'],
    default: 'member'
  },
  GroupMember_joinedAt: {
    type: Date,
    default: Date.now
  },
  GroupMember_lastActive: {
    type: Date,
    default: Date.now
  },
  GroupMember_permissions: {
    canInviteMembers: {
      type: Boolean,
      default: false
    },
    canCreateTasks: {
      type: Boolean,
      default: true
    },
    canShareFiles: {
      type: Boolean,
      default: true
    },
    canModerateContent: {
      type: Boolean,
      default: false
    },
    canCreateSubGroups: {
      type: Boolean,
      default: false
    },
    canManageCalendar: {
      type: Boolean,
      default: false
    },
    canAccessAnalytics: {
      type: Boolean,
      default: false
    }
  },
  GroupMember_statistics: {
    messagesCount: {
      type: Number,
      default: 0
    },
    filesShared: {
      type: Number,
      default: 0
    },
    tasksCreated: {
      type: Number,
      default: 0
    },
    participationScore: {
      type: Number,
      default: 0
    }
  },
  GroupMember_status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'pending'],
    default: 'active'
  },
  GroupMember_invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  GroupMember_createdAt: { type: Date, default: Date.now },
  GroupMember_updatedAt: { type: Date, default: Date.now },
}, { 
  timestamps: {
    createdAt: 'GroupMember_createdAt',
    updatedAt: 'GroupMember_updatedAt',
    currentTime: () => new Date()
  },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create a compound index to ensure a user can only be a member of a group once
GroupMemberSchema.index({ GroupMember_groupId: 1, GroupMember_userId: 1 }, { unique: true });

// Virtual for user details
GroupMemberSchema.virtual('user', {
  ref: 'User',
  localField: 'GroupMember_userId',
  foreignField: '_id',
  justOne: true
});

// Virtual for group details
GroupMemberSchema.virtual('group', {
  ref: 'Group',
  localField: 'GroupMember_groupId',
  foreignField: '_id',
  justOne: true
});

// Add a method to check if member is admin
GroupMemberSchema.methods.isAdmin = function() {
  return this.GroupMember_role === 'admin';
};

// Add a method to check if member is moderator or admin
GroupMemberSchema.methods.isModerator = function() {
  return this.GroupMember_role === 'moderator' || this.GroupMember_role === 'admin';
};

// Method to check if member has a specific permission
GroupMemberSchema.methods.hasPermission = function(permission) {
  // Admins have all permissions
  if (this.GroupMember_role === 'admin') {
    return true;
  }
  
  // Check specific permission
  return this.GroupMember_permissions[permission] === true;
};

// Method to update permissions based on role
GroupMemberSchema.methods.updatePermissionsForRole = function() {
  switch (this.GroupMember_role) {
    case 'admin':
      this.GroupMember_permissions = {
        canInviteMembers: true,
        canCreateTasks: true,
        canShareFiles: true,
        canModerateContent: true,
        canCreateSubGroups: true,
        canManageCalendar: true,
        canAccessAnalytics: true
      };
      break;
    case 'moderator':
      this.GroupMember_permissions = {
        canInviteMembers: true,
        canCreateTasks: true,
        canShareFiles: true,
        canModerateContent: true,
        canCreateSubGroups: false,
        canManageCalendar: true,
        canAccessAnalytics: false
      };
      break;
    case 'member':
    default:
      this.GroupMember_permissions = {
        canInviteMembers: false,
        canCreateTasks: true,
        canShareFiles: true,
        canModerateContent: false,
        canCreateSubGroups: false,
        canManageCalendar: false,
        canAccessAnalytics: false
      };
      break;
  }
};

// Update last active timestamp
GroupMemberSchema.methods.updateLastActive = function() {
  this.GroupMember_lastActive = new Date();
  return this.save();
};

// Method to increment message count
GroupMemberSchema.methods.incrementMessageCount = function() {
  this.GroupMember_statistics.messagesCount += 1;
  this.GroupMember_statistics.participationScore += 1;
  this.GroupMember_lastActive = new Date();
  return this.save();
};

// Method to increment files shared count
GroupMemberSchema.methods.incrementFilesShared = function() {
  this.GroupMember_statistics.filesShared += 1;
  this.GroupMember_statistics.participationScore += 2;
  this.GroupMember_lastActive = new Date();
  return this.save();
};

// Method to increment tasks created count
GroupMemberSchema.methods.incrementTasksCreated = function() {
  this.GroupMember_statistics.tasksCreated += 1;
  this.GroupMember_statistics.participationScore += 3;
  this.GroupMember_lastActive = new Date();
  return this.save();
};

// Method to suspend member
GroupMemberSchema.methods.suspend = function() {
  this.GroupMember_status = 'suspended';
  return this.save();
};

// Method to activate member
GroupMemberSchema.methods.activate = function() {
  this.GroupMember_status = 'active';
  return this.save();
};

// Pre-save hook to ensure required fields and update permissions
GroupMemberSchema.pre('save', function() {
  const now = new Date();
  if (this.isNew) {
    this.GroupMember_joinedAt = now;
    this.GroupMember_createdAt = now;
    this.updatePermissionsForRole();
  }
  
  // Update permissions if role has changed
  if (this.isModified('GroupMember_role')) {
    this.updatePermissionsForRole();
  }
  
  this.GroupMember_lastActive = now;
  this.GroupMember_updatedAt = now;
});

const GroupMember = mongoose.model('GroupMember', GroupMemberSchema);

module.exports = GroupMember;
