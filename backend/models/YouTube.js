const mongoose = require('mongoose');
const { Schema } = mongoose;

const YouTubeVideoSchema = new Schema({
  groupId: {
    type: Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  sharedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  videoTitle: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  videoUrl: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        // YouTube URL validation
        const youtubePattern = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+(&[\w=]*)?$/i;
        return youtubePattern.test(v);
      },
      message: 'Invalid YouTube URL format'
    }
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  thumbnail: {
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
  videoId: {
    type: String
  },
  duration: {
    type: Number,
    min: 0
  },
  sharedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Extract YouTube video ID from URL before saving
YouTubeVideoSchema.pre('save', function() {
  if (this.isModified('videoUrl')) {
    const videoId = this.extractVideoId(this.videoUrl);
    if (videoId) {
      this.videoId = videoId;
      // Generate thumbnail URL if not provided
      if (!this.thumbnail) {
        this.thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      }
    }
  }
});

// Method to extract YouTube video ID from URL
YouTubeVideoSchema.methods.extractVideoId = function(url) {
  const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/;
  const match = url.match(regex);
  return match ? match[1] : null;
};

// Virtual for embedded URL
YouTubeVideoSchema.virtual('embedUrl').get(function() {
  if (this.videoId) {
    return `https://www.youtube.com/embed/${this.videoId}`;
  }
  return null;
});

// Virtual for populated user
YouTubeVideoSchema.virtual('user', {
  ref: 'User',
  localField: 'sharedBy',
  foreignField: '_id',
  justOne: true
});

// Virtual for populated group
YouTubeVideoSchema.virtual('group', {
  ref: 'Group',
  localField: 'groupId',
  foreignField: '_id',
  justOne: true
});

// Indexes for better query performance
YouTubeVideoSchema.index({ 'groupId': 1, 'sharedAt': -1 });
YouTubeVideoSchema.index({ 'sharedBy': 1, 'sharedAt': -1 });
YouTubeVideoSchema.index({ 'videoId': 1 });

// Set to include virtuals in responses
YouTubeVideoSchema.set('toObject', { virtuals: true });
YouTubeVideoSchema.set('toJSON', { virtuals: true });

const YouTubeVideo = mongoose.model('YouTubeVideo', YouTubeVideoSchema);

module.exports = YouTubeVideo;