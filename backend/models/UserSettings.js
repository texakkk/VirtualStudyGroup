const mongoose = require('mongoose');

const UserSettingsSchema = new mongoose.Schema({
  UserSettings_userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    unique: true,
  },
  
  // Theme and Visual Settings
  UserSettings_theme: {
    type: String,
    enum: ['light', 'dark', 'high-contrast', 'auto'],
    default: 'light',
  },
  UserSettings_language: {
    type: String,
    default: 'en',
    enum: ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ar', 'hi', 'ru'],
  },
  UserSettings_fontSize: {
    type: String,
    enum: ['small', 'medium', 'large', 'extra-large'],
    default: 'medium',
  },
  UserSettings_colorScheme: {
    primary: {
      type: String,
      default: '#1976d2',
      match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid color format'],
    },
    secondary: {
      type: String,
      default: '#dc004e',
      match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid color format'],
    },
  },
  
  // Accessibility Settings
  UserSettings_accessibility: {
    screenReader: {
      type: Boolean,
      default: false,
    },
    keyboardNavigation: {
      type: Boolean,
      default: false,
    },
    reducedMotion: {
      type: Boolean,
      default: false,
    },
    highContrast: {
      type: Boolean,
      default: false,
    },
    largeText: {
      type: Boolean,
      default: false,
    },
    focusIndicators: {
      type: Boolean,
      default: true,
    },
    audioDescriptions: {
      type: Boolean,
      default: false,
    },
    captionsEnabled: {
      type: Boolean,
      default: false,
    },
    voiceCommands: {
      type: Boolean,
      default: false,
    },
  },
  
  // Notification Preferences
  UserSettings_notifications: {
    email: {
      type: Boolean,
      default: true,
    },
    push: {
      type: Boolean,
      default: true,
    },
    inApp: {
      type: Boolean,
      default: true,
    },
    desktop: {
      type: Boolean,
      default: false,
    },
    frequency: {
      type: String,
      enum: ['immediate', 'hourly', 'daily', 'weekly', 'never'],
      default: 'immediate',
    },
    quietHours: {
      enabled: {
        type: Boolean,
        default: false,
      },
      start: {
        type: String,
        default: '22:00',
        match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format'],
      },
      end: {
        type: String,
        default: '08:00',
        match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format'],
      },
    },
    types: {
      groupMessages: {
        type: Boolean,
        default: true,
      },
      taskReminders: {
        type: Boolean,
        default: true,
      },
      studyReminders: {
        type: Boolean,
        default: true,
      },
      groupInvites: {
        type: Boolean,
        default: true,
      },
      systemUpdates: {
        type: Boolean,
        default: false,
      },
      aiInsights: {
        type: Boolean,
        default: true,
      },
    },
  },
  
  // Privacy Settings
  UserSettings_privacy: {
    profileVisibility: {
      type: String,
      enum: ['public', 'friends', 'groups', 'private'],
      default: 'groups',
    },
    locationSharing: {
      type: Boolean,
      default: false,
    },
    activityStatus: {
      type: Boolean,
      default: true,
    },
    dataCollection: {
      analytics: {
        type: Boolean,
        default: true,
      },
      personalization: {
        type: Boolean,
        default: true,
      },
      marketing: {
        type: Boolean,
        default: false,
      },
    },
    searchability: {
      byEmail: {
        type: Boolean,
        default: true,
      },
      byName: {
        type: Boolean,
        default: true,
      },
      byUsername: {
        type: Boolean,
        default: true,
      },
    },
  },
  
  // Device and Sync Settings
  UserSettings_deviceSync: {
    enabled: {
      type: Boolean,
      default: true,
    },
    syncPreferences: {
      type: Boolean,
      default: true,
    },
    syncHistory: {
      type: Boolean,
      default: true,
    },
    syncFiles: {
      type: Boolean,
      default: false,
    },
    lastSyncAt: {
      type: Date,
      default: null,
    },
  },
  
  // Device Tokens for Push Notifications
  UserSettings_deviceTokens: [{
    token: {
      type: String,
      required: true,
    },
    platform: {
      type: String,
      enum: ['web', 'ios', 'android', 'desktop'],
      required: true,
    },
    deviceId: {
      type: String,
      required: true,
    },
    lastUsed: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  }],
  
  // Timezone and Localization
  UserSettings_timezone: {
    type: String,
    default: 'UTC',
  },
  UserSettings_dateFormat: {
    type: String,
    enum: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY'],
    default: 'MM/DD/YYYY',
  },
  UserSettings_timeFormat: {
    type: String,
    enum: ['12h', '24h'],
    default: '12h',
  },
  UserSettings_numberFormat: {
    type: String,
    enum: ['US', 'EU', 'IN'],
    default: 'US',
  },
  
  // Performance Settings
  UserSettings_performance: {
    animationsEnabled: {
      type: Boolean,
      default: true,
    },
    autoPlayVideos: {
      type: Boolean,
      default: false,
    },
    preloadContent: {
      type: Boolean,
      default: true,
    },
    compressionLevel: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
  },
  
  // Timestamps
  UserSettings_createdAt: {
    type: Date,
    default: Date.now,
  },
  UserSettings_updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt field before saving
UserSettingsSchema.pre('save', function() {
  this.UserSettings_updatedAt = Date.now();
});

// Indexes for efficient querying
UserSettingsSchema.index({ UserSettings_language: 1 });
UserSettingsSchema.index({ UserSettings_theme: 1 });
UserSettingsSchema.index({ UserSettings_updatedAt: -1 });
UserSettingsSchema.index({ 'UserSettings_deviceTokens.platform': 1 });
UserSettingsSchema.index({ 'UserSettings_deviceTokens.isActive': 1 });

// Virtual for getting active device tokens
UserSettingsSchema.virtual('activeDeviceTokens').get(function() {
  return this.UserSettings_deviceTokens.filter(token => token.isActive);
});

// Method to add device token
UserSettingsSchema.methods.addDeviceToken = function(token, platform, deviceId) {
  // Remove existing token for the same device
  this.UserSettings_deviceTokens = this.UserSettings_deviceTokens.filter(
    t => t.deviceId !== deviceId
  );
  
  // Add new token
  this.UserSettings_deviceTokens.push({
    token,
    platform,
    deviceId,
    lastUsed: new Date(),
    isActive: true,
  });
  
  return this.save();
};

// Method to remove device token
UserSettingsSchema.methods.removeDeviceToken = function(deviceId) {
  this.UserSettings_deviceTokens = this.UserSettings_deviceTokens.filter(
    t => t.deviceId !== deviceId
  );
  
  return this.save();
};

// Method to update device token activity
UserSettingsSchema.methods.updateTokenActivity = function(deviceId, isActive = true) {
  const token = this.UserSettings_deviceTokens.find(t => t.deviceId === deviceId);
  if (token) {
    token.isActive = isActive;
    token.lastUsed = new Date();
  }
  
  return this.save();
};

// Method to get accessibility-friendly response format
UserSettingsSchema.methods.getAccessibilityFormat = function() {
  return {
    screenReaderEnabled: this.UserSettings_accessibility.screenReader,
    highContrast: this.UserSettings_accessibility.highContrast,
    largeText: this.UserSettings_accessibility.largeText,
    reducedMotion: this.UserSettings_accessibility.reducedMotion,
    keyboardNavigation: this.UserSettings_accessibility.keyboardNavigation,
    captionsEnabled: this.UserSettings_accessibility.captionsEnabled,
  };
};

// Method to sync settings across devices
UserSettingsSchema.methods.syncToDevice = function() {
  this.UserSettings_deviceSync.lastSyncAt = new Date();
  return this.save();
};

const UserSettings = mongoose.model('UserSettings', UserSettingsSchema);
module.exports = UserSettings;