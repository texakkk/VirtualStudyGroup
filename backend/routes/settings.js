const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const UserSettings = require('../models/UserSettings');
const { authenticateUser } = require('../middleware/authMiddleware');

// @desc    Update user password
// @route   PUT /api/settings/password
// @access  Private
router.put('/password', authenticateUser, async (req, res) => {
  try {
    console.log('Password update request received', { body: req.body });
    
    const { currentPassword, newPassword } = req.body;
    
    // Input validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'Current password and new password are required',
        receivedFields: Object.keys(req.body)
      });
    }
    
    // Get the email from the authenticated user
    const email = req.user.User_email;

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false,
        message: 'Password must be at least 6 characters long' 
      });
    }

    // Check if new password is different from current password
    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from current password'
      });
    }

    // Get user with password field
    const user = await User.findById(req.user.id).select('+User_password');
    
    if (!user) {
      console.error('User not found');
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    // Verify the provided email matches the user's email
    if (user.User_email !== email) {
      return res.status(400).json({
        success: false,
        message: 'The provided email does not match your account email'
      });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.User_password);
    if (!isMatch) {
      console.log('Current password is incorrect');
      return res.status(400).json({ 
        success: false,
        message: 'Current password is incorrect' 
      });
    }

    // Hash and update new password
    try {
      user.User_password = newPassword;
      user.User_tokenVersion = (user.User_tokenVersion || 0) + 1;
      
      try {
        await user.save();
        console.log('Password updated successfully');
        
        // Return success response
        res.json({ 
          success: true, 
          message: 'Password updated successfully. You will be logged out.',
          tokenVersion: user.User_tokenVersion
        });
      } catch (error) {
        console.error('Error saving user after password update:', error);
        return res.status(500).json({
          success: false,
          message: 'Error updating password. Please try again.'
        });
      }
    } catch (dbError) {
      console.error('Error saving new password:', dbError);
      return res.status(500).json({ 
        success: false,
        message: 'Failed to save new password',
        error: dbError.message 
      });
    }
  } catch (error) {
    console.error('Error updating password:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Delete user account
// @route   DELETE /api/settings/account
// @access  Private
router.delete('/account', authenticateUser, async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ 
        success: false,
        message: 'Password is required to delete account' 
      });
    }

    // Get user with password field
    const user = await User.findById(req.user.id).select('+User_password');
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.User_password);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false,
        message: 'Incorrect password' 
      });
    }

    // Delete user account
    await User.findByIdAndDelete(req.user.id);
    
    res.json({ 
      success: true, 
      message: 'Your account has been permanently deleted',
      redirect: '/'
    });
    
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to delete account',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Get user settings
// @route   GET /api/settings
// @access  Private
router.get('/', authenticateUser, async (req, res) => {
  try {
    let userSettings = await UserSettings.findOne({ 
      UserSettings_userId: req.user.id 
    });

    // If no settings exist, create default settings
    if (!userSettings) {
      userSettings = new UserSettings({
        UserSettings_userId: req.user.id,
      });
      await userSettings.save();
    }

    res.json({
      success: true,
      data: userSettings,
    });
  } catch (error) {
    console.error('Error fetching user settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user settings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Update user settings
// @route   PUT /api/settings
// @access  Private
router.put('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const updateData = req.body;

    // Remove userId from update data to prevent modification
    delete updateData.UserSettings_userId;
    delete updateData._id;

    let userSettings = await UserSettings.findOne({ 
      UserSettings_userId: userId 
    });

    if (!userSettings) {
      // Create new settings if they don't exist
      userSettings = new UserSettings({
        UserSettings_userId: userId,
        ...updateData,
      });
    } else {
      // Update existing settings
      Object.assign(userSettings, updateData);
    }

    await userSettings.save();

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: userSettings,
    });
  } catch (error) {
    console.error('Error updating user settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user settings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Update theme settings
// @route   PUT /api/settings/theme
// @access  Private
router.put('/theme', authenticateUser, async (req, res) => {
  try {
    const { theme, fontSize, colorScheme } = req.body;
    const userId = req.user.id;

    let userSettings = await UserSettings.findOne({ 
      UserSettings_userId: userId 
    });

    if (!userSettings) {
      userSettings = new UserSettings({ UserSettings_userId: userId });
    }

    if (theme) userSettings.UserSettings_theme = theme;
    if (fontSize) userSettings.UserSettings_fontSize = fontSize;
    if (colorScheme) userSettings.UserSettings_colorScheme = colorScheme;

    await userSettings.save();

    res.json({
      success: true,
      message: 'Theme settings updated successfully',
      data: {
        theme: userSettings.UserSettings_theme,
        fontSize: userSettings.UserSettings_fontSize,
        colorScheme: userSettings.UserSettings_colorScheme,
      },
    });
  } catch (error) {
    console.error('Error updating theme settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update theme settings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Update accessibility settings
// @route   PUT /api/settings/accessibility
// @access  Private
router.put('/accessibility', authenticateUser, async (req, res) => {
  try {
    const accessibilitySettings = req.body;
    const userId = req.user.id;

    let userSettings = await UserSettings.findOne({ 
      UserSettings_userId: userId 
    });

    if (!userSettings) {
      userSettings = new UserSettings({ UserSettings_userId: userId });
    }

    // Update accessibility settings
    userSettings.UserSettings_accessibility = {
      ...userSettings.UserSettings_accessibility,
      ...accessibilitySettings,
    };

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

// @desc    Update notification settings
// @route   PUT /api/settings/notifications
// @access  Private
router.put('/notifications', authenticateUser, async (req, res) => {
  try {
    const notificationSettings = req.body;
    const userId = req.user.id;

    let userSettings = await UserSettings.findOne({ 
      UserSettings_userId: userId 
    });

    if (!userSettings) {
      userSettings = new UserSettings({ UserSettings_userId: userId });
    }

    // Update notification settings
    userSettings.UserSettings_notifications = {
      ...userSettings.UserSettings_notifications,
      ...notificationSettings,
    };

    await userSettings.save();

    res.json({
      success: true,
      message: 'Notification settings updated successfully',
      data: userSettings.UserSettings_notifications,
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notification settings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Update privacy settings
// @route   PUT /api/settings/privacy
// @access  Private
router.put('/privacy', authenticateUser, async (req, res) => {
  try {
    const privacySettings = req.body;
    const userId = req.user.id;

    let userSettings = await UserSettings.findOne({ 
      UserSettings_userId: userId 
    });

    if (!userSettings) {
      userSettings = new UserSettings({ UserSettings_userId: userId });
    }

    // Update privacy settings
    userSettings.UserSettings_privacy = {
      ...userSettings.UserSettings_privacy,
      ...privacySettings,
    };

    await userSettings.save();

    res.json({
      success: true,
      message: 'Privacy settings updated successfully',
      data: userSettings.UserSettings_privacy,
    });
  } catch (error) {
    console.error('Error updating privacy settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update privacy settings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Update language and localization settings
// @route   PUT /api/settings/localization
// @access  Private
router.put('/localization', authenticateUser, async (req, res) => {
  try {
    const { language, timezone, dateFormat, timeFormat, numberFormat } = req.body;
    const userId = req.user.id;

    let userSettings = await UserSettings.findOne({ 
      UserSettings_userId: userId 
    });

    if (!userSettings) {
      userSettings = new UserSettings({ UserSettings_userId: userId });
    }

    if (language) userSettings.UserSettings_language = language;
    if (timezone) userSettings.UserSettings_timezone = timezone;
    if (dateFormat) userSettings.UserSettings_dateFormat = dateFormat;
    if (timeFormat) userSettings.UserSettings_timeFormat = timeFormat;
    if (numberFormat) userSettings.UserSettings_numberFormat = numberFormat;

    await userSettings.save();

    res.json({
      success: true,
      message: 'Localization settings updated successfully',
      data: {
        language: userSettings.UserSettings_language,
        timezone: userSettings.UserSettings_timezone,
        dateFormat: userSettings.UserSettings_dateFormat,
        timeFormat: userSettings.UserSettings_timeFormat,
        numberFormat: userSettings.UserSettings_numberFormat,
      },
    });
  } catch (error) {
    console.error('Error updating localization settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update localization settings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Add device token for push notifications
// @route   POST /api/settings/device-token
// @access  Private
router.post('/device-token', authenticateUser, async (req, res) => {
  try {
    const { token, platform, deviceId } = req.body;
    const userId = req.user.id;

    if (!token || !platform || !deviceId) {
      return res.status(400).json({
        success: false,
        message: 'Token, platform, and deviceId are required',
      });
    }

    let userSettings = await UserSettings.findOne({ 
      UserSettings_userId: userId 
    });

    if (!userSettings) {
      userSettings = new UserSettings({ UserSettings_userId: userId });
    }

    await userSettings.addDeviceToken(token, platform, deviceId);

    res.json({
      success: true,
      message: 'Device token added successfully',
      data: {
        activeTokens: userSettings.activeDeviceTokens.length,
      },
    });
  } catch (error) {
    console.error('Error adding device token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add device token',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Remove device token
// @route   DELETE /api/settings/device-token/:deviceId
// @access  Private
router.delete('/device-token/:deviceId', authenticateUser, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.id;

    const userSettings = await UserSettings.findOne({ 
      UserSettings_userId: userId 
    });

    if (!userSettings) {
      return res.status(404).json({
        success: false,
        message: 'User settings not found',
      });
    }

    await userSettings.removeDeviceToken(deviceId);

    res.json({
      success: true,
      message: 'Device token removed successfully',
    });
  } catch (error) {
    console.error('Error removing device token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove device token',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Sync settings across devices
// @route   POST /api/settings/sync
// @access  Private
router.post('/sync', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const userSettings = await UserSettings.findOne({ 
      UserSettings_userId: userId 
    });

    if (!userSettings) {
      return res.status(404).json({
        success: false,
        message: 'User settings not found',
      });
    }

    await userSettings.syncToDevice();

    res.json({
      success: true,
      message: 'Settings synced successfully',
      data: {
        lastSyncAt: userSettings.UserSettings_deviceSync.lastSyncAt,
      },
    });
  } catch (error) {
    console.error('Error syncing settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync settings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Get accessibility format for API responses
// @route   GET /api/settings/accessibility-format
// @access  Private
router.get('/accessibility-format', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const userSettings = await UserSettings.findOne({ 
      UserSettings_userId: userId 
    });

    if (!userSettings) {
      return res.json({
        success: true,
        data: {
          screenReaderEnabled: false,
          highContrast: false,
          largeText: false,
          reducedMotion: false,
          keyboardNavigation: false,
          captionsEnabled: false,
        },
      });
    }

    res.json({
      success: true,
      data: userSettings.getAccessibilityFormat(),
    });
  } catch (error) {
    console.error('Error getting accessibility format:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get accessibility format',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Reset settings to default
// @route   POST /api/settings/reset
// @access  Private
router.post('/reset', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Delete existing settings
    await UserSettings.findOneAndDelete({ UserSettings_userId: userId });

    // Create new default settings
    const userSettings = new UserSettings({
      UserSettings_userId: userId,
    });
    await userSettings.save();

    res.json({
      success: true,
      message: 'Settings reset to default successfully',
      data: userSettings,
    });
  } catch (error) {
    console.error('Error resetting settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset settings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Get user preferences
// @route   GET /api/settings/preferences
// @access  Private
router.get('/preferences', authenticateUser, async (req, res) => {
  try {
    const UserPreferences = require('../models/UserPreferences');
    
    let userPreferences = await UserPreferences.findOne({ 
      UserPref_userId: req.user.id 
    });

    // If no preferences exist, create default preferences
    if (!userPreferences) {
      userPreferences = new UserPreferences({
        UserPref_userId: req.user.id,
      });
      await userPreferences.save();
    }

    res.json({
      success: true,
      data: userPreferences,
    });
  } catch (error) {
    console.error('Error fetching user preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user preferences',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Update user preferences
// @route   PUT /api/settings/preferences
// @access  Private
router.put('/preferences', authenticateUser, async (req, res) => {
  try {
    const UserPreferences = require('../models/UserPreferences');
    const userId = req.user.id;
    const updateData = req.body;

    // Remove userId from update data to prevent modification
    delete updateData.UserPref_userId;
    delete updateData._id;

    let userPreferences = await UserPreferences.findOne({ 
      UserPref_userId: userId 
    });

    if (!userPreferences) {
      // Create new preferences if they don't exist
      userPreferences = new UserPreferences({
        UserPref_userId: userId,
        ...updateData,
      });
    } else {
      // Update existing preferences
      Object.assign(userPreferences, updateData);
    }

    await userPreferences.save();

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: userPreferences,
    });
  } catch (error) {
    console.error('Error updating user preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user preferences',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Get supported languages
// @route   GET /api/settings/languages
// @access  Public
router.get('/languages', async (req, res) => {
  try {
    const localizationService = require('../services/localizationService');

    // Initialize the service on-demand if it hasn't been initialized yet
    if (!localizationService.initialized) {
      await localizationService.initialize();
    }

    const supportedLanguages = localizationService.getSupportedLanguages();
    const languageDetails = supportedLanguages.map(lang => ({
      code: lang,
      name: getLanguageName(lang),
      nativeName: getNativeLanguageName(lang),
      rtl: localizationService.isRTL(lang)
    }));

    res.json({
      success: true,
      data: {
        languages: languageDetails,
        default: 'en'
      },
    });
  } catch (error) {
    console.error('Error fetching supported languages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch supported languages',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Get translations for a specific language
// @route   GET /api/settings/translations/:language
// @access  Public
router.get('/translations/:language', async (req, res) => {
  try {
    const { language } = req.params;
    const localizationService = require('../services/localizationService');

    // Initialize the service on-demand if it hasn't been initialized yet
    if (!localizationService.initialized) {
      await localizationService.initialize();
    }

    if (!localizationService.isLanguageSupported(language)) {
      return res.status(400).json({
        success: false,
        message: 'Language not supported',
      });
    }

    const translations = localizationService.getTranslations(language);

    res.json({
      success: true,
      data: {
        language,
        translations,
      },
    });
  } catch (error) {
    console.error('Error fetching translations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch translations',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Update performance settings
// @route   PUT /api/settings/performance
// @access  Private
router.put('/performance', authenticateUser, async (req, res) => {
  try {
    const performanceSettings = req.body;
    const userId = req.user.id;

    let userSettings = await UserSettings.findOne({ 
      UserSettings_userId: userId 
    });

    if (!userSettings) {
      userSettings = new UserSettings({ UserSettings_userId: userId });
    }

    // Update performance settings
    userSettings.UserSettings_performance = {
      ...userSettings.UserSettings_performance,
      ...performanceSettings,
    };

    await userSettings.save();

    res.json({
      success: true,
      message: 'Performance settings updated successfully',
      data: userSettings.UserSettings_performance,
    });
  } catch (error) {
    console.error('Error updating performance settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update performance settings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Export user settings and preferences
// @route   GET /api/settings/export
// @access  Private
router.get('/export', authenticateUser, async (req, res) => {
  try {
    const UserPreferences = require('../models/UserPreferences');
    const userId = req.user.id;

    const [userSettings, userPreferences] = await Promise.all([
      UserSettings.findOne({ UserSettings_userId: userId }),
      UserPreferences.findOne({ UserPref_userId: userId })
    ]);

    const exportData = {
      exportDate: new Date().toISOString(),
      userId: userId,
      settings: userSettings || {},
      preferences: userPreferences || {},
      version: '1.0'
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="user-settings-export.json"');
    
    res.json({
      success: true,
      data: exportData,
    });
  } catch (error) {
    console.error('Error exporting user settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export user settings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// @desc    Import user settings and preferences
// @route   POST /api/settings/import
// @access  Private
router.post('/import', authenticateUser, async (req, res) => {
  try {
    const UserPreferences = require('../models/UserPreferences');
    const { settings, preferences } = req.body;
    const userId = req.user.id;

    const results = {};

    // Import settings if provided
    if (settings && typeof settings === 'object') {
      let userSettings = await UserSettings.findOne({ 
        UserSettings_userId: userId 
      });

      if (!userSettings) {
        userSettings = new UserSettings({ UserSettings_userId: userId });
      }

      // Merge imported settings (excluding system fields)
      const importableSettings = { ...settings };
      delete importableSettings._id;
      delete importableSettings.UserSettings_userId;
      delete importableSettings.UserSettings_createdAt;
      delete importableSettings.__v;

      Object.assign(userSettings, importableSettings);
      await userSettings.save();
      
      results.settings = 'imported';
    }

    // Import preferences if provided
    if (preferences && typeof preferences === 'object') {
      let userPreferences = await UserPreferences.findOne({ 
        UserPref_userId: userId 
      });

      if (!userPreferences) {
        userPreferences = new UserPreferences({ UserPref_userId: userId });
      }

      // Merge imported preferences (excluding system fields)
      const importablePreferences = { ...preferences };
      delete importablePreferences._id;
      delete importablePreferences.UserPref_userId;
      delete importablePreferences.__v;

      Object.assign(userPreferences, importablePreferences);
      await userPreferences.save();
      
      results.preferences = 'imported';
    }

    res.json({
      success: true,
      message: 'Settings imported successfully',
      data: results,
    });
  } catch (error) {
    console.error('Error importing user settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to import user settings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// Helper function to get language name in English
function getLanguageName(code) {
  const languageNames = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'zh': 'Chinese',
    'ja': 'Japanese',
    'ko': 'Korean',
    'ar': 'Arabic',
    'hi': 'Hindi',
    'ru': 'Russian'
  };
  return languageNames[code] || code;
}

// Helper function to get language name in native language
function getNativeLanguageName(code) {
  const nativeNames = {
    'en': 'English',
    'es': 'Español',
    'fr': 'Français',
    'de': 'Deutsch',
    'it': 'Italiano',
    'pt': 'Português',
    'zh': '中文',
    'ja': '日本語',
    'ko': '한국어',
    'ar': 'العربية',
    'hi': 'हिन्दी',
    'ru': 'Русский'
  };
  return nativeNames[code] || code;
}

module.exports = router;
