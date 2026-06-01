const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ParticipantSchema = new Schema({
  Participant_userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  Participant_sessionId: {
    type: Schema.Types.ObjectId,
    ref: 'VideoSession',
    required: true,
    index: true
  },
  Participant_joinedAt: {
    type: Date,
    default: Date.now
  },
  Participant_leftAt: {
    type: Date
  },
  Participant_peerId: {
    type: String,
    index: true
  },
  Participant_role: {
    type: String,
    enum: ['host', 'participant'],
    default: 'participant'
  },
  Participant_status: {
    type: String,
    enum: ['active', 'left'],
    default: 'active'
  },

}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for user details
ParticipantSchema.virtual('user', {
  ref: 'User',
  localField: 'Participant_userId',
  foreignField: '_id',
  justOne: true
});

// Indexes for faster queries and data integrity
ParticipantSchema.index({ Participant_sessionId: 1, Participant_status: 1 });
ParticipantSchema.index({ Participant_userId: 1, Participant_status: 1 });

// Prevent duplicate participants in the same session
ParticipantSchema.index(
  { 
    Participant_userId: 1, 
    Participant_sessionId: 1 
  }, 
  { 
    unique: true,
    partialFilterExpression: { 
      Participant_status: 'active'
    }
  }
);

module.exports = mongoose.model('Participant', ParticipantSchema);
