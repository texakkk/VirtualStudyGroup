import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
} from '@mui/material';
import { VideoLibrary } from '@mui/icons-material';
import VideoSessionManager from '../../components/VideoPlayer/VideoSessionManager';
import api from '../../api';
import { ensureStringId } from '../../utils/objectId';
import { subscribeToGroupsUpdated } from '../../utils/groupEvents';
import './MediaSessions.css';

const MediaSessions = () => {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Ensure groups is always an array
  const safeGroups = Array.isArray(groups) ? groups : [];

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToGroupsUpdated(() => {
      fetchGroups();
    });
    return unsubscribe;
  }, []);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/group/user-groups');
      
      const rawData = response?.data;
      const groupsData = Array.isArray(rawData)
        ? rawData
        : Array.isArray(rawData?.groups)
          ? rawData.groups
          : [];

      const normalizedGroups = groupsData
        .map((group) => ({
          ...group,
          _id: ensureStringId(group?._id) || '',
        }))
        .filter((group) => !!group._id);

      setGroups(normalizedGroups);
      setSelectedGroup((prev) =>
        normalizedGroups.some((group) => group._id === prev) ? prev : ''
      );
    } catch (err) {
      console.error('Error fetching groups:', err);
      setError('Failed to load groups. Please try again.');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  const handleGroupChange = (event) => {
    const groupId = ensureStringId(event.target.value) || '';
    setSelectedGroup(groupId);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box className="media-sessions-container">
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <VideoLibrary sx={{ fontSize: 32, mr: 2, color: 'primary.main' }} />
          <Typography variant="h4" component="h1">
            Media Sessions
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Watch videos together with your study group. Share YouTube videos or other media and enjoy synchronized playback.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel id="group-select-label">Select a Group</InputLabel>
          <Select
            labelId="group-select-label"
            id="group-select"
            value={selectedGroup}
            label="Select a Group"
            onChange={handleGroupChange}
          >
            {safeGroups.length === 0 ? (
              <MenuItem disabled>No groups available</MenuItem>
            ) : (
              safeGroups.map((group) => (
                <MenuItem key={group._id} value={group._id}>
                  {group.Group_name}
                </MenuItem>
              ))
            )}
          </Select>
        </FormControl>

        {safeGroups.length === 0 && (
          <Alert severity="info">
            You need to join or create a group first to use media sessions.
          </Alert>
        )}
      </Paper>

      {selectedGroup && (
        <VideoSessionManager
          groupId={selectedGroup}
          groupName={
            safeGroups.find((group) => group._id === selectedGroup)?.Group_name
          }
        />
      )}
    </Box>
  );
};

export default MediaSessions;
