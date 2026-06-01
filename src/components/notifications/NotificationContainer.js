import React from 'react';
import { SnackbarProvider } from 'notistack';
import { ThemeProvider, createTheme } from '@mui/material/styles';

export const NotificationContainer = ({ children }) => {
  const theme = createTheme({
    components: {
      MuiSnackbar: {
        styleOverrides: {
          root: {
            '& .MuiPaper-root': {
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            },
          },
        },
      },
    },
    palette: {
      success: {
        main: '#4caf50',
        contrastText: '#fff',
      },
      error: {
        main: '#f44336',
        contrastText: '#fff',
      },
      warning: {
        main: '#ff9800',
        contrastText: '#fff',
      },
      info: {
        main: '#2196f3',
        contrastText: '#fff',
      },
    },
  });

  return (
    <ThemeProvider theme={theme}>
      <SnackbarProvider
        maxSnack={3}
        preventDuplicate
        autoHideDuration={3000}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        {children}
      </SnackbarProvider>
    </ThemeProvider>
  );
};

export default NotificationContainer;
