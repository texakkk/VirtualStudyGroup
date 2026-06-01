const mongoose = require('mongoose');

const UserPreferencesSchema = new mongoose.Schema({
  UserPref_userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    unique: true,
    index: true,
  },
  UserPref_studyHours: {
    type: [String],
    default: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '19:00', '20:00'],
    validate: {
      validator: function(hours) {
        return hours.every(hour => /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(hour));
      },
      message: 'Study hours must be in HH:MM format',
    },
  },
  UserPref_subjects: {
    type: [String],
    default: [],
    validate: {
      validator: function(subjects) {
        return subjects.length <= 20; // Reasonable limit
      },
      message: 'Maximum 20 subjects allowed',
    },
  },
  UserPref_learningStyle: {
    type: String,
    enum: ['visual', 'auditory', 'kinesthetic', 'reading_writing', 'mixed'],
    default: 'mixed',
  },
  UserPref_reminderFrequency: {
    type: String,
    enum: ['never', 'low', 'medium', 'high'],
    default: 'medium',
  },
  UserPref_aiEnabled: {
    type: Boolean,
    default: true,
  },
  UserPref_aiPersonality: {
    type: String,
    enum: ['encouraging', 'neutral', 'direct', 'friendly'],
    default: 'encouraging',
  },
  UserPref_studyGoals: {
    daily_hours: {
      type: Number,
      min: 0,
      max: 24,
      default: 2,
    },
    weekly_hours: {
      type: Number,
      min: 0,
      max: 168,
      default: 14,
    },
    preferred_session_length: {
      type: Number, // in minutes
      min: 15,
      max: 480,
      default: 60,
    },
    break_frequency: {
      type: Number, // minutes between breaks
      min: 15,
      max: 120,
      default: 25, // Pomodoro technique default
    },
  },
  UserPref_notifications: {
    study_reminders: {
      type: Boolean,
      default: true,
    },
    task_deadlines: {
      type: Boolean,
      default: true,
    },
    group_activities: {
      type: Boolean,
      default: true,
    },
    ai_insights: {
      type: Boolean,
      default: true,
    },
    productivity_tips: {
      type: Boolean,
      default: false,
    },
  },
  UserPref_privacy: {
    share_study_patterns: {
      type: Boolean,
      default: false,
    },
    allow_ai_analysis: {
      type: Boolean,
      default: true,
    },
    anonymous_feedback: {
      type: Boolean,
      default: true,
    },
  },
  UserPref_timezone: {
    type: String,
    default: 'UTC',
  },
  UserPref_language: {
    type: String,
    default: 'en',
    enum: ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko'],
  },
  UserPref_updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt field before saving
UserPreferencesSchema.pre('save', function() {
  this.UserPref_updatedAt = Date.now();
});

// Additional indexes for efficient querying
UserPreferencesSchema.index({ UserPref_language: 1 });
UserPreferencesSchema.index({ UserPref_updatedAt: -1 });

const UserPreferences = mongoose.model('UserPreferences', UserPreferencesSchema);
module.exports = UserPreferences;