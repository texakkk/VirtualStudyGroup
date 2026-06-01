const jwt = require("jsonwebtoken");
const User = require("../models/User");
const GroupMember = require("../models/GroupMember");
const NotificationService = require("../services/notificationService");
const ReadReceiptService = require("../services/readReceiptService");
const cacheService = require("../services/cacheService");

module.exports = (io) => {
  const notificationService = new NotificationService(io);
  // Create a namespace for regular chat
  const chatNamespace = io.of("/chat");

  // Helper function to authenticate socket token
  const authenticateSocket = async (token) => {
    if (!token || typeof token !== "string") {
      return {
        isAuthenticated: false,
        userId: null,
        userName: "Anonymous",
        error: "No token provided",
      };
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.user?._id;

      if (!userId) {
        return {
          isAuthenticated: false,
          userId: null,
          userName: "Anonymous",
          error: "Invalid token payload",
        };
      }

      const user = await User.findById(userId).select("-password");
      if (!user) {
        return {
          isAuthenticated: false,
          userId: null,
          userName: "Anonymous",
          error: "User not found",
        };
      }

      console.log(`Authenticated user ID: ${user._id}`);
      return {
        isAuthenticated: true,
        userId: user._id.toString(),
        userName: user.User_name,
      };
    } catch (error) {
      console.error("Socket auth error:", error.message);
      return {
        isAuthenticated: false,
        userId: null,
        userName: "Anonymous",
        error: error.message,
      };
    }
  };

  chatNamespace.use(async (socket, next) => {
    const token = socket.handshake?.auth?.token;
    const authResult = await authenticateSocket(token);

    if (!authResult.isAuthenticated) {
      return next(new Error(`Authentication error: ${authResult.error || "Invalid token"}`));
    }

    socket.isAuthenticated = true;
    socket.userId = authResult.userId;
    socket.userName = authResult.userName;
    next();
  });

  chatNamespace.on("connection", async (socket) => {
    console.log(
      `Chat socket connected: ${socket.id} (User: ${socket.userName})`
    );
    socket.joinedGroupIds = new Set();

    // Join a group room
    socket.on("joinGroup", async (groupId) => {
      socket.join(groupId);
      socket.joinedGroupIds.add(groupId.toString());
      console.log(`User ${socket.id} joined group: ${groupId}`);
      
      // Track active user in cache
      if (socket.isAuthenticated && socket.userId) {
        await cacheService.addActiveUser(groupId, socket.userId, cacheService.ttl.SHORT);
        await GroupMember.findOneAndUpdate(
          {
            GroupMember_groupId: groupId,
            GroupMember_userId: socket.userId,
          },
          { GroupMember_lastActive: new Date() }
        );
        
        // Get and broadcast active users
        const activeUsers = await cacheService.getActiveUsers(groupId);
        chatNamespace.to(groupId).emit("activeUsers", {
          groupId,
          activeUsers,
          count: activeUsers.length
        });
        chatNamespace.to(groupId).emit("userOnline", socket.userId);
      }
    });

    // Handle message sending
    socket.on("sendMessage", async (messageData) => {
      const { groupId, chatId, Message_groupId, ...message } = messageData;
      const roomId = groupId || chatId || Message_groupId; // Support legacy payload shapes

      console.log(`Message sent to room ${roomId}:`, {
        ...message,
        messageType: message.Message_type || message.messageType || 'text',
        isReply: message.isReply || false,
        replyToId: message.replyToId || null,
        hasFile: !!(message.Message_fileId || message.fileId),
      });

      if (!roomId) {
        socket.emit("error", { message: "Cannot send message without a groupId" });
        return;
      }

      const outgoingMessage = {
        ...message,
        Message_groupId: Message_groupId || roomId,
        Message_sender: {
          _id: socket.userId,
          User_name: socket.userName,
        },
        senderId: socket.userId,
        senderName: socket.userName,
      };

      // Emit message to room (excluding sender to avoid duplicates)
      socket.to(roomId).emit("receiveMessage", outgoingMessage);

      // Create notifications for group members (except sender)
      if (roomId && socket.isAuthenticated) {
        try {
          const groupMembers = await GroupMember.find({
            GroupMember_groupId: roomId,
          });

          if (groupMembers.length > 0) {
            await notificationService.createMessageNotification(
              {
                Message_sender: socket.userId,
                Message_groupId: roomId,
                Message_content: outgoingMessage.content || outgoingMessage.Message_content || "",
                Message_type: outgoingMessage.Message_type || outgoingMessage.messageType || 'text',
                Message_fileId: outgoingMessage.Message_fileId || outgoingMessage.fileId || null,
                _id: message._id,
              },
              groupMembers
            );
          }
        } catch (error) {
          console.error("Error creating message notifications:", error);
        }
      }
    });

    // Handle emoji reactions
    socket.on("addEmojiReaction", (reactionData) => {
      const { groupId, ...reaction } = reactionData;
      chatNamespace.to(groupId).emit("emojiReactionAdded", reaction);
      console.log(`Emoji reaction added:`, reaction);
    });

    socket.on("removeEmojiReaction", (reactionData) => {
      const { groupId, ...reaction } = reactionData;
      chatNamespace.to(groupId).emit("emojiReactionRemoved", reaction);
      console.log(`Emoji reaction removed:`, reaction);
    });

    // Handle message deletion
    socket.on("messageDeleted", (data) => {
      const { groupId, messageId, hardDelete } = data;
      chatNamespace
        .to(groupId)
        .emit("messageDeleted", { messageId, hardDelete });
      console.log(
        `Message ${messageId} ${
          hardDelete ? "permanently deleted" : "marked as deleted"
        } in group ${groupId}`
      );
    });

    // Handle messages marked as read
    socket.on("messagesRead", (data) => {
      const { groupId, userId, readCount } = data;
      console.log(
        `Messages marked as read in group ${groupId} by user ${userId}: ${readCount} messages`
      );
      // Broadcast to all clients (including dashboard) that messages were read
      chatNamespace.emit("messagesRead", data);
    });

    // Handle marking a single message as read
    socket.on("markMessageRead", async (data) => {
      if (!socket.isAuthenticated) return;

      const { messageId } = data;
      try {
        await ReadReceiptService.markAsRead(messageId, socket.userId);

        // Broadcast to the group that this message was read
        const message = await require("../models/Message").findById(messageId);
        if (message) {
          chatNamespace
            .to(message.Message_groupId.toString())
            .emit("messageReadUpdate", {
              messageId,
              userId: socket.userId,
              userName: socket.userName,
              readAt: new Date(),
            });
        }
      } catch (error) {
        console.error("Error marking message as read via socket:", error);
        socket.emit("error", { message: "Failed to mark message as read" });
      }
    });

    // Handle marking multiple messages as read
    socket.on("markMessagesRead", async (data) => {
      if (!socket.isAuthenticated) return;

      const { messageIds, groupId } = data;
      try {
        const result = await ReadReceiptService.markMultipleAsRead(
          messageIds,
          socket.userId
        );

        // Broadcast to the group that messages were read
        chatNamespace.to(groupId).emit("messagesReadUpdate", {
          messageIds,
          userId: socket.userId,
          userName: socket.userName,
          readCount: result.upsertedCount,
          readAt: new Date(),
        });

        // Send confirmation back to the user
        socket.emit("messagesMarkedRead", {
          success: true,
          readCount: result.upsertedCount,
        });
      } catch (error) {
        console.error("Error marking messages as read via socket:", error);
        socket.emit("error", { message: "Failed to mark messages as read" });
      }
    });

    // Handle getting read status for messages
    socket.on("getReadStatus", async (data) => {
      if (!socket.isAuthenticated) return;

      const { messageIds } = data;
      try {
        const readStatus = await ReadReceiptService.getUserReadStatus(
          messageIds,
          socket.userId
        );
        socket.emit("readStatusUpdate", { readStatus });
      } catch (error) {
        console.error("Error getting read status via socket:", error);
        socket.emit("error", { message: "Failed to get read status" });
      }
    });

    // Handle getting who read a message
    socket.on("getMessageReaders", async (data) => {
      if (!socket.isAuthenticated) return;

      const { messageId, limit = 20 } = data;
      try {
        const readers = await ReadReceiptService.getMessageReaders(
          messageId,
          limit
        );
        socket.emit("messageReadersUpdate", {
          messageId,
          readers: readers.map((reader) => ({
            userId: reader.userId._id,
            userName: reader.userId.User_name,
            readAt: reader.readAt,
          })),
        });
      } catch (error) {
        console.error("Error getting message readers via socket:", error);
        socket.emit("error", { message: "Failed to get message readers" });
      }
    });

    // Handle notifications
    socket.on("newNotification", (notification) => {
      chatNamespace.emit("newNotification", notification);
      console.log("📣 New notification:", notification);
    });

    // Leave group room on disconnect
    socket.on("disconnect", async () => {
      console.log(
        `❌ Chat socket disconnected: ${socket.id} (User: ${
          socket.userName || "Unknown"
        })`
      );
      
      // Remove user from all active groups in cache
      if (socket.isAuthenticated && socket.userId) {
        const lastActive = new Date();
        const rooms = Array.from(socket.joinedGroupIds || []);
        for (const roomId of rooms) {
          await cacheService.removeActiveUser(roomId, socket.userId);
          await GroupMember.findOneAndUpdate(
            {
              GroupMember_groupId: roomId,
              GroupMember_userId: socket.userId,
            },
            { GroupMember_lastActive: lastActive }
          );

          // Broadcast updated active users
          const activeUsers = await cacheService.getActiveUsers(roomId);
          chatNamespace.to(roomId).emit("activeUsers", {
            groupId: roomId,
            activeUsers,
            count: activeUsers.length
          });
          chatNamespace.to(roomId).emit("userOffline", {
            userId: socket.userId,
            lastActive,
          });
        }
      }
    });
  });
};
