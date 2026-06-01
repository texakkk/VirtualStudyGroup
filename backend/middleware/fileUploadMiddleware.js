const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fileValidationService = require('../services/fileValidationService');
const fileProcessingService = require('../services/fileProcessingService');
const fileSecurityService = require('../services/fileSecurityService');

// Ensure upload directories exist
const uploadDir = path.join(__dirname, '../uploads');
const tempDir = path.join(__dirname, '../temp');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp and random string
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, extension);
    
    // Sanitize filename
    const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9\-_]/g, '_');
    const filename = `${uniqueSuffix}-${sanitizedBaseName}${extension}`;
    
    cb(null, filename);
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  // Basic checks before multer processes the file
  const extension = path.extname(file.originalname).toLowerCase();
  const dangerousExtensions = ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar', '.sh'];
  
  if (dangerousExtensions.includes(extension)) {
    return cb(new Error(`File extension ${extension} is not allowed for security reasons`), false);
  }
  
  cb(null, true);
};

// Create multer instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
    files: 10, // Maximum 10 files per request
    fields: 20, // Maximum 20 non-file fields
    fieldNameSize: 100, // Maximum field name size
    fieldSize: 1024 * 1024 // Maximum field value size (1MB)
  }
});

/**
 * Enhanced file upload middleware with validation and processing
 * @param {Object} options - Upload options
 * @returns {Function} Express middleware
 */
function createFileUploadMiddleware(options = {}) {
  const {
    fieldName = 'file',
    multiple = false,
    maxFiles = 1,
    validateFile = true,
    processFile = true,
    customValidation = null
  } = options;

  return async (req, res, next) => {
    try {
      // Use appropriate multer method based on options
      let multerMiddleware;
      if (multiple) {
        multerMiddleware = upload.array(fieldName, maxFiles);
      } else {
        multerMiddleware = upload.single(fieldName);
      }

      // Execute multer middleware
      multerMiddleware(req, res, async (err) => {
        if (err) {
          if (err instanceof multer.MulterError) {
            return res.status(400).json({
              success: false,
              error: 'File upload error',
              details: getMulterErrorMessage(err),
              code: err.code
            });
          }
          return res.status(400).json({
            success: false,
            error: 'File upload error',
            details: err.message
          });
        }

        // Get uploaded files
        const files = multiple ? (req.files || []) : (req.file ? [req.file] : []);
        
        if (files.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'No files uploaded'
          });
        }

        // Validate files if enabled
        if (validateFile) {
          const validationResults = [];
          
          for (const file of files) {
            try {
              // Basic validation
              const validation = await fileValidationService.validateFile(file, {
                customRules: customValidation ? [customValidation] : null
              });
              
              validationResults.push({
                file: file.originalname,
                validation: validation
              });

              // If any file fails validation, clean up and return error
              if (!validation.isValid) {
                await cleanupUploadedFiles(files);
                return res.status(400).json({
                  success: false,
                  error: 'File validation failed',
                  details: validation.errors,
                  warnings: validation.warnings,
                  file: file.originalname
                });
              }

              // Add validation results to file object
              file.validationResult = validation;
              
              // Perform security scan
              const securityScan = await fileSecurityService.performSecurityScan(file, {
                checkSignature: true,
                scanContent: true,
                checkSize: true,
                calculateHash: true,
                checkFilename: true
              });
              
              file.securityScan = securityScan;
              
              // If security scan fails, clean up and return error
              if (!securityScan.passed) {
                await cleanupUploadedFiles(files);
                return res.status(400).json({
                  success: false,
                  error: 'File security scan failed',
                  details: securityScan.issues,
                  warnings: securityScan.warnings,
                  securityScore: securityScan.securityScore,
                  file: file.originalname
                });
              }
              
              // Warn if security score is low but still passing
              if (securityScan.securityScore < 80) {
                console.warn(`File ${file.originalname} has low security score: ${securityScan.securityScore}`);
              }
              
            } catch (validationError) {
              await cleanupUploadedFiles(files);
              return res.status(500).json({
                success: false,
                error: 'File validation error',
                details: validationError.message,
                file: file.originalname
              });
            }
          }

          // Add validation results to request
          req.fileValidationResults = validationResults;
        }

        // Add files to request object
        if (multiple) {
          req.uploadedFiles = files;
        } else {
          req.uploadedFile = files[0];
        }

        // Continue to next middleware
        next();
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'File upload middleware error',
        details: error.message
      });
    }
  };
}

/**
 * Middleware to process uploaded files
 * @param {Object} options - Processing options
 * @returns {Function} Express middleware
 */
function createFileProcessingMiddleware(options = {}) {
  const {
    processImmediately = false,
    generateHash = true,
    checkDuplicates = true
  } = options;

  return async (req, res, next) => {
    try {
      const files = req.uploadedFiles || (req.uploadedFile ? [req.uploadedFile] : []);
      
      if (files.length === 0) {
        return next();
      }

      const processingResults = [];

      for (const file of files) {
        try {
          const result = {
            file: file.originalname,
            hash: null,
            isDuplicate: false,
            processingStatus: 'pending'
          };

          // Generate file hash if enabled
          if (generateHash) {
            result.hash = await fileProcessingService.generateFileHash(file.path);
            file.hash = result.hash;
          }

          // Check for duplicates if enabled
          if (checkDuplicates && result.hash && req.user) {
            const duplicateCheck = await fileProcessingService.checkForDuplicate(result.hash, req.user.id);
            result.isDuplicate = duplicateCheck.isDuplicate;
            
            if (duplicateCheck.isDuplicate) {
              result.existingFile = duplicateCheck.existingFile;
            }
          }

          processingResults.push(result);

        } catch (processingError) {
          processingResults.push({
            file: file.originalname,
            error: processingError.message,
            processingStatus: 'failed'
          });
        }
      }

      // Add processing results to request
      req.fileProcessingResults = processingResults;

      next();

    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'File processing middleware error',
        details: error.message
      });
    }
  };
}

/**
 * Middleware to handle file upload errors
 * @param {Error} error - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function fileUploadErrorHandler(error, req, res, next) {
  // Clean up any uploaded files on error
  if (req.file) {
    cleanupUploadedFiles([req.file]);
  }
  if (req.files) {
    cleanupUploadedFiles(req.files);
  }

  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      error: 'File upload error',
      details: getMulterErrorMessage(error),
      code: error.code
    });
  }

  if (error.message && error.message.includes('File extension')) {
    return res.status(400).json({
      success: false,
      error: 'Invalid file type',
      details: error.message
    });
  }

  // Pass other errors to default error handler
  next(error);
}

/**
 * Clean up uploaded files
 * @param {Array} files - Array of uploaded files
 */
async function cleanupUploadedFiles(files) {
  for (const file of files) {
    try {
      if (file.path && fs.existsSync(file.path)) {
        await fs.promises.unlink(file.path);
      }
    } catch (error) {
      console.error(`Error cleaning up file ${file.path}:`, error);
    }
  }
}

/**
 * Get user-friendly error message for multer errors
 * @param {Object} error - Multer error object
 * @returns {String} User-friendly error message
 */
function getMulterErrorMessage(error) {
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return 'File size exceeds the maximum allowed limit';
    case 'LIMIT_FILE_COUNT':
      return 'Too many files uploaded';
    case 'LIMIT_FIELD_KEY':
      return 'Field name is too long';
    case 'LIMIT_FIELD_VALUE':
      return 'Field value is too long';
    case 'LIMIT_FIELD_COUNT':
      return 'Too many fields';
    case 'LIMIT_UNEXPECTED_FILE':
      return 'Unexpected file field';
    case 'MISSING_FIELD_NAME':
      return 'Missing field name';
    default:
      return error.message || 'Unknown upload error';
  }
}

/**
 * Middleware to validate file upload permissions
 * @param {Object} options - Permission options
 * @returns {Function} Express middleware
 */
function validateUploadPermissions(options = {}) {
  const {
    requireAuth = true,
    requireGroupMembership = false,
    allowedRoles = null
  } = options;

  return async (req, res, next) => {
    try {
      // Check authentication if required
      if (requireAuth && !req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required for file upload'
        });
      }

      // Check group membership if required
      if (requireGroupMembership && req.body.groupId) {
        // This would need to be implemented based on your group membership logic
        // For now, we'll assume the check passes
      }

      // Check user roles if specified
      if (allowedRoles && req.user) {
        if (!allowedRoles.includes(req.user.role)) {
          return res.status(403).json({
            success: false,
            error: 'Insufficient permissions for file upload'
          });
        }
      }

      next();

    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Permission validation error',
        details: error.message
      });
    }
  };
}

module.exports = {
  upload,
  createFileUploadMiddleware,
  createFileProcessingMiddleware,
  fileUploadErrorHandler,
  validateUploadPermissions,
  cleanupUploadedFiles
};