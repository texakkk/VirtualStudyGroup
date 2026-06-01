const mongoose = require("mongoose");
const { Schema } = mongoose;

const VideoChatMessageSchema = new Schema(
  {
    VideoChatMessage_sessionId: {
      type: Schema.Types.ObjectId,
      ref: "VideoSession",
      required: true,
      index: true,
    },
    VideoChatMessage_sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    VideoChatMessage_content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    VideoChatMessage_timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for sender details
VideoChatMessageSchema.virtual("sender", {
  ref: "User",
  localField: "VideoChatMessage_sender",
  foreignField: "_id",
  justOne: true,
});

// Virtual for session details
VideoChatMessageSchema.virtual("session", {
  ref: "VideoSession",
  localField: "VideoChatMessage_sessionId",
  foreignField: "_id",
  justOne: true,
});

// Indexes for better query performance
VideoChatMessageSchema.index({
  VideoChatMessage_sessionId: 1,
  VideoChatMessage_timestamp: 1,
});
VideoChatMessageSchema.index({
  VideoChatMessage_sender: 1,
  VideoChatMessage_timestamp: -1,
});

// Pre-save middleware to handle edits
VideoChatMessageSchema.pre("save", function () {
  if (this.isModified("VideoChatMessage_content") && !this.isNew) {
    this.VideoChatMessage_edited = true;
    this.VideoChatMessage_editedAt = new Date();
  }
});

// Instance method to soft delete
VideoChatMessageSchema.methods.softDelete = function () {
  this.VideoChatMessage_deleted = true;
  this.VideoChatMessage_deletedAt = new Date();
  return this.save();
};

// Instance method to restore
VideoChatMessageSchema.methods.restore = function () {
  this.VideoChatMessage_deleted = false;
  this.VideoChatMessage_deletedAt = undefined;
  return this.save();
};

// Static method to find active messages (not deleted)
VideoChatMessageSchema.statics.findActive = function (filter = {}) {
  return this.find({
    ...filter,
    VideoChatMessage_deleted: { $ne: true },
  });
};

// Static method to find messages for a session
VideoChatMessageSchema.statics.findBySession = function (
  sessionId,
  includeDeleted = false
) {
  const filter = { VideoChatMessage_sessionId: sessionId };
  if (!includeDeleted) {
    filter.VideoChatMessage_deleted = { $ne: true };
  }
  return this.find(filter)
    .populate("VideoChatMessage_sender", "User_name User_email")
    .sort({ VideoChatMessage_timestamp: 1 });
};

const VideoChatMessage = mongoose.model(
  "VideoChatMessage",
  VideoChatMessageSchema
);

module.exports = VideoChatMessage;
