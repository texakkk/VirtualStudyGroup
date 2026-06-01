const express = require('express');
const mongoose = require('mongoose');
const VideoAnnotation = require('../models/VideoAnnotation');
const MediaSession = require('../models/MediaSession');
const GroupMember = require('../models/GroupMember');
const { authenticateUser } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @route   POST /api/video-annotations
 * @desc    Create a new video annotation
 * @access  Private
 */
router.post('/', authenticateUser, async (req, res) => {
  const { sessionId, timestamp, type, content, position } = req.body;

  if (!sessionId || timestamp === undefined || !content) {
    return res.status(400).json({
      success: false,
      message: 'Session ID, timestamp, and content are required'
    });
  }

  if (!['note', 'highlight', 'question'].includes(type)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid annotation type. Must be note, highlight, or question'
    });
  }

  try {
    // Verify the media session exists
    const mediaSession = await MediaSession.findById(sessionId);
    if (!mediaSession) {
      return res.status(404).json({
        success: false,
        message: 'Media session not found'
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

    // Create the annotation
    const annotation = new VideoAnnotation({
      VideoAnnotation_sessionId: sessionId,
      VideoAnnotation_timestamp: timestamp,
      VideoAnnotation_type: type || 'note',
      VideoAnnotation_content: content,
      VideoAnnotation_userId: req.user._id,
      VideoAnnotation_position: position || { x: 50, y: 50 }
    });

    await annotation.save();

    // Populate user information
    await annotation.populate('VideoAnnotation_userId', 'User_name User_email User_profilePicture');

    // Emit real-time event to all session participants
    const io = req.app.get('io');
    const mediaSessionNamespace = req.app.get('mediaSessionNamespace');
    if (mediaSessionNamespace) {
      mediaSessionNamespace.to(`media-session-${sessionId}`).emit('annotationCreated', {
        sessionId,
        annotation: {
          _id: annotation._id,
          timestamp: annotation.VideoAnnotation_timestamp,
          type: annotation.VideoAnnotation_type,
          content: annotation.VideoAnnotation_content,
          position: annotation.VideoAnnotation_position,
          user: {
            _id: annotation.VideoAnnotation_userId._id,
            name: annotation.VideoAnnotation_userId.User_name,
            profilePicture: annotation.VideoAnnotation_userId.User_profilePicture
          },
          createdAt: annotation.VideoAnnotation_createdAt
        }
      });
    }

    res.status(201).json({
      success: true,
      message: 'Annotation created successfully',
      annotation: {
        _id: annotation._id,
        sessionId: annotation.VideoAnnotation_sessionId,
        timestamp: annotation.VideoAnnotation_timestamp,
        type: annotation.VideoAnnotation_type,
        content: annotation.VideoAnnotation_content,
        position: annotation.VideoAnnotation_position,
        user: {
          _id: annotation.VideoAnnotation_userId._id,
          name: annotation.VideoAnnotation_userId.User_name,
          profilePicture: annotation.VideoAnnotation_userId.User_profilePicture
        },
        isResolved: annotation.VideoAnnotation_isResolved,
        replies: annotation.VideoAnnotation_replies,
        createdAt: annotation.VideoAnnotation_createdAt
      }
    });
  } catch (error) {
    console.error('Create annotation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create annotation',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/video-annotations/session/:sessionId
 * @desc    Get all annotations for a media session
 * @access  Private
 */
router.get('/session/:sessionId', authenticateUser, async (req, res) => {
  const { sessionId } = req.params;
  const { type, userId, startTime, endTime } = req.query;

  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid session ID'
    });
  }

  try {
    // Verify the media session exists
    const mediaSession = await MediaSession.findById(sessionId);
    if (!mediaSession) {
      return res.status(404).json({
        success: false,
        message: 'Media session not found'
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

    // Build query options
    const options = {};
    if (type) options.type = type;
    if (userId) options.userId = userId;
    if (startTime !== undefined && endTime !== undefined) {
      options.startTime = parseFloat(startTime);
      options.endTime = parseFloat(endTime);
    }

    // Get annotations
    const annotations = await VideoAnnotation.findBySession(sessionId, options);

    const formattedAnnotations = annotations.map(annotation => ({
      _id: annotation._id,
      sessionId: annotation.VideoAnnotation_sessionId,
      timestamp: annotation.VideoAnnotation_timestamp,
      type: annotation.VideoAnnotation_type,
      content: annotation.VideoAnnotation_content,
      position: annotation.VideoAnnotation_position,
      user: {
        _id: annotation.VideoAnnotation_userId._id,
        name: annotation.VideoAnnotation_userId.User_name,
        profilePicture: annotation.VideoAnnotation_userId.User_profilePicture
      },
      isResolved: annotation.VideoAnnotation_isResolved,
      replies: annotation.VideoAnnotation_replies.map(reply => ({
        _id: reply._id,
        user: {
          _id: reply.userId._id,
          name: reply.userId.User_name,
          profilePicture: reply.userId.User_profilePicture
        },
        content: reply.content,
        createdAt: reply.createdAt
      })),
      createdAt: annotation.VideoAnnotation_createdAt,
      updatedAt: annotation.VideoAnnotation_updatedAt
    }));

    res.status(200).json({
      success: true,
      annotations: formattedAnnotations,
      total: formattedAnnotations.length
    });
  } catch (error) {
    console.error('Get annotations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get annotations',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/video-annotations/:annotationId
 * @desc    Get a specific annotation by ID
 * @access  Private
 */
router.get('/:annotationId', authenticateUser, async (req, res) => {
  const { annotationId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(annotationId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid annotation ID'
    });
  }

  try {
    const annotation = await VideoAnnotation.findById(annotationId)
      .populate('VideoAnnotation_userId', 'User_name User_email User_profilePicture')
      .populate('VideoAnnotation_replies.userId', 'User_name User_email User_profilePicture')
      .populate('VideoAnnotation_sessionId', 'MediaSession_groupId');

    if (!annotation) {
      return res.status(404).json({
        success: false,
        message: 'Annotation not found'
      });
    }

    // Verify user is a member of the group
    const groupMember = await GroupMember.findOne({
      GroupMember_groupId: annotation.VideoAnnotation_sessionId.MediaSession_groupId,
      GroupMember_userId: req.user._id
    });

    if (!groupMember) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this group'
      });
    }

    res.status(200).json({
      success: true,
      annotation: {
        _id: annotation._id,
        sessionId: annotation.VideoAnnotation_sessionId._id,
        timestamp: annotation.VideoAnnotation_timestamp,
        type: annotation.VideoAnnotation_type,
        content: annotation.VideoAnnotation_content,
        position: annotation.VideoAnnotation_position,
        user: {
          _id: annotation.VideoAnnotation_userId._id,
          name: annotation.VideoAnnotation_userId.User_name,
          profilePicture: annotation.VideoAnnotation_userId.User_profilePicture
        },
        isResolved: annotation.VideoAnnotation_isResolved,
        replies: annotation.VideoAnnotation_replies.map(reply => ({
          _id: reply._id,
          user: {
            _id: reply.userId._id,
            name: reply.userId.User_name,
            profilePicture: reply.userId.User_profilePicture
          },
          content: reply.content,
          createdAt: reply.createdAt
        })),
        createdAt: annotation.VideoAnnotation_createdAt,
        updatedAt: annotation.VideoAnnotation_updatedAt
      }
    });
  } catch (error) {
    console.error('Get annotation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get annotation',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/video-annotations/:annotationId
 * @desc    Update an annotation
 * @access  Private
 */
router.put('/:annotationId', authenticateUser, async (req, res) => {
  const { annotationId } = req.params;
  const { content, type, position } = req.body;

  if (!mongoose.Types.ObjectId.isValid(annotationId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid annotation ID'
    });
  }

  try {
    const annotation = await VideoAnnotation.findById(annotationId)
      .populate('VideoAnnotation_sessionId', 'MediaSession_groupId');

    if (!annotation) {
      return res.status(404).json({
        success: false,
        message: 'Annotation not found'
      });
    }

    // Only the creator can update the annotation
    if (!annotation.VideoAnnotation_userId.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own annotations'
      });
    }

    // Update fields
    if (content) annotation.VideoAnnotation_content = content;
    if (type && ['note', 'highlight', 'question'].includes(type)) {
      annotation.VideoAnnotation_type = type;
    }
    if (position) annotation.VideoAnnotation_position = position;

    await annotation.save();
    await annotation.populate('VideoAnnotation_userId', 'User_name User_email User_profilePicture');

    // Emit real-time update
    const mediaSessionNamespace = req.app.get('mediaSessionNamespace');
    if (mediaSessionNamespace) {
      mediaSessionNamespace.to(`media-session-${annotation.VideoAnnotation_sessionId._id}`).emit('annotationUpdated', {
        sessionId: annotation.VideoAnnotation_sessionId._id,
        annotation: {
          _id: annotation._id,
          timestamp: annotation.VideoAnnotation_timestamp,
          type: annotation.VideoAnnotation_type,
          content: annotation.VideoAnnotation_content,
          position: annotation.VideoAnnotation_position,
          updatedAt: annotation.VideoAnnotation_updatedAt
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Annotation updated successfully',
      annotation: {
        _id: annotation._id,
        content: annotation.VideoAnnotation_content,
        type: annotation.VideoAnnotation_type,
        position: annotation.VideoAnnotation_position,
        updatedAt: annotation.VideoAnnotation_updatedAt
      }
    });
  } catch (error) {
    console.error('Update annotation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update annotation',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/video-annotations/:annotationId
 * @desc    Delete an annotation
 * @access  Private
 */
router.delete('/:annotationId', authenticateUser, async (req, res) => {
  const { annotationId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(annotationId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid annotation ID'
    });
  }

  try {
    const annotation = await VideoAnnotation.findById(annotationId)
      .populate('VideoAnnotation_sessionId', 'MediaSession_groupId');

    if (!annotation) {
      return res.status(404).json({
        success: false,
        message: 'Annotation not found'
      });
    }

    // Only the creator can delete the annotation
    if (!annotation.VideoAnnotation_userId.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own annotations'
      });
    }

    const sessionId = annotation.VideoAnnotation_sessionId._id;
    await VideoAnnotation.findByIdAndDelete(annotationId);

    // Emit real-time deletion event
    const mediaSessionNamespace = req.app.get('mediaSessionNamespace');
    if (mediaSessionNamespace) {
      mediaSessionNamespace.to(`media-session-${sessionId}`).emit('annotationDeleted', {
        sessionId,
        annotationId,
        deletedBy: req.user._id
      });
    }

    res.status(200).json({
      success: true,
      message: 'Annotation deleted successfully'
    });
  } catch (error) {
    console.error('Delete annotation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete annotation',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/video-annotations/:annotationId/reply
 * @desc    Add a reply to an annotation
 * @access  Private
 */
router.post('/:annotationId/reply', authenticateUser, async (req, res) => {
  const { annotationId } = req.params;
  const { content } = req.body;

  if (!mongoose.Types.ObjectId.isValid(annotationId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid annotation ID'
    });
  }

  if (!content || !content.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Reply content is required'
    });
  }

  try {
    const annotation = await VideoAnnotation.findById(annotationId)
      .populate('VideoAnnotation_sessionId', 'MediaSession_groupId');

    if (!annotation) {
      return res.status(404).json({
        success: false,
        message: 'Annotation not found'
      });
    }

    // Verify user is a member of the group
    const groupMember = await GroupMember.findOne({
      GroupMember_groupId: annotation.VideoAnnotation_sessionId.MediaSession_groupId,
      GroupMember_userId: req.user._id
    });

    if (!groupMember) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this group'
      });
    }

    // Add reply
    await annotation.addReply(req.user._id, content);
    await annotation.populate('VideoAnnotation_replies.userId', 'User_name User_email User_profilePicture');

    const newReply = annotation.VideoAnnotation_replies[annotation.VideoAnnotation_replies.length - 1];

    // Emit real-time reply event
    const mediaSessionNamespace = req.app.get('mediaSessionNamespace');
    if (mediaSessionNamespace) {
      mediaSessionNamespace.to(`media-session-${annotation.VideoAnnotation_sessionId._id}`).emit('annotationReply', {
        sessionId: annotation.VideoAnnotation_sessionId._id,
        annotationId: annotation._id,
        reply: {
          _id: newReply._id,
          user: {
            _id: newReply.userId._id,
            name: newReply.userId.User_name,
            profilePicture: newReply.userId.User_profilePicture
          },
          content: newReply.content,
          createdAt: newReply.createdAt
        }
      });
    }

    res.status(201).json({
      success: true,
      message: 'Reply added successfully',
      reply: {
        _id: newReply._id,
        user: {
          _id: newReply.userId._id,
          name: newReply.userId.User_name,
          profilePicture: newReply.userId.User_profilePicture
        },
        content: newReply.content,
        createdAt: newReply.createdAt
      }
    });
  } catch (error) {
    console.error('Add reply error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add reply',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/video-annotations/:annotationId/resolve
 * @desc    Toggle resolved status of an annotation
 * @access  Private
 */
router.post('/:annotationId/resolve', authenticateUser, async (req, res) => {
  const { annotationId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(annotationId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid annotation ID'
    });
  }

  try {
    const annotation = await VideoAnnotation.findById(annotationId)
      .populate('VideoAnnotation_sessionId', 'MediaSession_groupId');

    if (!annotation) {
      return res.status(404).json({
        success: false,
        message: 'Annotation not found'
      });
    }

    // Verify user is a member of the group
    const groupMember = await GroupMember.findOne({
      GroupMember_groupId: annotation.VideoAnnotation_sessionId.MediaSession_groupId,
      GroupMember_userId: req.user._id
    });

    if (!groupMember) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this group'
      });
    }

    // Toggle resolved status
    await annotation.toggleResolved();

    // Emit real-time update
    const mediaSessionNamespace = req.app.get('mediaSessionNamespace');
    if (mediaSessionNamespace) {
      mediaSessionNamespace.to(`media-session-${annotation.VideoAnnotation_sessionId._id}`).emit('annotationResolved', {
        sessionId: annotation.VideoAnnotation_sessionId._id,
        annotationId: annotation._id,
        isResolved: annotation.VideoAnnotation_isResolved,
        resolvedBy: req.user._id
      });
    }

    res.status(200).json({
      success: true,
      message: `Annotation ${annotation.VideoAnnotation_isResolved ? 'resolved' : 'reopened'} successfully`,
      isResolved: annotation.VideoAnnotation_isResolved
    });
  } catch (error) {
    console.error('Toggle resolve error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle resolved status',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/video-annotations/user/my-annotations
 * @desc    Get all annotations created by the current user
 * @access  Private
 */
router.get('/user/my-annotations', authenticateUser, async (req, res) => {
  const { limit = 50 } = req.query;

  try {
    const annotations = await VideoAnnotation.findByUser(req.user._id, parseInt(limit));

    const formattedAnnotations = annotations.map(annotation => ({
      _id: annotation._id,
      session: {
        _id: annotation.VideoAnnotation_sessionId._id,
        title: annotation.VideoAnnotation_sessionId.MediaSession_title,
        url: annotation.VideoAnnotation_sessionId.MediaSession_url,
        groupId: annotation.VideoAnnotation_sessionId.MediaSession_groupId
      },
      timestamp: annotation.VideoAnnotation_timestamp,
      type: annotation.VideoAnnotation_type,
      content: annotation.VideoAnnotation_content,
      position: annotation.VideoAnnotation_position,
      isResolved: annotation.VideoAnnotation_isResolved,
      repliesCount: annotation.VideoAnnotation_replies.length,
      createdAt: annotation.VideoAnnotation_createdAt
    }));

    res.status(200).json({
      success: true,
      annotations: formattedAnnotations,
      total: formattedAnnotations.length
    });
  } catch (error) {
    console.error('Get user annotations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user annotations',
      error: error.message
    });
  }
});

module.exports = router;
