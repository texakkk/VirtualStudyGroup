import React, { createContext, useContext, useMemo, useState } from 'react';

const VideoChatContext = createContext();

export const useVideoChat = () => useContext(VideoChatContext);

export const VideoChatProvider = ({ children }) => {
  const [videoChatState, setVideoChatState] = useState({
    inCall: false,
    sessionId: null,
    userList: [],
    activeCall: null,
    isPanelOpen: false,
    isMinimized: false,
  });

  const startVideoChat = (call) => {
    setVideoChatState((prev) => ({
      ...prev,
      activeCall: call,
      isPanelOpen: true,
      isMinimized: false,
    }));
  };

  const openVideoChatPanel = () => {
    setVideoChatState((prev) => ({
      ...prev,
      isPanelOpen: true,
      isMinimized: false,
    }));
  };

  const minimizeVideoChatPanel = () => {
    setVideoChatState((prev) => ({
      ...prev,
      isPanelOpen: true,
      isMinimized: true,
    }));
  };

  const closeVideoChatPanel = () => {
    setVideoChatState((prev) => ({
      ...prev,
      isPanelOpen: false,
      isMinimized: true,
    }));
  };

  const clearVideoChat = () => {
    setVideoChatState((prev) => ({
      ...prev,
      inCall: false,
      sessionId: null,
      userList: [],
      activeCall: null,
      isPanelOpen: false,
      isMinimized: false,
    }));
  };

  const value = useMemo(
    () => ({
      videoChatState,
      setVideoChatState,
      startVideoChat,
      openVideoChatPanel,
      minimizeVideoChatPanel,
      closeVideoChatPanel,
      clearVideoChat,
    }),
    [videoChatState]
  );

  return (
    <VideoChatContext.Provider value={value}>
      {children}
    </VideoChatContext.Provider>
  );
};
