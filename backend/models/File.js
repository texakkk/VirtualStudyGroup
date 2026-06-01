const mongoose = require("mongoose");

const FileSchema = new mongoose.Schema(
  {
    File_originalName: {
      type: String,
      required: true,
    },
    File_fileName: {
      type: String,
      required: true,
    },
    File_filePath: {
      type: String,
      required: true,
    },
    File_url: {
      type: String,
      required: true,
    },
    File_fileSize: {
      type: Number,
      required: true,
    },
    File_mimeType: {
      type: String,
      required: true,
    },
    File_type: {
      type: String,
      required: true,
      enum: ["image", "document", "video", "audio", "other"],
    },
    File_uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    File_messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
      index: true,
    },
    File_groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
      index: true,
    },
    File_category: {
      type: String,
      enum: ["document", "image", "video", "audio", "other"],
      default: "other",
    },
    File_tags: [{
      type: String,
      trim: true,
    }],
    File_description: {
      type: String,
      trim: true,
    },
    File_isPublic: {
      type: Boolean,
      default: false,
    },
    File_downloadCount: {
      type: Number,
      default: 0,
    },
    File_thumbnailPath: {
      type: String,
      default: null,
    },
    File_processedVersions: [{
      format: {
        type: String,
        required: true,
      },
      path: {
        type: String,
        required: true,
      },
      size: {
        type: Number,
        required: true,
      },
    }],
    File_metadata: {
      duration: {
        type: Number,
        default: null,
      },
      dimensions: {
        width: {
          type: Number,
          default: null,
        },
        height: {
          type: Number,
          default: null,
        },
      },
      pages: {
        type: Number,
        default: null,
      },
    },
    File_uploadProgress: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },
    File_processingStatus: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
    File_hash: {
      type: String,
      index: true,
      sparse: true, // Allow null values but index non-null ones
    },
    File_securityScan: {
      status: {
        type: String,
        enum: ["pending", "scanning", "clean", "threat_detected", "failed"],
        default: "pending",
      },
      scannedAt: {
        type: Date,
        default: null,
      },
      threats: [{
        type: String,
        severity: {
          type: String,
          enum: ["low", "medium", "high", "critical"],
        },
        description: String,
      }],
    },
    File_createdAt: {
      type: Date,
      default: Date.now,
    },
    File_updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: {
      createdAt: "File_createdAt",
      updatedAt: "File_updatedAt",
      currentTime: () => new Date(),
    },
  }
);

// Index for efficient queries
FileSchema.index({ File_uploadedBy: 1, File_createdAt: -1 });
FileSchema.index({ File_groupId: 1, File_createdAt: -1 });
FileSchema.index({ File_groupId: 1, File_type: 1 });
FileSchema.index({ File_category: 1, File_createdAt: -1 });
FileSchema.index({ File_tags: 1 });
FileSchema.index({ File_processingStatus: 1 });
FileSchema.index({ "File_securityScan.status": 1 });
FileSchema.index({ File_uploadedBy: 1, File_hash: 1 }); // For duplicate detection

// Virtual for file extension
FileSchema.virtual("File_extension").get(function () {
  return this.File_originalName.split(".").pop().toLowerCase();
});

// Virtual for human readable file size (backward compatibility)
FileSchema.virtual("File_sizeFormatted").get(function () {
  const bytes = this.File_fileSize || this.File_size || 0;
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
});

// Virtual for backward compatibility
FileSchema.virtual("File_size").get(function () {
  return this.File_fileSize;
});

// Method to check if file is safe to download
FileSchema.methods.isSafe = function() {
  return this.File_securityScan.status === "clean" || 
         this.File_securityScan.status === "pending";
};

// Method to check if file processing is complete
FileSchema.methods.isProcessed = function() {
  return this.File_processingStatus === "completed";
};

// Method to get appropriate thumbnail
FileSchema.methods.getThumbnail = function() {
  if (this.File_thumbnailPath) {
    return this.File_thumbnailPath;
  }
  
  // Return default thumbnails based on file type
  const defaultThumbnails = {
    image: "/assets/thumbnails/image-default.png",
    video: "/assets/thumbnails/video-default.png",
    audio: "/assets/thumbnails/audio-default.png",
    document: "/assets/thumbnails/document-default.png",
    other: "/assets/thumbnails/file-default.png"
  };
  
  return defaultThumbnails[this.File_type] || defaultThumbnails.other;
};

// Method to increment download count
FileSchema.methods.incrementDownloadCount = function() {
  this.File_downloadCount += 1;
  return this.save();
};

// Ensure virtual fields are serialized
FileSchema.set("toJSON", { virtuals: true });
FileSchema.set("toObject", { virtuals: true });

const File = mongoose.model("File", FileSchema);

module.exports = File;
