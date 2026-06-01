import { useContext } from 'react';
import { NotificationContext } from '../contexts/NotificationContext';

/**
 * Custom hook to access notification functions
 * @returns {Object} Notification methods { showSuccess, showError, showWarning, showInfo }
 */
const useNotification = () => {
  const context = useContext(NotificationContext);
  
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  
  return context;
};

export default useNotification;
