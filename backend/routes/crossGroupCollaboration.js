const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const CrossGroupCollaboration = require("../models/CrossGroupCollaboration");
const Group = require("../models/Group");
const GroupMember = require("../models/GroupMember");
const { authenticateUser } = require("../middleware/authMiddleware");

// Get collaborations for a group
router.get("/group/:groupId", authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const { status = 'active' } = req.query;

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

    const collaborations = await CrossGroupCollaboration.findByGroup(groupId, status);

    res.status(200).json({
      success: true,
      collaborations,
    });
  } catch (error) {
    console.error("Error fetching group collaborations:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch collaborations",
    });
  }
});

// Get public collaborations
router.get("/public", authenticateUser, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const collaborations = await CrossGroupCollaboration.findPublicCollaborations(parseInt(limit));

    res.status(200).json({
      success: true,
      collaborations,
    });
  } catch (error) {
    console.error("Error fetching public collaborations:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch public collaborations",
    });
  }
});

// Create a new collaboration
router.post("/", authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      initiatorGroupId,
      title,
      description,
      type,
      settings = {},
      permissions = {}
    } = req.body;

    if (!initiatorGroupId || !title || !type) {
      return res.status(400).json({
        success: false,
        message: "Initiator group ID, title, and type are required",
      });
    }

    // Check if user is admin of the initiator group
    const group = await Group.findById(initiatorGroupId);
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
        message: "Only group admins can create collaborations",
      });
    }

    const collaboration = new CrossGroupCollaboration({
      CrossGroupCollab_initiatorGroupId: initiatorGroupId,
      CrossGroupCollab_title: title.trim(),
      CrossGroupCollab_description: description?.trim() || '',
      CrossGroupCollab_type: type,
      CrossGroupCollab_createdBy: userId,
      CrossGroupCollab_settings: {
        isPublic: settings.isPublic || false,
        allowMemberInvites: settings.allowMemberInvites !== false,
        requireApproval: settings.requireApproval !== false,
        maxParticipantGroups: settings.maxParticipantGroups || 10
      },
      CrossGroupCollab_permissions: {
        canInviteGroups: permissions.canInviteGroups || 'admin',
        canCreateSharedContent: permissions.canCreateSharedContent || 'member',
        canManageEvents: permissions.canManageEvents || 'admin',
        canModerateContent: permissions.canModerateContent || 'moderator'
      }
    });

    await collaboration.save();

    const populatedCollaboration = await CrossGroupCollaboration.findById(collaboration._id)
      .populate('CrossGroupCollab_createdBy', 'User_name User_email')
      .populate('CrossGroupCollab_initiatorGroupId', 'Group_name Group_description');

    res.status(201).json({
      success: true,
      message: "Collaboration created successfully",
      collaboration: populatedCollaboration,
    });
  } catch (error) {
    console.error("Error creating collaboration:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create collaboration",
    });
  }
});

// Get specific collaboration details
router.get("/:collaborationId", authenticateUser, async (req, res) => {
  try {
    const { collaborationId } = req.params;
    const userId = req.user._id;

    const collaboration = await CrossGroupCollaboration.findById(collaborationId)
      .populate('CrossGroupCollab_createdBy', 'User_name User_email')
      .populate('CrossGroupCollab_initiatorGroupId', 'Group_name Group_description')
      .populate('CrossGroupCollab_participantGroups.groupId', 'Group_name Group_description')
      .populate('CrossGroupCollab_participantGroups.invitedBy', 'User_name User_email');

    if (!collaboration) {
      return res.status(404).json({
        success: false,
        message: "Collaboration not found",
      });
    }

    // Check if user has access to this collaboration
    const participantGroupIds = [
      collaboration.CrossGroupCollab_initiatorGroupId._id,
      ...collaboration.CrossGroupCollab_participantGroups
        .filter(p => p.status === 'accepted')
        .map(p => p.groupId._id)
    ];

    const userMemberships = await GroupMember.find({
      GroupMember_groupId: { $in: participantGroupIds },
      GroupMember_userId: userId
    });

    if (userMemberships.length === 0 && !collaboration.CrossGroupCollab_settings.isPublic) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this collaboration",
      });
    }

    res.status(200).json({
      success: true,
      collaboration,
      userCanManage: await collaboration.hasPermission(userId, 'canInviteGroups'),
    });
  } catch (error) {
    console.error("Error fetching collaboration:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch collaboration",
    });
  }
});

// Update collaboration
router.put("/:collaborationId", authenticateUser, async (req, res) => {
  try {
    const { collaborationId } = req.params;
    const userId = req.user._id;
    const updateData = req.body;

    const collaboration = await CrossGroupCollaboration.findById(collaborationId);
    if (!collaboration) {
      return res.status(404).json({
        success: false,
        message: "Collaboration not found",
      });
    }

    // Check if user can manage this collaboration
    const canManage = collaboration.CrossGroupCollab_createdBy.toString() === userId.toString() ||
                     await collaboration.hasPermission(userId, 'canInviteGroups');

    if (!canManage) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to update this collaboration",
      });
    }

    // Update allowed fields
    const allowedFields = [
      'CrossGroupCollab_title',
      'CrossGroupCollab_description',
      'CrossGroupCollab_settings',
      'CrossGroupCollab_permissions',
      'CrossGroupCollab_status'
    ];

    allowedFields.forEach(field => {
      const updateField = field.replace('CrossGroupCollab_', '');
      if (updateData[updateField] !== undefined) {
        if (field === 'CrossGroupCollab_settings' || field === 'CrossGroupCollab_permissions') {
          Object.assign(collaboration[field], updateData[updateField]);
        } else {
          collaboration[field] = updateData[updateField];
        }
      }
    });

    await collaboration.save();

    const updatedCollaboration = await CrossGroupCollaboration.findById(collaborationId)
      .populate('CrossGroupCollab_createdBy', 'User_name User_email')
      .populate('CrossGroupCollab_initiatorGroupId', 'Group_name Group_description')
      .populate('CrossGroupCollab_participantGroups.groupId', 'Group_name Group_description');

    res.status(200).json({
      success: true,
      message: "Collaboration updated successfully",
      collaboration: updatedCollaboration,
    });
  } catch (error) {
    console.error("Error updating collaboration:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update collaboration",
    });
  }
});

// Invite a group to collaboration
router.post("/:collaborationId/invite", authenticateUser, async (req, res) => {
  try {
    const { collaborationId } = req.params;
    const userId = req.user._id;
    const { groupId } = req.body;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: "Group ID is required",
      });
    }

    const collaboration = await CrossGroupCollaboration.findById(collaborationId);
    if (!collaboration) {
      return res.status(404).json({
        success: false,
        message: "Collaboration not found",
      });
    }

    // Check if user has permission to invite groups
    const hasPermission = await collaboration.hasPermission(userId, 'canInviteGroups');
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to invite groups",
      });
    }

    // Check if the group exists and user is a member
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    const isMember = await GroupMember.findOne({
      GroupMember_groupId: groupId,
      GroupMember_userId: userId,
    });

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You must be a member of the group to invite it",
      });
    }

    await collaboration.inviteGroup(groupId, userId);

    res.status(200).json({
      success: true,
      message: "Group invited successfully",
    });
  } catch (error) {
    console.error("Error inviting group:", error);
    if (error.message.includes('already invited') || error.message.includes('Maximum number')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    res.status(500).json({
      success: false,
      message: "Failed to invite group",
    });
  }
});

// Respond to collaboration invitation
router.post("/:collaborationId/respond", authenticateUser, async (req, res) => {
  try {
    const { collaborationId } = req.params;
    const userId = req.user._id;
    const { groupId, status } = req.body;

    if (!groupId || !status) {
      return res.status(400).json({
        success: false,
        message: "Group ID and status are required",
      });
    }

    if (!['accepted', 'declined'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be 'accepted' or 'declined'",
      });
    }

    const collaboration = await CrossGroupCollaboration.findById(collaborationId);
    if (!collaboration) {
      return res.status(404).json({
        success: false,
        message: "Collaboration not found",
      });
    }

    // Check if user is admin of the group
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
        message: "Only group admins can respond to collaboration invitations",
      });
    }

    await collaboration.respondToInvitation(groupId, status);

    res.status(200).json({
      success: true,
      message: `Invitation ${status} successfully`,
    });
  } catch (error) {
    console.error("Error responding to invitation:", error);
    if (error.message.includes('not invited')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    res.status(500).json({
      success: false,
      message: "Failed to respond to invitation",
    });
  }
});

// Leave collaboration
router.post("/:collaborationId/leave", authenticateUser, async (req, res) => {
  try {
    const { collaborationId } = req.params;
    const userId = req.user._id;
    const { groupId } = req.body;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: "Group ID is required",
      });
    }

    const collaboration = await CrossGroupCollaboration.findById(collaborationId);
    if (!collaboration) {
      return res.status(404).json({
        success: false,
        message: "Collaboration not found",
      });
    }

    // Check if user is admin of the group
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
        message: "Only group admins can leave collaborations",
      });
    }

    // Prevent initiator group from leaving
    if (collaboration.CrossGroupCollab_initiatorGroupId.toString() === groupId) {
      return res.status(400).json({
        success: false,
        message: "Initiator group cannot leave the collaboration",
      });
    }

    await collaboration.leaveCollaboration(groupId);

    res.status(200).json({
      success: true,
      message: "Left collaboration successfully",
    });
  } catch (error) {
    console.error("Error leaving collaboration:", error);
    if (error.message.includes('not part of')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    res.status(500).json({
      success: false,
      message: "Failed to leave collaboration",
    });
  }
});

// Add shared resource
router.post("/:collaborationId/resources", authenticateUser, async (req, res) => {
  try {
    const { collaborationId } = req.params;
    const userId = req.user._id;
    const { resourceType, resourceId, title, description, permissions = {} } = req.body;

    if (!resourceType || !resourceId) {
      return res.status(400).json({
        success: false,
        message: "Resource type and ID are required",
      });
    }

    const collaboration = await CrossGroupCollaboration.findById(collaborationId);
    if (!collaboration) {
      return res.status(404).json({
        success: false,
        message: "Collaboration not found",
      });
    }

    // Check if user has permission to share content
    const hasPermission = await collaboration.hasPermission(userId, 'canCreateSharedContent');
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to share resources",
      });
    }

    const resourceData = {
      type: resourceType,
      id: resourceId,
      title,
      description,
      permissions
    };

    await collaboration.addSharedResource(resourceData, userId);

    res.status(200).json({
      success: true,
      message: "Resource shared successfully",
    });
  } catch (error) {
    console.error("Error sharing resource:", error);
    res.status(500).json({
      success: false,
      message: "Failed to share resource",
    });
  }
});

// Remove shared resource
router.delete("/:collaborationId/resources/:resourceId", authenticateUser, async (req, res) => {
  try {
    const { collaborationId, resourceId } = req.params;
    const userId = req.user._id;

    const collaboration = await CrossGroupCollaboration.findById(collaborationId);
    if (!collaboration) {
      return res.status(404).json({
        success: false,
        message: "Collaboration not found",
      });
    }

    // Check if user shared this resource or has moderation permission
    const resource = collaboration.CrossGroupCollab_sharedResources.find(r => 
      r.resourceId.toString() === resourceId
    );

    if (!resource) {
      return res.status(404).json({
        success: false,
        message: "Resource not found",
      });
    }

    const canRemove = resource.sharedBy.toString() === userId.toString() ||
                     await collaboration.hasPermission(userId, 'canModerateContent');

    if (!canRemove) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to remove this resource",
      });
    }

    await collaboration.removeSharedResource(resourceId);

    res.status(200).json({
      success: true,
      message: "Resource removed successfully",
    });
  } catch (error) {
    console.error("Error removing resource:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove resource",
    });
  }
});

// Get collaboration statistics
router.get("/:collaborationId/stats", authenticateUser, async (req, res) => {
  try {
    const { collaborationId } = req.params;
    const userId = req.user._id;

    const collaboration = await CrossGroupCollaboration.findById(collaborationId);
    if (!collaboration) {
      return res.status(404).json({
        success: false,
        message: "Collaboration not found",
      });
    }

    // Check if user has access
    const hasAccess = collaboration.isParticipant(userId) || 
                     collaboration.CrossGroupCollab_settings.isPublic;

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this collaboration",
      });
    }

    const stats = {
      totalParticipantGroups: collaboration.getActiveParticipants().length,
      totalSharedResources: collaboration.CrossGroupCollab_statistics.totalSharedResources,
      totalEvents: collaboration.CrossGroupCollab_statistics.totalEvents,
      totalMessages: collaboration.CrossGroupCollab_statistics.totalMessages,
      lastActivity: collaboration.CrossGroupCollab_statistics.lastActivity,
      status: collaboration.CrossGroupCollab_status,
      duration: collaboration.CrossGroupCollab_endDate ? 
        Math.ceil((collaboration.CrossGroupCollab_endDate - collaboration.CrossGroupCollab_startDate) / (1000 * 60 * 60 * 24)) : 
        Math.ceil((new Date() - collaboration.CrossGroupCollab_startDate) / (1000 * 60 * 60 * 24))
    };

    res.status(200).json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error("Error fetching collaboration stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch collaboration statistics",
    });
  }
});

module.exports = router;