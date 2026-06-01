import { useSettings as useSettingsContext } from '../contexts/SettingsContext';

// Re-export the useSettings hook for easier imports
export const useSettings = useSettingsContext;

// Additional custom hooks for specific settings
export const useTheme = () => {
  const { theme, updateTheme, toggleTheme } = useSettingsContext();
  return { theme, updateTheme, toggleTheme };
};

export const useFont = () => {
  const { font, updateFont } = useSettingsContext();
  return { font, updateFont };
};

export const useLanguage = () => {
  const { language, updateLanguage } = useSettingsContext();
  return { language, updateLanguage };
};

export const useAccessibility = () => {
  const { accessibility, updateAccessibility } = useSettingsContext();
  return { accessibility, updateAccessibility };
};

export const useLayout = () => {
  const { layout, updateLayout, toggleSidebar } = useSettingsContext();
  return { layout, updateLayout, toggleSidebar };
};

export const usePreferences = () => {
  const { preferences, updatePreferences } = useSettingsContext();
  return { preferences, updatePreferences };
};

// Utility hook to check if dark mode is active
export const useDarkMode = () => {
  const { theme } = useSettingsContext();
  const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return isDark;
};

// Utility hook to get current effective theme (resolves 'auto' to actual theme)
export const useEffectiveTheme = () => {
  const { theme } = useSettingsContext();
  if (theme === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
};

export default useSettings;