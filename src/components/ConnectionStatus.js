import React, { useState, useEffect } from 'react';
import { Snackbar, Alert, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useConnectionStatus } from '../hooks/useConnectionStatus';

/**
 * Connection Status Component
 * Shows a banner when backend connection is lost
 */
const ConnectionStatus = () => {
  const isOnline = useConnectionStatus();
  const [showOffline, setShowOffline] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setShowOffline(true);
      setShowReconnected(false);
    } else {
      // If we were offline and now online, show reconnected message
      if (showOffline) {
        setShowReconnected(true);
        setTimeout(() => setShowReconnected(false), 3000);
      }
      setShowOffline(false);
    }
  }, [isOnline, showOffline]);

  const handleCloseOffline = () => {
    setShowOffline(false);
  };

  const handleCloseReconnected = () => {
    setShowReconnected(false);
  };

  return (
    <>
      {/* Offline Banner */}
      <Snackbar
        open={showOffline}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert 
          severity="error" 
          variant="filled" 
          sx={{ width: '100%' }}
          action={
            <IconButton
              size="small"
              aria-label="close"
              color="inherit"
              onClick={handleCloseOffline}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          }
        >
          Connection lost. Trying to reconnect...
        </Alert>
      </Snackbar>

      {/* Reconnected Banner */}
      <Snackbar
        open={showReconnected}
        autoHideDuration={3000}
        onClose={handleCloseReconnected}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert 
          severity="success" 
          variant="filled" 
          sx={{ width: '100%' }}
          onClose={handleCloseReconnected}
        >
          Connection restored!
        </Alert>
      </Snackbar>
    </>
  );
};

export default ConnectionStatus;
