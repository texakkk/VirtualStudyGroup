import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import './RichTextEditor.css';
import { Box, Paper, Typography, IconButton, Tooltip, Chip } from '@mui/material';
import { Save as SaveIcon, AutoMode as AutoSaveIcon } from '@mui/icons-material';
import { styled } from '@mui/material/styles';

const EditorContainer = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(2),
  marginBottom: theme.spacing(2),
  '& .ql-editor': {
    minHeight: '300px',
    fontSize: '14px',
    lineHeight: '1.6',
  },
  '& .ql-toolbar': {
    borderTop: `1px solid ${theme.palette.divider}`,
    borderLeft: `1px solid ${theme.palette.divider}`,
    borderRight: `1px solid ${theme.palette.divider}`,
    borderRadius: `${theme.shape.borderRadius}px ${theme.shape.borderRadius}px 0 0`,
  },
  '& .ql-container': {
    borderBottom: `1px solid ${theme.palette.divider}`,
    borderLeft: `1px solid ${theme.palette.divider}`,
    borderRight: `1px solid ${theme.palette.divider}`,
    borderRadius: `0 0 ${theme.shape.borderRadius}px ${theme.shape.borderRadius}px`,
  },
}));

const EditorHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: theme.spacing(1),
  padding: theme.spacing(1, 0),
}));

const StatusChip = styled(Chip)(({ theme, status }) => ({
  fontSize: '0.75rem',
  height: '24px',
  backgroundColor: status === 'saved' 
    ? theme.palette.success.light 
    : status === 'saving' 
    ? theme.palette.warning.light 
    : theme.palette.error.light,
  color: status === 'saved' 
    ? theme.palette.success.contrastText 
    : status === 'saving' 
    ? theme.palette.warning.contrastText 
    : theme.palette.error.contrastText,
}));

const RichTextEditor = ({
  value = '',
  onChange,
  onSave,
  placeholder = 'Start writing your note...',
  autoSave = true,
  autoSaveInterval = 3000, // 3 seconds
  readOnly = false,
  title,
  showToolbar = true,
}) => {
  const [content, setContent] = useState(value);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', 'unsaved'
  const [lastSaved, setLastSaved] = useState(null);
  const quillRef = useRef(null);
  const autoSaveTimeoutRef = useRef(null);

  // Custom toolbar configuration with comprehensive formatting options
  const modules = {
    toolbar: showToolbar ? [
      [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
      [{ 'font': [] }],
      [{ 'size': ['small', false, 'large', 'huge'] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'script': 'sub' }, { 'script': 'super' }],
      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
      [{ 'indent': '-1' }, { 'indent': '+1' }],
      [{ 'align': [] }],
      ['blockquote', 'code-block'],
      ['link', 'image', 'video'],
      ['clean'],
    ] : false,
    clipboard: {
      matchVisual: false,
    },
  };

  const formats = [
    'header', 'font', 'size',
    'bold', 'italic', 'underline', 'strike',
    'color', 'background',
    'script',
    'list', 'indent',
    'align',
    'blockquote', 'code-block',
    'link', 'image', 'video'
  ];

  // Handle auto-save
  const handleAutoSave = useCallback(async (contentToSave) => {
    if (!onSave || readOnly) return;

    try {
      setSaveStatus('saving');
      await onSave(contentToSave);
      setSaveStatus('saved');
      setLastSaved(new Date());
    } catch (error) {
      console.error('Auto-save failed:', error);
      setSaveStatus('unsaved');
    }
  }, [onSave, readOnly]);

  // Handle content changes
  const handleChange = useCallback((newContent) => {
    setContent(newContent);
    setSaveStatus('unsaved');
    
    if (onChange) {
      onChange(newContent);
    }

    // Set up auto-save if enabled
    if (autoSave && onSave) {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      
      autoSaveTimeoutRef.current = setTimeout(() => {
        handleAutoSave(newContent);
      }, autoSaveInterval);
    }
  }, [onChange, autoSave, onSave, autoSaveInterval, handleAutoSave]);

  // Handle manual save
  const handleManualSave = useCallback(async () => {
    if (!onSave || readOnly) return;

    try {
      setSaveStatus('saving');
      await onSave(content);
      setSaveStatus('saved');
      setLastSaved(new Date());
    } catch (error) {
      console.error('Manual save failed:', error);
      setSaveStatus('unsaved');
    }
  }, [onSave, content, readOnly]);

  // Update content when value prop changes
  useEffect(() => {
    if (value !== content) {
      setContent(value);
      setSaveStatus('saved');
    }
  }, [value, content]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  // Get save status text and icon
  const getSaveStatusInfo = () => {
    switch (saveStatus) {
      case 'saved':
        return {
          text: lastSaved ? `Saved at ${lastSaved.toLocaleTimeString()}` : 'Saved',
          icon: <SaveIcon fontSize="small" />,
        };
      case 'saving':
        return {
          text: 'Saving...',
          icon: <AutoSaveIcon fontSize="small" />,
        };
      case 'unsaved':
        return {
          text: 'Unsaved changes',
          icon: <SaveIcon fontSize="small" />,
        };
      default:
        return {
          text: 'Ready',
          icon: <SaveIcon fontSize="small" />,
        };
    }
  };

  const statusInfo = getSaveStatusInfo();

  return (
    <EditorContainer elevation={1}>
      {(title || onSave) && (
        <EditorHeader>
          <Box>
            {title && (
              <Typography variant="h6" component="h3" gutterBottom>
                {title}
              </Typography>
            )}
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            {onSave && (
              <>
                <StatusChip
                  status={saveStatus}
                  label={statusInfo.text}
                  icon={statusInfo.icon}
                  size="small"
                />
                {!autoSave && (
                  <Tooltip title="Save manually">
                    <span>
                      <IconButton
                        onClick={handleManualSave}
                        disabled={saveStatus === 'saving' || saveStatus === 'saved'}
                        size="small"
                      >
                        <SaveIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
              </>
            )}
          </Box>
        </EditorHeader>
      )}
      
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={content}
        onChange={handleChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
        readOnly={readOnly}
        style={{
          backgroundColor: readOnly ? '#f5f5f5' : 'white',
        }}
      />
    </EditorContainer>
  );
};

export default RichTextEditor;
