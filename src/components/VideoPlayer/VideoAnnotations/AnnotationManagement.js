import React, { useState, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemAvatar,
  Avatar,
  IconButton,
  TextField,
  Button,
  Chip,
  Divider,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  ToggleButtonGroup,
  ToggleButton,
  Collapse,
} from '@mui/material';
import {
  Note,
  Highlight,
  HelpOutline,
  MoreVert,
  Edit,
  Delete,
  Reply,
  CheckCircle,
  Send,
  ExpandMore,
  ExpandLess,
  Close,
  RadioButtonUnchecked,
} from '@mui/icons-material';
import './AnnotationManagement.css';

const AnnotationManagement = ({
  annotations = [],
  currentUserId,
  onEdit,
  onDelete,
  onReply,
  onResolve,
  onSeek,
  isOpen,
  onClose,
}) => {
  const [filterType, setFilterType] = useState('all');
  const [filterUser, setFilterUser] = useState('all');
  const [sortBy, setSortBy] = useState('timestamp');
  const [expandedAnnotation, setExpandedAnnotation] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyContent, setReplyContent] = useState('');
  const [editingAnnotation, setEditingAnnotation] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [selectedAnnotation, setSelectedAnnotation] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Get unique users from annotations
  const uniqueUsers = useMemo(() => {
    const users = annotations.map((ann) => ({
      id: ann.VideoAnnotation_userId._id || ann.VideoAnnotation_userId,
      name: ann.VideoAnnotation_userId?.User_name || 'Unknown',
    }));
    const uniqueMap = new Map();
    users.forEach((user) => uniqueMap.set(user.id, user));
    return Array.from(uniqueMap.values());
  }, [annotations]);

  // Filter and sort annotations
  const filteredAnnotations = useMemo(() => {
    let filtered = [...annotations];

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter((ann) => ann.VideoAnnotation_type === filterType);
    }

    // Filter by user
    if (filterUser !== 'all') {
      filtered = filtered.filter(
        (ann) =>
          (ann.VideoAnnotation_userId._id || ann.VideoAnnotation_userId) === filterUser
      );
    }

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === 'timestamp') {
        return a.VideoAnnotation_timestamp - b.VideoAnnotation_timestamp;
      } else if (sortBy === 'recent') {
        return new Date(b.VideoAnnotation_createdAt) - new Date(a.VideoAnnotation_createdAt);
      }
      return 0;
    });

    return filtered;
  }, [annotations, filterType, filterUser, sortBy]);

  // Get icon for annotation type
  const getAnnotationIcon = (type) => {
    switch (type) {
      case 'note':
        return <Note />;
      case 'highlight':
        return <Highlight />;
      case 'question':
        return <HelpOutline />;
      default:
        return <Note />;
    }
  };

  // Get color for annotation type
  const getAnnotationColor = (type) => {
    switch (type) {
      case 'note':
        return 'primary';
      case 'highlight':
        return 'warning';
      case 'question':
        return 'error';
      default:
        return 'default';
    }
  };

  // Format time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle menu open
  const handleMenuOpen = (event, annotation) => {
    setMenuAnchor(event.currentTarget);
    setSelectedAnnotation(annotation);
  };

  // Handle menu close
  const handleMenuClose = () => {
    setMenuAnchor(null);
    setSelectedAnnotation(null);
  };

  // Handle edit
  const handleEditClick = () => {
    setEditingAnnotation(selectedAnnotation);
    setEditContent(selectedAnnotation.VideoAnnotation_content);
    handleMenuClose();
  };

  // Handle edit submit
  const handleEditSubmit = async () => {
    if (!editContent.trim() || !editingAnnotation) return;

    try {
      await onEdit(editingAnnotation._id, editContent.trim());
      setEditingAnnotation(null);
      setEditContent('');
    } catch (error) {
      console.error('Failed to edit annotation:', error);
    }
  };

  // Handle delete
  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
    handleMenuClose();
  };

  // Handle delete confirm
  const handleDeleteConfirm = async () => {
    if (!selectedAnnotation) return;

    try {
      await onDelete(selectedAnnotation._id);
      setDeleteDialogOpen(false);
      setSelectedAnnotation(null);
    } catch (error) {
      console.error('Failed to delete annotation:', error);
    }
  };

  // Handle reply
  const handleReplySubmit = async (annotationId) => {
    if (!replyContent.trim()) return;

    try {
      await onReply(annotationId, replyContent.trim());
      setReplyingTo(null);
      setReplyContent('');
    } catch (error) {
      console.error('Failed to reply:', error);
    }
  };

  // Handle resolve toggle
  const handleResolveToggle = async (annotationId) => {
    try {
      await onResolve(annotationId);
    } catch (error) {
      console.error('Failed to toggle resolve:', error);
    }
  };

  // Handle seek to annotation
  const handleSeekToAnnotation = (timestamp) => {
    if (onSeek) {
      onSeek(timestamp);
    }
  };

  if (!isOpen) return null;

  return (
    <Paper
      className="annotation-management"
      elevation={4}
      sx={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 400,
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">
          Annotations ({filteredAnnotations.length})
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <Close />
        </IconButton>
      </Box>

      <Divider />

      {/* Filters */}
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Filter by Type
        </Typography>
        <ToggleButtonGroup
          value={filterType}
          exclusive
          onChange={(e, newType) => newType && setFilterType(newType)}
          size="small"
          fullWidth
          sx={{ mb: 2 }}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="note">Notes</ToggleButton>
          <ToggleButton value="highlight">Highlights</ToggleButton>
          <ToggleButton value="question">Questions</ToggleButton>
        </ToggleButtonGroup>

        {uniqueUsers.length > 1 && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Filter by User
            </Typography>
            <ToggleButtonGroup
              value={filterUser}
              exclusive
              onChange={(e, newUser) => newUser && setFilterUser(newUser)}
              size="small"
              fullWidth
              sx={{ mb: 2 }}
            >
              <ToggleButton value="all">All Users</ToggleButton>
              {uniqueUsers.slice(0, 3).map((user) => (
                <ToggleButton key={user.id} value={user.id}>
                  {user.name.split(' ')[0]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </>
        )}

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Sort by
        </Typography>
        <ToggleButtonGroup
          value={sortBy}
          exclusive
          onChange={(e, newSort) => newSort && setSortBy(newSort)}
          size="small"
          fullWidth
        >
          <ToggleButton value="timestamp">Timestamp</ToggleButton>
          <ToggleButton value="recent">Most Recent</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Divider />

      {/* Annotations List */}
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        {filteredAnnotations.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No annotations found
            </Typography>
          </Box>
        ) : (
          <List>
            {filteredAnnotations.map((annotation) => {
              const isExpanded = expandedAnnotation === annotation._id;
              const isEditing = editingAnnotation?._id === annotation._id;
              const isReplying = replyingTo === annotation._id;

              return (
                <React.Fragment key={annotation._id}>
                  <ListItem
                    alignItems="flex-start"
                    sx={{
                      flexDirection: 'column',
                      '&:hover': { backgroundColor: 'action.hover' },
                    }}
                  >
                    <Box sx={{ display: 'flex', width: '100%', alignItems: 'flex-start' }}>
                      <ListItemAvatar>
                        <Avatar sx={{ bgcolor: getAnnotationColor(annotation.VideoAnnotation_type) + '.main' }}>
                          {getAnnotationIcon(annotation.VideoAnnotation_type)}
                        </Avatar>
                      </ListItemAvatar>

                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <Chip
                            label={formatTime(annotation.VideoAnnotation_timestamp)}
                            size="small"
                            onClick={() => handleSeekToAnnotation(annotation.VideoAnnotation_timestamp)}
                            sx={{ cursor: 'pointer' }}
                          />
                          <Typography variant="caption" color="text.secondary">
                            {annotation.VideoAnnotation_userId?.User_name || 'Unknown'}
                          </Typography>
                          {annotation.VideoAnnotation_isResolved && (
                            <Chip
                              label="Resolved"
                              size="small"
                              color="success"
                              icon={<CheckCircle />}
                            />
                          )}
                        </Box>

                        {isEditing ? (
                          <Box sx={{ mt: 1 }}>
                            <TextField
                              fullWidth
                              multiline
                              rows={3}
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              size="small"
                            />
                            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                              <Button size="small" onClick={() => setEditingAnnotation(null)}>
                                Cancel
                              </Button>
                              <Button
                                size="small"
                                variant="contained"
                                onClick={handleEditSubmit}
                                disabled={!editContent.trim()}
                              >
                                Save
                              </Button>
                            </Box>
                          </Box>
                        ) : (
                          <Typography variant="body2" sx={{ mt: 0.5 }}>
                            {annotation.VideoAnnotation_content}
                          </Typography>
                        )}

                        {/* Replies */}
                        {annotation.VideoAnnotation_replies &&
                          annotation.VideoAnnotation_replies.length > 0 && (
                            <Box sx={{ mt: 1 }}>
                              <Button
                                size="small"
                                startIcon={isExpanded ? <ExpandLess /> : <ExpandMore />}
                                onClick={() =>
                                  setExpandedAnnotation(isExpanded ? null : annotation._id)
                                }
                              >
                                {annotation.VideoAnnotation_replies.length} replies
                              </Button>
                            </Box>
                          )}
                      </Box>

                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuOpen(e, annotation)}
                      >
                        <MoreVert />
                      </IconButton>
                    </Box>

                    {/* Expanded Replies */}
                    <Collapse in={isExpanded} sx={{ width: '100%', mt: 1 }}>
                      <Box sx={{ pl: 7, pr: 2 }}>
                        {annotation.VideoAnnotation_replies.map((reply, index) => (
                          <Box key={index} sx={{ mb: 1, p: 1, backgroundColor: 'action.hover', borderRadius: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                              {reply.userId?.User_name || 'Unknown'} •{' '}
                              {new Date(reply.createdAt).toLocaleString()}
                            </Typography>
                            <Typography variant="body2">{reply.content}</Typography>
                          </Box>
                        ))}
                      </Box>
                    </Collapse>

                    {/* Reply Input */}
                    {isReplying && (
                      <Box sx={{ width: '100%', pl: 7, pr: 2, mt: 1 }}>
                        <TextField
                          fullWidth
                          size="small"
                          placeholder="Write a reply..."
                          value={replyContent}
                          onChange={(e) => setReplyContent(e.target.value)}
                          multiline
                          rows={2}
                        />
                        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                          <Button size="small" onClick={() => setReplyingTo(null)}>
                            Cancel
                          </Button>
                          <Button
                            size="small"
                            variant="contained"
                            startIcon={<Send />}
                            onClick={() => handleReplySubmit(annotation._id)}
                            disabled={!replyContent.trim()}
                          >
                            Reply
                          </Button>
                        </Box>
                      </Box>
                    )}
                  </ListItem>
                  <Divider />
                </React.Fragment>
              );
            })}
          </List>
        )}
      </Box>

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => handleSeekToAnnotation(selectedAnnotation?.VideoAnnotation_timestamp)}>
          Jump to timestamp
        </MenuItem>
        <MenuItem onClick={() => { setReplyingTo(selectedAnnotation?._id); handleMenuClose(); }}>
          <ListItemAvatar sx={{ minWidth: 36 }}>
            <Reply fontSize="small" />
          </ListItemAvatar>
          Reply
        </MenuItem>
        {selectedAnnotation?.VideoAnnotation_type === 'question' && (
          <MenuItem onClick={() => { handleResolveToggle(selectedAnnotation?._id); handleMenuClose(); }}>
            <ListItemAvatar sx={{ minWidth: 36 }}>
              {selectedAnnotation?.VideoAnnotation_isResolved ? (
                <RadioButtonUnchecked fontSize="small" />
              ) : (
                <CheckCircle fontSize="small" />
              )}
            </ListItemAvatar>
            {selectedAnnotation?.VideoAnnotation_isResolved ? 'Unresolve' : 'Resolve'}
          </MenuItem>
        )}
        {(selectedAnnotation?.VideoAnnotation_userId._id || selectedAnnotation?.VideoAnnotation_userId) ===
          currentUserId && (
          <>
            <MenuItem onClick={handleEditClick}>
              <ListItemAvatar sx={{ minWidth: 36 }}>
                <Edit fontSize="small" />
              </ListItemAvatar>
              Edit
            </MenuItem>
            <MenuItem onClick={handleDeleteClick}>
              <ListItemAvatar sx={{ minWidth: 36 }}>
                <Delete fontSize="small" />
              </ListItemAvatar>
              Delete
            </MenuItem>
          </>
        )}
      </Menu>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Annotation</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this annotation? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default AnnotationManagement;
