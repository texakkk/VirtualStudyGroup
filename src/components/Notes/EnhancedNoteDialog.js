import React, { useState, useEffect, useContext } from 'react';
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
  Tabs,
  Tab,
  Divider,
} from '@mui/material';
import {
  Close as CloseIcon,
  Add as AddIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';
import RichTextEditor from './RichTextEditor';
import DocumentConverter from './DocumentConverter';
import VersionHistory from './VersionHistory';
import AuthContext from '../../contexts/AuthContext';

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

const getNoteContent = (note) => (
  note?.content ??
  note?.Note_content ??
  note?.noteContent ??
  note?.NoteContent ??
  note?.body ??
  ''
);

function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`note-tabpanel-${index}`}
      aria-labelledby={`note-tab-${index}`}
      {...other}
    >
      {value === index && children}
    </div>
  );
}

const EnhancedNoteDialog = ({
  open,
  onClose,
  onSave,
  onEdit,
  note = null,
  mode = 'create', // 'create', 'edit', 'view'
  loading = false,
  error = null,
  groupId = null,
  onRestoreVersion,
  canEdit = true,
  editDisabledReason = 'Only the owner or users with edit access can edit this note.',
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const { currentUser } = useContext(AuthContext);
  const isViewMode = mode === 'view';
  const isEditMode = mode === 'edit';
  const isCreateMode = mode === 'create';
  
  // Use provided groupId or get from user's first group
  const currentGroupId = groupId || currentUser?.groups?.[0]?._id;

  // Initialize form data when note changes
  useEffect(() => {
    if (note) {
      setTitle(note.title || '');
      setContent(getNoteContent(note));
      setTags(note.tags || []);
      setIsPublic(note.isPublic || false);
    } else {
      setTitle('');
      setContent('');
      setTags([]);
      setIsPublic(false);
    }
    setHasUnsavedChanges(false);
    setActiveTab(0); // Reset to first tab when opening
  }, [note, open]);

  // Track changes for unsaved changes warning
  useEffect(() => {
    if (note) {
      const hasChanges = 
        title !== (note.title || '') ||
        content !== getNoteContent(note) ||
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

  const handleFileConverted = (fileData) => {
    if (fileData.noteData) {
      // If backend conversion was used, the note was already created
      // Just update the content in the editor
      setContent(fileData.content);
      if (!title.trim()) {
        setTitle(fileData.noteData.Note_title);
      }
    } else {
      // Client-side conversion - append to existing content
      const newContent = content + '\n\n' + fileData.content;
      setContent(newContent);
      
      // If no title is set, use the filename
      if (!title.trim()) {
        setTitle(fileData.fileName.replace(/\.[^/.]+$/, '')); // Remove extension
      }
    }
    
    // Switch back to editor tab
    setActiveTab(0);
  };

  const handleVersionRestore = (restoredNote, restoredVersion) => {
    // Update the current content with the restored version
    setTitle(restoredNote?.title || restoredVersion?.title || '');
    setContent(restoredNote?.content || restoredVersion?.content || '');
    
    if (onRestoreVersion) {
      onRestoreVersion(restoredNote || restoredVersion);
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

  const tabLabels = [
    'Editor',
    ...(isCreateMode || isEditMode ? ['Import'] : []),
    ...(note ? ['History'] : []),
  ];

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: { height: '90vh', maxHeight: '900px' }
      }}
    >
      <StyledDialogTitle>
        <Typography variant="h6" component="span">
          {getDialogTitle()}
        </Typography>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </StyledDialogTitle>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs 
          value={activeTab} 
          onChange={(e, newValue) => setActiveTab(newValue)}
          aria-label="note dialog tabs"
        >
          {tabLabels.map((label, index) => (
            <Tab key={label} label={label} />
          ))}
        </Tabs>
      </Box>

      <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
        {error && (
          <Alert severity="error" sx={{ m: 2 }}>
            {error}
          </Alert>
        )}

        {/* Editor Tab */}
        <TabPanel value={activeTab} index={0}>
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
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

            <Divider />

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
          </Box>
        </TabPanel>

        {/* Import Tab */}
        {(isCreateMode || isEditMode) && (
          <TabPanel value={activeTab} index={1}>
            <Box sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Import Documents
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Upload documents to convert them into note content. Supported formats include PDF, Word, text files, and images.
              </Typography>
              <DocumentConverter
                onFileConverted={handleFileConverted}
                groupId={currentGroupId}
                createNoteOnImport={false}
              />
            </Box>
          </TabPanel>
        )}

        {/* History Tab */}
        {note && (
          <TabPanel value={activeTab} index={tabLabels.length - 1}>
            <Box sx={{ p: 2 }}>
              <VersionHistory
                noteId={note.id}
                currentVersion={note}
                onRestoreVersion={handleVersionRestore}
              />
            </Box>
          </TabPanel>
        )}
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
            startIcon={loading ? null : <SaveIcon />}
          >
            {loading ? 'Saving...' : isCreateMode ? 'Create Note' : 'Save Changes'}
          </Button>
        )}
        
        {isViewMode && onEdit && (
          <Tooltip title={canEdit ? '' : editDisabledReason}>
            <span>
              <Button
                onClick={() => {
                  onEdit(note);
                }}
                variant={canEdit ? 'contained' : 'outlined'}
                disabled={!canEdit}
              >
                {canEdit ? 'Edit Note' : 'Read Only'}
              </Button>
            </span>
          </Tooltip>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default EnhancedNoteDialog;
