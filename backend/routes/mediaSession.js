const express = require('express');
const mongoose = require('mongoose');
const MediaSession = require('../models/MediaSession');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const youtubeService = require('../services/youtubeService');
const { authenticateUser } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @route   POST /api/media-sessions/create
 * @desc    Create a new media session for synchronized video watching
 * @access  Private
 */
router.post('/create', authenticateUser, async (req, res) => {
  const { groupId, url, title, thumbnail } = req.body;

  if (!groupId || !url) {
    return res.status(400).json({
      success: false,
      message: 'Group ID and media URL are required'
    });
  }

  // Validate groupId format
  const trimmedGroupId = typeof groupId === 'string' ? groupId.trim() : groupId;
  if (!mongoose.Types.ObjectId.isValid(trimmedGroupId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid group ID format'
    });
  }

  try {
    // Verify user is a member of the group
    const groupMember = await GroupMember.findOne({
      GroupMember_groupId: trimmedGroupId,
      GroupMember_userId: req.user._id
    });

    if (!groupMember) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this group'
      });
    }

    // Check if there's already an active session for this group
    const existingSession = await MediaSession.findActiveByGroup(trimmedGroupId);
    if (existingSession) {
      return res.status(409).json({
        success: false,
        message: 'An active media session already exists for this group',
        sessionId: existingSession._id
      });
    }

    // Validate and get media metadata
    let mediaMetadata = null;
    try {
      mediaMetadata = await youtubeService.validateMediaSessionUrl(url);
      if (!mediaMetadata.isValid) {
        return res.status(400).json({
          success: false,
          message: mediaMetadata.error || 'Invalid media URL'
        });
      }
    } catch (error) {
      console.warn('Media validation failed, proceeding with basic validation:', error.message);
    }

    // Create new media session
    const mediaSession = new MediaSession({
      MediaSession_groupId: trimmedGroupId,
      MediaSession_url: url,
      MediaSession_title: title || (mediaMetadata?.title) || 'Media Session',
      MediaSession_thumbnail: thumbnail || (mediaMetadata?.thumbnail),
      MediaSession_duration: mediaMetadata?.duration,
      MediaSession_host: req.user._id,
      MediaSession_participants: [req.user._id],
      MediaSession_status: 'active'
    });

    await mediaSession.save();

    // Populate the response
    await mediaSession.populate([
      { path: 'MediaSession_host', select: 'User_name User_email' },
      { path: 'MediaSession_participants', select: 'User_name User_email' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Media session created successfully',
      session: {
        _id: mediaSession._id,
        groupId: mediaSession.MediaSession_groupId,
        url: mediaSession.MediaSession_url,
        type: mediaSession.MediaSession_type,
        title: mediaSession.MediaSession_title,
        thumbnail: mediaSession.MediaSession_thumbnail,
        host: {
          _id: mediaSession.MediaSession_host._id,
          name: mediaSession.MediaSession_host.User_name
        },
        participants: mediaSession.MediaSession_participants.map(p => ({
          _id: p._id,
          name: p.User_name
        })),
        currentTime: mediaSession.MediaSession_currentTime,
        isPlaying: mediaSession.MediaSession_isPlaying,
        status: mediaSession.MediaSession_status,
        createdAt: mediaSession.MediaSession_createdAt
      }
    });
  } catch (error) {
    console.error('Create media session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create media session',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/media-sessions/search/youtube
 * @desc    Search YouTube videos for quick media-session creation
 * @access  Private
 */
router.get('/search/youtube', authenticateUser, async (req, res) => {
  const { q, limit = 8 } = req.query;

  if (!q || !String(q).trim()) {
    return res.status(400).json({
      success: false,
      message: 'Search query is required'
    });
  }

  try {
    if (!process.env.YOUTUBE_API_KEY) {
      return res.status(503).json({
        success: false,
        message: 'YouTube search is not configured on the server (missing YOUTUBE_API_KEY).'
      });
    }

    const maxResults = Math.max(1, Math.min(parseInt(limit, 10) || 8, 15));
    const results = await youtubeService.searchVideos(String(q).trim(), maxResults);
    return res.status(200).json(results);
  } catch (error) {
    return res.status(503).json({
      success: false,
      message: error.message || 'YouTube search is not available right now'
    });
  }
});

/**
 * @route   POST /api/media-sessions/:sessionId/join
 * @desc    Join an existing media session
 * @access  Private
 */
router.post('/:sessionId/join', authenticateUser, async (req, res) => {
  const { sessionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid session ID'
    });
  }

  try {
    const mediaSession = await MediaSession.findById(sessionId)
      .populate('MediaSession_host', 'User_name User_email')
      .populate('MediaSession_participants', 'User_name User_email');

    if (!mediaSession || mediaSession.MediaSession_status !== 'active') {
      return res.status(404).json({
        success: false,
        message: 'Active media session not found'
      });
    }

    // Verify user is a member of the group
    const groupMember = await GroupMember.findOne({
      GroupMember_groupId: mediaSession.MediaSession_groupId,
      GroupMember_userId: req.user._id
    });

    if (!groupMember) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this group'
      });
    }

    // Add user to participants if not already present
    if (!mediaSession.MediaSession_participants.some(p => p._id.equals(req.user._id))) {
      await mediaSession.addParticipant(req.user._id);
      await mediaSession.populate('MediaSession_participants', 'User_name User_email');
    }

    res.status(200).json({
      success: true,
      message: 'Successfully joined media session',
      session: {
        _id: mediaSession._id,
        groupId: mediaSession.MediaSession_groupId,
        url: mediaSession.MediaSession_url,
        type: mediaSession.MediaSession_type,
        title: mediaSession.MediaSession_title,
        thumbnail: mediaSession.MediaSession_thumbnail,
        host: {
          _id: mediaSession.MediaSession_host._id,
          name: mediaSession.MediaSession_host.User_name
        },
        participants: mediaSession.MediaSession_participants.map(p => ({
          _id: p._id,
          name: p.User_name
        })),
        currentTime: mediaSession.MediaSession_currentTime,
        isPlaying: mediaSession.MediaSession_isPlaying,
        status: mediaSession.MediaSession_status,
        chatMessages: mediaSession.MediaSession_chatMessages.slice(-50) // Last 50 messages
      }
    });
  } catch (error) {
    console.error('Join media session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to join media session',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/media-sessions/:sessionId/leave
 * @desc    Leave a media session
 * @access  Private
 */
router.post('/:sessionId/leave', authenticateUser, async (req, res) => {
  const { sessionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid session ID'
    });
  }

  try {
    const mediaSession = await MediaSession.findById(sessionId);

    if (!mediaSession) {
      return res.status(404).json({
        success: false,
        message: 'Media session not found'
      });
    }

    // Remove user from participants
    await mediaSession.removeParticipant(req.user._id);

    // If host leaves and there are other participants, transfer host to first participant
    if (mediaSession.MediaSession_host.equals(req.user._id) && mediaSession.MediaSession_participants.length > 0) {
      mediaSession.MediaSession_host = mediaSession.MediaSession_participants[0];
      await mediaSession.save();
    }

    // If no participants left, end the session
    if (mediaSession.MediaSession_participants.length === 0) {
      await mediaSession.endSession();
    }

    res.status(200).json({
      success: true,
      message: 'Successfully left media session'
    });
  } catch (error) {
    console.error('Leave media session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to leave media session',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/media-sessions/:sessionId/control
 * @desc    Control media playback (play, pause, seek)
 * @access  Private
 */
router.post('/:sessionId/control', authenticateUser, async (req, res) => {
  const { sessionId } = req.params;
  const { action, currentTime } = req.body;

  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid session ID'
    });
  }

  if (!['play', 'pause', 'seek'].includes(action)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid action. Must be play, pause, or seek'
    });
  }

  if (action === 'seek' && (typeof currentTime !== 'number' || currentTime < 0)) {
    return res.status(400).json({
      success: false,
      message: 'Valid current time is required for seek action'
    });
  }

  try {
    const mediaSession = await MediaSession.findById(sessionId);

    if (!mediaSession || mediaSession.MediaSession_status !== 'active') {
      return res.status(404).json({
        success: false,
        message: 'Active media session not found'
      });
    }

    // Verify user is a participant
    if (!mediaSession.MediaSession_participants.includes(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this session'
      });
    }

    // Update playback state based on action
    let newCurrentTime = mediaSession.MediaSession_currentTime;
    let newIsPlaying = mediaSession.MediaSession_isPlaying;

    switch (action) {
      case 'play':
        newIsPlaying = true;
        if (typeof currentTime === 'number') {
          newCurrentTime = currentTime;
        }
        break;
      case 'pause':
        newIsPlaying = false;
        if (typeof currentTime === 'number') {
          newCurrentTime = currentTime;
        }
        break;
      case 'seek':
        newCurrentTime = currentTime;
        // Keep current playing state
        break;
    }

    await mediaSession.updatePlaybackState(newCurrentTime, newIsPlaying);

    // Emit real-time update to all participants (will be handled by socket)
    const io = req.app.get('io');
    if (io) {
      io.to(`media-session-${sessionId}`).emit('playbackUpdate', {
        sessionId,
        action,
        currentTime: newCurrentTime,
        isPlaying: newIsPlaying,
        updatedBy: {
          _id: req.user._id,
          name: req.user.User_name
        },
        timestamp: new Date()
      });
    }

    res.status(200).json({
      success: true,
      message: `Media ${action} successful`,
      playbackState: {
        currentTime: newCurrentTime,
        isPlaying: newIsPlaying,
        action,
        updatedAt: mediaSession.MediaSession_updatedAt
      }
    });
  } catch (error) {
    console.error('Media control error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to control media playback',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/media-sessions/group/:groupId
 * @desc    Get active media session for a group
 * @access  Private
 */
router.get('/group/:groupId', authenticateUser, async (req, res) => {
  const { groupId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid group ID'
    });
  }

  try {
    // Verify user is a member of the group
    const groupMember = await GroupMember.findOne({
      GroupMember_groupId: groupId,
      GroupMember_userId: req.user._id
    });

    if (!groupMember) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this group'
      });
    }

    const mediaSession = await MediaSession.findActiveByGroup(groupId);

    if (!mediaSession) {
      return res.status(200).json({
        success: true,
        activeSession: false,
        message: 'No active media session found'
      });
    }

    res.status(200).json({
      success: true,
      activeSession: true,
      session: {
        _id: mediaSession._id,
        groupId: mediaSession.MediaSession_groupId,
        url: mediaSession.MediaSession_url,
        type: mediaSession.MediaSession_type,
        title: mediaSession.MediaSession_title,
        thumbnail: mediaSession.MediaSession_thumbnail,
        host: {
          _id: mediaSession.MediaSession_host._id,
          name: mediaSession.MediaSession_host.User_name
        },
        participants: mediaSession.MediaSession_participants.map(p => ({
          _id: p._id,
          name: p.User_name
        })),
        currentTime: mediaSession.MediaSession_currentTime,
        isPlaying: mediaSession.MediaSession_isPlaying,
        status: mediaSession.MediaSession_status,
        createdAt: mediaSession.MediaSession_createdAt,
        chatMessages: mediaSession.MediaSession_chatMessages.slice(-50) // Last 50 messages
      }
    });
  } catch (error) {
    console.error('Get media session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get media session',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/media-sessions/:sessionId/chat
 * @desc    Send a timestamped chat message during media session
 * @access  Private
 */
router.post('/:sessionId/chat', authenticateUser, async (req, res) => {
  const { sessionId } = req.params;
  const { message, timestamp } = req.body;

  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid session ID'
    });
  }

  if (!message || !message.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Message content is required'
    });
  }

  try {
    const mediaSession = await MediaSession.findById(sessionId);

    if (!mediaSession || mediaSession.MediaSession_status !== 'active') {
      return res.status(404).json({
        success: false,
        message: 'Active media session not found'
      });
    }

    // Verify user is a participant
    if (!mediaSession.MediaSession_participants.includes(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this session'
      });
    }

    // Add chat message with timestamp
    const messageTimestamp = typeof timestamp === 'number' ? timestamp : mediaSession.MediaSession_currentTime;
    await mediaSession.addChatMessage(req.user._id, message, messageTimestamp);

    const newMessage = mediaSession.MediaSession_chatMessages[mediaSession.MediaSession_chatMessages.length - 1];

    // Emit real-time chat message to all participants
    const io = req.app.get('io');
    if (io) {
      io.to(`media-session-${sessionId}`).emit('chatMessage', {
        sessionId,
        message: {
          _id: newMessage._id,
          timestamp: newMessage.timestamp,
          userId: {
            _id: req.user._id,
            name: req.user.User_name
          },
          message: newMessage.message,
          createdAt: newMessage.createdAt
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Chat message sent successfully',
      chatMessage: {
        _id: newMessage._id,
        timestamp: newMessage.timestamp,
        userId: {
          _id: req.user._id,
          name: req.user.User_name
        },
        message: newMessage.message,
        createdAt: newMessage.createdAt
      }
    });
  } catch (error) {
    console.error('Send chat message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send chat message',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/media-sessions/:sessionId/end
 * @desc    End a media session
 * @access  Private
 */
router.post('/:sessionId/end', authenticateUser, async (req, res) => {
  const { sessionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid session ID'
    });
  }

  try {
    const mediaSession = await MediaSession.findById(sessionId);

    if (!mediaSession) {
      return res.status(404).json({
        success: false,
        message: 'Media session not found'
      });
    }

    // Only host can end the session
    if (!mediaSession.MediaSession_host.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Only the host can end this session'
      });
    }

    await mediaSession.endSession();

    // Emit session end to all participants
    const io = req.app.get('io');
    if (io) {
      io.to(`media-session-${sessionId}`).emit('sessionEnded', {
        sessionId,
        endedBy: {
          _id: req.user._id,
          name: req.user.User_name
        },
        endedAt: mediaSession.MediaSession_updatedAt
      });
    }

    res.status(200).json({
      success: true,
      message: 'Media session ended successfully',
      endedAt: mediaSession.MediaSession_updatedAt
    });
  } catch (error) {
    console.error('End media session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end media session',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/media-sessions/group/:groupId/history
 * @desc    Get media session history for a group
 * @access  Private
 */
router.get('/group/:groupId/history', authenticateUser, async (req, res) => {
  const { groupId } = req.params;
  const { limit = 10 } = req.query;

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid group ID'
    });
  }

  try {
    // Verify user is a member of the group
    const groupMember = await GroupMember.findOne({
      GroupMember_groupId: groupId,
      GroupMember_userId: req.user._id
    });

    if (!groupMember) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this group'
      });
    }

    const sessions = await MediaSession.findByGroupWithHistory(groupId, parseInt(limit));

    const sessionHistory = sessions.map(session => ({
      _id: session._id,
      url: session.MediaSession_url,
      type: session.MediaSession_type,
      title: session.MediaSession_title,
      thumbnail: session.MediaSession_thumbnail,
      host: {
        _id: session.MediaSession_host._id,
        name: session.MediaSession_host.User_name
      },
      participantCount: session.MediaSession_participants.length,
      status: session.MediaSession_status,
      duration: session.MediaSession_duration,
      createdAt: session.MediaSession_createdAt,
      updatedAt: session.MediaSession_updatedAt
    }));

    res.status(200).json({
      success: true,
      sessions: sessionHistory,
      total: sessionHistory.length
    });
  } catch (error) {
    console.error('Get session history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get session history',
      error: error.message
    });
  }
});

module.exports = router;
