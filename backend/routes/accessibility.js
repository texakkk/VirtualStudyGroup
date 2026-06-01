const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/authMiddleware');
const accessibilityService = require('../services/accessibilityService');
const UserSettings = require('../models/UserSettings');

// @desc    Get accessibility settings for user
// @route   GET /api/accessibility/settings
// @access  Private
router.get('/settings', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const settings = await accessibilityService.getUserAccessibilitySettings(userId);

    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('Error getting accessibility settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get accessibility settings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Update accessibility settings for user
// @route   PUT /api/accessibility/settings
// @access  Private
router.put('/settings', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const accessibilitySettings = req.body;

    // Validate accessibility settings
    const validationResult = accessibilityService.validateAccessibilitySettings(accessibilitySettings);
    if (!validationResult.valid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid accessibility settings',
        errors: validationResult.errors,
      });
    }

    let userSettings = await UserSettings.findOne({ 
      UserSettings_userId: userId 
    });

    if (!userSettings) {
      userSettings = new UserSettings({
        UserSettings_userId: userId,
        UserSettings_accessibility: accessibilitySettings,
      });
    } else {
      userSettings.UserSettings_accessibility = {
        ...userSettings.UserSettings_accessibility,
        ...accessibilitySettings,
      };
    }

    await userSettings.save();

    res.json({
      success: true,
      message: 'Accessibility settings updated successfully',
      data: userSettings.UserSettings_accessibility,
    });
  } catch (error) {
    console.error('Error updating accessibility settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update accessibility settings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Get accessibility compliance report
// @route   GET /api/accessibility/compliance
// @access  Private
router.get('/compliance', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const settings = await accessibilityService.getUserAccessibilitySettings(userId);
    
    // Generate compliance report
    const complianceReport = {
      wcagLevel: 'AA', // Web Content Accessibility Guidelines Level AA
      compliance: {
        screenReader: {
          enabled: settings.screenReader,
          features: [
            'ARIA labels and descriptions',
            'Semantic HTML structure',
            'Live region announcements',
            'Keyboard navigation support'
          ],
          status: settings.screenReader ? 'compliant' : 'not-enabled'
        },
        keyboardNavigation: {
          enabled: settings.keyboardNavigation,
          features: [
            'Tab order management',
            'Keyboard shortcuts',
            'Focus indicators',
            'Skip links'
          ],
          status: settings.keyboardNavigation ? 'compliant' : 'not-enabled'
        },
        visualAccessibility: {
          highContrast: settings.highContrast,
          largeText: settings.largeText,
          reducedMotion: settings.reducedMotion,
          features: [
            'High contrast color schemes',
            'Scalable text sizes',
            'Reduced motion animations',
            'Focus indicators'
          ],
          status: (settings.highContrast || settings.largeText) ? 'compliant' : 'not-enabled'
        },
        audioVisual: {
          captions: settings.captionsEnabled,
          audioDescriptions: settings.audioDescriptions,
          features: [
            'Video captions',
            'Audio descriptions',
            'Visual indicators for audio'
          ],
          status: (settings.captionsEnabled || settings.audioDescriptions) ? 'compliant' : 'not-enabled'
        }
      },
      recommendations: []
    };

    // Add recommendations based on current settings
    if (!settings.screenReader) {
      complianceReport.recommendations.push({
        type: 'screenReader',
        priority: 'high',
        message: 'Enable screen reader support for better accessibility',
        action: 'Turn on screen reader compatibility in accessibility settings'
      });
    }

    if (!settings.keyboardNavigation) {
      complianceReport.recommendations.push({
        type: 'keyboard',
        priority: 'high',
        message: 'Enable keyboard navigation for users who cannot use a mouse',
        action: 'Turn on keyboard navigation support in accessibility settings'
      });
    }

    if (!settings.highContrast && !settings.largeText) {
      complianceReport.recommendations.push({
        type: 'visual',
        priority: 'medium',
        message: 'Consider enabling visual accessibility features',
        action: 'Enable high contrast or large text options for better visibility'
      });
    }

    res.json({
      success: true,
      data: complianceReport,
    });
  } catch (error) {
    console.error('Error generating compliance report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate compliance report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Get keyboard shortcuts for current context
// @route   GET /api/accessibility/keyboard-shortcuts
// @access  Private
router.get('/keyboard-shortcuts', authenticateUser, async (req, res) => {
  try {
    const { context = 'general' } = req.query;
    const userId = req.user.id;
    const settings = await accessibilityService.getUserAccessibilitySettings(userId);

    if (!settings.keyboardNavigation) {
      return res.json({
        success: true,
        message: 'Keyboard navigation is not enabled',
        data: { shortcuts: [], enabled: false },
      });
    }

    const shortcuts = accessibilityService.generateKeyboardInstructions(context);

    res.json({
      success: true,
      data: {
        context,
        shortcuts,
        enabled: true,
        customShortcuts: [], // Could be extended to support user-defined shortcuts
      },
    });
  } catch (error) {
    console.error('Error getting keyboard shortcuts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get keyboard shortcuts',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Test accessibility features
// @route   POST /api/accessibility/test
// @access  Private
router.post('/test', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { testType, testData } = req.body;
    const settings = await accessibilityService.getUserAccessibilitySettings(userId);

    let testResult = {};

    switch (testType) {
      case 'screenReader':
        testResult = accessibilityService.formatForScreenReader(testData, 'general');
        break;
      case 'keyboardNavigation':
        testResult = accessibilityService.generateKeyboardInstructions('general', testData);
        break;
      case 'highContrast':
        testResult = accessibilityService.addHighContrastSupport(testData);
        break;
      case 'largeText':
        testResult = accessibilityService.addLargeTextSupport(testData);
        break;
      case 'realTimeEvent':
        testResult = accessibilityService.formatRealTimeEvent(
          testData.eventType || 'test:event',
          testData.eventData || {},
          settings
        );
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid test type',
          validTypes: ['screenReader', 'keyboardNavigation', 'highContrast', 'largeText', 'realTimeEvent'],
        });
    }

    res.json({
      success: true,
      data: {
        testType,
        result: testResult,
        userSettings: settings,
      },
    });
  } catch (error) {
    console.error('Error testing accessibility features:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test accessibility features',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Get accessibility help and documentation
// @route   GET /api/accessibility/help
// @access  Private
router.get('/help', authenticateUser, async (req, res) => {
  try {
    const { topic = 'overview' } = req.query;

    const helpContent = {
      overview: {
        title: 'Accessibility Features Overview',
        description: 'Our platform supports various accessibility features to ensure inclusive access for all users.',
        features: [
          {
            name: 'Screen Reader Support',
            description: 'Enhanced compatibility with screen readers including NVDA, JAWS, and VoiceOver',
            howToEnable: 'Go to Settings > Accessibility > Enable Screen Reader Support'
          },
          {
            name: 'Keyboard Navigation',
            description: 'Full keyboard navigation support for users who cannot use a mouse',
            howToEnable: 'Go to Settings > Accessibility > Enable Keyboard Navigation'
          },
          {
            name: 'High Contrast Mode',
            description: 'High contrast color schemes for users with visual impairments',
            howToEnable: 'Go to Settings > Accessibility > Enable High Contrast'
          },
          {
            name: 'Large Text Support',
            description: 'Scalable text sizes and improved readability',
            howToEnable: 'Go to Settings > Accessibility > Enable Large Text'
          },
          {
            name: 'Reduced Motion',
            description: 'Reduced animations and motion for users with vestibular disorders',
            howToEnable: 'Go to Settings > Accessibility > Enable Reduced Motion'
          }
        ]
      },
      screenReader: {
        title: 'Screen Reader Support',
        description: 'Detailed information about screen reader compatibility and features.',
        supportedReaders: ['NVDA', 'JAWS', 'VoiceOver', 'TalkBack', 'Dragon NaturallySpeaking'],
        features: [
          'ARIA labels and descriptions',
          'Semantic HTML structure',
          'Live region announcements for real-time updates',
          'Proper heading hierarchy',
          'Alternative text for images',
          'Form field labels and instructions'
        ],
        tips: [
          'Use headings navigation (H key) to quickly move through content',
          'Use landmarks navigation (D key) to jump between page sections',
          'Use list navigation (L key) to navigate through lists',
          'Use form navigation (F key) to move between form fields'
        ]
      },
      keyboard: {
        title: 'Keyboard Navigation',
        description: 'Complete keyboard navigation support for all platform features.',
        globalShortcuts: {
          'Tab': 'Move to next interactive element',
          'Shift+Tab': 'Move to previous interactive element',
          'Enter': 'Activate buttons and links',
          'Space': 'Activate buttons and checkboxes',
          'Escape': 'Close dialogs and menus',
          'Arrow Keys': 'Navigate within components'
        },
        contextualShortcuts: {
          chat: 'Ctrl+Enter to send message, Up arrow to edit last message',
          whiteboard: 'T for text tool, P for pen, E for eraser',
          document: 'Ctrl+S to save, Ctrl+Z to undo',
          media: 'Space to play/pause, M to mute'
        }
      },
      realTime: {
        title: 'Real-Time Accessibility',
        description: 'Accessibility features for real-time collaboration and communication.',
        features: [
          'Live announcements for new messages and events',
          'Keyboard shortcuts for real-time actions',
          'Focus management during dynamic updates',
          'Reduced motion options for animations'
        ],
        bestPractices: [
          'Enable screen reader support for live announcements',
          'Use keyboard shortcuts for quick actions',
          'Enable reduced motion if animations are distracting',
          'Adjust notification frequency to avoid overwhelming announcements'
        ]
      }
    };

    const content = helpContent[topic] || helpContent.overview;

    res.json({
      success: true,
      data: {
        topic,
        content,
        availableTopics: Object.keys(helpContent),
      },
    });
  } catch (error) {
    console.error('Error getting accessibility help:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get accessibility help',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

module.exports = router;