import React, { useState } from 'react';
import {
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Box,
  Typography,
  CircularProgress,
  Tooltip,
  IconButton,
  Menu,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { Language as LanguageIcon, Check as CheckIcon } from '@mui/icons-material';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTranslation } from 'react-i18next';

/**
 * LanguageSelector Component
 * Provides a dropdown or menu for selecting the application language
 * 
 * Props:
 * - variant: 'select' | 'menu' (default: 'select')
 * - showLabel: boolean (default: true)
 * - size: 'small' | 'medium' | 'large' (default: 'medium')
 * - fullWidth: boolean (default: false)
 */
const LanguageSelector = ({ 
  variant = 'select', 
  showLabel = true, 
  size = 'medium',
  fullWidth = false 
}) => {
  const { t } = useTranslation();
  const {
    currentLanguage,
    loading,
    changeLanguage,
    getAvailableLanguages,
    getLanguageInfo,
  } = useLanguage();

  const [anchorEl, setAnchorEl] = useState(null);
  const availableLanguages = getAvailableLanguages();

  const handleLanguageChange = async (languageCode) => {
    if (languageCode !== currentLanguage) {
      await changeLanguage(languageCode);
    }
    if (variant === 'menu') {
      setAnchorEl(null);
    }
  };

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  // Select variant
  if (variant === 'select') {
    return (
      <FormControl 
        fullWidth={fullWidth} 
        size={size}
        disabled={loading}
      >
        {showLabel && (
          <InputLabel id="language-selector-label">
            {t('settings.language')}
          </InputLabel>
        )}
        <Select
          labelId="language-selector-label"
          id="language-selector"
          value={currentLanguage}
          label={showLabel ? t('settings.language') : undefined}
          onChange={(e) => handleLanguageChange(e.target.value)}
          startAdornment={
            loading ? (
              <CircularProgress size={20} sx={{ mr: 1 }} />
            ) : (
              <LanguageIcon sx={{ mr: 1, color: 'action.active' }} />
            )
          }
        >
          {availableLanguages.map((lang) => (
            <MenuItem key={lang.code} value={lang.code}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography component="span" sx={{ fontSize: '1.2em' }}>
                  {lang.flag}
                </Typography>
                <Box>
                  <Typography variant="body1">
                    {lang.nativeName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {lang.name}
                  </Typography>
                </Box>
                {lang.code === currentLanguage && (
                  <CheckIcon sx={{ ml: 'auto', color: 'primary.main' }} />
                )}
              </Box>
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    );
  }

  // Menu variant (icon button with dropdown)
  return (
    <>
      <Tooltip title={t('settings.language')}>
        <IconButton
          onClick={handleMenuOpen}
          disabled={loading}
          size={size}
          aria-label={t('settings.language')}
          aria-controls="language-menu"
          aria-haspopup="true"
        >
          {loading ? (
            <CircularProgress size={24} />
          ) : (
            <LanguageIcon />
          )}
        </IconButton>
      </Tooltip>
      <Menu
        id="language-menu"
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          sx: {
            maxHeight: 400,
            width: 280,
          },
        }}
      >
        {availableLanguages.map((lang) => (
          <MenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            selected={lang.code === currentLanguage}
          >
            <ListItemIcon>
              <Typography component="span" sx={{ fontSize: '1.5em' }}>
                {lang.flag}
              </Typography>
            </ListItemIcon>
            <ListItemText
              primary={lang.nativeName}
              secondary={lang.name}
            />
            {lang.code === currentLanguage && (
              <CheckIcon sx={{ color: 'primary.main' }} />
            )}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default LanguageSelector;
