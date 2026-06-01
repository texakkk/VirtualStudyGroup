const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const File = require('../models/File');

class FileProcessingService {
    constructor() {
        this.thumbnailSizes = {
            small: { width: 150, height: 150 },
            medium: { width: 300, height: 300 },
            large: { width: 600, height: 600 }
        };

        this.supportedImageFormats = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'];
        this.supportedVideoFormats = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'];
        this.supportedAudioFormats = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma'];
        this.supportedDocumentFormats = ['.pdf', '.doc', '.docx', '.txt', '.rtf'];

        // Security settings
        this.maxFileSize = 100 * 1024 * 1024; // 100MB
        this.allowedMimeTypes = [
            // Images
            'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff',
            // Videos
            'video/mp4', 'video/avi', 'video/quicktime', 'video/x-msvideo', 'video/webm',
            // Audio
            'audio/mpeg', 'audio/wav', 'audio/flac', 'audio/aac', 'audio/ogg',
            // Documents
            'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain', 'application/rtf'
        ];

        this.dangerousExtensions = ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar', '.sh'];
    }

    /**
     * Validate file before processing
     * @param {Object} fileData - File data from multer
     * @returns {Object} Validation result
     */
    async validateFile(fileData) {
        const validation = {
            isValid: true,
            errors: [],
            warnings: []
        };

        try {
            // Check file size
            if (fileData.size > this.maxFileSize) {
                validation.isValid = false;
                validation.errors.push(`File size exceeds maximum allowed size of ${this.maxFileSize / (1024 * 1024)}MB`);
            }

            // Check file extension
            const fileExtension = path.extname(fileData.originalname).toLowerCase();
            if (this.dangerousExtensions.includes(fileExtension)) {
                validation.isValid = false;
                validation.errors.push(`File extension ${fileExtension} is not allowed for security reasons`);
            }

            // Check MIME type
            if (!this.allowedMimeTypes.includes(fileData.mimetype)) {
                validation.isValid = false;
                validation.errors.push(`MIME type ${fileData.mimetype} is not allowed`);
            }

            // Check file exists and is readable
            if (fileData.path) {
                try {
                    await fs.access(fileData.path, fs.constants.R_OK);
                    const stats = await fs.stat(fileData.path);
                    if (stats.size === 0) {
                        validation.isValid = false;
                        validation.errors.push('File is empty');
                    }
                } catch (error) {
                    validation.isValid = false;
                    validation.errors.push('File is not accessible or corrupted');
                }
            }

            // Basic security scan - check for suspicious patterns
            await this.performBasicSecurityScan(fileData, validation);

        } catch (error) {
            validation.isValid = false;
            validation.errors.push(`Validation error: ${error.message}`);
        }

        return validation;
    }

    /**
     * Perform basic security scan on file
     * @param {Object} fileData - File data from multer
     * @param {Object} validation - Validation object to update
     */
    async performBasicSecurityScan(fileData, validation) {
        try {
            // Read first 1KB of file to check for suspicious patterns
            const buffer = Buffer.alloc(1024);
            const fd = await fs.open(fileData.path, 'r');
            await fd.read(buffer, 0, 1024, 0);
            await fd.close();

            const content = buffer.toString('utf8', 0, Math.min(buffer.length, 1024));

            // Check for suspicious patterns
            const suspiciousPatterns = [
                /eval\s*\(/i,
                /exec\s*\(/i,
                /system\s*\(/i,
                /shell_exec/i,
                /<script[^>]*>/i,
                /javascript:/i,
                /vbscript:/i,
                /onload\s*=/i,
                /onerror\s*=/i
            ];

            for (const pattern of suspiciousPatterns) {
                if (pattern.test(content)) {
                    validation.warnings.push('File contains potentially suspicious content');
                    break;
                }
            }

        } catch (error) {
            // If we can't scan, add a warning but don't fail validation
            validation.warnings.push('Could not perform complete security scan');
        }
    }

    /**
     * Process uploaded file - generate thumbnails, extract metadata, and create processed versions
     * @param {Object} fileData - File data from multer
     * @param {String} fileId - MongoDB file ID
     * @returns {Object} Processing results
     */
    async processFile(fileData, fileId) {
        try {
            const file = await File.findById(fileId);
            if (!file) {
                throw new Error('File not found in database');
            }

            // Update processing status
            await this.updateProcessingStatus(fileId, 'processing');

            const results = {
                thumbnails: [],
                metadata: {},
                processedVersions: [],
                errors: []
            };

            const fileExtension = path.extname(fileData.originalname).toLowerCase();
            const filePath = fileData.path;

            try {
                // Process based on file type
                if (this.supportedImageFormats.includes(fileExtension)) {
                    await this.processImage(filePath, fileId, results);
                } else if (this.supportedVideoFormats.includes(fileExtension)) {
                    await this.processVideo(filePath, fileId, results);
                } else if (this.supportedAudioFormats.includes(fileExtension)) {
                    await this.processAudio(filePath, fileId, results);
                } else if (this.supportedDocumentFormats.includes(fileExtension)) {
                    await this.processDocument(filePath, fileId, results);
                }

                // Update file with processing results
                await this.updateFileWithResults(fileId, results);
                await this.updateProcessingStatus(fileId, 'completed');

                return {
                    success: true,
                    results
                };

            } catch (processingError) {
                results.errors.push(`Processing error: ${processingError.message}`);
                await this.updateProcessingStatus(fileId, 'failed');

                return {
                    success: false,
                    results,
                    error: processingError.message
                };
            }

        } catch (error) {
            await this.updateProcessingStatus(fileId, 'failed');
            throw error;
        }
    }

    /**
     * Process image files - extract metadata and create thumbnails
     * @param {String} filePath - Path to the image file
     * @param {String} fileId - MongoDB file ID
     * @param {Object} results - Results object to update
     */
    async processImage(filePath, fileId, results) {
        try {
            // For now, we'll extract basic metadata without sharp
            // In a production environment, you would use sharp for image processing
            const stats = await fs.stat(filePath);

            results.metadata = {
                fileSize: stats.size,
                lastModified: stats.mtime
            };

            // Create a simple thumbnail path (placeholder)
            const thumbnailDir = path.join(path.dirname(filePath), 'thumbnails');
            await this.ensureDirectoryExists(thumbnailDir);

            const thumbnailPath = path.join(thumbnailDir, `thumb_${fileId}.jpg`);
            results.thumbnails.push({
                size: 'medium',
                path: thumbnailPath,
                width: 300,
                height: 300
            });

            // Note: In production, you would use sharp here:
            // await sharp(filePath)
            //   .resize(300, 300, { fit: 'cover' })
            //   .jpeg({ quality: 80 })
            //   .toFile(thumbnailPath);

        } catch (error) {
            results.errors.push(`Image processing error: ${error.message}`);
        }
    }

    /**
     * Process video files - extract metadata and create thumbnails
     * @param {String} filePath - Path to the video file
     * @param {String} fileId - MongoDB file ID
     * @param {Object} results - Results object to update
     */
    async processVideo(filePath, fileId, results) {
        try {
            const stats = await fs.stat(filePath);

            results.metadata = {
                fileSize: stats.size,
                lastModified: stats.mtime,
                duration: null // Would be extracted with ffmpeg
            };

            // Create thumbnail placeholder
            const thumbnailDir = path.join(path.dirname(filePath), 'thumbnails');
            await this.ensureDirectoryExists(thumbnailDir);

            const thumbnailPath = path.join(thumbnailDir, `thumb_${fileId}.jpg`);
            results.thumbnails.push({
                size: 'medium',
                path: thumbnailPath,
                width: 300,
                height: 300
            });

            // Note: In production, you would use ffmpeg here:
            // ffmpeg(filePath)
            //   .screenshots({
            //     timestamps: ['50%'],
            //     filename: `thumb_${fileId}.jpg`,
            //     folder: thumbnailDir,
            //     size: '300x300'
            //   });

        } catch (error) {
            results.errors.push(`Video processing error: ${error.message}`);
        }
    }

    /**
     * Process audio files - extract metadata
     * @param {String} filePath - Path to the audio file
     * @param {String} fileId - MongoDB file ID
     * @param {Object} results - Results object to update
     */
    async processAudio(filePath, fileId, results) {
        try {
            const stats = await fs.stat(filePath);

            results.metadata = {
                fileSize: stats.size,
                lastModified: stats.mtime,
                duration: null // Would be extracted with ffmpeg or similar
            };

        } catch (error) {
            results.errors.push(`Audio processing error: ${error.message}`);
        }
    }

    /**
     * Process document files - extract metadata
     * @param {String} filePath - Path to the document file
     * @param {String} fileId - MongoDB file ID
     * @param {Object} results - Results object to update
     */
    async processDocument(filePath, fileId, results) {
        try {
            const stats = await fs.stat(filePath);

            results.metadata = {
                fileSize: stats.size,
                lastModified: stats.mtime,
                pages: null // Would be extracted with pdf-parse or similar
            };

        } catch (error) {
            results.errors.push(`Document processing error: ${error.message}`);
        }
    }

    /**
     * Update file processing status
     * @param {String} fileId - MongoDB file ID
     * @param {String} status - Processing status
     */
    async updateProcessingStatus(fileId, status) {
        try {
            await File.findByIdAndUpdate(fileId, {
                File_processingStatus: status,
                File_updatedAt: new Date()
            });
        } catch (error) {
            console.error(`Error updating processing status for file ${fileId}:`, error);
        }
    }

    /**
     * Update file with processing results
     * @param {String} fileId - MongoDB file ID
     * @param {Object} results - Processing results
     */
    async updateFileWithResults(fileId, results) {
        try {
            const updateData = {
                File_updatedAt: new Date()
            };

            if (results.metadata && Object.keys(results.metadata).length > 0) {
                updateData.File_metadata = results.metadata;
            }

            if (results.thumbnails && results.thumbnails.length > 0) {
                updateData.File_thumbnailPath = results.thumbnails[0].path;
            }

            if (results.processedVersions && results.processedVersions.length > 0) {
                updateData.File_processedVersions = results.processedVersions;
            }

            await File.findByIdAndUpdate(fileId, updateData);
        } catch (error) {
            console.error(`Error updating file results for file ${fileId}:`, error);
        }
    }

    /**
     * Perform security scan on uploaded file
     * @param {String} fileId - MongoDB file ID
     * @returns {Object} Security scan results
     */
    async performSecurityScan(fileId) {
        try {
            const file = await File.findById(fileId);
            if (!file) {
                throw new Error('File not found');
            }

            // Update security scan status
            await File.findByIdAndUpdate(fileId, {
                'File_securityScan.status': 'scanning',
                'File_securityScan.scannedAt': new Date()
            });

            const scanResults = {
                status: 'clean',
                threats: [],
                scannedAt: new Date()
            };

            try {
                // Basic file content scan
                const buffer = Buffer.alloc(4096);
                const fd = await fs.open(file.File_filePath, 'r');
                await fd.read(buffer, 0, 4096, 0);
                await fd.close();

                const content = buffer.toString('utf8', 0, Math.min(buffer.length, 4096));

                // Check for malicious patterns
                const maliciousPatterns = [
                    { pattern: /eval\s*\(/gi, threat: 'Potential code injection', severity: 'high' },
                    { pattern: /exec\s*\(/gi, threat: 'Potential command execution', severity: 'high' },
                    { pattern: /<script[^>]*>/gi, threat: 'Potential XSS script', severity: 'medium' },
                    { pattern: /javascript:/gi, threat: 'JavaScript protocol detected', severity: 'medium' },
                    { pattern: /vbscript:/gi, threat: 'VBScript protocol detected', severity: 'medium' }
                ];

                for (const { pattern, threat, severity } of maliciousPatterns) {
                    if (pattern.test(content)) {
                        scanResults.threats.push({
                            type: threat,
                            severity: severity,
                            description: `Detected suspicious pattern in file content`
                        });
                    }
                }

                if (scanResults.threats.length > 0) {
                    scanResults.status = 'threat_detected';
                }

            } catch (scanError) {
                scanResults.status = 'failed';
                scanResults.threats.push({
                    type: 'Scan Error',
                    severity: 'low',
                    description: `Could not complete security scan: ${scanError.message}`
                });
            }

            // Update file with scan results
            await File.findByIdAndUpdate(fileId, {
                File_securityScan: scanResults
            });

            return scanResults;

        } catch (error) {
            // Update scan status to failed
            await File.findByIdAndUpdate(fileId, {
                'File_securityScan.status': 'failed',
                'File_securityScan.scannedAt': new Date()
            });

            throw error;
        }
    }

    /**
     * Get file processing status
     * @param {String} fileId - MongoDB file ID
     * @returns {Object} Processing status information
     */
    async getProcessingStatus(fileId) {
        try {
            const file = await File.findById(fileId).select('File_processingStatus File_securityScan File_updatedAt');
            if (!file) {
                throw new Error('File not found');
            }

            return {
                processingStatus: file.File_processingStatus,
                securityScan: file.File_securityScan,
                lastUpdated: file.File_updatedAt
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Clean up temporary files and failed uploads
     * @param {Number} maxAge - Maximum age in milliseconds for cleanup
     */
    async cleanupTempFiles(maxAge = 24 * 60 * 60 * 1000) { // 24 hours default
        try {
            const tempDir = path.join(__dirname, '../temp');
            const uploadsDir = path.join(__dirname, '../uploads');

            await this.cleanupDirectory(tempDir, maxAge);

            // Clean up failed uploads
            const failedFiles = await File.find({
                File_processingStatus: 'failed',
                File_createdAt: { $lt: new Date(Date.now() - maxAge) }
            });

            for (const file of failedFiles) {
                try {
                    await fs.unlink(file.File_filePath);
                    await File.findByIdAndDelete(file._id);
                } catch (error) {
                    console.error(`Error cleaning up failed file ${file._id}:`, error);
                }
            }

        } catch (error) {
            console.error('Error during temp file cleanup:', error);
        }
    }

    /**
     * Clean up files in a directory older than maxAge
     * @param {String} dirPath - Directory path to clean
     * @param {Number} maxAge - Maximum age in milliseconds
     */
    async cleanupDirectory(dirPath, maxAge) {
        try {
            const files = await fs.readdir(dirPath);
            const now = Date.now();

            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const stats = await fs.stat(filePath);

                if (now - stats.mtime.getTime() > maxAge) {
                    await fs.unlink(filePath);
                }
            }
        } catch (error) {
            // Directory might not exist, which is fine
            if (error.code !== 'ENOENT') {
                console.error(`Error cleaning directory ${dirPath}:`, error);
            }
        }
    }

    /**
     * Ensure directory exists, create if it doesn't
     * @param {String} dirPath - Directory path
     */
    async ensureDirectoryExists(dirPath) {
        try {
            await fs.access(dirPath);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await fs.mkdir(dirPath, { recursive: true });
            } else {
                throw error;
            }
        }
    }

    /**
     * Generate file hash for duplicate detection
     * @param {String} filePath - Path to file
     * @returns {String} File hash
     */
    async generateFileHash(filePath) {
        try {
            const fileBuffer = await fs.readFile(filePath);
            return crypto.createHash('sha256').update(fileBuffer).digest('hex');
        } catch (error) {
            throw new Error(`Error generating file hash: ${error.message}`);
        }
    }

    /**
     * Check if file is a duplicate
     * @param {String} fileHash - File hash to check
     * @param {String} userId - User ID
     * @returns {Object} Duplicate check result
     */
    async checkForDuplicate(fileHash, userId) {
        try {
            const existingFile = await File.findOne({
                File_uploadedBy: userId,
                File_hash: fileHash
            });

            return {
                isDuplicate: !!existingFile,
                existingFile: existingFile
            };
        } catch (error) {
            throw new Error(`Error checking for duplicates: ${error.message}`);
        }
    }
}

module.exports = new FileProcessingService();