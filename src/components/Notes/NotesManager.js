import React, { useState, useEffect, useCallback, useContext } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Snackbar, Alert, Typography, Button, Tabs, Tab } from '@mui/material';
import NotesDashboard from './NotesDashboard';
import EnhancedNoteDialog from './EnhancedNoteDialog';
import ShareNoteDialog from './ShareNoteDialog';
import DocumentConverter from './DocumentConverter';
import VersionHistory from './VersionHistory';
import { notesApi, transformNoteData } from '../../services/notesApi';
import { handleApiError, validateNoteData } from '../../utils/apiErrorHandler';
import { ensureStringId } from '../../utils/objectId';
import AuthContext from '../../contexts/AuthContext';
import './NotesIntegration.css';

const isValidNoteId = (noteId) => typeof noteId === 'string' && /^[a-f\d]{24}$/i.test(noteId);
const getNoteId = (note) => {
  const noteId = ensureStringId(note?._id || note?.id || (typeof note === 'string' ? note : null));
  return isValidNoteId(noteId) ? noteId : '';
};

const hasDisplayableNoteData = (note) => Boolean(
  getNoteId(note) ||
  note?.title?.trim?.() ||
  note?.content?.trim?.()
);

const getUserId = (user) => {
  if (!user) return '';
  const rawId = typeof user === 'string'
    ? user
    : user._id ||
      user.id ||
      user.User_id ||
      user.UserId ||
      user.userId ||
      user.user_id ||
      user.uid ||
      user.sub ||
      user._doc?._id ||
      user._doc?.id ||
      null;
  return ensureStringId(rawId) || '';
};

const getUserEmail = (user) => {
  if (!user || typeof user === 'string') return '';
  return String(
    user.User_email ||
    user.email ||
    user.userEmail ||
    user._doc?.User_email ||
    user._doc?.email ||
    ''
  ).trim().toLowerCase();
};

const isSameUser = (firstUser, secondUser) => {
  const firstUserId = getUserId(firstUser);
  const secondUserId = getUserId(secondUser);
  if (firstUserId && secondUserId) {
    return firstUserId === secondUserId;
  }

  const firstEmail = getUserEmail(firstUser);
  const secondEmail = getUserEmail(secondUser);
  return Boolean(firstEmail && secondEmail && firstEmail === secondEmail);
};

const permissionIncludesUser = (permissionList, userId) => (
  Array.isArray(permissionList) &&
  permissionList.some((permissionUser) => getUserId(permissionUser) === userId)
);

const NotesManager = ({ groupId = null }) => {
  const { currentUser } = useContext(AuthContext);
  const { noteId: routeNoteId } = useParams();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState('create');
  const [selectedNote, setSelectedNote] = useState(null);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [dialogError, setDialogError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [userGroups, setUserGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(groupId);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  // const [converterOpen, setConverterOpen] = useState(false); // Handled by activeTab
  const [groupMembers, setGroupMembers] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  const [loadedRouteNoteId, setLoadedRouteNoteId] = useState(null);
  // Use selected group or first available group
  const currentGroupId = selectedGroupId || userGroups[0]?._id;

  const showSnackbar = useCallback((message, severity = 'success') => {
    setSnackbar({ open: true, message, severity });
  }, []);

  const canEditNote = useCallback((note) => {
    if (note?.canEdit === true) {
      return true;
    }

    const currentUserId = getUserId(currentUser);
    if (!currentUserId || !note) {
      return false;
    }

    if (isSameUser(note.createdBy || note.Note_createdBy, currentUser)) {
      return true;
    }

    const permissions = note.permissions || {};
    return (
      permissionIncludesUser(permissions.write, currentUserId) ||
      permissionIncludesUser(permissions.admin, currentUserId)
    );
  }, [currentUser]);

  const loadUserGroups = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5001/api'}/group/user-groups`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        const groups = data.groups || (Array.isArray(data) ? data : []);
        setUserGroups(groups);
        
        // Set first group as default if no group is selected
        if (!selectedGroupId && groups.length > 0) {
          setSelectedGroupId(groups[0]._id);
        }
      } else {
        setError('Failed to load groups');
      }
    } catch (err) {
      console.error('Error loading user groups:', err);
      setError('Failed to load groups. Please try again.');
    }
  }, [selectedGroupId]);

  const loadNotes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await notesApi.getNotes(currentGroupId, {
        page: 1,
        limit: 50,
      });
      
      if (result.success) {
        const transformedNotes = result.data
          .map(transformNoteData)
          .filter(hasDisplayableNoteData);
        setNotes(transformedNotes);
      } else {
        setError(result.error);
      }
    } catch (err) {
      const errorMessage = handleApiError(err, (msg, sev) => setSnackbar({ open: true, message: msg, severity: sev || 'success' }), 'Failed to load notes');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [currentGroupId]);

  const loadGroupMembers = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5001/api'}/group/${currentGroupId}/members`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setGroupMembers(data.members || []);
      } else {
        console.error('Failed to load group members');
      }
    } catch (err) {
      console.error('Error loading group members:', err);
    }
  }, [currentGroupId]);

  // Load user groups on component mount
  useEffect(() => {
    loadUserGroups();
  }, [loadUserGroups]);

  // Load notes when group changes
  useEffect(() => {
    if (currentGroupId) {
      loadNotes();
      loadGroupMembers();
    }
  }, [currentGroupId, loadNotes, loadGroupMembers]);

  useEffect(() => {
    if (!routeNoteId || loadedRouteNoteId === routeNoteId) {
      return;
    }

    let isActive = true;

    const openSharedNote = async () => {
      try {
        const result = await notesApi.getNote(routeNoteId);
        if (!isActive) return;

        if (result.success) {
          const transformedNote = transformNoteData(result.data);
          const noteGroupId = typeof transformedNote.groupId === 'object'
            ? transformedNote.groupId?._id
            : transformedNote.groupId;

          if (noteGroupId) {
            setSelectedGroupId(noteGroupId);
          }

          setSelectedNote(transformedNote);
          setDialogMode('view');
          setDialogError(null);
          setDialogOpen(true);
          setLoadedRouteNoteId(routeNoteId);
        } else {
          showSnackbar(result.error || 'Failed to open shared note', 'error');
          setLoadedRouteNoteId(routeNoteId);
        }
      } catch (err) {
        showSnackbar('Failed to open shared note', 'error');
        setLoadedRouteNoteId(routeNoteId);
      }
    };

    openSharedNote();

    return () => {
      isActive = false;
    };
  }, [routeNoteId, loadedRouteNoteId, showSnackbar]);

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  // Dashboard event handlers
  const handleCreateNote = () => {
    setSelectedNote(null);
    setDialogMode('create');
    setDialogError(null);
    setDialogOpen(true);
  };

  const handleEditNote = async (note) => {
    setDialogError(null);

    const noteId = getNoteId(note);
    if (!noteId) {
      setSelectedNote(note);
      setDialogMode('edit');
      setDialogOpen(true);
      return;
    }

    try {
      const result = await notesApi.getNote(noteId);
      if (result.success) {
        const fullNote = transformNoteData(result.data);
        const editableNote = {
          ...note,
          ...fullNote,
          content: fullNote?.content || note?.content || '',
        };

        if (!canEditNote(editableNote)) {
          setSelectedNote(editableNote);
          setDialogMode('view');
          setDialogOpen(true);
          showSnackbar('This note is read-only for you. Ask the owner for edit access.', 'info');
          return;
        }

        setSelectedNote(editableNote);
        setDialogMode('edit');
        setDialogOpen(true);
      } else {
        setSelectedNote(note);
        setDialogMode('view');
        setDialogOpen(true);
        setDialogError(result.error || 'Could not load full note content');
      }
    } catch (err) {
      setSelectedNote(note);
      setDialogMode('view');
      setDialogOpen(true);
      setDialogError('Could not load full note content');
    }
  };

  const handleViewNote = async (note) => {
    setSelectedNote(note);
    setDialogMode('view');
    setDialogError(null);
    setDialogOpen(true);

    const noteId = getNoteId(note);
    if (!noteId) {
      return;
    }

    try {
      const result = await notesApi.getNote(noteId);
      if (result.success) {
        const fullNote = transformNoteData(result.data);
        setSelectedNote({
          ...note,
          ...fullNote,
          content: fullNote?.content || note?.content || '',
        });
      }
    } catch (err) {
      // The preview data is still usable; keep the dialog open.
    }
  };

  const handleDeleteNote = async (noteId) => {
    const normalizedNoteId = getNoteId(noteId);

    if (!normalizedNoteId) {
      setNotes(notes.filter(note => getNoteId(note) || hasDisplayableNoteData(note)));
      showSnackbar('Removed unsaved note from this view');
      return;
    }

    try {
      const result = await notesApi.deleteNote(normalizedNoteId);
      if (result.success) {
        setNotes(notes.filter(note => getNoteId(note) !== normalizedNoteId));
        showSnackbar('Note deleted successfully');
      } else {
        showSnackbar(result.error, 'error');
      }
    } catch (err) {
      showSnackbar('Failed to delete note', 'error');
      console.error('Error deleting note:', err);
    }
  };

  const handleShareNote = async (note) => {
    setSelectedNote(note);
    setShareDialogOpen(true);

    const noteId = getNoteId(note);
    if (!noteId) {
      return;
    }

    try {
      const result = await notesApi.getNote(noteId);
      if (result.success) {
        const fullNote = transformNoteData(result.data);
        setSelectedNote({
          ...note,
          ...fullNote,
          content: fullNote?.content || note?.content || '',
        });
      }
    } catch (err) {
      // Keep the share dialog open with the note data we already have.
    }
  };

  const handleShareNoteWithUsers = async (noteId, userIds, permissionType) => {
    const normalizedNoteId = getNoteId(noteId);
    if (!normalizedNoteId) {
      showSnackbar('Cannot share this note until it has a valid note ID', 'error');
      return;
    }

    try {
      const result = await notesApi.shareNote(normalizedNoteId, userIds, permissionType);
      if (result.success) {
        showSnackbar('Note shared successfully');
        // Update the note in the list with new sharing info
        const updatedNote = transformNoteData(result.data);
        setNotes(notes.map(n => getNoteId(n) === normalizedNoteId ? updatedNote : n));
      } else {
        showSnackbar(result.error, 'error');
      }
    } catch (err) {
      showSnackbar('Failed to share note', 'error');
      console.error('Error sharing note:', err);
    }
  };

  const handleRemovePermission = async (noteId, userId, permissionType) => {
    const normalizedNoteId = getNoteId(noteId);
    if (!normalizedNoteId) {
      showSnackbar('Cannot update note permissions until it has a valid note ID', 'error');
      return;
    }

    try {
      const result = await notesApi.removeNotePermission(normalizedNoteId, userId, permissionType);
      if (result.success) {
        showSnackbar('Permission removed successfully');
        const updatedNote = result.data
          ? transformNoteData(result.data)
          : null;

        if (updatedNote) {
          setNotes(notes.map(n => getNoteId(n) === normalizedNoteId ? updatedNote : n));
          setSelectedNote(updatedNote);
        } else {
          const noteResult = await notesApi.getNote(normalizedNoteId);
          if (noteResult.success) {
            const reloadedNote = transformNoteData(noteResult.data);
            setNotes(notes.map(n => getNoteId(n) === normalizedNoteId ? reloadedNote : n));
            setSelectedNote(reloadedNote);
          }
        }
      } else {
        showSnackbar(result.error, 'error');
      }
    } catch (err) {
      showSnackbar('Failed to remove permission', 'error');
      console.error('Error removing permission:', err);
    }
  };

  const handleViewVersionHistory = (note) => {
    setSelectedNote(note);
    setVersionHistoryOpen(true);
  };

  const handleRestoreVersion = async (restoredNote) => {
    showSnackbar('Note restored to previous version');
    setVersionHistoryOpen(false);
    if (restoredNote?.id) {
      setSelectedNote(restoredNote);
      setNotes(prevNotes => prevNotes.map(note => (
        note.id === restoredNote.id ? restoredNote : note
      )));
    }
    loadNotes();
  };

  // const handleOpenConverter = () => {
  //   setActiveTab(1); // Switch to Document Converter tab
  // };

  const handleFileConverted = async (conversionData) => {
    showSnackbar(`Document "${conversionData.fileName}" converted successfully`);
    // Reload notes to show the new note created from conversion
    loadNotes();
  };

  const handleExportNote = async (noteId, format) => {
    const normalizedNoteId = getNoteId(noteId);

    if (!normalizedNoteId) {
      showSnackbar('Cannot export this note until it has a valid note ID', 'error');
      return;
    }

    try {
      const result = await notesApi.exportNote(normalizedNoteId, format);
      if (result.success) {
        showSnackbar(`Note exported as ${format.toUpperCase()}`);
      } else {
        showSnackbar(result.error, 'error');
      }
    } catch (err) {
      showSnackbar('Failed to export note', 'error');
      console.error('Error exporting note:', err);
    }
  };

  // Dialog event handlers
  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedNote(null);
    setDialogError(null);
  };

  const handleNoteSave = async (noteData) => {
    try {
      setDialogLoading(true);
      setDialogError(null);

      // Validate note data
      const validation = validateNoteData(noteData);
      if (!validation.isValid) {
        setDialogError(validation.errors.join('. '));
        return;
      }

      // Add groupId to note data
      const noteWithGroup = {
        ...noteData,
        groupId: currentGroupId,
      };

      let result;
      if (dialogMode === 'create') {
        result = await notesApi.createNote(noteWithGroup);
        if (result.success) {
          const savedNote = transformNoteData(result.data) || {};
          const transformedNote = {
            ...savedNote,
            title: savedNote.title || noteWithGroup.title,
            content: savedNote.content || noteWithGroup.content,
            tags: savedNote.tags?.length ? savedNote.tags : noteWithGroup.tags,
            isPublic: savedNote.isPublic ?? noteWithGroup.isPublic,
            groupId: savedNote.groupId || noteWithGroup.groupId,
            createdAt: savedNote.createdAt || noteWithGroup.createdAt || new Date().toISOString(),
            updatedAt: savedNote.updatedAt || noteWithGroup.updatedAt || new Date().toISOString(),
          };
          setNotes([transformedNote, ...notes]);
          showSnackbar('Note created successfully');
        } else {
          setDialogError(result.error);
          return;
        }
      } else if (dialogMode === 'edit') {
        const selectedNoteId = getNoteId(selectedNote);
        if (!selectedNoteId) {
          setDialogError('Cannot update this note until it has a valid note ID');
          return;
        }

        result = await notesApi.updateNote(selectedNoteId, noteWithGroup);
        if (result.success) {
          const transformedNote = transformNoteData(result.data);
          setNotes(notes.map(note => 
            getNoteId(note) === getNoteId(transformedNote) ? transformedNote : note
          ));
          showSnackbar('Note updated successfully');
        } else {
          setDialogError(result.error);
          return;
        }
      }

      setDialogOpen(false);
      setSelectedNote(null);
    } catch (err) {
      const errorMessage = handleApiError(err, showSnackbar, 'Failed to save note');
      setDialogError(errorMessage);
    } finally {
      setDialogLoading(false);
    }
  };

  return (
    <Box className="notes-integration">
      {/* Group Selection Header */}
      {userGroups.length > 1 && (
        <Box className="notes-group-selector">
          <Typography variant="h6" gutterBottom>
            Select Group
          </Typography>
          <Box className="notes-group-buttons">
            {userGroups.map((group) => (
              <Button
                key={group._id}
                variant={selectedGroupId === group._id ? 'contained' : 'outlined'}
                onClick={() => setSelectedGroupId(group._id)}
                size="small"
                className={`notes-group-button ${selectedGroupId === group._id ? 'active' : ''}`}
              >
                {group.Group_name || group.name || 'Untitled Group'}
              </Button>
            ))}
          </Box>
        </Box>
      )}

      {/* Tabs for different views */}
      <Box className="notes-tabs" sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
          <Tab label="My Notes" />
          <Tab label="Import Documents" />
        </Tabs>
      </Box>

      {/* Notes Dashboard Tab */}
      {activeTab === 0 && (
        <NotesDashboard
          notes={notes}
          onCreateNote={handleCreateNote}
          onEditNote={handleEditNote}
          onDeleteNote={handleDeleteNote}
          onShareNote={handleShareNote}
          onViewNote={handleViewNote}
          onViewVersionHistory={handleViewVersionHistory}
          onExportNote={handleExportNote}
          loading={loading}
          error={error}
          currentGroup={userGroups.find(g => g._id === currentGroupId)}
        />
      )}

      {/* Document Converter Tab */}
      {activeTab === 1 && (
        <DocumentConverter
          onFileConverted={handleFileConverted}
          onExportComplete={(data) => showSnackbar(`Exported as ${data.format}`)}
          groupId={currentGroupId}
        />
      )}

      {/* Note Dialog */}
      <EnhancedNoteDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        onSave={handleNoteSave}
        onEdit={handleEditNote}
        canEdit={dialogMode !== 'view' || canEditNote(selectedNote)}
        editDisabledReason="Only the owner or users with edit access can edit this note."
        note={selectedNote}
        mode={dialogMode}
        loading={dialogLoading}
        error={dialogError}
        groupId={currentGroupId}
        onRestoreVersion={handleRestoreVersion}
      />

      {/* Share Note Dialog */}
      <ShareNoteDialog
        open={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
        note={selectedNote}
        onShare={handleShareNoteWithUsers}
        onRemovePermission={handleRemovePermission}
        groupMembers={groupMembers}
        loading={dialogLoading}
      />

      {/* Version History Dialog */}
      {versionHistoryOpen && selectedNote && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: 'background.paper',
            zIndex: 1300,
            overflow: 'auto',
            p: 3,
          }}
        >
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h5">
              Version History: {selectedNote.title}
            </Typography>
            <Button onClick={() => setVersionHistoryOpen(false)}>
              Close
            </Button>
          </Box>
          <VersionHistory
            noteId={getNoteId(selectedNote)}
            currentVersion={selectedNote}
            onRestoreVersion={handleRestoreVersion}
          />
        </Box>
      )}

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default NotesManager;
