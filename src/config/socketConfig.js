import { getSocketBaseUrl } from './apiConfig';

// Centralized Socket.IO configuration with aggressive keep-alive settings
export const socketConfig = {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 60000, // Increased from 20s to 60s
  transports: ['websocket', 'polling'],
  autoConnect: true,
  forceNew: false,
  
  // Keep-alive settings to prevent connection drops
  pingTimeout: 60000, // 60 seconds
  pingInterval: 25000, // 25 seconds - send ping every 25s
  
  // Upgrade settings
  upgrade: true,
  rememberUpgrade: true,
  
  // Additional stability settings
  closeOnBeforeunload: false,
  withCredentials: true,
};

export const getSocketUrl = (namespace = '') => {
  const baseUrl = getSocketBaseUrl();
  return namespace ? `${baseUrl}/${namespace}` : baseUrl;
};
