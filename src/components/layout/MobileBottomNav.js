/**
 * MobileBottomNav Component
 * Task 19.1: Mobile-specific bottom navigation for dashboard
 * 
 * Provides touch-friendly navigation for mobile devices
 */

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BottomNavigation, BottomNavigationAction, Paper, Modal, Box, List, ListItem, ListItemButton, ListItemIcon, ListItemText, IconButton } from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Group as GroupIcon,
  Assignment as TaskIcon,
  Chat as ChatIcon,
  VideoLibrary as VideoLibraryIcon,
  MoreVert as MoreVertIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import * as Icons from 'react-icons/fa';
import { useResponsive } from '../../hooks/useResponsive';

const MobileBottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile } = useResponsive();
  const [openMoreMenu, setOpenMoreMenu] = useState(false);

  // Don't show on desktop
  if (!isMobile) return null;

  // Get current path
  const currentPath = (location.pathname.split('/dashboard/')[1] || '').split('/')[0];

  const primaryNavigationItems = [
    { label: 'Dashboard', value: '', icon: <DashboardIcon /> },
    { label: 'Groups', value: 'group-management', icon: <GroupIcon /> },
    { label: 'Tasks', value: 'task-manager', icon: <TaskIcon /> },
    { label: 'Chat', value: 'group-chat-page', icon: <ChatIcon /> },
    { label: 'Media', value: 'media-sessions', icon: <VideoLibraryIcon /> },
  ];

  const moreNavigationItems = [
    { label: 'Notes', value: 'notes', icon: <Icons.FaStickyNote /> },
    { label: 'AI Assistant', value: 'ai-assistant', icon: <Icons.FaRobot /> },
    { label: 'Smart Prioritization', value: 'smart-prioritization', icon: <Icons.FaBrain /> },
    { label: 'Group Insights', value: 'group-insights', icon: <Icons.FaChartLine /> },
    { label: 'Project Report', value: 'project-report', icon: <Icons.FaFileAlt /> },
    { label: 'Notifications', value: 'notifications', icon: <Icons.FaBell /> },
    { label: 'Settings', value: 'settings', icon: <Icons.FaCog /> },
    { label: 'Profile', value: 'profile', icon: <Icons.FaUser /> },
  ];

  const handleChange = (event, newValue) => {
    navigate(`/dashboard/${newValue}`);
  };

  const handleMoreItemClick = (value) => {
    navigate(`/dashboard/${value}`);
    setOpenMoreMenu(false);
  };

  return (
    <>
      <Paper
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1100,
          borderTop: 1,
          borderColor: 'divider',
          pb: 'env(safe-area-inset-bottom)',
        }}
        elevation={3}
      >
        <BottomNavigation
          value={currentPath}
          onChange={handleChange}
          showLabels
          sx={{
            height: 'auto',
            minHeight: 56,
            '& .MuiBottomNavigationAction-root': {
              minWidth: 'auto',
              padding: '6px 12px 8px',
              '&.Mui-selected': {
                paddingTop: '6px',
              },
            },
            '& .MuiBottomNavigationAction-label': {
              fontSize: '0.75rem',
              '&.Mui-selected': {
                fontSize: '0.75rem',
              },
            },
          }}
        >
          {primaryNavigationItems.map((item) => (
            <BottomNavigationAction
              key={item.value}
              label={item.label}
              value={item.value}
              icon={item.icon}
            />
          ))}
          <BottomNavigationAction
            label="More"
            value="more"
            icon={<MoreVertIcon />}
            onClick={() => setOpenMoreMenu(true)}
          />
        </BottomNavigation>
      </Paper>

      {/* More Menu Modal */}
      <Modal
        open={openMoreMenu}
        onClose={() => setOpenMoreMenu(false)}
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end',
        }}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: '100vw',
            backgroundColor: 'background.paper',
            borderRadius: '16px 16px 0 0',
            maxHeight: '70vh',
            overflow: 'auto',
            p: 2,
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <h3 style={{ margin: 0 }}>More Options</h3>
            <IconButton
              onClick={() => setOpenMoreMenu(false)}
              size="small"
              sx={{ color: 'text.secondary' }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
          <List>
            {moreNavigationItems.map((item) => (
              <ListItem key={item.value} disablePadding sx={{ mb: 1 }}>
                <ListItemButton
                  onClick={() => handleMoreItemClick(item.value)}
                  sx={{
                    borderRadius: '8px',
                    '&:hover': {
                      backgroundColor: '#f5f5f5',
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary' }}>
                    {typeof item.icon === 'string' ? (
                      <span style={{ fontSize: '1.25rem' }}>{item.icon}</span>
                    ) : (
                      item.icon
                    )}
                  </ListItemIcon>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Modal>
    </>
  );
};

export default MobileBottomNav;
