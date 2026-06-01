const mongoose = require('mongoose');

const ContentReportSchema = new mongoose.Schema({
  ContentReport_groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  ContentReport_reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ContentReport_contentType: {
    type: String,
    enum: ['message', 'file', 'note', 'user', 'event', 'subgroup'],
    required: true
  },
  ContentReport_contentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  ContentReport_contentOwnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ContentReport_reason: {
    type: String,
    enum: [
      'spam',
      'harassment',
      'inappropriate-content',
      'hate-speech',
      'violence',
      'copyright-violation',
      'misinformation',
      'off-topic',
      'other'
    ],
    required: true
  },
  ContentReport_description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  ContentReport_severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  ContentReport_status: {
    type: String,
    enum: ['pending', 'under-review', 'resolved', 'dismissed', 'escalated'],
    default: 'pending'
  },
  ContentReport_evidence: [{
    type: {
      type: String,
      enum: ['screenshot', 'text', 'file', 'link'],
      required: true
    },
    content: String, // URL for files/screenshots, text content, or link
    description: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  ContentReport_moderatorActions: [{
    moderatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    action: {
      type: String,
      enum: [
        'warning-issued',
        'content-removed',
        'user-suspended',
        'user-banned',
        'content-edited',
        'no-action',
        'escalated',
        'dismissed'
      ],
      required: true
    },
    reason: String,
    duration: Number, // For suspensions, in hours
    notes: String,
    actionDate: {
      type: Date,
      default: Date.now
    }
  }],
  ContentReport_resolution: {
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    resolutionDate: {
      type: Date,
      default: null
    },
    resolutionNotes: String,
    finalAction: String
  },
  ContentReport_autoModeration: {
    flaggedBySystem: {
      type: Boolean,
      default: false
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0
    },
    detectedIssues: [String],
    systemAction: String
  },
  ContentReport_priority: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  },
  ContentReport_createdAt: { type: Date, default: Date.now },
  ContentReport_updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: {
    createdAt: 'ContentReport_createdAt',
    updatedAt: 'ContentReport_updatedAt',
    currentTime: () => new Date()
  },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient querying
ContentReportSchema.index({ 
  ContentReport_groupId: 1, 
  ContentReport_status: 1,
  ContentReport_createdAt: -1 
});
ContentReportSchema.index({ ContentReport_contentType: 1, ContentReport_contentId: 1 });
ContentReportSchema.index({ ContentReport_reportedBy: 1 });
ContentReportSchema.index({ ContentReport_contentOwnerId: 1 });

// Virtual for report age in hours
ContentReportSchema.virtual('ContentReport_ageInHours').get(function() {
  return Math.round((new Date() - this.ContentReport_createdAt) / (1000 * 60 * 60));
});

// Method to add moderator action
ContentReportSchema.methods.addModeratorAction = function(moderatorId, action, reason, notes, duration = null) {
  this.ContentReport_moderatorActions.push({
    moderatorId: moderatorId,
    action: action,
    reason: reason,
    notes: notes,
    duration: duration,
    actionDate: new Date()
  });
  
  // Update status based on action
  if (['content-removed', 'user-suspended', 'user-banned'].includes(action)) {
    this.ContentReport_status = 'resolved';
  } else if (action === 'escalated') {
    this.ContentReport_status = 'escalated';
    this.ContentReport_priority = Math.min(10, this.ContentReport_priority + 2);
  } else if (action === 'dismissed') {
    this.ContentReport_status = 'dismissed';
  } else {
    this.ContentReport_status = 'under-review';
  }
  
  return this.save();
};

// Method to resolve report
ContentReportSchema.methods.resolve = function(resolvedBy, resolutionNotes, finalAction) {
  this.ContentReport_status = 'resolved';
  this.ContentReport_resolution = {
    resolvedBy: resolvedBy,
    resolutionDate: new Date(),
    resolutionNotes: resolutionNotes,
    finalAction: finalAction
  };
  
  return this.save();
};

// Method to dismiss report
ContentReportSchema.methods.dismiss = function(dismissedBy, reason) {
  this.ContentReport_status = 'dismissed';
  this.ContentReport_resolution = {
    resolvedBy: dismissedBy,
    resolutionDate: new Date(),
    resolutionNotes: reason,
    finalAction: 'dismissed'
  };
  
  return this.save();
};

// Method to escalate report
ContentReportSchema.methods.escalate = function(escalatedBy, reason) {
  this.ContentReport_status = 'escalated';
  this.ContentReport_priority = Math.min(10, this.ContentReport_priority + 3);
  
  this.addModeratorAction(escalatedBy, 'escalated', reason, 'Report escalated for higher-level review');
  
  return this.save();
};

// Method to add evidence
ContentReportSchema.methods.addEvidence = function(type, content, description) {
  this.ContentReport_evidence.push({
    type: type,
    content: content,
    description: description,
    uploadedAt: new Date()
  });
  
  return this.save();
};

// Method to calculate priority score
ContentReportSchema.methods.calculatePriority = function() {
  let priority = 5; // Base priority
  
  // Increase priority based on severity
  switch (this.ContentReport_severity) {
    case 'critical':
      priority += 4;
      break;
    case 'high':
      priority += 2;
      break;
    case 'medium':
      priority += 0;
      break;
    case 'low':
      priority -= 1;
      break;
  }
  
  // Increase priority based on reason
  const highPriorityReasons = ['harassment', 'hate-speech', 'violence'];
  if (highPriorityReasons.includes(this.ContentReport_reason)) {
    priority += 2;
  }
  
  // Increase priority based on age
  const ageInHours = this.ContentReport_ageInHours;
  if (ageInHours > 48) priority += 2;
  else if (ageInHours > 24) priority += 1;
  
  // Increase priority if auto-flagged with high confidence
  if (this.ContentReport_autoModeration.flaggedBySystem && 
      this.ContentReport_autoModeration.confidence > 0.8) {
    priority += 2;
  }
  
  this.ContentReport_priority = Math.max(1, Math.min(10, priority));
  return this.ContentReport_priority;
};

// Static method to get pending reports for a group
ContentReportSchema.statics.getPendingReports = function(groupId, limit = 50) {
  return this.find({
    ContentReport_groupId: groupId,
    ContentReport_status: { $in: ['pending', 'under-review'] }
  })
  .populate('ContentReport_reportedBy', 'User_name User_email')
  .populate('ContentReport_contentOwnerId', 'User_name User_email')
  .sort({ ContentReport_priority: -1, ContentReport_createdAt: 1 })
  .limit(limit);
};

// Static method to get reports by content
ContentReportSchema.statics.getReportsByContent = function(contentType, contentId) {
  return this.find({
    ContentReport_contentType: contentType,
    ContentReport_contentId: contentId
  }).sort({ ContentReport_createdAt: -1 });
};

// Static method to get user's report history
ContentReportSchema.statics.getUserReports = function(userId, asReporter = true) {
  const field = asReporter ? 'ContentReport_reportedBy' : 'ContentReport_contentOwnerId';
  return this.find({ [field]: userId })
    .populate('ContentReport_groupId', 'Group_name')
    .sort({ ContentReport_createdAt: -1 });
};

// Static method to get moderation statistics
ContentReportSchema.statics.getModerationStats = async function(groupId, startDate, endDate) {
  const pipeline = [
    {
      $match: {
        ContentReport_groupId: new mongoose.Types.ObjectId(groupId),
        ContentReport_createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        totalReports: { $sum: 1 },
        pendingReports: {
          $sum: { $cond: [{ $eq: ['$ContentReport_status', 'pending'] }, 1, 0] }
        },
        resolvedReports: {
          $sum: { $cond: [{ $eq: ['$ContentReport_status', 'resolved'] }, 1, 0] }
        },
        dismissedReports: {
          $sum: { $cond: [{ $eq: ['$ContentReport_status', 'dismissed'] }, 1, 0] }
        },
        averageResolutionTime: { $avg: '$ContentReport_ageInHours' },
        reportsByReason: {
          $push: '$ContentReport_reason'
        },
        reportsBySeverity: {
          $push: '$ContentReport_severity'
        }
      }
    }
  ];
  
  const result = await this.aggregate(pipeline);
  return result[0] || {
    totalReports: 0,
    pendingReports: 0,
    resolvedReports: 0,
    dismissedReports: 0,
    averageResolutionTime: 0,
    reportsByReason: [],
    reportsBySeverity: []
  };
};

// Pre-save hook to calculate priority
ContentReportSchema.pre('save', function() {
  if (this.isNew || this.isModified('ContentReport_severity') || this.isModified('ContentReport_reason')) {
    this.calculatePriority();
  }
});

const ContentReport = mongoose.model('ContentReport', ContentReportSchema);

module.exports = ContentReport;
