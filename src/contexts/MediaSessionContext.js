import React, { createContext, useContext, useMemo, useState } from 'react';

const MediaSessionContext = createContext();

export const useMediaSession = () => useContext(MediaSessionContext);

export const MediaSessionProvider = ({ children }) => {
  const [mediaSessionState, setMediaSessionState] = useState({
    activeSession: null,
    isPanelOpen: false,
    isMinimized: false,
    isCollapsed: false,
  });

  const openMediaSession = (session) => {
    setMediaSessionState((prev) => ({
      ...prev,
      activeSession: session,
      isPanelOpen: true,
      isMinimized: false,
      isCollapsed: false,
    }));
  };

  const openMediaSessionPanel = () => {
    setMediaSessionState((prev) => ({
      ...prev,
      isPanelOpen: true,
      isMinimized: false,
      isCollapsed: false,
    }));
  };

  const minimizeMediaSessionPanel = () => {
    setMediaSessionState((prev) => ({
      ...prev,
      isPanelOpen: true,
      isMinimized: true,
      isCollapsed: false,
    }));
  };

  const collapseMediaSessionPanel = () => {
    setMediaSessionState((prev) => ({
      ...prev,
      isPanelOpen: true,
      isMinimized: false,
      isCollapsed: true,
    }));
  };

  const closeMediaSessionPanel = () => {
    setMediaSessionState((prev) => ({
      ...prev,
      isPanelOpen: true,
      isMinimized: false,
      isCollapsed: true,
    }));
  };

  const clearMediaSession = () => {
    setMediaSessionState({
      activeSession: null,
      isPanelOpen: false,
      isMinimized: false,
      isCollapsed: false,
    });
  };

  const value = useMemo(
    () => ({
      mediaSessionState,
      setMediaSessionState,
      openMediaSession,
      openMediaSessionPanel,
      minimizeMediaSessionPanel,
      collapseMediaSessionPanel,
      closeMediaSessionPanel,
      clearMediaSession,
    }),
    [mediaSessionState]
  );

  return (
    <MediaSessionContext.Provider value={value}>
      {children}
    </MediaSessionContext.Provider>
  );
};
