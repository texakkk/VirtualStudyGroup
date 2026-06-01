const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const UserSchema = new mongoose.Schema({
  // Basic Information
  User_name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true,
  },
  User_email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address'],
  },
  User_password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: [6, 'Password must be at least 6 characters long'],
    select: false,
  },
  User_profilePicture: {
    type: String,
    default: '',
  },
  User_role: {
    type: String,
    enum: ['student', 'admin', 'teacher'],
    default: 'student',
  },

  
  User_bio: {
    type: String,
    default: '',
  },
  User_location: {
    type: String,
    default: '',
  },
  
  // Mobile and Location Fields
  User_deviceTokens: [{
    token: String,
    platform: {
      type: String,
      enum: ['ios', 'android', 'web', 'unknown'],
      default: 'unknown'
    },
    registeredAt: {
      type: Date,
      default: Date.now
    }
  }],
  User_coordinates: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0]
    }
  },
  User_locationPrivacy: {
    type: String,
    enum: ['public', 'friends', 'private'],
    default: 'private'
  },
  User_notificationPreferences: {
    push: {
      enabled: { type: Boolean, default: true },
      messages: { type: Boolean, default: true },
      tasks: { type: Boolean, default: true },
      mentions: { type: Boolean, default: true },
      groupUpdates: { type: Boolean, default: true }
    },
    email: {
      enabled: { type: Boolean, default: false },
      digest: {
        type: String,
        enum: ['realtime', 'daily', 'weekly', 'never'],
        default: 'daily'
      }
    }
  },
  
  // System Fields
  User_resetPasswordToken: String,
  User_resetPasswordExpire: Date,
  User_tokenVersion: {
    type: Number,
    default: 0,
  },
  User_createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Geospatial index for location-based queries
UserSchema.index({ User_coordinates: '2dsphere' });

// Hash password before saving
UserSchema.pre('save', async function() {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('User_password')) return;

  // Generate a salt and hash the password
  const salt = await bcrypt.genSalt(10);
  this.User_password = await bcrypt.hash(this.User_password, salt);
});

// Middleware to increment token version when password is changed
UserSchema.pre('save', function() {
  if (this.isModified('User_password') && !this.isNew) {
    this.User_tokenVersion = (this.User_tokenVersion || 0) + 1;
  }
});

// Compare password
UserSchema.methods.correctPassword = async function(candidatePassword, hashedPassword) {
  return await bcrypt.compare(candidatePassword, hashedPassword);
};

// Generate password reset token
UserSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.User_resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.User_resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
  return resetToken;
};

const User = mongoose.model('User', UserSchema);
module.exports = User;
