const mongoose = require("mongoose");

const ReadReceiptSchema = new mongoose.Schema(
  {
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    readAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries and prevent duplicates
ReadReceiptSchema.index({ messageId: 1, userId: 1 }, { unique: true });

// Index for getting user's read history
ReadReceiptSchema.index({ userId: 1, readAt: -1 });

// Index for getting all reads for a message
ReadReceiptSchema.index({ messageId: 1, readAt: 1 });

const ReadReceipt = mongoose.model("ReadReceipt", ReadReceiptSchema);

module.exports = ReadReceipt;
