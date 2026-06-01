import api from '../api';

/**
 * Settings API Service
 * Handles all API calls related to user settings and preferences
 */

// Get user settings
export const getUserSettings = async () => {
  try {
    const response = await api.get('/settings');
    return response.data;
  } catch (error) {
    console.error('Error fetching user settings:', error);
    throw error;
  }
};

// Update user settings
export const updateUserSettings = async (settings) => {
  try {
    const response = await api.put('/settings', settings);
    return response.data;
  } catch (error) {
    console.error('Error updating user settings:', error);
    throw error;
  }
};

// Update theme settings
export const updateThemeSettings = async (themeData) => {
  try {
    const response = await api.put('/settings/theme', themeData);
    return response.data;
  } catch (error) {
    console.error('Error updating theme settings:', error);
    throw error;
  }
};

// Update accessibility settings
export const updateAccessibilitySettings = async (accessibilityData) => {
  try {
    const response = await api.put('/settings/accessibility', accessibilityData);
    return response.data;
  } catch (error) {
    console.error('Error updating accessibility settings:', error);
    throw error;
  }
};

// Update notification settings
export const updateNotificationSettings = async (notificationData) => {
  try {
    const response = await api.put('/settings/notifications', notificationData);
    return response.data;
  } catch (error) {
    console.error('Error updating notification settings:', error);
    throw error;
  }
};

// Update privacy settings
export const updatePrivacySettings = async (privacyData) => {
  try {
    const response = await api.put('/settings/privacy', privacyData);
    return response.data;
  } catch (error) {
    console.error('Error updating privacy settings:', error);
    throw error;
  }
};

// Update localization settings
export const updateLocalizationSettings = async (localizationData) => {
  try {
    const response = await api.put('/settings/localization', localizationData);
    return response.data;
  } catch (error) {
    console.error('Error updating localization settings:', error);
    throw error;
  }
};

// Update performance settings
export const updatePerformanceSettings = async (performanceData) => {
  try {
    const response = await api.put('/settings/performance', performanceData);
    return response.data;
  } catch (error) {
    console.error('Error updating performance settings:', error);
    throw error;
  }
};

// Sync settings across devices
export const syncSettings = async () => {
  try {
    const response = await api.post('/settings/sync');
    return response.data;
  } catch (error) {
    console.error('Error syncing settings:', error);
    throw error;
  }
};

// Reset settings to default
export const resetSettings = async () => {
  try {
    const response = await api.post('/settings/reset');
    return response.data;
  } catch (error) {
    console.error('Error resetting settings:', error);
    throw error;
  }
};

// Get supported languages
export const getSupportedLanguages = async () => {
  try {
    const response = await api.get('/settings/languages');
    return response.data;
  } catch (error) {
    console.error('Error fetching supported languages:', error);
    throw error;
  }
};

// Get translations for a specific language
export const getTranslations = async (language) => {
  try {
    const response = await api.get(`/settings/translations/${language}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching translations:', error);
    throw error;
  }
};

// Export user settings
export const exportUserSettings = async () => {
  try {
    const response = await api.get('/settings/export');
    return response.data;
  } catch (error) {
    console.error('Error exporting user settings:', error);
    throw error;
  }
};

// Import user settings
export const importUserSettings = async (settingsData) => {
  try {
    const response = await api.post('/settings/import', settingsData);
    return response.data;
  } catch (error) {
    console.error('Error importing user settings:', error);
    throw error;
  }
};

export default {
  getUserSettings,
  updateUserSettings,
  updateThemeSettings,
  updateAccessibilitySettings,
  updateNotificationSettings,
  updatePrivacySettings,
  updateLocalizationSettings,
  updatePerformanceSettings,
  syncSettings,
  resetSettings,
  getSupportedLanguages,
  getTranslations,
  exportUserSettings,
  importUserSettings,
};
