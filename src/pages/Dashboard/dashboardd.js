import React, { useState, useEffect, lazy, Suspense } from 'react';
import { NavLink, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import * as Icons from 'react-icons/fa';
import { useAuth } from '../../contexts/AuthContext';
import { VideoChatProvider, useVideoChat } from '../../contexts/VideoChatContext';
import { MediaSessionProvider, useMediaSession } from '../../contexts/MediaSessionContext';
import NotificationBell from '../../components/notifications/NotificationBell';
import SearchBar from '../../components/common/SearchBar';
import MobileBottomNav from '../../components/layout/MobileBottomNav';
import { Box, Avatar, Typography, IconButton, CircularProgress } from '@mui/material';
import { Logout as LogoutIcon, Settings as SettingsIcon } from '@mui/icons-material';
import api from '../../api';
import VideoChat from './VideoChat';
import SynchronizedVideoPlayer from '../../components/VideoPlayer/SynchronizedVideoPlayer';

import './dashboardd.css';

// Lazy load dashboard page components for better performance
const DashboardSummary = lazy(() => import('./DashboardSummary'));
const GroupManagement = lazy(() => import('./GroupManagement'));
const TaskManager = lazy(() => import('./TaskManager'));
const GroupChatPage = lazy(() => import('./GroupChatPage'));
const Profile = lazy(() => import('./Profile'));
const EditProfile = lazy(() => import('./EditProfile'));
const Settings = lazy(() => import('./Settings'));
const ProjectReport = lazy(() => import('./ProjectReport'));
const NotificationCenter = lazy(() => import('./NotificationCenter'));
const NotesManager = lazy(() => import('../../components/Notes').then(module => ({ default: module.NotesManager })));
const AIAssistant = lazy(() => import('./AIAssistant'));
const SmartTaskPrioritization = lazy(() => import('./SmartTaskPrioritization'));
const GroupInsightsDashboard = lazy(() => import('./GroupInsightsDashboard'));
const MediaSessions = lazy(() => import('./MediaSessions'));

const BackgroundVideoCall = () => {
  const {
    videoChatState,
    openVideoChatPanel,
    minimizeVideoChatPanel,
    closeVideoChatPanel,
    clearVideoChat,
  } = useVideoChat();
  const { activeCall, isPanelOpen, isMinimized } = videoChatState;

  if (!activeCall?.groupId) return null;

  return (
    <div
      className={`background-video-call ${
        !isPanelOpen ? 'closed' : isMinimized ? 'minimized' : 'open'
      }`}
    >
      <div className="background-video-call-bar">
        <span>{activeCall.groupName || 'Video call'}</span>
        <div className="background-video-call-actions">
          {isMinimized ? (
            <button type="button" onClick={openVideoChatPanel}>
              Open
            </button>
          ) : (
            <button type="button" onClick={minimizeVideoChatPanel}>
              Minimize
            </button>
          )}
          <button type="button" onClick={closeVideoChatPanel}>
            Close
          </button>
        </div>
      </div>
      <div className="background-video-call-body">
        <VideoChat
          groupId={activeCall.groupId}
          groupName={activeCall.groupName}
          onLeave={clearVideoChat}
        />
      </div>
    </div>
  );
};

const BackgroundMediaSession = () => {
  const {
    mediaSessionState,
    openMediaSessionPanel,
    minimizeMediaSessionPanel,
    collapseMediaSessionPanel,
    closeMediaSessionPanel,
    clearMediaSession,
  } = useMediaSession();
  const { activeSession, isPanelOpen, isMinimized, isCollapsed } = mediaSessionState;

  if (!activeSession?.groupId || !activeSession?.sessionId) return null;

  const handleEndSession = async () => {
    const confirmed = window.confirm(
      'End this media session for everyone?'
    );
    if (!confirmed) return;

    try {
      await api.post(`/media-sessions/${activeSession.sessionId}/end`);
      clearMediaSession();
    } catch (error) {
      console.error('Failed to end media session:', error);
      window.alert(
        error.response?.data?.message ||
          'Failed to end media session. Only the host can end it.'
      );
    }
  };

  return (
    <div
      className={`background-media-session ${
        !isPanelOpen
          ? 'closed'
          : isMinimized
            ? 'minimized'
            : isCollapsed
              ? 'collapsed'
              : 'open'
      }`}
    >
      <div className="background-media-session-bar">
        <span>{activeSession.title || activeSession.groupName || 'Media session'}</span>
        <div className="background-media-session-actions">
          {isMinimized && (
            <button type="button" onClick={openMediaSessionPanel}>
              Open
            </button>
          )}
          {isCollapsed && (
            <button type="button" onClick={openMediaSessionPanel}>
              Expand
            </button>
          )}
          {!isMinimized && !isCollapsed && (
            <button type="button" onClick={collapseMediaSessionPanel}>
              Collapse
            </button>
          )}
          {!isMinimized && (
            <button type="button" onClick={minimizeMediaSessionPanel}>
              Minimize
            </button>
          )}
          <button type="button" onClick={closeMediaSessionPanel}>
            Close
          </button>
          <button type="button" onClick={handleEndSession}>
            End Session
          </button>
        </div>
      </div>
      <div className="background-media-session-body">
        <SynchronizedVideoPlayer
          key={activeSession.sessionId}
          groupId={activeSession.groupId}
          sessionId={activeSession.sessionId}
          onClose={closeMediaSessionPanel}
          onCollapse={collapseMediaSessionPanel}
          onSessionEnded={clearMediaSession}
        />
      </div>
    </div>
  );
};

// Loading component for lazy-loaded routes
const RouteLoader = () => (
  <Box sx={{ 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    minHeight: '400px' 
  }}>
    <CircularProgress />
  </Box>
);

// Sidebar Component
const Sidebar = ({ isCollapsed, toggleSidebar, onLogout, isMobileMenuOpen, toggleMobileMenu }) => {

  const links = [
    { to: '/dashboard', icon: <Icons.FaHome />, label: 'Dashboard' },
    { to: '/dashboard/group-management', icon: <Icons.FaUsers />, label: 'Group Management' },
    { to: '/dashboard/task-manager', icon: <Icons.FaTasks />, label: 'Task Manager' },
    { to: '/dashboard/notes', icon: <Icons.FaStickyNote />, label: 'Notes' },
    { to: '/dashboard/group-chat-page', icon: <Icons.FaComments />, label: 'Group Chat' },
    { to: '/dashboard/media-sessions', icon: <Icons.FaVideo />, label: 'Media Sessions' },
    { to: '/dashboard/ai-assistant', icon: <Icons.FaRobot />, label: 'AI Assistant' },
    { to: '/dashboard/smart-prioritization', icon: <Icons.FaBrain />, label: 'Smart Prioritization' },
    { to: '/dashboard/group-insights', icon: <Icons.FaChartLine />, label: 'Group Insights' },
    { to: '/dashboard/project-report', icon: <Icons.FaFileAlt />, label: 'Project Report' },
  ];

  return (
    <Box className={`sidebar-container ${isCollapsed ? 'collapsed' : ''} ${isMobileMenuOpen ? 'show-mobile' : ''}`}>
      <Box className="sidebar">
        {/* Logo and Toggle Section */}
        <Box className="sidebar-header">
        {!isCollapsed && (
          <Typography variant="h6" component="h1" noWrap className="logo-text">
            Study Hub
          </Typography>
        )}
        <IconButton 
          className="sidebar-toggle" 
          onClick={toggleSidebar}
          size="small"
          sx={{ 
            ml: isCollapsed ? 0 : 'auto',
            color: 'inherit',
            '&:hover': {
              backgroundColor: 'rgba(15, 23, 42, 0.06)'
            }
          }}
        >
          {isCollapsed ? <Icons.FaIndent /> : <Icons.FaOutdent />}
        </IconButton>
      </Box>
      
      {/* Navigation Links */}
      <Box className="nav-section">
        <nav className="nav-links">
          {links.map((link, idx) => (
            <NavLink
              key={idx}
              to={link.to}
              className={({ isActive }) => 
                `nav-item ${isActive ? 'active' : ''} ${isCollapsed ? 'collapsed' : ''}`
              }
            >
              {({ isActive }) => (
                <>
                  <Box className="nav-icon">{link.icon}</Box>
                  {!isCollapsed && (
                    <Typography variant="body2" className="nav-label">
                      {link.label}
                    </Typography>
                  )}
                  {isActive && !isCollapsed && (
                    <Box className="active-indicator" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </Box>
  
      {/* Bottom Actions */}
      <Box className="sidebar-footer">
        <NavLink 
          to="/dashboard/settings" 
          className={({ isActive }) => 
            `footer-item ${isActive ? 'active' : ''} ${isCollapsed ? 'collapsed' : ''}` 
            
          }
        >
          <SettingsIcon fontSize={isCollapsed ? "medium" : "small"} />
          {!isCollapsed && <span>Settings</span>}
        </NavLink>
        <button 
          className={`footer-item logout-button ${isCollapsed ? 'collapsed' : ''}`} 
          onClick={onLogout}
        >
          <LogoutIcon fontSize={isCollapsed ? "medium" : "small"} />
          {!isCollapsed && <span>Logout</span>}
        </button>
      </Box>
    </Box>
    </Box>
  );
};

// Main Dashboard Component
const Dashboardd = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const response = await api.get('/auth/profile');
        setUser(response.data);
      } catch (error) {
        console.error('Error fetching user profile:', error);
        // Redirect to login if not authenticated
        if (error.response?.status === 401) {
          logout();
          navigate('/signin');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, [navigate, logout]);

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
    // Close mobile menu if open when toggling sidebar
    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
    }
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  // Close mobile menu when route changes
  const location = useLocation();
  
  useEffect(() => {
    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const handleLogout = () => {
    logout();
    navigate('/signin');
  };

  const userInitial = user?.User_name ? user.User_name[0].toUpperCase() : 'U';

  if (loading) {
    return (
      <Box className="dashboard-loading">
        <CircularProgress />
      </Box>
    );
  }

  const dashboardContent = (
    <Box className="dashboard-container">      
      <div 
        className={`sidebar-overlay ${isMobileMenuOpen ? 'active' : ''}`}
        onClick={toggleMobileMenu}
      />
      
      
        <Sidebar 
          isCollapsed={isCollapsed} 
          toggleSidebar={toggleSidebar} 
          onLogout={handleLogout}
          isMobileMenuOpen={isMobileMenuOpen}
          toggleMobileMenu={toggleMobileMenu}
        />
      
      
      {/* Mobile header with menu toggle */}
      <Box className="mobile-header">
        <IconButton 
          className="mobile-menu-toggle" 
          onClick={toggleMobileMenu}
          aria-label="Toggle menu"
          sx={{ 
            color: 'inherit',
            display: { xs: 'flex', lg: 'none' },
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px',
            borderRadius: '4px',
            '&:hover': {
              backgroundColor: 'rgba(15, 23, 42, 0.06)'
            }
          }}
        >
          <Icons.FaBars />
        </IconButton>
        <Typography variant="h6" component="h1" sx={{ 
          ml: 2,
          display: { xs: 'block', lg: 'none' },
          fontWeight: 600,
          flex: 1
        }}>
          Study Hub
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SearchBar />
          <NotificationBell />
          <IconButton
            onClick={() => navigate('/dashboard/profile')}
            aria-label="Open profile"
            sx={{ p: 0.25 }}
          >
            <Avatar
              src={user?.User_profilePicture}
              alt={user?.User_name || 'User'}
              sx={{ width: 34, height: 34, fontSize: '0.95rem', bgcolor: '#334155' }}
            >
              {userInitial}
            </Avatar>
          </IconButton>
        </Box>
      </Box>

      {/* Desktop header - always visible */}
      <Box className={`desktop-header ${isCollapsed ? 'collapsed' : ''}`}>
        <Box className="desktop-header-content">
          <SearchBar />
          <NotificationBell />
          <button
            type="button"
            className="topbar-profile"
            onClick={() => navigate('/dashboard/profile')}
          >
            <Avatar
              src={user?.User_profilePicture}
              alt={user?.User_name || 'User'}
              sx={{ width: 32, height: 32, fontSize: '0.9rem', bgcolor: '#334155' }}
            >
              {userInitial}
            </Avatar>
            <span>{user?.User_name || 'Profile'}</span>
          </button>
        </Box>
      </Box>
      
      <Box className={`main-content ${isCollapsed ? 'expanded' : ''}`}>
        <Suspense fallback={<RouteLoader />}>
          <Routes>
            <Route index element={<DashboardSummary />} />
            <Route path="group-management" element={<GroupManagement />} />
            <Route path="task-manager" element={<TaskManager />} />
            <Route path="task-manager/:groupId" element={<TaskManager />} />
            <Route path="notes" element={<NotesManager />} />
            <Route path="notes/:noteId" element={<NotesManager />} />
            <Route path="group-chat-page" element={<GroupChatPage />} />
            <Route path="media-sessions" element={<MediaSessions />} />
            <Route path="ai-assistant" element={<AIAssistant />} />
            <Route path="smart-prioritization" element={<SmartTaskPrioritization />} />
            <Route path="smart-prioritization/:groupId" element={<SmartTaskPrioritization />} />
            <Route path="group-insights" element={<GroupInsightsDashboard />} />
            <Route path="group-insights/:groupId" element={<GroupInsightsDashboard />} />
            <Route path="notifications" element={<NotificationCenter />} />
            <Route path="profile" element={<Profile />} />
            <Route path="profile/edit" element={<EditProfile />} />
            <Route path="settings" element={<Settings />} />
            <Route path="project-report" element={<ProjectReport />} />
          </Routes>
        </Suspense>
      </Box>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
      <BackgroundVideoCall />
      <BackgroundMediaSession />
    </Box>
  );

  return (
    <VideoChatProvider>
      <MediaSessionProvider>{dashboardContent}</MediaSessionProvider>
    </VideoChatProvider>
  );
};

export default Dashboardd;
