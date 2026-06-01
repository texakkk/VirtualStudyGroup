const mongoose = require('mongoose');

const NoteVersionSchema = new mongoose.Schema({
  NoteVersion_noteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Note',
    required: true,
    index: true
  },
  NoteVersion_content: {
    type: String,
    required: [true, 'Please provide version content'],
    maxlength: [100000, 'Version content cannot exceed 100,000 characters']
  },
  NoteVersion_title: {
    type: String,
    required: [true, 'Please provide version title'],
    trim: true,
    maxlength: [200, 'Version title cannot exceed 200 characters']
  },
  NoteVersion_version: {
    type: Number,
    required: true,
    min: 1
  },
  NoteVersion_createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  NoteVersion_changes: {
    type: String,
    trim: true,
    maxlength: [500, 'Change description cannot exceed 500 characters'],
    default: ''
  },
  NoteVersion_changeType: {
    type: String,
    enum: ['created', 'content_updated', 'title_updated', 'permissions_updated', 'collaborators_updated'],
    default: 'content_updated'
  },
  NoteVersion_metadata: {
    contentLength: {
      type: Number,
      default: 0
    },
    wordCount: {
      type: Number,
      default: 0
    },
    characterCount: {
      type: Number,
      default: 0
    }
  },
  NoteVersion_createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient querying
NoteVersionSchema.index({ NoteVersion_noteId: 1, NoteVersion_version: -1 }); // Note versions sorted by version number
NoteVersionSchema.index({ NoteVersion_noteId: 1, NoteVersion_createdAt: -1 }); // Note versions sorted by creation date
NoteVersionSchema.index({ NoteVersion_createdBy: 1, NoteVersion_createdAt: -1 }); // User's version history

// TTL index to automatically delete old versions after 1 year (optional)
NoteVersionSchema.index({ NoteVersion_createdAt: 1 }, { expireAfterSeconds: 31536000 }); // 365 days

// Virtual to get the parent note
NoteVersionSchema.virtual('NoteVersion_note', {
  ref: 'Note',
  localField: 'NoteVersion_noteId',
  foreignField: '_id',
  justOne: true
});

// Method to calculate content statistics
NoteVersionSchema.methods.calculateMetadata = function() {
  const content = this.NoteVersion_content || '';
  
  this.NoteVersion_metadata.contentLength = content.length;
  this.NoteVersion_metadata.characterCount = content.length;
  
  // Simple word count (split by whitespace and filter empty strings)
  const words = content.trim().split(/\s+/).filter(word => word.length > 0);
  this.NoteVersion_metadata.wordCount = words.length;
  
  return this;
};

// Pre-save middleware to calculate metadata
NoteVersionSchema.pre('save', function() {
  this.calculateMetadata();
});

// Static method to create a new version from a note
NoteVersionSchema.statics.createFromNote = async function(note, userId, changes = '', changeType = 'content_updated') {
  const version = new this({
    NoteVersion_noteId: note._id,
    NoteVersion_content: note.Note_content,
    NoteVersion_title: note.Note_title,
    NoteVersion_version: note.Note_version,
    NoteVersion_createdBy: userId,
    NoteVersion_changes: changes,
    NoteVersion_changeType: changeType
  });
  
  return version.save();
};

// Static method to get version history for a note
NoteVersionSchema.statics.getVersionHistory = function(noteId, limit = 10, skip = 0) {
  return this.find({ NoteVersion_noteId: noteId })
    .populate('NoteVersion_createdBy', 'User_name User_email')
    .sort({ NoteVersion_version: -1 })
    .limit(limit)
    .skip(skip);
};

// Static method to get a specific version
NoteVersionSchema.statics.getVersion = function(noteId, version) {
  return this.findOne({ 
    NoteVersion_noteId: noteId, 
    NoteVersion_version: version 
  }).populate('NoteVersion_createdBy', 'User_name User_email');
};

// Static method to get the latest version
NoteVersionSchema.statics.getLatestVersion = function(noteId) {
  return this.findOne({ NoteVersion_noteId: noteId })
    .sort({ NoteVersion_version: -1 })
    .populate('NoteVersion_createdBy', 'User_name User_email');
};

// Static method to compare two versions
NoteVersionSchema.statics.compareVersions = async function(noteId, version1, version2) {
  const [v1, v2] = await Promise.all([
    this.getVersion(noteId, version1),
    this.getVersion(noteId, version2)
  ]);
  
  if (!v1 || !v2) {
    throw new Error('One or both versions not found');
  }
  
  return {
    version1: v1,
    version2: v2,
    contentDiff: {
      added: v2.NoteVersion_content.length - v1.NoteVersion_content.length,
      wordCountDiff: v2.NoteVersion_metadata.wordCount - v1.NoteVersion_metadata.wordCount
    }
  };
};

const NoteVersion = mongoose.model('NoteVersion', NoteVersionSchema);
module.exports = NoteVersion;