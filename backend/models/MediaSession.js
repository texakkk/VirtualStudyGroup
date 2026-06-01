const mongoose = require('mongoose');
const { Schema } = mongoose;

const MediaSessionSchema = new Schema({
  MediaSession_id: {
    type: Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId()
  },
  MediaSession_groupId: {
    type: Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  MediaSession_url: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        // Basic URL validation for YouTube and other video platforms
        const urlPattern = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|vimeo\.com\/|.*\.(mp4|webm|ogg)).*$/i;
        return urlPattern.test(v);
      },
      message: 'Invalid video URL format'
    }
  },
  MediaSession_type: {
    type: String,
    enum: ['youtube', 'video', 'audio', 'vimeo', 'other'],
    required: true,
    default: function() {
      if (this.MediaSession_url) {
        if (this.MediaSession_url.includes('youtube.com') || this.MediaSession_url.includes('youtu.be')) {
          return 'youtube';
        } else if (this.MediaSession_url.includes('vimeo.com')) {
          return 'vimeo';
        } else if (this.MediaSession_url.match(/\.(mp4|webm|ogg)$/i)) {
          return 'video';
        } else if (this.MediaSession_url.match(/\.(mp3|wav|ogg|m4a)$/i)) {
          return 'audio';
        }
      }
      return 'other';
    }
  },
  MediaSession_currentTime: {
    type: Number,
    default: 0,
    min: 0,
    validate: {
      validator: function(v) {
        return v >= 0;
      },
      message: 'Current time cannot be negative'
    }
  },
  MediaSession_isPlaying: {
    type: Boolean,
    default: false
  },
  MediaSession_host: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  MediaSession_participants: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
    validate: {
      validator: function(v) {
        // Ensure no duplicate participant IDs in the array
        return this.MediaSession_participants.indexOf(v) === this.MediaSession_participants.lastIndexOf(v);
      },
      message: props => `Duplicate participant ID found: ${props.value}`
    }
  }],
  MediaSession_chatMessages: [{
    timestamp: {
      type: Number,
      required: true,
      min: 0
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    message: {
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
  MediaSession_title: {
    type: String,
    trim: true,
    maxlength: 200
  },
  MediaSession_thumbnail: {
    type: String,
    validate: {
      validator: function(v) {
        if (!v) return true; // Optional field
        const urlPattern = /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i;
        return urlPattern.test(v);
      },
      message: 'Invalid thumbnail URL format'
    }
  },
  MediaSession_duration: {
    type: Number,
    min: 0
  },
  MediaSession_status: {
    type: String,
    enum: ['active', 'paused', 'ended'],
    default: 'active',
    index: true
  },
  MediaSession_createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  MediaSession_updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for better query performance
MediaSessionSchema.index({ 'MediaSession_groupId': 1, 'MediaSession_status': 1 });
MediaSessionSchema.index({ 'MediaSession_host': 1, 'MediaSession_status': 1 });
MediaSessionSchema.index({ 'MediaSession_createdAt': -1 });

// Compound index to prevent duplicate active media sessions for the same group
MediaSessionSchema.index(
  { MediaSession_groupId: 1, MediaSession_status: 1 },
  { 
    unique: true, 
    partialFilterExpression: { MediaSession_status: 'active' },
    name: 'unique_active_media_session_per_group'
  }
);

// Pre-save hook to update timestamps and ensure data integrity
MediaSessionSchema.pre('save', function() {
  this.MediaSession_updatedAt = new Date();
  
  // Ensure no duplicate participants in the array
  if (this.isModified('MediaSession_participants')) {
    this.MediaSession_participants = [...new Set(this.MediaSession_participants.map(id => id.toString()))].map(id => 
      mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
    );
  }
  
  // Auto-detect media type if not set
  if (this.isModified('MediaSession_url') && !this.isModified('MediaSession_type')) {
    if (this.MediaSession_url.includes('youtube.com') || this.MediaSession_url.includes('youtu.be')) {
      this.MediaSession_type = 'youtube';
    } else if (this.MediaSession_url.includes('vimeo.com')) {
      this.MediaSession_type = 'vimeo';
    } else if (this.MediaSession_url.match(/\.(mp4|webm|ogg)$/i)) {
      this.MediaSession_type = 'video';
    } else if (this.MediaSession_url.match(/\.(mp3|wav|ogg|m4a)$/i)) {
      this.MediaSession_type = 'audio';
    } else {
      this.MediaSession_type = 'other';
    }
  }
});

// Virtual for populated host
MediaSessionSchema.virtual('host', {
  ref: 'User',
  localField: 'MediaSession_host',
  foreignField: '_id',
  justOne: true
});

// Virtual for populated participants
MediaSessionSchema.virtual('participants', {
  ref: 'User',
  localField: 'MediaSession_participants',
  foreignField: '_id'
});

// Virtual for populated group
MediaSessionSchema.virtual('group', {
  ref: 'Group',
  localField: 'MediaSession_groupId',
  foreignField: '_id',
  justOne: true
});

// Set to include virtuals in responses
MediaSessionSchema.set('toObject', { virtuals: true });
MediaSessionSchema.set('toJSON', { virtuals: true });

// Instance methods
MediaSessionSchema.methods.addParticipant = function(userId) {
  if (!this.MediaSession_participants.includes(userId)) {
    this.MediaSession_participants.push(userId);
  }
  return this.save();
};

MediaSessionSchema.methods.removeParticipant = function(userId) {
  this.MediaSession_participants = this.MediaSession_participants.filter(
    id => !id.equals(userId)
  );
  return this.save();
};

MediaSessionSchema.methods.addChatMessage = function(userId, message, timestamp) {
  this.MediaSession_chatMessages.push({
    timestamp: timestamp || this.MediaSession_currentTime,
    userId,
    message: message.trim(),
    createdAt: new Date()
  });
  return this.save();
};

MediaSessionSchema.methods.updatePlaybackState = function(currentTime, isPlaying) {
  this.MediaSession_currentTime = currentTime;
  this.MediaSession_isPlaying = isPlaying;
  this.MediaSession_updatedAt = new Date();
  return this.save();
};

MediaSessionSchema.methods.endSession = function() {
  this.MediaSession_status = 'ended';
  this.MediaSession_isPlaying = false;
  this.MediaSession_updatedAt = new Date();
  return this.save();
};

// Static methods
MediaSessionSchema.statics.findActiveByGroup = function(groupId) {
  return this.findOne({
    MediaSession_groupId: groupId,
    MediaSession_status: 'active'
  }).populate('MediaSession_host', 'User_name User_email')
    .populate('MediaSession_participants', 'User_name User_email');
};

MediaSessionSchema.statics.findByGroupWithHistory = function(groupId, limit = 10) {
  return this.find({
    MediaSession_groupId: groupId
  }).populate('MediaSession_host', 'User_name User_email')
    .populate('MediaSession_participants', 'User_name User_email')
    .sort({ MediaSession_createdAt: -1 })
    .limit(limit);
};

const MediaSession = mongoose.model('MediaSession', MediaSessionSchema);

module.exports = MediaSession;