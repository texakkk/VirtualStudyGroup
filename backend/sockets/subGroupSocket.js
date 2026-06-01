const SubGroup = require('../models/SubGroup');
const SubGroupMessage = require('../models/SubGroupMessage');
const GroupMember = require('../models/GroupMember');

function setupSubGroupSockets(io) {
  const subGroupNamespace = io.of('/subgroups');

  subGroupNamespace.on('connection', (socket) => {
    console.log(`User connected to sub-groups namespace: ${socket.id}`);

    // Join sub-group room
    socket.on('join_subgroup', async (data) => {
      try {
        const { subGroupId, userId } = data;

        // Verify user has access to the sub-group
        const subGroup = await SubGroup.findById(subGroupId);
        if (!subGroup) {
          socket.emit('error', { message: 'Sub-group not found' });
          return;
        }

        // Check if user is a member of the parent group
        const parentMembership = await GroupMember.findOne({
          GroupMember_groupId: subGroup.SubGroup_parentGroupId,
          GroupMember_userId: userId,
        });

        if (!parentMembership) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        // Check if user has access to this sub-group
        const hasAccess = subGroup.SubGroup_settings.allowAllParentMembers || 
                         subGroup.isMember(userId);

        if (!hasAccess) {
          socket.emit('error', { message: 'Access denied to this sub-group' });
          return;
        }

        // Join the sub-group room
        socket.join(`subgroup_${subGroupId}`);
        socket.subGroupId = subGroupId;
        socket.userId = userId;

        // Update user's activity in sub-group
        await subGroup.updateMemberActivity(userId);

        // Notify others that user joined
        socket.to(`subgroup_${subGroupId}`).emit('user_joined', {
          userId,
          timestamp: new Date()
        });

        socket.emit('joined_subgroup', { subGroupId });
        console.log(`User ${userId} joined sub-group ${subGroupId}`);

      } catch (error) {
        console.error('Error joining sub-group:', error);
        socket.emit('error', { message: 'Failed to join sub-group' });
      }
    });

    // Leave sub-group room
    socket.on('leave_subgroup', (data) => {
      try {
        const { subGroupId } = data;
        
        if (socket.subGroupId === subGroupId) {
          socket.leave(`subgroup_${subGroupId}`);
          
          // Notify others that user left
          socket.to(`subgroup_${subGroupId}`).emit('user_left', {
            userId: socket.userId,
            timestamp: new Date()
          });

          socket.subGroupId = null;
          console.log(`User ${socket.userId} left sub-group ${subGroupId}`);
        }
      } catch (error) {
        console.error('Error leaving sub-group:', error);
      }
    });

    // Handle typing indicators
    socket.on('typing_start', (data) => {
      try {
        const { subGroupId } = data;
        
        if (socket.subGroupId === subGroupId) {
          socket.to(`subgroup_${subGroupId}`).emit('user_typing', {
            userId: socket.userId,
            isTyping: true
          });
        }
      } catch (error) {
        console.error('Error handling typing start:', error);
      }
    });

    socket.on('typing_stop', (data) => {
      try {
        const { subGroupId } = data;
        
        if (socket.subGroupId === subGroupId) {
          socket.to(`subgroup_${subGroupId}`).emit('user_typing', {
            userId: socket.userId,
            isTyping: false
          });
        }
      } catch (error) {
        console.error('Error handling typing stop:', error);
      }
    });

    // Handle message read receipts
    socket.on('message_read', async (data) => {
      try {
        const { messageId, subGroupId } = data;
        
        if (socket.subGroupId === subGroupId) {
          const message = await SubGroupMessage.findById(messageId);
          if (message) {
            await message.markAsRead(socket.userId);
            
            // Notify message sender about read receipt
            socket.to(`subgroup_${subGroupId}`).emit('message_read_receipt', {
              messageId,
              readBy: socket.userId,
              readAt: new Date()
            });
          }
        }
      } catch (error) {
        console.error('Error handling message read:', error);
      }
    });

    // Handle live reactions during video/voice calls
    socket.on('live_reaction', (data) => {
      try {
        const { subGroupId, emoji, duration = 3000 } = data;
        
        if (socket.subGroupId === subGroupId) {
          socket.to(`subgroup_${subGroupId}`).emit('live_reaction', {
            userId: socket.userId,
            emoji,
            duration,
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error handling live reaction:', error);
      }
    });

    // Handle presence updates
    socket.on('update_presence', async (data) => {
      try {
        const { subGroupId, status } = data; // status: 'online', 'away', 'busy', 'offline'
        
        if (socket.subGroupId === subGroupId) {
          // Update user's presence in sub-group
          const subGroup = await SubGroup.findById(subGroupId);
          if (subGroup) {
            await subGroup.updateMemberActivity(socket.userId);
          }

          socket.to(`subgroup_${subGroupId}`).emit('presence_update', {
            userId: socket.userId,
            status,
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error updating presence:', error);
      }
    });

    // Handle voice/video call events
    socket.on('call_start', (data) => {
      try {
        const { subGroupId, callType, callId } = data; // callType: 'voice' or 'video'
        
        if (socket.subGroupId === subGroupId) {
          socket.to(`subgroup_${subGroupId}`).emit('call_started', {
            callId,
            callType,
            startedBy: socket.userId,
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error handling call start:', error);
      }
    });

    socket.on('call_join', (data) => {
      try {
        const { subGroupId, callId } = data;
        
        if (socket.subGroupId === subGroupId) {
          socket.to(`subgroup_${subGroupId}`).emit('call_joined', {
            callId,
            joinedBy: socket.userId,
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error handling call join:', error);
      }
    });

    socket.on('call_leave', (data) => {
      try {
        const { subGroupId, callId } = data;
        
        if (socket.subGroupId === subGroupId) {
          socket.to(`subgroup_${subGroupId}`).emit('call_left', {
            callId,
            leftBy: socket.userId,
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error handling call leave:', error);
      }
    });

    socket.on('call_end', (data) => {
      try {
        const { subGroupId, callId } = data;
        
        if (socket.subGroupId === subGroupId) {
          socket.to(`subgroup_${subGroupId}`).emit('call_ended', {
            callId,
            endedBy: socket.userId,
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error handling call end:', error);
      }
    });

    // Handle screen sharing
    socket.on('screen_share_start', (data) => {
      try {
        const { subGroupId } = data;
        
        if (socket.subGroupId === subGroupId) {
          socket.to(`subgroup_${subGroupId}`).emit('screen_share_started', {
            sharedBy: socket.userId,
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error handling screen share start:', error);
      }
    });

    socket.on('screen_share_stop', (data) => {
      try {
        const { subGroupId } = data;
        
        if (socket.subGroupId === subGroupId) {
          socket.to(`subgroup_${subGroupId}`).emit('screen_share_stopped', {
            stoppedBy: socket.userId,
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error handling screen share stop:', error);
      }
    });

    // Handle file sharing notifications
    socket.on('file_shared', (data) => {
      try {
        const { subGroupId, fileName, fileSize, fileType } = data;
        
        if (socket.subGroupId === subGroupId) {
          socket.to(`subgroup_${subGroupId}`).emit('file_shared', {
            sharedBy: socket.userId,
            fileName,
            fileSize,
            fileType,
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error handling file share:', error);
      }
    });

    // Handle collaborative editing events
    socket.on('document_edit', (data) => {
      try {
        const { subGroupId, documentId, operation, position, content } = data;
        
        if (socket.subGroupId === subGroupId) {
          socket.to(`subgroup_${subGroupId}`).emit('document_edited', {
            documentId,
            editedBy: socket.userId,
            operation,
            position,
            content,
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error handling document edit:', error);
      }
    });

    // Handle cursor position updates for collaborative editing
    socket.on('cursor_update', (data) => {
      try {
        const { subGroupId, documentId, position, selection } = data;
        
        if (socket.subGroupId === subGroupId) {
          socket.to(`subgroup_${subGroupId}`).emit('cursor_updated', {
            documentId,
            userId: socket.userId,
            position,
            selection,
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error handling cursor update:', error);
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      try {
        if (socket.subGroupId && socket.userId) {
          // Notify others that user disconnected
          socket.to(`subgroup_${socket.subGroupId}`).emit('user_disconnected', {
            userId: socket.userId,
            timestamp: new Date()
          });

          console.log(`User ${socket.userId} disconnected from sub-group ${socket.subGroupId}`);
        }
        
        console.log(`User disconnected from sub-groups namespace: ${socket.id}`);
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    });
  });

  return subGroupNamespace;
}

module.exports = setupSubGroupSockets;