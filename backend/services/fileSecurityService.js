const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * File Security Service
 * Provides advanced security scanning and validation for uploaded files
 */

// Dangerous file signatures (magic numbers)
const DANGEROUS_SIGNATURES = {
  // Executable files
  'MZ': { type: 'executable', description: 'Windows executable' },
  '4D5A': { type: 'executable', description: 'DOS executable' },
  '7F454C46': { type: 'executable', description: 'ELF executable' },
  'CAFEBABE': { type: 'executable', description: 'Java class file' },
  
  // Script files (check content, not just extension)
  '3C3F706870': { type: 'script', description: 'PHP script' },
  '23212F': { type: 'script', description: 'Shell script' },
  
  // Archive files that might contain malware
  '504B0304': { type: 'archive', description: 'ZIP archive', allowed: true },
  '526172211A07': { type: 'archive', description: 'RAR archive', allowed: true },
  '1F8B': { type: 'archive', description: 'GZIP archive', allowed: true },
  
  // Document files
  '25504446': { type: 'document', description: 'PDF document', allowed: true },
  'D0CF11E0A1B11AE1': { type: 'document', description: 'Microsoft Office document', allowed: true },
  '504B030414000600': { type: 'document', description: 'Office Open XML document', allowed: true },
  
  // Image files
  'FFD8FF': { type: 'image', description: 'JPEG image', allowed: true },
  '89504E47': { type: 'image', description: 'PNG image', allowed: true },
  '47494638': { type: 'image', description: 'GIF image', allowed: true },
  '424D': { type: 'image', description: 'BMP image', allowed: true },
  
  // Video files
  '000000': { type: 'video', description: 'MP4 video', allowed: true },
  '1A45DFA3': { type: 'video', description: 'WebM video', allowed: true }
};

// Suspicious patterns in file content
const SUSPICIOUS_PATTERNS = [
  // Script injection patterns
  /<script[^>]*>[\s\S]*?<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi, // Event handlers
  
  // SQL injection patterns
  /(\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bCREATE\b|\bALTER\b).*(\bFROM\b|\bINTO\b|\bTABLE\b)/gi,
  
  // Command injection patterns
  /(\||;|`|\$\(|\$\{).*(\bcat\b|\bls\b|\brm\b|\bwget\b|\bcurl\b|\bchmod\b|\bchown\b)/gi,
  
  // Path traversal patterns
  /\.\.[\/\\]/g,
  
  // Embedded executables
  /MZ[\x00-\xFF]{58}PE\x00\x00/,
  
  // Macro indicators in Office documents
  /VBA|Macro|AutoOpen|AutoExec|Document_Open/gi
];

// Maximum file sizes by type (in bytes)
const MAX_FILE_SIZES = {
  image: 10 * 1024 * 1024, // 10MB
  video: 100 * 1024 * 1024, // 100MB
  audio: 50 * 1024 * 1024, // 50MB
  document: 50 * 1024 * 1024, // 50MB
  archive: 100 * 1024 * 1024, // 100MB
  default: 50 * 1024 * 1024 // 50MB
};

/**
 * Read file signature (magic numbers)
 * @param {string} filePath - Path to file
 * @param {number} bytes - Number of bytes to read
 * @returns {Promise<string>} Hex string of file signature
 */
async function readFileSignature(filePath, bytes = 8) {
  try {
    const buffer = Buffer.alloc(bytes);
    const fd = await fs.open(filePath, 'r');
    await fd.read(buffer, 0, bytes, 0);
    await fd.close();
    return buffer.toString('hex').toUpperCase();
  } catch (error) {
    console.error('Error reading file signature:', error);
    return '';
  }
}

/**
 * Verify file type matches its content
 * @param {string} filePath - Path to file
 * @param {string} declaredMimeType - MIME type from upload
 * @returns {Promise<Object>} Verification result
 */
async function verifyFileType(filePath, declaredMimeType) {
  try {
    const signature = await readFileSignature(filePath);
    
    // Check against known signatures
    for (const [sig, info] of Object.entries(DANGEROUS_SIGNATURES)) {
      if (signature.startsWith(sig)) {
        return {
          isValid: info.allowed === true,
          detectedType: info.type,
          description: info.description,
          matchesDeclared: checkMimeTypeMatch(declaredMimeType, info.type),
          signature: sig
        };
      }
    }
    
    // Unknown signature - be cautious
    return {
      isValid: false,
      detectedType: 'unknown',
      description: 'Unknown file type',
      matchesDeclared: false,
      signature: signature.substring(0, 16)
    };
  } catch (error) {
    console.error('Error verifying file type:', error);
    return {
      isValid: false,
      error: error.message
    };
  }
}

/**
 * Check if MIME type matches detected file type
 * @param {string} mimeType - Declared MIME type
 * @param {string} detectedType - Detected file type
 * @returns {boolean} Whether types match
 */
function checkMimeTypeMatch(mimeType, detectedType) {
  const mimeMap = {
    'image': ['image/'],
    'video': ['video/'],
    'audio': ['audio/'],
    'document': ['application/pdf', 'application/msword', 'application/vnd.'],
    'archive': ['application/zip', 'application/x-rar', 'application/x-gzip'],
    'executable': []
  };
  
  const patterns = mimeMap[detectedType] || [];
  return patterns.some(pattern => mimeType.startsWith(pattern));
}

/**
 * Scan file content for suspicious patterns
 * @param {string} filePath - Path to file
 * @param {string} fileType - Type of file
 * @returns {Promise<Object>} Scan result
 */
async function scanFileContent(filePath, fileType) {
  try {
    // Only scan text-based files and documents
    const scannableTypes = ['document', 'text', 'script'];
    if (!scannableTypes.includes(fileType)) {
      return {
        scanned: false,
        reason: 'File type not scannable for content patterns'
      };
    }
    
    // Read file content (limit to first 1MB for performance)
    const maxScanSize = 1024 * 1024;
    const stats = await fs.stat(filePath);
    const readSize = Math.min(stats.size, maxScanSize);
    
    const buffer = Buffer.alloc(readSize);
    const fd = await fs.open(filePath, 'r');
    await fd.read(buffer, 0, readSize, 0);
    await fd.close();
    
    const content = buffer.toString('utf8', 0, readSize);
    const threats = [];
    
    // Check for suspicious patterns
    for (const pattern of SUSPICIOUS_PATTERNS) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        threats.push({
          pattern: pattern.toString(),
          matches: matches.length,
          sample: matches[0].substring(0, 100)
        });
      }
    }
    
    return {
      scanned: true,
      threatsFound: threats.length,
      threats,
      isSafe: threats.length === 0
    };
  } catch (error) {
    console.error('Error scanning file content:', error);
    return {
      scanned: false,
      error: error.message
    };
  }
}

/**
 * Check file size against limits
 * @param {number} fileSize - Size of file in bytes
 * @param {string} fileType - Type of file
 * @returns {Object} Size check result
 */
function checkFileSize(fileSize, fileType) {
  const maxSize = MAX_FILE_SIZES[fileType] || MAX_FILE_SIZES.default;
  
  return {
    isValid: fileSize <= maxSize,
    fileSize,
    maxSize,
    exceededBy: fileSize > maxSize ? fileSize - maxSize : 0
  };
}

/**
 * Calculate file hash for duplicate detection and integrity
 * @param {string} filePath - Path to file
 * @param {string} algorithm - Hash algorithm (default: sha256)
 * @returns {Promise<string>} File hash
 */
async function calculateFileHash(filePath, algorithm = 'sha256') {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const hash = crypto.createHash(algorithm);
    hash.update(fileBuffer);
    return hash.digest('hex');
  } catch (error) {
    console.error('Error calculating file hash:', error);
    throw error;
  }
}

/**
 * Check filename for suspicious patterns
 * @param {string} filename - Original filename
 * @returns {Object} Filename check result
 */
function checkFilename(filename) {
  const issues = [];
  
  // Check for double extensions
  const extensions = filename.match(/\.[^.]+/g) || [];
  if (extensions.length > 1) {
    issues.push({
      type: 'double_extension',
      severity: 'high',
      message: 'File has multiple extensions which may indicate an attempt to disguise file type'
    });
  }
  
  // Check for suspicious characters
  const suspiciousChars = /[<>:"|?*\x00-\x1f]/g;
  if (suspiciousChars.test(filename)) {
    issues.push({
      type: 'suspicious_characters',
      severity: 'medium',
      message: 'Filename contains suspicious characters'
    });
  }
  
  // Check for path traversal attempts
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    issues.push({
      type: 'path_traversal',
      severity: 'critical',
      message: 'Filename contains path traversal patterns'
    });
  }
  
  // Check for excessively long filename
  if (filename.length > 255) {
    issues.push({
      type: 'excessive_length',
      severity: 'low',
      message: 'Filename is excessively long'
    });
  }
  
  // Check for hidden file indicators
  if (filename.startsWith('.')) {
    issues.push({
      type: 'hidden_file',
      severity: 'low',
      message: 'File appears to be a hidden file'
    });
  }
  
  return {
    isValid: issues.filter(i => i.severity === 'critical').length === 0,
    issues,
    sanitizedName: sanitizeFilename(filename)
  };
}

/**
 * Sanitize filename
 * @param {string} filename - Original filename
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(filename) {
  // Remove path components
  let sanitized = path.basename(filename);
  
  // Remove suspicious characters
  sanitized = sanitized.replace(/[<>:"|?*\x00-\x1f]/g, '');
  
  // Remove path traversal patterns
  sanitized = sanitized.replace(/\.\./g, '');
  
  // Limit length
  if (sanitized.length > 255) {
    const ext = path.extname(sanitized);
    const name = path.basename(sanitized, ext);
    sanitized = name.substring(0, 255 - ext.length) + ext;
  }
  
  return sanitized;
}

/**
 * Comprehensive file security scan
 * @param {Object} file - Multer file object
 * @param {Object} options - Scan options
 * @returns {Promise<Object>} Complete security scan result
 */
async function performSecurityScan(file, options = {}) {
  const {
    checkSignature = true,
    scanContent = true,
    checkSize = true,
    calculateHash = true,
    checkFilename = true
  } = options;
  
  const results = {
    filename: file.originalname,
    path: file.path,
    size: file.size,
    mimeType: file.mimetype,
    timestamp: new Date(),
    passed: true,
    issues: [],
    warnings: []
  };
  
  try {
    // Check filename
    if (checkFilename) {
      const filenameCheck = checkFilename(file.originalname);
      results.filenameCheck = filenameCheck;
      
      if (!filenameCheck.isValid) {
        results.passed = false;
        results.issues.push(...filenameCheck.issues.filter(i => i.severity === 'critical'));
      }
      results.warnings.push(...filenameCheck.issues.filter(i => i.severity !== 'critical'));
    }
    
    // Verify file type
    if (checkSignature) {
      const typeVerification = await verifyFileType(file.path, file.mimetype);
      results.typeVerification = typeVerification;
      
      if (!typeVerification.isValid) {
        results.passed = false;
        results.issues.push({
          type: 'invalid_file_type',
          severity: 'critical',
          message: `File type not allowed: ${typeVerification.description}`
        });
      }
      
      if (!typeVerification.matchesDeclared) {
        results.warnings.push({
          type: 'type_mismatch',
          severity: 'medium',
          message: 'Declared MIME type does not match file content'
        });
      }
    }
    
    // Check file size
    if (checkSize && results.typeVerification) {
      const sizeCheck = checkFileSize(file.size, results.typeVerification.detectedType);
      results.sizeCheck = sizeCheck;
      
      if (!sizeCheck.isValid) {
        results.passed = false;
        results.issues.push({
          type: 'file_too_large',
          severity: 'high',
          message: `File size exceeds maximum allowed (${sizeCheck.maxSize} bytes)`
        });
      }
    }
    
    // Scan content
    if (scanContent && results.typeVerification) {
      const contentScan = await scanFileContent(file.path, results.typeVerification.detectedType);
      results.contentScan = contentScan;
      
      if (contentScan.scanned && !contentScan.isSafe) {
        results.passed = false;
        results.issues.push({
          type: 'suspicious_content',
          severity: 'critical',
          message: `Found ${contentScan.threatsFound} suspicious patterns in file content`,
          threats: contentScan.threats
        });
      }
    }
    
    // Calculate hash
    if (calculateHash) {
      results.hash = await calculateFileHash(file.path);
    }
    
    // Overall security score (0-100)
    results.securityScore = calculateSecurityScore(results);
    
    return results;
    
  } catch (error) {
    console.error('Error performing security scan:', error);
    return {
      ...results,
      passed: false,
      error: error.message,
      issues: [{
        type: 'scan_error',
        severity: 'critical',
        message: 'Failed to complete security scan'
      }]
    };
  }
}

/**
 * Calculate security score based on scan results
 * @param {Object} results - Scan results
 * @returns {number} Security score (0-100)
 */
function calculateSecurityScore(results) {
  let score = 100;
  
  // Deduct points for issues
  for (const issue of results.issues || []) {
    switch (issue.severity) {
      case 'critical':
        score -= 50;
        break;
      case 'high':
        score -= 30;
        break;
      case 'medium':
        score -= 15;
        break;
      case 'low':
        score -= 5;
        break;
    }
  }
  
  // Deduct points for warnings
  for (const warning of results.warnings || []) {
    switch (warning.severity) {
      case 'high':
        score -= 10;
        break;
      case 'medium':
        score -= 5;
        break;
      case 'low':
        score -= 2;
        break;
    }
  }
  
  return Math.max(0, score);
}

/**
 * Quick security check for file uploads
 * @param {Object} file - Multer file object
 * @returns {Promise<boolean>} Whether file passes basic security checks
 */
async function quickSecurityCheck(file) {
  const result = await performSecurityScan(file, {
    checkSignature: true,
    scanContent: false,
    checkSize: true,
    calculateHash: false,
    checkFilename: true
  });
  
  return result.passed && result.securityScore >= 70;
}

module.exports = {
  verifyFileType,
  scanFileContent,
  checkFileSize,
  calculateFileHash,
  checkFilename,
  sanitizeFilename,
  performSecurityScan,
  quickSecurityCheck,
  DANGEROUS_SIGNATURES,
  MAX_FILE_SIZES
};
