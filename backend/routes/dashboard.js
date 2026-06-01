const express = require("express");
const router = express.Router();
const { authenticateUser } = require("../middleware/authMiddleware");
const Group = require("../models/Group");
const GroupMember = require("../models/GroupMember");
const Task = require("../models/Task");
const Message = require("../models/Message");
const VideoSession = require("../models/VideoSession");
const Note = require("../models/Note");
const cacheService = require("../services/cacheService");
const { invalidateCache } = require("../middleware/cacheMiddleware");

// Get dashboard summary with Redis caching
router.get("/summary", authenticateUser, async (req, res) => {
  try {
    const user = req.user;
    const timelineHours = parseInt(req.query.timeline) || 168; // 7 days = 168 hours
    
    // Create cache key based on user and timeline
    const cacheKey = `dashboard:summary:${user._id}:${timelineHours}`;
    
    // Try to get from cache first
    const cachedData = await cacheService.getQuery(cacheKey);
    if (cachedData) {
      return res.json({
        ...cachedData,
        _cached: true,
        _cacheTime: new Date().toISOString()
      });
    }

    const timelineStart = new Date(Date.now() - timelineHours * 60 * 60 * 1000);

    // Get active groups through GroupMember model
    const groupMemberships = await GroupMember.find({
      GroupMember_userId: user._id,
    }).populate(
      "GroupMember_groupId",
      "Group_name Group_description Group_createdBy Group_createdAt"
    );

    const groups = groupMemberships
      .map((membership) => membership.GroupMember_groupId)
      .filter(Boolean);
    const groupIds = groups.map((group) => group._id);
    const activeGroups = groups.length;

    // Get tasks assigned to user or in user's groups
    const tasks = await Task.find({
      $or: [{ Task_assignedTo: user._id }, { Task_groupId: { $in: groupIds } }],
    })
      .populate("Task_groupId", "Group_name")
      .populate("Task_assignedTo", "User_name User_email")
      .populate("Task_createdBy", "User_name User_email");

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(
      (task) => task.Task_status === "completed"
    ).length;
    const upcomingDeadlines = tasks
      .filter(
        (task) => task.Task_dueDate && new Date(task.Task_dueDate) > new Date()
      )
      .map((task) => ({
        Task_name: task.Task_name,
        Group_name: task.Task_groupId?.Group_name || "Unknown Group",
        Task_dueDate: task.Task_dueDate,
        Task_status: task.Task_status,
        Task_priority: task.Task_priority,
        assignedTo:
          task.Task_assignedTo?.map((assignee) => ({
            _id: assignee._id,
            name: assignee.User_name,
            email: assignee.User_email,
          })) || [],
        createdBy: {
          _id: task.Task_createdBy?._id,
          name: task.Task_createdBy?.User_name,
          email: task.Task_createdBy?.User_email,
        },
      }))
      .sort((a, b) => new Date(a.Task_dueDate) - new Date(b.Task_dueDate))
      .slice(0, 5); // Get top 5 upcoming deadlines

    // Get total notes created by the user
    const totalNotes = await Note.countDocuments({ Note_createdBy: user._id });

    // Get unread messages from user's groups
    const messages = await Message.find({
      Message_groupId: { $in: groupIds },
      Message_readBy: { $nin: [user._id] },
    }).populate("Message_groupId", "Group_name");
    const unreadMessages = messages.length;

    // Get recent activity
    const recentActivity = [];

    // Add group creation activities - show when groups were created
    const recentGroupCreations = await Group.find({
      _id: { $in: groupIds },
      Group_createdAt: { $gt: timelineStart },
    }).populate("Group_createdBy", "User_name User_email");

    const groupCreationActivities = recentGroupCreations.map((group) => ({
      type: "group_created",
      Group_name: group.Group_name,
      user_name: group.Group_createdBy?.User_name || "Unknown User",
      timestamp: group.Group_createdAt,
    }));
    recentActivity.push(...groupCreationActivities);

    // Add group membership activities - get all recent joins for user's groups (excluding creators)
    const allRecentGroupJoins = await GroupMember.find({
      GroupMember_groupId: { $in: groupIds },
      GroupMember_joinedAt: { $gt: timelineStart },
    })
      .populate("GroupMember_groupId", "Group_name Group_createdBy")
      .populate("GroupMember_userId", "User_name User_email");

    const recentGroupJoins = allRecentGroupJoins
      .filter((membership) => {
        // Only show "joined" for non-creators (creators get "created" activity instead)
        const isCreator =
          membership.GroupMember_groupId?.Group_createdBy?.toString() ===
          membership.GroupMember_userId?._id?.toString();
        return !isCreator;
      })
      .map((membership) => ({
        type: "group_join",
        Group_name:
          membership.GroupMember_groupId?.Group_name || "Unknown Group",
        user_name: membership.GroupMember_userId?.User_name || "Unknown User",
        role: membership.GroupMember_role,
        timestamp: membership.GroupMember_joinedAt,
      }));
    recentActivity.push(...recentGroupJoins);

    // Add task activities with assignment details
    const recentTasks = tasks
      .filter(
        (task) =>
          task.Task_updatedAt && new Date(task.Task_updatedAt) > timelineStart
      )
      .map((task) => ({
        type: "task",
        Task_name: task.Task_name,
        Group_name: task.Task_groupId?.Group_name || "Unknown Group",
        Task_status: task.Task_status,
        assignedTo:
          task.Task_assignedTo?.map((assignee) => assignee.User_name).join(
            ", "
          ) || "Unassigned",
        createdBy: task.Task_createdBy?.User_name || "Unknown",
        timestamp: task.Task_updatedAt,
      }));
    recentActivity.push(...recentTasks);

    // Add message activities
    const recentMessages = messages
      .filter((message) => message.Message_createdAt)
      .sort(
        (a, b) => new Date(b.Message_createdAt) - new Date(a.Message_createdAt)
      )
      .slice(0, 5)
      .map((message) => ({
        type: "message",
        Group_name: message.Message_groupId?.Group_name || "Unknown Group",
        timestamp: message.Message_createdAt,
      }));
    recentActivity.push(...recentMessages);

    // Sort activities by timestamp
    recentActivity.sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );

    // Get active and upcoming video sessions
    const activeSessions = await VideoSession.find({
      VideoSession_groupId: { $in: groupIds },
      VideoSession_status: "active",
    })
      .populate("VideoSession_groupId", "Group_name")
      .populate("VideoSession_hostUserId", "User_name User_email");

    const upcomingSessions = await VideoSession.find({
      VideoSession_groupId: { $in: groupIds },
      VideoSession_status: "scheduled",
      VideoSession_startTime: { $gt: new Date() },
    })
      .populate("VideoSession_groupId", "Group_name")
      .populate("VideoSession_hostUserId", "User_name User_email")
      .sort({ VideoSession_startTime: 1 })
      .limit(5);

    // Add video session activities - include all recent sessions (active, ended, scheduled, cancelled)
    const recentVideoSessions = await VideoSession.find({
      VideoSession_groupId: { $in: groupIds },
      $or: [
        { VideoSession_startTime: { $gt: timelineStart } },
        { VideoSession_endTime: { $gt: timelineStart } },
        { createdAt: { $gt: timelineStart } },
        { updatedAt: { $gt: timelineStart } },
      ],
    })
      .populate("VideoSession_groupId", "Group_name")
      .populate("VideoSession_hostUserId", "User_name User_email")
      .sort({
        VideoSession_endTime: -1,
        VideoSession_startTime: -1,
        updatedAt: -1,
      });

    const videoSessionActivities = recentVideoSessions.map((session) => {
      // Determine the most relevant timestamp for the activity
      let activityTimestamp = session.VideoSession_startTime;
      let activityDescription = session.VideoSession_status;

      if (
        session.VideoSession_status === "ended" &&
        session.VideoSession_endTime
      ) {
        activityTimestamp = session.VideoSession_endTime;
        activityDescription = "ended";
      } else if (session.VideoSession_status === "active") {
        activityDescription = "started";
      }

      return {
        type: "video_session",
        Group_name: session.VideoSession_groupId?.Group_name || "Unknown Group",
        session_status: activityDescription,
        host_name: session.VideoSession_hostUserId?.User_name || "Unknown Host",
        timestamp: activityTimestamp || session.updatedAt || session.createdAt,
      };
    });
    recentActivity.push(...videoSessionActivities);

    // Sort activities by timestamp again after adding video sessions
    recentActivity.sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );

    const dashboardData = {
      Active_groups: activeGroups || 0,
      Total_tasks: totalTasks || 0,
      Completed_tasks: completedTasks || 0,
      Total_notes: totalNotes || 0,
      Unread_messages: unreadMessages || 0,
      Upcoming_deadlines: upcomingDeadlines || [],
      Recent_activity: recentActivity || [],
      Active_sessions:
        activeSessions?.map((session) => ({
          Session_id: session._id,
          Group_name:
            session.VideoSession_groupId?.Group_name || "Unknown Group",
          Host_name:
            session.VideoSession_hostUserId?.User_name || "Unknown Host",
          Status: session.VideoSession_status,
          Started_at:
            session.VideoSession_startTime || session.VideoSession_createdAt,
        })) || [],
      Upcoming_sessions:
        upcomingSessions?.map((session) => ({
          Session_id: session._id,
          Group_name:
            session.VideoSession_groupId?.Group_name || "Unknown Group",
          Start_time: session.VideoSession_startTime,
          Host_name:
            session.VideoSession_hostUserId?.User_name || "Unknown Host",
          Status: session.VideoSession_status,
        })) || [],
    };

    // Cache dashboard data for 5 minutes (SHORT TTL since it's frequently changing)
    await cacheService.cacheQuery(cacheKey, dashboardData, cacheService.ttl.SHORT);

    res.json(dashboardData);
  } catch (error) {
    console.error("Error fetching dashboard summary:", error);
    res.status(500).json({ error: "Failed to fetch dashboard summary" });
  }
});

module.exports = router;
