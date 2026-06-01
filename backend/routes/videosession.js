const express = require("express");
const mongoose = require("mongoose");
const VideoSession = require("../models/VideoSession");
const Participant = require("../models/Participant");
const Group = require("../models/Group");
const GroupMember = require("../models/GroupMember");
const VideoChatMessage = require("../models/VideoChatMessage");
const { authenticateUser } = require("../middleware/authMiddleware");
const NotificationService = require("../services/notificationService");
const router = express.Router();

const isValidObjectId = (id) =>
  typeof id === "string" && mongoose.Types.ObjectId.isValid(id);

const sendInvalidId = (res, fieldName) =>
  res.status(400).json({
    success: false,
    message: `${fieldName} must be a valid id`,
  });

// 1. Start a new video session
router.post("/start", authenticateUser, async (req, res) => {
  const { groupId } = req.body;

  if (!isValidObjectId(groupId)) {
    return sendInvalidId(res, "Group ID");
  }

  try {
    const existingSession = await VideoSession.findOne({
      VideoSession_groupId: groupId,
      VideoSession_status: "active",
    });

    if (existingSession) {
      return res.status(409).json({
        success: false,
        message: "An active session already exists",
        sessionId: existingSession._id,
      });
    }

    const videoSession = new VideoSession({
      VideoSession_groupId: groupId,
      VideoSession_hostUserId: req.user._id,
      VideoSession_status: "active",
    });

    const hostParticipant = new Participant({
      Participant_userId: req.user._id,
      Participant_sessionId: videoSession._id,
    });
    await hostParticipant.save();

    videoSession.VideoSession_participants.push(hostParticipant._id);
    await videoSession.save();

    await Group.findByIdAndUpdate(groupId, {
      $push: {
        Group_videosessions: {
          sessionId: videoSession._id.toString(),
          sessionName: `Session by ${req.user.User_name || "Host"}`,
          startTime: new Date(),
          endTime: null,
        },
      },
    });

    const sessionWithHost = await VideoSession.findById(
      videoSession._id
    ).populate("VideoSession_hostUserId", "User_name");

    // Create notifications for group members about video call starting
    try {
      const groupMembers = await GroupMember.find({
        GroupMember_groupId: groupId,
        GroupMember_userId: { $ne: req.user._id }, // Exclude the host
      });

      if (groupMembers.length > 0) {
        const io = req.app.get("io");
        const notificationNamespace = req.app.get("notificationNamespace");
        const notificationService = new NotificationService(
          io,
          notificationNamespace
        );
        await notificationService.createVideoNotification(
          sessionWithHost,
          groupMembers
        );
      }
    } catch (notificationError) {
      console.error(
        "Error creating video session notifications:",
        notificationError
      );
      // Don't fail the session creation if notification fails
    }

    res.status(201).json({
      success: true,
      sessionId: sessionWithHost._id,
      hostName: sessionWithHost.VideoSession_hostUserId.User_name,
    });
  } catch (error) {
    console.error("Start session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to start session",
      error: error.message,
    });
  }
});

// 2. Join an existing video session
router.post("/join-session", authenticateUser, async (req, res) => {
  const { sessionId } = req.body;

  if (!isValidObjectId(sessionId)) {
    return sendInvalidId(res, "Session ID");
  }

  try {
    const session = await VideoSession.findById(sessionId).populate(
      "VideoSession_hostUserId",
      "User_name"
    );

    if (!session || session.VideoSession_status === "ended") {
      return res.status(404).json({
        success: false,
        message: "No active session found",
      });
    }

    // Check for existing participant (including those who left)
    let existingParticipant = await Participant.findOne({
      Participant_userId: req.user._id,
      Participant_sessionId: sessionId,
    });

    if (existingParticipant) {
      // If participant exists but has left, reactivate them
      if (
        existingParticipant.Participant_status === "left" ||
        existingParticipant.Participant_leftAt
      ) {
        existingParticipant.Participant_status = "active";
        existingParticipant.Participant_leftAt = null;
        existingParticipant.Participant_joinedAt = new Date(); // Update join time for rejoin
        await existingParticipant.save();

        // Add back to session participants if not already there
        const sessionDoc = await VideoSession.findById(sessionId);
        if (
          !sessionDoc.VideoSession_participants.includes(
            existingParticipant._id
          )
        ) {
          await VideoSession.findByIdAndUpdate(sessionId, {
            $push: { VideoSession_participants: existingParticipant._id },
          });
        }

        console.log(`User ${req.user.User_name} rejoined session ${sessionId}`);
      } else {
        // Already active in session
        console.log(
          `User ${req.user.User_name} already active in session ${sessionId}`
        );
      }
    } else {
      // Create new participant
      const newParticipant = new Participant({
        Participant_userId: req.user._id,
        Participant_sessionId: sessionId,
        Participant_status: "active",
      });
      await newParticipant.save();

      await VideoSession.findByIdAndUpdate(sessionId, {
        $push: { VideoSession_participants: newParticipant._id },
      });

      console.log(
        `User ${req.user.User_name} joined session ${sessionId} for the first time`
      );
    }

    // Get all active participants
    const participants = await Participant.find({
      Participant_sessionId: sessionId,
      Participant_status: "active",
      Participant_leftAt: null,
    }).populate("Participant_userId", "User_name");

    res.status(200).json({
      success: true,
      message:
        existingParticipant &&
        existingParticipant.Participant_status === "active"
          ? "Rejoined session"
          : "Joined session",
      hostName: session.VideoSession_hostUserId.User_name,
      participants: participants.map((p) => ({
        userId: p.Participant_userId._id,
        name: p.Participant_userId.User_name,
        joinedAt: p.Participant_joinedAt,
      })),
    });
  } catch (error) {
    console.error("Join session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to join session",
      error: error.message,
    });
  }
});

// 3. End a video session
router.post("/end", authenticateUser, async (req, res) => {
  const { sessionId } = req.body;

  if (!isValidObjectId(sessionId)) {
    return sendInvalidId(res, "Session ID");
  }

  try {
    const session = await VideoSession.findById(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    if (!session.VideoSession_hostUserId.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "Only the host can end this session",
      });
    }

    session.VideoSession_status = "ended";
    session.VideoSession_endTime = new Date();
    await session.save();

    // Update all participant records to set 'leftAt' time
    await Participant.updateMany(
      { Participant_sessionId: sessionId, Participant_leftAt: null },
      { $set: { Participant_leftAt: new Date() } }
    );

    res.status(200).json({
      success: true,
      message: "Session ended successfully",
      endTime: session.VideoSession_endTime,
    });
  } catch (error) {
    console.error("End session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to end session",
      error: error.message,
    });
  }
});

// 4. Get active session for a group
router.get("/get-session", authenticateUser, async (req, res) => {
  const { groupId } = req.query;

  if (!groupId) {
    return res.status(400).json({
      success: false,
      message: "Group ID is required",
    });
  }

  if (!isValidObjectId(groupId)) {
    return sendInvalidId(res, "Group ID");
  }

  try {
    const session = await VideoSession.findOne({
      VideoSession_groupId: groupId,
      VideoSession_status: "active",
    })
      .populate({
        path: "VideoSession_hostUserId",
        select: "User_name User_email",
        model: "User",
      })
      .lean();

    console.log(
      "Session query result:",
      session ? "Session found" : "No session found"
    );

    if (!session) {
      return res.status(200).json({
        success: true,
        activeSession: false,
        message: "No active session found",
      });
    }

    console.log("Fetching participants for session:", session._id);
    const participants = await Participant.find({
      Participant_sessionId: session._id,
    }).populate({
      path: "Participant_userId",
      select: "User_name User_email",
      model: "User",
    });

    console.log("Found participants:", participants.length);

    const response = {
      success: true,
      activeSession: true,
      sessionId: session._id,
      hostId: session.VideoSession_hostUserId?._id,
      hostName: session.VideoSession_hostUserId?.User_name || "Unknown Host",
      participants: participants.map((p) => ({
        userId: p.Participant_userId?._id,
        name: p.Participant_userId?.User_name || "Unknown User",
        email: p.Participant_userId?.User_email || "no-email@example.com",
        joinedAt: p.Participant_joinedAt,
      })),
      startTime: session.VideoSession_startTime,
    };

    console.log("Sending response for session:", session._id);
    return res.status(200).json(response);
  } catch (error) {
    console.error("Get session error:", {
      message: error.message,
      stack: error.stack,
      groupId: groupId,
      timestamp: new Date().toISOString(),
    });

    res.status(500).json({
      success: false,
      message: "Failed to get session",
      error: error.message,
    });
  }
});

// 5. Leave a video session
router.post("/leave", authenticateUser, async (req, res) => {
  const { sessionId } = req.body;
  const userId = req.user._id;

  if (!isValidObjectId(sessionId)) {
    return sendInvalidId(res, "Session ID");
  }

  try {
    // Find the participant
    const participant = await Participant.findOne({
      Participant_sessionId: sessionId,
      Participant_userId: userId,
      Participant_status: "active",
    });

    if (!participant) {
      return res.status(404).json({
        success: false,
        message: "Active participant not found in this session",
      });
    }

    // Update participant status to 'left' and set leftAt timestamp
    participant.Participant_status = "left";
    participant.Participant_leftAt = new Date();
    await participant.save();

    // Remove from active participants in the session
    await VideoSession.findByIdAndUpdate(
      sessionId,
      { $pull: { VideoSession_participants: participant._id } },
      { returnDocument: 'after' }
    );

    res.status(200).json({
      success: true,
      message: "Successfully left the video session",
      participant,
    });
  } catch (error) {
    console.error("Error leaving session:", error);
    res.status(500).json({
      success: false,
      message: "Error leaving session",
      error: error.message,
    });
  }
});

// 6. Get all participants for a session
router.get("/participants/:sessionId", authenticateUser, async (req, res) => {
  const { sessionId } = req.params;

  if (!isValidObjectId(sessionId)) {
    return sendInvalidId(res, "Session ID");
  }

  try {
    // Get session info to include host details
    const session = await VideoSession.findById(sessionId)
      .populate("VideoSession_hostUserId", "User_name User_email")
      .select("VideoSession_hostUserId VideoSession_status");

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    // Get all participants (including those who left)
    const participants = await Participant.find({
      Participant_sessionId: sessionId,
    }).populate("Participant_userId", "User_name User_email");

    // Filter active participants and add host information
    const activeParticipants = participants.filter(
      (p) => p.Participant_status === "active" && !p.Participant_leftAt
    );

    const formattedParticipants = activeParticipants.map((p) => {
      const isHost = p.Participant_userId._id.equals(
        session.VideoSession_hostUserId._id
      );
      return {
        _id: p._id,
        userId: {
          _id: p.Participant_userId._id,
          name: p.Participant_userId.User_name,
          email: p.Participant_userId.User_email,
        },
        role: isHost ? "host" : p.Participant_role || "participant",
        status: p.Participant_status,
        joinedAt: p.Participant_joinedAt,
        isHost: isHost,
        isOnline: true, // Since we're filtering active participants
      };
    });

    res.status(200).json({
      success: true,
      participants: formattedParticipants,
      totalParticipants: formattedParticipants.length,
      sessionStatus: session.VideoSession_status,
      hostInfo: {
        _id: session.VideoSession_hostUserId._id,
        name: session.VideoSession_hostUserId.User_name,
        email: session.VideoSession_hostUserId.User_email,
      },
    });
  } catch (error) {
    console.error("Fetch participants error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// 6. Get session by ID
router.get("/:sessionId", authenticateUser, async (req, res) => {
  if (!isValidObjectId(req.params.sessionId)) {
    return sendInvalidId(res, "Session ID");
  }

  try {
    const session = await VideoSession.findById(req.params.sessionId)
      .populate("VideoSession_hostUserId", "User_name")
      .populate({
        path: "VideoSession_participants",
        populate: {
          path: "Participant_userId",
          select: "User_name",
        },
      });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    const participants =
      session.VideoSession_participants?.map((p) => ({
        userId: p.Participant_userId?._id,
        name: p.Participant_userId?.User_name || "Unknown User",
        email: p.Participant_userId?.User_email || "Unknown Email",
        role: p.Participant_role,
        status: p.Participant_status,
        joinedAt: p.Participant_joinedAt,
        leftAt: p.Participant_leftAt,
      })) || [];

    res.status(200).json({
      success: true,
      session: {
        _id: session._id,
        groupId: session.VideoSession_groupId,
        hostId: session.VideoSession_hostUserId?._id,
        hostName: session.VideoSession_hostUserId?.User_name || "Unknown Host",
        status: session.VideoSession_status,
        startTime: session.VideoSession_startTime,
        endTime: session.VideoSession_endTime,
        participants,
        participantCount: participants.length,
      },
    });
  } catch (error) {
    console.error("Error fetching session:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch session",
      error: error.message,
    });
  }
});

// 7. Get session reports for a group
router.get("/group/:groupId", authenticateUser, async (req, res) => {
  const { groupId } = req.params;
  const { period } = req.query;

  if (!isValidObjectId(groupId)) {
    return sendInvalidId(res, "Group ID");
  }

  try {
    let dateFilter = {};
    if (period) {
      const days = parseInt(period.replace("d", ""), 10);
      if (!isNaN(days)) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        dateFilter = { VideoSession_startTime: { $gte: startDate } };
      }
    }

    const videoSessions = await VideoSession.find({
      VideoSession_groupId: groupId,
      ...dateFilter,
    })
      .populate("VideoSession_hostUserId", "User_name")
      .populate({
        path: "VideoSession_participants",
        populate: {
          path: "Participant_userId",
          select: "User_name",
        },
      })
      .sort({ VideoSession_startTime: -1, VideoSession_endTime: -1 });

    if (videoSessions.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No video sessions found for this group.",
      });
    }

    const sessionReports = videoSessions.map((session) => {
      const duration = session.VideoSession_endTime
        ? (new Date(session.VideoSession_endTime) -
            new Date(session.VideoSession_startTime)) /
          1000
        : "Ongoing";

      const participants =
        session.VideoSession_participants?.map((p) => ({
          name: p.Participant_userId?.User_name || "Unknown User",
          joinedAt: p.Participant_joinedAt,
          leftAt: p.Participant_leftAt,
        })) || [];

      return {
        _id: session._id,
        host: session.VideoSession_hostUserId?.User_name || "Unknown Host",
        participants,
        participantCount: participants.length,
        VideoSession_startTime: session.VideoSession_startTime,
        VideoSession_endTime: session.VideoSession_endTime || "Ongoing",
        duration:
          typeof duration === "string"
            ? duration
            : `${Math.floor(duration / 60)} minutes`,
      };
    });

    res.status(200).json({
      success: true,
      report: sessionReports,
    });
  } catch (error) {
    console.error("Error generating session report:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while generating the report.",
      error: error.message,
    });
  }
});

// 8. Send a chat message in video session
router.post("/send-message", authenticateUser, async (req, res) => {
  const { sessionId, message } = req.body;

  if (!sessionId || !message?.trim()) {
    return res.status(400).json({
      success: false,
      message: "Session ID and message content are required",
    });
  }

  if (!isValidObjectId(sessionId)) {
    return sendInvalidId(res, "Session ID");
  }

  try {
    const session = await VideoSession.findById(sessionId);

    if (!session || session.VideoSession_status !== "active") {
      return res.status(404).json({
        success: false,
        message: "Active session not found",
      });
    }

    // Verify user is a participant
    const participant = await Participant.findOne({
      Participant_sessionId: sessionId,
      Participant_userId: req.user._id,
      Participant_status: "active",
    });

    if (!participant) {
      return res.status(403).json({
        success: false,
        message: "You are not an active participant in this session",
      });
    }

    // Create new video chat message
    const videoChatMessage = new VideoChatMessage({
      VideoChatMessage_sessionId: sessionId,
      VideoChatMessage_sender: req.user._id,
      VideoChatMessage_content: message.trim(),
    });

    await videoChatMessage.save();

    // Populate sender info for response
    await videoChatMessage.populate("VideoChatMessage_sender", "User_name");

    res.status(200).json({
      success: true,
      message: "Message sent successfully",
      chatMessage: {
        _id: videoChatMessage._id,
        sender: {
          _id: videoChatMessage.VideoChatMessage_sender._id,
          name: videoChatMessage.VideoChatMessage_sender.User_name,
        },
        message: videoChatMessage.VideoChatMessage_content,
        timestamp: videoChatMessage.VideoChatMessage_timestamp,
      },
    });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send message",
      error: error.message,
    });
  }
});

// 9. Get chat messages for a video session
router.get("/messages/:sessionId", authenticateUser, async (req, res) => {
  const { sessionId } = req.params;

  if (!isValidObjectId(sessionId)) {
    return sendInvalidId(res, "Session ID");
  }

  try {
    const session = await VideoSession.findById(sessionId).select(
      "VideoSession_status"
    );

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    // Verify user is a participant
    const participant = await Participant.findOne({
      Participant_sessionId: sessionId,
      Participant_userId: req.user._id,
    });

    if (!participant) {
      return res.status(403).json({
        success: false,
        message: "You are not a participant in this session",
      });
    }

    // Get chat messages using the new VideoChatMessage model
    const chatMessages = await VideoChatMessage.findBySession(sessionId);

    const formattedMessages = chatMessages.map((msg) => ({
      _id: msg._id,
      userId: {
        _id: msg.VideoChatMessage_sender._id,
        name: msg.VideoChatMessage_sender.User_name,
      },
      message: msg.VideoChatMessage_content,
      timestamp: msg.VideoChatMessage_timestamp,
    }));

    res.status(200).json({
      success: true,
      chatMessages: formattedMessages,
    });
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get messages",
      error: error.message,
    });
  }
});

module.exports = router;
