const express = require('express');
const router = express.Router();
const File = require('../models/File');
const fileProcessingService = require('../services/fileProcessingService');
const { 
  createFileUploadMiddleware, 
  createFileProcessingMiddleware,
  validateUploadPermissions,
  fileUploadErrorHandler 
} = require('../middleware/fileUploadMiddleware');
const authMiddleware = require('../middleware/authMiddleware');

/**
 * Upload single file with enhanced validation and processing
 * POST /api/files/upload
 */
router.post('/upload',
  authMiddleware, // Ensure user is authenticated
  validateUploadPermissions({ requireAuth: true }), // Validate upload permissions
  createFileUploadMiddleware({ 
    fieldName: 'file',
    multiple: false,
    validateFile: true 
  }), // Handle file upload with validation
  createFileProcessingMiddleware({ 
    generateHash: true,
    checkDuplicates: true 
  }), // Process uploaded file
  async (req, res) => {
    try {
      const uploadedFile = req.uploadedFile;
      const processingResult = req.fileProcessingResults[0];

      // Check if file is a duplicate
      if (processingResult.isDuplicate) {
        // Clean up the uploaded file since it's a duplicate
        const fs = require('fs').promises;
        try {
          await fs.unlink(uploadedFile.path);
        } catch (cleanupError) {
          console.error('Error cleaning up duplicate file:', cleanupError);
        }

        return res.status(409).json({
          success: false,
          error: 'Duplicate file detected',
          existingFile: {
            id: processingResult.existingFile._id,
            name: processingResult.existingFile.File_originalName,
            uploadedAt: processingResult.existingFile.File_createdAt
          }
        });
      }

      // Create file record in database
      const fileData = {
        File_originalName: uploadedFile.originalname,
        File_fileName: uploadedFile.filename,
        File_filePath: uploadedFile.path,
        File_url: `/api/files/${uploadedFile.filename}`,
        File_fileSize: uploadedFile.size,
        File_mimeType: uploadedFile.mimetype,
        File_type: uploadedFile.validationResult.fileCategory,
        File_uploadedBy: req.user.id,
        File_groupId: req.body.groupId || null,
        File_category: uploadedFile.validationResult.fileCategory,
        File_tags: req.body.tags ? req.body.tags.split(',').map(tag => tag.trim()) : [],
        File_description: req.body.description || '',
        File_isPublic: req.body.isPublic === 'true',
        File_hash: processingResult.hash,
        File_processingStatus: 'pending',
        File_securityScan: {
          status: 'pending',
          threats: []
        }
      };

      const file = new File(fileData);
      await file.save();

      // Start background processing
      setImmediate(async () => {
        try {
          // Process the file (generate thumbnails, extract metadata, etc.)
          await fileProcessingService.processFile(uploadedFile, file._id);
          
          // Perform security scan
          await fileProcessingService.performSecurityScan(file._id);
        } catch (processingError) {
          console.error(`Background processing failed for file ${file._id}:`, processingError);
        }
      });

      res.status(201).json({
        success: true,
        message: 'File uploaded successfully',
        file: {
          id: file._id,
          originalName: file.File_originalName,
          fileName: file.File_fileName,
          size: file.File_fileSize,
          type: file.File_type,
          category: file.File_category,
          url: file.File_url,
          processingStatus: file.File_processingStatus,
          securityStatus: file.File_securityScan.status,
          uploadedAt: file.File_createdAt
        },
        validation: {
          warnings: uploadedFile.validationResult.warnings
        }
      });

    } catch (error) {
      console.error('File upload error:', error);
      res.status(500).json({
        success: false,
        error: 'File upload failed',
        details: error.message
      });
    }
  }
);

/**
 * Upload multiple files
 * POST /api/files/upload-multiple
 */
router.post('/upload-multiple',
  authMiddleware,
  validateUploadPermissions({ requireAuth: true }),
  createFileUploadMiddleware({ 
    fieldName: 'files',
    multiple: true,
    maxFiles: 10,
    validateFile: true 
  }),
  createFileProcessingMiddleware({ 
    generateHash: true,
    checkDuplicates: true 
  }),
  async (req, res) => {
    try {
      const uploadedFiles = req.uploadedFiles;
      const processingResults = req.fileProcessingResults;
      const savedFiles = [];
      const duplicates = [];
      const errors = [];

      for (let i = 0; i < uploadedFiles.length; i++) {
        const uploadedFile = uploadedFiles[i];
        const processingResult = processingResults[i];

        try {
          // Check if file is a duplicate
          if (processingResult.isDuplicate) {
            duplicates.push({
              originalName: uploadedFile.originalname,
              existingFile: processingResult.existingFile
            });
            
            // Clean up duplicate file
            const fs = require('fs').promises;
            try {
              await fs.unlink(uploadedFile.path);
            } catch (cleanupError) {
              console.error('Error cleaning up duplicate file:', cleanupError);
            }
            continue;
          }

          // Create file record
          const fileData = {
            File_originalName: uploadedFile.originalname,
            File_fileName: uploadedFile.filename,
            File_filePath: uploadedFile.path,
            File_url: `/api/files/${uploadedFile.filename}`,
            File_fileSize: uploadedFile.size,
            File_mimeType: uploadedFile.mimetype,
            File_type: uploadedFile.validationResult.fileCategory,
            File_uploadedBy: req.user.id,
            File_groupId: req.body.groupId || null,
            File_category: uploadedFile.validationResult.fileCategory,
            File_tags: req.body.tags ? req.body.tags.split(',').map(tag => tag.trim()) : [],
            File_description: req.body.description || '',
            File_isPublic: req.body.isPublic === 'true',
            File_hash: processingResult.hash,
            File_processingStatus: 'pending',
            File_securityScan: {
              status: 'pending',
              threats: []
            }
          };

          const file = new File(fileData);
          await file.save();

          savedFiles.push({
            id: file._id,
            originalName: file.File_originalName,
            fileName: file.File_fileName,
            size: file.File_fileSize,
            type: file.File_type,
            category: file.File_category,
            url: file.File_url,
            processingStatus: file.File_processingStatus,
            securityStatus: file.File_securityScan.status,
            uploadedAt: file.File_createdAt
          });

          // Start background processing
          setImmediate(async () => {
            try {
              await fileProcessingService.processFile(uploadedFile, file._id);
              await fileProcessingService.performSecurityScan(file._id);
            } catch (processingError) {
              console.error(`Background processing failed for file ${file._id}:`, processingError);
            }
          });

        } catch (fileError) {
          errors.push({
            originalName: uploadedFile.originalname,
            error: fileError.message
          });
        }
      }

      res.status(201).json({
        success: true,
        message: `Uploaded ${savedFiles.length} files successfully`,
        files: savedFiles,
        duplicates: duplicates,
        errors: errors,
        summary: {
          uploaded: savedFiles.length,
          duplicates: duplicates.length,
          errors: errors.length,
          total: uploadedFiles.length
        }
      });

    } catch (error) {
      console.error('Multiple file upload error:', error);
      res.status(500).json({
        success: false,
        error: 'Multiple file upload failed',
        details: error.message
      });
    }
  }
);

/**
 * Get file processing status
 * GET /api/files/:id/status
 */
router.get('/:id/status', authMiddleware, async (req, res) => {
  try {
    const fileId = req.params.id;
    const status = await fileProcessingService.getProcessingStatus(fileId);

    res.json({
      success: true,
      status: status
    });

  } catch (error) {
    console.error('Error getting file status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get file status',
      details: error.message
    });
  }
});

/**
 * Download file with security checks
 * GET /api/files/:id/download
 */
router.get('/:id/download', authMiddleware, async (req, res) => {
  try {
    const fileId = req.params.id;
    const file = await File.findById(fileId);

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Check if user has permission to download
    if (!file.File_isPublic && file.File_uploadedBy.toString() !== req.user.id) {
      // Additional permission checks could be added here
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Check if file is safe to download
    if (!file.isSafe()) {
      return res.status(423).json({
        success: false,
        error: 'File is not safe to download',
        securityStatus: file.File_securityScan.status,
        threats: file.File_securityScan.threats
      });
    }

    // Increment download count
    await file.incrementDownloadCount();

    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${file.File_originalName}"`);
    res.setHeader('Content-Type', file.File_mimeType);
    res.setHeader('Content-Length', file.File_fileSize);

    // Stream the file
    const fs = require('fs');
    const fileStream = fs.createReadStream(file.File_filePath);
    
    fileStream.on('error', (error) => {
      console.error('File stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Error reading file'
        });
      }
    });

    fileStream.pipe(res);

  } catch (error) {
    console.error('File download error:', error);
    res.status(500).json({
      success: false,
      error: 'File download failed',
      details: error.message
    });
  }
});

/**
 * Get file metadata
 * GET /api/files/:id
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const fileId = req.params.id;
    const file = await File.findById(fileId).populate('File_uploadedBy', 'name email');

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Check permissions
    if (!file.File_isPublic && file.File_uploadedBy._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    res.json({
      success: true,
      file: {
        id: file._id,
        originalName: file.File_originalName,
        fileName: file.File_fileName,
        size: file.File_fileSize,
        sizeFormatted: file.File_sizeFormatted,
        type: file.File_type,
        category: file.File_category,
        mimeType: file.File_mimeType,
        url: file.File_url,
        thumbnailUrl: file.getThumbnail(),
        tags: file.File_tags,
        description: file.File_description,
        isPublic: file.File_isPublic,
        downloadCount: file.File_downloadCount,
        processingStatus: file.File_processingStatus,
        securityScan: file.File_securityScan,
        metadata: file.File_metadata,
        processedVersions: file.File_processedVersions,
        uploadedBy: {
          id: file.File_uploadedBy._id,
          name: file.File_uploadedBy.name
        },
        uploadedAt: file.File_createdAt,
        updatedAt: file.File_updatedAt
      }
    });

  } catch (error) {
    console.error('Error getting file metadata:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get file metadata',
      details: error.message
    });
  }
});

/**
 * Update file tags
 * PUT /api/files/:id/tags
 */
router.put('/:id/tags', authMiddleware, async (req, res) => {
  try {
    const fileId = req.params.id;
    const { tags } = req.body;

    if (!tags || !Array.isArray(tags)) {
      return res.status(400).json({
        success: false,
        error: 'Tags must be an array'
      });
    }

    const file = await File.findById(fileId);

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Check permissions
    if (file.File_uploadedBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Update tags
    file.File_tags = tags;
    await file.save();

    res.json({
      success: true,
      message: 'Tags updated successfully',
      tags: file.File_tags
    });

  } catch (error) {
    console.error('Tag update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update tags',
      details: error.message
    });
  }
});

/**
 * Update optimization settings
 * PUT /api/files/:id/optimization
 */
router.put('/:id/optimization', authMiddleware, async (req, res) => {
  try {
    const fileId = req.params.id;
    const { quality, format } = req.body;

    const file = await File.findById(fileId);

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Check permissions
    if (file.File_uploadedBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Store optimization preferences in metadata
    if (!file.File_metadata) {
      file.File_metadata = {};
    }
    
    file.File_metadata.optimizationSettings = {
      quality: quality || 'auto',
      format: format || 'auto',
      updatedAt: new Date()
    };

    await file.save();

    // Trigger reprocessing if needed
    if (file.File_type === 'image' || file.File_type === 'video') {
      setImmediate(async () => {
        try {
          await fileProcessingService.reprocessFile(fileId, { quality, format });
        } catch (processingError) {
          console.error(`Reprocessing failed for file ${fileId}:`, processingError);
        }
      });
    }

    res.json({
      success: true,
      message: 'Optimization settings updated successfully',
      settings: file.File_metadata.optimizationSettings
    });

  } catch (error) {
    console.error('Optimization settings update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update optimization settings',
      details: error.message
    });
  }
});

/**
 * Delete file
 * DELETE /api/files/:id
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const fileId = req.params.id;
    const file = await File.findById(fileId);

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Check permissions
    if (file.File_uploadedBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Delete physical file
    const fs = require('fs').promises;
    try {
      await fs.unlink(file.File_filePath);
    } catch (unlinkError) {
      console.error('Error deleting physical file:', unlinkError);
      // Continue with database deletion even if physical file deletion fails
    }

    // Delete thumbnail if exists
    if (file.File_thumbnailPath) {
      try {
        await fs.unlink(file.File_thumbnailPath);
      } catch (thumbnailError) {
        console.error('Error deleting thumbnail:', thumbnailError);
      }
    }

    // Delete processed versions
    for (const version of file.File_processedVersions) {
      try {
        await fs.unlink(version.path);
      } catch (versionError) {
        console.error('Error deleting processed version:', versionError);
      }
    }

    // Delete from database
    await File.findByIdAndDelete(fileId);

    res.json({
      success: true,
      message: 'File deleted successfully'
    });

  } catch (error) {
    console.error('File deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'File deletion failed',
      details: error.message
    });
  }
});

// Apply error handler
router.use(fileUploadErrorHandler);

module.exports = router;