const Whiteboard = require('../models/Whiteboard');
const Group = require('../models/Group');
const User = require('../models/User');

class WhiteboardService {
  /**
   * Create a new whiteboard with default settings
   */
  static async createWhiteboard(userId, groupId, name, options = {}) {
    try {
      // Verify user is member of the group
      const group = await Group.findById(groupId);
      if (!group) {
        throw new Error('Group not found');
      }

      const isMember = group.Group_members.some(
        member => member.toString() === userId.toString()
      );

      if (!isMember) {
        throw new Error('User is not a member of this group');
      }

      // Get user info
      const user = await User.findById(userId).select('User_name');
      if (!user) {
        throw new Error('User not found');
      }

      // Create whiteboard with enhanced default settings
      const whiteboard = new Whiteboard({
        Whiteboard_name: name,
        Whiteboard_groupId: groupId,
        Whiteboard_createdBy: userId,
        Whiteboard_permissions: {
          read: options.permissions?.read || [],
          write: options.permissions?.write || [],
          admin: options.permissions?.admin || []
        },
        Whiteboard_settings: {
          backgroundColor: options.settings?.backgroundColor || '#ffffff',
          gridEnabled: options.settings?.gridEnabled !== undefined ? options.settings.gridEnabled : true,
          gridSize: options.settings?.gridSize || 20,
          snapToGrid: options.settings?.snapToGrid || false,
          width: options.settings?.width || 1920,
          height: options.settings?.height || 1080,
          // Enhanced drawing settings
          defaultStrokeColor: options.settings?.defaultStrokeColor || '#000000',
          defaultFillColor: options.settings?.defaultFillColor || 'transparent',
          defaultStrokeWidth: options.settings?.defaultStrokeWidth || 2,
          defaultFontSize: options.settings?.defaultFontSize || 16,
          defaultFontFamily: options.settings?.defaultFontFamily || 'Arial',
          // Collaboration settings
          showCursors: options.settings?.showCursors !== undefined ? options.settings.showCursors : true,
          showUserNames: options.settings?.showUserNames !== undefined ? options.settings.showUserNames : true,
          allowAnonymousView: options.settings?.allowAnonymousView || false
        },
        Whiteboard_isPublic: options.isPublic || false,
        Whiteboard_elements: [],
        Whiteboard_activeUsers: []
      });

      await whiteboard.save();
      return whiteboard;
    } catch (error) {
      throw new Error(`Failed to create whiteboard: ${error.message}`);
    }
  }

  /**
   * Get whiteboard with user permissions
   */
  static async getWhiteboardWithPermissions(whiteboardId, userId) {
    try {
      const whiteboard = await Whiteboard.findById(whiteboardId)
        .populate('Whiteboard_createdBy', 'User_name User_email')
        .populate('Whiteboard_permissions.read', 'User_name User_email')
        .populate('Whiteboard_permissions.write', 'User_name User_email')
        .populate('Whiteboard_permissions.admin', 'User_name User_email')
        .populate('Whiteboard_activeUsers.userId', 'User_name User_email');

      if (!whiteboard) {
        throw new Error('Whiteboard not found');
      }

      // Check permissions
      const permissions = {
        read: whiteboard.hasReadPermission(userId),
        write: whiteboard.hasWritePermission(userId),
        admin: whiteboard.hasAdminPermission(userId)
      };

      if (!permissions.read) {
        throw new Error('Access denied');
      }

      return {
        whiteboard,
        permissions
      };
    } catch (error) {
      throw new Error(`Failed to get whiteboard: ${error.message}`);
    }
  }

  /**
   * Add drawing element with validation
   */
  static async addDrawingElement(whiteboardId, userId, elementData) {
    try {
      const { whiteboard, permissions } = await this.getWhiteboardWithPermissions(whiteboardId, userId);
      
      if (!permissions.write) {
        throw new Error('Write permission required');
      }

      // Validate element data
      const validatedElement = this.validateElementData(elementData);
      
      // Get user info
      const user = await User.findById(userId).select('User_name');
      
      // Generate unique element ID
      const elementId = this.generateElementId();
      
      // Add element to whiteboard
      await whiteboard.addElement(
        elementId,
        validatedElement.type,
        validatedElement.data,
        userId,
        user.User_name
      );

      return {
        elementId,
        element: validatedElement,
        userName: user.User_name
      };
    } catch (error) {
      throw new Error(`Failed to add element: ${error.message}`);
    }
  }

  /**
   * Update drawing element
   */
  static async updateDrawingElement(whiteboardId, userId, elementId, updates) {
    try {
      const { whiteboard, permissions } = await this.getWhiteboardWithPermissions(whiteboardId, userId);
      
      if (!permissions.write) {
        throw new Error('Write permission required');
      }

      // Validate updates
      const validatedUpdates = this.validateElementUpdates(updates);
      
      // Update element
      await whiteboard.updateElement(elementId, validatedUpdates, userId);

      return validatedUpdates;
    } catch (error) {
      throw new Error(`Failed to update element: ${error.message}`);
    }
  }

  /**
   * Delete drawing element
   */
  static async deleteDrawingElement(whiteboardId, userId, elementId) {
    try {
      const { whiteboard, permissions } = await this.getWhiteboardWithPermissions(whiteboardId, userId);
      
      if (!permissions.write) {
        throw new Error('Write permission required');
      }

      // Delete element
      await whiteboard.deleteElement(elementId, userId);

      return true;
    } catch (error) {
      throw new Error(`Failed to delete element: ${error.message}`);
    }
  }

  /**
   * Validate element data based on type
   */
  static validateElementData(elementData) {
    const { type, data } = elementData;
    
    // Validate element type
    const validTypes = ['line', 'rectangle', 'circle', 'text', 'image', 'arrow', 'freehand'];
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid element type: ${type}`);
    }

    // Type-specific validation
    switch (type) {
      case 'line':
      case 'arrow':
        if (!data.points || !Array.isArray(data.points) || data.points.length < 2) {
          throw new Error('Line/Arrow elements require at least 2 points');
        }
        break;
      
      case 'rectangle':
        if (typeof data.x !== 'number' || typeof data.y !== 'number' || 
            typeof data.width !== 'number' || typeof data.height !== 'number') {
          throw new Error('Rectangle elements require x, y, width, and height');
        }
        break;
      
      case 'circle':
        if (typeof data.x !== 'number' || typeof data.y !== 'number' || 
            typeof data.radius !== 'number') {
          throw new Error('Circle elements require x, y, and radius');
        }
        break;
      
      case 'text':
        if (!data.text || typeof data.text !== 'string') {
          throw new Error('Text elements require text content');
        }
        if (typeof data.x !== 'number' || typeof data.y !== 'number') {
          throw new Error('Text elements require x and y coordinates');
        }
        break;
      
      case 'image':
        if (!data.imageUrl || typeof data.imageUrl !== 'string') {
          throw new Error('Image elements require imageUrl');
        }
        break;
      
      case 'freehand':
        if (!data.points || !Array.isArray(data.points) || data.points.length < 1) {
          throw new Error('Freehand elements require at least 1 point');
        }
        break;
    }

    // Validate common properties
    if (data.strokeColor && !/^#[0-9A-Fa-f]{6}$/.test(data.strokeColor)) {
      throw new Error('Invalid stroke color format');
    }
    
    if (data.fillColor && data.fillColor !== 'transparent' && !/^#[0-9A-Fa-f]{6}$/.test(data.fillColor)) {
      throw new Error('Invalid fill color format');
    }
    
    if (data.strokeWidth && (typeof data.strokeWidth !== 'number' || data.strokeWidth < 0)) {
      throw new Error('Invalid stroke width');
    }

    return { type, data };
  }

  /**
   * Validate element updates
   */
  static validateElementUpdates(updates) {
    const validatedUpdates = {};
    
    // Validate each update property
    Object.keys(updates).forEach(key => {
      switch (key) {
        case 'strokeColor':
          if (updates[key] && !/^#[0-9A-Fa-f]{6}$/.test(updates[key])) {
            throw new Error('Invalid stroke color format');
          }
          validatedUpdates[key] = updates[key];
          break;
        
        case 'fillColor':
          if (updates[key] && updates[key] !== 'transparent' && !/^#[0-9A-Fa-f]{6}$/.test(updates[key])) {
            throw new Error('Invalid fill color format');
          }
          validatedUpdates[key] = updates[key];
          break;
        
        case 'strokeWidth':
          if (typeof updates[key] !== 'number' || updates[key] < 0) {
            throw new Error('Invalid stroke width');
          }
          validatedUpdates[key] = updates[key];
          break;
        
        case 'opacity':
          if (typeof updates[key] !== 'number' || updates[key] < 0 || updates[key] > 1) {
            throw new Error('Opacity must be between 0 and 1');
          }
          validatedUpdates[key] = updates[key];
          break;
        
        case 'x':
        case 'y':
        case 'width':
        case 'height':
        case 'radius':
        case 'rotation':
        case 'scaleX':
        case 'scaleY':
          if (typeof updates[key] !== 'number') {
            throw new Error(`${key} must be a number`);
          }
          validatedUpdates[key] = updates[key];
          break;
        
        case 'text':
          if (typeof updates[key] !== 'string') {
            throw new Error('Text must be a string');
          }
          validatedUpdates[key] = updates[key];
          break;
        
        case 'points':
          if (!Array.isArray(updates[key])) {
            throw new Error('Points must be an array');
          }
          validatedUpdates[key] = updates[key];
          break;
        
        default:
          // Allow other properties to pass through
          validatedUpdates[key] = updates[key];
      }
    });

    return validatedUpdates;
  }

  /**
   * Generate unique element ID
   */
  static generateElementId() {
    return `element_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get drawing tools configuration
   */
  static getDrawingToolsConfig() {
    return {
      tools: [
        {
          id: 'select',
          name: 'Select',
          icon: 'cursor',
          description: 'Select and move elements'
        },
        {
          id: 'pen',
          name: 'Pen',
          icon: 'edit',
          description: 'Freehand drawing',
          settings: ['strokeColor', 'strokeWidth']
        },
        {
          id: 'line',
          name: 'Line',
          icon: 'minus',
          description: 'Draw straight lines',
          settings: ['strokeColor', 'strokeWidth']
        },
        {
          id: 'arrow',
          name: 'Arrow',
          icon: 'arrow-right',
          description: 'Draw arrows',
          settings: ['strokeColor', 'strokeWidth']
        },
        {
          id: 'rectangle',
          name: 'Rectangle',
          icon: 'square',
          description: 'Draw rectangles',
          settings: ['strokeColor', 'fillColor', 'strokeWidth']
        },
        {
          id: 'circle',
          name: 'Circle',
          icon: 'circle',
          description: 'Draw circles',
          settings: ['strokeColor', 'fillColor', 'strokeWidth']
        },
        {
          id: 'text',
          name: 'Text',
          icon: 'type',
          description: 'Add text',
          settings: ['strokeColor', 'fontSize', 'fontFamily']
        },
        {
          id: 'eraser',
          name: 'Eraser',
          icon: 'eraser',
          description: 'Delete elements'
        }
      ],
      settings: {
        strokeColor: {
          type: 'color',
          default: '#000000',
          label: 'Stroke Color'
        },
        fillColor: {
          type: 'color',
          default: 'transparent',
          label: 'Fill Color'
        },
        strokeWidth: {
          type: 'number',
          default: 2,
          min: 1,
          max: 20,
          label: 'Stroke Width'
        },
        fontSize: {
          type: 'number',
          default: 16,
          min: 8,
          max: 72,
          label: 'Font Size'
        },
        fontFamily: {
          type: 'select',
          default: 'Arial',
          options: ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana'],
          label: 'Font Family'
        }
      }
    };
  }

  /**
   * Clean up inactive users from whiteboards
   */
  static async cleanupInactiveUsers(inactiveThresholdMinutes = 30) {
    try {
      const thresholdTime = new Date(Date.now() - inactiveThresholdMinutes * 60 * 1000);
      
      const whiteboards = await Whiteboard.find({
        'Whiteboard_activeUsers.lastActivity': { $lt: thresholdTime }
      });

      for (const whiteboard of whiteboards) {
        const activeUsers = whiteboard.Whiteboard_activeUsers.filter(
          user => user.lastActivity >= thresholdTime
        );
        
        if (activeUsers.length !== whiteboard.Whiteboard_activeUsers.length) {
          whiteboard.Whiteboard_activeUsers = activeUsers;
          await whiteboard.save();
        }
      }

      return whiteboards.length;
    } catch (error) {
      throw new Error(`Failed to cleanup inactive users: ${error.message}`);
    }
  }
}

module.exports = WhiteboardService;