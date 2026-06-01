const MediaSession = require('../models/MediaSession');
const GroupMember = require('../models/GroupMember');

const setupMediaSessionSockets = (io) => {
  // Create a namespace for media sessions
  const mediaSessionNamespace = io.of('/media-sessions');

  mediaSessionNamespace.on('connection', (socket) => {
    console.log(`Media session socket connected: ${socket.id}`);

    // Join a media session room
    socket.on('joinSession', async ({ sessionId, userId }) => {
      try {
        if (!sessionId || !userId) {
          socket.emit('error', { message: 'Session ID and User ID are required' });
          return;
        }

        // Verify the session exists and user is a participant
        const mediaSession = await MediaSession.findById(sessionId)
          .populate('MediaSession_host', 'User_name')
          .populate('MediaSession_participants', 'User_name');

        if (!mediaSession || mediaSession.MediaSession_status !== 'active') {
          socket.emit('error', { message: 'Active media session not found' });
          return;
        }

        // Check if user is a participant
        const isParticipant = mediaSession.MediaSession_participants.some(p => 
          p._id.toString() === userId.toString()
        );

        if (!isParticipant) {
          socket.emit('error', { message: 'You are not a participant in this session' });
          return;
        }

        // Join the session room
        const roomName = `media-session-${sessionId}`;
        socket.join(roomName);
        socket.sessionId = sessionId;
        socket.userId = userId;

        console.log(`User ${userId} joined media session ${sessionId}`);

        // Send current session state to the joining user
        socket.emit('sessionState', {
          sessionId,
          currentTime: mediaSession.MediaSession_currentTime,
          isPlaying: mediaSession.MediaSession_isPlaying,
          url: mediaSession.MediaSession_url,
          type: mediaSession.MediaSession_type,
          title: mediaSession.MediaSession_title,
          host: {
            _id: mediaSession.MediaSession_host._id,
            name: mediaSession.MediaSession_host.User_name
          },
          participants: mediaSession.MediaSession_participants.map(p => ({
            _id: p._id,
            name: p.User_name
          })),
          chatMessages: mediaSession.MediaSession_chatMessages.slice(-50) // Last 50 messages
        });

        // Notify other participants that someone joined
        socket.to(roomName).emit('userJoined', {
          sessionId,
          user: {
            _id: userId,
            name: mediaSession.MediaSession_participants.find(p => 
              p._id.toString() === userId.toString()
            )?.User_name || 'Unknown User'
          },
          timestamp: new Date()
        });

      } catch (error) {
        console.error('Join session error:', error);
        socket.emit('error', { message: 'Failed to join session' });
      }
    });

    // Handle playback control events (play, pause, seek)
    socket.on('playbackControl', async ({ sessionId, action, currentTime, timestamp }) => {
      try {
        if (!sessionId || !action) {
          socket.emit('error', { message: 'Session ID and action are required' });
          return;
        }

        if (!['play', 'pause', 'seek'].includes(action)) {
          socket.emit('error', { message: 'Invalid action' });
          return;
        }

        const mediaSession = await MediaSession.findById(sessionId);
        if (!mediaSession || mediaSession.MediaSession_status !== 'active') {
          socket.emit('error', { message: 'Active media session not found' });
          return;
        }

        // Verify user is a participant
        if (!mediaSession.MediaSession_participants.includes(socket.userId)) {
          socket.emit('error', { message: 'You are not a participant in this session' });
          return;
        }

        // Update session state
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
            if (typeof currentTime === 'number') {
              newCurrentTime = currentTime;
            }
            break;
        }

        await mediaSession.updatePlaybackState(newCurrentTime, newIsPlaying);

        // Broadcast to all participants in the session
        const roomName = `media-session-${sessionId}`;
        mediaSessionNamespace.to(roomName).emit('playbackUpdate', {
          sessionId,
          action,
          currentTime: newCurrentTime,
          isPlaying: newIsPlaying,
          updatedBy: socket.userId,
          timestamp: timestamp || new Date(),
          serverTimestamp: new Date()
        });

        console.log(`Playback ${action} in session ${sessionId} by user ${socket.userId}`);

      } catch (error) {
        console.error('Playback control error:', error);
        socket.emit('error', { message: 'Failed to control playback' });
      }
    });

    // Handle chat messages during media session
    socket.on('sendChatMessage', async ({ sessionId, message, timestamp }) => {
      try {
        if (!sessionId || !message || !message.trim()) {
          socket.emit('error', { message: 'Session ID and message are required' });
          return;
        }

        const mediaSession = await MediaSession.findById(sessionId);
        if (!mediaSession || mediaSession.MediaSession_status !== 'active') {
          socket.emit('error', { message: 'Active media session not found' });
          return;
        }

        // Verify user is a participant
        if (!mediaSession.MediaSession_participants.includes(socket.userId)) {
          socket.emit('error', { message: 'You are not a participant in this session' });
          return;
        }

        // Add chat message with timestamp
        const messageTimestamp = typeof timestamp === 'number' ? timestamp : mediaSession.MediaSession_currentTime;
        await mediaSession.addChatMessage(socket.userId, message, messageTimestamp);

        const newMessage = mediaSession.MediaSession_chatMessages[mediaSession.MediaSession_chatMessages.length - 1];

        // Broadcast chat message to all participants
        const roomName = `media-session-${sessionId}`;
        mediaSessionNamespace.to(roomName).emit('chatMessage', {
          sessionId,
          message: {
            _id: newMessage._id,
            timestamp: newMessage.timestamp,
            userId: newMessage.userId,
            message: newMessage.message,
            createdAt: newMessage.createdAt
          }
        });

        console.log(`Chat message sent in session ${sessionId} by user ${socket.userId}`);

      } catch (error) {
        console.error('Send chat message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle user leaving session
    socket.on('leaveSession', async ({ sessionId }) => {
      try {
        if (!sessionId) {
          socket.emit('error', { message: 'Session ID is required' });
          return;
        }

        const roomName = `media-session-${sessionId}`;
        socket.leave(roomName);

        // Notify other participants
        socket.to(roomName).emit('userLeft', {
          sessionId,
          userId: socket.userId,
          timestamp: new Date()
        });

        console.log(`User ${socket.userId} left media session ${sessionId}`);

      } catch (error) {
        console.error('Leave session error:', error);
        socket.emit('error', { message: 'Failed to leave session' });
      }
    });

    // Handle session ending
    socket.on('endSession', async ({ sessionId }) => {
      try {
        if (!sessionId) {
          socket.emit('error', { message: 'Session ID is required' });
          return;
        }

        const mediaSession = await MediaSession.findById(sessionId);
        if (!mediaSession) {
          socket.emit('error', { message: 'Media session not found' });
          return;
        }

        // Only host can end the session
        if (!mediaSession.MediaSession_host.equals(socket.userId)) {
          socket.emit('error', { message: 'Only the host can end this session' });
          return;
        }

        await mediaSession.endSession();

        // Notify all participants that session ended
        const roomName = `media-session-${sessionId}`;
        mediaSessionNamespace.to(roomName).emit('sessionEnded', {
          sessionId,
          endedBy: socket.userId,
          endedAt: new Date()
        });

        console.log(`Media session ${sessionId} ended by host ${socket.userId}`);

      } catch (error) {
        console.error('End session error:', error);
        socket.emit('error', { message: 'Failed to end session' });
      }
    });

    // Handle URL changes (for switching videos)
    socket.on('changeUrl', async ({ sessionId, newUrl, title, thumbnail }) => {
      try {
        if (!sessionId || !newUrl) {
          socket.emit('error', { message: 'Session ID and URL are required' });
          return;
        }

        const mediaSession = await MediaSession.findById(sessionId);
        if (!mediaSession || mediaSession.MediaSession_status !== 'active') {
          socket.emit('error', { message: 'Active media session not found' });
          return;
        }

        // Only host can change URL
        if (!mediaSession.MediaSession_host.equals(socket.userId)) {
          socket.emit('error', { message: 'Only the host can change the video' });
          return;
        }

        // Update session with new URL
        mediaSession.MediaSession_url = newUrl;
        mediaSession.MediaSession_currentTime = 0; // Reset to beginning
        mediaSession.MediaSession_isPlaying = false; // Pause by default
        if (title) mediaSession.MediaSession_title = title;
        if (thumbnail) mediaSession.MediaSession_thumbnail = thumbnail;

        await mediaSession.save();

        // Broadcast URL change to all participants
        const roomName = `media-session-${sessionId}`;
        mediaSessionNamespace.to(roomName).emit('urlChanged', {
          sessionId,
          newUrl,
          title,
          thumbnail,
          type: mediaSession.MediaSession_type,
          changedBy: socket.userId,
          timestamp: new Date()
        });

        console.log(`URL changed in session ${sessionId} by host ${socket.userId}`);

      } catch (error) {
        console.error('Change URL error:', error);
        socket.emit('error', { message: 'Failed to change URL' });
      }
    });

    // Handle sync request (when user needs to sync with current state)
    socket.on('requestSync', async ({ sessionId }) => {
      try {
        if (!sessionId) {
          socket.emit('error', { message: 'Session ID is required' });
          return;
        }

        const mediaSession = await MediaSession.findById(sessionId)
          .populate('MediaSession_host', 'User_name')
          .populate('MediaSession_participants', 'User_name');

        if (!mediaSession || mediaSession.MediaSession_status !== 'active') {
          socket.emit('error', { message: 'Active media session not found' });
          return;
        }

        // Send current session state
        socket.emit('syncResponse', {
          sessionId,
          currentTime: mediaSession.MediaSession_currentTime,
          isPlaying: mediaSession.MediaSession_isPlaying,
          url: mediaSession.MediaSession_url,
          type: mediaSession.MediaSession_type,
          title: mediaSession.MediaSession_title,
          thumbnail: mediaSession.MediaSession_thumbnail,
          serverTimestamp: new Date()
        });

      } catch (error) {
        console.error('Sync request error:', error);
        socket.emit('error', { message: 'Failed to sync' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`Media session socket disconnected: ${socket.id}`);
      
      if (socket.sessionId && socket.userId) {
        // Notify other participants that user disconnected
        const roomName = `media-session-${socket.sessionId}`;
        socket.to(roomName).emit('userDisconnected', {
          sessionId: socket.sessionId,
          userId: socket.userId,
          timestamp: new Date()
        });
      }
    });

    // Handle annotation creation via socket
    socket.on('createAnnotation', async ({ sessionId, timestamp, type, content, position }) => {
      try {
        if (!sessionId || timestamp === undefined || !content) {
          socket.emit('error', { message: 'Session ID, timestamp, and content are required' });
          return;
        }

        const VideoAnnotation = require('../models/VideoAnnotation');
        const mediaSession = await MediaSession.findById(sessionId);
        
        if (!mediaSession || mediaSession.MediaSession_status !== 'active') {
          socket.emit('error', { message: 'Active media session not found' });
          return;
        }

        // Verify user is a participant
        if (!mediaSession.MediaSession_participants.includes(socket.userId)) {
          socket.emit('error', { message: 'You are not a participant in this session' });
          return;
        }

        // Create annotation
        const annotation = new VideoAnnotation({
          VideoAnnotation_sessionId: sessionId,
          VideoAnnotation_timestamp: timestamp,
          VideoAnnotation_type: type || 'note',
          VideoAnnotation_content: content,
          VideoAnnotation_userId: socket.userId,
          VideoAnnotation_position: position || { x: 50, y: 50 }
        });

        await annotation.save();
        await annotation.populate('VideoAnnotation_userId', 'User_name User_email User_profilePicture');

        // Broadcast to all participants
        const roomName = `media-session-${sessionId}`;
        mediaSessionNamespace.to(roomName).emit('annotationCreated', {
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

        console.log(`Annotation created in session ${sessionId} by user ${socket.userId}`);

      } catch (error) {
        console.error('Create annotation error:', error);
        socket.emit('error', { message: 'Failed to create annotation' });
      }
    });

    // Handle annotation updates via socket
    socket.on('updateAnnotation', async ({ annotationId, content, type, position }) => {
      try {
        if (!annotationId) {
          socket.emit('error', { message: 'Annotation ID is required' });
          return;
        }

        const VideoAnnotation = require('../models/VideoAnnotation');
        const annotation = await VideoAnnotation.findById(annotationId)
          .populate('VideoAnnotation_sessionId', 'MediaSession_groupId');

        if (!annotation) {
          socket.emit('error', { message: 'Annotation not found' });
          return;
        }

        // Only creator can update
        if (!annotation.VideoAnnotation_userId.equals(socket.userId)) {
          socket.emit('error', { message: 'You can only update your own annotations' });
          return;
        }

        // Update fields
        if (content) annotation.VideoAnnotation_content = content;
        if (type && ['note', 'highlight', 'question'].includes(type)) {
          annotation.VideoAnnotation_type = type;
        }
        if (position) annotation.VideoAnnotation_position = position;

        await annotation.save();

        // Broadcast update
        const roomName = `media-session-${annotation.VideoAnnotation_sessionId._id}`;
        mediaSessionNamespace.to(roomName).emit('annotationUpdated', {
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

        console.log(`Annotation ${annotationId} updated by user ${socket.userId}`);

      } catch (error) {
        console.error('Update annotation error:', error);
        socket.emit('error', { message: 'Failed to update annotation' });
      }
    });

    // Handle annotation deletion via socket
    socket.on('deleteAnnotation', async ({ annotationId }) => {
      try {
        if (!annotationId) {
          socket.emit('error', { message: 'Annotation ID is required' });
          return;
        }

        const VideoAnnotation = require('../models/VideoAnnotation');
        const annotation = await VideoAnnotation.findById(annotationId)
          .populate('VideoAnnotation_sessionId', 'MediaSession_groupId');

        if (!annotation) {
          socket.emit('error', { message: 'Annotation not found' });
          return;
        }

        // Only creator can delete
        if (!annotation.VideoAnnotation_userId.equals(socket.userId)) {
          socket.emit('error', { message: 'You can only delete your own annotations' });
          return;
        }

        const sessionId = annotation.VideoAnnotation_sessionId._id;
        await VideoAnnotation.findByIdAndDelete(annotationId);

        // Broadcast deletion
        const roomName = `media-session-${sessionId}`;
        mediaSessionNamespace.to(roomName).emit('annotationDeleted', {
          sessionId,
          annotationId,
          deletedBy: socket.userId
        });

        console.log(`Annotation ${annotationId} deleted by user ${socket.userId}`);

      } catch (error) {
        console.error('Delete annotation error:', error);
        socket.emit('error', { message: 'Failed to delete annotation' });
      }
    });

    // Handle annotation replies via socket
    socket.on('replyToAnnotation', async ({ annotationId, content }) => {
      try {
        if (!annotationId || !content || !content.trim()) {
          socket.emit('error', { message: 'Annotation ID and content are required' });
          return;
        }

        const VideoAnnotation = require('../models/VideoAnnotation');
        const annotation = await VideoAnnotation.findById(annotationId)
          .populate('VideoAnnotation_sessionId', 'MediaSession_groupId');

        if (!annotation) {
          socket.emit('error', { message: 'Annotation not found' });
          return;
        }

        // Add reply
        await annotation.addReply(socket.userId, content);
        await annotation.populate('VideoAnnotation_replies.userId', 'User_name User_email User_profilePicture');

        const newReply = annotation.VideoAnnotation_replies[annotation.VideoAnnotation_replies.length - 1];

        // Broadcast reply
        const roomName = `media-session-${annotation.VideoAnnotation_sessionId._id}`;
        mediaSessionNamespace.to(roomName).emit('annotationReply', {
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

        console.log(`Reply added to annotation ${annotationId} by user ${socket.userId}`);

      } catch (error) {
        console.error('Reply to annotation error:', error);
        socket.emit('error', { message: 'Failed to add reply' });
      }
    });

    // Handle annotation resolve toggle via socket
    socket.on('toggleAnnotationResolve', async ({ annotationId }) => {
      try {
        if (!annotationId) {
          socket.emit('error', { message: 'Annotation ID is required' });
          return;
        }

        const VideoAnnotation = require('../models/VideoAnnotation');
        const annotation = await VideoAnnotation.findById(annotationId)
          .populate('VideoAnnotation_sessionId', 'MediaSession_groupId');

        if (!annotation) {
          socket.emit('error', { message: 'Annotation not found' });
          return;
        }

        // Toggle resolved status
        await annotation.toggleResolved();

        // Broadcast update
        const roomName = `media-session-${annotation.VideoAnnotation_sessionId._id}`;
        mediaSessionNamespace.to(roomName).emit('annotationResolved', {
          sessionId: annotation.VideoAnnotation_sessionId._id,
          annotationId: annotation._id,
          isResolved: annotation.VideoAnnotation_isResolved,
          resolvedBy: socket.userId
        });

        console.log(`Annotation ${annotationId} resolved status toggled by user ${socket.userId}`);

      } catch (error) {
        console.error('Toggle annotation resolve error:', error);
        socket.emit('error', { message: 'Failed to toggle resolved status' });
      }
    });

    // Handle connection errors
    socket.on('error', (error) => {
      console.error('Media session socket error:', error);
    });
  });

  return mediaSessionNamespace;
};

module.exports = setupMediaSessionSockets;