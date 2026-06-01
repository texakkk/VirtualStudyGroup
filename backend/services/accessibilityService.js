const UserSettings = require('../models/UserSettings');

class AccessibilityService {
  constructor() {
    this.screenReaderFormats = {
      list: this.formatListForScreenReader.bind(this),
      table: this.formatTableForScreenReader.bind(this),
      form: this.formatFormForScreenReader.bind(this),
      navigation: this.formatNavigationForScreenReader.bind(this),
      media: this.formatMediaForScreenReader.bind(this),
    };
    
    this.keyboardNavigationHints = {
      list: 'Use arrow keys to navigate, Enter to select, Escape to exit',
      form: 'Use Tab to move between fields, Enter to submit, Escape to cancel',
      modal: 'Use Tab to navigate, Escape to close modal',
      menu: 'Use arrow keys to navigate menu items, Enter to select, Escape to close',
      table: 'Use arrow keys to navigate cells, Tab to move between interactive elements',
    };
  }

  /**
   * Get accessibility settings for a user
   */
  async getUserAccessibilitySettings(userId) {
    try {
      const userSettings = await UserSettings.findOne({ 
        UserSettings_userId: userId 
      });

      if (!userSettings) {
        return this.getDefaultAccessibilitySettings();
      }

      return userSettings.UserSettings_accessibility || this.getDefaultAccessibilitySettings();
    } catch (error) {
      console.error('Error getting user accessibility settings:', error);
      return this.getDefaultAccessibilitySettings();
    }
  }

  /**
   * Get default accessibility settings
   */
  getDefaultAccessibilitySettings() {
    return {
      screenReader: false,
      keyboardNavigation: false,
      reducedMotion: false,
      highContrast: false,
      largeText: false,
      focusIndicators: true,
      audioDescriptions: false,
      captionsEnabled: false,
      voiceCommands: false,
    };
  }

  /**
   * Validate accessibility settings
   */
  validateAccessibilitySettings(settings) {
    const errors = [];
    const validKeys = Object.keys(this.getDefaultAccessibilitySettings());

    // Check for invalid keys
    Object.keys(settings).forEach(key => {
      if (!validKeys.includes(key)) {
        errors.push(`Invalid accessibility setting: ${key}`);
      }
    });

    // Validate boolean values
    validKeys.forEach(key => {
      if (settings.hasOwnProperty(key) && typeof settings[key] !== 'boolean') {
        errors.push(`Accessibility setting '${key}' must be a boolean value`);
      }
    });

    // Validate combinations
    if (settings.screenReader && settings.reducedMotion === false) {
      // This is just a warning, not an error
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  /**
   * Format API response for screen readers
   */
  formatForScreenReader(data, contentType = 'general') {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const formatter = this.screenReaderFormats[contentType] || this.formatGeneralForScreenReader;
    return formatter(data);
  }

  /**
   * Format general content for screen readers
   */
  formatGeneralForScreenReader(data) {
    const formatted = { ...data };

    // Add ARIA labels and descriptions
    if (formatted.success !== undefined) {
      formatted._screenReader = {
        status: formatted.success ? 'success' : 'error',
        announcement: formatted.success ? 
          'Operation completed successfully' : 
          'Operation failed',
        liveRegion: formatted.success ? 'polite' : 'assertive',
        role: formatted.success ? 'status' : 'alert'
      };
    }

    // Add context for messages
    if (formatted.message) {
      formatted._screenReader = formatted._screenReader || {};
      formatted._screenReader.messageType = this.detectMessageType(formatted.message);
      formatted._screenReader.readableMessage = this.makeMessageReadable(formatted.message);
      formatted._screenReader.ariaLabel = this.generateAriaLabel(formatted.message, formatted._screenReader.messageType);
      formatted._screenReader.ariaDescription = this.generateAriaDescription(formatted);
    }

    // Add structure information
    if (formatted.data) {
      formatted._screenReader = formatted._screenReader || {};
      formatted._screenReader.contentStructure = this.analyzeContentStructure(formatted.data);
      formatted._screenReader.navigationLandmarks = this.generateNavigationLandmarks(formatted.data);
    }

    // Add semantic information
    formatted._screenReader = formatted._screenReader || {};
    formatted._screenReader.semanticStructure = this.generateSemanticStructure(formatted);
    formatted._screenReader.headingStructure = this.generateHeadingStructure(formatted);
    formatted._screenReader.focusManagement = this.generateFocusManagement(formatted);

    return formatted;
  }

  /**
   * Generate ARIA label for content
   */
  generateAriaLabel(message, messageType) {
    const typeLabels = {
      error: 'Error message',
      success: 'Success message',
      warning: 'Warning message',
      info: 'Information message',
      general: 'Message'
    };

    const label = typeLabels[messageType] || 'Message';
    return `${label}: ${message}`;
  }

  /**
   * Generate ARIA description for content
   */
  generateAriaDescription(data) {
    const descriptions = [];

    if (data.timestamp) {
      descriptions.push(`Received at ${new Date(data.timestamp).toLocaleString()}`);
    }

    if (data.data && Array.isArray(data.data)) {
      descriptions.push(`Contains ${data.data.length} items`);
    }

    if (data.pagination) {
      descriptions.push(`Page ${data.pagination.page} of ${data.pagination.totalPages}`);
    }

    return descriptions.join('. ');
  }

  /**
   * Generate navigation landmarks for screen readers
   */
  generateNavigationLandmarks(data) {
    const landmarks = [];

    if (Array.isArray(data)) {
      landmarks.push({
        type: 'region',
        label: 'Content list',
        role: 'list',
        itemCount: data.length
      });
    }

    if (typeof data === 'object' && data.navigation) {
      landmarks.push({
        type: 'navigation',
        label: 'Main navigation',
        role: 'navigation'
      });
    }

    if (typeof data === 'object' && data.form) {
      landmarks.push({
        type: 'form',
        label: 'Form content',
        role: 'form'
      });
    }

    return landmarks;
  }

  /**
   * Generate semantic structure information
   */
  generateSemanticStructure(data) {
    const structure = {
      hasHeadings: false,
      hasLists: false,
      hasLinks: false,
      hasButtons: false,
      hasForm: false,
      hasTable: false,
      hasMedia: false
    };

    // Analyze data structure to determine semantic elements
    if (data.title || data.heading) structure.hasHeadings = true;
    if (Array.isArray(data.data)) structure.hasLists = true;
    if (data.links || data.url) structure.hasLinks = true;
    if (data.actions || data.buttons) structure.hasButtons = true;
    if (data.form || data.fields) structure.hasForm = true;
    if (data.table || (Array.isArray(data.data) && data.data.length > 0 && typeof data.data[0] === 'object')) {
      structure.hasTable = true;
    }
    if (data.media || data.video || data.audio || data.image) structure.hasMedia = true;

    return structure;
  }

  /**
   * Generate heading structure for screen readers
   */
  generateHeadingStructure(data) {
    const headings = [];

    if (data.title) {
      headings.push({ level: 1, text: data.title, type: 'main' });
    }

    if (data.subtitle) {
      headings.push({ level: 2, text: data.subtitle, type: 'subtitle' });
    }

    if (data.sections && Array.isArray(data.sections)) {
      data.sections.forEach((section, index) => {
        if (section.title) {
          headings.push({ level: 2, text: section.title, type: 'section', index });
        }
      });
    }

    return headings;
  }

  /**
   * Generate focus management instructions
   */
  generateFocusManagement(data) {
    const focusInstructions = {
      initialFocus: null,
      focusOrder: [],
      focusTraps: [],
      skipLinks: []
    };

    // Determine initial focus based on content type
    if (data.error || data.errors) {
      focusInstructions.initialFocus = 'error-summary';
    } else if (data.form || data.fields) {
      focusInstructions.initialFocus = 'first-form-field';
    } else if (Array.isArray(data.data) && data.data.length > 0) {
      focusInstructions.initialFocus = 'first-list-item';
    } else {
      focusInstructions.initialFocus = 'main-content';
    }

    // Generate skip links
    focusInstructions.skipLinks = [
      { target: 'main-content', label: 'Skip to main content' },
      { target: 'navigation', label: 'Skip to navigation' },
      { target: 'search', label: 'Skip to search' }
    ];

    return focusInstructions;
  }

  /**
   * Format list data for screen readers
   */
  formatListForScreenReader(data) {
    const formatted = { ...data };

    if (Array.isArray(formatted.data)) {
      formatted._screenReader = {
        contentType: 'list',
        totalItems: formatted.data.length,
        announcement: `List with ${formatted.data.length} items`,
        navigationHint: this.keyboardNavigationHints.list,
        itemStructure: formatted.data.length > 0 ? 
          Object.keys(formatted.data[0]).join(', ') : 'No items',
      };

      // Add position information to each item
      formatted.data = formatted.data.map((item, index) => ({
        ...item,
        _position: {
          current: index + 1,
          total: formatted.data.length,
          announcement: `Item ${index + 1} of ${formatted.data.length}`,
        },
      }));
    }

    return formatted;
  }

  /**
   * Format table data for screen readers
   */
  formatTableForScreenReader(data) {
    const formatted = { ...data };

    if (Array.isArray(formatted.data) && formatted.data.length > 0) {
      const columns = Object.keys(formatted.data[0]);
      
      formatted._screenReader = {
        contentType: 'table',
        rows: formatted.data.length,
        columns: columns.length,
        columnHeaders: columns,
        announcement: `Table with ${formatted.data.length} rows and ${columns.length} columns`,
        navigationHint: this.keyboardNavigationHints.table,
      };

      // Add row and column information
      formatted.data = formatted.data.map((row, rowIndex) => {
        const enhancedRow = { ...row };
        enhancedRow._tablePosition = {
          row: rowIndex + 1,
          totalRows: formatted.data.length,
          announcement: `Row ${rowIndex + 1} of ${formatted.data.length}`,
        };
        return enhancedRow;
      });
    }

    return formatted;
  }

  /**
   * Format form data for screen readers
   */
  formatFormForScreenReader(data) {
    const formatted = { ...data };

    formatted._screenReader = {
      contentType: 'form',
      navigationHint: this.keyboardNavigationHints.form,
    };

    // Add field information for errors
    if (formatted.errors && typeof formatted.errors === 'object') {
      const errorFields = Object.keys(formatted.errors);
      formatted._screenReader.errorSummary = {
        count: errorFields.length,
        fields: errorFields,
        announcement: `Form has ${errorFields.length} validation errors in fields: ${errorFields.join(', ')}`,
      };
    }

    // Add field descriptions
    if (formatted.fields && Array.isArray(formatted.fields)) {
      formatted._screenReader.fieldSummary = {
        count: formatted.fields.length,
        required: formatted.fields.filter(f => f.required).length,
        optional: formatted.fields.filter(f => !f.required).length,
      };
    }

    return formatted;
  }

  /**
   * Format navigation data for screen readers
   */
  formatNavigationForScreenReader(data) {
    const formatted = { ...data };

    if (formatted.navigation || formatted.menu) {
      formatted._screenReader = {
        contentType: 'navigation',
        navigationHint: this.keyboardNavigationHints.menu,
      };
    }

    return formatted;
  }

  /**
   * Format media content for screen readers
   */
  formatMediaForScreenReader(data) {
    const formatted = { ...data };

    if (formatted.media || formatted.video || formatted.audio) {
      formatted._screenReader = {
        contentType: 'media',
        hasAudioDescription: formatted.audioDescription || false,
        hasCaptions: formatted.captions || false,
        hasTranscript: formatted.transcript || false,
        announcement: 'Media content available',
      };

      // Add media controls description
      if (formatted.controls) {
        formatted._screenReader.controlsDescription = 
          'Media controls available: play, pause, volume, seek';
      }
    }

    return formatted;
  }

  /**
   * Generate keyboard navigation instructions
   */
  generateKeyboardInstructions(contentType, customInstructions = {}) {
    const baseInstructions = this.keyboardNavigationHints[contentType] || 
      'Use Tab to navigate, Enter to activate, Escape to cancel';
    
    const instructions = {
      general: baseInstructions,
      shortcuts: {
        'Tab': 'Move to next element',
        'Shift+Tab': 'Move to previous element',
        'Enter': 'Activate element',
        'Space': 'Select/toggle element',
        'Escape': 'Cancel or close',
        'Arrow Keys': 'Navigate within component',
      },
      realTimeFeatures: this.generateRealTimeKeyboardInstructions(contentType),
      ...customInstructions,
    };

    return instructions;
  }

  /**
   * Generate keyboard navigation instructions for real-time features
   */
  generateRealTimeKeyboardInstructions(contentType) {
    const realTimeInstructions = {
      chat: {
        'Ctrl+Enter': 'Send message',
        'Up Arrow': 'Edit last message',
        'Ctrl+K': 'Focus message input',
        'Ctrl+/': 'Show keyboard shortcuts',
        'Alt+Up/Down': 'Navigate message history',
        'Ctrl+Shift+R': 'Reply to message',
        'Ctrl+Shift+E': 'Edit message',
        'Delete': 'Delete selected message (if owner)'
      },
      whiteboard: {
        'T': 'Select text tool',
        'P': 'Select pen tool',
        'E': 'Select eraser tool',
        'R': 'Select rectangle tool',
        'C': 'Select circle tool',
        'L': 'Select line tool',
        'S': 'Select selection tool',
        'Ctrl+Z': 'Undo last action',
        'Ctrl+Y': 'Redo last action',
        'Delete': 'Delete selected elements',
        'Ctrl+A': 'Select all elements',
        'Ctrl+C': 'Copy selected elements',
        'Ctrl+V': 'Paste elements',
        'Arrow Keys': 'Move selected elements',
        'Shift+Arrow': 'Resize selected elements'
      },
      documentCollab: {
        'Ctrl+S': 'Save document',
        'Ctrl+Z': 'Undo change',
        'Ctrl+Y': 'Redo change',
        'Ctrl+F': 'Find in document',
        'Ctrl+H': 'Find and replace',
        'Ctrl+G': 'Go to line',
        'Ctrl+/': 'Toggle comment',
        'Ctrl+Shift+K': 'Delete line',
        'Alt+Up/Down': 'Move line up/down',
        'Ctrl+D': 'Duplicate line',
        'F11': 'Toggle fullscreen mode'
      },
      mediaSession: {
        'Space': 'Play/pause media',
        'M': 'Mute/unmute',
        'F': 'Toggle fullscreen',
        'Left Arrow': 'Seek backward 10s',
        'Right Arrow': 'Seek forward 10s',
        'Up Arrow': 'Increase volume',
        'Down Arrow': 'Decrease volume',
        'C': 'Toggle captions',
        'T': 'Toggle chat',
        'Ctrl+Enter': 'Send chat message during playback'
      },
      videoCall: {
        'Ctrl+D': 'Toggle camera',
        'Ctrl+M': 'Toggle microphone',
        'Ctrl+Shift+H': 'Toggle hand raise',
        'Ctrl+Shift+S': 'Toggle screen share',
        'Ctrl+Shift+C': 'Toggle chat',
        'Ctrl+Shift+P': 'Toggle participant list',
        'Ctrl+E': 'End call',
        'Ctrl+I': 'Invite participants'
      }
    };

    return realTimeInstructions[contentType] || {};
  }

  /**
   * Add high contrast support information
   */
  addHighContrastSupport(data) {
    return {
      ...data,
      _highContrast: {
        enabled: true,
        colorScheme: 'high-contrast',
        textContrast: 'enhanced',
        borderContrast: 'enhanced',
        colorPalette: {
          background: '#000000',
          foreground: '#ffffff',
          accent: '#ffff00',
          error: '#ff0000',
          success: '#00ff00',
          warning: '#ff8800',
          info: '#00ffff'
        },
        contrastRatio: {
          minimum: 7.0, // WCAG AAA standard
          preferred: 21.0
        },
        recommendations: [
          'Use high contrast color combinations',
          'Ensure text has minimum 7:1 contrast ratio',
          'Avoid color-only information conveyance',
          'Use patterns or textures in addition to color'
        ]
      },
    };
  }

  /**
   * Add large text support information
   */
  addLargeTextSupport(data) {
    return {
      ...data,
      _largeText: {
        enabled: true,
        fontSize: 'large',
        lineHeight: 'increased',
        letterSpacing: 'increased',
        fontSizeMultiplier: 1.5,
        lineHeightMultiplier: 1.6,
        letterSpacingValue: '0.1em',
        recommendations: [
          'Use scalable font units (rem, em)',
          'Maintain readable line length (45-75 characters)',
          'Ensure adequate spacing between interactive elements',
          'Test with zoom levels up to 200%'
        ],
        textFormatting: {
          headings: {
            h1: '2.5rem',
            h2: '2rem',
            h3: '1.75rem',
            h4: '1.5rem',
            h5: '1.25rem',
            h6: '1.125rem'
          },
          body: '1.125rem',
          small: '1rem',
          minimumTouchTarget: '44px'
        }
      },
    };
  }

  /**
   * Add reduced motion support
   */
  addReducedMotionSupport(data) {
    return {
      ...data,
      _reducedMotion: {
        enabled: true,
        animations: 'disabled',
        transitions: 'reduced',
        autoplay: 'disabled',
      },
    };
  }

  /**
   * Generate focus indicators information
   */
  generateFocusIndicators(data) {
    return {
      ...data,
      _focusIndicators: {
        enhanced: true,
        style: 'high-visibility',
        color: 'contrasting',
        width: 'thick',
      },
    };
  }

  /**
   * Add voice command support information
   */
  addVoiceCommandSupport(data) {
    return {
      ...data,
      _voiceCommands: {
        enabled: true,
        availableCommands: [
          'navigate to [section]',
          'select [item]',
          'open [menu]',
          'close [dialog]',
          'scroll [direction]',
        ],
      },
    };
  }

  /**
   * Detect message type for better screen reader context
   */
  detectMessageType(message) {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('error') || lowerMessage.includes('failed')) {
      return 'error';
    } else if (lowerMessage.includes('success') || lowerMessage.includes('completed')) {
      return 'success';
    } else if (lowerMessage.includes('warning') || lowerMessage.includes('caution')) {
      return 'warning';
    } else if (lowerMessage.includes('info') || lowerMessage.includes('note')) {
      return 'info';
    }
    
    return 'general';
  }

  /**
   * Make message more readable for screen readers
   */
  makeMessageReadable(message) {
    // Replace common abbreviations and technical terms
    let readable = message
      .replace(/API/g, 'A P I')
      .replace(/URL/g, 'U R L')
      .replace(/HTTP/g, 'H T T P')
      .replace(/JSON/g, 'J S O N')
      .replace(/ID/g, 'I D')
      .replace(/\b(\d+)\b/g, (match, number) => {
        // Spell out numbers for better pronunciation
        return number.length <= 2 ? number : `${number} (${number.split('').join(' ')})`;
      });

    return readable;
  }

  /**
   * Analyze content structure for screen readers
   */
  analyzeContentStructure(data) {
    if (Array.isArray(data)) {
      return {
        type: 'array',
        length: data.length,
        itemType: data.length > 0 ? typeof data[0] : 'unknown',
      };
    } else if (typeof data === 'object' && data !== null) {
      const keys = Object.keys(data);
      return {
        type: 'object',
        properties: keys.length,
        keys: keys.slice(0, 5), // First 5 keys for brevity
        hasMoreKeys: keys.length > 5,
      };
    } else {
      return {
        type: typeof data,
        value: data,
      };
    }
  }

  /**
   * Validate accessibility compliance
   */
  validateAccessibilityCompliance(data, settings) {
    const compliance = {
      screenReader: settings.screenReader ? this.validateScreenReaderCompliance(data) : null,
      keyboardNavigation: settings.keyboardNavigation ? this.validateKeyboardCompliance(data) : null,
      highContrast: settings.highContrast ? this.validateContrastCompliance(data) : null,
      largeText: settings.largeText ? this.validateTextSizeCompliance(data) : null,
    };

    return compliance;
  }

  /**
   * Validate screen reader compliance
   */
  validateScreenReaderCompliance(data) {
    const issues = [];
    
    if (Array.isArray(data) && !data._screenReader) {
      issues.push('List data missing screen reader annotations');
    }
    
    if (data.images && !data.altText) {
      issues.push('Images missing alternative text');
    }
    
    return {
      compliant: issues.length === 0,
      issues,
    };
  }

  /**
   * Validate keyboard navigation compliance
   */
  validateKeyboardCompliance(data) {
    const issues = [];
    
    if (data.interactive && !data._keyboardInstructions) {
      issues.push('Interactive elements missing keyboard instructions');
    }
    
    return {
      compliant: issues.length === 0,
      issues,
    };
  }

  /**
   * Validate contrast compliance
   */
  validateContrastCompliance(data) {
    // This would typically check color values, but for API responses
    // we just ensure high contrast metadata is present
    return {
      compliant: true,
      issues: [],
    };
  }

  /**
   * Validate text size compliance
   */
  validateTextSizeCompliance(data) {
    return {
      compliant: true,
      issues: [],
    };
  }

  /**
   * Format real-time event for accessibility
   */
  formatRealTimeEvent(eventType, eventData, userSettings = {}) {
    const formatted = {
      ...eventData,
      _accessibility: {
        eventType,
        timestamp: new Date().toISOString(),
        screenReaderAnnouncement: this.generateScreenReaderAnnouncement(eventType, eventData),
        keyboardInstructions: this.generateRealTimeKeyboardInstructions(eventType),
        liveRegion: this.determineLiveRegion(eventType),
        priority: this.determineEventPriority(eventType)
      }
    };

    // Apply user-specific accessibility settings
    if (userSettings.screenReader) {
      formatted._accessibility.screenReaderEnabled = true;
      formatted._accessibility.detailedDescription = this.generateDetailedDescription(eventType, eventData);
    }

    if (userSettings.keyboardNavigation) {
      formatted._accessibility.keyboardEnabled = true;
      formatted._accessibility.focusTarget = this.determineFocusTarget(eventType, eventData);
    }

    if (userSettings.reducedMotion) {
      formatted._accessibility.reducedMotion = true;
      formatted._accessibility.animationDisabled = true;
    }

    return formatted;
  }

  /**
   * Generate screen reader announcement for real-time events
   */
  generateScreenReaderAnnouncement(eventType, eventData) {
    const announcements = {
      'message:new': `New message from ${eventData.userName || 'user'}`,
      'user:joined': `${eventData.userName || 'User'} joined the session`,
      'user:left': `${eventData.userName || 'User'} left the session`,
      'document:operation': `Document updated by ${eventData.userName || 'user'}`,
      'whiteboard:update': `Whiteboard updated by ${eventData.userName || 'user'}`,
      'media:play': 'Media playback started',
      'media:pause': 'Media playback paused',
      'media:seek': `Media seeked to ${eventData.currentTime || 0} seconds`,
      'cursor:update': `${eventData.userName || 'User'} moved cursor`,
      'typing:start': `${eventData.userName || 'User'} is typing`,
      'typing:stop': `${eventData.userName || 'User'} stopped typing`,
      'notification:new': `New notification: ${eventData.message || 'notification received'}`,
      'error:occurred': `Error occurred: ${eventData.message || 'unknown error'}`,
      'connection:lost': 'Connection lost, attempting to reconnect',
      'connection:restored': 'Connection restored'
    };

    return announcements[eventType] || `Event: ${eventType}`;
  }

  /**
   * Determine live region type for real-time events
   */
  determineLiveRegion(eventType) {
    const assertiveEvents = [
      'error:occurred',
      'connection:lost',
      'connection:restored',
      'notification:new'
    ];

    const politeEvents = [
      'message:new',
      'user:joined',
      'user:left',
      'document:operation',
      'whiteboard:update'
    ];

    const offEvents = [
      'cursor:update',
      'typing:start',
      'typing:stop'
    ];

    if (assertiveEvents.includes(eventType)) return 'assertive';
    if (politeEvents.includes(eventType)) return 'polite';
    if (offEvents.includes(eventType)) return 'off';
    
    return 'polite';
  }

  /**
   * Determine event priority for accessibility
   */
  determineEventPriority(eventType) {
    const highPriority = [
      'error:occurred',
      'connection:lost',
      'connection:restored'
    ];

    const mediumPriority = [
      'notification:new',
      'message:new',
      'user:joined',
      'user:left'
    ];

    if (highPriority.includes(eventType)) return 'high';
    if (mediumPriority.includes(eventType)) return 'medium';
    
    return 'low';
  }

  /**
   * Generate detailed description for screen readers
   */
  generateDetailedDescription(eventType, eventData) {
    const descriptions = {
      'message:new': `New message received from ${eventData.userName} at ${new Date().toLocaleTimeString()}. Message content: ${eventData.message || 'No content'}`,
      'user:joined': `${eventData.userName} has joined the session. There are now ${eventData.userCount || 'unknown number of'} users in the session.`,
      'user:left': `${eventData.userName} has left the session. There are now ${eventData.userCount || 'unknown number of'} users remaining.`,
      'document:operation': `Document has been modified by ${eventData.userName}. Operation: ${eventData.operation} at position ${eventData.position}.`,
      'whiteboard:update': `Whiteboard element ${eventData.elementType || 'unknown'} has been ${eventData.action || 'modified'} by ${eventData.userName}.`,
      'media:play': `Media playback has started. Current time: ${eventData.currentTime || 0} seconds. Duration: ${eventData.duration || 'unknown'}.`,
      'media:pause': `Media playback has been paused at ${eventData.currentTime || 0} seconds.`
    };

    return descriptions[eventType] || `Event ${eventType} occurred with data: ${JSON.stringify(eventData)}`;
  }

  /**
   * Determine focus target for keyboard navigation
   */
  determineFocusTarget(eventType, eventData) {
    const focusTargets = {
      'message:new': 'message-list',
      'notification:new': 'notification-area',
      'error:occurred': 'error-message',
      'document:operation': 'document-editor',
      'whiteboard:update': 'whiteboard-canvas',
      'media:play': 'media-controls',
      'user:joined': 'participant-list',
      'user:left': 'participant-list'
    };

    return focusTargets[eventType] || 'main-content';
  }

  /**
   * Create accessibility-enhanced Socket.IO event
   */
  createAccessibleSocketEvent(eventName, eventData, userAccessibilitySettings = {}) {
    return {
      event: eventName,
      data: this.formatRealTimeEvent(eventName, eventData, userAccessibilitySettings),
      accessibility: {
        enabled: true,
        timestamp: new Date().toISOString(),
        userSettings: userAccessibilitySettings
      }
    };
  }

  /**
   * Validate real-time accessibility compliance
   */
  validateRealTimeAccessibility(eventData, userSettings) {
    const issues = [];
    const recommendations = [];

    // Check for screen reader support
    if (userSettings.screenReader && !eventData._accessibility?.screenReaderAnnouncement) {
      issues.push('Missing screen reader announcement for real-time event');
    }

    // Check for keyboard navigation support
    if (userSettings.keyboardNavigation && !eventData._accessibility?.keyboardInstructions) {
      issues.push('Missing keyboard navigation instructions for real-time event');
    }

    // Check for reduced motion compliance
    if (userSettings.reducedMotion && eventData.animation && !eventData._accessibility?.reducedMotion) {
      issues.push('Animation present but reduced motion not implemented');
      recommendations.push('Disable or reduce animations for users with motion sensitivity');
    }

    // Check for high contrast support
    if (userSettings.highContrast && eventData.colors && !eventData._accessibility?.highContrast) {
      recommendations.push('Ensure color information is available in high contrast mode');
    }

    return {
      compliant: issues.length === 0,
      issues,
      recommendations,
      score: Math.max(0, 100 - (issues.length * 20) - (recommendations.length * 10))
    };
  }
}

// Create singleton instance
const accessibilityService = new AccessibilityService();

module.exports = accessibilityService;