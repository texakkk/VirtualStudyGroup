const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Participant = require("../models/Participant");
const VideoSession = require("../models/VideoSession");

module.exports = (io) => {
  // Create a namespace for video chat
  const videoNamespace = io.of('/video');
  
  // Maps userId to socketId for quick lookup.
  const userSockets = new Map();
  // Maps sessionId to array of socket IDs
  const sessionRooms = new Map();

  // Middleware for socket authentication
  videoNamespace.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      console.log("No token provided, allowing connection for video chat");
      // Allow connection without authentication for now, but mark as unauthenticated
      socket.isAuthenticated = false;
      return next();
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log("Decoded JWT:", decoded); // Debug log

      // The JWT payload structure is { user: { _id: userId, tokenVersion: ... } }
      const userId = decoded.user?._id;
      if (!userId) {
        console.error("No user ID found in JWT payload");
        return next(new Error("Authentication error: Invalid token structure"));
      }

      const user = await User.findById(userId).select("-password");
      if (!user) {
        console.error("User not found for ID:", userId);
        return next(new Error("Authentication error: User not found"));
      }

      socket.userId = user._id.toString();
      socket.userName = user.User_name;
      socket.isAuthenticated = true;
      userSockets.set(socket.userId, socket.id);
      console.log(
        `Socket authenticated for user: ${user.User_name} (${user._id})`
      );
      next();
    } catch (error) {
      console.error("Socket auth error:", error);
      // Allow connection but mark as unauthenticated for video chat functionality
      socket.isAuthenticated = false;
      console.log("Allowing unauthenticated connection for video chat");
      next();
    }
  });

  videoNamespace.on("connection", (socket) => {
    console.log(
      `Video chat socket connected: ${socket.id} (User: ${
        socket.userId || "Anonymous"
      })`
    );

    // WebRTC Signaling Handlers
    socket.on("sendingSignal", (payload) => {
      console.log("Sending signal from", socket.id, "to", payload.userToSignal);
      videoNamespace.to(payload.userToSignal).emit("userJoined", {
        signal: payload.signal,
        callerID: payload.callerID,
      });
    });

    socket.on("returningSignal", (payload) => {
      console.log("Returning signal from", socket.id, "to", payload.callerID);
      videoNamespace.to(payload.callerID).emit("receivingReturnedSignal", {
        signal: payload.signal,
        id: socket.id,
      });
    });

    // Handle starting a call (for hosts)
    socket.on("startCall", async ({ roomId, userId, userName }) => {
      console.log(
        `User ${userName} (${userId}) starting call in room ${roomId}`
      );

      if (!socket.isAuthenticated) {
        socket.userId = userId;
        socket.userName = userName;
      }

      socket.join(roomId);

      // Add to session room tracking
      if (!sessionRooms.has(roomId)) {
        sessionRooms.set(roomId, []);
      }
      sessionRooms.get(roomId).push(socket.id);

      // Emit to others in room that call has started
      socket.to(roomId).emit("callStarted", {
        hostId: userId,
        hostName: userName,
        roomId: roomId,
      });
    });

    // Handle user joining a call
    socket.on("joinCall", async ({ sessionId, userId, userName }, callback) => {
      console.log(
        `User ${userName} (${userId}) joining call in session ${sessionId}`
      );

      // Set user info if not authenticated via token
      if (!socket.isAuthenticated) {
        socket.userId = userId;
        socket.userName = userName;
      }

      try {
        socket.join(sessionId);

        // Add to session room tracking
        if (!sessionRooms.has(sessionId)) {
          sessionRooms.set(sessionId, []);
        }
        
        // Remove any existing socket for this user to prevent duplicates
        const existingSockets = sessionRooms.get(sessionId);
        const filteredSockets = existingSockets.filter(socketId => {
          const existingSocket = videoNamespace.sockets.get(socketId);
          return existingSocket && existingSocket.userId !== socket.userId;
        });
        sessionRooms.set(sessionId, [...filteredSockets, socket.id]);

        // Update participant status in database
        try {
          await Participant.findOneAndUpdate(
            {
              Participant_sessionId: sessionId,
              Participant_userId: socket.userId,
            },
            {
              $set: { 
                Participant_status: 'active',
                Participant_leftAt: null,
                Participant_peerId: socket.id
              }
            },
            { upsert: false }
          );
          console.log(`Updated participant ${socket.userName} status to active in database`);
        } catch (dbError) {
          console.error("Error updating participant status:", dbError);
        }

        // Get all connected socket IDs in the room (excluding the new user)
        const roomSockets = await videoNamespace.in(sessionId).fetchSockets();
        const usersInRoom = roomSockets
          .filter((s) => s.id !== socket.id && s.userId)
          .map((s) => s.id); // Return socket IDs for WebRTC

        console.log(`User ${userName} joining room with ${usersInRoom.length} other users`);

        // Send the list of other users to the new user for peering
        socket.emit("allUsers", usersInRoom);

        // Notify others that a new user has joined
        socket.to(sessionId).emit("userJoined", {
          signal: null, // Will be set by WebRTC
          callerID: socket.id,
          userId: socket.userId,
          userName: socket.userName,
        });

        // Emit participant updates to all users in the session (including the new user)
        videoNamespace.to(sessionId).emit("participantJoined", {
          userId: socket.userId,
          userName: socket.userName,
          socketId: socket.id,
        });

        // Broadcast updated participant count to all users in the room
        const currentParticipants = roomSockets.filter(s => s.userId).length;
        videoNamespace.to(sessionId).emit("participantCountUpdated", {
          count: currentParticipants,
          sessionId: sessionId
        });

        // Force refresh of peer connections for all users in the room
        // This ensures that when someone rejoins, all participants re-establish connections
        setTimeout(() => {
          const allSocketsInRoom = roomSockets.map(s => s.id);
          videoNamespace.to(sessionId).emit("refreshPeerConnections", {
            allUsers: allSocketsInRoom,
            sessionId: sessionId
          });
        }, 500);

        // Send success response
        if (callback) {
          callback({
            success: true,
            message: "Successfully joined call",
            socketId: socket.id,
            participantCount: currentParticipants
          });
        }
      } catch (error) {
        console.error("Join call error:", error);
        if (callback) {
          callback({ success: false, error: "Failed to join call" });
        }
      }
    });

    // Handle chat messages in video sessions
    socket.on(
      "sendMessage",
      ({ sessionId, userId, userName, message, timestamp }) => {
        console.log(
          `Message from ${userName} in session ${sessionId}: ${message}`
        );

        // Broadcast message to all users in the session except sender
        socket.to(sessionId).emit("receiveMessage", {
          _id: Date.now().toString(), // Temporary ID
          userId: {
            _id: userId,
            name: userName,
          },
          message: message,
          timestamp: timestamp || new Date(),
        });
      }
    );

    // Handle call ending
    socket.on("endCall", ({ roomId }) => {
      console.log(`Call ended in room ${roomId}`);

      // Notify all users in the room that call has ended
      socket.to(roomId).emit("callEnded", {
        roomId: roomId,
        endedBy: socket.userId,
      });

      // Clean up room tracking
      if (sessionRooms.has(roomId)) {
        sessionRooms.delete(roomId);
      }
    });

    // Handle user leaving a call manually
    socket.on("leaveCall", async ({ sessionId }) => {
      console.log(
        `User ${socket.userName} leaving call in session ${sessionId}`
      );

      socket.leave(sessionId);

      // Update participant status in database
      try {
        await Participant.findOneAndUpdate(
          {
            Participant_sessionId: sessionId,
            Participant_userId: socket.userId,
            Participant_status: 'active'
          },
          {
            $set: { 
              Participant_status: 'left',
              Participant_leftAt: new Date()
            }
          }
        );
      } catch (dbError) {
        console.error("Error updating participant leave status:", dbError);
      }

      // Remove from session room tracking
      if (sessionRooms.has(sessionId)) {
        const sockets = sessionRooms.get(sessionId);
        const index = sockets.indexOf(socket.id);
        if (index > -1) {
          sockets.splice(index, 1);
        }
      }

      // Get remaining participants count
      const roomSockets = await videoNamespace.in(sessionId).fetchSockets();
      const remainingParticipants = roomSockets.filter(s => s.userId).length;

      // Notify others that user has left
      socket.to(sessionId).emit("participantLeft", {
        userId: socket.userId,
        userName: socket.userName,
        socketId: socket.id,
      });

      socket.to(sessionId).emit("userLeft", {
        userId: socket.userId,
        socketId: socket.id,
      });

      // Broadcast updated participant count
      videoNamespace.to(sessionId).emit("participantCountUpdated", {
        count: remainingParticipants,
        sessionId: sessionId
      });
    });

    // Handle disconnection
    socket.on("disconnect", async () => {
      console.log(`Socket disconnected: ${socket.id} (User: ${socket.userId})`);

      if (socket.userId) {
        userSockets.delete(socket.userId);

        // The socket is automatically removed from all rooms on disconnect.
        // We just need to notify others and update the DB.
        const rooms = Array.from(socket.rooms);
        rooms.forEach(async (roomId) => {
          if (roomId !== socket.id) {
            // Don't process the socket's private room
            try {
              // Mark the participant as left in the database
              await Participant.findOneAndUpdate(
                {
                  Participant_sessionId: roomId,
                  Participant_userId: socket.userId,
                  Participant_status: 'active', // Only update active participants
                },
                {
                  $set: { 
                    Participant_status: 'left',
                    Participant_leftAt: new Date() 
                  }
                }
              );

              // Remove from session room tracking
              if (sessionRooms.has(roomId)) {
                const sockets = sessionRooms.get(roomId);
                const index = sockets.indexOf(socket.id);
                if (index > -1) {
                  sockets.splice(index, 1);
                }
              }

              // Get remaining participants count
              const roomSockets = await videoNamespace.in(roomId).fetchSockets();
              const remainingParticipants = roomSockets.filter(s => s.userId && s.id !== socket.id).length;

              // Notify others in the room that this user has left
              socket.to(roomId).emit("userLeft", {
                userId: socket.userId,
                socketId: socket.id, // Frontend needs this to remove the peer
                userName: socket.userName
              });

              socket.to(roomId).emit("participantLeft", {
                userId: socket.userId,
                userName: socket.userName,
                socketId: socket.id,
              });

              // Broadcast updated participant count
              videoNamespace.to(roomId).emit("participantCountUpdated", {
                count: remainingParticipants,
                sessionId: roomId
              });

              console.log(`User ${socket.userName} disconnected from session ${roomId}, ${remainingParticipants} participants remaining`);
            } catch (error) {
              console.error(
                `Error handling disconnect for user ${socket.userId} in room ${roomId}:`,
                error
              );
            }
          }
        });
      }
    });
  });
};
