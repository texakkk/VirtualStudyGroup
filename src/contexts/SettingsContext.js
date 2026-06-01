import React, { createContext, useContext, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
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
} from "../features/settings/settingsSlice";

const SettingsContext = createContext();

export const SettingsProvider = ({ children }) => {
  const dispatch = useDispatch();
  const settings = useSelector((state) => state.settings);

  // Initialize settings on app load
  useEffect(() => {
    dispatch(initializeSettings());
  }, [dispatch]);

  // Settings actions
  const updateTheme = (theme) => {
    dispatch(setTheme(theme));
  };

  const updateFont = (fontSettings) => {
    dispatch(setFont(fontSettings));
  };

  const updateLanguage = (language) => {
    dispatch(setLanguage(language));
  };

  const updateAccessibility = (accessibilitySettings) => {
    dispatch(setAccessibility(accessibilitySettings));
  };

  const updateLayout = (layoutSettings) => {
    dispatch(setLayout(layoutSettings));
  };

  const updatePreferences = (preferenceSettings) => {
    dispatch(setPreferences(preferenceSettings));
  };

  const resetAllSettings = () => {
    dispatch(resetSettings());
  };

  const handleToggleTheme = () => {
    dispatch(toggleTheme());
  };

  const handleToggleSidebar = () => {
    dispatch(toggleSidebar());
  };

  const handleSetLoading = (loading) => {
    dispatch(setLoading(loading));
  };

  const handleSetError = (error) => {
    dispatch(setError(error));
  };

  const handleClearError = () => {
    dispatch(clearError());
  };

  const value = {
    // Current settings
    theme: settings.theme,
    font: settings.font,
    language: settings.language,
    accessibility: settings.accessibility,
    layout: settings.layout,
    preferences: settings.preferences,
    isLoading: settings.isLoading,
    error: settings.error,
    lastUpdated: settings.lastUpdated,

    // Actions
    updateTheme,
    updateFont,
    updateLanguage,
    updateAccessibility,
    updateLayout,
    updatePreferences,
    resetAllSettings,
    toggleTheme: handleToggleTheme,
    toggleSidebar: handleToggleSidebar,
    setLoading: handleSetLoading,
    setError: handleSetError,
    clearError: handleClearError,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
};

export default SettingsContext;
