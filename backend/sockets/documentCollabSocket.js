const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Note = require("../models/Note");
const DocumentCollaboration = require("../models/DocumentCollaboration");
const UserSettings = require("../models/UserSettings");
const accessibilityService = require("../services/accessibilityService");
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

module.exports = (io) => {
  // Create a namespace for document collaboration
  const docCollabNamespace = io.of("/document-collaboration");

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
      console.error("Document collab socket auth error:", error);
      return { isAuthenticated: false, userId: null, userName: "Anonymous" };
    }
  };

  // Helper function to check document permissions
  const checkDocumentPermission = async (documentId, userId, permissionType = 'read') => {
    try {
      const note = await Note.findById(documentId);
      if (!note) {
        return { hasPermission: false, error: 'Document not found' };
      }

      let hasPermission = false;
      switch (permissionType) {
        case 'read':
          hasPermission = note.hasReadPermission(userId);
          break;
        case 'write':
          hasPermission = note.hasWritePermission(userId);
          break;
        case 'admin':
          hasPermission = note.hasAdminPermission(userId);
          break;
        default:
          hasPermission = note.hasReadPermission(userId);
      }

      return { hasPermission, note };
    } catch (error) {
      console.error("Error checking document permission:", error);
      return { hasPermission: false, error: 'Permission check failed' };
    }
  };

  // Operational Transform functions for conflict resolution
  const transformOperation = (op1, op2) => {
    // Simple operational transform for text operations
    // This is a basic implementation - in production, consider using a library like ShareJS
    
    if (op1.operation === 'insert' && op2.operation === 'insert') {
      if (op1.position <= op2.position) {
        return {
          ...op2,
          position: op2.position + (op1.content ? op1.content.length : 0)
        };
      }
      return op2;
    }
    
    if (op1.operation === 'delete' && op2.operation === 'insert') {
      if (op1.position < op2.position) {
        return {
          ...op2,
          position: Math.max(op1.position, op2.position - op1.length)
        };
      }
      return op2;
    }
    
    if (op1.operation === 'insert' && op2.operation === 'delete') {
      if (op1.position <= op2.position) {
        return {
          ...op2,
          position: op2.position + (op1.content ? op1.content.length : 0)
        };
      }
      return op2;
    }
    
    if (op1.operation === 'delete' && op2.operation === 'delete') {
      if (op1.position < op2.position) {
        return {
          ...op2,
          position: Math.max(op1.position, op2.position - op1.length),
          length: op2.position + op2.length <= op1.position + op1.length ? 
                  0 : op2.length - Math.max(0, op1.position + op1.length - op2.position)
        };
      }
      return op2;
    }
    
    return op2;
  };

  docCollabNamespace.on("connection", async (socket) => {
    // Authenticate the socket connection
    const token = socket.handshake.auth.token;
    const authResult = await authenticateSocket(token);

    socket.isAuthenticated = authResult.isAuthenticated;
    socket.userId = authResult.userId;
    socket.userName = authResult.userName;

    // Load user accessibility settings
    let userAccessibilitySettings = {};
    if (socket.isAuthenticated) {
      try {
        userAccessibilitySettings = await accessibilityService.getUserAccessibilitySettings(socket.userId);
        socket.accessibilitySettings = userAccessibilitySettings;
      } catch (error) {
        console.error('Error loading accessibility settings:', error);
        socket.accessibilitySettings = accessibilityService.getDefaultAccessibilitySettings();
      }
    }

    console.log(
      `Document collaboration socket connected: ${socket.id} (User: ${socket.userName})`
    );

    if (!socket.isAuthenticated) {
      const errorEvent = accessibilityService.createAccessibleSocketEvent(
        'error:occurred',
        { message: "Authentication required for document collaboration" },
        socket.accessibilitySettings
      );
      socket.emit("error", errorEvent.data);
      return;
    }

    // Join a document collaboration session
    socket.on("joinDocument", async (data) => {
      const { documentId } = data;
      
      try {
        // Check if user has read permission for the document
        const permissionCheck = await checkDocumentPermission(documentId, socket.userId, 'read');
        if (!permissionCheck.hasPermission) {
          socket.emit("error", { message: permissionCheck.error || "No permission to access document" });
          return;
        }

        // Join the document room
        socket.join(documentId);
        socket.currentDocumentId = documentId;

        // Find or create collaboration session
        const collaboration = await DocumentCollaboration.findOrCreate(documentId);
        
        // Add user to active users
        await collaboration.addActiveUser(socket.userId, socket.userName, socket.id);

        // Get current document content and collaboration state
        const note = permissionCheck.note;
        const activeUsers = collaboration.DocCollab_activeUsers.map(user => ({
          userId: user.userId,
          userName: user.userName,
          cursor: user.cursor,
          selection: user.selection,
          lastActivity: user.lastActivity
        }));

        // Send current state to the joining user
        socket.emit("documentJoined", {
          documentId,
          content: note.Note_content,
          version: collaboration.DocCollab_version,
          activeUsers,
          hasWritePermission: note.hasWritePermission(socket.userId)
        });

        // Notify other users that someone joined with accessibility support
        const joinEvent = accessibilityService.createAccessibleSocketEvent(
          'user:joined',
          {
            userId: socket.userId,
            userName: socket.userName,
            cursor: 0,
            selection: { start: 0, end: 0 },
            userCount: activeUsers.length + 1
          },
          socket.accessibilitySettings
        );
        socket.to(documentId).emit("userJoined", joinEvent.data);

        console.log(`User ${socket.userName} joined document ${documentId}`);
      } catch (error) {
        console.error("Error joining document:", error);
        socket.emit("error", { message: "Failed to join document collaboration" });
      }
    });

    // Handle document operations (insert, delete, format)
    socket.on("documentOperation", async (data) => {
      const { documentId, operation, position, length, content, attributes, changeId, version } = data;
      
      if (!socket.currentDocumentId || socket.currentDocumentId !== documentId) {
        socket.emit("error", { message: "Not joined to this document" });
        return;
      }

      try {
        // Check write permission
        const permissionCheck = await checkDocumentPermission(documentId, socket.userId, 'write');
        if (!permissionCheck.hasPermission) {
          socket.emit("error", { message: "No write permission for this document" });
          return;
        }

        const collaboration = await DocumentCollaboration.findOne({ DocCollab_documentId: documentId });
        if (!collaboration) {
          socket.emit("error", { message: "Collaboration session not found" });
          return;
        }

        // Generate unique change ID if not provided
        const finalChangeId = changeId || uuidv4();

        // Check for conflicts and apply operational transform
        const recentChanges = collaboration.getChangesSinceVersion(version);
        let transformedOperation = {
          operation,
          position,
          length: length || 0,
          content: content || '',
          attributes: attributes || {}
        };

        // Apply operational transform for each conflicting change
        for (const change of recentChanges) {
          if (change.userId.toString() !== socket.userId) {
            transformedOperation = transformOperation(change, transformedOperation);
          }
        }

        // Add the change to collaboration history
        await collaboration.addChange(
          socket.userId,
          transformedOperation.operation,
          transformedOperation.position,
          transformedOperation.length,
          transformedOperation.content,
          transformedOperation.attributes,
          finalChangeId
        );

        // Apply the operation to the actual document
        const note = await Note.findById(documentId);
        let newContent = note.Note_content;

        switch (transformedOperation.operation) {
          case 'insert':
            newContent = newContent.slice(0, transformedOperation.position) + 
                        transformedOperation.content + 
                        newContent.slice(transformedOperation.position);
            break;
          case 'delete':
            newContent = newContent.slice(0, transformedOperation.position) + 
                        newContent.slice(transformedOperation.position + transformedOperation.length);
            break;
          case 'replace':
            newContent = newContent.slice(0, transformedOperation.position) + 
                        transformedOperation.content + 
                        newContent.slice(transformedOperation.position + transformedOperation.length);
            break;
        }

        // Update the document
        note.Note_content = newContent;
        await note.save();

        // Broadcast the operation to all other users in the document with accessibility support
        const operationEvent = accessibilityService.createAccessibleSocketEvent(
          'document:operation',
          {
            userId: socket.userId,
            userName: socket.userName,
            operation: transformedOperation.operation,
            position: transformedOperation.position,
            length: transformedOperation.length,
            content: transformedOperation.content,
            attributes: transformedOperation.attributes,
            changeId: finalChangeId,
            version: collaboration.DocCollab_version,
            timestamp: new Date()
          },
          socket.accessibilitySettings
        );
        socket.to(documentId).emit("documentOperationApplied", operationEvent.data);

        // Send acknowledgment to the sender
        socket.emit("operationAcknowledged", {
          changeId: finalChangeId,
          version: collaboration.DocCollab_version,
          transformedOperation
        });

        console.log(`Document operation applied: ${transformedOperation.operation} at position ${transformedOperation.position} by ${socket.userName}`);
      } catch (error) {
        console.error("Error applying document operation:", error);
        socket.emit("error", { message: "Failed to apply document operation" });
      }
    });

    // Handle cursor position updates
    socket.on("cursorUpdate", async (data) => {
      const { documentId, cursor, selection } = data;
      
      if (!socket.currentDocumentId || socket.currentDocumentId !== documentId) {
        return;
      }

      try {
        const collaboration = await DocumentCollaboration.findOne({ DocCollab_documentId: documentId });
        if (collaboration) {
          await collaboration.updateUserCursor(socket.userId, cursor, selection);
          
          // Broadcast cursor update to other users
          socket.to(documentId).emit("cursorUpdated", {
            userId: socket.userId,
            userName: socket.userName,
            cursor,
            selection
          });
        }
      } catch (error) {
        console.error("Error updating cursor:", error);
      }
    });

    // Handle user leaving document
    socket.on("leaveDocument", async (documentId) => {
      try {
        socket.leave(documentId);
        
        const collaboration = await DocumentCollaboration.findOne({ DocCollab_documentId: documentId });
        if (collaboration) {
          await collaboration.removeActiveUser(socket.userId);
          
          // Notify other users that someone left with accessibility support
          const leaveEvent = accessibilityService.createAccessibleSocketEvent(
            'user:left',
            {
              userId: socket.userId,
              userName: socket.userName
            },
            socket.accessibilitySettings
          );
          socket.to(documentId).emit("userLeft", leaveEvent.data);
        }
        
        socket.currentDocumentId = null;
        console.log(`User ${socket.userName} left document ${documentId}`);
      } catch (error) {
        console.error("Error leaving document:", error);
      }
    });

    // Handle getting document history
    socket.on("getDocumentHistory", async (data) => {
      const { documentId, fromVersion, limit = 50 } = data;
      
      try {
        const permissionCheck = await checkDocumentPermission(documentId, socket.userId, 'read');
        if (!permissionCheck.hasPermission) {
          socket.emit("error", { message: "No permission to access document history" });
          return;
        }

        const collaboration = await DocumentCollaboration.findOne({ DocCollab_documentId: documentId })
          .populate('DocCollab_changes.userId', 'User_name');
        
        if (collaboration) {
          const changes = collaboration.DocCollab_changes
            .filter(change => !fromVersion || change.timestamp >= fromVersion)
            .slice(-limit)
            .map(change => ({
              userId: change.userId._id,
              userName: change.userId.User_name,
              operation: change.operation,
              position: change.position,
              length: change.length,
              content: change.content,
              attributes: change.attributes,
              timestamp: change.timestamp,
              changeId: change.changeId
            }));

          socket.emit("documentHistory", {
            documentId,
            changes,
            currentVersion: collaboration.DocCollab_version
          });
        }
      } catch (error) {
        console.error("Error getting document history:", error);
        socket.emit("error", { message: "Failed to get document history" });
      }
    });

    // Handle disconnect
    socket.on("disconnect", async () => {
      console.log(`Document collaboration socket disconnected: ${socket.id} (User: ${socket.userName})`);
      
      if (socket.currentDocumentId) {
        try {
          const collaboration = await DocumentCollaboration.findOne({ 
            DocCollab_documentId: socket.currentDocumentId 
          });
          
          if (collaboration) {
            await collaboration.removeActiveUser(socket.userId);
            
            // Notify other users that someone disconnected
            socket.to(socket.currentDocumentId).emit("userLeft", {
              userId: socket.userId,
              userName: socket.userName
            });
          }
        } catch (error) {
          console.error("Error handling document collaboration disconnect:", error);
        }
      }
    });
  });

  return docCollabNamespace;
};