const fs = require('fs').promises;
const path = require('path');

class LocalizationService {
  constructor() {
    this.translations = new Map();
    this.defaultLanguage = 'en';
    this.supportedLanguages = [
      'en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ar', 'hi', 'ru'
    ];
    this.fallbackChain = {
      'zh': 'en',
      'ja': 'en',
      'ko': 'en',
      'ar': 'en',
      'hi': 'en',
      'ru': 'en',
      'es': 'en',
      'fr': 'en',
      'de': 'en',
      'it': 'en',
      'pt': 'en'
    };
    this.initialized = false;
  }

  /**
   * Initialize the localization service by loading translation files
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Create translations directory if it doesn't exist
      const translationsDir = path.join(__dirname, '../translations');
      
      try {
        await fs.access(translationsDir);
      } catch (error) {
        await fs.mkdir(translationsDir, { recursive: true });
        console.log('Created translations directory');
      }

      // Load existing translation files
      await this.loadTranslations();
      
      // Create default English translations if they don't exist
      await this.createDefaultTranslations();
      
      this.initialized = true;
      console.log('Localization service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize localization service:', error);
      throw error;
    }
  }

  /**
   * Load all translation files from the translations directory
   */
  async loadTranslations() {
    const translationsDir = path.join(__dirname, '../translations');
    
    try {
      const files = await fs.readdir(translationsDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const language = path.basename(file, '.json');
          if (this.supportedLanguages.includes(language)) {
            try {
              const filePath = path.join(translationsDir, file);
              const content = await fs.readFile(filePath, 'utf8');
              const translations = JSON.parse(content);
              this.translations.set(language, translations);
              console.log(`Loaded translations for language: ${language}`);
            } catch (error) {
              console.error(`Failed to load translations for ${language}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.log('Translations directory not found, will create default translations');
    }
  }

  /**
   * Create default English translations
   */
  async createDefaultTranslations() {
    const defaultTranslations = {
      // Common UI elements
      common: {
        save: 'Save',
        cancel: 'Cancel',
        delete: 'Delete',
        edit: 'Edit',
        create: 'Create',
        update: 'Update',
        loading: 'Loading...',
        error: 'Error',
        success: 'Success',
        warning: 'Warning',
        info: 'Information',
        yes: 'Yes',
        no: 'No',
        ok: 'OK',
        close: 'Close',
        back: 'Back',
        next: 'Next',
        previous: 'Previous',
        search: 'Search',
        filter: 'Filter',
        sort: 'Sort',
        refresh: 'Refresh'
      },

      // Authentication
      auth: {
        login: 'Login',
        logout: 'Logout',
        register: 'Register',
        email: 'Email',
        password: 'Password',
        confirmPassword: 'Confirm Password',
        forgotPassword: 'Forgot Password?',
        resetPassword: 'Reset Password',
        rememberMe: 'Remember Me',
        loginSuccess: 'Login successful',
        loginError: 'Login failed',
        registerSuccess: 'Registration successful',
        registerError: 'Registration failed',
        invalidCredentials: 'Invalid email or password',
        passwordMismatch: 'Passwords do not match',
        weakPassword: 'Password must be at least 6 characters long'
      },

      // Settings
      settings: {
        title: 'Settings',
        general: 'General',
        appearance: 'Appearance',
        accessibility: 'Accessibility',
        notifications: 'Notifications',
        privacy: 'Privacy',
        language: 'Language',
        theme: 'Theme',
        fontSize: 'Font Size',
        timezone: 'Timezone',
        dateFormat: 'Date Format',
        timeFormat: 'Time Format',
        settingsUpdated: 'Settings updated successfully',
        settingsError: 'Failed to update settings',
        resetSettings: 'Reset to Default',
        resetConfirm: 'Are you sure you want to reset all settings to default?'
      },

      // Accessibility
      accessibility: {
        screenReader: 'Screen Reader Support',
        highContrast: 'High Contrast Mode',
        largeText: 'Large Text',
        reducedMotion: 'Reduce Motion',
        keyboardNavigation: 'Keyboard Navigation',
        focusIndicators: 'Enhanced Focus Indicators',
        audioDescriptions: 'Audio Descriptions',
        captions: 'Closed Captions',
        voiceCommands: 'Voice Commands',
        accessibilityUpdated: 'Accessibility settings updated',
        accessibilityError: 'Failed to update accessibility settings'
      },

      // Groups
      groups: {
        title: 'Groups',
        create: 'Create Group',
        join: 'Join Group',
        leave: 'Leave Group',
        members: 'Members',
        settings: 'Group Settings',
        invite: 'Invite Members',
        groupName: 'Group Name',
        groupDescription: 'Group Description',
        groupCreated: 'Group created successfully',
        groupJoined: 'Joined group successfully',
        groupLeft: 'Left group successfully',
        groupError: 'Group operation failed'
      },

      // Messages
      messages: {
        title: 'Messages',
        send: 'Send',
        typing: 'typing...',
        online: 'Online',
        offline: 'Offline',
        lastSeen: 'Last seen',
        messageDeleted: 'Message deleted',
        messageEdited: 'Message edited',
        noMessages: 'No messages yet',
        loadMore: 'Load more messages'
      },

      // Files
      files: {
        upload: 'Upload File',
        download: 'Download',
        delete: 'Delete File',
        share: 'Share',
        fileName: 'File Name',
        fileSize: 'File Size',
        uploadDate: 'Upload Date',
        uploadSuccess: 'File uploaded successfully',
        uploadError: 'File upload failed',
        deleteSuccess: 'File deleted successfully',
        deleteError: 'File deletion failed',
        maxSizeExceeded: 'File size exceeds maximum limit',
        invalidFileType: 'Invalid file type'
      },

      // Notifications
      notifications: {
        title: 'Notifications',
        markAllRead: 'Mark All as Read',
        clear: 'Clear All',
        settings: 'Notification Settings',
        email: 'Email Notifications',
        push: 'Push Notifications',
        inApp: 'In-App Notifications',
        desktop: 'Desktop Notifications',
        frequency: 'Notification Frequency',
        quietHours: 'Quiet Hours',
        types: {
          groupMessages: 'Group Messages',
          taskReminders: 'Task Reminders',
          studyReminders: 'Study Reminders',
          groupInvites: 'Group Invitations',
          systemUpdates: 'System Updates',
          aiInsights: 'AI Insights'
        }
      },

      // Errors
      errors: {
        generic: 'An error occurred. Please try again.',
        network: 'Network error. Please check your connection.',
        unauthorized: 'You are not authorized to perform this action.',
        forbidden: 'Access denied.',
        notFound: 'The requested resource was not found.',
        serverError: 'Server error. Please try again later.',
        validationError: 'Please check your input and try again.',
        sessionExpired: 'Your session has expired. Please log in again.'
      },

      // Time and dates
      time: {
        now: 'now',
        minuteAgo: 'a minute ago',
        minutesAgo: '{count} minutes ago',
        hourAgo: 'an hour ago',
        hoursAgo: '{count} hours ago',
        dayAgo: 'a day ago',
        daysAgo: '{count} days ago',
        weekAgo: 'a week ago',
        weeksAgo: '{count} weeks ago',
        monthAgo: 'a month ago',
        monthsAgo: '{count} months ago',
        yearAgo: 'a year ago',
        yearsAgo: '{count} years ago'
      }
    };

    // Save default translations if they don't exist
    if (!this.translations.has('en')) {
      await this.saveTranslations('en', defaultTranslations);
      this.translations.set('en', defaultTranslations);
    }
  }

  /**
   * Save translations to file
   */
  async saveTranslations(language, translations) {
    const translationsDir = path.join(__dirname, '../translations');
    const filePath = path.join(translationsDir, `${language}.json`);
    
    try {
      await fs.writeFile(filePath, JSON.stringify(translations, null, 2), 'utf8');
      console.log(`Saved translations for language: ${language}`);
    } catch (error) {
      console.error(`Failed to save translations for ${language}:`, error);
      throw error;
    }
  }

  /**
   * Get translation for a key in the specified language
   */
  translate(key, language = this.defaultLanguage, params = {}) {
    if (!this.initialized) {
      console.warn('Localization service not initialized, using key as fallback');
      return key;
    }

    // Get translations for the requested language
    let translations = this.translations.get(language);
    
    // Fallback to default language if requested language not found
    if (!translations && language !== this.defaultLanguage) {
      const fallbackLang = this.fallbackChain[language] || this.defaultLanguage;
      translations = this.translations.get(fallbackLang);
    }

    // If still no translations, return the key
    if (!translations) {
      return key;
    }

    // Navigate through nested keys (e.g., 'common.save')
    const keys = key.split('.');
    let value = translations;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return key; // Return key if path not found
      }
    }

    // If value is not a string, return the key
    if (typeof value !== 'string') {
      return key;
    }

    // Replace parameters in the translation
    let result = value;
    for (const [param, replacement] of Object.entries(params)) {
      result = result.replace(new RegExp(`{${param}}`, 'g'), replacement);
    }

    return result;
  }

  /**
   * Get all translations for a language
   */
  getTranslations(language = this.defaultLanguage) {
    return this.translations.get(language) || this.translations.get(this.defaultLanguage) || {};
  }

  /**
   * Check if a language is supported
   */
  isLanguageSupported(language) {
    return this.supportedLanguages.includes(language);
  }

  /**
   * Get list of supported languages
   */
  getSupportedLanguages() {
    return [...this.supportedLanguages];
  }

  /**
   * Add or update translations for a language
   */
  async updateTranslations(language, translations) {
    if (!this.isLanguageSupported(language)) {
      throw new Error(`Language ${language} is not supported`);
    }

    const existingTranslations = this.translations.get(language) || {};
    const mergedTranslations = this.deepMerge(existingTranslations, translations);
    
    this.translations.set(language, mergedTranslations);
    await this.saveTranslations(language, mergedTranslations);
  }

  /**
   * Deep merge two objects
   */
  deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * Format date according to user's locale settings
   */
  formatDate(date, language = this.defaultLanguage, options = {}) {
    try {
      const locale = this.getLocaleFromLanguage(language);
      return new Intl.DateTimeFormat(locale, options).format(new Date(date));
    } catch (error) {
      console.error('Error formatting date:', error);
      return new Date(date).toLocaleDateString();
    }
  }

  /**
   * Format number according to user's locale settings
   */
  formatNumber(number, language = this.defaultLanguage, options = {}) {
    try {
      const locale = this.getLocaleFromLanguage(language);
      return new Intl.NumberFormat(locale, options).format(number);
    } catch (error) {
      console.error('Error formatting number:', error);
      return number.toString();
    }
  }

  /**
   * Get locale string from language code
   */
  getLocaleFromLanguage(language) {
    const localeMap = {
      'en': 'en-US',
      'es': 'es-ES',
      'fr': 'fr-FR',
      'de': 'de-DE',
      'it': 'it-IT',
      'pt': 'pt-PT',
      'zh': 'zh-CN',
      'ja': 'ja-JP',
      'ko': 'ko-KR',
      'ar': 'ar-SA',
      'hi': 'hi-IN',
      'ru': 'ru-RU'
    };
    
    return localeMap[language] || 'en-US';
  }

  /**
   * Get RTL (Right-to-Left) languages
   */
  isRTL(language) {
    const rtlLanguages = ['ar'];
    return rtlLanguages.includes(language);
  }
}

// Create singleton instance
const localizationService = new LocalizationService();

module.exports = localizationService;