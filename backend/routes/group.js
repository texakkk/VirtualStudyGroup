const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const User = require("../models/User");
const Group = require("../models/Group");
const GroupMember = require("../models/GroupMember");
const GroupSettings = require("../models/GroupSettings");
const GroupRole = require("../models/GroupRole");
const SubGroup = require("../models/SubGroup");
const Task = require("../models/Task");
const Message = require("../models/Message");
const crypto = require("crypto");
const {
  authenticateUser,
  authorizeAdmin,
} = require("../middleware/authMiddleware");
const { normalizeObjectIdParams } = require("../middleware/inputValidationMiddleware");
const NotificationService = require("../services/notificationService");
const cacheService = require("../services/cacheService");
const { invalidateCache } = require("../middleware/cacheMiddleware");
// Create a Group
router.post("/create", authenticateUser, async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res
        .status(400)
        .json({ success: false, message: "User is not defined" });
    }

    const { Group_name, Group_description } = req.body;
    const userId = req.user._id;

    // Ensure the admin role is included for the creator
    const newGroup = await Group.create({
      Group_name,
      Group_description,
      Group_createdBy: userId,
    });
    await newGroup.addMember(userId, "admin");

    // Invalidate user's group cache
    await invalidateCache(`user:${userId}:*`);
    await invalidateCache('query:groups:*');

    // Convert to plain object and ensure _id is a string
    const groupResponse = {
      _id: newGroup._id.toString(),
      Group_name: newGroup.Group_name,
      Group_description: newGroup.Group_description,
      Group_createdBy: newGroup.Group_createdBy.toString(),
      Group_createdAt: newGroup.Group_createdAt,
      Group_updatedAt: newGroup.Group_updatedAt,
      Group_features: newGroup.Group_features,
      Group_statistics: newGroup.Group_statistics
    };

    res.status(201).json({
      success: true,
      group: groupResponse,
      message: "Group created successfully",
    });
  } catch (error) {
    console.error("Error creating group:", error); // Log the actual error
    res.status(500).json({ success: false, message: error.message });
  }
});

// Fetch User's Groups with `isCreatedByUser` Field
router.get("/user-groups", authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id;
    const cacheKey = `user:${userId}:groups`;

    // Try to get from cache first
    const cachedGroups = await cacheService.getQuery(cacheKey);
    if (cachedGroups) {
      return res.status(200).json({ 
        success: true, 
        groups: cachedGroups,
        cached: true 
      });
    }

    // Find all memberships for the current user
    const memberships = await GroupMember.find({ GroupMember_userId: userId })
      .populate({
        path: "GroupMember_groupId",
        populate: {
          path: "Group_createdBy",
          select: "User_name User_email",
        },
      })
      .lean();

    // Extract and format the group data from the memberships
    const groups = await Promise.all(
      memberships
        .filter((membership) => membership.GroupMember_groupId) // Filter out nulls first
        .map(async (membership) => {
          const group = membership.GroupMember_groupId;
          
          // Get member count for each group
          const memberCount = await GroupMember.countDocuments({
            GroupMember_groupId: group._id,
          });

          // Get admin count for each group
          const adminCount = await GroupMember.countDocuments({
            GroupMember_groupId: group._id,
            GroupMember_role: "admin",
          });

          // Properly convert all ObjectIds to strings
          return {
            _id: group._id.toString(),
            Group_name: group.Group_name,
            Group_description: group.Group_description,
            Group_createdBy: group.Group_createdBy ? {
              _id: group.Group_createdBy._id.toString(),
              User_name: group.Group_createdBy.User_name,
              User_email: group.Group_createdBy.User_email
            } : null,
            Group_settings: group.Group_settings ? group.Group_settings.toString() : null,
            Group_features: group.Group_features,
            Group_statistics: group.Group_statistics,
            Group_createdAt: group.Group_createdAt,
            Group_updatedAt: group.Group_updatedAt,
            Group_invitationToken: group.Group_invitationToken,
            Group_invitationTokenExpiresAt: group.Group_invitationTokenExpiresAt,
            isCreatedByUser:
              group.Group_createdBy?._id.toString() === userId.toString(),
            userRole: membership.GroupMember_role,
            memberCount,
            adminCount,
            joinedAt: membership.GroupMember_joinedAt,
            lastActive: membership.GroupMember_lastActive,
          };
        })
    );

    // Cache the results for 10 minutes
    await cacheService.cacheQuery(cacheKey, groups, cacheService.ttl.MEDIUM);

    res.status(200).json({ success: true, groups });
  } catch (error) {
    console.error("Error fetching user groups:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});
// Search groups - must be defined BEFORE /:groupId to avoid route shadowing
router.get("/search", authenticateUser, async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    const userId = req.user._id;

    if (!q || q.trim().length === 0) {
      return res.json({ groups: [] });
    }

    // Find groups where user is a member and match search query
    const userGroups = await GroupMember.find({
      GroupMember_userId: userId,
    }).select("GroupMember_groupId");

    const groupIds = userGroups.map((member) => member.GroupMember_groupId);

    // Search in groups where user is a member
    const groups = await Group.find({
      _id: { $in: groupIds },
      $or: [
        { Group_name: { $regex: q, $options: "i" } },
        { Group_description: { $regex: q, $options: "i" } },
      ],
    })
      .limit(parseInt(limit))
      .populate("Group_createdBy", "User_name")
      .sort({ Group_createdAt: -1 });

    // Add member count to each group
    const groupsWithMemberCount = await Promise.all(
      groups.map(async (group) => {
        const memberCount = await GroupMember.countDocuments({
          GroupMember_groupId: group._id,
        });
        return {
          ...group.toObject(),
          Group_memberCount: memberCount,
        };
      })
    );

    res.json({
      success: true,
      groups: groupsWithMemberCount,
      total: groupsWithMemberCount.length,
    });
  } catch (error) {
    console.error("Group search error:", error);
    res.status(500).json({
      success: false,
      message: "Error searching groups",
      error: error.message,
    });
  }
});

// Get group members - must be defined BEFORE /:groupId to avoid route shadowing
router.get("/:groupId/members", authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    // Validate groupId format
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid group ID format.' 
      });
    }

    // Check if user is a member of the group
    const membership = await GroupMember.findOne({
      GroupMember_groupId: groupId,
      GroupMember_userId: userId,
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group",
      });
    }

    // Get all members of the group
    const members = await GroupMember.find({ 
      GroupMember_groupId: groupId 
    })
      .populate('GroupMember_userId', 'User_name User_email User_profilePicture')
      .sort({ GroupMember_joinedAt: 1 }); // Sort by join date, oldest first

    // Format the response
    const formattedMembers = members.map(member => ({
      _id: member.GroupMember_userId._id,
      User_name: member.GroupMember_userId.User_name,
      User_email: member.GroupMember_userId.User_email,
      User_profilePicture: member.GroupMember_userId.User_profilePicture,
      role: member.GroupMember_role,
      joinedAt: member.GroupMember_joinedAt,
      lastActive: member.GroupMember_lastActive,
    }));

    res.status(200).json({ 
      success: true, 
      members: formattedMembers,
      total: formattedMembers.length
    });
  } catch (error) {
    console.error('Error fetching group members:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch members',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get("/:groupId", authenticateUser, normalizeObjectIdParams(['groupId']), async (req, res) => {
  try {
    const { groupId } = req.params;

    // Validate groupId format (already normalized by middleware)
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      console.log('Invalid group ID format:', groupId);
      return res.status(400).json({ message: 'Invalid group ID format.' });
    }

    console.log('Group ID received:', groupId, 'Type:', typeof groupId);

    // Find the group by ID
    const group = await Group.findById(groupId)
      .populate({
        path: "Group_members",
        populate: {
          path: "GroupMember_userId",
          select: "User_name User_email",
        },
      })
      .populate("Group_createdBy", "User_name User_email");

    if (!group) {
      return res
        .status(404)
        .json({ success: false, message: "Group not found" });
    }

    // Check if requesting user is a member of the group
    const isMember = await GroupMember.findOne({
      GroupMember_groupId: groupId,
      GroupMember_userId: req.user._id,
    });

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group",
      });
    }

    // Check if requesting user is an admin
    const isAdmin = await group.isAdmin(req.user._id);

    res.status(200).json({
      success: true,
      group: {
        Group_id: group._id,
        Group_name: group.Group_name,
        Group_description: group.Group_description,
        Group_members: group.Group_members,
        Group_createdBy: group.Group_createdBy,
        Group_createdAt: group.Group_createdAt,
        Group_updatedAt: group.Group_updatedAt,
        isUserAdmin: isAdmin,
        isUserCreator:
          group.Group_createdBy._id.toString() === req.user._id.toString(),
      },
    });
  } catch (err) {
    console.error("Error fetching group details:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});
// Generate Invitation Link
router.get("/invite/:groupId", authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;

    // Validate groupId format
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: 'Invalid group ID format.' });
    }

    const group = await Group.findById(groupId);

    if (!group)
      return res
        .status(404)
        .json({ success: false, message: "Group not found" });

    // Check if the user is an admin using the GroupMember model
    const isAdmin = await group.isAdmin(req.user._id);

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Only admins can generate invite links",
      });
    }

    // Generate invitation token with 7-day expiry
    group.Group_invitationToken = crypto.randomBytes(16).toString("hex");
    group.Group_invitationTokenExpiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    );
    await group.save();

    res.status(200).json({
      success: true,
      invitationToken: group.Group_invitationToken,
      expiresAt: group.Group_invitationTokenExpiresAt,
    });
  } catch (error) {
    console.error("Error generating invite link:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});
// Join Group
router.post("/join/:invitationToken", authenticateUser, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { invitationToken } = req.params;
    const userId = req.user._id;

    // Find group by invitation token and check if it's still valid
    const group = await Group.findOne({
      Group_invitationToken: invitationToken,
      $or: [
        { Group_invitationTokenExpiresAt: { $exists: false } },
        { Group_invitationTokenExpiresAt: { $gt: new Date() } },
      ],
    }).session(session);

    if (!group) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Invalid, expired, or used invitation link",
      });
    }

    // Check if user is already a member
    const existingMember = await GroupMember.findOne({
      GroupMember_groupId: group._id,
      GroupMember_userId: userId,
    }).session(session);

    if (existingMember) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "You are already a member of this group",
      });
    }

    // Add user as a member
    await group.addMember(userId, "member");

    // Create notifications for existing group members about new member joining
    try {
      const io = req.app.get("io");
      const notificationNamespace = req.app.get("notificationNamespace");
      const notificationService = new NotificationService(
        io,
        notificationNamespace
      );
      const [newMember, existingMembers] = await Promise.all([
        User.findById(userId),
        GroupMember.find({
          GroupMember_groupId: group._id,
          GroupMember_userId: { $ne: userId }, // Exclude the new member
        }),
      ]);

      if (newMember && existingMembers.length > 0) {
        // Notify existing members about new member joining
        for (const member of existingMembers) {
          await notificationService.createNotification({
            userId: member.GroupMember_userId,
            type: "group",
            title: `New member joined ${group.Group_name}`,
            message: `${newMember.User_name} joined the group`,
            referenceId: group._id,
            referenceModel: "Group",
            groupId: group._id,
            fromUserId: userId,
            priority: "low",
          });
        }

        // Welcome notification for the new member
        await notificationService.createNotification({
          userId: userId,
          type: "group",
          title: `Welcome to ${group.Group_name}!`,
          message: `You have successfully joined the group "${group.Group_name}"`,
          referenceId: group._id,
          referenceModel: "Group",
          groupId: group._id,
          fromUserId: group.Group_createdBy,
          priority: "medium",
        });
      }
    } catch (notificationError) {
      console.error(
        "Error creating group join notifications:",
        notificationError
      );
      // Don't fail the group join if notification fails
    }

    // Optionally, you might want to clear the invitation token after use
    // group.Group_invitationToken = undefined;
    // group.Group_invitationTokenExpiresAt = undefined;
    // await group.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Invalidate the joining user's group cache so the new group appears immediately
    try {
      await invalidateCache(`user:${userId}:*`);
      await invalidateCache(`dashboard:summary:${userId}:*`);
    } catch (cacheError) {
      console.error("Error invalidating cache after group join:", cacheError);
      // Don't fail the join if cache invalidation fails
    }

    res.status(200).json({
      success: true,
      message: "Successfully joined the group",
      groupId: group._id,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error joining group:", error);
    res.status(500).json({
      success: false,
      message: "Failed to join group",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Update/Edit Group
router.put("/:groupId", authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { Group_name, Group_description } = req.body;
    const userId = req.user._id;

    // Validate input
    if (!Group_name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Group name is required",
      });
    }

    // Find the group
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    // Check if user is admin or creator
    const isAdmin = await group.isAdmin(userId);
    const isCreator = group.Group_createdBy.toString() === userId.toString();

    if (!isAdmin && !isCreator) {
      return res.status(403).json({
        success: false,
        message: "Only admins or group creator can edit the group",
      });
    }

    // Check if new name conflicts with existing groups (excluding current group)
    const existingGroup = await Group.findOne({
      Group_name: Group_name.trim(),
      _id: { $ne: groupId },
    });

    if (existingGroup) {
      return res.status(400).json({
        success: false,
        message: "A group with this name already exists",
      });
    }

    // Update the group
    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      {
        Group_name: Group_name.trim(),
        Group_description: Group_description?.trim() || "",
        Group_updatedAt: new Date(),
      },
      { returnDocument: 'after', runValidators: true }
    ).populate("Group_createdBy", "User_name User_email");

    // Create notification for group members about the update
    try {
      const io = req.app.get("io");
      const notificationNamespace = req.app.get("notificationNamespace");
      const notificationService = new NotificationService(
        io,
        notificationNamespace
      );

      // Get all group members except the one who made the update
      const groupMembers = await GroupMember.find({
        GroupMember_groupId: groupId,
        GroupMember_userId: { $ne: userId },
      });

      // Notify all other members about the group update
      for (const member of groupMembers) {
        await notificationService.createNotification({
          userId: member.GroupMember_userId,
          type: "group",
          title: `Group "${updatedGroup.Group_name}" updated`,
          message: `Group details have been updated`,
          referenceId: groupId,
          referenceModel: "Group",
          groupId: groupId,
          fromUserId: userId,
          priority: "low",
        });
      }
    } catch (notificationError) {
      console.error(
        "Error creating group update notifications:",
        notificationError
      );
      // Don't fail the update if notification fails
    }

    res.status(200).json({
      success: true,
      message: "Group updated successfully",
      group: updatedGroup,
    });
  } catch (error) {
    console.error("Error updating group:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.delete("/:groupId", authenticateUser, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    // Find the group
    const group = await Group.findById(groupId).session(session);
    if (!group) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    // Check if user is admin or creator
    const isAdmin = await group.isAdmin(userId);
    const isCreator = group.Group_createdBy.toString() === userId.toString();

    if (!isAdmin && !isCreator) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        success: false,
        message: "Only admins or group creator can delete the group",
      });
    }

    // Get all group members for notifications before deletion
    const groupMembers = await GroupMember.find({
      GroupMember_groupId: groupId,
    }).session(session);

    // Delete all related data in the correct order to avoid foreign key issues

    // 1. Get all video sessions for this group first (needed for cascade deletion)
    const VideoSession = require("../models/VideoSession");
    const videoSessions = await VideoSession.find({
      VideoSession_groupId: groupId,
    }).session(session);
    const videoSessionIds = videoSessions.map((session) => session._id);

    // 2. Delete all video chat messages for video sessions in this group
    if (videoSessionIds.length > 0) {
      const VideoChatMessage = require("../models/VideoChatMessage");
      await VideoChatMessage.deleteMany({
        VideoChatMessage_sessionId: { $in: videoSessionIds },
      }).session(session);

      // Delete all participants for video sessions in this group
      const Participant = require("../models/Participant");
      await Participant.deleteMany({
        Participant_sessionId: { $in: videoSessionIds },
      }).session(session);
    }

    // 3. Get all messages in this group first (needed for read receipts)
    const groupMessages = await Message.find({
      Message_groupId: groupId,
    }).session(session);
    const messageIds = groupMessages.map((msg) => msg._id);

    // 4. Delete all read receipts for messages in this group
    if (messageIds.length > 0) {
      const ReadReceipt = require("../models/ReadReceipt");
      await ReadReceipt.deleteMany({
        messageId: { $in: messageIds },
      }).session(session);
    }

    // 5. Delete all notifications related to this group
    const Notification = require("../models/Notification");
    await Notification.deleteMany({ Notification_groupId: groupId }).session(
      session
    );

    // 6. Delete all files uploaded to this group
    const File = require("../models/File");
    await File.deleteMany({ File_groupId: groupId }).session(session);

    // 7. Delete all video sessions for this group
    await VideoSession.deleteMany({ VideoSession_groupId: groupId }).session(
      session
    );

    // 8. Delete all tasks associated with the group
    await Task.deleteMany({ Task_groupId: groupId }).session(session);

    // 9. Delete all messages in the group
    await Message.deleteMany({ Message_groupId: groupId }).session(session);

    // 10. Delete all group memberships
    await GroupMember.deleteMany({ GroupMember_groupId: groupId }).session(
      session
    );

    // 11. Finally, delete the group itself
    await Group.findByIdAndDelete(groupId).session(session);

    // Create notifications for former members about group deletion
    try {
      const io = req.app.get("io");
      const notificationNamespace = req.app.get("notificationNamespace");
      const notificationService = new NotificationService(
        io,
        notificationNamespace
      );

      // Notify all former members about the group deletion
      for (const member of groupMembers) {
        if (member.GroupMember_userId.toString() === userId.toString()) {
          continue;
        }
        await notificationService.createNotification({
          userId: member.GroupMember_userId,
          type: "group",
          title: `Group "${group.Group_name}" deleted`,
          message: `The group "${group.Group_name}" has been deleted`,
          referenceId: null, // Group no longer exists
          referenceModel: "Group",
          groupId: null,
          fromUserId: userId,
          priority: "medium",
        });
      }
    } catch (notificationError) {
      console.error(
        "Error creating group deletion notifications:",
        notificationError
      );
      // Don't fail the deletion if notification fails
    }

    await session.commitTransaction();
    session.endSession();

    // Invalidate caches for all affected users so deleted groups disappear immediately
    try {
      const affectedUserIds = [
        ...new Set(
          groupMembers.map((member) => member.GroupMember_userId.toString())
        ),
      ];

      await Promise.all(
        affectedUserIds.flatMap((memberUserId) => [
          invalidateCache(`user:${memberUserId}:*`),
          invalidateCache(`dashboard:summary:${memberUserId}:*`),
        ])
      );
      await invalidateCache("query:groups:*");
    } catch (cacheError) {
      console.error("Error invalidating cache after group deletion:", cacheError);
      // Don't fail a successful deletion due to cache invalidation failure
    }

    res.status(200).json({
      success: true,
      message: "Group and all associated data deleted successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error deleting group:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Route: Update member role (promote/demote admin)
router.patch(
  "/members/:groupId/:memberId/role",
  authenticateUser,
  async (req, res) => {
    const { groupId, memberId } = req.params;
    const { role } = req.body;

    try {
      if (!memberId) {
        return res.status(400).json({ message: "Member ID is required" });
      }

      if (!role || !["admin", "moderator", "member"].includes(role)) {
        return res
          .status(400)
          .json({ message: "Valid role is required (admin, moderator, or member)" });
      }

      // Find the group by ID
      const group = await Group.findById(groupId);
      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }

      // Check if the requesting user is an admin
      const isRequestingUserAdmin = await group.isAdmin(req.user._id);
      if (!isRequestingUserAdmin) {
        return res
          .status(403)
          .json({ message: "Only admins can change member roles" });
      }

      // Prevent changing the creator's role
      if (group.Group_createdBy.toString() === memberId) {
        return res
          .status(400)
          .json({ message: "Cannot change the group creator's role" });
      }

      // Find and update the member's role
      const updatedMember = await GroupMember.findOneAndUpdate(
        { GroupMember_groupId: groupId, GroupMember_userId: memberId },
        { GroupMember_role: role },
        { returnDocument: 'after' }
      ).populate("GroupMember_userId", "User_name User_email");

      if (!updatedMember) {
        return res.status(404).json({ message: "Member not found in group" });
      }

      // Invalidate the affected member's group cache so they see their new role immediately
      try {
        await invalidateCache(`user:${memberId}:*`);
      } catch (cacheError) {
        console.error("Error invalidating cache after role change:", cacheError);
      }

      // Create notification for role change
      try {
        const io = req.app.get("io");
        const notificationNamespace = req.app.get("notificationNamespace");
        const notificationService = new NotificationService(
          io,
          notificationNamespace
        );

        const actionText =
          role === "admin" ? "promoted to admin" : "changed to member";
        await notificationService.createNotification({
          userId: memberId,
          type: "group",
          title: `Role updated in ${group.Group_name}`,
          message: `You have been ${actionText} in the group "${group.Group_name}"`,
          referenceId: group._id,
          referenceModel: "Group",
          groupId: group._id,
          fromUserId: req.user._id,
          priority: "medium",
        });
      } catch (notificationError) {
        console.error(
          "Error creating role change notification:",
          notificationError
        );
      }

      res.status(200).json({
        success: true,
        message: `Member role updated to ${role}`,
        member: {
          _id: updatedMember.GroupMember_userId._id,
          name: updatedMember.GroupMember_userId.User_name,
          email: updatedMember.GroupMember_userId.User_email,
          role: updatedMember.GroupMember_role,
        },
      });
    } catch (error) {
      console.error("Error updating member role:", error);
      res.status(500).json({
        message: "An error occurred while updating member role",
        error: error.message,
      });
    }
  }
);

// Route: Remove a member from a group
router.delete(
  "/members/:groupId/:memberId",
  authenticateUser,
  async (req, res) => {
    const { groupId, memberId } = req.params;

    try {
      if (!memberId) {
        return res.status(400).json({ message: "Member ID is required" });
      }

      // Find the group by ID
      const group = await Group.findById(groupId);
      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }

      // Check if the requesting user is an admin
      const isRequestingUserAdmin = await group.isAdmin(req.user._id);
      if (!isRequestingUserAdmin) {
        return res
          .status(403)
          .json({ message: "Only admins can remove members" });
      }

      // Prevent removing the creator
      if (group.Group_createdBy.toString() === memberId) {
        return res
          .status(400)
          .json({ message: "You cannot remove the group creator" });
      }

      // Use atomic update to remove member
      await group.removeMember(memberId);

      // Create notification for member removal
      try {
        const io = req.app.get("io");
        const notificationNamespace = req.app.get("notificationNamespace");
        const notificationService = new NotificationService(
          io,
          notificationNamespace
        );

        await notificationService.createNotification({
          userId: memberId,
          type: "group",
          title: `Removed from ${group.Group_name}`,
          message: `You have been removed from the group "${group.Group_name}"`,
          referenceId: group._id,
          referenceModel: "Group",
          groupId: group._id,
          fromUserId: req.user._id,
          priority: "high",
        });
      } catch (notificationError) {
        console.error(
          "Error creating member removal notification:",
          notificationError
        );
      }

      res.status(200).json({
        success: true,
        message: "Member removed and related data cleared",
      });
    } catch (error) {
      console.error("Error removing member:", error);
      res.status(500).json({
        message: "An error occurred while removing the member",
        error: error.message,
      });
    }
  }
);

// Get group statistics
router.get("/:groupId/stats", authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    // Validate groupId format
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: 'Invalid group ID format.' });
    }

    // Check if user is a member of the group
    const membership = await GroupMember.findOne({
      GroupMember_groupId: groupId,
      GroupMember_userId: userId,
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group",
      });
    }

    // Get group with basic info
    const group = await Group.findById(groupId).populate(
      "Group_createdBy",
      "User_name User_email"
    );

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    // Get member statistics
    const [totalMembers, adminCount, recentJoins] = await Promise.all([
      GroupMember.countDocuments({ GroupMember_groupId: groupId }),
      GroupMember.countDocuments({
        GroupMember_groupId: groupId,
        GroupMember_role: "admin",
      }),
      GroupMember.countDocuments({
        GroupMember_groupId: groupId,
        GroupMember_joinedAt: {
          $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);

    // Get task statistics if Task model exists
    let taskStats = { total: 0, completed: 0, pending: 0 };
    try {
      const Task = require("../models/Task");
      const [totalTasks, completedTasks] = await Promise.all([
        Task.countDocuments({ Task_groupId: groupId }),
        Task.countDocuments({
          Task_groupId: groupId,
          Task_status: "completed",
        }),
      ]);
      taskStats = {
        total: totalTasks,
        completed: completedTasks,
        pending: totalTasks - completedTasks,
      };
    } catch (taskError) {
      // Task model might not exist, ignore error
    }

    res.status(200).json({
      success: true,
      stats: {
        groupInfo: {
          name: group.Group_name,
          description: group.Group_description,
          createdAt: group.Group_createdAt,
          createdBy: group.Group_createdBy,
        },
        members: {
          total: totalMembers,
          admins: adminCount,
          regularMembers: totalMembers - adminCount,
          recentJoins,
        },
        tasks: taskStats,
        userRole: membership.GroupMember_role,
        isUserAdmin: membership.GroupMember_role === "admin",
        isUserCreator:
          group.Group_createdBy._id.toString() === userId.toString(),
      },
    });
  } catch (error) {
    console.error("Error fetching group stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch group statistics",
    });
  }
});

// ===== GROUP SETTINGS ROUTES =====

// Get group settings
router.get("/:groupId/settings", authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    // Check if user is a member of the group
    const membership = await GroupMember.findOne({
      GroupMember_groupId: groupId,
      GroupMember_userId: userId,
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group",
      });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    const settings = await group.getSettings();

    res.status(200).json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error("Error fetching group settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch group settings",
    });
  }
});

// Update group settings
router.put("/:groupId/settings", authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const updateData = req.body;

    // Check if user is admin
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    const isAdmin = await group.isAdmin(userId);
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Only admins can update group settings",
      });
    }

    const settings = await group.getSettings();
    
    // Update settings fields
    const permissions = updateData.permissions || updateData.GroupSettings_permissions;
    const features = updateData.features || updateData.GroupSettings_features;
    const schedule = updateData.schedule || updateData.GroupSettings_schedule;
    const moderation = updateData.moderation || updateData.GroupSettings_moderation;
    const privacy = updateData.privacy || updateData.GroupSettings_privacy;

    if (permissions) {
      Object.assign(settings.GroupSettings_permissions, permissions);
    }
    if (features) {
      Object.assign(settings.GroupSettings_features, features);
    }
    if (schedule) {
      Object.assign(settings.GroupSettings_schedule, schedule);
    }
    if (moderation) {
      Object.assign(settings.GroupSettings_moderation, moderation);
    }
    if (privacy) {
      Object.assign(settings.GroupSettings_privacy, privacy);
    }

    await settings.save();

    res.status(200).json({
      success: true,
      message: "Group settings updated successfully",
      settings,
    });
  } catch (error) {
    console.error("Error updating group settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update group settings",
    });
  }
});

// ===== CUSTOM ROLE ROUTES =====

router.get("/:groupId/roles", authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    const membership = await GroupMember.findOne({
      GroupMember_groupId: groupId,
      GroupMember_userId: userId,
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group",
      });
    }

    const roles = await GroupRole.find({ GroupRole_groupId: groupId })
      .sort({ GroupRole_createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      roles: roles.map(role => ({
        _id: role._id,
        name: role.GroupRole_name,
        permissions: role.GroupRole_permissions,
        memberCount: 0,
        createdAt: role.GroupRole_createdAt
      }))
    });
  } catch (error) {
    console.error("Error fetching group roles:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch group roles",
    });
  }
});

router.post("/:groupId/roles", authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const { name, permissions = {} } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Role name is required",
      });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    const isAdmin = await group.isAdmin(userId);
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Only admins can manage custom roles",
      });
    }

    const role = await GroupRole.create({
      GroupRole_groupId: groupId,
      GroupRole_name: name.trim(),
      GroupRole_permissions: permissions,
      GroupRole_createdBy: userId
    });

    res.status(201).json({
      success: true,
      message: "Role created successfully",
      role: {
        _id: role._id,
        name: role.GroupRole_name,
        permissions: role.GroupRole_permissions,
        memberCount: 0,
        createdAt: role.GroupRole_createdAt
      }
    });
  } catch (error) {
    console.error("Error creating group role:", error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "A role with this name already exists in this group",
      });
    }
    res.status(500).json({
      success: false,
      message: "Failed to create role",
    });
  }
});

router.delete("/:groupId/roles/:roleId", authenticateUser, async (req, res) => {
  try {
    const { groupId, roleId } = req.params;
    const userId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    const isAdmin = await group.isAdmin(userId);
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Only admins can manage custom roles",
      });
    }

    const deletedRole = await GroupRole.findOneAndDelete({
      _id: roleId,
      GroupRole_groupId: groupId
    });

    if (!deletedRole) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Role deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting group role:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete role",
    });
  }
});

// Check user permission for specific action
router.get("/:groupId/permissions/:action", authenticateUser, async (req, res) => {
  try {
    const { groupId, action } = req.params;
    const userId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    const hasPermission = await group.hasPermission(userId, action);

    res.status(200).json({
      success: true,
      hasPermission,
      action,
    });
  } catch (error) {
    console.error("Error checking permission:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check permission",
    });
  }
});

// ===== SUB-GROUP ROUTES =====

// Get all sub-groups for a group
router.get("/:groupId/subgroups", authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const { includeArchived = false } = req.query;

    // Check if user is a member of the parent group
    const membership = await GroupMember.findOne({
      GroupMember_groupId: groupId,
      GroupMember_userId: userId,
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group",
      });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    // Check if sub-groups feature is enabled
    const isFeatureEnabled = await group.isFeatureEnabled('subGroups');
    if (!isFeatureEnabled) {
      return res.status(403).json({
        success: false,
        message: "Sub-groups feature is not enabled for this group",
      });
    }

    const subGroups = await group.getSubGroups(includeArchived === 'true');

    // Filter sub-groups where user is a member or if allowAllParentMembers is true
    const accessibleSubGroups = subGroups.filter(subGroup => {
      return subGroup.SubGroup_settings.allowAllParentMembers || subGroup.isMember(userId);
    });

    res.status(200).json({
      success: true,
      subGroups: accessibleSubGroups,
    });
  } catch (error) {
    console.error("Error fetching sub-groups:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch sub-groups",
    });
  }
});

// Create a new sub-group
router.post("/:groupId/subgroups", authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const { name, description, type, settings, permissions } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Sub-group name is required",
      });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    // Check if user has permission to create sub-groups
    const hasPermission = await group.hasPermission(userId, 'createSubGroups');
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to create sub-groups",
      });
    }

    // Check if sub-groups feature is enabled
    const isFeatureEnabled = await group.isFeatureEnabled('subGroups');
    if (!isFeatureEnabled) {
      return res.status(403).json({
        success: false,
        message: "Sub-groups feature is not enabled for this group",
      });
    }

    const subGroupData = {
      name: name.trim(),
      description: description?.trim() || '',
      type: type || 'channel',
      settings: settings || {},
      permissions: permissions || {}
    };

    const subGroup = await group.createSubGroup(subGroupData, userId);

    res.status(201).json({
      success: true,
      message: "Sub-group created successfully",
      subGroup,
    });
  } catch (error) {
    console.error("Error creating sub-group:", error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "A sub-group with this name already exists in this group",
      });
    }
    res.status(500).json({
      success: false,
      message: "Failed to create sub-group",
    });
  }
});

// Get specific sub-group details
router.get("/:groupId/subgroups/:subGroupId", authenticateUser, async (req, res) => {
  try {
    const { groupId, subGroupId } = req.params;
    const userId = req.user._id;

    // Check if user is a member of the parent group
    const membership = await GroupMember.findOne({
      GroupMember_groupId: groupId,
      GroupMember_userId: userId,
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group",
      });
    }

    const subGroup = await SubGroup.findOne({
      _id: subGroupId,
      SubGroup_parentGroupId: groupId,
    }).populate('SubGroup_createdBy', 'User_name User_email')
      .populate('SubGroup_members.userId', 'User_name User_email');

    if (!subGroup) {
      return res.status(404).json({
        success: false,
        message: "Sub-group not found",
      });
    }

    // Check if user has access to this sub-group
    const hasAccess = subGroup.SubGroup_settings.allowAllParentMembers || subGroup.isMember(userId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this sub-group",
      });
    }

    res.status(200).json({
      success: true,
      subGroup,
      userRole: subGroup.getMemberRole(userId),
    });
  } catch (error) {
    console.error("Error fetching sub-group:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch sub-group",
    });
  }
});

// Update sub-group
router.put("/:groupId/subgroups/:subGroupId", authenticateUser, async (req, res) => {
  try {
    const { groupId, subGroupId } = req.params;
    const userId = req.user._id;
    const updateData = req.body;

    const subGroup = await SubGroup.findOne({
      _id: subGroupId,
      SubGroup_parentGroupId: groupId,
    });

    if (!subGroup) {
      return res.status(404).json({
        success: false,
        message: "Sub-group not found",
      });
    }

    // Check if user has permission to manage this sub-group
    const userRole = subGroup.getMemberRole(userId);
    if (!userRole || (userRole !== 'admin' && userRole !== 'moderator')) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to update this sub-group",
      });
    }

    // Update allowed fields
    if (updateData.name) subGroup.SubGroup_name = updateData.name.trim();
    if (updateData.description !== undefined) subGroup.SubGroup_description = updateData.description.trim();
    if (updateData.settings) Object.assign(subGroup.SubGroup_settings, updateData.settings);
    if (updateData.permissions) Object.assign(subGroup.SubGroup_permissions, updateData.permissions);

    await subGroup.save();

    res.status(200).json({
      success: true,
      message: "Sub-group updated successfully",
      subGroup,
    });
  } catch (error) {
    console.error("Error updating sub-group:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update sub-group",
    });
  }
});

// Add member to sub-group
router.post("/:groupId/subgroups/:subGroupId/members", authenticateUser, async (req, res) => {
  try {
    const { groupId, subGroupId } = req.params;
    const userId = req.user._id;
    const { memberId, role = 'member' } = req.body;

    if (!memberId) {
      return res.status(400).json({
        success: false,
        message: "Member ID is required",
      });
    }

    // Check if target user is a member of the parent group
    const parentMembership = await GroupMember.findOne({
      GroupMember_groupId: groupId,
      GroupMember_userId: memberId,
    });

    if (!parentMembership) {
      return res.status(400).json({
        success: false,
        message: "User is not a member of the parent group",
      });
    }

    const subGroup = await SubGroup.findOne({
      _id: subGroupId,
      SubGroup_parentGroupId: groupId,
    });

    if (!subGroup) {
      return res.status(404).json({
        success: false,
        message: "Sub-group not found",
      });
    }

    // Check if user has permission to invite members
    if (!subGroup.hasPermission(userId, 'inviteMembers')) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to add members to this sub-group",
      });
    }

    await subGroup.addMember(memberId, role);

    res.status(200).json({
      success: true,
      message: "Member added to sub-group successfully",
    });
  } catch (error) {
    console.error("Error adding member to sub-group:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add member to sub-group",
    });
  }
});

// Remove member from sub-group
router.delete("/:groupId/subgroups/:subGroupId/members/:memberId", authenticateUser, async (req, res) => {
  try {
    const { groupId, subGroupId, memberId } = req.params;
    const userId = req.user._id;

    const subGroup = await SubGroup.findOne({
      _id: subGroupId,
      SubGroup_parentGroupId: groupId,
    });

    if (!subGroup) {
      return res.status(404).json({
        success: false,
        message: "Sub-group not found",
      });
    }

    // Check if user has permission (admin/moderator or removing themselves)
    const userRole = subGroup.getMemberRole(userId);
    const canRemove = (userRole === 'admin' || userRole === 'moderator') || (userId.toString() === memberId);

    if (!canRemove) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to remove this member",
      });
    }

    await subGroup.removeMember(memberId);

    res.status(200).json({
      success: true,
      message: "Member removed from sub-group successfully",
    });
  } catch (error) {
    console.error("Error removing member from sub-group:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove member from sub-group",
    });
  }
});

// Archive/restore sub-group
router.patch("/:groupId/subgroups/:subGroupId/archive", authenticateUser, async (req, res) => {
  try {
    const { groupId, subGroupId } = req.params;
    const userId = req.user._id;
    const { archive = true } = req.body;

    const subGroup = await SubGroup.findOne({
      _id: subGroupId,
      SubGroup_parentGroupId: groupId,
    });

    if (!subGroup) {
      return res.status(404).json({
        success: false,
        message: "Sub-group not found",
      });
    }

    // Check if user is admin of the sub-group
    const userRole = subGroup.getMemberRole(userId);
    if (userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Only sub-group admins can archive/restore sub-groups",
      });
    }

    if (archive) {
      await subGroup.archive();
    } else {
      await subGroup.restore();
    }

    res.status(200).json({
      success: true,
      message: `Sub-group ${archive ? 'archived' : 'restored'} successfully`,
      subGroup,
    });
  } catch (error) {
    console.error("Error archiving/restoring sub-group:", error);
    res.status(500).json({
      success: false,
      message: "Failed to archive/restore sub-group",
    });
  }
});

module.exports = router;
