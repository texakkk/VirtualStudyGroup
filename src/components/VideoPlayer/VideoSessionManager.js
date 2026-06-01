import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Chip,
  Divider,
} from '@mui/material';
import {
  VideoLibrary,
  PlayArrow,
  Delete,
  Add,
  History,
  People,
  Search,
} from '@mui/icons-material';
import api from '../../api';
import { ensureStringId } from '../../utils/objectId';
import { useMediaSession } from '../../contexts/MediaSessionContext';
import './VideoSessionManager.css';

const VideoSessionManager = ({ groupId, groupName, onClose }) => {
  const extractSessionId = (sessionLike) => {
    if (!sessionLike) return '';

    // If it is already an ID-like value, convert directly.
    if (typeof sessionLike === 'string' || typeof sessionLike === 'number') {
      return ensureStringId(sessionLike) || '';
    }

    // Try common fields used across API responses.
    const candidates = [
      sessionLike._id,
      sessionLike.sessionId,
      sessionLike.id,
      sessionLike.session?._id,
      sessionLike.sessionId?._id,
    ];

    for (const candidate of candidates) {
      const normalized = ensureStringId(candidate) || '';
      if (/^[a-fA-F0-9]{24}$/.test(normalized)) {
        return normalized;
      }
    }

    // Final fallback: run converter on whole object in case it contains a direct serializable ID.
    const fallback = ensureStringId(sessionLike) || '';
    return /^[a-fA-F0-9]{24}$/.test(fallback) ? fallback : '';
  };

  const [activeSession, setActiveSession] = useState(null);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newSessionUrl, setNewSessionUrl] = useState('');
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const {
    mediaSessionState,
    openMediaSession,
    openMediaSessionPanel,
    clearMediaSession,
  } = useMediaSession();
  
  const normalizedGroupId = ensureStringId(groupId) || '';
  const currentUserId = (() => {
    const direct = ensureStringId(localStorage.getItem('userId')) || '';
    if (direct) return direct;
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      return ensureStringId(user?._id) || ensureStringId(user?.User_id) || '';
    } catch (e) {
      return '';
    }
  })();
  const activeHostId = ensureStringId(activeSession?.host?._id) || '';
  const isCurrentUserHost = !!activeHostId && !!currentUserId && activeHostId === currentUserId;

  const openBackgroundPlayer = (session) => {
    const sessionId = extractSessionId(session);
    if (!sessionId) {
      setError('Invalid session ID');
      return;
    }

    openMediaSession({
      groupId: normalizedGroupId,
      groupName,
      sessionId,
      title: session?.title || 'Media session',
    });
  };

  // Load active session and history
  const loadSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      setActiveSession(null);
      setSessionHistory([]);

      // Load active session
      if (!normalizedGroupId) {
        setError('Invalid group selected');
        setActiveSession(null);
        setSessionHistory([]);
        return;
      }

      const activeResponse = await api.get(`/media-sessions/group/${normalizedGroupId}`);
      if (activeResponse.data.activeSession) {
        setActiveSession(activeResponse.data.session);
      } else {
        setActiveSession(null);
      }

      // Load session history
      const historyResponse = await api.get(`/media-sessions/group/${normalizedGroupId}/history`);
      setSessionHistory(historyResponse.data.sessions || []);
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setError(err.response?.data?.message || 'Failed to load sessions');
      setActiveSession(null);
      setSessionHistory([]);
    } finally {
      setLoading(false);
    }
  };

  // Load sessions on mount and when groupId changes
  useEffect(() => {
    setActiveSession(null);
    setSessionHistory([]);
    setError(null);

    if (normalizedGroupId) {
      loadSessions();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedGroupId]);

  const createSession = async ({ url, title, thumbnail = '' }) => {
    if (!url?.trim()) {
      setError('Please enter a video URL');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      let resolvedThumbnail = thumbnail;
      const resolvedTitle = title?.trim() || 'Video Session';

      if (!resolvedThumbnail && (url.includes('youtube.com') || url.includes('youtu.be'))) {
        const videoId = extractYouTubeId(url);
        if (videoId) {
          resolvedThumbnail = `https://img.youtube.com/vi/${videoId}/0.jpg`;
        }
      }

      const response = await api.post('/media-sessions/create', {
        groupId: normalizedGroupId,
        url: url.trim(),
        title: resolvedTitle,
        thumbnail: resolvedThumbnail,
      });

      if (response.data.success) {
        setActiveSession(response.data.session);
        setShowCreateDialog(false);
        setNewSessionUrl('');
        setNewSessionTitle('');
        setSearchQuery('');
        setSearchResults([]);
        openBackgroundPlayer(response.data.session);
      }
    } catch (err) {
      console.error('Failed to create session:', err);
      if (err.response?.status === 409) {
        setError('An active session already exists for this group. Joining it now.');
        const existingSessionId = ensureStringId(err.response?.data?.sessionId) || '';
        if (existingSessionId) {
          await handleJoinSession(existingSessionId);
          return;
        }
      }
      setError(err.response?.data?.message || 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateSession = async () => {
    await createSession({
      url: newSessionUrl.trim(),
      title: newSessionTitle.trim() || 'Video Session',
      thumbnail: '',
    });
  };

  const handleSearchVideos = async () => {
    if (!searchQuery.trim()) return;
    try {
      setSearching(true);
      setError(null);
      const res = await api.get('/media-sessions/search/youtube', {
        params: { q: searchQuery.trim(), limit: 8 },
      });
      setSearchResults(res.data?.videos || []);
    } catch (err) {
      setSearchResults([]);
      const apiMessage = err.response?.data?.message || '';
      if (err.response?.status === 503) {
        setError(apiMessage || 'YouTube search is unavailable. Configure YOUTUBE_API_KEY on the backend.');
      } else {
        setError(apiMessage || 'Failed to search videos');
      }
    } finally {
      setSearching(false);
    }
  };

  const handleStartNewSessionFlow = async () => {
    if (!activeSession) {
      setShowCreateDialog(true);
      return;
    }

    if (!isCurrentUserHost) {
      setError('A session is already active. Join it, or ask the host to end it first.');
      return;
    }

    const confirmed = window.confirm('There is an active session. End it and create a new one?');
    if (!confirmed) return;

    const existingSessionId = extractSessionId(activeSession);
    if (!existingSessionId) {
      setError('Invalid active session ID');
      return;
    }

    await handleEndSession(existingSessionId);
    setShowCreateDialog(true);
  };

  const handleJoinSession = async (session) => {
    try {
      setError(null);
      // Extract session ID if an object is passed
      const sessionId = extractSessionId(session);

      if (!sessionId) {
        setError('Invalid session ID');
        return;
      }
      const response = await api.post(`/media-sessions/${sessionId}/join`);
      
      if (response.data.success) {
        setActiveSession(response.data.session);
        openBackgroundPlayer(response.data.session);
      }
    } catch (err) {
      console.error('Failed to join session:', err);
      setError(err.response?.data?.message || 'Failed to join session');
    }
  };

  const handleEndSession = async (sessionId) => {
    if (!window.confirm('Are you sure you want to end this session? This will stop the video for all participants.')) {
      return;
    }

    try {
      setError(null);
      const normalizedSessionId = ensureStringId(sessionId) || '';
      if (!normalizedSessionId) {
        setError('Invalid session ID');
        return;
      }

      await api.post(`/media-sessions/${normalizedSessionId}/end`);
      
      setActiveSession(null);
      if (mediaSessionState.activeSession?.sessionId === normalizedSessionId) {
        clearMediaSession();
      }
      await loadSessions();
    } catch (err) {
      console.error('Failed to end session:', err);
      setError(err.response?.data?.message || 'Failed to end session');
    }
  };

  const extractYouTubeId = (url) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /youtube\.com\/embed\/([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <Box className="video-session-manager">
      <Paper className="session-manager-container">
        {/* Header */}
        <Box className="session-manager-header">
          <Box className="header-title">
            <VideoLibrary sx={{ mr: 1, fontSize: 32 }} />
            <Typography variant="h5">Video Sessions</Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleStartNewSessionFlow}
          >
            New Session
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ m: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box className="session-manager-loading">
            <CircularProgress />
            <Typography variant="body1" sx={{ mt: 2 }}>
              Loading sessions...
            </Typography>
          </Box>
        ) : (
          <Box className="session-manager-content">
            {/* Active Session */}
            {activeSession && (
              <Box className="active-session-section">
                <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                  <PlayArrow sx={{ mr: 1 }} />
                  Active Session
                </Typography>
                <Paper className="session-card active-session-card" elevation={3}>
                  <Box className="session-card-content">
                    {activeSession.thumbnail && (
                      <Box
                        className="session-thumbnail"
                        sx={{
                          backgroundImage: `url(${activeSession.thumbnail})`,
                        }}
                      />
                    )}
                    <Box className="session-info">
                      <Typography variant="h6">{activeSession.title || 'Video Session'}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {activeSession.url}
                      </Typography>
                      <Box className="session-meta">
                        <Chip
                          icon={<People />}
                          label={`${activeSession.participants?.length || 0} watching`}
                          size="small"
                          color="primary"
                        />
                        <Chip
                          label={activeSession.isPlaying ? 'Playing' : 'Paused'}
                          size="small"
                          color={activeSession.isPlaying ? 'success' : 'default'}
                        />
                        <Typography variant="caption" color="text.secondary">
                          Started {formatDate(activeSession.createdAt)}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                  <Box className="session-actions">
                    <Button
                      variant="contained"
                      startIcon={<PlayArrow />}
                      onClick={() => {
                        const currentBackgroundSession =
                          mediaSessionState.activeSession?.sessionId;
                        const activeId = extractSessionId(activeSession);

                        if (currentBackgroundSession === activeId) {
                          openMediaSessionPanel();
                        } else {
                          handleJoinSession(activeSession);
                        }
                      }}
                      fullWidth
                      sx={{ mb: 1 }}
                    >
                      {mediaSessionState.activeSession?.sessionId ===
                      extractSessionId(activeSession)
                        ? 'Open Player'
                        : 'Join Session'}
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      startIcon={<Delete />}
                      onClick={() => handleEndSession(activeSession._id)}
                      fullWidth
                    >
                      End Session
                    </Button>
                  </Box>
                </Paper>
              </Box>
            )}

            {/* Session History */}
            <Box className="session-history-section">
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                <History sx={{ mr: 1 }} />
                Recent Sessions
              </Typography>
              {sessionHistory.length === 0 ? (
                <Paper className="empty-state" elevation={0}>
                  <VideoLibrary sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                  <Typography variant="body1" color="text.secondary">
                    No previous sessions
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Create a new session to start watching videos together
                  </Typography>
                </Paper>
              ) : (
                <List className="session-history-list">
                  {sessionHistory.map((session) => (
                    <React.Fragment key={session._id}>
                      <ListItem className="history-list-item">
                        <ListItemAvatar>
                          {session.thumbnail ? (
                            <Avatar
                              variant="rounded"
                              src={session.thumbnail}
                              sx={{ width: 60, height: 60 }}
                            />
                          ) : (
                            <Avatar variant="rounded" sx={{ width: 60, height: 60 }}>
                              <VideoLibrary />
                            </Avatar>
                          )}
                        </ListItemAvatar>
                        <ListItemText
                          primary={session.title || 'Video Session'}
                          secondaryTypographyProps={{ component: 'div' }}
                          secondary={
                            <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              <Typography variant="caption" component="span" display="block">
                                Host: {session.host?.name || 'Unknown'}
                              </Typography>
                              <Typography variant="caption" component="span" display="block">
                                {formatDate(session.createdAt)}
                              </Typography>
                              <Box component="span" sx={{ mt: 0.5 }}>
                                <Chip
                                  label={session.status}
                                  size="small"
                                />
                              </Box>
                            </Box>
                          }
                        />
                      </ListItem>
                      <Divider />
                    </React.Fragment>
                  ))}
                </List>
              )}
            </Box>
          </Box>
        )}
      </Paper>

      {/* Create Session Dialog */}
      <Dialog
        open={showCreateDialog}
        onClose={() => !creating && setShowCreateDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create New Video Session</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Share a YouTube video or other media URL to watch together with your group.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              fullWidth
              label="Search YouTube"
              placeholder="e.g. linear algebra lecture"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={creating || searching}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearchVideos();
                }
              }}
            />
            <Button
              variant="outlined"
              startIcon={searching ? <CircularProgress size={16} /> : <Search />}
              onClick={handleSearchVideos}
              disabled={creating || searching || !searchQuery.trim()}
            >
              Search
            </Button>
          </Box>

          {searchResults.length > 0 && (
            <Box sx={{ mb: 2, maxHeight: 220, overflowY: 'auto', border: '1px solid #eee', borderRadius: 1 }}>
              <List dense>
                {searchResults.map((video) => (
                  <ListItem
                    key={video.videoId}
                    secondaryAction={
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() =>
                          createSession({
                            url: video.watchUrl,
                            title: video.title,
                            thumbnail: video.thumbnail,
                          })
                        }
                        disabled={creating}
                      >
                        Use
                      </Button>
                    }
                  >
                    <ListItemAvatar>
                      <Avatar
                        variant="rounded"
                        src={video.thumbnail}
                        sx={{ width: 56, height: 40 }}
                      />
                    </ListItemAvatar>
                    <ListItemText
                      primary={video.title}
                      secondary={`${video.channelTitle || 'YouTube'}${video.publishedAt ? ` • ${new Date(video.publishedAt).toLocaleDateString()}` : ''}`}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}

          <TextField
            fullWidth
            label="Video URL"
            placeholder="https://www.youtube.com/watch?v=..."
            value={newSessionUrl}
            onChange={(e) => setNewSessionUrl(e.target.value)}
            sx={{ mb: 2 }}
            disabled={creating}
            autoFocus
          />
          <TextField
            fullWidth
            label="Session Title (optional)"
            placeholder="Study Session Video"
            value={newSessionTitle}
            onChange={(e) => setNewSessionTitle(e.target.value)}
            disabled={creating}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreateDialog(false)} disabled={creating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateSession}
            variant="contained"
            disabled={creating || !newSessionUrl.trim()}
            startIcon={creating ? <CircularProgress size={20} /> : <Add />}
          >
            {creating ? 'Creating...' : 'Create Session'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default VideoSessionManager;
