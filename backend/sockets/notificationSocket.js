const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { serializeNotifications } = require("../utils/notificationSerializer");

module.exports = (io) => {
  // Create a namespace specifically for notifications
  const notificationNamespace = io.of("/notifications");

  // Helper function to authenticate socket token
  const authenticateSocket = async (token) => {
    if (!token) {
      return { isAuthenticated: false, userId: null, userName: "Anonymous", error: "No token provided" };
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.user?._id;

      if (!userId) {
        return { isAuthenticated: false, userId: null, userName: "Anonymous", error: "Invalid token payload" };
      }

      const user = await User.findById(userId).select("-password");
      if (!user) {
        return { isAuthenticated: false, userId: null, userName: "Anonymous", error: "User not found" };
      }

      console.log(`Notification socket authenticated user: ${user.User_name} (${user._id})`);
      return {
        isAuthenticated: true,
        userId: user._id.toString(),
        userName: user.User_name,
      };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        console.error("Notification socket auth error: Token expired at", error.expiredAt);
        return { isAuthenticated: false, userId: null, userName: "Anonymous", error: "Token expired", expired: true };
      }
      console.error("Notification socket auth error:", error.message);
      return { isAuthenticated: false, userId: null, userName: "Anonymous", error: error.message };
    }
  };

  notificationNamespace.on("connection", async (socket) => {
    // Authenticate the socket connection
    const token = socket.handshake.auth.token;
    const authResult = await authenticateSocket(token);

    // If token is expired, disconnect immediately and tell client to refresh
    if (authResult.expired) {
      socket.emit("error", { 
        message: "Token expired. Please refresh your session.", 
        code: "TOKEN_EXPIRED",
        requiresRefresh: true 
      });
      socket.disconnect(true);
      return;
    }

    socket.isAuthenticated = authResult.isAuthenticated;
    socket.userId = authResult.userId;
    socket.userName = authResult.userName;

    console.log(
      `📢 Notification socket connected: ${socket.id} (User: ${socket.userName}, ID: ${socket.userId})`
    );

    if (socket.isAuthenticated) {
      // Join user to their personal notification room
      socket.join(`user_${socket.userId}`);
      console.log(`User ${socket.userName} joined notification room: user_${socket.userId}`);

      // Send initial notification count
      try {
        const Notification = require("../models/Notification");
        const unreadCount = await Notification.countDocuments({
          Notification_userId: socket.userId,
          Notification_read: false
        });
        
        socket.emit("notificationCount", { unreadCount });
        console.log(`Sent initial notification count to ${socket.userName}: ${unreadCount}`);
      } catch (error) {
        console.error("Error fetching initial notification count:", error);
      }
    }

    // Handle notification mark as read
    socket.on("markNotificationRead", async (data) => {
      if (!socket.isAuthenticated) {
        socket.emit("error", { message: "Not authenticated" });
        return;
      }

      try {
        const { notificationId } = data;
        const Notification = require("../models/Notification");
        
        const notification = await Notification.findOneAndUpdate(
          { 
            _id: notificationId, 
            Notification_userId: socket.userId 
          },
          { 
            Notification_read: true,
            Notification_updatedAt: new Date()
          },
          { returnDocument: 'after' }
        );

        if (notification) {
          // Send updated count to user
          const unreadCount = await Notification.countDocuments({
            Notification_userId: socket.userId,
            Notification_read: false
          });
          
          socket.emit("notificationCount", { unreadCount });
          socket.emit("notificationMarkedRead", { notificationId, unreadCount });
          console.log(`Notification ${notificationId} marked as read by ${socket.userName}`);
        }
      } catch (error) {
        console.error("Error marking notification as read:", error);
        socket.emit("error", { message: "Failed to mark notification as read" });
      }
    });

    // Handle mark all notifications as read
    socket.on("markAllNotificationsRead", async () => {
      if (!socket.isAuthenticated) {
        socket.emit("error", { message: "Not authenticated" });
        return;
      }

      try {
        const Notification = require("../models/Notification");
        
        const result = await Notification.updateMany(
          { 
            Notification_userId: socket.userId,
            Notification_read: false
          },
          { 
            Notification_read: true,
            Notification_updatedAt: new Date()
          }
        );

        socket.emit("notificationCount", { unreadCount: 0 });
        socket.emit("allNotificationsMarkedRead", { modifiedCount: result.modifiedCount });
        console.log(`All notifications marked as read for ${socket.userName} (${result.modifiedCount} notifications)`);
      } catch (error) {
        console.error("Error marking all notifications as read:", error);
        socket.emit("error", { message: "Failed to mark all notifications as read" });
      }
    });

    // Handle delete notification
    socket.on("deleteNotification", async (data) => {
      if (!socket.isAuthenticated) {
        socket.emit("error", { message: "Not authenticated" });
        return;
      }

      try {
        const { notificationId } = data;
        const Notification = require("../models/Notification");
        
        const deletedNotification = await Notification.findOneAndDelete({
          _id: notificationId,
          Notification_userId: socket.userId
        });

        if (deletedNotification) {
          // Send updated count to user
          const unreadCount = await Notification.countDocuments({
            Notification_userId: socket.userId,
            Notification_read: false
          });
          
          socket.emit("notificationCount", { unreadCount });
          socket.emit("notificationDeleted", { notificationId, unreadCount });
          console.log(`Notification ${notificationId} deleted by ${socket.userName}`);
        }
      } catch (error) {
        console.error("Error deleting notification:", error);
        socket.emit("error", { message: "Failed to delete notification" });
      }
    });

    // Handle get notifications
    socket.on("getNotifications", async (data) => {
      if (!socket.isAuthenticated) {
        socket.emit("error", { message: "Not authenticated" });
        return;
      }

      try {
        const { page = 1, limit = 20, unreadOnly = false } = data || {};
        const Notification = require("../models/Notification");

        const query = { Notification_userId: socket.userId };
        if (unreadOnly) {
          query.Notification_read = false;
        }

        const notifications = await Notification.find(query)
          .populate('Notification_fromUserId', 'User_name User_email')
          .populate('Notification_groupId', 'Group_name')
          .sort({ Notification_createdAt: -1 })
          .limit(limit * 1)
          .skip((page - 1) * limit)
          .lean();

        const total = await Notification.countDocuments(query);
        const unreadCount = await Notification.countDocuments({
          Notification_userId: socket.userId,
          Notification_read: false
        });

        socket.emit("notificationsList", {
          notifications: serializeNotifications(notifications),
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / limit),
            totalNotifications: total,
            unreadCount
          }
        });

        console.log(`Sent ${notifications.length} notifications to ${socket.userName}`);
      } catch (error) {
        console.error("Error fetching notifications:", error);
        socket.emit("error", { message: "Failed to fetch notifications" });
      }
    });

    // Handle disconnect
    socket.on("disconnect", (reason) => {
      console.log(
        `📢 Notification socket disconnected: ${socket.id} (User: ${
          socket.userName || "Unknown"
        }, Reason: ${reason})`
      );
    });

    // Handle connection errors
    socket.on("error", (error) => {
      console.error(`Notification socket error for ${socket.userName}:`, error);
    });
  });

  // Helper function to send notification to specific user
  notificationNamespace.sendToUser = (userId, event, data) => {
    notificationNamespace.to(`user_${userId}`).emit(event, data);
    console.log(`📢 Sent ${event} to user ${userId}:`, data);
  };

  // Helper function to broadcast notification to all users
  notificationNamespace.broadcast = (event, data) => {
    notificationNamespace.emit(event, data);
    console.log(`📢 Broadcasted ${event}:`, data);
  };

  console.log("📢 Notification socket namespace initialized");
  return notificationNamespace;
};
