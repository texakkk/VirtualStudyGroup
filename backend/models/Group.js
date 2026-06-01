const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
  Group_name: { type: String, required: true, trim: true, unique: true },
  Group_description: { type: String, trim: true },
  Group_createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    index: true 
  },
  Group_invitationToken: { type: String, index: true },
  Group_invitationTokenExpiresAt: { type: Date },
  Group_settings: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GroupSettings',
    default: null
  },
  Group_features: {
    notes: { type: Boolean, default: true },
    whiteboard: { type: Boolean, default: true },
    videoSessions: { type: Boolean, default: true },
    aiAssistant: { type: Boolean, default: true },
    fileSharing: { type: Boolean, default: true },
    calendar: { type: Boolean, default: true },
    analytics: { type: Boolean, default: true },
    subGroups: { type: Boolean, default: true }
  },
  Group_statistics: {
    totalMessages: { type: Number, default: 0 },
    totalFiles: { type: Number, default: 0 },
    totalNotes: { type: Number, default: 0 },
    activeMembers: { type: Number, default: 0 },
    totalSubGroups: { type: Number, default: 0 }
  },
  Group_createdAt: { type: Date, default: Date.now },
  Group_updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: {
    createdAt: 'Group_createdAt',
    updatedAt: 'Group_updatedAt',
    currentTime: () => new Date()
  },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for getting group members
GroupSchema.virtual('Group_members', {
  ref: 'GroupMember',
  localField: '_id',
  foreignField: 'GroupMember_groupId',
  justOne: false
});

// Virtual for getting group settings
GroupSchema.virtual('Group_groupSettings', {
  ref: 'GroupSettings',
  localField: '_id',
  foreignField: 'GroupSettings_groupId',
  justOne: true
});

// Virtual for getting sub-groups
GroupSchema.virtual('Group_subGroups', {
  ref: 'SubGroup',
  localField: '_id',
  foreignField: 'SubGroup_parentGroupId',
  justOne: false
});

// TTL index on invitationTokenExpiresAt
GroupSchema.index({ Group_invitationTokenExpiresAt: 1 }, { expireAfterSeconds: 0 });

// Post-save hook to create default group settings
GroupSchema.post('save', async function(doc) {
  if (this.isNew && !doc.Group_settings) {
    try {
      const GroupSettings = mongoose.model('GroupSettings');
      const settings = new GroupSettings({ GroupSettings_groupId: doc._id });
      await settings.save();
      
      // Update the group with settings reference
      doc.Group_settings = settings._id;
      await doc.save();
    } catch (error) {
      console.error('Error creating default group settings:', error);
    }
  }
});

// Method to check if a user is an admin
GroupSchema.methods.isAdmin = async function(userId) {
  const GroupMember = mongoose.model('GroupMember');
  const member = await GroupMember.findOne({ 
    GroupMember_groupId: this._id, 
    GroupMember_userId: userId 
  });
  return member && member.GroupMember_role === 'admin';
};

// Method to get all members with their details
GroupSchema.methods.getMembers = async function() {
  const GroupMember = mongoose.model('GroupMember');
  return GroupMember.find({ GroupMember_groupId: this._id })
    .populate('GroupMember_userId', 'User_name User_email')
    .sort({ GroupMember_role: -1, GroupMember_joinedAt: 1 }); // Sort by role (admins first), then join date
};

// Method to add a member to the group
GroupSchema.methods.addMember = async function(userId, role = 'member') {
  const GroupMember = mongoose.model('GroupMember');
  return GroupMember.findOneAndUpdate(
    { GroupMember_groupId: this._id, GroupMember_userId: userId },
    { GroupMember_role: role },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
};

// Method to remove a member from the group
GroupSchema.methods.removeMember = async function(userId) {
  const GroupMember = mongoose.model('GroupMember');
  return GroupMember.findOneAndDelete({ 
    GroupMember_groupId: this._id, 
    GroupMember_userId: userId 
  });
};

// Method to get admin count
GroupSchema.methods.getAdminCount = async function() {
  const GroupMember = mongoose.model('GroupMember');
  return GroupMember.countDocuments({ 
    GroupMember_groupId: this._id, 
    GroupMember_role: 'admin' 
  });
};

// Method to promote/demote member
GroupSchema.methods.updateMemberRole = async function(userId, role) {
  const GroupMember = mongoose.model('GroupMember');
  return GroupMember.findOneAndUpdate(
    { GroupMember_groupId: this._id, GroupMember_userId: userId },
    { GroupMember_role: role },
    { returnDocument: 'after' }
  );
};

// Method to get or create group settings
GroupSchema.methods.getSettings = async function() {
  const GroupSettings = mongoose.model('GroupSettings');

  // Use findOneAndUpdate with upsert to atomically get-or-create,
  // avoiding duplicate key errors from concurrent inserts or the post-save hook.
  const settings = await GroupSettings.findOneAndUpdate(
    { GroupSettings_groupId: this._id },
    { $setOnInsert: { GroupSettings_groupId: this._id } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  // Keep the Group_settings reference in sync if it wasn't set yet
  if (!this.Group_settings || this.Group_settings.toString() !== settings._id.toString()) {
    await this.constructor.findByIdAndUpdate(this._id, { Group_settings: settings._id });
    this.Group_settings = settings._id;
  }

  return settings;
};

// Method to check if user has permission for an action
GroupSchema.methods.hasPermission = async function(userId, action) {
  const settings = await this.getSettings();
  return settings.hasPermission(userId, action);
};

// Method to check if a feature is enabled
GroupSchema.methods.isFeatureEnabled = async function(feature) {
  const settings = await this.getSettings();
  return settings.isFeatureEnabled(feature);
};

// Method to create a sub-group
GroupSchema.methods.createSubGroup = async function(subGroupData, creatorId) {
  const SubGroup = mongoose.model('SubGroup');
  
  const subGroup = new SubGroup({
    SubGroup_parentGroupId: this._id,
    SubGroup_name: subGroupData.name,
    SubGroup_description: subGroupData.description,
    SubGroup_type: subGroupData.type || 'channel',
    SubGroup_createdBy: creatorId,
    SubGroup_settings: subGroupData.settings || {},
    SubGroup_permissions: subGroupData.permissions || {}
  });
  
  // Add creator as admin of the sub-group
  await subGroup.addMember(creatorId, 'admin');
  
  // Update group statistics
  this.Group_statistics.totalSubGroups += 1;
  await this.save();
  
  return subGroup;
};

// Method to get all sub-groups
GroupSchema.methods.getSubGroups = async function(includeArchived = false) {
  const SubGroup = mongoose.model('SubGroup');
  return SubGroup.findByParentGroup(this._id, includeArchived);
};

// Method to get sub-groups where user is a member
GroupSchema.methods.getUserSubGroups = async function(userId, includeArchived = false) {
  const SubGroup = mongoose.model('SubGroup');
  const allSubGroups = await SubGroup.findByParentGroup(this._id, includeArchived);
  return allSubGroups.filter(subGroup => subGroup.isMember(userId));
};

// Method to update group statistics
GroupSchema.methods.updateStatistics = async function() {
  const GroupMember = mongoose.model('GroupMember');
  const SubGroup = mongoose.model('SubGroup');
  
  // Count active members
  const activeMembers = await GroupMember.countDocuments({
    GroupMember_groupId: this._id,
    GroupMember_status: 'active'
  });
  
  // Count active sub-groups
  const activeSubGroups = await SubGroup.countDocuments({
    SubGroup_parentGroupId: this._id,
    SubGroup_isActive: true
  });
  
  this.Group_statistics.activeMembers = activeMembers;
  this.Group_statistics.totalSubGroups = activeSubGroups;
  
  return this.save();
};

const Group = mongoose.model('Group', GroupSchema);

module.exports = Group;