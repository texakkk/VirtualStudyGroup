import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Container,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Snackbar,
} from '@mui/material';
import api from '../../api';
import NotesDashboard from '../../components/Notes/NotesDashboard';
import NoteDialog from '../../components/Notes/NoteDialog';
import ShareNoteDialog from '../../components/Notes/ShareNoteDialog';
import VersionHistory from '../../components/Notes/VersionHistory';
import { notesApi, transformNoteData } from '../../services/notesApi';
import { subscribeToGroupsUpdated } from '../../utils/groupEvents';
import './NotesManagement.css';

const NotesManagement = () => {
  const { groupId: routeGroupId } = useParams();
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(routeGroupId || '');
  const [notes, setNotes] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  
  // Dialog states
  const [noteDialog, setNoteDialog] = useState({ open: false, note: null, mode: 'create' });
  const [shareDialog, setShareDialog] = useState({ open: false, note: null });
  const [versionDialog, setVersionDialog] = useState({ open: false, note: null });

  const fetchGroups = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await api.get('/group/user-groups', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const groupsData = res.data.groups || (Array.isArray(res.data) ? res.data : []);
      setGroups(groupsData);
      if (!selectedGroup && groupsData.length > 0) {
        setSelectedGroup(groupsData[0]._id);
      }
    } catch (err) {
      showSnackbar('Error fetching groups. Please try again.', 'error');
    }
  }, [selectedGroup]);

  // Fetch user groups on mount
  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    const unsubscribe = subscribeToGroupsUpdated(() => {
      fetchGroups();
    });
    return unsubscribe;
  }, [fetchGroups]);

  // Fetch notes when selected group changes
  useEffect(() => {
    if (selectedGroup) {
      fetchNotes();
      fetchGroupMembers();
    }
  }, [selectedGroup]);

  const fetchNotes = async () => {
    if (!selectedGroup) return;
    
    setLoading(true);
    try {
      const result = await notesApi.getNotes(selectedGroup, {
        page: 1,
        limit: 100,
      });
      
      if (result.success) {
        const transformedNotes = result.data.map(transformNoteData);
        setNotes(transformedNotes);
      } else {
        showSnackbar(result.error || 'Error fetching notes', 'error');
      }
    } catch (err) {
      showSnackbar('Error fetching notes. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchGroupMembers = async () => {
    if (!selectedGroup) return;
    
    try {
      const token = localStorage.getItem('token');
      const res = await api.get(`/group/${selectedGroup}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setGroupMembers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching group members:', err);
    }
  };

  const showSnackbar = (message, severity = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  // Note CRUD operations
  const handleCreateNote = () => {
    setNoteDialog({ open: true, note: null, mode: 'create' });
  };

  const handleEditNote = (note) => {
    setNoteDialog({ open: true, note, mode: 'edit' });
  };

  const handleViewNote = (note) => {
    setNoteDialog({ open: true, note, mode: 'view' });
  };

  const handleSaveNote = async (noteData) => {
    try {
      const isEdit = noteDialog.mode === 'edit';
      const payload = {
        title: noteData.title,
        content: noteData.content,
        tags: noteData.tags,
        isPublic: noteData.isPublic,
        groupId: selectedGroup,
      };

      let result;
      if (isEdit) {
        result = await notesApi.updateNote(noteData.id, payload);
      } else {
        result = await notesApi.createNote(payload);
      }

      if (result.success) {
        showSnackbar(
          isEdit ? 'Note updated successfully' : 'Note created successfully',
          'success'
        );
        setNoteDialog({ open: false, note: null, mode: 'create' });
        fetchNotes(); // Refresh notes list
      } else {
        showSnackbar(result.error || 'Error saving note', 'error');
      }
    } catch (err) {
      showSnackbar('Error saving note. Please try again.', 'error');
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm('Are you sure you want to delete this note?')) {
      return;
    }

    try {
      const result = await notesApi.deleteNote(noteId);
      
      if (result.success) {
        showSnackbar('Note deleted successfully', 'success');
        setNotes(notes.filter(note => note.id !== noteId));
      } else {
        showSnackbar(result.error || 'Error deleting note', 'error');
      }
    } catch (err) {
      showSnackbar('Error deleting note. Please try again.', 'error');
    }
  };

  // Share operations
  const handleShareNote = (note) => {
    setShareDialog({ open: true, note });
  };

  const handleShareNoteWithUsers = async (noteId, userIds, permissionType) => {
    try {
      const result = await notesApi.shareNote(noteId, userIds, permissionType);
      
      if (result.success) {
        showSnackbar('Note shared successfully', 'success');
        fetchNotes(); // Refresh to get updated permissions
      } else {
        showSnackbar(result.error || 'Error sharing note', 'error');
      }
    } catch (err) {
      showSnackbar('Error sharing note. Please try again.', 'error');
    }
  };

  const handleRemovePermission = async (noteId, userId, permissionType) => {
    try {
      const result = await notesApi.removeNotePermission(noteId, userId, permissionType);
      
      if (result.success) {
        showSnackbar('Permission removed successfully', 'success');
        fetchNotes(); // Refresh to get updated permissions
      } else {
        showSnackbar(result.error || 'Error removing permission', 'error');
      }
    } catch (err) {
      showSnackbar('Error removing permission. Please try again.', 'error');
    }
  };

  // Version operations
  const handleRestoreVersion = async (version) => {
    showSnackbar('Version restored successfully', 'success');
    fetchNotes(); // Refresh notes list
  };

  const currentGroupData = groups.find(g => g._id === selectedGroup);

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Group Selector */}
      <Box mb={3}>
        <FormControl fullWidth sx={{ maxWidth: 400 }}>
          <InputLabel>Select Group</InputLabel>
          <Select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            label="Select Group"
          >
            {groups.map((group) => (
              <MenuItem key={group._id} value={group._id}>
                {group.Group_name || group.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Notes Dashboard */}
      {selectedGroup ? (
        <NotesDashboard
          notes={notes}
          onCreateNote={handleCreateNote}
          onEditNote={handleEditNote}
          onDeleteNote={handleDeleteNote}
          onShareNote={handleShareNote}
          onViewNote={handleViewNote}
          loading={loading}
          error={error}
          currentGroup={currentGroupData}
        />
      ) : (
        <Alert severity="info">
          Please select a group to view and manage notes.
        </Alert>
      )}

      {/* Note Dialog (Create/Edit/View) */}
      <NoteDialog
        open={noteDialog.open}
        onClose={() => setNoteDialog({ open: false, note: null, mode: 'create' })}
        onSave={handleSaveNote}
        note={noteDialog.note}
        mode={noteDialog.mode}
      />

      {/* Share Dialog */}
      <ShareNoteDialog
        open={shareDialog.open}
        onClose={() => setShareDialog({ open: false, note: null })}
        note={shareDialog.note}
        onShare={handleShareNoteWithUsers}
        onRemovePermission={handleRemovePermission}
        groupMembers={groupMembers}
      />

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default NotesManagement;
