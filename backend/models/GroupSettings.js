const mongoose = require('mongoose');

const GroupSettingsSchema = new mongoose.Schema({
  GroupSettings_groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    unique: true,
    index: true
  },
  GroupSettings_permissions: {
    inviteMembers: {
      type: String,
      enum: ['admin', 'moderator', 'member', 'anyone'],
      default: 'admin'
    },
    createTasks: {
      type: String,
      enum: ['admin', 'moderator', 'member'],
      default: 'member'
    },
    shareFiles: {
      type: String,
      enum: ['admin', 'moderator', 'member'],
      default: 'member'
    },
    moderateContent: {
      type: String,
      enum: ['admin', 'moderator'],
      default: 'admin'
    },
    createSubGroups: {
      type: String,
      enum: ['admin', 'moderator', 'member'],
      default: 'admin'
    },
    manageCalendar: {
      type: String,
      enum: ['admin', 'moderator', 'member'],
      default: 'moderator'
    },
    accessAnalytics: {
      type: String,
      enum: ['admin', 'moderator'],
      default: 'admin'
    }
  },
  GroupSettings_features: {
    aiAssistant: {
      type: Boolean,
      default: true
    },
    videoSessions: {
      type: Boolean,
      default: true
    },
    fileSharing: {
      type: Boolean,
      default: true
    },
    whiteboard: {
      type: Boolean,
      default: true
    },
    notes: {
      type: Boolean,
      default: true
    },
    calendar: {
      type: Boolean,
      default: true
    },
    analytics: {
      type: Boolean,
      default: true
    },
    subGroups: {
      type: Boolean,
      default: true
    }
  },
  GroupSettings_schedule: {
    timezone: {
      type: String,
      default: 'UTC'
    },
    regularMeetings: [{
      day: {
        type: String,
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      },
      time: {
        type: String, // Format: "HH:MM"
        validate: {
          validator: function(v) {
            return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
          },
          message: 'Time must be in HH:MM format'
        }
      },
      duration: {
        type: Number, // Duration in minutes
        min: 15,
        max: 480 // Max 8 hours
      },
      title: String,
      description: String
    }]
  },
  GroupSettings_moderation: {
    autoModeration: {
      type: Boolean,
      default: false
    },
    bannedWords: [{
      type: String,
      lowercase: true
    }],
    reportThreshold: {
      type: Number,
      default: 3,
      min: 1,
      max: 10
    },
    requireApproval: {
      newMembers: {
        type: Boolean,
        default: false
      },
      fileUploads: {
        type: Boolean,
        default: false
      },
      posts: {
        type: Boolean,
        default: false
      }
    }
  },
  GroupSettings_privacy: {
    visibility: {
      type: String,
      enum: ['public', 'private', 'invite-only'],
      default: 'private'
    },
    allowSearch: {
      type: Boolean,
      default: true
    },
    showMemberList: {
      type: Boolean,
      default: true
    },
    allowGuestAccess: {
      type: Boolean,
      default: false
    }
  },
  GroupSettings_createdAt: { type: Date, default: Date.now },
  GroupSettings_updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: {
    createdAt: 'GroupSettings_createdAt',
    updatedAt: 'GroupSettings_updatedAt',
    currentTime: () => new Date()
  },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Method to check if a user has permission for a specific action
GroupSettingsSchema.methods.hasPermission = async function(userId, action) {
  const GroupMember = mongoose.model('GroupMember');
  const member = await GroupMember.findOne({
    GroupMember_groupId: this.GroupSettings_groupId,
    GroupMember_userId: userId
  });

  if (!member) return false;

  const userRole = member.GroupMember_role;
  const requiredRole = this.GroupSettings_permissions[action];

  if (!requiredRole) return false;

  // Role hierarchy: admin > moderator > member > anyone
  const roleHierarchy = {
    'admin': 4,
    'moderator': 3,
    'member': 2,
    'anyone': 1
  };

  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
};

// Method to check if a feature is enabled
GroupSettingsSchema.methods.isFeatureEnabled = function(feature) {
  return this.GroupSettings_features[feature] === true;
};

// Method to add a banned word
GroupSettingsSchema.methods.addBannedWord = function(word) {
  if (!this.GroupSettings_moderation.bannedWords.includes(word.toLowerCase())) {
    this.GroupSettings_moderation.bannedWords.push(word.toLowerCase());
  }
  return this.save();
};

// Method to remove a banned word
GroupSettingsSchema.methods.removeBannedWord = function(word) {
  this.GroupSettings_moderation.bannedWords = this.GroupSettings_moderation.bannedWords
    .filter(w => w !== word.toLowerCase());
  return this.save();
};

// Method to add a regular meeting
GroupSettingsSchema.methods.addRegularMeeting = function(meeting) {
  this.GroupSettings_schedule.regularMeetings.push(meeting);
  return this.save();
};

// Method to remove a regular meeting
GroupSettingsSchema.methods.removeRegularMeeting = function(meetingId) {
  this.GroupSettings_schedule.regularMeetings = this.GroupSettings_schedule.regularMeetings
    .filter(meeting => meeting._id.toString() !== meetingId.toString());
  return this.save();
};

const GroupSettings = mongoose.model('GroupSettings', GroupSettingsSchema);

module.exports = GroupSettings;