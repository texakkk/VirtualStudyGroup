import React, { useState } from 'react';
import {
  Box,
  Paper,
  ToggleButtonGroup,
  ToggleButton,
  TextField,
  Button,
  Typography,
  IconButton,
  Divider,
  Tooltip,
} from '@mui/material';
import {
  Note,
  Highlight,
  HelpOutline,
  Close,
  Send,
} from '@mui/icons-material';
import './AnnotationCreationTools.css';

const AnnotationCreationTools = ({
  isOpen,
  onClose,
  onSubmit,
  initialType = 'note',
  initialPosition = null,
  initialTimestamp = 0,
}) => {
  const [annotationType, setAnnotationType] = useState(initialType);
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        type: annotationType,
        content: content.trim(),
        position: initialPosition,
        timestamp: initialTimestamp,
      });
      setContent('');
      onClose();
    } catch (error) {
      console.error('Failed to create annotation:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!isOpen) return null;

  return (
    <Paper
      className="annotation-creation-tools"
      elevation={8}
      sx={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '90%',
        maxWidth: 500,
        zIndex: 1000,
        p: 3,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Create Annotation</Typography>
        <IconButton size="small" onClick={onClose}>
          <Close />
        </IconButton>
      </Box>

      <Divider sx={{ mb: 2 }} />

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Annotation Type
        </Typography>
        <ToggleButtonGroup
          value={annotationType}
          exclusive
          onChange={(e, newType) => newType && setAnnotationType(newType)}
          fullWidth
          size="small"
        >
          <ToggleButton value="note">
            <Tooltip title="General note or comment">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Note fontSize="small" />
                <Typography variant="body2">Note</Typography>
              </Box>
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="highlight">
            <Tooltip title="Highlight important moment">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Highlight fontSize="small" />
                <Typography variant="body2">Highlight</Typography>
              </Box>
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="question">
            <Tooltip title="Question about content">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <HelpOutline fontSize="small" />
                <Typography variant="body2">Question</Typography>
              </Box>
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Content
        </Typography>
        <TextField
          fullWidth
          multiline
          rows={4}
          placeholder={
            annotationType === 'note'
              ? 'Add your note here...'
              : annotationType === 'highlight'
              ? 'Describe what makes this moment important...'
              : 'What would you like to ask?'
          }
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyPress={handleKeyPress}
          autoFocus
          inputProps={{ maxLength: 1000 }}
          helperText={`${content.length}/1000 characters`}
        />
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          Timestamp: {Math.floor(initialTimestamp / 60)}:{String(Math.floor(initialTimestamp % 60)).padStart(2, '0')}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!content.trim() || isSubmitting}
            startIcon={<Send />}
          >
            {isSubmitting ? 'Creating...' : 'Create'}
          </Button>
        </Box>
      </Box>
    </Paper>
  );
};

export default AnnotationCreationTools;
