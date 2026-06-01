const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Whiteboard = require("../models/Whiteboard");
const Group = require("../models/Group");
const User = require("../models/User");
const WhiteboardService = require("../services/whiteboardService");

// Middleware to authenticate JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }
    req.user = decoded.user;
    next();
  });
};

// Middleware to check if user is member of the group
const checkGroupMembership = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const isMember = group.Group_members.some(
      (member) => member.toString() === userId.toString()
    );

    if (!isMember) {
      return res.status(403).json({ message: "Access denied. Not a group member." });
    }

    req.group = group;
    next();
  } catch (error) {
    console.error("Group membership check error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// GET /api/whiteboard/group/:groupId - Get all whiteboards for a group
router.get("/group/:groupId", authenticateToken, checkGroupMembership, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    // Find whiteboards where user has at least read permission
    const whiteboards = await Whiteboard.find({
      Whiteboard_groupId: groupId,
      $or: [
        { Whiteboard_createdBy: userId },
        { "Whiteboard_permissions.read": userId },
        { "Whiteboard_permissions.write": userId },
        { "Whiteboard_permissions.admin": userId },
        { Whiteboard_isPublic: true }
      ]
    })
    .populate("Whiteboard_createdBy", "User_name User_email")
    .populate("Whiteboard_permissions.read", "User_name User_email")
    .populate("Whiteboard_permissions.write", "User_name User_email")
    .populate("Whiteboard_permissions.admin", "User_name User_email")
    .sort({ Whiteboard_updatedAt: -1 });

    // Add permission info for each whiteboard
    const whiteboardsWithPermissions = whiteboards.map(whiteboard => {
      const whiteboardObj = whiteboard.toObject();
      whiteboardObj.userPermissions = {
        read: whiteboard.hasReadPermission(userId),
        write: whiteboard.hasWritePermission(userId),
        admin: whiteboard.hasAdminPermission(userId)
      };
      // Don't send elements in list view for performance
      delete whiteboardObj.Whiteboard_elements;
      delete whiteboardObj.Whiteboard_activeUsers;
      return whiteboardObj;
    });

    res.json({
      success: true,
      whiteboards: whiteboardsWithPermissions
    });
  } catch (error) {
    console.error("Get group whiteboards error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// GET /api/whiteboard/:id - Get specific whiteboard with full data
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const whiteboard = await Whiteboard.findById(id)
      .populate("Whiteboard_createdBy", "User_name User_email")
      .populate("Whiteboard_permissions.read", "User_name User_email")
      .populate("Whiteboard_permissions.write", "User_name User_email")
      .populate("Whiteboard_permissions.admin", "User_name User_email")
      .populate("Whiteboard_activeUsers.userId", "User_name User_email");

    if (!whiteboard) {
      return res.status(404).json({ message: "Whiteboard not found" });
    }

    // Check if user has read permission
    if (!whiteboard.hasReadPermission(userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Check if user is member of the group
    const group = await Group.findById(whiteboard.Whiteboard_groupId);
    if (!group) {
      return res.status(404).json({ message: "Associated group not found" });
    }

    const isMember = group.Group_members.some(
      (member) => member.toString() === userId.toString()
    );

    if (!isMember) {
      return res.status(403).json({ message: "Access denied. Not a group member." });
    }

    const whiteboardObj = whiteboard.toObject();
    whiteboardObj.userPermissions = {
      read: whiteboard.hasReadPermission(userId),
      write: whiteboard.hasWritePermission(userId),
      admin: whiteboard.hasAdminPermission(userId)
    };

    // Only return active (non-deleted) elements
    whiteboardObj.Whiteboard_elements = whiteboard.getActiveElements();

    res.json({
      success: true,
      whiteboard: whiteboardObj
    });
  } catch (error) {
    console.error("Get whiteboard error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// POST /api/whiteboard - Create new whiteboard
router.post("/", authenticateToken, async (req, res) => {
  try {
    const {
      name,
      groupId,
      permissions = {},
      settings = {},
      isPublic = false
    } = req.body;
    const userId = req.user._id;

    // Validate required fields
    if (!name || !groupId) {
      return res.status(400).json({ message: "Name and groupId are required" });
    }

    // Validate groupId format
    const trimmedGroupId = typeof groupId === 'string' ? groupId.trim() : groupId;
    if (!mongoose.Types.ObjectId.isValid(trimmedGroupId)) {
      return res.status(400).json({ message: 'Invalid group ID format' });
    }

    // Check if user is member of the group
    const group = await Group.findById(trimmedGroupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const isMember = group.Group_members.some(
      (member) => member.toString() === userId.toString()
    );

    if (!isMember) {
      return res.status(403).json({ message: "Access denied. Not a group member." });
    }

    // Get user info for creator
    const user = await User.findById(userId).select("User_name");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Create whiteboard
    const whiteboard = new Whiteboard({
      Whiteboard_name: name,
      Whiteboard_groupId: trimmedGroupId,
      Whiteboard_createdBy: userId,
      Whiteboard_permissions: {
        read: permissions.read || [],
        write: permissions.write || [],
        admin: permissions.admin || []
      },
      Whiteboard_settings: {
        backgroundColor: settings.backgroundColor || '#ffffff',
        gridEnabled: settings.gridEnabled !== undefined ? settings.gridEnabled : true,
        gridSize: settings.gridSize || 20,
        snapToGrid: settings.snapToGrid || false,
        width: settings.width || 1920,
        height: settings.height || 1080
      },
      Whiteboard_isPublic: isPublic,
      Whiteboard_elements: [],
      Whiteboard_activeUsers: []
    });

    await whiteboard.save();

    // Populate the created whiteboard for response
    await whiteboard.populate("Whiteboard_createdBy", "User_name User_email");

    const whiteboardObj = whiteboard.toObject();
    whiteboardObj.userPermissions = {
      read: true,
      write: true,
      admin: true
    };

    res.status(201).json({
      success: true,
      message: "Whiteboard created successfully",
      whiteboard: whiteboardObj
    });
  } catch (error) {
    console.error("Create whiteboard error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// PUT /api/whiteboard/:id - Update whiteboard (name, settings, permissions)
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, settings, permissions, isPublic } = req.body;
    const userId = req.user._id;

    const whiteboard = await Whiteboard.findById(id);
    if (!whiteboard) {
      return res.status(404).json({ message: "Whiteboard not found" });
    }

    // Check if user has admin permission
    if (!whiteboard.hasAdminPermission(userId)) {
      return res.status(403).json({ message: "Admin permission required" });
    }

    // Update fields if provided
    if (name !== undefined) {
      whiteboard.Whiteboard_name = name;
    }

    if (settings !== undefined) {
      whiteboard.Whiteboard_settings = {
        ...whiteboard.Whiteboard_settings,
        ...settings
      };
    }

    if (permissions !== undefined) {
      if (permissions.read !== undefined) {
        whiteboard.Whiteboard_permissions.read = permissions.read;
      }
      if (permissions.write !== undefined) {
        whiteboard.Whiteboard_permissions.write = permissions.write;
      }
      if (permissions.admin !== undefined) {
        whiteboard.Whiteboard_permissions.admin = permissions.admin;
      }
    }

    if (isPublic !== undefined) {
      whiteboard.Whiteboard_isPublic = isPublic;
    }

    await whiteboard.save();

    // Populate for response
    await whiteboard.populate("Whiteboard_createdBy", "User_name User_email");
    await whiteboard.populate("Whiteboard_permissions.read", "User_name User_email");
    await whiteboard.populate("Whiteboard_permissions.write", "User_name User_email");
    await whiteboard.populate("Whiteboard_permissions.admin", "User_name User_email");

    const whiteboardObj = whiteboard.toObject();
    whiteboardObj.userPermissions = {
      read: whiteboard.hasReadPermission(userId),
      write: whiteboard.hasWritePermission(userId),
      admin: whiteboard.hasAdminPermission(userId)
    };

    // Don't send elements in update response for performance
    delete whiteboardObj.Whiteboard_elements;
    delete whiteboardObj.Whiteboard_activeUsers;

    res.json({
      success: true,
      message: "Whiteboard updated successfully",
      whiteboard: whiteboardObj
    });
  } catch (error) {
    console.error("Update whiteboard error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// DELETE /api/whiteboard/:id - Delete whiteboard
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const whiteboard = await Whiteboard.findById(id);
    if (!whiteboard) {
      return res.status(404).json({ message: "Whiteboard not found" });
    }

    // Check if user has admin permission or is the creator
    if (!whiteboard.hasAdminPermission(userId)) {
      return res.status(403).json({ message: "Admin permission required" });
    }

    await Whiteboard.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Whiteboard deleted successfully"
    });
  } catch (error) {
    console.error("Delete whiteboard error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// POST /api/whiteboard/:id/permissions - Add user permission
router.post("/:id/permissions", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId: targetUserId, permissionType } = req.body;
    const userId = req.user._id;

    if (!targetUserId || !permissionType) {
      return res.status(400).json({ message: "userId and permissionType are required" });
    }

    if (!['read', 'write', 'admin'].includes(permissionType)) {
      return res.status(400).json({ message: "Invalid permission type" });
    }

    const whiteboard = await Whiteboard.findById(id);
    if (!whiteboard) {
      return res.status(404).json({ message: "Whiteboard not found" });
    }

    // Check if user has admin permission
    if (!whiteboard.hasAdminPermission(userId)) {
      return res.status(403).json({ message: "Admin permission required" });
    }

    // Check if target user exists and is member of the group
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: "Target user not found" });
    }

    const group = await Group.findById(whiteboard.Whiteboard_groupId);
    const isTargetMember = group.Group_members.some(
      (member) => member.toString() === targetUserId.toString()
    );

    if (!isTargetMember) {
      return res.status(400).json({ message: "Target user is not a group member" });
    }

    // Add permission
    await whiteboard.addPermission(targetUserId, permissionType);

    res.json({
      success: true,
      message: `${permissionType} permission added for user`
    });
  } catch (error) {
    console.error("Add permission error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// DELETE /api/whiteboard/:id/permissions - Remove user permission
router.delete("/:id/permissions", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId: targetUserId, permissionType } = req.body;
    const userId = req.user._id;

    if (!targetUserId || !permissionType) {
      return res.status(400).json({ message: "userId and permissionType are required" });
    }

    if (!['read', 'write', 'admin'].includes(permissionType)) {
      return res.status(400).json({ message: "Invalid permission type" });
    }

    const whiteboard = await Whiteboard.findById(id);
    if (!whiteboard) {
      return res.status(404).json({ message: "Whiteboard not found" });
    }

    // Check if user has admin permission
    if (!whiteboard.hasAdminPermission(userId)) {
      return res.status(403).json({ message: "Admin permission required" });
    }

    // Don't allow removing permissions from creator
    if (whiteboard.Whiteboard_createdBy.toString() === targetUserId.toString()) {
      return res.status(400).json({ message: "Cannot remove permissions from creator" });
    }

    // Remove permission
    await whiteboard.removePermission(targetUserId, permissionType);

    res.json({
      success: true,
      message: `${permissionType} permission removed for user`
    });
  } catch (error) {
    console.error("Remove permission error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// GET /api/whiteboard/:id/active-users - Get currently active users on whiteboard
router.get("/:id/active-users", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const whiteboard = await Whiteboard.findById(id)
      .populate("Whiteboard_activeUsers.userId", "User_name User_email");

    if (!whiteboard) {
      return res.status(404).json({ message: "Whiteboard not found" });
    }

    // Check if user has read permission
    if (!whiteboard.hasReadPermission(userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json({
      success: true,
      activeUsers: whiteboard.Whiteboard_activeUsers
    });
  } catch (error) {
    console.error("Get active users error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// GET /api/whiteboard/tools/config - Get drawing tools configuration
router.get("/tools/config", (req, res) => {
  try {
    const toolsConfig = WhiteboardService.getDrawingToolsConfig();
    res.json({
      success: true,
      tools: toolsConfig
    });
  } catch (error) {
    console.error("Get tools config error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// POST /api/whiteboard/:id/elements - Add drawing element
router.post("/:id/elements", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { elementData } = req.body;
    const userId = req.user._id;

    if (!elementData) {
      return res.status(400).json({ message: "Element data is required" });
    }

    const result = await WhiteboardService.addDrawingElement(id, userId, elementData);

    res.json({
      success: true,
      message: "Element added successfully",
      elementId: result.elementId,
      element: result.element,
      userName: result.userName
    });
  } catch (error) {
    console.error("Add element error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// PUT /api/whiteboard/:id/elements/:elementId - Update drawing element
router.put("/:id/elements/:elementId", authenticateToken, async (req, res) => {
  try {
    const { id, elementId } = req.params;
    const { updates } = req.body;
    const userId = req.user._id;

    if (!updates) {
      return res.status(400).json({ message: "Updates are required" });
    }

    const validatedUpdates = await WhiteboardService.updateDrawingElement(id, userId, elementId, updates);

    res.json({
      success: true,
      message: "Element updated successfully",
      updates: validatedUpdates
    });
  } catch (error) {
    console.error("Update element error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// DELETE /api/whiteboard/:id/elements/:elementId - Delete drawing element
router.delete("/:id/elements/:elementId", authenticateToken, async (req, res) => {
  try {
    const { id, elementId } = req.params;
    const userId = req.user._id;

    await WhiteboardService.deleteDrawingElement(id, userId, elementId);

    res.json({
      success: true,
      message: "Element deleted successfully"
    });
  } catch (error) {
    console.error("Delete element error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// POST /api/whiteboard/:id/shapes - Create predefined shapes
router.post("/:id/shapes", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { shapeType, position, size, style } = req.body;
    const userId = req.user._id;

    if (!shapeType || !position) {
      return res.status(400).json({ message: "Shape type and position are required" });
    }

    // Create element data based on shape type
    let elementData;
    switch (shapeType) {
      case 'rectangle':
        elementData = {
          type: 'rectangle',
          data: {
            x: position.x,
            y: position.y,
            width: size?.width || 100,
            height: size?.height || 60,
            strokeColor: style?.strokeColor || '#000000',
            fillColor: style?.fillColor || 'transparent',
            strokeWidth: style?.strokeWidth || 2
          }
        };
        break;
      
      case 'circle':
        elementData = {
          type: 'circle',
          data: {
            x: position.x,
            y: position.y,
            radius: size?.radius || 50,
            strokeColor: style?.strokeColor || '#000000',
            fillColor: style?.fillColor || 'transparent',
            strokeWidth: style?.strokeWidth || 2
          }
        };
        break;
      
      case 'arrow':
        elementData = {
          type: 'arrow',
          data: {
            points: [
              { x: position.x, y: position.y },
              { x: position.x + (size?.length || 100), y: position.y }
            ],
            strokeColor: style?.strokeColor || '#000000',
            strokeWidth: style?.strokeWidth || 2
          }
        };
        break;
      
      case 'text':
        elementData = {
          type: 'text',
          data: {
            x: position.x,
            y: position.y,
            text: 'New Text',
            fontSize: style?.fontSize || 16,
            fontFamily: style?.fontFamily || 'Arial',
            strokeColor: style?.strokeColor || '#000000'
          }
        };
        break;
      
      default:
        return res.status(400).json({ message: "Invalid shape type" });
    }

    const result = await WhiteboardService.addDrawingElement(id, userId, elementData);

    res.json({
      success: true,
      message: "Shape created successfully",
      elementId: result.elementId,
      element: result.element,
      userName: result.userName
    });
  } catch (error) {
    console.error("Create shape error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// POST /api/whiteboard/:id/duplicate - Duplicate whiteboard
router.post("/:id/duplicate", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const userId = req.user._id;

    // Get original whiteboard
    const { whiteboard: originalWhiteboard, permissions } = await WhiteboardService.getWhiteboardWithPermissions(id, userId);
    
    if (!permissions.read) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Create new whiteboard with same settings
    const newWhiteboard = await WhiteboardService.createWhiteboard(
      userId,
      originalWhiteboard.Whiteboard_groupId,
      name || `${originalWhiteboard.Whiteboard_name} (Copy)`,
      {
        settings: originalWhiteboard.Whiteboard_settings,
        permissions: {
          read: [],
          write: [],
          admin: []
        },
        isPublic: false
      }
    );

    // Copy elements if user has write permission on original
    if (permissions.write) {
      const activeElements = originalWhiteboard.getActiveElements();
      for (const element of activeElements) {
        await newWhiteboard.addElement(
          WhiteboardService.generateElementId(),
          element.type,
          element.data,
          userId,
          req.user.User_name || 'User'
        );
      }
    }

    res.json({
      success: true,
      message: "Whiteboard duplicated successfully",
      whiteboard: {
        _id: newWhiteboard._id,
        Whiteboard_name: newWhiteboard.Whiteboard_name,
        Whiteboard_groupId: newWhiteboard.Whiteboard_groupId,
        Whiteboard_createdBy: newWhiteboard.Whiteboard_createdBy,
        Whiteboard_createdAt: newWhiteboard.Whiteboard_createdAt
      }
    });
  } catch (error) {
    console.error("Duplicate whiteboard error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// POST /api/whiteboard/cleanup - Cleanup inactive users (admin endpoint)
router.post("/cleanup", authenticateToken, async (req, res) => {
  try {
    const { inactiveThresholdMinutes = 30 } = req.body;
    
    const cleanedCount = await WhiteboardService.cleanupInactiveUsers(inactiveThresholdMinutes);

    res.json({
      success: true,
      message: `Cleaned up inactive users from ${cleanedCount} whiteboards`,
      cleanedWhiteboards: cleanedCount
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;