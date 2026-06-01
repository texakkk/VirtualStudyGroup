import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactPlayer from 'react-player';
import { io } from 'socket.io-client';
import {
  Box,
  Paper,
  IconButton,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  TextField,
  Button,
  Chip,
  Divider,
  CircularProgress,
  Alert,
  Tooltip,
  ListItemIcon,
  ListItemButton,
} from '@mui/material';
import {
  PlayArrow,
  Pause,
  VolumeUp,
  VolumeOff,
  Fullscreen,
  FullscreenExit,
  People,
  Chat,
  Close,
  Sync,
  VideoLibrary,
  Settings,
  Check,
  PictureInPictureAlt,
} from '@mui/icons-material';
import api from '../../api';
import { ensureStringId } from '../../utils/objectId';
import VideoAnnotations from './VideoAnnotations';
import './SynchronizedVideoPlayer.css';

const SynchronizedVideoPlayer = ({
  groupId,
  sessionId: initialSessionId,
  onClose,
  onCollapse,
  onSessionEnded,
}) => {
  const normalizedInitialSessionId = ensureStringId(initialSessionId) || '';
  const normalizedGroupId = ensureStringId(groupId) || '';

  // State management
  const [sessionId, setSessionId] = useState(normalizedInitialSessionId);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [showParticipants, setShowParticipants] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState('good');
  const [playbackQuality, setPlaybackQuality] = useState('auto');
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  // Refs
  const playerRef = useRef(null);
  const socketRef = useRef(null);
  const containerRef = useRef(null);
  const chatEndRef = useRef(null);
  const syncTimeoutRef = useRef(null);
  const lastUpdateRef = useRef(Date.now());
  const qualityMenuRef = useRef(null);
  const joinedSessionRef = useRef('');

  // Get current user ID from multiple possible storage shapes
  const resolveCurrentUserId = () => {
    const directUserId = ensureStringId(localStorage.getItem('userId')) || '';
    if (directUserId) return directUserId;

    try {
      const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
      return (
        ensureStringId(storedUser?._id) ||
        ensureStringId(storedUser?.User_id) ||
        ''
      );
    } catch (e) {
      return '';
    }
  };

  const userId = resolveCurrentUserId();

  const extractYouTubeId = (url) => {
    if (!url || typeof url !== 'string') return '';
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /youtube\.com\/embed\/([^&\n?#]+)/,
      /youtube\.com\/shorts\/([^&\n?#]+)/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) return match[1];
    }
    return '';
  };

  const normalizePlayableUrl = (url, type) => {
    if (!url || typeof url !== 'string') return '';
    if (type === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be')) {
      const id = extractYouTubeId(url);
      return id ? `https://www.youtube.com/watch?v=${id}` : url;
    }
    return url;
  };

  // Initialize socket connection
  useEffect(() => {
    const token = localStorage.getItem('token');
    const socketUrl = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5001';

    socketRef.current = io(`${socketUrl}/media-sessions`, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current.on('connect', () => {
      console.log('Connected to media session socket');
      if (sessionId && joinedSessionRef.current !== sessionId) {
        joinSession(sessionId);
      }
    });

    socketRef.current.on('disconnect', () => {
      console.log('Disconnected from media session socket');
      setError('Connection lost. Attempting to reconnect...');
    });

    socketRef.current.on('error', (err) => {
      console.error('Socket error:', err);
      setError(err.message || 'Socket connection error');
    });

    // Listen for session state updates
    socketRef.current.on('sessionState', handleSessionState);
    socketRef.current.on('playbackUpdate', handlePlaybackUpdate);
    socketRef.current.on('chatMessage', handleChatMessage);
    socketRef.current.on('userJoined', handleUserJoined);
    socketRef.current.on('userLeft', handleUserLeft);
    socketRef.current.on('sessionEnded', handleSessionEnded);
    socketRef.current.on('urlChanged', handleUrlChanged);
    socketRef.current.on('syncResponse', handleSyncResponse);

    return () => {
      if (socketRef.current) {
        if (sessionId && userId) {
          socketRef.current.emit('leaveSession', { sessionId, userId });
        }
        socketRef.current.disconnect();
      }
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Join session
  const joinSession = useCallback(async (sid) => {
    try {
      const normalizedSessionId = ensureStringId(sid) || '';
      if (!normalizedSessionId) {
        setError('Invalid session ID');
        setLoading(false);
        return;
      }

      if (joinedSessionRef.current === normalizedSessionId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      // Join via API
      const response = await api.post(`/media-sessions/${normalizedSessionId}/join`);
      
      if (response.data.success) {
        setSession(response.data.session);
        setParticipants(response.data.session.participants || []);
        setChatMessages(response.data.session.chatMessages || []);
        setCurrentTime(response.data.session.currentTime || 0);
        setIsPlaying(response.data.session.isPlaying || false);
        setSessionId(normalizedSessionId);
        joinedSessionRef.current = normalizedSessionId;

        // Join via socket
        if (socketRef.current && userId) {
          socketRef.current.emit('joinSession', {
            sessionId: normalizedSessionId,
            userId,
          });
        } else {
          setError('Missing user identity. Please log in again.');
        }
      }
    } catch (err) {
      console.error('Failed to join session:', err);
      setError(err.response?.data?.message || 'Failed to join session');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Load or create session
  useEffect(() => {
    const loadSession = async () => {
      if (sessionId) {
        await joinSession(sessionId);
      } else if (normalizedGroupId) {
        // Check for active session
        try {
          const response = await api.get(`/media-sessions/group/${normalizedGroupId}`);
          if (response.data.activeSession && response.data.session) {
            const activeId = ensureStringId(response.data.session._id) || '';
            setSessionId(activeId);
            await joinSession(activeId);
          } else {
            setLoading(false);
            setError('No active session found. Please create one first.');
          }
        } catch (err) {
          console.error('Failed to load session:', err);
          setError('Failed to load session');
          setLoading(false);
        }
      }
    };

    loadSession();
  }, [normalizedGroupId, sessionId, joinSession]);

  // Socket event handlers
  const handleSessionState = useCallback((data) => {
    console.log('Session state received:', data);
    setSession(data);
    setParticipants(data.participants || []);
    setChatMessages(data.chatMessages || []);
    setCurrentTime(data.currentTime || 0);
    setIsPlaying(data.isPlaying || false);
    
    // Seek player to current time
    if (playerRef.current && data.currentTime) {
      playerRef.current.seekTo(data.currentTime, 'seconds');
    }
  }, []);

  const handlePlaybackUpdate = useCallback((data) => {
    console.log('Playback update:', data);
    
    // Ignore updates from self to prevent loops
    if (data.updatedBy === userId) {
      return;
    }

    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;
    lastUpdateRef.current = now;

    // Update state
    setIsPlaying(data.isPlaying);
    setCurrentTime(data.currentTime);

    // Sync player
    if (playerRef.current) {
      const playerTime = playerRef.current.getCurrentTime();
      const timeDiff = Math.abs(playerTime - data.currentTime);

      // Only seek if difference is significant (> 1 second)
      if (timeDiff > 1) {
        console.log(`Syncing: player at ${playerTime}s, should be at ${data.currentTime}s`);
        playerRef.current.seekTo(data.currentTime, 'seconds');
      }
    }

    // Monitor connection quality based on update frequency
    if (timeSinceLastUpdate > 5000) {
      setConnectionQuality('poor');
    } else if (timeSinceLastUpdate > 2000) {
      setConnectionQuality('fair');
    } else {
      setConnectionQuality('good');
    }
  }, [userId]);

  const handleChatMessage = useCallback((data) => {
    console.log('Chat message received:', data);
    setChatMessages((prev) => [...prev, data.message]);
    
    // Auto-scroll to bottom
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  const handleUserJoined = useCallback((data) => {
    console.log('User joined:', data);
    setParticipants((prev) => {
      // Check if user already exists
      if (prev.some(p => p._id === data.user._id)) {
        return prev;
      }
      return [...prev, data.user];
    });
  }, []);

  const handleUserLeft = useCallback((data) => {
    console.log('User left:', data);
    setParticipants((prev) => prev.filter(p => p._id !== data.userId));
  }, []);

  const handleSessionEnded = useCallback((data) => {
    console.log('Session ended:', data);
    setError('This session has been ended by the host');
    setIsPlaying(false);
    onSessionEnded?.();
  }, [onSessionEnded]);

  const handleUrlChanged = useCallback((data) => {
    console.log('URL changed:', data);
    if (session) {
      setSession({
        ...session,
        url: data.newUrl,
        title: data.title,
        thumbnail: data.thumbnail,
        type: data.type,
      });
      setCurrentTime(0);
      setIsPlaying(false);
    }
  }, [session]);

  const handleSyncResponse = useCallback((data) => {
    console.log('Sync response:', data);
    setIsSyncing(false);
    setCurrentTime(data.currentTime);
    setIsPlaying(data.isPlaying);
    
    if (playerRef.current) {
      playerRef.current.seekTo(data.currentTime, 'seconds');
    }
  }, []);

  // Playback controls
  const handlePlayPause = useCallback(() => {
    if (!sessionId || !socketRef.current) return;

    const newIsPlaying = !isPlaying;
    const time = playerRef.current?.getCurrentTime() || currentTime;

    setIsPlaying(newIsPlaying);

    socketRef.current.emit('playbackControl', {
      sessionId,
      action: newIsPlaying ? 'play' : 'pause',
      currentTime: time,
      timestamp: new Date(),
    });
  }, [sessionId, isPlaying, currentTime]);

  const handleSeek = useCallback((newTime) => {
    if (!sessionId || !socketRef.current) return;

    setCurrentTime(newTime);

    socketRef.current.emit('playbackControl', {
      sessionId,
      action: 'seek',
      currentTime: newTime,
      timestamp: new Date(),
    });
  }, [sessionId]);

  // Handle clicking on chat message timestamp to seek video
  const handleTimestampClick = useCallback((timestamp) => {
    if (playerRef.current && timestamp >= 0) {
      handleSeek(timestamp);
      playerRef.current.seekTo(timestamp, 'seconds');
    }
  }, [handleSeek]);

  const handleProgress = useCallback((state) => {
    // Only update local state, don't broadcast
    setCurrentTime(state.playedSeconds);
  }, []);

  const handleDuration = useCallback((dur) => {
    setDuration(dur);
  }, []);

  // Chat functions
  const handleSendMessage = useCallback(() => {
    if (!chatInput.trim() || !sessionId || !socketRef.current) return;

    const timestamp = playerRef.current?.getCurrentTime() || currentTime;

    socketRef.current.emit('sendChatMessage', {
      sessionId,
      message: chatInput.trim(),
      timestamp,
    });

    setChatInput('');
  }, [chatInput, sessionId, currentTime]);

  // Sync function
  const handleSync = useCallback(() => {
    if (!sessionId || !socketRef.current) return;

    setIsSyncing(true);
    socketRef.current.emit('requestSync', { sessionId });

    // Timeout after 5 seconds
    syncTimeoutRef.current = setTimeout(() => {
      setIsSyncing(false);
    }, 5000);
  }, [sessionId]);

  // Adaptive quality control based on connection
  useEffect(() => {
    let qualityToSet = 'auto';
    
    switch (connectionQuality) {
      case 'poor':
        qualityToSet = 'small'; // 240p
        break;
      case 'fair':
        qualityToSet = 'medium'; // 360p
        break;
      case 'good':
        qualityToSet = 'auto'; // Let player decide
        break;
      default:
        qualityToSet = 'auto';
    }

    // Only auto-adjust if user hasn't manually selected a quality
    if (playbackQuality === 'auto') {
      setPlaybackQuality(qualityToSet);
    }
  }, [connectionQuality, playbackQuality]);

  // Handle quality change
  const handleQualityChange = useCallback((quality) => {
    setPlaybackQuality(quality);
    setShowQualityMenu(false);
    
    // For YouTube videos, we need to use the YouTube API
    if (playerRef.current && playerRef.current.getInternalPlayer) {
      const internalPlayer = playerRef.current.getInternalPlayer();
      if (internalPlayer && internalPlayer.setPlaybackQuality) {
        internalPlayer.setPlaybackQuality(quality);
      }
    }
  }, []);

  // Close quality menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (qualityMenuRef.current && !qualityMenuRef.current.contains(event.target)) {
        setShowQualityMenu(false);
      }
    };

    if (showQualityMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showQualityMenu]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  // Format time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Render loading state
  if (loading) {
    return (
      <Box className="video-player-loading">
        <CircularProgress />
        <Typography variant="body1" sx={{ mt: 2 }}>
          Loading video session...
        </Typography>
      </Box>
    );
  }

  // Render error state
  if (error && !session) {
    return (
      <Box className="video-player-error">
        <Alert severity="error">{error}</Alert>
        {onClose && (
          <Button onClick={onClose} sx={{ mt: 2 }}>
            Close
          </Button>
        )}
      </Box>
    );
  }

  return (
    <Box className="synchronized-video-player" ref={containerRef}>
      {/* Header */}
      <Box className="video-player-header">
        <Box className="video-player-title">
          <VideoLibrary sx={{ mr: 1 }} />
          <Typography variant="h6">{session?.title || 'Video Session'}</Typography>
          <Chip
            label={`${participants.length} watching`}
            size="small"
            icon={<People />}
            sx={{ ml: 2 }}
          />
          {connectionQuality !== 'good' && (
            <Chip
              label={connectionQuality}
              size="small"
              color={connectionQuality === 'poor' ? 'error' : 'warning'}
              sx={{ ml: 1 }}
            />
          )}
        </Box>
        <Box className="video-player-actions">
          <Tooltip title="Sync with session">
            <IconButton onClick={handleSync} disabled={isSyncing}>
              {isSyncing ? <CircularProgress size={24} /> : <Sync />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Participants">
            <IconButton onClick={() => setShowParticipants(!showParticipants)}>
              <People />
            </IconButton>
          </Tooltip>
          <Tooltip title="Chat">
            <IconButton onClick={() => setShowChat(!showChat)}>
              <Chat />
            </IconButton>
          </Tooltip>
          {onCollapse && (
            <Tooltip title="Collapse to mini player">
              <IconButton onClick={onCollapse}>
                <PictureInPictureAlt />
              </IconButton>
            </Tooltip>
          )}
          {onClose && (
            <IconButton onClick={onClose}>
              <Close />
            </IconButton>
          )}
        </Box>
      </Box>

      {error && (
        <Alert severity="warning" sx={{ m: 2 }}>
          {error}
        </Alert>
      )}

      <Box className="video-player-content">
        {/* Video Player */}
        <Box className="video-player-main" sx={{ position: 'relative' }}>
          <ReactPlayer
            ref={playerRef}
            url={normalizePlayableUrl(session?.url, session?.type)}
            playing={isPlaying}
            volume={volume}
            muted={muted}
            width="100%"
            height="100%"
            onProgress={handleProgress}
            onDuration={handleDuration}
            onError={(e) => setError('Video playback error')}
            config={{
              youtube: {
                playerVars: {
                  showinfo: 1,
                  modestbranding: 1,
                  playsinline: 1,
                  enablejsapi: 1,
                  origin: window.location.origin,
                },
              },
              file: {
                attributes: {
                  controlsList: 'nodownload',
                },
              },
            }}
          />

          {/* Video Annotations System */}
          {sessionId && (
            <VideoAnnotations
              sessionId={ensureStringId(sessionId) || ''}
              currentTime={currentTime}
              duration={duration}
              onSeek={handleSeek}
              videoWidth={playerRef.current?.wrapper?.clientWidth}
              videoHeight={playerRef.current?.wrapper?.clientHeight}
            />
          )}

          {/* Custom Controls */}
          <Box className="video-player-controls">
            <Box className="video-player-progress">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                className="progress-bar"
              />
              <Typography variant="caption" className="time-display">
                {formatTime(currentTime)} / {formatTime(duration)}
              </Typography>
            </Box>

            <Box className="video-player-buttons">
              <IconButton onClick={handlePlayPause} color="primary">
                {isPlaying ? <Pause /> : <PlayArrow />}
              </IconButton>

              <Box className="volume-control">
                <IconButton onClick={() => setMuted(!muted)} size="small">
                  {muted ? <VolumeOff /> : <VolumeUp />}
                </IconButton>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="volume-slider"
                />
              </Box>

              <Box sx={{ flexGrow: 1 }} />

              {/* Quality Control */}
              <Box sx={{ position: 'relative' }} ref={qualityMenuRef}>
                <Tooltip title={`Video Quality: ${playbackQuality === 'auto' ? 'Auto' : playbackQuality}`}>
                  <IconButton onClick={() => setShowQualityMenu(!showQualityMenu)}>
                    <Settings />
                  </IconButton>
                </Tooltip>
                {showQualityMenu && (
                  <Paper
                    sx={{
                      position: 'absolute',
                      bottom: '100%',
                      right: 0,
                      mb: 1,
                      minWidth: 150,
                      backgroundColor: 'rgba(0, 0, 0, 0.9)',
                      color: 'white',
                      zIndex: 1000,
                    }}
                  >
                    <List dense>
                      <ListItem>
                        <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'rgba(255,255,255,0.7)' }}>
                          Quality
                        </Typography>
                      </ListItem>
                      <Divider sx={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
                      {[
                        { value: 'auto', label: 'Auto' },
                        { value: 'hd1080', label: '1080p' },
                        { value: 'hd720', label: '720p' },
                        { value: 'large', label: '480p' },
                        { value: 'medium', label: '360p' },
                        { value: 'small', label: '240p' },
                      ].map((quality) => (
                        <ListItem key={quality.value} disablePadding>
                          <ListItemButton
                            onClick={() => handleQualityChange(quality.value)}
                            sx={{
                              '&:hover': {
                                backgroundColor: 'rgba(255,255,255,0.1)',
                              },
                            }}
                          >
                            <ListItemText
                              primary={quality.label}
                              sx={{ color: 'white' }}
                            />
                            {playbackQuality === quality.value && (
                              <ListItemIcon sx={{ minWidth: 'auto', ml: 1 }}>
                                <Check sx={{ color: 'primary.main', fontSize: 18 }} />
                              </ListItemIcon>
                            )}
                          </ListItemButton>
                        </ListItem>
                      ))}
                      <Divider sx={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
                      <ListItem>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem' }}>
                          Connection: {connectionQuality}
                        </Typography>
                      </ListItem>
                    </List>
                  </Paper>
                )}
              </Box>

              <IconButton onClick={toggleFullscreen}>
                {isFullscreen ? <FullscreenExit /> : <Fullscreen />}
              </IconButton>
            </Box>
          </Box>
        </Box>

        {/* Participants Panel */}
        {showParticipants && (
          <Paper className="video-player-panel participants-panel">
            <Typography variant="h6" sx={{ p: 2 }}>
              Participants ({participants.length})
            </Typography>
            <Divider />
            <List>
              {participants.map((participant) => (
                <ListItem key={participant._id}>
                  <ListItemAvatar>
                    <Avatar>{participant.name?.[0] || 'U'}</Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={participant.name}
                    secondary={
                      session?.host?._id === participant._id ? 'Host' : 'Participant'
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        )}

        {/* Chat Panel */}
        {showChat && (
          <Paper className="video-player-panel chat-panel">
            <Typography variant="h6" sx={{ p: 2 }}>
              Chat
            </Typography>
            <Divider />
            <Box className="chat-messages">
              {chatMessages.map((msg, index) => (
                <Box key={index} className="chat-message">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Tooltip title="Click to jump to this moment in the video">
                      <Chip
                        label={formatTime(msg.timestamp)}
                        size="small"
                        onClick={() => handleTimestampClick(msg.timestamp)}
                        sx={{
                          cursor: 'pointer',
                          fontSize: '0.7rem',
                          height: '20px',
                          '&:hover': {
                            backgroundColor: 'primary.main',
                            color: 'white',
                          },
                        }}
                      />
                    </Tooltip>
                    <Typography variant="caption" color="text.secondary">
                      {msg.userId?.name || 'Unknown'}
                    </Typography>
                  </Box>
                  <Typography variant="body2">{msg.message}</Typography>
                </Box>
              ))}
              <div ref={chatEndRef} />
            </Box>
            <Divider />
            <Box className="chat-input">
              <TextField
                fullWidth
                size="small"
                placeholder="Type a message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleSendMessage();
                  }
                }}
              />
              <Button onClick={handleSendMessage} variant="contained" sx={{ ml: 1 }}>
                Send
              </Button>
            </Box>
          </Paper>
        )}
      </Box>
    </Box>
  );
};

export default SynchronizedVideoPlayer;
