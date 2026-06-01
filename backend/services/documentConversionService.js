const fs = require('fs').promises;
const path = require('path');
const Note = require('../models/Note');
const NoteVersion = require('../models/NoteVersion');

class DocumentConversionService {
    constructor() {
        this.supportedInputFormats = ['.pdf', '.doc', '.docx', '.txt', '.rtf'];
        this.supportedOutputFormats = ['pdf', 'docx', 'txt', 'html', 'richtext'];
        
        // Conversion settings
        this.maxFileSize = 50 * 1024 * 1024; // 50MB
        this.tempDir = path.join(__dirname, '../temp/conversions');
        
        // Initialize temp directory
        this.initializeTempDirectory();
    }

    /**
     * Initialize temporary directory for conversions
     */
    async initializeTempDirectory() {
        try {
            await fs.access(this.tempDir);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await fs.mkdir(this.tempDir, { recursive: true });
            }
        }
    }

    /**
     * Convert PDF to rich text
     * @param {String} filePath - Path to PDF file
     * @param {Object} options - Conversion options
     * @returns {Object} Conversion result with extracted text
     */
    async convertPdfToRichText(filePath, options = {}) {
        try {
            // Validate file exists and is readable
            await fs.access(filePath, fs.constants.R_OK);
            const stats = await fs.stat(filePath);
            
            if (stats.size > this.maxFileSize) {
                throw new Error(`File size exceeds maximum allowed size of ${this.maxFileSize / (1024 * 1024)}MB`);
            }

            // For now, we'll implement a basic text extraction
            // In production, you would use pdf-parse or pdf2pic
            const result = {
                success: true,
                content: '',
                metadata: {
                    pages: 0,
                    fileSize: stats.size,
                    extractedAt: new Date()
                },
                format: 'richtext'
            };

            try {
                // Basic PDF text extraction placeholder
                // In production, you would use:
                // const pdfParse = require('pdf-parse');
                // const dataBuffer = await fs.readFile(filePath);
                // const pdfData = await pdfParse(dataBuffer);
                // result.content = pdfData.text;
                // result.metadata.pages = pdfData.numpages;

                // For now, return a placeholder message
                result.content = `<h2>PDF Document Converted</h2>
                <p><em>This is a placeholder for PDF content extraction.</em></p>
                <p>Original file: ${path.basename(filePath)}</p>
                <p>File size: ${(stats.size / 1024).toFixed(2)} KB</p>
                <p>In a production environment, this would contain the actual extracted text from the PDF document with proper formatting preserved.</p>`;
                
                result.metadata.pages = 1; // Placeholder

            } catch (extractionError) {
                result.success = false;
                result.error = `PDF extraction failed: ${extractionError.message}`;
                result.content = `<p><strong>Error:</strong> Could not extract text from PDF document.</p>
                <p>File: ${path.basename(filePath)}</p>
                <p>Error: ${extractionError.message}</p>`;
            }

            return result;

        } catch (error) {
            return {
                success: false,
                error: `PDF conversion failed: ${error.message}`,
                content: '',
                metadata: {},
                format: 'richtext'
            };
        }
    }

    /**
     * Convert Word document to rich text
     * @param {String} filePath - Path to Word document
     * @param {Object} options - Conversion options
     * @returns {Object} Conversion result with extracted text
     */
    async convertWordToRichText(filePath, options = {}) {
        try {
            await fs.access(filePath, fs.constants.R_OK);
            const stats = await fs.stat(filePath);
            
            if (stats.size > this.maxFileSize) {
                throw new Error(`File size exceeds maximum allowed size of ${this.maxFileSize / (1024 * 1024)}MB`);
            }

            const result = {
                success: true,
                content: '',
                metadata: {
                    fileSize: stats.size,
                    extractedAt: new Date()
                },
                format: 'richtext'
            };

            try {
                const fileExtension = path.extname(filePath).toLowerCase();
                
                if (fileExtension === '.docx') {
                    // For DOCX files, you would use mammoth.js in production
                    // const mammoth = require('mammoth');
                    // const result = await mammoth.convertToHtml({path: filePath});
                    // result.content = result.value;
                    
                    result.content = `<h2>Word Document Converted</h2>
                    <p><em>This is a placeholder for DOCX content extraction.</em></p>
                    <p>Original file: ${path.basename(filePath)}</p>
                    <p>File size: ${(stats.size / 1024).toFixed(2)} KB</p>
                    <p>In a production environment, this would contain the actual extracted content from the Word document with formatting preserved using mammoth.js or similar library.</p>`;
                    
                } else if (fileExtension === '.doc') {
                    // For DOC files, you would use antiword or similar
                    result.content = `<h2>Legacy Word Document Converted</h2>
                    <p><em>This is a placeholder for DOC content extraction.</em></p>
                    <p>Original file: ${path.basename(filePath)}</p>
                    <p>File size: ${(stats.size / 1024).toFixed(2)} KB</p>
                    <p>In a production environment, this would contain the actual extracted content from the legacy Word document.</p>`;
                }

            } catch (extractionError) {
                result.success = false;
                result.error = `Word document extraction failed: ${extractionError.message}`;
                result.content = `<p><strong>Error:</strong> Could not extract text from Word document.</p>
                <p>File: ${path.basename(filePath)}</p>
                <p>Error: ${extractionError.message}</p>`;
            }

            return result;

        } catch (error) {
            return {
                success: false,
                error: `Word conversion failed: ${error.message}`,
                content: '',
                metadata: {},
                format: 'richtext'
            };
        }
    }

    /**
     * Convert plain text to rich text
     * @param {String} filePath - Path to text file
     * @param {Object} options - Conversion options
     * @returns {Object} Conversion result
     */
    async convertTextToRichText(filePath, options = {}) {
        try {
            await fs.access(filePath, fs.constants.R_OK);
            const stats = await fs.stat(filePath);
            
            if (stats.size > this.maxFileSize) {
                throw new Error(`File size exceeds maximum allowed size of ${this.maxFileSize / (1024 * 1024)}MB`);
            }

            const textContent = await fs.readFile(filePath, 'utf8');
            
            // Convert plain text to basic HTML
            const htmlContent = textContent
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .map(line => `<p>${this.escapeHtml(line)}</p>`)
                .join('\n');

            return {
                success: true,
                content: htmlContent || '<p><em>Empty document</em></p>',
                metadata: {
                    fileSize: stats.size,
                    lineCount: textContent.split('\n').length,
                    extractedAt: new Date()
                },
                format: 'richtext'
            };

        } catch (error) {
            return {
                success: false,
                error: `Text conversion failed: ${error.message}`,
                content: '',
                metadata: {},
                format: 'richtext'
            };
        }
    }

    /**
     * Convert rich text to PDF
     * @param {String} richTextContent - Rich text/HTML content
     * @param {Object} options - Conversion options
     * @returns {Object} Conversion result with PDF file path
     */
    async convertRichTextToPdf(richTextContent, options = {}) {
        try {
            const outputFileName = `converted_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.pdf`;
            const outputPath = path.join(this.tempDir, outputFileName);

            // PDF generation options
            const pdfOptions = {
                title: options.title || 'Converted Document',
                author: options.author || 'Virtual Study Group',
                subject: options.subject || 'Document Conversion',
                format: 'A4',
                margin: {
                    top: '20mm',
                    right: '20mm',
                    bottom: '20mm',
                    left: '20mm'
                },
                ...options
            };

            // For now, create a placeholder PDF file
            // In production, you would use puppeteer, jsPDF, or similar
            const pdfContent = this.generatePlaceholderPdf(richTextContent, pdfOptions);
            await fs.writeFile(outputPath, pdfContent);

            return {
                success: true,
                filePath: outputPath,
                fileName: outputFileName,
                metadata: {
                    createdAt: new Date(),
                    options: pdfOptions
                }
            };

        } catch (error) {
            return {
                success: false,
                error: `PDF generation failed: ${error.message}`,
                filePath: null,
                fileName: null,
                metadata: {}
            };
        }
    }

    /**
     * Convert rich text to Word document
     * @param {String} richTextContent - Rich text/HTML content
     * @param {Object} options - Conversion options
     * @returns {Object} Conversion result with DOCX file path
     */
    async convertRichTextToWord(richTextContent, options = {}) {
        try {
            const outputFileName = `converted_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.docx`;
            const outputPath = path.join(this.tempDir, outputFileName);

            const docxContent = this.generateWordReadableDocument(richTextContent, options);
            await fs.writeFile(outputPath, docxContent, 'utf8');

            return {
                success: true,
                filePath: outputPath,
                fileName: outputFileName,
                metadata: {
                    createdAt: new Date(),
                    options: options
                }
            };

        } catch (error) {
            return {
                success: false,
                error: `Word document generation failed: ${error.message}`,
                filePath: null,
                fileName: null,
                metadata: {}
            };
        }
    }

    /**
     * Convert document to note
     * @param {String} filePath - Path to document file
     * @param {Object} noteData - Note creation data
     * @param {String} userId - User ID
     * @returns {Object} Created note
     */
    async convertDocumentToNote(filePath, noteData, userId) {
        try {
            const fileExtension = path.extname(filePath).toLowerCase();
            let conversionResult;

            // Convert based on file type
            switch (fileExtension) {
                case '.pdf':
                    conversionResult = await this.convertPdfToRichText(filePath);
                    break;
                case '.docx':
                case '.doc':
                    conversionResult = await this.convertWordToRichText(filePath);
                    break;
                case '.txt':
                case '.rtf':
                    conversionResult = await this.convertTextToRichText(filePath);
                    break;
                default:
                    throw new Error(`Unsupported file format: ${fileExtension}`);
            }

            if (!conversionResult.success) {
                throw new Error(conversionResult.error);
            }

            // Create note with converted content
            const note = new Note({
                Note_title: noteData.Note_title || `Converted from ${path.basename(filePath)}`,
                Note_content: conversionResult.content,
                Note_format: 'richtext',
                Note_groupId: noteData.Note_groupId,
                Note_createdBy: userId,
                Note_tags: noteData.Note_tags || ['converted', 'document'],
                Note_isPublic: noteData.Note_isPublic || false,
                Note_permissions: {
                    read: [],
                    write: [],
                    admin: []
                }
            });

            await note.save();

            // Create initial version
            await NoteVersion.createFromNote(
                note, 
                userId, 
                `Converted from ${fileExtension.toUpperCase()} document`, 
                'created'
            );

            return {
                success: true,
                note: note,
                conversionMetadata: conversionResult.metadata
            };

        } catch (error) {
            return {
                success: false,
                error: `Document to note conversion failed: ${error.message}`,
                note: null,
                conversionMetadata: {}
            };
        }
    }

    /**
     * Export note to document format
     * @param {String} noteId - Note ID
     * @param {String} format - Output format (pdf, docx, txt)
     * @param {Object} options - Export options
     * @returns {Object} Export result with file path
     */
    async exportNoteToDocument(noteId, format, options = {}) {
        try {
            const note = await Note.findById(noteId)
                .populate('Note_createdBy', 'User_name User_email');

            if (!note) {
                throw new Error('Note not found');
            }

            let exportResult;
            const exportOptions = {
                title: note.Note_title,
                author: note.Note_createdBy?.User_name || 'Unknown',
                subject: `Note from Virtual Study Group`,
                ...options
            };

            switch (format.toLowerCase()) {
                case 'pdf':
                    exportResult = await this.convertRichTextToPdf(note.Note_content, exportOptions);
                    break;
                case 'docx':
                    exportResult = await this.convertRichTextToWord(note.Note_content, exportOptions);
                    break;
                case 'txt':
                    exportResult = await this.convertRichTextToText(note.Note_content, exportOptions);
                    break;
                default:
                    throw new Error(`Unsupported export format: ${format}`);
            }

            if (!exportResult.success) {
                throw new Error(exportResult.error);
            }

            return {
                success: true,
                filePath: exportResult.filePath,
                fileName: exportResult.fileName,
                note: note,
                exportMetadata: exportResult.metadata
            };

        } catch (error) {
            return {
                success: false,
                error: `Note export failed: ${error.message}`,
                filePath: null,
                fileName: null,
                note: null,
                exportMetadata: {}
            };
        }
    }

    /**
     * Convert rich text to plain text
     * @param {String} richTextContent - Rich text/HTML content
     * @param {Object} options - Conversion options
     * @returns {Object} Conversion result with text file path
     */
    async convertRichTextToText(richTextContent, options = {}) {
        try {
            const outputFileName = `converted_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.txt`;
            const outputPath = path.join(this.tempDir, outputFileName);

            // Strip HTML tags and convert to plain text
            const plainText = this.stripHtmlTags(richTextContent);
            
            await fs.writeFile(outputPath, plainText, 'utf8');

            return {
                success: true,
                filePath: outputPath,
                fileName: outputFileName,
                metadata: {
                    createdAt: new Date(),
                    characterCount: plainText.length,
                    lineCount: plainText.split('\n').length
                }
            };

        } catch (error) {
            return {
                success: false,
                error: `Text conversion failed: ${error.message}`,
                filePath: null,
                fileName: null,
                metadata: {}
            };
        }
    }

    /**
     * Clean up temporary conversion files
     * @param {Number} maxAge - Maximum age in milliseconds
     */
    async cleanupTempFiles(maxAge = 2 * 60 * 60 * 1000) { // 2 hours default
        try {
            const files = await fs.readdir(this.tempDir);
            const now = Date.now();

            for (const file of files) {
                const filePath = path.join(this.tempDir, file);
                const stats = await fs.stat(filePath);

                if (now - stats.mtime.getTime() > maxAge) {
                    await fs.unlink(filePath);
                }
            }
        } catch (error) {
            console.error('Error cleaning up temp conversion files:', error);
        }
    }

    /**
     * Get supported formats
     * @returns {Object} Supported input and output formats
     */
    getSupportedFormats() {
        return {
            input: this.supportedInputFormats,
            output: this.supportedOutputFormats
        };
    }

    // Helper methods

    /**
     * Escape HTML characters
     * @param {String} text - Text to escape
     * @returns {String} Escaped text
     */
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }

    /**
     * Strip HTML tags from text
     * @param {String} html - HTML content
     * @returns {String} Plain text
     */
    stripHtmlTags(html) {
        return html
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
            .replace(/&amp;/g, '&') // Replace HTML entities
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
    }

    /**
     * Generate placeholder PDF content
     * @param {String} content - Content to include
     * @param {Object} options - PDF options
     * @returns {String} PDF content placeholder
     */
    generatePlaceholderPdf(content, options) {
        const title = options.title || 'Converted Document';
        const body = this.stripHtmlTags(content || '');
        const lines = this.wrapText([title, '', body || 'No content'].join('\n'), 80).slice(0, 42);
        const textCommands = [
            'BT',
            '/F1 12 Tf',
            '72 740 Td',
            '16 TL',
            ...lines.map((line, index) => `${index === 0 ? '' : 'T*'}(${this.escapePdfText(line)}) Tj`),
            'ET'
        ].filter(Boolean).join('\n');
        const objects = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
            `<< /Length ${Buffer.byteLength(textCommands, 'utf8')} >>\nstream\n${textCommands}\nendstream`,
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
        ];

        let pdf = '%PDF-1.4\n';
        const offsets = [0];
        objects.forEach((object, index) => {
            offsets.push(Buffer.byteLength(pdf, 'utf8'));
            pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
        });
        const xrefOffset = Buffer.byteLength(pdf, 'utf8');
        pdf += `xref\n0 ${objects.length + 1}\n`;
        pdf += '0000000000 65535 f \n';
        offsets.slice(1).forEach((offset) => {
            pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
        });
        pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
        return pdf;
    }

    /**
     * Generate a Word-readable document containing the note body.
     * @param {String} content - Content to include
     * @param {Object} options - Word options
     * @returns {String} Word-readable HTML content
     */
    generateWordReadableDocument(content, options) {
        const title = this.escapeHtml(options.title || 'Converted Document');
        const body = content && content.trim()
            ? content
            : '<p>No content</p>';

        return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.5; }
    h1 { font-size: 22px; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${body}
</body>
</html>`;
    }

    escapePdfText(text) {
        return String(text)
            .replace(/\\/g, '\\\\')
            .replace(/\(/g, '\\(')
            .replace(/\)/g, '\\)')
            .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
    }

    wrapText(text, maxLength) {
        return String(text)
            .split(/\r?\n/)
            .flatMap((paragraph) => {
                const words = paragraph.split(/\s+/).filter(Boolean);
                if (words.length === 0) return [''];
                const lines = [];
                let line = '';
                words.forEach((word) => {
                    if ((line + ' ' + word).trim().length > maxLength) {
                        lines.push(line);
                        line = word;
                    } else {
                        line = (line + ' ' + word).trim();
                    }
                });
                if (line) lines.push(line);
                return lines;
            });
    }
}

module.exports = new DocumentConversionService();
