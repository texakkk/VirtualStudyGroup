import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material/styles';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const normalizeTheme = (value) => (value === 'auto' ? 'system' : value);

  const [theme, setThemeState] = useState(() => {
    // Initialize theme from localStorage or default to 'light'
    return normalizeTheme(localStorage.getItem('theme')) || 'light';
  });

  // Apply theme to the HTML root
  const setTheme = useCallback((themeToApply) => {
    const normalizedTheme = normalizeTheme(themeToApply);
    const root = document.documentElement;
    
    if (normalizedTheme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', normalizedTheme);
    }
    
    // Save to localStorage for persistence
    localStorage.setItem('theme', normalizedTheme);
    setThemeState(normalizedTheme);
  }, []);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleSystemThemeChange = (e) => {
      if (theme === 'system') {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      }
    };

    // Apply the current theme on initial load
    setTheme(theme);
    
    // Listen for system theme changes
    mediaQuery.addEventListener('change', handleSystemThemeChange);
    
    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, [theme, setTheme]);

  const resolvedTheme = useMemo(() => {
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  }, [theme]);

  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: resolvedTheme === 'dark' || resolvedTheme === 'high-contrast' ? 'dark' : 'light',
        },
      }),
    [resolvedTheme]
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <MuiThemeProvider theme={muiTheme}>{children}</MuiThemeProvider>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
