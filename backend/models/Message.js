const mongoose = require("mongoose");
const MessageSchema = new mongoose.Schema(
  {
    // Message content fields
    Message_groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    Message_sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    Message_content: {
      type: String,
      default: "", // For text or emoji-only messages
    },
    Message_type: {
      type: String,
      required: true,
      enum: ["text", "file", "mixed", "reply"],
      default: "text",
      index: true,
    },
    Message_fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "File",
      default: null,
    },

    Message_replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },

    // Read tracking
    Message_readCount: {
      type: Number,
      default: 0,
      index: true,
    },

    Message_createdAt: { type: Date, default: Date.now },
    Message_updatedAt: { type: Date, default: Date.now },
    Message_isEdited: { type: Boolean, default: false },
    Message_editedAt: { type: Date, default: null },
  },
  {
    timestamps: {
      createdAt: "Message_createdAt",
      updatedAt: "Message_updatedAt",
      currentTime: () => new Date(),
    },
  }
);

// Virtual field to provide message_userId as an alias for Message_sender
MessageSchema.virtual("message_userId").get(function () {
  return this.Message_sender;
});

// Virtual field to provide messageSender as an alias for Message_sender (populated)
MessageSchema.virtual("messageSender").get(function () {
  return this.Message_sender;
});

// Virtual to get message summary (subject or first part of content)
MessageSchema.virtual("messageSummary").get(function () {
  if (this.Message_subject) return this.Message_subject;
  if (this.Message_content) {
    return this.Message_content.length > 50
      ? this.Message_content.substring(0, 50) + "..."
      : this.Message_content;
  }
  return "No content";
});

// Method to set what message is about
MessageSchema.methods.setMessageAbout = function (
  subject,
  topic,
  category = "general",
  keywords = []
) {
  this.Message_subject = subject;
  this.Message_topic = topic;
  this.Message_category = category;
  this.Message_keywords = keywords;
  return this;
};

// Static method to find messages by topic
MessageSchema.statics.findByTopic = function (topic) {
  return this.find({
    $or: [
      { Message_topic: new RegExp(topic, "i") },
      { Message_subject: new RegExp(topic, "i") },
      { Message_keywords: { $in: [new RegExp(topic, "i")] } },
    ],
  });
};

// Static method to find messages by category
MessageSchema.statics.findByCategory = function (category) {
  return this.find({ Message_category: category });
};

// Ensure virtual fields are serialized
MessageSchema.set("toJSON", { virtuals: true });
MessageSchema.set("toObject", { virtuals: true });

const Message = mongoose.model("Message", MessageSchema);

module.exports = Message;
