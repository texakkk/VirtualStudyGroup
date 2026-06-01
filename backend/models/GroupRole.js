const mongoose = require('mongoose');

const GroupRoleSchema = new mongoose.Schema({
  GroupRole_groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  GroupRole_name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 60
  },
  GroupRole_permissions: {
    inviteMembers: { type: Boolean, default: false },
    createTasks: { type: Boolean, default: false },
    shareFiles: { type: Boolean, default: false },
    moderateContent: { type: Boolean, default: false },
    manageEvents: { type: Boolean, default: false },
    editNotes: { type: Boolean, default: false }
  },
  GroupRole_createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  GroupRole_createdAt: { type: Date, default: Date.now },
  GroupRole_updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: {
    createdAt: 'GroupRole_createdAt',
    updatedAt: 'GroupRole_updatedAt',
    currentTime: () => new Date()
  },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

GroupRoleSchema.index({ GroupRole_groupId: 1, GroupRole_name: 1 }, { unique: true });

module.exports = mongoose.model('GroupRole', GroupRoleSchema);
