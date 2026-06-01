import { useState, useEffect } from 'react';
import connectionMonitor from '../utils/connectionMonitor';

/**
 * Hook to monitor backend connection status
 * @returns {boolean} isOnline - Whether the backend is reachable
 */
export const useConnectionStatus = () => {
  const [isOnline, setIsOnline] = useState(connectionMonitor.getStatus());

  useEffect(() => {
    // Start monitoring
    connectionMonitor.start();

    // Listen for status changes
    const unsubscribe = connectionMonitor.addListener((status) => {
      setIsOnline(status);
    });

    // Cleanup
    return () => {
      unsubscribe();
    };
  }, []);

  return isOnline;
};

export default useConnectionStatus;
