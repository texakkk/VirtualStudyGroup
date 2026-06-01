import React, { useState, useEffect } from "react";
import { useSnackbar } from "notistack";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../../contexts/ThemeContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { FiArrowLeft } from "react-icons/fi";
import {
  Box,
  Typography,
  Button,
  Divider,
  Paper,
  TextField,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  useMediaQuery,
  IconButton,
  CircularProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import { useAuth } from "../../contexts/AuthContext";
import PaletteIcon from "@mui/icons-material/Palette";
import LanguageIcon from "@mui/icons-material/Language";
import LockIcon from "@mui/icons-material/Lock";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import AccessibilityIcon from "@mui/icons-material/Accessibility";
import SettingsIcon from "@mui/icons-material/Settings";
import { FormControlLabel, Switch } from "@mui/material";
import api from "../../api";

const Settings = () => {
  const { currentUser, logout } = useAuth();
  const { theme: currentTheme, setTheme: updateTheme } = useTheme();
  const { currentLanguage, changeLanguage } = useLanguage();
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 768px)");

  // Local settings state
  const [settings, setSettings] = useState({
    theme: currentTheme || "light",
    fontSize: localStorage.getItem("fontSize") || "medium",
    language: currentLanguage || localStorage.getItem("i18nextLng")?.split("-")[0] || "en",
    accessibility: {
      highContrast: localStorage.getItem("highContrast") === "true",
      reducedMotion: localStorage.getItem("reducedMotion") === "true",
    },
    preferences: {
      autoSave: localStorage.getItem("autoSave") !== "false",
      notifications: localStorage.getItem("notifications") !== "false",
      soundEnabled: localStorage.getItem("soundEnabled") !== "false",
    },
  });

  // State for password change form
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  // State for account deletion
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("appearance");

  // Sync theme state with ThemeContext
  useEffect(() => {
    setSettings((prev) => ({
      ...prev,
      theme: currentTheme,
    }));
  }, [currentTheme]);

  useEffect(() => {
    setSettings((prev) => ({
      ...prev,
      language: currentLanguage || "en",
    }));
  }, [currentLanguage]);

  // Initialize settings on component mount
  useEffect(() => {
    // Apply current font size
    const currentFontSize = localStorage.getItem("fontSize") || "medium";
    document.documentElement.style.setProperty(
      "--font-size",
      currentFontSize === "small"
        ? "14px"
        : currentFontSize === "medium"
        ? "16px"
        : currentFontSize === "large"
        ? "18px"
        : "16px"
    );

    // Apply current language
    const initialLanguage =
      currentLanguage || localStorage.getItem("i18nextLng")?.split("-")[0] || "en";
    document.documentElement.lang = initialLanguage;

    // Apply accessibility settings
    const highContrast = localStorage.getItem("highContrast") === "true";
    const reducedMotion = localStorage.getItem("reducedMotion") === "true";

    if (highContrast) {
      document.documentElement.classList.add("high-contrast");
    }
    if (reducedMotion) {
      document.documentElement.classList.add("reduced-motion");
    }
  }, [currentLanguage]);

  // Handle local settings changes with success notifications
  const handleSettingChange = async (settingType, value, settingName) => {
    console.log(`Changing ${settingType} to:`, value);
    try {
      let updatedSettings = { ...settings };

      switch (settingType) {
        case "theme":
          console.log("Updating theme to:", value);
          updateTheme(value);
          updatedSettings.theme = value;
          break;
        case "fontSize":
          localStorage.setItem("fontSize", value);
          updatedSettings.fontSize = value;
          document.documentElement.style.setProperty(
            "--font-size",
            value === "small"
              ? "14px"
              : value === "medium"
              ? "16px"
              : value === "large"
              ? "18px"
              : value === "extra-large"
              ? "20px"
              : "16px"
          );
          break;
        case "language":
          await changeLanguage(value);
          // Keep legacy key for backward compatibility with older settings reads.
          localStorage.setItem("language", value);
          updatedSettings.language = value;
          document.documentElement.lang = value;
          break;
        case "accessibility":
          Object.keys(value).forEach((key) => {
            localStorage.setItem(key, value[key]);
            updatedSettings.accessibility[key] = value[key];
          });
          if (value.highContrast !== undefined) {
            if (value.highContrast) {
              document.documentElement.classList.add("high-contrast");
            } else {
              document.documentElement.classList.remove("high-contrast");
            }
          }
          if (value.reducedMotion !== undefined) {
            if (value.reducedMotion) {
              document.documentElement.classList.add("reduced-motion");
            } else {
              document.documentElement.classList.remove("reduced-motion");
            }
          }
          break;
        case "preferences":
          Object.keys(value).forEach((key) => {
            localStorage.setItem(key, value[key]);
            updatedSettings.preferences[key] = value[key];
          });
          break;
        default:
          break;
      }

      setSettings(updatedSettings);

      enqueueSnackbar(`${settingName} updated successfully`, {
        variant: "success",
        autoHideDuration: 3000,
      });
    } catch (error) {
      console.error("Error updating setting:", error);
      enqueueSnackbar(`Failed to update ${settingName}`, {
        variant: "error",
        autoHideDuration: 3000,
      });
    }
  };

  // Reset all settings
  const handleResetSettings = () => {
    try {
      // Clear localStorage
      localStorage.removeItem("fontSize");
      localStorage.removeItem("language");
      localStorage.removeItem("highContrast");
      localStorage.removeItem("reducedMotion");
      localStorage.removeItem("autoSave");
      localStorage.removeItem("notifications");
      localStorage.removeItem("soundEnabled");

      // Reset theme
      updateTheme("light");

      // Reset document properties
      document.documentElement.style.setProperty("--font-size", "16px");
      document.documentElement.lang = "en";
      document.documentElement.classList.remove(
        "high-contrast",
        "reduced-motion"
      );

      // Reset local state
      setSettings({
        theme: "light",
        fontSize: "medium",
        language: "en",
        accessibility: {
          highContrast: false,
          reducedMotion: false,
        },
        preferences: {
          autoSave: true,
          notifications: true,
          soundEnabled: true,
        },
      });

      enqueueSnackbar("All settings have been reset to defaults", {
        variant: "success",
        autoHideDuration: 3000,
      });
    } catch (error) {
      console.error("Error resetting settings:", error);
      enqueueSnackbar("Failed to reset settings", {
        variant: "error",
        autoHideDuration: 3000,
      });
    }
  };

  // Handle password change form input changes
  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle password form submission
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();

    // Validate form
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      enqueueSnackbar("New passwords do not match", { variant: "error" });
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      enqueueSnackbar("Password must be at least 6 characters long", {
        variant: "error",
      });
      return;
    }

    try {
      setIsLoading(true);

      // Call API to change password
      await api.put("/settings/password", {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });

      // Reset form
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

      enqueueSnackbar("Password updated successfully. Please log in again.", {
        variant: "success",
        autoHideDuration: 3000,
      });

      // Logout user after password change
      setTimeout(() => {
        logout();
        navigate("/login");
      }, 2000);
    } catch (error) {
      console.error("Error updating password:", error);
      const errorMessage =
        error.response?.data?.message || "Failed to update password";
      enqueueSnackbar(errorMessage, { variant: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle account deletion
  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      enqueueSnackbar(
        "Please enter your password to confirm account deletion",
        { variant: "error" }
      );
      return;
    }

    try {
      setIsLoading(true);

      // Call API to delete account
      await api.delete("/settings/account", {
        data: { password: deletePassword },
      });

      // Logout and redirect to home
      await logout();
      enqueueSnackbar("Your account has been deleted", { variant: "success" });
      navigate("/");
    } catch (error) {
      console.error("Error deleting account:", error);
      const errorMessage =
        error.response?.data?.message || "Failed to delete account";
      enqueueSnackbar(errorMessage, { variant: "error" });
    } finally {
      setIsLoading(false);
      setDeleteDialogOpen(false);
      setDeletePassword("");
    }
  };

  // Render the settings content based on the active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case "appearance":
        return (
          <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Appearance
            </Typography>
            <Divider sx={{ mb: 3 }} />

            <Box mb={4}>
              <Typography variant="subtitle1" gutterBottom>
                Theme
              </Typography>
              <Box display="flex" gap={2} mb={3} flexWrap="wrap">
                <Button
                  variant={
                    settings.theme === "light" ? "contained" : "outlined"
                  }
                  onClick={() => handleSettingChange("theme", "light", "Theme")}
                >
                  ☀️ Light
                </Button>
                <Button
                  variant={settings.theme === "dark" ? "contained" : "outlined"}
                  onClick={() => handleSettingChange("theme", "dark", "Theme")}
                >
                  🌙 Dark
                </Button>
                <Button
                  variant={
                    settings.theme === "high-contrast" ? "contained" : "outlined"
                  }
                  onClick={() =>
                    handleSettingChange("theme", "high-contrast", "Theme")
                  }
                >
                  ⚫⚪ High Contrast
                </Button>
                <Button
                  variant={
                    settings.theme === "system" ? "contained" : "outlined"
                  }
                  onClick={() =>
                    handleSettingChange("theme", "system", "Theme")
                  }
                >
                  🖥️ System
                </Button>
              </Box>

              <Typography variant="subtitle1" gutterBottom>
                Font Size
              </Typography>
              <Box
                display="flex"
                gap={2}
                alignItems="center"
                mb={3}
                flexWrap="wrap"
              >
                <Button
                  variant={
                    settings.fontSize === "small" ? "contained" : "outlined"
                  }
                  onClick={() =>
                    handleSettingChange("fontSize", "small", "Font Size")
                  }
                  size="small"
                >
                  Small (14px)
                </Button>
                <Button
                  variant={
                    settings.fontSize === "medium" ? "contained" : "outlined"
                  }
                  onClick={() =>
                    handleSettingChange("fontSize", "medium", "Font Size")
                  }
                  size="medium"
                >
                  Medium (16px)
                </Button>
                <Button
                  variant={
                    settings.fontSize === "large" ? "contained" : "outlined"
                  }
                  onClick={() =>
                    handleSettingChange("fontSize", "large", "Font Size")
                  }
                  size="large"
                >
                  Large (18px)
                </Button>
                <Button
                  variant={
                    settings.fontSize === "extra-large" ? "contained" : "outlined"
                  }
                  onClick={() =>
                    handleSettingChange("fontSize", "extra-large", "Font Size")
                  }
                  size="large"
                >
                  Extra Large (20px)
                </Button>
              </Box>

            </Box>
          </Paper>
        );

      case "language":
        return (
          <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Language & Localization
            </Typography>
            <Divider sx={{ mb: 3 }} />

            <Box display="flex" flexDirection="column" gap={2}>
              <Button
                variant={settings.language === "en" ? "contained" : "outlined"}
                onClick={() =>
                  handleSettingChange("language", "en", "Language")
                }
                fullWidth
                sx={{ justifyContent: "flex-start" }}
              >
                🇺🇸 English
              </Button>
              <Button
                variant={settings.language === "es" ? "contained" : "outlined"}
                onClick={() =>
                  handleSettingChange("language", "es", "Language")
                }
                fullWidth
                sx={{ justifyContent: "flex-start" }}
              >
                🇪🇸 Español
              </Button>
              <Button
                variant={settings.language === "fr" ? "contained" : "outlined"}
                onClick={() =>
                  handleSettingChange("language", "fr", "Language")
                }
                fullWidth
                sx={{ justifyContent: "flex-start" }}
              >
                🇫🇷 Français
              </Button>
              <Button
                variant={settings.language === "ar" ? "contained" : "outlined"}
                onClick={() =>
                  handleSettingChange("language", "ar", "Language")
                }
                fullWidth
                sx={{ justifyContent: "flex-start" }}
              >
                Arabic
              </Button>
            </Box>
          </Paper>
        );

      case "accessibility":
        return (
          <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Accessibility
            </Typography>
            <Divider sx={{ mb: 3 }} />

            <Box display="flex" flexDirection="column" gap={3}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.accessibility.highContrast}
                    onChange={(e) =>
                      handleSettingChange(
                        "accessibility",
                        { highContrast: e.target.checked },
                        "High Contrast"
                      )
                    }
                  />
                }
                label="High Contrast Mode"
              />
              <Typography
                variant="body2"
                color="textSecondary"
                sx={{ mt: -2, ml: 4 }}
              >
                Increases contrast for better visibility
              </Typography>

              <FormControlLabel
                control={
                  <Switch
                    checked={settings.accessibility.reducedMotion}
                    onChange={(e) =>
                      handleSettingChange(
                        "accessibility",
                        { reducedMotion: e.target.checked },
                        "Reduced Motion"
                      )
                    }
                  />
                }
                label="Reduce Motion"
              />
              <Typography
                variant="body2"
                color="textSecondary"
                sx={{ mt: -2, ml: 4 }}
              >
                Minimizes animations and transitions
              </Typography>
            </Box>
          </Paper>
        );

      case "preferences":
        return (
          <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Preferences
            </Typography>
            <Divider sx={{ mb: 3 }} />

            <Box display="flex" flexDirection="column" gap={3}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.preferences.autoSave}
                    onChange={(e) =>
                      handleSettingChange(
                        "preferences",
                        { autoSave: e.target.checked },
                        "Auto Save"
                      )
                    }
                  />
                }
                label="Auto Save"
              />
              <Typography
                variant="body2"
                color="textSecondary"
                sx={{ mt: -2, ml: 4 }}
              >
                Automatically save your work as you type
              </Typography>

              <FormControlLabel
                control={
                  <Switch
                    checked={settings.preferences.notifications}
                    onChange={(e) =>
                      handleSettingChange(
                        "preferences",
                        { notifications: e.target.checked },
                        "Notifications"
                      )
                    }
                  />
                }
                label="Enable Notifications"
              />
              <Typography
                variant="body2"
                color="textSecondary"
                sx={{ mt: -2, ml: 4 }}
              >
                Receive system and app notifications
              </Typography>

              <FormControlLabel
                control={
                  <Switch
                    checked={settings.preferences.soundEnabled}
                    onChange={(e) =>
                      handleSettingChange(
                        "preferences",
                        { soundEnabled: e.target.checked },
                        "Sound Effects"
                      )
                    }
                  />
                }
                label="Sound Effects"
              />
              <Typography
                variant="body2"
                color="textSecondary"
                sx={{ mt: -2, ml: 4 }}
              >
                Play sounds for interactions and notifications
              </Typography>

              <Divider sx={{ my: 2 }} />

              <Box>
                <Typography variant="subtitle1" gutterBottom color="error">
                  Reset Settings
                </Typography>
                <Typography variant="body2" color="textSecondary" paragraph>
                  This will reset all your settings to their default values.
                  This action cannot be undone.
                </Typography>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={handleResetSettings}
                >
                  Reset All Settings
                </Button>
              </Box>
            </Box>
          </Paper>
        );

      case "password":
        return (
          <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Change Password
            </Typography>
            <Divider sx={{ mb: 3 }} />

            <Box component="form" onSubmit={handlePasswordSubmit}>
              <TextField
                fullWidth
                margin="normal"
                label="Current Password"
                type="password"
                name="currentPassword"
                value={passwordForm.currentPassword}
                onChange={handlePasswordChange}
                required
              />
              <TextField
                fullWidth
                margin="normal"
                label="New Password"
                type="password"
                name="newPassword"
                value={passwordForm.newPassword}
                onChange={handlePasswordChange}
                required
                helperText="Password must be at least 6 characters long"
              />
              <TextField
                fullWidth
                margin="normal"
                label="Confirm New Password"
                type="password"
                name="confirmPassword"
                value={passwordForm.confirmPassword}
                onChange={handlePasswordChange}
                required
              />

              <Box mt={3} display="flex" justifyContent="flex-end">
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  disabled={isLoading}
                  startIcon={isLoading ? <CircularProgress size={20} /> : null}
                >
                  Update Password
                </Button>
              </Box>
            </Box>
          </Paper>
        );

      case "account":
        return (
          <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Account
            </Typography>
            <Divider sx={{ mb: 3 }} />

            <Box mb={4}>
              <Typography variant="subtitle1" gutterBottom>
                Account Information
              </Typography>
              <Typography variant="body2" color="textSecondary" paragraph>
                <strong>Email:</strong> {currentUser?.User_email || "N/A"}
              </Typography>
              <Typography variant="body2" color="textSecondary" paragraph>
                <strong>Account Created:</strong>{" "}
                {new Date(currentUser?.User_createdAt).toLocaleDateString()}
              </Typography>
            </Box>

            <Box>
              <Typography variant="subtitle1" gutterBottom>
                Danger Zone
              </Typography>
              <Typography variant="body2" color="textSecondary" paragraph>
                Once you delete your account, there is no going back. Please be
                certain.
              </Typography>

              <Button
                variant="contained"
                color="error"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={isLoading}
              >
                Delete My Account
              </Button>
            </Box>
          </Paper>
        );

      default:
        return null;
    }
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", p: isMobile ? 1 : 3 }}>
      <Box display="flex" alignItems="center" mb={3}>
        {isMobile && (
          <IconButton onClick={() => navigate(-1)} sx={{ mr: 1 }}>
            <FiArrowLeft />
          </IconButton>
        )}
        <Typography variant="h5" component="h1">
          Settings
        </Typography>
      </Box>

      <Box display="flex" flexDirection={isMobile ? "column" : "row"} gap={3}>
        {/* Sidebar */}
        <Paper
          elevation={3}
          sx={{
            width: isMobile ? "100%" : 250,
            flexShrink: 0,
            mb: isMobile ? 2 : 0,
            position: isMobile ? undefined : "sticky",
            top: 80,
            alignSelf: "flex-start",
          }}
        >
          <List>
            {[
              { id: "appearance", label: "Appearance", icon: <PaletteIcon /> },
              { id: "language", label: "Language", icon: <LanguageIcon /> },
              {
                id: "accessibility",
                label: "Accessibility",
                icon: <AccessibilityIcon />,
              },
              {
                id: "preferences",
                label: "Preferences",
                icon: <SettingsIcon />,
              },
              { id: "password", label: "Password", icon: <LockIcon /> },
              { id: "account", label: "Account", icon: <AccountCircleIcon /> },
            ].map((item) => (
              <ListItem key={item.id} disablePadding>
                <ListItemButton
                  selected={activeTab === item.id}
                  onClick={() => setActiveTab(item.id)}
                  sx={{
                    "&.Mui-selected": {
                      backgroundColor: "action.selected",
                      "&:hover": {
                        backgroundColor: "action.hover",
                      },
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      color: activeTab === item.id ? "primary.main" : "inherit",
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Paper>

        {/* Main Content */}
        <Box flexGrow={1}>{renderTabContent()}</Box>
      </Box>

      {/* Delete Account Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        aria-labelledby="delete-account-dialog-title"
      >
        <DialogTitle id="delete-account-dialog-title">
          Delete Your Account?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            This action cannot be undone. This will permanently delete your
            account and all associated data. Please enter your password to
            confirm you want to permanently delete your account.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Password"
            type="password"
            fullWidth
            variant="outlined"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteDialogOpen(false)}
            color="inherit"
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteAccount}
            color="error"
            variant="contained"
            disabled={isLoading || !deletePassword}
            startIcon={isLoading ? <CircularProgress size={20} /> : null}
          >
            Delete My Account
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Settings;

