import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import api from '../api';

// Create the context
const AuthContext = createContext();
const LAST_ACTIVITY_KEY = 'lastActivityAt';
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

// Safely parse a JSON string from localStorage; returns null on any error
const safeParse = (str) => {
  try {
    if (!str || str === 'undefined' || str === 'null') return null;
    return JSON.parse(str);
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const clearAuthStorage = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  }, []);

  const logout = useCallback(() => {
    clearAuthStorage();
    setCurrentUser(null);
    setIsAuthenticated(false);
  }, [clearAuthStorage]);

  // Set the initial authentication state based on localStorage
  useEffect(() => {
    const token = localStorage.getItem('token');
    const refreshToken = localStorage.getItem('refreshToken');
    const user = safeParse(localStorage.getItem('user'));
    
    if (token && refreshToken && user) {
      setIsAuthenticated(true);
      setCurrentUser(user);
      if (!localStorage.getItem(LAST_ACTIVITY_KEY)) {
        localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
      }
    } else {
      // Clear all auth data if any piece is missing
      clearAuthStorage();
      setIsAuthenticated(false);
      setCurrentUser(null);
    }
    setIsLoading(false);
  }, [clearAuthStorage]);

  // Listen for localStorage changes across tabs
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'token' || e.key === 'refreshToken' || e.key === 'user') {
        const token = localStorage.getItem('token');
        const refreshToken = localStorage.getItem('refreshToken');
        const user = localStorage.getItem('user');
        
        if (token && refreshToken && user) {
          // User logged in from another tab
          const parsed = safeParse(user);
          if (parsed) {
            setIsAuthenticated(true);
            setCurrentUser(parsed);
          } else {
            setIsAuthenticated(false);
            setCurrentUser(null);
          }
        } else {
          // User logged out from another tab
          setIsAuthenticated(false);
          setCurrentUser(null);
        }
      }
    };

    // Add event listener for storage changes
    window.addEventListener('storage', handleStorageChange);

    // Cleanup event listener
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const markActivity = () => {
      localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
    };

    const checkIdleSession = () => {
      const lastActivityAt = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || Date.now());
      if (Date.now() - lastActivityAt >= IDLE_TIMEOUT_MS) {
        logout();
        if (window.location.pathname !== '/signin') {
          window.location.assign('/signin');
        }
      }
    };

    markActivity();
    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, markActivity, { passive: true });
    });
    const intervalId = window.setInterval(checkIdleSession, 60 * 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, markActivity);
      });
      window.clearInterval(intervalId);
    };
  }, [isAuthenticated, logout]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const refreshActiveSession = async () => {
      const refreshToken = localStorage.getItem('refreshToken');
      const lastActivityAt = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || Date.now());
      const isIdle = Date.now() - lastActivityAt >= IDLE_TIMEOUT_MS;

      if (!refreshToken || isIdle) return;

      try {
        const response = await api.post('/auth/refresh', { refreshToken });
        if (response.status >= 400 || response.data?.success === false) {
          throw new Error(response.data?.message || 'Unable to refresh session');
        }
        if (response.data?.token) {
          localStorage.setItem('token', response.data.token);
        }
      } catch (error) {
        logout();
        if (window.location.pathname !== '/signin') {
          window.location.assign('/signin');
        }
      }
    };

    const intervalId = window.setInterval(refreshActiveSession, 50 * 60 * 1000);
    refreshActiveSession();

    return () => window.clearInterval(intervalId);
  }, [isAuthenticated, logout]);

  const value = {
    currentUser,
    setCurrentUser,
    isAuthenticated,
    setIsAuthenticated,
    isLoading,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext; 
