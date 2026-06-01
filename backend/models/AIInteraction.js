const mongoose = require('mongoose');

const AIInteractionSchema = new mongoose.Schema({
  AI_id: {
    type: mongoose.Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId(),
  },
  AI_userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
  },
  AI_groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    default: null, // Can be null for personal AI interactions
  },
  AI_type: {
    type: String,
    enum: ['recommendation', 'reminder', 'question', 'analysis', 'prioritization', 'insight'],
    required: [true, 'AI interaction type is required'],
  },
  AI_input: {
    type: String,
    required: [true, 'AI input is required'],
    trim: true,
  },
  AI_response: {
    type: String,
    required: [true, 'AI response is required'],
    trim: true,
  },
  AI_confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.5,
  },
  AI_feedback: {
    type: String,
    enum: ['helpful', 'not_helpful', 'partially_helpful', null],
    default: null,
  },
  AI_metadata: {
    model: {
      type: String,
      default: 'gpt-3.5-turbo',
    },
    tokens_used: {
      type: Number,
      default: 0,
    },
    response_time: {
      type: Number, // in milliseconds
      default: 0,
    },
    context: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  AI_createdAt: {
    type: Date,
    default: Date.now,
  },
  AI_updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt field before saving
AIInteractionSchema.pre('save', function() {
  this.AI_updatedAt = Date.now();
});

// Index for efficient querying
AIInteractionSchema.index({ AI_userId: 1, AI_createdAt: -1 });
AIInteractionSchema.index({ AI_groupId: 1, AI_createdAt: -1 });
AIInteractionSchema.index({ AI_type: 1, AI_createdAt: -1 });

const AIInteraction = mongoose.model('AIInteraction', AIInteractionSchema);
module.exports = AIInteraction;