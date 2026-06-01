import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Chip,
  Typography,
  FormControlLabel,
  Switch,
  Alert,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Close as CloseIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';
import RichTextEditor from './RichTextEditor';

const StyledDialogTitle = styled(DialogTitle)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingRight: theme.spacing(1),
}));

const TagsContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.spacing(0.5),
  marginTop: theme.spacing(1),
}));

const NoteDialog = ({
  open,
  onClose,
  onSave,
  onEdit,
  note = null,
  mode = 'create', // 'create', 'edit', 'view'
  loading = false,
  error = null,
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const isViewMode = mode === 'view';
  const isCreateMode = mode === 'create';

  // Initialize form data when note changes
  useEffect(() => {
    if (note) {
      setTitle(note.title || '');
      setContent(note.content || '');
      setTags(note.tags || []);
      setIsPublic(note.isPublic || false);
    } else {
      setTitle('');
      setContent('');
      setTags([]);
      setIsPublic(false);
    }
    setHasUnsavedChanges(false);
  }, [note, open]);

  // Track changes for unsaved changes warning
  useEffect(() => {
    if (note) {
      const hasChanges = 
        title !== (note.title || '') ||
        content !== (note.content || '') ||
        JSON.stringify(tags) !== JSON.stringify(note.tags || []) ||
        isPublic !== (note.isPublic || false);
      setHasUnsavedChanges(hasChanges);
    } else {
      setHasUnsavedChanges(title !== '' || content !== '' || tags.length > 0);
    }
  }, [title, content, tags, isPublic, note]);

  const handleSave = async () => {
    const noteData = {
      id: note?.id,
      title: title.trim() || 'Untitled Note',
      content,
      tags,
      isPublic,
      updatedAt: new Date().toISOString(),
      ...(isCreateMode && { createdAt: new Date().toISOString() }),
    };

    if (onSave) {
      await onSave(noteData);
    }
  };

  const handleClose = () => {
    if (hasUnsavedChanges && !isViewMode) {
      const confirmClose = window.confirm(
        'You have unsaved changes. Are you sure you want to close without saving?'
      );
      if (!confirmClose) return;
    }
    onClose();
  };

  const handleAddTag = () => {
    const trimmedTag = newTag.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyPress = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddTag();
    }
  };

  const getDialogTitle = () => {
    switch (mode) {
      case 'create':
        return 'Create New Note';
      case 'edit':
        return 'Edit Note';
      case 'view':
        return 'View Note';
      default:
        return 'Note';
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { height: '90vh', maxHeight: '800px' }
      }}
    >
      <StyledDialogTitle>
        <Typography variant="h6">
          {getDialogTitle()}
        </Typography>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </StyledDialogTitle>

      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Title Field */}
        <TextField
          label="Note Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          fullWidth
          disabled={isViewMode}
          placeholder="Enter note title..."
        />

        {/* Tags Section */}
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Tags
          </Typography>
          
          {!isViewMode && (
            <Box display="flex" gap={1} alignItems="center" mb={1}>
              <TextField
                size="small"
                placeholder="Add tag..."
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={handleKeyPress}
                sx={{ flexGrow: 1 }}
              />
              <Tooltip title="Add tag">
                <span>
                  <IconButton onClick={handleAddTag} disabled={!newTag.trim()}>
                    <AddIcon />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          )}

          <TagsContainer>
            {tags.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                onDelete={isViewMode ? undefined : () => handleRemoveTag(tag)}
                size="small"
                color="primary"
                variant="outlined"
              />
            ))}
            {tags.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No tags added
              </Typography>
            )}
          </TagsContainer>
        </Box>

        {/* Settings */}
        <Box>
          <FormControlLabel
            control={
              <Switch
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                disabled={isViewMode}
              />
            }
            label="Make this note public"
          />
          <Typography variant="caption" display="block" color="text.secondary">
            Public notes can be discovered and viewed by other users
          </Typography>
        </Box>

        {/* Rich Text Editor */}
        <Box sx={{ flexGrow: 1, minHeight: '300px' }}>
          <Typography variant="subtitle2" gutterBottom>
            Content
          </Typography>
          <RichTextEditor
            value={content}
            onChange={setContent}
            readOnly={isViewMode}
            showToolbar={!isViewMode}
            placeholder="Start writing your note..."
            autoSave={false} // Disable auto-save in dialog
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={handleClose} disabled={loading}>
          {isViewMode ? 'Close' : 'Cancel'}
        </Button>
        
        {!isViewMode && (
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={loading || (!title.trim() && !content.trim())}
          >
            {loading ? 'Saving...' : isCreateMode ? 'Create Note' : 'Save Changes'}
          </Button>
        )}
        
        {isViewMode && onEdit && (
          <Button
            onClick={() => {
              onEdit(note);
            }}
            variant="contained"
          >
            Edit Note
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default NoteDialog;
