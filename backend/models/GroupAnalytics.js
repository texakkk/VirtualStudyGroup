const mongoose = require('mongoose');

const GroupAnalyticsSchema = new mongoose.Schema({
  GroupAnalytics_groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    unique: true,
    index: true
  },
  GroupAnalytics_period: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
    default: 'daily'
  },
  GroupAnalytics_date: {
    type: Date,
    required: true,
    index: true
  },
  GroupAnalytics_memberStats: {
    totalMembers: {
      type: Number,
      default: 0
    },
    activeMembers: {
      type: Number,
      default: 0
    },
    newMembers: {
      type: Number,
      default: 0
    },
    leftMembers: {
      type: Number,
      default: 0
    }
  },
  GroupAnalytics_activityStats: {
    totalMessages: {
      type: Number,
      default: 0
    },
    totalFiles: {
      type: Number,
      default: 0
    },
    totalTasks: {
      type: Number,
      default: 0
    },
    completedTasks: {
      type: Number,
      default: 0
    },
    totalEvents: {
      type: Number,
      default: 0
    },
    attendedEvents: {
      type: Number,
      default: 0
    },
    totalNotes: {
      type: Number,
      default: 0
    },
    sharedNotes: {
      type: Number,
      default: 0
    }
  },
  GroupAnalytics_engagementStats: {
    averageSessionDuration: {
      type: Number,
      default: 0 // in minutes
    },
    peakActivityHour: {
      type: Number,
      default: 0 // 0-23 hour format
    },
    messageResponseRate: {
      type: Number,
      default: 0 // percentage
    },
    eventAttendanceRate: {
      type: Number,
      default: 0 // percentage
    },
    taskCompletionRate: {
      type: Number,
      default: 0 // percentage
    }
  },
  GroupAnalytics_participationByMember: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
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
    tasksCompleted: {
      type: Number,
      default: 0
    },
    eventsAttended: {
      type: Number,
      default: 0
    },
    notesCreated: {
      type: Number,
      default: 0
    },
    sessionDuration: {
      type: Number,
      default: 0 // in minutes
    },
    lastActive: {
      type: Date,
      default: Date.now
    },
    participationScore: {
      type: Number,
      default: 0
    }
  }],
  GroupAnalytics_contentStats: {
    topFileTypes: [{
      type: String,
      count: Number
    }],
    topDiscussionTopics: [{
      topic: String,
      mentions: Number
    }],
    mostActiveSubGroups: [{
      subGroupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubGroup'
      },
      activityScore: Number
    }]
  },
  GroupAnalytics_createdAt: { type: Date, default: Date.now },
  GroupAnalytics_updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: {
    createdAt: 'GroupAnalytics_createdAt',
    updatedAt: 'GroupAnalytics_updatedAt',
    currentTime: () => new Date()
  },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound index for efficient querying
GroupAnalyticsSchema.index({ 
  GroupAnalytics_groupId: 1, 
  GroupAnalytics_date: -1,
  GroupAnalytics_period: 1 
});

// Index for member participation queries
GroupAnalyticsSchema.index({ 'GroupAnalytics_participationByMember.userId': 1 });

// Method to calculate participation score for a member
GroupAnalyticsSchema.methods.calculateParticipationScore = function(memberData) {
  const weights = {
    messages: 1,
    files: 2,
    tasksCreated: 3,
    tasksCompleted: 4,
    eventsAttended: 5,
    notesCreated: 3
  };
  
  return (
    (memberData.messagesCount * weights.messages) +
    (memberData.filesShared * weights.files) +
    (memberData.tasksCreated * weights.tasksCreated) +
    (memberData.tasksCompleted * weights.tasksCompleted) +
    (memberData.eventsAttended * weights.eventsAttended) +
    (memberData.notesCreated * weights.notesCreated)
  );
};

// Method to update member participation
GroupAnalyticsSchema.methods.updateMemberParticipation = function(userId, activityType, increment = 1) {
  let member = this.GroupAnalytics_participationByMember.find(m => 
    m.userId.toString() === userId.toString()
  );
  
  if (!member) {
    member = {
      userId: userId,
      messagesCount: 0,
      filesShared: 0,
      tasksCreated: 0,
      tasksCompleted: 0,
      eventsAttended: 0,
      notesCreated: 0,
      sessionDuration: 0,
      lastActive: new Date(),
      participationScore: 0
    };
    this.GroupAnalytics_participationByMember.push(member);
  }
  
  // Update the specific activity
  switch (activityType) {
    case 'message':
      member.messagesCount += increment;
      this.GroupAnalytics_activityStats.totalMessages += increment;
      break;
    case 'file':
      member.filesShared += increment;
      this.GroupAnalytics_activityStats.totalFiles += increment;
      break;
    case 'taskCreated':
      member.tasksCreated += increment;
      this.GroupAnalytics_activityStats.totalTasks += increment;
      break;
    case 'taskCompleted':
      member.tasksCompleted += increment;
      this.GroupAnalytics_activityStats.completedTasks += increment;
      break;
    case 'eventAttended':
      member.eventsAttended += increment;
      this.GroupAnalytics_activityStats.attendedEvents += increment;
      break;
    case 'noteCreated':
      member.notesCreated += increment;
      this.GroupAnalytics_activityStats.totalNotes += increment;
      break;
  }
  
  member.lastActive = new Date();
  member.participationScore = this.calculateParticipationScore(member);
  
  return this.save();
};

// Method to get top participants
GroupAnalyticsSchema.methods.getTopParticipants = function(limit = 10) {
  return this.GroupAnalytics_participationByMember
    .sort((a, b) => b.participationScore - a.participationScore)
    .slice(0, limit);
};

// Method to get member engagement level
GroupAnalyticsSchema.methods.getMemberEngagementLevel = function(userId) {
  const member = this.GroupAnalytics_participationByMember.find(m => 
    m.userId.toString() === userId.toString()
  );
  
  if (!member) return 'inactive';
  
  const score = member.participationScore;
  if (score >= 100) return 'very-active';
  if (score >= 50) return 'active';
  if (score >= 20) return 'moderate';
  if (score >= 5) return 'low';
  return 'inactive';
};

// Method to calculate group health score
GroupAnalyticsSchema.methods.calculateGroupHealthScore = function() {
  const stats = this.GroupAnalytics_activityStats;
  const engagement = this.GroupAnalytics_engagementStats;
  
  let healthScore = 0;
  
  // Activity score (40% weight)
  const activityScore = Math.min(100, (
    stats.totalMessages * 0.1 +
    stats.totalFiles * 0.5 +
    stats.completedTasks * 2 +
    stats.attendedEvents * 3
  ));
  healthScore += activityScore * 0.4;
  
  // Engagement score (35% weight)
  const engagementScore = (
    engagement.messageResponseRate * 0.3 +
    engagement.eventAttendanceRate * 0.4 +
    engagement.taskCompletionRate * 0.3
  );
  healthScore += engagementScore * 0.35;
  
  // Member participation score (25% weight)
  const activeMembers = this.GroupAnalytics_participationByMember.filter(m => 
    m.participationScore > 0
  ).length;
  const participationScore = Math.min(100, (activeMembers / this.GroupAnalytics_memberStats.totalMembers) * 100);
  healthScore += participationScore * 0.25;
  
  return Math.round(healthScore);
};

// Static method to create or update analytics for a group
GroupAnalyticsSchema.statics.updateGroupAnalytics = async function(groupId, date = new Date(), period = 'daily') {
  const startOfPeriod = new Date(date);
  
  switch (period) {
    case 'daily':
      startOfPeriod.setHours(0, 0, 0, 0);
      break;
    case 'weekly':
      startOfPeriod.setDate(startOfPeriod.getDate() - startOfPeriod.getDay());
      startOfPeriod.setHours(0, 0, 0, 0);
      break;
    case 'monthly':
      startOfPeriod.setDate(1);
      startOfPeriod.setHours(0, 0, 0, 0);
      break;
  }
  
  let analytics = await this.findOne({
    GroupAnalytics_groupId: groupId,
    GroupAnalytics_date: startOfPeriod,
    GroupAnalytics_period: period
  });
  
  if (!analytics) {
    analytics = new this({
      GroupAnalytics_groupId: groupId,
      GroupAnalytics_date: startOfPeriod,
      GroupAnalytics_period: period
    });
  }
  
  return analytics;
};

// Static method to get analytics summary for a date range
GroupAnalyticsSchema.statics.getAnalyticsSummary = function(groupId, startDate, endDate, period = 'daily') {
  return this.find({
    GroupAnalytics_groupId: groupId,
    GroupAnalytics_date: { $gte: startDate, $lte: endDate },
    GroupAnalytics_period: period
  }).sort({ GroupAnalytics_date: 1 });
};

const GroupAnalytics = mongoose.model('GroupAnalytics', GroupAnalyticsSchema);

module.exports = GroupAnalytics;