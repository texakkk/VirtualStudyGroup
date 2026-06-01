import React, { useState, useMemo } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  IconButton,
  TextField,
  InputAdornment,
  Chip,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  Fab,
  Tooltip,
  Alert,
  Skeleton,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Share as ShareIcon,
  MoreVert as MoreVertIcon,
  Person as PersonIcon,
  Schedule as ScheduleIcon,
  Visibility as ViewIcon,
  History as HistoryIcon,
  PictureAsPdf as PdfIcon,
  Description as DocIcon,
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';
import { format, parseISO, isToday, isYesterday, isThisWeek } from 'date-fns';
import { ensureStringId } from '../../utils/objectId';

const StyledCard = styled(Card)(({ theme }) => ({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  transition: 'all 0.2s ease-in-out',
  cursor: 'pointer',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: theme.shadows[4],
  },
}));

const NotePreview = styled(Box)(({ theme }) => ({
  maxHeight: '100px',
  overflow: 'hidden',
  position: 'relative',
  '&::after': {
    content: '""',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '20px',
    background: `linear-gradient(transparent, ${theme.palette.background.paper})`,
  },
}));

const FilterChip = styled(Chip)(({ theme }) => ({
  margin: theme.spacing(0.5),
  borderRadius: 6,
}));

const NotesDashboard = ({
  notes = [],
  onCreateNote,
  onEditNote,
  onDeleteNote,
  onShareNote,
  onViewNote,
  onViewVersionHistory,
  onExportNote,
  loading = false,
  error = null,
  currentGroup = null,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('updatedAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [filterBy, setFilterBy] = useState('all');
  const [selectedTags, setSelectedTags] = useState([]);
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedNote, setSelectedNote] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Extract unique tags from all notes
  const availableTags = useMemo(() => {
    const tags = new Set();
    notes.forEach(note => {
      if (note.tags) {
        note.tags.forEach(tag => tags.add(tag));
      }
    });
    return Array.from(tags);
  }, [notes]);

  // Filter and sort notes
  const filteredAndSortedNotes = useMemo(() => {
    let filtered = notes.filter(note => {
      // Search filter
      const matchesSearch = !searchTerm || 
        note.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        note.content?.toLowerCase().includes(searchTerm.toLowerCase());

      // Category filter
      const matchesFilter = filterBy === 'all' || 
        (filterBy === 'shared' && note.isShared) ||
        (filterBy === 'private' && !note.isShared) ||
        (filterBy === 'recent' && note.updatedAt && isThisWeek(new Date(note.updatedAt)));

      // Tags filter
      const matchesTags = selectedTags.length === 0 || 
        (note.tags && selectedTags.some(tag => note.tags.includes(tag)));

      return matchesSearch && matchesFilter && matchesTags;
    });

    // Sort notes
    filtered.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];

      if (sortBy === 'updatedAt' || sortBy === 'createdAt') {
        aValue = new Date(aValue);
        bValue = new Date(bValue);
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }, [notes, searchTerm, sortBy, sortOrder, filterBy, selectedTags]);

  const handleMenuOpen = (event, note) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setSelectedNote(note);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const blurActiveElement = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
    handleMenuClose();
  };

  const handleShareClick = () => {
    blurActiveElement();
    if (selectedNote && onShareNote) {
      onShareNote(selectedNote);
    }
    handleMenuClose();
  };

  const handleDeleteConfirm = () => {
    if (selectedNote && onDeleteNote) {
      onDeleteNote(selectedNote.id);
    }
    setDeleteDialogOpen(false);
    setSelectedNote(null);
  };

  const handleTagToggle = (tag) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown date';
    // Accept both Date objects and ISO strings
    const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
    if (isNaN(date.getTime())) return 'Unknown date';
    if (isToday(date)) {
      return `Today at ${format(date, 'HH:mm')}`;
    } else if (isYesterday(date)) {
      return `Yesterday at ${format(date, 'HH:mm')}`;
    } else {
      return format(date, 'MMM dd, yyyy');
    }
  };

  const stripHtml = (html) => {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFilterBy('all');
    setSelectedTags([]);
  };

  const getNoteId = (note) => {
    const noteId = note?._id || note?.id || note?.Note_id || note?.NoteId;
    const normalizedNoteId = ensureStringId(noteId);

    return typeof normalizedNoteId === 'string' && /^[a-f\d]{24}$/i.test(normalizedNoteId)
      ? normalizedNoteId
      : null;
  };

  const handleExportClick = (format) => {
    blurActiveElement();
    const noteId = getNoteId(selectedNote);
    if (noteId && onExportNote) {
      onExportNote(noteId, format);
    }
    handleMenuClose();
  };

  const hasActiveFilters = Boolean(searchTerm) || filterBy !== 'all' || selectedTags.length > 0;

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      </Container>
    );
  }

  return (
    <Box className="notes-dashboard">
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" component="h1">
            My Notes
          </Typography>
          {currentGroup && (
            <Typography variant="subtitle1" color="text.secondary">
              {currentGroup.Group_name || currentGroup.name}
            </Typography>
          )}
        </Box>
        <Tooltip title="Create new note">
          <Fab
            color="default"
            onClick={onCreateNote}
            sx={{
              position: 'fixed',
              bottom: 16,
              right: 16,
              zIndex: 1000,
              bgcolor: '#0f172a',
              color: '#f8fafc',
              '&:hover': {
                bgcolor: '#1e293b',
              },
            }}
          >
            <AddIcon />
          </Fab>
        </Tooltip>
      </Box>

      {/* Search and Filters */}
      <Paper className="notes-filters" sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          {/* Search */}
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              placeholder="Search notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>

          {/* Sort */}
          <Grid size={{ xs: 6, md: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Sort by</InputLabel>
              <Select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                label="Sort by"
              >
                <MenuItem value="updatedAt">Last Modified</MenuItem>
                <MenuItem value="createdAt">Date Created</MenuItem>
                <MenuItem value="title">Title</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 6, md: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Order</InputLabel>
              <Select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                label="Order"
              >
                <MenuItem value="desc">Newest First</MenuItem>
                <MenuItem value="asc">Oldest First</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Filter */}
          <Grid size={{ xs: 12, md: 4 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Filter</InputLabel>
              <Select
                value={filterBy}
                onChange={(e) => setFilterBy(e.target.value)}
                label="Filter"
              >
                <MenuItem value="all">All Notes</MenuItem>
                <MenuItem value="recent">Recent</MenuItem>
                <MenuItem value="shared">Shared</MenuItem>
                <MenuItem value="private">Private</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        {/* Tags Filter */}
        {availableTags.length > 0 && (
          <Box mt={2}>
            <Typography variant="subtitle2" gutterBottom>
              Filter by tags:
            </Typography>
            <Box display="flex" flexWrap="wrap">
              {availableTags.map(tag => (
                <FilterChip
                  key={tag}
                  label={tag}
                  onClick={() => handleTagToggle(tag)}
                  color={selectedTags.includes(tag) ? 'primary' : 'default'}
                  variant={selectedTags.includes(tag) ? 'filled' : 'outlined'}
                />
              ))}
            </Box>
          </Box>
        )}
      </Paper>

      {/* Notes Grid */}
      {loading ? (
        <Grid container spacing={3}>
          {[...Array(6)].map((_, index) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={index}>
              <Card>
                <CardContent>
                  <Skeleton variant="text" width="80%" height={32} />
                  <Skeleton variant="text" width="100%" />
                  <Skeleton variant="text" width="100%" />
                  <Skeleton variant="text" width="60%" />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : filteredAndSortedNotes.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {hasActiveFilters ? 'No notes found' : 'No notes yet'}
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            {hasActiveFilters
              ? 'Try adjusting your search or filters'
              : 'Create your first note to get started'
            }
          </Typography>
          {hasActiveFilters ? (
            <Button variant="outlined" onClick={clearFilters}>
              Clear Filters
            </Button>
          ) : (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={onCreateNote}
            >
              Create Note
            </Button>
          )}
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {filteredAndSortedNotes.map((note, index) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={note.id || note._id || `${note.title || 'note'}-${note.createdAt || note.updatedAt || index}`}>
              <StyledCard className="notes-card" onClick={() => onViewNote && onViewNote(note)}>
                <CardContent className="notes-card-content" sx={{ flexGrow: 1 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                    <Typography variant="h6" component="h3" noWrap sx={{ flexGrow: 1, mr: 1 }}>
                      {note.title || 'Untitled Note'}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, note)}
                    >
                      <MoreVertIcon />
                    </IconButton>
                  </Box>

                  <NotePreview>
                    <Typography variant="body2" color="text.secondary">
                      {stripHtml(note.content) || 'No content'}
                    </Typography>
                  </NotePreview>

                  {note.tags && note.tags.length > 0 && (
                    <Box mt={1} display="flex" flexWrap="wrap" gap={0.5}>
                      {note.tags.slice(0, 3).map(tag => (
                        <Chip
                          key={tag}
                          label={tag}
                          size="small"
                          variant="outlined"
                        />
                      ))}
                      {note.tags.length > 3 && (
                        <Chip
                          label={`+${note.tags.length - 3}`}
                          size="small"
                          variant="outlined"
                        />
                      )}
                    </Box>
                  )}
                </CardContent>

                <CardActions className="notes-card-footer" sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
                  <Box display="flex" alignItems="center">
                    <ScheduleIcon fontSize="small" sx={{ mr: 0.5, color: 'text.secondary' }} />
                    <Typography variant="caption" color="text.secondary">
                      {formatDate(note.updatedAt)}
                    </Typography>
                  </Box>
                  
                  <Box display="flex" alignItems="center">
                    {note.isShared && (
                      <Tooltip title="Shared note">
                        <ShareIcon fontSize="small" sx={{ color: '#475569', mr: 0.5 }} />
                      </Tooltip>
                    )}
                    {note.collaborators && note.collaborators.length > 0 && (
                      <Tooltip title={`${note.collaborators.length} collaborators`}>
                        <PersonIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                      </Tooltip>
                    )}
                  </Box>
                </CardActions>
              </StyledCard>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Context Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => { onViewNote && onViewNote(selectedNote); handleMenuClose(); }}>
          <ViewIcon sx={{ mr: 1 }} />
          View
        </MenuItem>
        <MenuItem onClick={() => { onEditNote && onEditNote(selectedNote); handleMenuClose(); }}>
          <EditIcon sx={{ mr: 1 }} />
          Edit
        </MenuItem>
        <MenuItem onClick={handleShareClick}>
          <ShareIcon sx={{ mr: 1 }} />
          Share
        </MenuItem>
        {onViewVersionHistory && (
          <MenuItem onClick={() => { onViewVersionHistory(selectedNote); handleMenuClose(); }}>
            <HistoryIcon sx={{ mr: 1 }} />
            Version History
          </MenuItem>
        )}
        {onExportNote && (
          <MenuItem onClick={() => handleExportClick('pdf')} disabled={!getNoteId(selectedNote)}>
            <PdfIcon sx={{ mr: 1 }} />
            Export as PDF
          </MenuItem>
        )}
        {onExportNote && (
          <MenuItem onClick={() => handleExportClick('docx')} disabled={!getNoteId(selectedNote)}>
            <DocIcon sx={{ mr: 1 }} />
            Export as Word
          </MenuItem>
        )}
        <MenuItem onClick={handleDeleteClick} sx={{ color: 'error.main' }}>
          <DeleteIcon sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Note</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{selectedNote?.title || 'this note'}"? 
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default NotesDashboard;
