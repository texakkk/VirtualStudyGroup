const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Whiteboard = require("../models/Whiteboard");
const WhiteboardService = require("../services/whiteboardService");
const crypto = require('crypto');

module.exports = (io) => {
  // Create a namespace for whiteboard collaboration
  const whiteboardNamespace = io.of("/whiteboard");

  // Helper function to authenticate socket token
  const authenticateSocket = async (token) => {
    if (!token) {
      return { isAuthenticated: false, userId: null, userName: "Anonymous" };
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.user?._id;

      if (!userId) {
        return { isAuthenticated: false, userId: null, userName: "Anonymous" };
      }

      const user = await User.findById(userId).select("-password");
      if (!user) {
        return { isAuthenticated: false, userId: null, userName: "Anonymous" };
      }

      return {
        isAuthenticated: true,
        userId: user._id.toString(),
        userName: user.User_name,
      };
    } catch (error) {
      console.error("Whiteboard socket auth error:", error);
      return { isAuthenticated: false, userId: null, userName: "Anonymous" };
    }
  };

  // Helper function to check whiteboard permissions
  const checkWhiteboardPermission = async (whiteboardId, userId, permissionType = 'read') => {
    try {
      const whiteboard = await Whiteboard.findById(whiteboardId);
      if (!whiteboard) {
        return { hasPermission: false, error: 'Whiteboard not found' };
      }

      let hasPermission = false;
      switch (permissionType) {
        case 'read':
          hasPermission = whiteboard.hasReadPermission(userId);
          break;
        case 'write':
          hasPermission = whiteboard.hasWritePermission(userId);
          break;
        case 'admin':
          hasPermission = whiteboard.hasAdminPermission(userId);
          break;
        default:
          hasPermission = false;
      }

      return { hasPermission, whiteboard };
    } catch (error) {
      console.error("Permission check error:", error);
      return { hasPermission: false, error: 'Permission check failed' };
    }
  };

  // Generate unique element ID
  const generateElementId = () => {
    return crypto.randomBytes(16).toString('hex');
  };

  // Handle whiteboard connections
  whiteboardNamespace.on("connection", (socket) => {
    console.log(`Whiteboard socket connected: ${socket.id}`);
    
    let currentUser = null;
    let currentWhiteboardId = null;

    // Handle authentication
    socket.on("authenticate", async (data) => {
      try {
        const { token } = data;
        const authResult = await authenticateSocket(token);
        
        currentUser = authResult;
        socket.emit("authenticated", {
          success: authResult.isAuthenticated,
          userId: authResult.userId,
          userName: authResult.userName
        });
      } catch (error) {
        console.error("Authentication error:", error);
        socket.emit("authenticated", { success: false, error: "Authentication failed" });
      }
    });

    // Handle joining a whiteboard room
    socket.on("join-whiteboard", async (data) => {
      try {
        const { whiteboardId, token } = data;
        
        // Authenticate if not already done
        if (!currentUser || !currentUser.isAuthenticated) {
          const authResult = await authenticateSocket(token);
          currentUser = authResult;
        }

        if (!currentUser.isAuthenticated) {
          socket.emit("join-error", { error: "Authentication required" });
          return;
        }

        // Check read permission
        const permissionCheck = await checkWhiteboardPermission(whiteboardId, currentUser.userId, 'read');
        if (!permissionCheck.hasPermission) {
          socket.emit("join-error", { error: permissionCheck.error || "Access denied" });
          return;
        }

        // Leave previous room if any
        if (currentWhiteboardId) {
          socket.leave(`whiteboard-${currentWhiteboardId}`);
          // Remove user from previous whiteboard's active users
          try {
            const prevWhiteboard = await Whiteboard.findById(currentWhiteboardId);
            if (prevWhiteboard) {
              await prevWhiteboard.removeActiveUser(currentUser.userId);
              socket.to(`whiteboard-${currentWhiteboardId}`).emit("user-left", {
                userId: currentUser.userId,
                userName: currentUser.userName
              });
            }
          } catch (error) {
            console.error("Error removing user from previous whiteboard:", error);
          }
        }

        // Join new room
        socket.join(`whiteboard-${whiteboardId}`);
        currentWhiteboardId = whiteboardId;

        // Add user to whiteboard's active users
        const whiteboard = permissionCheck.whiteboard;
        await whiteboard.addActiveUser(currentUser.userId, currentUser.userName, socket.id);

        // Send current whiteboard state to the joining user
        const activeElements = whiteboard.getActiveElements();
        socket.emit("whiteboard-state", {
          whiteboardId,
          elements: activeElements,
          settings: whiteboard.Whiteboard_settings,
          activeUsers: whiteboard.Whiteboard_activeUsers,
          permissions: {
            read: whiteboard.hasReadPermission(currentUser.userId),
            write: whiteboard.hasWritePermission(currentUser.userId),
            admin: whiteboard.hasAdminPermission(currentUser.userId)
          }
        });

        // Notify other users in the room
        socket.to(`whiteboard-${whiteboardId}`).emit("user-joined", {
          userId: currentUser.userId,
          userName: currentUser.userName,
          activeUsers: whiteboard.Whiteboard_activeUsers
        });

        console.log(`User ${currentUser.userName} joined whiteboard ${whiteboardId}`);
      } catch (error) {
        console.error("Join whiteboard error:", error);
        socket.emit("join-error", { error: "Failed to join whiteboard" });
      }
    });

    // Handle drawing events
    socket.on("draw-start", async (data) => {
      if (!currentUser?.isAuthenticated || !currentWhiteboardId) return;

      try {
        const { whiteboardId, elementData } = data;
        
        // Verify write permission
        const permissionCheck = await checkWhiteboardPermission(whiteboardId, currentUser.userId, 'write');
        if (!permissionCheck.hasPermission) {
          socket.emit("draw-error", { error: "No write permission" });
          return;
        }

        // Generate element ID and broadcast to room
        const elementId = generateElementId();
        const drawData = {
          elementId,
          ...elementData,
          userId: currentUser.userId,
          userName: currentUser.userName,
          timestamp: new Date()
        };

        // Broadcast to all users in the room (including sender for confirmation)
        whiteboardNamespace.to(`whiteboard-${whiteboardId}`).emit("draw-start", drawData);
      } catch (error) {
        console.error("Draw start error:", error);
        socket.emit("draw-error", { error: "Failed to start drawing" });
      }
    });

    socket.on("draw-update", async (data) => {
      if (!currentUser?.isAuthenticated || !currentWhiteboardId) return;

      try {
        const { whiteboardId, elementId, elementData } = data;
        
        // Verify write permission
        const permissionCheck = await checkWhiteboardPermission(whiteboardId, currentUser.userId, 'write');
        if (!permissionCheck.hasPermission) return;

        // Broadcast update to room
        socket.to(`whiteboard-${whiteboardId}`).emit("draw-update", {
          elementId,
          elementData,
          userId: currentUser.userId,
          timestamp: new Date()
        });
      } catch (error) {
        console.error("Draw update error:", error);
      }
    });

    socket.on("draw-end", async (data) => {
      if (!currentUser?.isAuthenticated || !currentWhiteboardId) return;

      try {
        const { whiteboardId, elementId, elementData } = data;
        
        // Verify write permission
        const permissionCheck = await checkWhiteboardPermission(whiteboardId, currentUser.userId, 'write');
        if (!permissionCheck.hasPermission) return;

        const whiteboard = permissionCheck.whiteboard;
        
        // Save element to database
        await whiteboard.addElement(
          elementId,
          elementData.type,
          elementData.data,
          currentUser.userId,
          currentUser.userName
        );

        // Broadcast final element to room
        whiteboardNamespace.to(`whiteboard-${whiteboardId}`).emit("draw-end", {
          elementId,
          elementData,
          userId: currentUser.userId,
          userName: currentUser.userName,
          timestamp: new Date()
        });
      } catch (error) {
        console.error("Draw end error:", error);
        socket.emit("draw-error", { error: "Failed to save drawing" });
      }
    });

    // Handle element updates (move, resize, style changes)
    socket.on("element-update", async (data) => {
      if (!currentUser?.isAuthenticated || !currentWhiteboardId) return;

      try {
        const { whiteboardId, elementId, updates } = data;
        
        // Verify write permission
        const permissionCheck = await checkWhiteboardPermission(whiteboardId, currentUser.userId, 'write');
        if (!permissionCheck.hasPermission) return;

        const whiteboard = permissionCheck.whiteboard;
        
        // Update element in database
        await whiteboard.updateElement(elementId, updates, currentUser.userId);

        // Broadcast update to room
        socket.to(`whiteboard-${whiteboardId}`).emit("element-update", {
          elementId,
          updates,
          userId: currentUser.userId,
          timestamp: new Date()
        });
      } catch (error) {
        console.error("Element update error:", error);
        socket.emit("element-error", { error: "Failed to update element" });
      }
    });

    // Handle element deletion
    socket.on("element-delete", async (data) => {
      if (!currentUser?.isAuthenticated || !currentWhiteboardId) return;

      try {
        const { whiteboardId, elementId } = data;
        
        // Verify write permission
        const permissionCheck = await checkWhiteboardPermission(whiteboardId, currentUser.userId, 'write');
        if (!permissionCheck.hasPermission) return;

        const whiteboard = permissionCheck.whiteboard;
        
        // Delete element from database
        await whiteboard.deleteElement(elementId, currentUser.userId);

        // Broadcast deletion to room
        whiteboardNamespace.to(`whiteboard-${whiteboardId}`).emit("element-delete", {
          elementId,
          userId: currentUser.userId,
          timestamp: new Date()
        });
      } catch (error) {
        console.error("Element delete error:", error);
        socket.emit("element-error", { error: "Failed to delete element" });
      }
    });

    // Handle cursor movement
    socket.on("cursor-move", async (data) => {
      if (!currentUser?.isAuthenticated || !currentWhiteboardId) return;

      try {
        const { whiteboardId, cursor } = data;
        
        // Update cursor in database
        const whiteboard = await Whiteboard.findById(whiteboardId);
        if (whiteboard && whiteboard.hasReadPermission(currentUser.userId)) {
          await whiteboard.updateUserCursor(currentUser.userId, cursor);
          
          // Broadcast cursor position to other users
          socket.to(`whiteboard-${whiteboardId}`).emit("cursor-move", {
            userId: currentUser.userId,
            userName: currentUser.userName,
            cursor
          });
        }
      } catch (error) {
        console.error("Cursor move error:", error);
      }
    });

    // Handle tool selection
    socket.on("tool-select", async (data) => {
      if (!currentUser?.isAuthenticated || !currentWhiteboardId) return;

      try {
        const { whiteboardId, selectedTool, toolSettings } = data;
        
        // Update tool selection in database
        const whiteboard = await Whiteboard.findById(whiteboardId);
        if (whiteboard && whiteboard.hasReadPermission(currentUser.userId)) {
          await whiteboard.updateUserTool(currentUser.userId, selectedTool, toolSettings);
          
          // Broadcast tool selection to other users
          socket.to(`whiteboard-${whiteboardId}`).emit("tool-select", {
            userId: currentUser.userId,
            userName: currentUser.userName,
            selectedTool,
            toolSettings
          });
        }
      } catch (error) {
        console.error("Tool select error:", error);
      }
    });

    // Handle whiteboard settings update
    socket.on("settings-update", async (data) => {
      if (!currentUser?.isAuthenticated || !currentWhiteboardId) return;

      try {
        const { whiteboardId, settings } = data;
        
        // Verify admin permission for settings changes
        const permissionCheck = await checkWhiteboardPermission(whiteboardId, currentUser.userId, 'admin');
        if (!permissionCheck.hasPermission) {
          socket.emit("settings-error", { error: "Admin permission required" });
          return;
        }

        const whiteboard = permissionCheck.whiteboard;
        
        // Update settings
        whiteboard.Whiteboard_settings = {
          ...whiteboard.Whiteboard_settings,
          ...settings
        };
        await whiteboard.save();

        // Broadcast settings update to room
        whiteboardNamespace.to(`whiteboard-${whiteboardId}`).emit("settings-update", {
          settings: whiteboard.Whiteboard_settings,
          updatedBy: currentUser.userName
        });
      } catch (error) {
        console.error("Settings update error:", error);
        socket.emit("settings-error", { error: "Failed to update settings" });
      }
    });

    // Handle disconnection
    socket.on("disconnect", async () => {
      console.log(`Whiteboard socket disconnected: ${socket.id}`);
      
      if (currentUser?.isAuthenticated && currentWhiteboardId) {
        try {
          // Remove user from whiteboard's active users
          const whiteboard = await Whiteboard.findById(currentWhiteboardId);
          if (whiteboard) {
            await whiteboard.removeActiveUser(currentUser.userId);
            
            // Notify other users
            socket.to(`whiteboard-${currentWhiteboardId}`).emit("user-left", {
              userId: currentUser.userId,
              userName: currentUser.userName,
              activeUsers: whiteboard.Whiteboard_activeUsers
            });
          }
        } catch (error) {
          console.error("Disconnect cleanup error:", error);
        }
      }
    });

    // Handle shape creation
    socket.on("create-shape", async (data) => {
      if (!currentUser?.isAuthenticated || !currentWhiteboardId) return;

      try {
        const { whiteboardId, shapeType, position, size, style } = data;
        
        // Verify write permission
        const permissionCheck = await checkWhiteboardPermission(whiteboardId, currentUser.userId, 'write');
        if (!permissionCheck.hasPermission) {
          socket.emit("shape-error", { error: "No write permission" });
          return;
        }

        // Create shape element data
        let elementData;
        const elementId = generateElementId();

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
            socket.emit("shape-error", { error: "Invalid shape type" });
            return;
        }

        const whiteboard = permissionCheck.whiteboard;
        
        // Save element to database
        await whiteboard.addElement(
          elementId,
          elementData.type,
          elementData.data,
          currentUser.userId,
          currentUser.userName
        );

        // Broadcast shape creation to room
        whiteboardNamespace.to(`whiteboard-${whiteboardId}`).emit("shape-created", {
          elementId,
          elementData,
          userId: currentUser.userId,
          userName: currentUser.userName,
          timestamp: new Date()
        });
      } catch (error) {
        console.error("Create shape error:", error);
        socket.emit("shape-error", { error: "Failed to create shape" });
      }
    });

    // Handle batch element operations
    socket.on("batch-operation", async (data) => {
      if (!currentUser?.isAuthenticated || !currentWhiteboardId) return;

      try {
        const { whiteboardId, operation, elementIds, operationData } = data;
        
        // Verify write permission
        const permissionCheck = await checkWhiteboardPermission(whiteboardId, currentUser.userId, 'write');
        if (!permissionCheck.hasPermission) return;

        const whiteboard = permissionCheck.whiteboard;
        const results = [];

        switch (operation) {
          case 'delete':
            for (const elementId of elementIds) {
              await whiteboard.deleteElement(elementId, currentUser.userId);
              results.push({ elementId, success: true });
            }
            break;
          
          case 'update':
            for (const elementId of elementIds) {
              await whiteboard.updateElement(elementId, operationData, currentUser.userId);
              results.push({ elementId, success: true });
            }
            break;
          
          case 'duplicate':
            for (const elementId of elementIds) {
              const originalElement = whiteboard.Whiteboard_elements.find(
                el => el.elementId === elementId && !el.isDeleted
              );
              if (originalElement) {
                const newElementId = generateElementId();
                const duplicatedData = {
                  ...originalElement.data,
                  x: (originalElement.data.x || 0) + 20,
                  y: (originalElement.data.y || 0) + 20
                };
                
                await whiteboard.addElement(
                  newElementId,
                  originalElement.type,
                  duplicatedData,
                  currentUser.userId,
                  currentUser.userName
                );
                results.push({ originalElementId: elementId, newElementId, success: true });
              }
            }
            break;
        }

        // Broadcast batch operation to room
        whiteboardNamespace.to(`whiteboard-${whiteboardId}`).emit("batch-operation-complete", {
          operation,
          results,
          userId: currentUser.userId,
          timestamp: new Date()
        });
      } catch (error) {
        console.error("Batch operation error:", error);
        socket.emit("batch-error", { error: "Failed to perform batch operation" });
      }
    });

    // Handle element selection
    socket.on("element-select", async (data) => {
      if (!currentUser?.isAuthenticated || !currentWhiteboardId) return;

      try {
        const { whiteboardId, elementIds, isMultiSelect } = data;
        
        // Broadcast selection to other users
        socket.to(`whiteboard-${whiteboardId}`).emit("element-select", {
          userId: currentUser.userId,
          userName: currentUser.userName,
          elementIds,
          isMultiSelect,
          timestamp: new Date()
        });
      } catch (error) {
        console.error("Element select error:", error);
      }
    });

    // Handle drawing mode change
    socket.on("drawing-mode-change", async (data) => {
      if (!currentUser?.isAuthenticated || !currentWhiteboardId) return;

      try {
        const { whiteboardId, drawingMode, modeSettings } = data;
        
        // Update user's drawing mode in database
        const whiteboard = await Whiteboard.findById(whiteboardId);
        if (whiteboard && whiteboard.hasReadPermission(currentUser.userId)) {
          const userIndex = whiteboard.Whiteboard_activeUsers.findIndex(
            user => user.userId.toString() === currentUser.userId.toString()
          );
          
          if (userIndex !== -1) {
            whiteboard.Whiteboard_activeUsers[userIndex].selectedTool = drawingMode;
            whiteboard.Whiteboard_activeUsers[userIndex].toolSettings = {
              ...whiteboard.Whiteboard_activeUsers[userIndex].toolSettings,
              ...modeSettings
            };
            whiteboard.Whiteboard_activeUsers[userIndex].lastActivity = new Date();
            await whiteboard.save();
          }
          
          // Broadcast mode change to other users
          socket.to(`whiteboard-${whiteboardId}`).emit("drawing-mode-change", {
            userId: currentUser.userId,
            userName: currentUser.userName,
            drawingMode,
            modeSettings
          });
        }
      } catch (error) {
        console.error("Drawing mode change error:", error);
      }
    });

    // Handle leaving whiteboard
    socket.on("leave-whiteboard", async (data) => {
      if (!currentUser?.isAuthenticated || !currentWhiteboardId) return;

      try {
        const { whiteboardId } = data;
        
        // Remove user from whiteboard's active users
        const whiteboard = await Whiteboard.findById(whiteboardId);
        if (whiteboard) {
          await whiteboard.removeActiveUser(currentUser.userId);
          
          // Leave socket room
          socket.leave(`whiteboard-${whiteboardId}`);
          
          // Notify other users
          socket.to(`whiteboard-${whiteboardId}`).emit("user-left", {
            userId: currentUser.userId,
            userName: currentUser.userName,
            activeUsers: whiteboard.Whiteboard_activeUsers
          });
          
          currentWhiteboardId = null;
        }
      } catch (error) {
        console.error("Leave whiteboard error:", error);
      }
    });
  });

  return whiteboardNamespace;
};