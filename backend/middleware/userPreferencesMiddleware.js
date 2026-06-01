const UserSettings = require('../models/UserSettings');
const UserPreferences = require('../models/UserPreferences');
const localizationService = require('../services/localizationService');
const accessibilityService = require('../services/accessibilityService');

/**
 * Middleware to load user preferences and settings for API responses
 * This middleware adds user preferences to the request object for use in controllers
 */
const loadUserPreferences = async (req, res, next) => {
  try {
    // Only load preferences for authenticated users
    if (!req.user || !req.user.id) {
      return next();
    }

    const userId = req.user.id;

    // Load user settings and preferences in parallel
    const [userSettings, userPreferences] = await Promise.all([
      UserSettings.findOne({ UserSettings_userId: userId }),
      UserPreferences.findOne({ UserPref_userId: userId })
    ]);

    // Create default settings if they don't exist
    if (!userSettings) {
      const defaultSettings = new UserSettings({
        UserSettings_userId: userId
      });
      await defaultSettings.save();
      req.userSettings = defaultSettings;
    } else {
      req.userSettings = userSettings;
    }

    // Create default preferences if they don't exist
    if (!userPreferences) {
      const defaultPreferences = new UserPreferences({
        UserPref_userId: userId
      });
      await defaultPreferences.save();
      req.userPreferences = defaultPreferences;
    } else {
      req.userPreferences = userPreferences;
    }

    // Add convenience methods to request object
    req.getUserLanguage = () => {
      return req.userSettings?.UserSettings_language || 
             req.userPreferences?.UserPref_language || 
             'en';
    };

    req.getUserTimezone = () => {
      return req.userSettings?.UserSettings_timezone || 
             req.userPreferences?.UserPref_timezone || 
             'UTC';
    };

    req.getAccessibilitySettings = () => {
      return req.userSettings?.UserSettings_accessibility || {
        screenReader: false,
        keyboardNavigation: false,
        reducedMotion: false,
        highContrast: false,
        largeText: false,
        focusIndicators: true,
        audioDescriptions: false,
        captionsEnabled: false,
        voiceCommands: false
      };
    };

    next();
  } catch (error) {
    console.error('Error loading user preferences:', error);
    // Don't fail the request, just continue without preferences
    next();
  }
};

/**
 * Middleware to format API responses based on user accessibility settings
 */
const formatAccessibleResponse = (req, res, next) => {
  // Store original json method
  const originalJson = res.json;

  // Override json method to format response based on accessibility settings
  res.json = function(data) {
    try {
      const accessibilitySettings = req.getAccessibilitySettings ? 
        req.getAccessibilitySettings() : {};
      
      const userLanguage = req.getUserLanguage ? req.getUserLanguage() : 'en';

      // Format response for accessibility
      const formattedData = formatForAccessibility(data, accessibilitySettings, userLanguage);
      
      // Call original json method with formatted data
      return originalJson.call(this, formattedData);
    } catch (error) {
      console.error('Error formatting accessible response:', error);
      // Fallback to original response
      return originalJson.call(this, data);
    }
  };

  next();
};

/**
 * Format data for accessibility based on user settings
 */
function formatForAccessibility(data, accessibilitySettings, language) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  let formatted = { ...data };

  // Determine content type for better formatting
  const contentType = determineContentType(data);

  // Add accessibility metadata
  formatted._accessibility = {
    enabled: true,
    language: language,
    timestamp: new Date().toISOString(),
    contentType: contentType,
    settings: accessibilitySettings,
  };

  // Screen reader support
  if (accessibilitySettings.screenReader) {
    formatted = accessibilityService.formatForScreenReader(formatted, contentType);
    
    // Add keyboard navigation instructions
    if (accessibilitySettings.keyboardNavigation) {
      formatted._accessibility.keyboardInstructions = 
        accessibilityService.generateKeyboardInstructions(contentType);
    }
  }

  // High contrast support
  if (accessibilitySettings.highContrast) {
    formatted = accessibilityService.addHighContrastSupport(formatted);
  }

  // Large text support
  if (accessibilitySettings.largeText) {
    formatted = accessibilityService.addLargeTextSupport(formatted);
  }

  // Reduced motion support
  if (accessibilitySettings.reducedMotion) {
    formatted = accessibilityService.addReducedMotionSupport(formatted);
  }

  // Enhanced focus indicators
  if (accessibilitySettings.focusIndicators) {
    formatted = accessibilityService.generateFocusIndicators(formatted);
  }

  // Voice commands support
  if (accessibilitySettings.voiceCommands) {
    formatted = accessibilityService.addVoiceCommandSupport(formatted);
  }

  // Add captions metadata for media content
  if (accessibilitySettings.captionsEnabled) {
    formatted._accessibility.captionsEnabled = true;
    if (contentType === 'media') {
      formatted = accessibilityService.formatForScreenReader(formatted, 'media');
    }
  }

  // Audio descriptions for media
  if (accessibilitySettings.audioDescriptions && contentType === 'media') {
    formatted._accessibility.audioDescriptions = {
      enabled: true,
      available: formatted.audioDescription || false,
    };
  }

  // Validate accessibility compliance
  const compliance = accessibilityService.validateAccessibilityCompliance(
    formatted, 
    accessibilitySettings
  );
  formatted._accessibility.compliance = compliance;

  return formatted;
}

/**
 * Determine content type for accessibility formatting
 */
function determineContentType(data) {
  if (Array.isArray(data.data)) {
    return 'list';
  } else if (data.errors && typeof data.errors === 'object') {
    return 'form';
  } else if (data.navigation || data.menu) {
    return 'navigation';
  } else if (data.media || data.video || data.audio) {
    return 'media';
  } else if (data.data && Array.isArray(data.data) && data.data.length > 0 && 
             typeof data.data[0] === 'object' && Object.keys(data.data[0]).length > 3) {
    return 'table';
  }
  return 'general';
}

/**
 * Generate navigation hints for keyboard users (legacy function, now using accessibility service)
 */
function generateNavigationHints(data) {
  const hints = [];

  if (Array.isArray(data)) {
    hints.push('Use arrow keys to navigate through list items');
    hints.push('Press Enter to select an item');
  } else if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length > 0) {
      hints.push('Use Tab to navigate through fields');
      hints.push(`Available fields: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`);
    }
  }

  return hints;
}

/**
 * Middleware to translate API responses based on user language
 */
const translateResponse = (req, res, next) => {
  // Store original json method
  const originalJson = res.json;

  // Override json method to translate response
  res.json = function(data) {
    try {
      const userLanguage = req.getUserLanguage ? req.getUserLanguage() : 'en';
      
      // Only translate if language is not English and localization service is available
      if (userLanguage !== 'en' && localizationService.isLanguageSupported(userLanguage)) {
        const translatedData = translateDataRecursively(data, userLanguage);
        return originalJson.call(this, translatedData);
      }
      
      return originalJson.call(this, data);
    } catch (error) {
      console.error('Error translating response:', error);
      // Fallback to original response
      return originalJson.call(this, data);
    }
  };

  next();
};

/**
 * Recursively translate data object
 */
function translateDataRecursively(data, language) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => translateDataRecursively(item, language));
  }

  const translated = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && isTranslatableKey(key)) {
      // Attempt to translate the string
      translated[key] = localizationService.translate(value, language) || value;
    } else if (typeof value === 'object') {
      translated[key] = translateDataRecursively(value, language);
    } else {
      translated[key] = value;
    }
  }

  return translated;
}

/**
 * Check if a key should be translated
 */
function isTranslatableKey(key) {
  const translatableKeys = [
    'message', 'error', 'description', 'title', 'label', 'placeholder',
    'tooltip', 'hint', 'warning', 'info', 'success', 'name'
  ];
  
  return translatableKeys.some(transKey => 
    key.toLowerCase().includes(transKey.toLowerCase())
  );
}

/**
 * Middleware to format dates and numbers based on user locale
 */
const formatLocaleData = (req, res, next) => {
  // Store original json method
  const originalJson = res.json;

  // Override json method to format locale-specific data
  res.json = function(data) {
    try {
      const userLanguage = req.getUserLanguage ? req.getUserLanguage() : 'en';
      const userTimezone = req.getUserTimezone ? req.getUserTimezone() : 'UTC';
      const dateFormat = req.userSettings?.UserSettings_dateFormat || 'MM/DD/YYYY';
      const timeFormat = req.userSettings?.UserSettings_timeFormat || '12h';
      
      const formattedData = formatLocaleDataRecursively(
        data, 
        userLanguage, 
        userTimezone, 
        dateFormat, 
        timeFormat
      );
      
      return originalJson.call(this, formattedData);
    } catch (error) {
      console.error('Error formatting locale data:', error);
      return originalJson.call(this, data);
    }
  };

  next();
};

/**
 * Recursively format locale-specific data
 */
function formatLocaleDataRecursively(data, language, timezone, dateFormat, timeFormat, visited = new WeakSet()) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  // Check for circular references
  if (visited.has(data)) {
    return '[Circular Reference]';
  }

  // Mark this object as visited
  visited.add(data);

  if (Array.isArray(data)) {
    return data.map(item => 
      formatLocaleDataRecursively(item, language, timezone, dateFormat, timeFormat, visited)
    );
  }

  const formatted = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (isDateField(key) && (value instanceof Date || typeof value === 'string')) {
      // Format date fields
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          formatted[key] = localizationService.formatDate(date, language, {
            timeZone: timezone,
            dateStyle: getDateStyle(dateFormat),
            timeStyle: getTimeStyle(timeFormat)
          });
          
          // Also provide ISO string for programmatic use
          formatted[`${key}_iso`] = date.toISOString();
        } else {
          formatted[key] = value;
        }
      } catch (error) {
        formatted[key] = value;
      }
    } else if (isNumberField(key) && typeof value === 'number') {
      // Format number fields
      formatted[key] = localizationService.formatNumber(value, language);
    } else if (typeof value === 'object' && value !== null) {
      formatted[key] = formatLocaleDataRecursively(
        value, 
        language, 
        timezone, 
        dateFormat, 
        timeFormat,
        visited
      );
    } else {
      formatted[key] = value;
    }
  }

  return formatted;
}

/**
 * Check if a field is a date field
 */
function isDateField(key) {
  const dateFields = [
    'date', 'time', 'created', 'updated', 'modified', 'deleted',
    'start', 'end', 'due', 'expires', 'last', 'next'
  ];
  
  return dateFields.some(dateField => 
    key.toLowerCase().includes(dateField.toLowerCase())
  );
}

/**
 * Check if a field is a number field that should be formatted
 */
function isNumberField(key) {
  const numberFields = [
    'count', 'total', 'sum', 'amount', 'price', 'cost', 'value',
    'size', 'length', 'width', 'height', 'weight', 'score'
  ];
  
  return numberFields.some(numberField => 
    key.toLowerCase().includes(numberField.toLowerCase())
  );
}

/**
 * Get date style from format string
 */
function getDateStyle(dateFormat) {
  switch (dateFormat) {
    case 'DD/MM/YYYY':
    case 'DD-MM-YYYY':
      return 'short';
    case 'YYYY-MM-DD':
      return 'medium';
    default:
      return 'short';
  }
}

/**
 * Get time style from format string
 */
function getTimeStyle(timeFormat) {
  return timeFormat === '24h' ? 'short' : 'short';
}

module.exports = {
  loadUserPreferences,
  formatAccessibleResponse,
  translateResponse,
  formatLocaleData
};