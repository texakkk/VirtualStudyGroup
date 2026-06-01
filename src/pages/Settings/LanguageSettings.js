import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Divider,
  Grid,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
} from '@mui/material';
import {
  Language as LanguageIcon,
  Check as CheckIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import LanguageSelector from '../../components/common/LanguageSelector';
import { useTranslation } from '../../hooks/useTranslation';
import { useLanguage } from '../../contexts/LanguageContext';

/**
 * Language Settings Page
 * Allows users to select their preferred language and view language information
 */
const LanguageSettings = () => {
  const { t } = useTranslation();
  const {
    currentLanguage,
    isRTL,
    getLanguageInfo,
    getAvailableLanguages,
  } = useLanguage();

  const currentLangInfo = getLanguageInfo(currentLanguage);
  const availableLanguages = getAvailableLanguages();

  return (
    <Box sx={{ p: 3 }}>
      {/* Page Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          <LanguageIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          {t('settings.language')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Choose your preferred language for the interface
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Language Selector */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {t('settings.selectLanguage')}
            </Typography>
            <Divider sx={{ my: 2 }} />
            <LanguageSelector 
              variant="select" 
              showLabel={true} 
              fullWidth 
              size="medium"
            />
          </Paper>
        </Grid>

        {/* Current Language Info */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Current Language
            </Typography>
            <Divider sx={{ my: 2 }} />
            <List>
              <ListItem>
                <ListItemIcon>
                  <Typography variant="h4">{currentLangInfo.flag}</Typography>
                </ListItemIcon>
                <ListItemText
                  primary={currentLangInfo.nativeName}
                  secondary={currentLangInfo.name}
                />
                {isRTL && (
                  <Chip 
                    label="RTL" 
                    size="small" 
                    color="primary" 
                    variant="outlined"
                  />
                )}
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Language Code"
                  secondary={currentLanguage.toUpperCase()}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Text Direction"
                  secondary={isRTL ? 'Right-to-Left (RTL)' : 'Left-to-Right (LTR)'}
                />
              </ListItem>
            </List>
          </Paper>
        </Grid>

        {/* Available Languages */}
        <Grid size={{ xs: 12 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Available Languages ({availableLanguages.length})
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Grid container spacing={2}>
              {availableLanguages.map((lang) => (
                <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={lang.code}>
                  <Card 
                    variant="outlined"
                    sx={{
                      borderColor: lang.code === currentLanguage ? 'primary.main' : 'divider',
                      borderWidth: lang.code === currentLanguage ? 2 : 1,
                    }}
                  >
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <Typography variant="h4" sx={{ mr: 1 }}>
                          {lang.flag}
                        </Typography>
                        {lang.code === currentLanguage && (
                          <CheckIcon color="primary" />
                        )}
                      </Box>
                      <Typography variant="subtitle1" fontWeight="bold">
                        {lang.nativeName}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {lang.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {lang.code.toUpperCase()}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>

        {/* Information */}
        <Grid size={{ xs: 12 }}>
          <Card sx={{ bgcolor: 'info.light', color: 'info.contrastText' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                <InfoIcon sx={{ mr: 2, mt: 0.5 }} />
                <Box>
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    About Language Settings
                  </Typography>
                  <Typography variant="body2">
                    • Your language preference is saved automatically and synced across all your devices
                  </Typography>
                  <Typography variant="body2">
                    • Some languages support right-to-left (RTL) text direction
                  </Typography>
                  <Typography variant="body2">
                    • Dates, numbers, and currencies are formatted according to your language
                  </Typography>
                  <Typography variant="body2">
                    • You can change your language at any time from the settings menu
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default LanguageSettings;
