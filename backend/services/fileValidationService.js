const path = require('path');
const fs = require('fs').promises;

class FileValidationService {
  constructor() {
    // File size limits (in bytes)
    this.maxFileSizes = {
      image: 10 * 1024 * 1024,    // 10MB for images
      video: 100 * 1024 * 1024,   // 100MB for videos
      audio: 50 * 1024 * 1024,    // 50MB for audio
      document: 25 * 1024 * 1024, // 25MB for documents
      other: 10 * 1024 * 1024     // 10MB for other files
    };

    // Allowed MIME types by category
    this.allowedMimeTypes = {
      image: [
        'image/jpeg',
        'image/png', 
        'image/gif',
        'image/webp',
        'image/bmp',
        'image/tiff',
        'image/svg+xml'
      ],
      video: [
        'video/mp4',
        'video/avi',
        'video/quicktime',
        'video/x-msvideo',
        'video/webm',
        'video/x-ms-wmv',
        'video/x-flv'
      ],
      audio: [
        'audio/mpeg',
        'audio/wav',
        'audio/flac',
        'audio/aac',
        'audio/ogg',
        'audio/x-ms-wma'
      ],
      document: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'application/rtf',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ]
    };

    // Dangerous file extensions that should never be allowed
    this.dangerousExtensions = [
      '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar', 
      '.sh', '.ps1', '.msi', '.dll', '.app', '.deb', '.rpm', '.dmg'
    ];

    // Suspicious file signatures (magic numbers)
    this.suspiciousSignatures = [
      { signature: Buffer.from([0x4D, 0x5A]), description: 'Windows executable' },
      { signature: Buffer.from([0x7F, 0x45, 0x4C, 0x46]), description: 'Linux executable' },
      { signature: Buffer.from([0xCA, 0xFE, 0xBA, 0xBE]), description: 'Java class file' },
      { signature: Buffer.from([0xFE, 0xED, 0xFA, 0xCE]), description: 'Mach-O executable' }
    ];
  }

  /**
   * Validate uploaded file
   * @param {Object} file - Multer file object
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  async validateFile(file, options = {}) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
      fileCategory: this.determineFileCategory(file),
      metadata: {}
    };

    try {
      // Basic file checks
      await this.validateBasicProperties(file, validation);
      
      // File size validation
      await this.validateFileSize(file, validation);
      
      // MIME type validation
      await this.validateMimeType(file, validation);
      
      // Extension validation
      await this.validateFileExtension(file, validation);
      
      // File signature validation
      await this.validateFileSignature(file, validation);
      
      // Content-based validation
      await this.validateFileContent(file, validation);
      
      // Custom validation rules
      if (options.customRules) {
        await this.applyCustomRules(file, validation, options.customRules);
      }

    } catch (error) {
      validation.isValid = false;
      validation.errors.push(`Validation error: ${error.message}`);
    }

    return validation;
  }

  /**
   * Validate basic file properties
   * @param {Object} file - Multer file object
   * @param {Object} validation - Validation result object
   */
  async validateBasicProperties(file, validation) {
    // Check if file exists
    if (!file) {
      validation.isValid = false;
      validation.errors.push('No file provided');
      return;
    }

    // Check if file has required properties
    if (!file.originalname || !file.mimetype || !file.size) {
      validation.isValid = false;
      validation.errors.push('File is missing required properties');
      return;
    }

    // Check if file is empty
    if (file.size === 0) {
      validation.isValid = false;
      validation.errors.push('File is empty');
      return;
    }

    // Check filename length
    if (file.originalname.length > 255) {
      validation.isValid = false;
      validation.errors.push('Filename is too long (maximum 255 characters)');
    }

    // Check for null bytes in filename (security)
    if (file.originalname.includes('\0')) {
      validation.isValid = false;
      validation.errors.push('Filename contains invalid characters');
    }

    // Check if file exists on disk (for uploaded files)
    if (file.path) {
      try {
        await fs.access(file.path, fs.constants.R_OK);
        const stats = await fs.stat(file.path);
        
        if (stats.size !== file.size) {
          validation.warnings.push('File size mismatch between metadata and actual file');
        }
        
        validation.metadata.actualSize = stats.size;
        validation.metadata.lastModified = stats.mtime;
      } catch (error) {
        validation.isValid = false;
        validation.errors.push('File is not accessible or corrupted');
      }
    }
  }

  /**
   * Validate file size based on category
   * @param {Object} file - Multer file object
   * @param {Object} validation - Validation result object
   */
  async validateFileSize(file, validation) {
    const category = validation.fileCategory;
    const maxSize = this.maxFileSizes[category] || this.maxFileSizes.other;

    if (file.size > maxSize) {
      validation.isValid = false;
      validation.errors.push(
        `File size (${this.formatFileSize(file.size)}) exceeds maximum allowed size for ${category} files (${this.formatFileSize(maxSize)})`
      );
    }

    // Warn for large files that might cause performance issues
    const warningThreshold = maxSize * 0.8;
    if (file.size > warningThreshold) {
      validation.warnings.push(`Large file size may affect upload and processing performance`);
    }
  }

  /**
   * Validate MIME type
   * @param {Object} file - Multer file object
   * @param {Object} validation - Validation result object
   */
  async validateMimeType(file, validation) {
    const category = validation.fileCategory;
    const allowedTypes = this.allowedMimeTypes[category] || [];

    if (!allowedTypes.includes(file.mimetype)) {
      validation.isValid = false;
      validation.errors.push(`MIME type '${file.mimetype}' is not allowed for ${category} files`);
    }

    // Check for MIME type spoofing
    const extension = path.extname(file.originalname).toLowerCase();
    const expectedMimeTypes = this.getExpectedMimeTypes(extension);
    
    if (expectedMimeTypes.length > 0 && !expectedMimeTypes.includes(file.mimetype)) {
      validation.warnings.push(`MIME type '${file.mimetype}' doesn't match file extension '${extension}'`);
    }
  }

  /**
   * Validate file extension
   * @param {Object} file - Multer file object
   * @param {Object} validation - Validation result object
   */
  async validateFileExtension(file, validation) {
    const extension = path.extname(file.originalname).toLowerCase();

    // Check for dangerous extensions
    if (this.dangerousExtensions.includes(extension)) {
      validation.isValid = false;
      validation.errors.push(`File extension '${extension}' is not allowed for security reasons`);
      return;
    }

    // Check for double extensions (potential security risk)
    const filename = path.basename(file.originalname, extension);
    const secondExtension = path.extname(filename).toLowerCase();
    
    if (secondExtension && this.dangerousExtensions.includes(secondExtension)) {
      validation.isValid = false;
      validation.errors.push(`Double extension detected with dangerous extension '${secondExtension}'`);
    }

    // Warn about unusual extensions
    if (extension && !this.isKnownExtension(extension)) {
      validation.warnings.push(`Unusual file extension '${extension}' detected`);
    }
  }

  /**
   * Validate file signature (magic numbers)
   * @param {Object} file - Multer file object
   * @param {Object} validation - Validation result object
   */
  async validateFileSignature(file, validation) {
    if (!file.path) return;

    try {
      // Read first 16 bytes to check file signature
      const buffer = Buffer.alloc(16);
      const fd = await fs.open(file.path, 'r');
      await fd.read(buffer, 0, 16, 0);
      await fd.close();

      // Check for suspicious signatures
      for (const { signature, description } of this.suspiciousSignatures) {
        if (buffer.subarray(0, signature.length).equals(signature)) {
          validation.isValid = false;
          validation.errors.push(`File contains suspicious signature: ${description}`);
          return;
        }
      }

      // Verify signature matches declared MIME type
      const detectedType = this.detectMimeTypeFromSignature(buffer);
      if (detectedType && detectedType !== file.mimetype) {
        validation.warnings.push(`File signature suggests '${detectedType}' but MIME type is '${file.mimetype}'`);
      }

    } catch (error) {
      validation.warnings.push(`Could not validate file signature: ${error.message}`);
    }
  }

  /**
   * Validate file content for suspicious patterns
   * @param {Object} file - Multer file object
   * @param {Object} validation - Validation result object
   */
  async validateFileContent(file, validation) {
    if (!file.path) return;

    try {
      // Read first 4KB for content analysis
      const buffer = Buffer.alloc(4096);
      const fd = await fs.open(file.path, 'r');
      const { bytesRead } = await fd.read(buffer, 0, 4096, 0);
      await fd.close();

      const content = buffer.subarray(0, bytesRead).toString('utf8', 0, Math.min(bytesRead, 1024));

      // Check for suspicious patterns
      const suspiciousPatterns = [
        { pattern: /eval\s*\(/gi, description: 'Code injection pattern' },
        { pattern: /exec\s*\(/gi, description: 'Command execution pattern' },
        { pattern: /system\s*\(/gi, description: 'System command pattern' },
        { pattern: /<script[^>]*>/gi, description: 'Script tag detected' },
        { pattern: /javascript:/gi, description: 'JavaScript protocol' },
        { pattern: /vbscript:/gi, description: 'VBScript protocol' },
        { pattern: /data:.*base64/gi, description: 'Base64 data URI' },
        { pattern: /\x00/g, description: 'Null byte detected' }
      ];

      for (const { pattern, description } of suspiciousPatterns) {
        if (pattern.test(content)) {
          validation.warnings.push(`Suspicious content detected: ${description}`);
        }
      }

      // Check for embedded files (polyglot attacks)
      if (this.detectEmbeddedFiles(buffer.subarray(0, bytesRead))) {
        validation.warnings.push('File may contain embedded content');
      }

    } catch (error) {
      validation.warnings.push(`Could not validate file content: ${error.message}`);
    }
  }

  /**
   * Apply custom validation rules
   * @param {Object} file - Multer file object
   * @param {Object} validation - Validation result object
   * @param {Array} customRules - Array of custom validation functions
   */
  async applyCustomRules(file, validation, customRules) {
    for (const rule of customRules) {
      try {
        const result = await rule(file, validation);
        if (result && !result.isValid) {
          validation.isValid = false;
          if (result.errors) {
            validation.errors.push(...result.errors);
          }
          if (result.warnings) {
            validation.warnings.push(...result.warnings);
          }
        }
      } catch (error) {
        validation.warnings.push(`Custom validation rule error: ${error.message}`);
      }
    }
  }

  /**
   * Determine file category based on MIME type
   * @param {Object} file - Multer file object
   * @returns {String} File category
   */
  determineFileCategory(file) {
    const mimeType = file.mimetype.toLowerCase();
    
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('text/') || 
        mimeType.includes('document') || 
        mimeType.includes('pdf') ||
        mimeType.includes('spreadsheet') ||
        mimeType.includes('presentation')) return 'document';
    
    return 'other';
  }

  /**
   * Get expected MIME types for a file extension
   * @param {String} extension - File extension
   * @returns {Array} Array of expected MIME types
   */
  getExpectedMimeTypes(extension) {
    const mimeMap = {
      '.jpg': ['image/jpeg'],
      '.jpeg': ['image/jpeg'],
      '.png': ['image/png'],
      '.gif': ['image/gif'],
      '.webp': ['image/webp'],
      '.pdf': ['application/pdf'],
      '.doc': ['application/msword'],
      '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      '.txt': ['text/plain'],
      '.mp4': ['video/mp4'],
      '.avi': ['video/avi', 'video/x-msvideo'],
      '.mov': ['video/quicktime'],
      '.mp3': ['audio/mpeg'],
      '.wav': ['audio/wav'],
      '.flac': ['audio/flac']
    };

    return mimeMap[extension] || [];
  }

  /**
   * Check if extension is known/common
   * @param {String} extension - File extension
   * @returns {Boolean} True if extension is known
   */
  isKnownExtension(extension) {
    const knownExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg',
      '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv',
      '.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma',
      '.pdf', '.doc', '.docx', '.txt', '.rtf', '.xls', '.xlsx', '.ppt', '.pptx',
      '.zip', '.rar', '.7z', '.tar', '.gz'
    ];

    return knownExtensions.includes(extension);
  }

  /**
   * Detect MIME type from file signature
   * @param {Buffer} buffer - File buffer
   * @returns {String|null} Detected MIME type
   */
  detectMimeTypeFromSignature(buffer) {
    const signatures = [
      { signature: [0xFF, 0xD8, 0xFF], mimeType: 'image/jpeg' },
      { signature: [0x89, 0x50, 0x4E, 0x47], mimeType: 'image/png' },
      { signature: [0x47, 0x49, 0x46, 0x38], mimeType: 'image/gif' },
      { signature: [0x25, 0x50, 0x44, 0x46], mimeType: 'application/pdf' },
      { signature: [0x50, 0x4B, 0x03, 0x04], mimeType: 'application/zip' },
      { signature: [0x52, 0x49, 0x46, 0x46], mimeType: 'audio/wav' }
    ];

    for (const { signature, mimeType } of signatures) {
      if (buffer.subarray(0, signature.length).equals(Buffer.from(signature))) {
        return mimeType;
      }
    }

    return null;
  }

  /**
   * Detect embedded files in buffer
   * @param {Buffer} buffer - File buffer
   * @returns {Boolean} True if embedded files detected
   */
  detectEmbeddedFiles(buffer) {
    // Look for common file signatures within the file
    const embeddedSignatures = [
      [0xFF, 0xD8, 0xFF], // JPEG
      [0x89, 0x50, 0x4E, 0x47], // PNG
      [0x25, 0x50, 0x44, 0x46], // PDF
      [0x50, 0x4B, 0x03, 0x04] // ZIP
    ];

    for (let i = 100; i < buffer.length - 4; i++) { // Skip first 100 bytes
      for (const signature of embeddedSignatures) {
        if (buffer.subarray(i, i + signature.length).equals(Buffer.from(signature))) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Format file size in human readable format
   * @param {Number} bytes - File size in bytes
   * @returns {String} Formatted file size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get validation summary
   * @param {Object} validation - Validation result
   * @returns {String} Summary string
   */
  getValidationSummary(validation) {
    const parts = [];
    
    if (!validation.isValid) {
      parts.push(`❌ Validation failed with ${validation.errors.length} error(s)`);
    } else {
      parts.push('✅ Validation passed');
    }

    if (validation.warnings.length > 0) {
      parts.push(`⚠️ ${validation.warnings.length} warning(s)`);
    }

    parts.push(`📁 Category: ${validation.fileCategory}`);

    return parts.join(' | ');
  }
}

module.exports = new FileValidationService();