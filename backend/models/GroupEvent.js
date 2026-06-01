const mongoose = require('mongoose');

const GroupEventSchema = new mongoose.Schema({
  GroupEvent_groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  GroupEvent_title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  GroupEvent_description: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  GroupEvent_type: {
    type: String,
    enum: ['meeting', 'study-session', 'deadline', 'exam', 'presentation', 'other'],
    default: 'meeting'
  },
  GroupEvent_startDate: {
    type: Date,
    required: true,
    index: true
  },
  GroupEvent_endDate: {
    type: Date,
    required: true
  },
  GroupEvent_timezone: {
    type: String,
    default: 'UTC'
  },
  GroupEvent_isAllDay: {
    type: Boolean,
    default: false
  },
  GroupEvent_location: {
    type: {
      type: String,
      enum: ['physical', 'virtual', 'hybrid'],
      default: 'virtual'
    },
    address: String,
    virtualLink: String,
    platform: String, // 'zoom', 'teams', 'meet', etc.
    details: String
  },
  GroupEvent_createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  GroupEvent_attendees: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      enum: ['invited', 'accepted', 'declined', 'maybe', 'attended'],
      default: 'invited'
    },
    respondedAt: {
      type: Date,
      default: null
    },
    reminder: {
      enabled: {
        type: Boolean,
        default: true
      },
      minutes: {
        type: Number,
        default: 15 // 15 minutes before event
      }
    }
  }],
  GroupEvent_recurrence: {
    isRecurring: {
      type: Boolean,
      default: false
    },
    pattern: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'yearly'],
      default: null
    },
    interval: {
      type: Number,
      default: 1 // Every 1 week, 1 month, etc.
    },
    daysOfWeek: [{
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    }],
    endDate: {
      type: Date,
      default: null
    },
    occurrences: {
      type: Number,
      default: null
    }
  },
  GroupEvent_reminders: [{
    type: {
      type: String,
      enum: ['email', 'push', 'in-app'],
      required: true
    },
    minutes: {
      type: Number,
      required: true
    },
    sent: {
      type: Boolean,
      default: false
    }
  }],
  GroupEvent_attachments: [{
    fileName: String,
    fileUrl: String,
    fileType: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  GroupEvent_status: {
    type: String,
    enum: ['scheduled', 'in-progress', 'completed', 'cancelled', 'postponed'],
    default: 'scheduled'
  },
  GroupEvent_visibility: {
    type: String,
    enum: ['public', 'members-only', 'private'],
    default: 'members-only'
  },
  GroupEvent_createdAt: { type: Date, default: Date.now },
  GroupEvent_updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: {
    createdAt: 'GroupEvent_createdAt',
    updatedAt: 'GroupEvent_updatedAt',
    currentTime: () => new Date()
  },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient querying
GroupEventSchema.index({ GroupEvent_groupId: 1, GroupEvent_startDate: 1 });
GroupEventSchema.index({ 'GroupEvent_attendees.userId': 1 });
GroupEventSchema.index({ GroupEvent_startDate: 1, GroupEvent_endDate: 1 });

// Virtual for event duration in minutes
GroupEventSchema.virtual('GroupEvent_duration').get(function() {
  if (this.GroupEvent_endDate && this.GroupEvent_startDate) {
    return Math.round((this.GroupEvent_endDate - this.GroupEvent_startDate) / (1000 * 60));
  }
  return 0;
});

// Method to check if user is attending
GroupEventSchema.methods.isAttending = function(userId) {
  const attendee = this.GroupEvent_attendees.find(att => 
    att.userId.toString() === userId.toString()
  );
  return attendee && ['accepted', 'attended'].includes(attendee.status);
};

// Method to get attendee status
GroupEventSchema.methods.getAttendeeStatus = function(userId) {
  const attendee = this.GroupEvent_attendees.find(att => 
    att.userId.toString() === userId.toString()
  );
  return attendee ? attendee.status : null;
};

// Method to update attendee status
GroupEventSchema.methods.updateAttendeeStatus = function(userId, status) {
  const attendeeIndex = this.GroupEvent_attendees.findIndex(att => 
    att.userId.toString() === userId.toString()
  );
  
  if (attendeeIndex !== -1) {
    this.GroupEvent_attendees[attendeeIndex].status = status;
    this.GroupEvent_attendees[attendeeIndex].respondedAt = new Date();
  } else {
    this.GroupEvent_attendees.push({
      userId: userId,
      status: status,
      respondedAt: new Date()
    });
  }
  
  return this.save();
};

// Method to add attendee
GroupEventSchema.methods.addAttendee = function(userId, status = 'invited') {
  const existingAttendee = this.GroupEvent_attendees.find(att => 
    att.userId.toString() === userId.toString()
  );
  
  if (!existingAttendee) {
    this.GroupEvent_attendees.push({
      userId: userId,
      status: status,
      respondedAt: status !== 'invited' ? new Date() : null
    });
    return this.save();
  }
  
  return Promise.resolve(this);
};

// Method to remove attendee
GroupEventSchema.methods.removeAttendee = function(userId) {
  this.GroupEvent_attendees = this.GroupEvent_attendees.filter(att => 
    att.userId.toString() !== userId.toString()
  );
  return this.save();
};

// Method to get attendance statistics
GroupEventSchema.methods.getAttendanceStats = function() {
  const stats = {
    total: this.GroupEvent_attendees.length,
    accepted: 0,
    declined: 0,
    maybe: 0,
    pending: 0,
    attended: 0
  };
  
  this.GroupEvent_attendees.forEach(attendee => {
    stats[attendee.status]++;
  });
  
  return stats;
};

// Method to check if event is in the past
GroupEventSchema.methods.isPast = function() {
  return this.GroupEvent_endDate < new Date();
};

// Method to check if event is currently happening
GroupEventSchema.methods.isInProgress = function() {
  const now = new Date();
  return this.GroupEvent_startDate <= now && this.GroupEvent_endDate >= now;
};

// Method to check if event is upcoming
GroupEventSchema.methods.isUpcoming = function() {
  return this.GroupEvent_startDate > new Date();
};

// Static method to find events by date range
GroupEventSchema.statics.findByDateRange = function(groupId, startDate, endDate) {
  return this.find({
    GroupEvent_groupId: groupId,
    $or: [
      {
        GroupEvent_startDate: { $gte: startDate, $lte: endDate }
      },
      {
        GroupEvent_endDate: { $gte: startDate, $lte: endDate }
      },
      {
        GroupEvent_startDate: { $lte: startDate },
        GroupEvent_endDate: { $gte: endDate }
      }
    ]
  }).sort({ GroupEvent_startDate: 1 });
};

// Static method to find user's events
GroupEventSchema.statics.findUserEvents = function(userId, startDate, endDate) {
  const query = {
    'GroupEvent_attendees.userId': userId
  };
  
  if (startDate && endDate) {
    query.$or = [
      { GroupEvent_startDate: { $gte: startDate, $lte: endDate } },
      { GroupEvent_endDate: { $gte: startDate, $lte: endDate } },
      { 
        GroupEvent_startDate: { $lte: startDate },
        GroupEvent_endDate: { $gte: endDate }
      }
    ];
  }
  
  return this.find(query).sort({ GroupEvent_startDate: 1 });
};

// Pre-save validation
GroupEventSchema.pre('validate', function() {
  if (!this.GroupEvent_endDate && this.GroupEvent_startDate) {
    this.GroupEvent_endDate = new Date(this.GroupEvent_startDate.getTime() + 60 * 60 * 1000);
  }

  if (this.GroupEvent_endDate && this.GroupEvent_startDate && this.GroupEvent_endDate <= this.GroupEvent_startDate) {
    throw new Error('End date must be after start date');
  }
});

const GroupEvent = mongoose.model('GroupEvent', GroupEventSchema);

module.exports = GroupEvent;
