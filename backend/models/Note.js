const mongoose = require('mongoose');

const getObjectIdString = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (value._bsontype === 'ObjectId' && typeof value.toString === 'function') return value.toString();
  if (value.$oid) return value.$oid;
  if (value._id && value._id !== value) return getObjectIdString(value._id);
  if (value.id && typeof value.id === 'string') return value.id;
  if (typeof value.toString === 'function') {
    const stringified = value.toString();
    return stringified === '[object Object]' ? '' : stringified;
  }
  return String(value);
};

const isSameObjectId = (firstValue, secondValue) => (
  Boolean(getObjectIdString(firstValue)) &&
  getObjectIdString(firstValue) === getObjectIdString(secondValue)
);

const objectIdListIncludes = (list = [], userId) => (
  Array.isArray(list) && list.some((value) => isSameObjectId(value, userId))
);

const NoteSchema = new mongoose.Schema({
  Note_title: {
    type: String,
    required: [true, 'Please provide a note title'],
    trim: true,
    maxlength: [200, 'Note title cannot exceed 200 characters']
  },
  Note_content: {
    type: String,
    required: [true, 'Please provide note content'],
    maxlength: [100000, 'Note content cannot exceed 100,000 characters']
  },
  Note_format: {
    type: String,
    enum: ['richtext', 'pdf', 'docx', 'markdown'],
    default: 'richtext'
  },
  Note_groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  Note_createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  Note_collaborators: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  Note_linkedDiscussions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  }],
  Note_tags: [{
    type: String,
    trim: true,
    maxlength: [50, 'Tag cannot exceed 50 characters']
  }],
  Note_version: {
    type: Number,
    default: 1,
    min: 1
  },
  Note_isPublic: {
    type: Boolean,
    default: false
  },
  Note_permissions: {
    read: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    write: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    admin: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  },
  Note_createdAt: {
    type: Date,
    default: Date.now
  },
  Note_updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: {
    createdAt: 'Note_createdAt',
    updatedAt: 'Note_updatedAt',
    currentTime: () => new Date()
  },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient querying
NoteSchema.index({ Note_groupId: 1, Note_createdAt: -1 }); // Group notes sorted by creation date
NoteSchema.index({ Note_createdBy: 1, Note_createdAt: -1 }); // User's notes sorted by creation date
NoteSchema.index({ Note_tags: 1 }); // Tag-based searches
NoteSchema.index({ Note_title: 'text', Note_content: 'text' }); // Full-text search
NoteSchema.index({ 'Note_permissions.read': 1 }); // Permission-based queries
NoteSchema.index({ 'Note_permissions.write': 1 }); // Permission-based queries
NoteSchema.index({ Note_isPublic: 1, Note_groupId: 1 }); // Public notes in groups

// Virtual for getting note versions
NoteSchema.virtual('Note_versions', {
  ref: 'NoteVersion',
  localField: '_id',
  foreignField: 'NoteVersion_noteId',
  justOne: false
});

// Method to check if user has read permission
NoteSchema.methods.hasReadPermission = function(userId) {
  // Creator always has read permission
  if (isSameObjectId(this.Note_createdBy, userId)) {
    return true;
  }
  
  // Check if user is in read permissions
  if (objectIdListIncludes(this.Note_permissions?.read, userId)) {
    return true;
  }
  
  // Check if user has write or admin permissions (which include read)
  if (objectIdListIncludes(this.Note_permissions?.write, userId) ||
      objectIdListIncludes(this.Note_permissions?.admin, userId)) {
    return true;
  }
  
  // Check if user is a collaborator
  if (objectIdListIncludes(this.Note_collaborators, userId)) {
    return true;
  }
  
  return false;
};

// Method to check if user has write permission
NoteSchema.methods.hasWritePermission = function(userId) {
  // Creator always has write permission
  if (isSameObjectId(this.Note_createdBy, userId)) {
    return true;
  }
  
  // Check if user is in write permissions
  if (objectIdListIncludes(this.Note_permissions?.write, userId)) {
    return true;
  }
  
  // Check if user has admin permissions (which include write)
  if (objectIdListIncludes(this.Note_permissions?.admin, userId)) {
    return true;
  }
  
  return false;
};

// Method to check if user has admin permission
NoteSchema.methods.hasAdminPermission = function(userId) {
  // Creator always has admin permission
  if (isSameObjectId(this.Note_createdBy, userId)) {
    return true;
  }
  
  // Check if user is in admin permissions
  if (objectIdListIncludes(this.Note_permissions?.admin, userId)) {
    return true;
  }
  
  return false;
};

// Method to add collaborator
NoteSchema.methods.addCollaborator = function(userId) {
  if (!objectIdListIncludes(this.Note_collaborators, userId)) {
    this.Note_collaborators.push(userId);
  }
  return this.save();
};

// Method to remove collaborator
NoteSchema.methods.removeCollaborator = function(userId) {
  this.Note_collaborators = this.Note_collaborators.filter(
    id => !isSameObjectId(id, userId)
  );
  return this.save();
};

// Method to add permission
NoteSchema.methods.addPermission = function(userId, permissionType) {
  if (!['read', 'write', 'admin'].includes(permissionType)) {
    throw new Error('Invalid permission type');
  }

  if (!this.Note_permissions) {
    this.Note_permissions = { read: [], write: [], admin: [] };
  }

  if (!Array.isArray(this.Note_permissions[permissionType])) {
    this.Note_permissions[permissionType] = [];
  }
  
  if (!objectIdListIncludes(this.Note_permissions[permissionType], userId)) {
    this.Note_permissions[permissionType].push(userId);
  }
  return this.save();
};

// Method to remove permission
NoteSchema.methods.removePermission = function(userId, permissionType) {
  if (!['read', 'write', 'admin'].includes(permissionType)) {
    throw new Error('Invalid permission type');
  }

  if (!this.Note_permissions || !Array.isArray(this.Note_permissions[permissionType])) {
    return this.save();
  }
  
  this.Note_permissions[permissionType] = this.Note_permissions[permissionType].filter(
    id => !isSameObjectId(id, userId)
  );
  return this.save();
};

// Pre-save middleware to increment version when content changes
NoteSchema.pre('save', function() {
  if (this.isModified('Note_content') && !this.isNew) {
    this.Note_version += 1;
  }
});

const Note = mongoose.model('Note', NoteSchema);
module.exports = Note;
