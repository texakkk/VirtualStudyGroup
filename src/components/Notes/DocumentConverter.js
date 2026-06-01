import React, { useState, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  LinearProgress,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Divider,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Description as DocIcon,
  PictureAsPdf as PdfIcon,
  Image as ImageIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Visibility as PreviewIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Schedule as ProcessingIcon,
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';
import jsPDF from 'jspdf';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { notesApi } from '../../services/notesApi';
import { handleApiError, formatFileSize, isValidFileType, isValidFileSize } from '../../utils/apiErrorHandler';

const UploadArea = styled(Paper)(({ theme, isDragOver }) => ({
  padding: theme.spacing(4),
  textAlign: 'center',
  border: `2px dashed ${isDragOver ? theme.palette.primary.main : theme.palette.divider}`,
  backgroundColor: isDragOver ? theme.palette.action.hover : 'transparent',
  cursor: 'pointer',
  transition: 'all 0.2s ease-in-out',
  '&:hover': {
    borderColor: theme.palette.primary.main,
    backgroundColor: theme.palette.action.hover,
  },
}));

const FileItem = styled(ListItem)(({ theme }) => ({
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: theme.shape.borderRadius,
  marginBottom: theme.spacing(1),
  backgroundColor: theme.palette.background.paper,
}));

const DocumentConverter = ({
  onFileConverted,
  onExportComplete,
  groupId = null,
  createNoteOnImport = Boolean(groupId),
  maxFileSize = 50 * 1024 * 1024, // 50MB to match backend
  acceptedTypes = createNoteOnImport
    ? ['.pdf', '.doc', '.docx', '.txt', '.rtf']
    : ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.jpg', '.jpeg', '.png', '.gif'],
}) => {
  const [files, setFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewDialog, setPreviewDialog] = useState({ open: false, content: '', title: '' });
  const fileInputRef = useRef(null);

  const supportedTypes = {
    'application/pdf': { icon: PdfIcon, label: 'PDF Document' },
    'application/msword': { icon: DocIcon, label: 'Word Document' },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { icon: DocIcon, label: 'Word Document' },
    'text/plain': { icon: DocIcon, label: 'Text Document' },
    'application/rtf': { icon: DocIcon, label: 'RTF Document' },
    'image/jpeg': { icon: ImageIcon, label: 'JPEG Image' },
    'image/png': { icon: ImageIcon, label: 'PNG Image' },
    'image/gif': { icon: ImageIcon, label: 'GIF Image' },
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles);
  };

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    handleFiles(selectedFiles);
  };

  const handleFiles = (newFiles) => {
    const validFiles = newFiles.filter(file => {
      // Check file size
      if (!isValidFileSize(file, maxFileSize)) {
        alert(`File ${file.name} is too large. Maximum size is ${formatFileSize(maxFileSize)}.`);
        return false;
      }
      
      // Check file type
      if (!isValidFileType(file, acceptedTypes)) {
        alert(`File type not supported for ${file.name}. Supported types: ${acceptedTypes.join(', ')}`);
        return false;
      }
      
      return true;
    });

    const fileObjects = validFiles.map(file => ({
      id: Date.now() + Math.random(),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'pending', // pending, processing, completed, error
      progress: 0,
      convertedContent: null,
      error: null,
    }));

    setFiles(prev => [...prev, ...fileObjects]);
    
    // Start processing files
    fileObjects.forEach(fileObj => {
      processFile(fileObj);
    });
  };

  const processFile = async (fileObj) => {
    setFiles(prev => prev.map(f => 
      f.id === fileObj.id 
        ? { ...f, status: 'processing', progress: 10 }
        : f
    ));

    try {
      // Update progress
      setFiles(prev => prev.map(f => 
        f.id === fileObj.id 
          ? { ...f, progress: 30 }
          : f
      ));

      if (groupId && createNoteOnImport) {
        const noteData = {
          title: fileObj.name.replace(/\.[^/.]+$/, ''), // Remove extension
          groupId: groupId,
          tags: ['imported'],
          isPublic: false,
        };

        setFiles(prev => prev.map(f => 
          f.id === fileObj.id 
            ? { ...f, progress: 60 }
            : f
        ));

        const result = await notesApi.convertDocument(fileObj.file, noteData);
        
        if (result.success) {
          const convertedContent = result.data.Note_content;
          
          setFiles(prev => prev.map(f => 
            f.id === fileObj.id 
              ? { 
                  ...f, 
                  status: 'completed', 
                  progress: 100, 
                  convertedContent: convertedContent 
                }
              : f
          ));

          if (onFileConverted) {
            onFileConverted({
              fileName: fileObj.name,
              content: convertedContent,
              originalFile: fileObj.file,
              noteData: result.data,
              metadata: result.metadata,
            });
          }
        } else {
          throw new Error(result.error);
        }
      } else {
        // Fallback to client-side conversion for demo purposes
        let convertedContent = '';
        
        setFiles(prev => prev.map(f => 
          f.id === fileObj.id 
            ? { ...f, progress: 60 }
            : f
        ));

        // Convert based on file type
        if (fileObj.type === 'text/plain') {
          convertedContent = await readTextFile(fileObj.file);
        } else if (fileObj.type.startsWith('image/')) {
          convertedContent = await convertImageToText(fileObj.file);
        } else if (fileObj.type === 'application/pdf') {
          convertedContent = await convertPdfToText(fileObj.file);
        } else {
          convertedContent = `<h2>Imported Document: ${escapeHtml(fileObj.name)}</h2><p>This file type needs the server converter to extract full document content. Save the note, then use the main Import Documents tab to create a converted note from this file.</p>`;
        }

        setFiles(prev => prev.map(f => 
          f.id === fileObj.id 
            ? { 
                ...f, 
                status: 'completed', 
                progress: 100, 
                convertedContent: convertedContent 
              }
            : f
        ));

        if (onFileConverted) {
          onFileConverted({
            fileName: fileObj.name,
            content: convertedContent,
            originalFile: fileObj.file,
          });
        }
      }

    } catch (error) {
      console.error('Error processing file:', error);
      const errorMessage = handleApiError(error, null, 'Failed to process file');
      setFiles(prev => prev.map(f => 
        f.id === fileObj.id 
          ? { 
              ...f, 
              status: 'error', 
              error: errorMessage || 'Failed to process file' 
            }
          : f
      ));
    }
  };

  const escapeHtml = (value) => {
    const element = document.createElement('div');
    element.textContent = value || '';
    return element.innerHTML;
  };

  const readTextFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        // Convert plain text to HTML with basic formatting
        const htmlContent = text
          .split('\n\n')
          .map(paragraph => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
          .join('');
        resolve(htmlContent);
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const convertImageToText = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageUrl = e.target.result;
        const htmlContent = `
          <h3>Imported Image: ${escapeHtml(file.name)}</h3>
          <img src="${imageUrl}" alt="${escapeHtml(file.name)}" style="max-width: 100%; height: auto;" />
        `;
        resolve(htmlContent);
      };
      reader.readAsDataURL(file);
    });
  };

  const convertPdfToText = (file) => {
    return Promise.resolve(`
      <h2>PDF Document: ${escapeHtml(file.name)}</h2>
      <p>PDF text extraction is available from the main Import Documents tab, where the server creates a note from the uploaded file.</p>
    `);
  };

  const removeFile = (fileId) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const previewContent = (fileObj) => {
    setPreviewDialog({
      open: true,
      content: fileObj.convertedContent || 'No content available',
      title: `Preview: ${fileObj.name}`,
    });
  };

  const exportToPdf = async (content, filename = 'note') => {
    try {
      const pdf = new jsPDF();
      
      // Strip HTML tags for basic text extraction
      const textContent = content.replace(/<[^>]*>/g, '');
      
      // Split text into lines that fit the page width
      const lines = pdf.splitTextToSize(textContent, 180);
      
      pdf.text(lines, 15, 20);
      pdf.save(`${filename}.pdf`);
      
      if (onExportComplete) {
        onExportComplete({ format: 'pdf', filename: `${filename}.pdf` });
      }
    } catch (error) {
      const errorMessage = handleApiError(error, null, 'Failed to export to PDF');
      console.error('Error exporting to PDF:', errorMessage);
      alert(errorMessage);
    }
  };

  const exportToWord = async (content, filename = 'note') => {
    try {
      // Convert HTML to Word document structure
      const textContent = content.replace(/<[^>]*>/g, '');
      
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              text: filename,
              heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: textContent,
                  size: 24,
                }),
              ],
            }),
          ],
        }],
      });

      const buffer = await Packer.toBuffer(doc);
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      if (onExportComplete) {
        onExportComplete({ format: 'docx', filename: `${filename}.docx` });
      }
    } catch (error) {
      const errorMessage = handleApiError(error, null, 'Failed to export to Word');
      console.error('Error exporting to Word:', errorMessage);
      alert(errorMessage);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <SuccessIcon color="success" />;
      case 'processing':
        return <ProcessingIcon color="primary" />;
      case 'error':
        return <ErrorIcon color="error" />;
      default:
        return <ProcessingIcon color="disabled" />;
    }
  };

  const getFileIcon = (type) => {
    const typeInfo = supportedTypes[type];
    if (typeInfo) {
      const IconComponent = typeInfo.icon;
      return <IconComponent />;
    }
    return <DocIcon />;
  };

  return (
    <Box>
      {/* Upload Area */}
      <UploadArea
        isDragOver={isDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" gutterBottom>
          Drop files here or click to upload
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Supported formats: {acceptedTypes.join(', ')}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Maximum file size: {maxFileSize / 1024 / 1024}MB
        </Typography>
        
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedTypes.join(',')}
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
      </UploadArea>

      {/* Export Options */}
      {files.some(f => f.status === 'completed') && (
        <Paper sx={{ p: 2, mt: 2 }}>
          <Typography variant="h6" gutterBottom>
            Export Options
          </Typography>
          <Box display="flex" gap={1} flexWrap="wrap">
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={() => {
                const completedFile = files.find(f => f.status === 'completed');
                if (completedFile) {
                  exportToPdf(completedFile.convertedContent, completedFile.name);
                }
              }}
            >
              Download as PDF
            </Button>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={() => {
                const completedFile = files.find(f => f.status === 'completed');
                if (completedFile) {
                  exportToWord(completedFile.convertedContent, completedFile.name);
                }
              }}
            >
              Download as Word
            </Button>
          </Box>
        </Paper>
      )}

      {/* Files List */}
      {files.length > 0 && (
        <Paper sx={{ mt: 2 }}>
          <Box p={2}>
            <Typography variant="h6" gutterBottom>
              Processing Files ({files.length})
            </Typography>
          </Box>
          <Divider />
          <List>
            {files.map((fileObj) => (
              <FileItem key={fileObj.id}>
                <ListItemIcon>
                  {getFileIcon(fileObj.type)}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography variant="body1">{fileObj.name}</Typography>
                      <Chip
                        size="small"
                        label={fileObj.status}
                        color={
                          fileObj.status === 'completed' ? 'success' :
                          fileObj.status === 'error' ? 'error' : 'default'
                        }
                      />
                    </Box>
                  }
                  secondary={
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        {(fileObj.size / 1024).toFixed(1)} KB - {supportedTypes[fileObj.type]?.label || 'Unknown'}
                      </Typography>
                      {fileObj.status === 'processing' && (
                        <LinearProgress 
                          variant="determinate" 
                          value={fileObj.progress} 
                          sx={{ mt: 1 }}
                        />
                      )}
                      {fileObj.error && (
                        <Alert severity="error" sx={{ mt: 1 }}>
                          {fileObj.error}
                        </Alert>
                      )}
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <Box display="flex" alignItems="center">
                    {getStatusIcon(fileObj.status)}
                    {fileObj.status === 'completed' && (
                      <IconButton
                        onClick={() => previewContent(fileObj)}
                        size="small"
                        sx={{ ml: 1 }}
                      >
                        <PreviewIcon />
                      </IconButton>
                    )}
                    <IconButton
                      onClick={() => removeFile(fileObj.id)}
                      size="small"
                      sx={{ ml: 1 }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </ListItemSecondaryAction>
              </FileItem>
            ))}
          </List>
        </Paper>
      )}

      {/* Preview Dialog */}
      <Dialog
        open={previewDialog.open}
        onClose={() => setPreviewDialog({ ...previewDialog, open: false })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{previewDialog.title}</DialogTitle>
        <DialogContent>
          <Box
            dangerouslySetInnerHTML={{ __html: previewDialog.content }}
            sx={{
              '& img': { maxWidth: '100%', height: 'auto' },
              '& p': { mb: 1 },
              '& h1, & h2, & h3': { mt: 2, mb: 1 },
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewDialog({ ...previewDialog, open: false })}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DocumentConverter;
