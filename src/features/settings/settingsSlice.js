import { createSlice } from '@reduxjs/toolkit';

// Default settings
const defaultSettings = {
  theme: 'light', // 'light' | 'dark' | 'high-contrast' | 'auto'
  font: {
    family: 'Inter, sans-serif',
    size: '16px',
    weight: 'normal',
  },
  language: 'en', // ISO language codes
  accessibility: {
    highContrast: false,
    reducedMotion: false,
    fontSize: 'normal', // 'small' | 'normal' | 'large' | 'extra-large'
    screenReader: false,
    keyboardNavigation: false,
  },
  layout: {
    sidebarCollapsed: false,
    compactMode: false,
  },
  preferences: {
    autoSave: true,
    notifications: true,
    soundEnabled: true,
  },
  syncEnabled: true,
  lastSynced: null,
};

// Settings are stored locally — no backend sync for theme/accessibility/font.
// Only password and account deletion go to the backend (handled in Settings.js directly).

// Available options for settings
export const settingsOptions = {
  themes: ['light', 'dark', 'high-contrast', 'auto'],
  fontFamilies: [
    { value: 'Inter, sans-serif', label: 'Inter' },
    { value: 'Roboto, sans-serif', label: 'Roboto' },
    { value: 'Arial, sans-serif', label: 'Arial' },
    { value: 'Georgia, serif', label: 'Georgia' },
    { value: 'Times New Roman, serif', label: 'Times New Roman' },
    { value: 'Courier New, monospace', label: 'Courier New' },
    { value: 'system-ui, sans-serif', label: 'System Default' },
  ],
  fontSizes: [
    { value: '12px', label: 'Extra Small (12px)' },
    { value: '14px', label: 'Small (14px)' },
    { value: '16px', label: 'Medium (16px)' },
    { value: '18px', label: 'Large (18px)' },
    { value: '20px', label: 'Extra Large (20px)' },
    { value: '24px', label: 'Huge (24px)' },
  ],
  languages: [
    { value: 'en', label: 'English', flag: '🇺🇸' },
    { value: 'es', label: 'Español', flag: '🇪🇸' },
    { value: 'fr', label: 'Français', flag: '🇫🇷' },
    { value: 'de', label: 'Deutsch', flag: '🇩🇪' },
    { value: 'it', label: 'Italiano', flag: '🇮🇹' },
    { value: 'pt', label: 'Português', flag: '🇵🇹' },
    { value: 'ja', label: '日本語', flag: '🇯🇵' },
    { value: 'ko', label: '한국어', flag: '🇰🇷' },
    { value: 'zh', label: '中文', flag: '🇨🇳' },
  ],
};

// Load settings from localStorage or use defaults
const loadSettingsFromStorage = () => {
  try {
    const savedSettings = localStorage.getItem('appSettings');
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      // Deep merge with defaults to ensure all properties exist
      return {
        ...defaultSettings,
        ...parsed,
        font: { ...defaultSettings.font, ...parsed.font },
        accessibility: { ...defaultSettings.accessibility, ...parsed.accessibility },
        layout: { ...defaultSettings.layout, ...parsed.layout },
        preferences: { ...defaultSettings.preferences, ...parsed.preferences },
      };
    }
    return defaultSettings;
  } catch (error) {
    console.error('Error loading settings from localStorage:', error);
    return defaultSettings;
  }
};

// Save settings to localStorage
const saveSettingsToStorage = (settings) => {
  try {
    const settingsToSave = {
      theme: settings.theme,
      font: settings.font,
      language: settings.language,
      accessibility: settings.accessibility,
      layout: settings.layout,
      preferences: settings.preferences,
    };
    localStorage.setItem('appSettings', JSON.stringify(settingsToSave));
  } catch (error) {
    console.error('Error saving settings to localStorage:', error);
  }
};

// Apply theme to document
const applyTheme = (theme) => {
  // Ensure DOM is ready
  if (typeof document === 'undefined') return;
  
  try {
    if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    console.log('Theme applied:', theme);
  } catch (error) {
    console.error('Error applying theme:', error);
  }
};

// Apply font settings to document
const applyFont = (font) => {
  // Ensure DOM is ready
  if (typeof document === 'undefined') return;
  
  try {
    if (font.family) {
      document.documentElement.style.setProperty('--font-family', font.family);
      console.log('Font family applied:', font.family);
    }
    if (font.size) {
      document.documentElement.style.setProperty('--font-size', font.size);
      console.log('Font size applied:', font.size);
    }
    if (font.weight) {
      document.documentElement.style.setProperty('--font-weight', font.weight);
    }
  } catch (error) {
    console.error('Error applying font:', error);
  }
};

// Apply accessibility settings
const applyAccessibility = (accessibility) => {
  // Ensure DOM is ready
  if (typeof document === 'undefined') return;
  
  try {
    if (accessibility.highContrast) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }
    
    if (accessibility.reducedMotion) {
      document.documentElement.classList.add('reduced-motion');
    } else {
      document.documentElement.classList.remove('reduced-motion');
    }
    console.log('Accessibility settings applied:', accessibility);
  } catch (error) {
    console.error('Error applying accessibility settings:', error);
  }
};

const initialState = {
  ...loadSettingsFromStorage(),
  isLoading: false,
  error: null,
  lastUpdated: null,
  syncEnabled: true,
  lastSynced: null,
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setTheme: (state, action) => {
      state.theme = action.payload;
      state.lastUpdated = Date.now();
      applyTheme(action.payload);
      saveSettingsToStorage(state);
    },
    setFont: (state, action) => {
      state.font = { ...state.font, ...action.payload };
      state.lastUpdated = Date.now();
      applyFont(state.font);
      saveSettingsToStorage(state);
    },
    setLanguage: (state, action) => {
      state.language = action.payload;
      state.lastUpdated = Date.now();
      // Apply language to document
      if (typeof document !== 'undefined') {
        document.documentElement.lang = action.payload;
        console.log('Language applied:', action.payload);
      }
      saveSettingsToStorage(state);
    },
    setAccessibility: (state, action) => {
      state.accessibility = { ...state.accessibility, ...action.payload };
      state.lastUpdated = Date.now();
      applyAccessibility(state.accessibility);
      saveSettingsToStorage(state);
    },
    setLayout: (state, action) => {
      state.layout = { ...state.layout, ...action.payload };
      state.lastUpdated = Date.now();
      saveSettingsToStorage(state);
    },
    setPreferences: (state, action) => {
      state.preferences = { ...state.preferences, ...action.payload };
      state.lastUpdated = Date.now();
      saveSettingsToStorage(state);
    },
    toggleTheme: (state) => {
      const currentTheme = state.theme;
      let newTheme;
      
      if (currentTheme === 'light') {
        newTheme = 'dark';
      } else if (currentTheme === 'dark') {
        newTheme = 'auto';
      } else {
        newTheme = 'light';
      }
      
      state.theme = newTheme;
      state.lastUpdated = Date.now();
      applyTheme(newTheme);
      saveSettingsToStorage(state);
    },
    toggleSidebar: (state) => {
      state.layout.sidebarCollapsed = !state.layout.sidebarCollapsed;
      state.lastUpdated = Date.now();
      saveSettingsToStorage(state);
    },
    resetSettings: (state) => {
      Object.assign(state, {
        ...defaultSettings,
        isLoading: false,
        error: null,
        lastUpdated: Date.now(),
      });
      
      // Reset document attributes
      applyTheme(defaultSettings.theme);
      applyFont(defaultSettings.font);
      applyAccessibility(defaultSettings.accessibility);
      document.documentElement.lang = defaultSettings.language;
      
      // Clear localStorage
      localStorage.removeItem('appSettings');
    },
    initializeSettings: (state) => {
      // Apply current settings to document on app initialization
      console.log('Initializing settings:', state);
      
      // Extract plain values from the Immer draft BEFORE the setTimeout.
      // Immer revokes the draft proxy when the reducer returns, so accessing
      // `state` inside the callback would throw "Cannot perform 'get' on a
      // proxy that has been revoked".
      const theme = state.theme;
      const font = { ...state.font };
      const accessibility = { ...state.accessibility };
      const language = state.language;

      // Use setTimeout to ensure DOM is ready
      setTimeout(() => {
        applyTheme(theme);
        applyFont(font);
        applyAccessibility(accessibility);
        if (typeof document !== 'undefined') {
          document.documentElement.lang = language;
          console.log('Settings initialized successfully');
        }
        
        // Set up system theme change listener for auto theme
        if (theme === 'auto' && typeof window !== 'undefined') {
          const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
          const handleChange = () => applyTheme('auto');
          mediaQuery.addEventListener('change', handleChange);
        }
      }, 100);
    },
    setLoading: (state, action) => {
      state.isLoading = action.payload;
    },
    setError: (state, action) => {
      state.error = action.payload;
      state.isLoading = false;
    },
    clearError: (state) => {
      state.error = null;
    },
    setSyncEnabled: (state, action) => {
      state.syncEnabled = action.payload;
      saveSettingsToStorage(state);
    },
  },
});

export const { 
  setTheme, 
  setFont, 
  setLanguage, 
  setAccessibility,
  setLayout,
  setPreferences,
  toggleTheme,
  toggleSidebar,
  resetSettings, 
  initializeSettings,
  setLoading,
  setError,
  clearError,
  setSyncEnabled
} = settingsSlice.actions;

export default settingsSlice.reducer;