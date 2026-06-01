const mongoose = require('mongoose');
const { Schema } = mongoose;

const VideoSessionSchema = new Schema({
  VideoSession_groupId: {
    type: Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  VideoSession_hostUserId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  VideoSession_participants: [{
    type: Schema.Types.ObjectId,
    ref: 'Participant',
    validate: {
      validator: function(v) {
        // Ensure no duplicate participant IDs in the array
        return this.VideoSession_participants.indexOf(v) === this.VideoSession_participants.lastIndexOf(v);
      },
      message: props => `Duplicate participant ID found: ${props.value}`
    }
  }],
  VideoSession_startTime: {
    type: Date,
    default: Date.now
  },
  VideoSession_endTime: {
    type: Date,
    index: true
  },
  VideoSession_status: {
    type: String,
    enum: ['scheduled', 'active', 'ended', 'cancelled'],
    default: 'scheduled',
    index: true
  },
});

// Add virtuals for easier access
VideoSessionSchema.virtual('host', {
  ref: 'User',
  localField: 'VideoSession_hostUserId',
  foreignField: '_id',
  justOne: true
});

// Virtual for all participants with their details
VideoSessionSchema.virtual('participants', {
  ref: 'Participant',
  localField: 'VideoSession_participants',
  foreignField: '_id',
  options: { sort: { 'Participant_joinedAt': 1 } },
  match: { Participant_status: 'active' }
});

// Virtual for active participants count
VideoSessionSchema.virtual('activeParticipantsCount', {
  ref: 'Participant',
  localField: 'VideoSession_participants',
  foreignField: '_id',
  count: true,
  match: { 
    Participant_status: 'active',
    Participant_leftAt: { $exists: false }
  }
});

// Indexes for better query performance and data integrity
VideoSessionSchema.index({ 'VideoSession_status': 1, 'VideoSession_startTime': 1 });
VideoSessionSchema.index({ 'VideoSession_groupId': 1, 'VideoSession_status': 1 });
VideoSessionSchema.index({ 'VideoSession_hostUserId': 1, 'VideoSession_status': 1 });

// Compound index to prevent duplicate active video sessions for the same group
VideoSessionSchema.index(
  { VideoSession_groupId: 1, VideoSession_status: 1 },
  { 
    unique: true, 
    partialFilterExpression: { VideoSession_status: 'active' },
    name: 'unique_active_video_session_per_group'
  }
);

// Pre-save hook to update status based on timestamps and ensure data integrity
VideoSessionSchema.pre('save', function() {
  const now = new Date();
  
  if (this.isNew && !this.VideoSession_startTime) {
    this.VideoSession_startTime = now;
  }
  
  // If end time is set and status is active, update to ended
  if (this.VideoSession_endTime && this.VideoSession_status === 'active') {
    this.VideoSession_status = 'ended';
  }
  
  // If start time is in the future and status is not cancelled, set to scheduled
  if (this.VideoSession_startTime > now && this.VideoSession_status !== 'cancelled') {
    this.VideoSession_status = 'scheduled';
  }
  
  // Ensure no duplicate participants in the array
  if (this.isModified('VideoSession_participants')) {
    this.VideoSession_participants = [...new Set(this.VideoSession_participants.map(id => id.toString()))].map(id => 
      mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
    );
  }
});

VideoSessionSchema.virtual('group', {
  ref: 'Group',
  localField: 'VideoSession_groupId',
  foreignField: '_id',
  justOne: true
});

// Set to include virtuals in responses
VideoSessionSchema.set('toObject', { virtuals: true });
VideoSessionSchema.set('toJSON', { virtuals: true });

// Method to end the session
VideoSessionSchema.methods.endSession = function () {
  this.VideoSession_status = 'ended';
  this.VideoSession_endTime = new Date();
  return this.save();
};

const VideoSession = mongoose.model('VideoSession', VideoSessionSchema);

module.exports = VideoSession;
