const mongoose = require('mongoose');

const CrossGroupCollaborationSchema = new mongoose.Schema({
  CrossGroupCollab_initiatorGroupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  CrossGroupCollab_participantGroups: [{
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true
    },
    status: {
      type: String,
      enum: ['invited', 'accepted', 'declined', 'left'],
      default: 'invited'
    },
    joinedAt: {
      type: Date,
      default: null
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    respondedAt: {
      type: Date,
      default: null
    }
  }],
  CrossGroupCollab_title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  CrossGroupCollab_description: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  CrossGroupCollab_type: {
    type: String,
    enum: ['project', 'study-session', 'competition', 'resource-sharing', 'joint-event', 'other'],
    required: true
  },
  CrossGroupCollab_createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  CrossGroupCollab_settings: {
    isPublic: {
      type: Boolean,
      default: false
    },
    allowMemberInvites: {
      type: Boolean,
      default: true
    },
    requireApproval: {
      type: Boolean,
      default: true
    },
    maxParticipantGroups: {
      type: Number,
      default: 10,
      min: 2,
      max: 50
    }
  },
  CrossGroupCollab_permissions: {
    canInviteGroups: {
      type: String,
      enum: ['creator', 'admin', 'moderator', 'member'],
      default: 'admin'
    },
    canCreateSharedContent: {
      type: String,
      enum: ['creator', 'admin', 'moderator', 'member'],
      default: 'member'
    },
    canManageEvents: {
      type: String,
      enum: ['creator', 'admin', 'moderator'],
      default: 'admin'
    },
    canModerateContent: {
      type: String,
      enum: ['creator', 'admin', 'moderator'],
      default: 'moderator'
    }
  },
  CrossGroupCollab_sharedResources: [{
    resourceType: {
      type: String,
      enum: ['file', 'note', 'task', 'event', 'whiteboard', 'link'],
      required: true
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    sharedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    sharedAt: {
      type: Date,
      default: Date.now
    },
    permissions: {
      canView: {
        type: Boolean,
        default: true
      },
      canEdit: {
        type: Boolean,
        default: false
      },
      canDownload: {
        type: Boolean,
        default: true
      }
    },
    title: String,
    description: String
  }],
  CrossGroupCollab_communicationChannels: [{
    channelType: {
      type: String,
      enum: ['chat', 'forum', 'announcement', 'video-call'],
      required: true
    },
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    name: String,
    description: String,
    isActive: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  CrossGroupCollab_events: [{
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GroupEvent',
      required: true
    },
    eventType: {
      type: String,
      enum: ['meeting', 'presentation', 'workshop', 'competition', 'social'],
      required: true
    },
    isJointEvent: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  }],
  CrossGroupCollab_statistics: {
    totalParticipants: {
      type: Number,
      default: 0
    },
    totalSharedResources: {
      type: Number,
      default: 0
    },
    totalEvents: {
      type: Number,
      default: 0
    },
    totalMessages: {
      type: Number,
      default: 0
    },
    lastActivity: {
      type: Date,
      default: Date.now
    }
  },
  CrossGroupCollab_status: {
    type: String,
    enum: ['active', 'paused', 'completed', 'cancelled'],
    default: 'active'
  },
  CrossGroupCollab_startDate: {
    type: Date,
    default: Date.now
  },
  CrossGroupCollab_endDate: {
    type: Date,
    default: null
  },
  CrossGroupCollab_createdAt: { type: Date, default: Date.now },
  CrossGroupCollab_updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: {
    createdAt: 'CrossGroupCollab_createdAt',
    updatedAt: 'CrossGroupCollab_updatedAt',
    currentTime: () => new Date()
  },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient querying
CrossGroupCollaborationSchema.index({ 
  CrossGroupCollab_initiatorGroupId: 1,
  CrossGroupCollab_status: 1 
});
CrossGroupCollaborationSchema.index({ 'CrossGroupCollab_participantGroups.groupId': 1 });
CrossGroupCollaborationSchema.index({ CrossGroupCollab_createdBy: 1 });
CrossGroupCollaborationSchema.index({ CrossGroupCollab_type: 1 });

// Virtual for creator details
CrossGroupCollaborationSchema.virtual('creator', {
  ref: 'User',
  localField: 'CrossGroupCollab_createdBy',
  foreignField: '_id',
  justOne: true
});

// Virtual for initiator group details
CrossGroupCollaborationSchema.virtual('initiatorGroup', {
  ref: 'Group',
  localField: 'CrossGroupCollab_initiatorGroupId',
  foreignField: '_id',
  justOne: true
});

// Method to invite a group to collaborate
CrossGroupCollaborationSchema.methods.inviteGroup = function(groupId, invitedBy) {
  // Check if group is already invited
  const existingInvite = this.CrossGroupCollab_participantGroups.find(p => 
    p.groupId.toString() === groupId.toString()
  );
  
  if (existingInvite) {
    return Promise.reject(new Error('Group is already invited'));
  }
  
  // Check if we've reached the maximum number of participant groups
  if (this.CrossGroupCollab_participantGroups.length >= this.CrossGroupCollab_settings.maxParticipantGroups) {
    return Promise.reject(new Error('Maximum number of participant groups reached'));
  }
  
  this.CrossGroupCollab_participantGroups.push({
    groupId: groupId,
    status: 'invited',
    invitedBy: invitedBy,
    joinedAt: null,
    respondedAt: null
  });
  
  return this.save();
};

// Method to respond to collaboration invitation
CrossGroupCollaborationSchema.methods.respondToInvitation = function(groupId, status) {
  const participant = this.CrossGroupCollab_participantGroups.find(p => 
    p.groupId.toString() === groupId.toString()
  );
  
  if (!participant) {
    return Promise.reject(new Error('Group is not invited to this collaboration'));
  }
  
  participant.status = status;
  participant.respondedAt = new Date();
  
  if (status === 'accepted') {
    participant.joinedAt = new Date();
    this.CrossGroupCollab_statistics.totalParticipants += 1;
  }
  
  return this.save();
};

// Method to leave collaboration
CrossGroupCollaborationSchema.methods.leaveCollaboration = function(groupId) {
  const participant = this.CrossGroupCollab_participantGroups.find(p => 
    p.groupId.toString() === groupId.toString()
  );
  
  if (!participant) {
    return Promise.reject(new Error('Group is not part of this collaboration'));
  }
  
  participant.status = 'left';
  participant.respondedAt = new Date();
  
  if (participant.joinedAt) {
    this.CrossGroupCollab_statistics.totalParticipants -= 1;
  }
  
  return this.save();
};

// Method to add shared resource
CrossGroupCollaborationSchema.methods.addSharedResource = function(resourceData, sharedBy) {
  this.CrossGroupCollab_sharedResources.push({
    resourceType: resourceData.type,
    resourceId: resourceData.id,
    sharedBy: sharedBy,
    sharedAt: new Date(),
    permissions: resourceData.permissions || {},
    title: resourceData.title,
    description: resourceData.description
  });
  
  this.CrossGroupCollab_statistics.totalSharedResources += 1;
  this.CrossGroupCollab_statistics.lastActivity = new Date();
  
  return this.save();
};

// Method to remove shared resource
CrossGroupCollaborationSchema.methods.removeSharedResource = function(resourceId) {
  const initialLength = this.CrossGroupCollab_sharedResources.length;
  
  this.CrossGroupCollab_sharedResources = this.CrossGroupCollab_sharedResources.filter(r => 
    r.resourceId.toString() !== resourceId.toString()
  );
  
  if (this.CrossGroupCollab_sharedResources.length < initialLength) {
    this.CrossGroupCollab_statistics.totalSharedResources -= 1;
    this.CrossGroupCollab_statistics.lastActivity = new Date();
  }
  
  return this.save();
};

// Method to add communication channel
CrossGroupCollaborationSchema.methods.addCommunicationChannel = function(channelData, createdBy) {
  this.CrossGroupCollab_communicationChannels.push({
    channelType: channelData.type,
    channelId: channelData.id,
    name: channelData.name,
    description: channelData.description,
    isActive: true,
    createdBy: createdBy,
    createdAt: new Date()
  });
  
  return this.save();
};

// Method to add event
CrossGroupCollaborationSchema.methods.addEvent = function(eventId, eventType, createdBy) {
  this.CrossGroupCollab_events.push({
    eventId: eventId,
    eventType: eventType,
    isJointEvent: true,
    createdBy: createdBy
  });
  
  this.CrossGroupCollab_statistics.totalEvents += 1;
  this.CrossGroupCollab_statistics.lastActivity = new Date();
  
  return this.save();
};

// Method to check if group is participant
CrossGroupCollaborationSchema.methods.isParticipant = function(groupId) {
  if (this.CrossGroupCollab_initiatorGroupId.toString() === groupId.toString()) {
    return true;
  }
  
  const participant = this.CrossGroupCollab_participantGroups.find(p => 
    p.groupId.toString() === groupId.toString() && p.status === 'accepted'
  );
  
  return !!participant;
};

// Method to get active participants
CrossGroupCollaborationSchema.methods.getActiveParticipants = function() {
  const activeParticipants = this.CrossGroupCollab_participantGroups.filter(p => 
    p.status === 'accepted'
  );
  
  return [
    { groupId: this.CrossGroupCollab_initiatorGroupId, status: 'initiator' },
    ...activeParticipants
  ];
};

// Method to check user permission
CrossGroupCollaborationSchema.methods.hasPermission = async function(userId, action) {
  // Check if user is the creator
  if (this.CrossGroupCollab_createdBy.toString() === userId.toString()) {
    return true;
  }
  
  // Get user's role in participating groups
  const GroupMember = mongoose.model('GroupMember');
  const participantGroupIds = [
    this.CrossGroupCollab_initiatorGroupId,
    ...this.CrossGroupCollab_participantGroups
      .filter(p => p.status === 'accepted')
      .map(p => p.groupId)
  ];
  
  const memberships = await GroupMember.find({
    GroupMember_groupId: { $in: participantGroupIds },
    GroupMember_userId: userId
  });
  
  if (memberships.length === 0) {
    return false;
  }
  
  // Check permission based on highest role
  const roles = memberships.map(m => m.GroupMember_role);
  const hasAdmin = roles.includes('admin');
  const hasModerator = roles.includes('moderator');
  
  const requiredRole = this.CrossGroupCollab_permissions[action];
  
  switch (requiredRole) {
    case 'creator':
      return false; // Only creator can perform this action
    case 'admin':
      return hasAdmin;
    case 'moderator':
      return hasAdmin || hasModerator;
    case 'member':
      return true; // Any member can perform this action
    default:
      return false;
  }
};

// Static method to find collaborations for a group
CrossGroupCollaborationSchema.statics.findByGroup = function(groupId, status = 'active') {
  const query = {
    $or: [
      { CrossGroupCollab_initiatorGroupId: groupId },
      { 'CrossGroupCollab_participantGroups.groupId': groupId }
    ]
  };
  
  if (status !== 'all') {
    query.CrossGroupCollab_status = status;
  }
  
  return this.find(query)
    .populate('CrossGroupCollab_createdBy', 'User_name User_email')
    .populate('CrossGroupCollab_initiatorGroupId', 'Group_name Group_description')
    .populate('CrossGroupCollab_participantGroups.groupId', 'Group_name Group_description')
    .sort({ CrossGroupCollab_createdAt: -1 });
};

// Static method to find public collaborations
CrossGroupCollaborationSchema.statics.findPublicCollaborations = function(limit = 20) {
  return this.find({
    'CrossGroupCollab_settings.isPublic': true,
    CrossGroupCollab_status: 'active'
  })
    .populate('CrossGroupCollab_createdBy', 'User_name User_email')
    .populate('CrossGroupCollab_initiatorGroupId', 'Group_name Group_description')
    .sort({ CrossGroupCollab_createdAt: -1 })
    .limit(limit);
};

const CrossGroupCollaboration = mongoose.model('CrossGroupCollaboration', CrossGroupCollaborationSchema);

module.exports = CrossGroupCollaboration;