
import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { CssBaseline, CircularProgress, Box, IconButton } from '@mui/material';
import { SnackbarProvider } from 'notistack';
import CloseIcon from '@mui/icons-material/Close';
import { AuthProvider } from './contexts/AuthContext'; // Import Auth Context and Provider
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { ToastProvider } from './contexts/ToastContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { SettingsProvider } from './contexts/SettingsContext';
import PublicLayout from './components/layout/PublicLayout'; // Layout for public pages
import PrivateRoute from './components/common/PrivateRoute'; // Private Route
import SkipLinks from './components/accessibility/SkipLinks';
import AccessibilityEnhancer from './components/accessibility/AccessibilityEnhancer';
import LiveRegionAnnouncer from './components/accessibility/LiveRegionAnnouncer';
import KeyboardNavigationHelper from './components/accessibility/KeyboardNavigationHelper';
import OfflineIndicator from './components/common/OfflineIndicator';
import './i18n/config';
import './styles/rtl.css';
import './styles/accessibility.css';
import './styles/responsive.css';
import './config/antdConfig'; // Import Ant Design global configuration

// Lazy load page components for code splitting
const Home = lazy(() => import('./pages/public/Home'));
const Features = lazy(() => import('./pages/public/Features'));
const FAQ = lazy(() => import('./pages/public/FAQ'));
const About = lazy(() => import('./pages/public/About'));
const SignIn = lazy(() => import('./pages/auth/SignIn'));
const GetStarted = lazy(() => import('./pages/public/GetStarted'));
const Pricing = lazy(() => import('./pages/public/Pricing'));
const Contact = lazy(() => import('./pages/public/Contact'));
const JoinGroup = lazy(() => import('./pages/Dashboard/JoinGroup'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const Dashboardd = lazy(() => import('./pages/Dashboard/dashboardd'));

// Loading fallback component
const LoadingFallback = () => (
  <Box
    sx={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      width: '100vw',
    }}
  >
    <CircularProgress />
  </Box>
);

function App() {
  // Create a ref for the snackbar provider to access closeSnackbar
  const notistackRef = React.createRef();
  
  // Custom close action for all snackbars
  const onClickDismiss = (key) => () => {
    notistackRef.current.closeSnackbar(key);
  };

  return (
    <Suspense fallback={<LoadingFallback />}>
      <LanguageProvider>
        <SettingsProvider>
          <ThemeProvider>
            <CssBaseline />
            <SnackbarProvider 
              maxSnack={3}
              ref={notistackRef}
              action={(key) => (
                <IconButton
                  size="small"
                  aria-label="close"
                  color="inherit"
                  onClick={onClickDismiss(key)}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              )}
              anchorOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
              autoHideDuration={5000}
              preventDuplicate
            >
              <AuthProvider>
                <NotificationProvider>
                  <ToastProvider>
                    <AccessibilityEnhancer>
                      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                        <SkipLinks />
                        <LiveRegionAnnouncer />
                        <KeyboardNavigationHelper />
                        <OfflineIndicator />
                        <Routes>
                        {/* Public Routes wrapped in PublicLayout */}
                        <Route path="/" element={<PublicLayout><Home /></PublicLayout>} />
                        <Route path="/features" element={<PublicLayout><Features /></PublicLayout>} />
                        <Route path="/faq" element={<PublicLayout><FAQ /></PublicLayout>} />
                        <Route path="/about" element={<PublicLayout><About /></PublicLayout>} />
                        <Route path="/pricing" element={<PublicLayout><Pricing /></PublicLayout>} />
                        <Route path="/contact" element={<PublicLayout><Contact /></PublicLayout>} />

                        {/* Pages without Navbar and Footer */}
                        <Route path="/signin" element={<SignIn />} />
                        <Route path="/get-started" element={<GetStarted />} />
                        <Route path="/forgot-password" element={<ForgotPassword />} />
                        <Route path="/reset-password/:token" element={<ResetPassword />} />
                        <Route path="/join-group/:invitationToken" element={<JoinGroup />} />

                        {/* Protected Route for Dashboard */}
                        <Route
                          path="/dashboard/*"
                          element={
                            <PrivateRoute>
                              <Dashboardd />
                            </PrivateRoute>
                          }
                        />
                        </Routes>
                      </Router>
                    </AccessibilityEnhancer>
                  </ToastProvider>
                </NotificationProvider>
              </AuthProvider>
            </SnackbarProvider>
          </ThemeProvider>
        </SettingsProvider>
      </LanguageProvider>
    </Suspense>
  );
}

export default App;