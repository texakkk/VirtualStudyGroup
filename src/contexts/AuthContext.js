import React, { createContext, useState, useEffect, useContext } from 'react';

// Create the context
const AuthContext = createContext();

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

  // Set the initial authentication state based on localStorage
  useEffect(() => {
    const token = localStorage.getItem('token');
    const refreshToken = localStorage.getItem('refreshToken');
    const user = safeParse(localStorage.getItem('user'));
    
    if (token && refreshToken && user) {
      setIsAuthenticated(true);
      setCurrentUser(user);
    } else {
      // Clear all auth data if any piece is missing
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      setIsAuthenticated(false);
      setCurrentUser(null);
    }
    setIsLoading(false);
  }, []);

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

  // Logout function to update the state and clear localStorage
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setCurrentUser(null);
    setIsAuthenticated(false);
  };

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