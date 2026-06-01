const mongoose = require('mongoose');
const { Schema } = mongoose;

const VideoAnnotationSchema = new Schema({
  VideoAnnotation_id: {
    type: Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId()
  },
  VideoAnnotation_sessionId: {
    type: Schema.Types.ObjectId,
    ref: 'MediaSession',
    required: true,
    index: true
  },
  VideoAnnotation_timestamp: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: function(v) {
        return v >= 0;
      },
      message: 'Timestamp cannot be negative'
    }
  },
  VideoAnnotation_type: {
    type: String,
    enum: ['note', 'highlight', 'question'],
    required: true,
    default: 'note'
  },
  VideoAnnotation_content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  VideoAnnotation_userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  VideoAnnotation_position: {
    x: {
      type: Number,
      min: 0,
      max: 100,
      default: 50
    },
    y: {
      type: Number,
      min: 0,
      max: 100,
      default: 50
    }
  },
  VideoAnnotation_replies: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  VideoAnnotation_isResolved: {
    type: Boolean,
    default: false
  },
  VideoAnnotation_createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  VideoAnnotation_updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for better query performance
VideoAnnotationSchema.index({ VideoAnnotation_sessionId: 1, VideoAnnotation_timestamp: 1 });
VideoAnnotationSchema.index({ VideoAnnotation_userId: 1, VideoAnnotation_createdAt: -1 });
VideoAnnotationSchema.index({ VideoAnnotation_sessionId: 1, VideoAnnotation_type: 1 });

// Pre-save hook to update timestamps
VideoAnnotationSchema.pre('save', function() {
  this.VideoAnnotation_updatedAt = new Date();
});

// Virtual for populated user
VideoAnnotationSchema.virtual('user', {
  ref: 'User',
  localField: 'VideoAnnotation_userId',
  foreignField: '_id',
  justOne: true
});

// Virtual for populated session
VideoAnnotationSchema.virtual('session', {
  ref: 'MediaSession',
  localField: 'VideoAnnotation_sessionId',
  foreignField: '_id',
  justOne: true
});

// Set to include virtuals in responses
VideoAnnotationSchema.set('toObject', { virtuals: true });
VideoAnnotationSchema.set('toJSON', { virtuals: true });

// Instance methods
VideoAnnotationSchema.methods.addReply = function(userId, content) {
  this.VideoAnnotation_replies.push({
    userId,
    content: content.trim(),
    createdAt: new Date()
  });
  return this.save();
};

VideoAnnotationSchema.methods.toggleResolved = function() {
  this.VideoAnnotation_isResolved = !this.VideoAnnotation_isResolved;
  this.VideoAnnotation_updatedAt = new Date();
  return this.save();
};

VideoAnnotationSchema.methods.updateContent = function(content) {
  this.VideoAnnotation_content = content.trim();
  this.VideoAnnotation_updatedAt = new Date();
  return this.save();
};

// Static methods
VideoAnnotationSchema.statics.findBySession = function(sessionId, options = {}) {
  const query = this.find({ VideoAnnotation_sessionId: sessionId })
    .populate('VideoAnnotation_userId', 'User_name User_email User_profilePicture')
    .populate('VideoAnnotation_replies.userId', 'User_name User_email User_profilePicture')
    .sort({ VideoAnnotation_timestamp: 1 });

  if (options.type) {
    query.where('VideoAnnotation_type').equals(options.type);
  }

  if (options.userId) {
    query.where('VideoAnnotation_userId').equals(options.userId);
  }

  if (options.startTime !== undefined && options.endTime !== undefined) {
    query.where('VideoAnnotation_timestamp').gte(options.startTime).lte(options.endTime);
  }

  return query;
};

VideoAnnotationSchema.statics.findByTimestamp = function(sessionId, timestamp, tolerance = 5) {
  return this.find({
    VideoAnnotation_sessionId: sessionId,
    VideoAnnotation_timestamp: {
      $gte: timestamp - tolerance,
      $lte: timestamp + tolerance
    }
  })
    .populate('VideoAnnotation_userId', 'User_name User_email User_profilePicture')
    .populate('VideoAnnotation_replies.userId', 'User_name User_email User_profilePicture')
    .sort({ VideoAnnotation_timestamp: 1 });
};

VideoAnnotationSchema.statics.findByUser = function(userId, limit = 50) {
  return this.find({ VideoAnnotation_userId: userId })
    .populate('VideoAnnotation_sessionId', 'MediaSession_title MediaSession_url MediaSession_groupId')
    .sort({ VideoAnnotation_createdAt: -1 })
    .limit(limit);
};

VideoAnnotationSchema.statics.countBySession = function(sessionId) {
  return this.countDocuments({ VideoAnnotation_sessionId: sessionId });
};

const VideoAnnotation = mongoose.model('VideoAnnotation', VideoAnnotationSchema);

module.exports = VideoAnnotation;
