import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Box, 
  Typography, 
  Button, 
  Avatar, 
  Paper, 
  Divider, 
  CircularProgress,
  Container,
  Grid,
  Card,
  CardContent,
  CardHeader
} from '@mui/material';
import { Edit as EditIcon, Logout as LogoutIcon } from '@mui/icons-material';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '@mui/material/styles';

const Profile = () => {
  const { logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const theme = useTheme();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get('/auth/profile');
        setProfile(res.data);
      } catch (err) {
        setError(err?.response?.data?.message || 'Error fetching profile data');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/signin');
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (!profile) return null;

  // Default avatar if no profile picture is set
  const defaultAvatar = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';

  return (
    <Container maxWidth="md" sx={{ py: 2.5, bgcolor: '#f6f8fb' }}>
      <Paper
        elevation={0}
        sx={{
          borderRadius: 2,
          border: `1px solid ${theme.palette.divider}`,
          bgcolor: '#f6f8fb'
        }}
      >
        <Box sx={{ pt: 3, textAlign: 'center' }}>
          <Avatar
            src={profile.User_profilePicture || defaultAvatar}
            alt={profile.User_name}
            sx={{ 
              width: 112, 
              height: 112,
              margin: '0 auto',
              border: `3px solid ${theme.palette.grey[300]}`,
              boxShadow: 'none'
            }}
          />
        </Box>

        {/* Profile Content */}
        <Box sx={{ p: 3, mt: 1, textAlign: 'center' }}>
          <Typography variant="h4" component="h1" gutterBottom>
            {profile.User_name}
          </Typography>
          <Typography 
            variant="subtitle1" 
            color="textSecondary" 
            gutterBottom
            sx={{ mb: 3 }}
          >
            {profile.User_email}
          </Typography>

          <Grid container spacing={4} sx={{ mt: 2, textAlign: 'left' }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined" sx={{ bgcolor: '#f6f8fb', borderColor: theme.palette.divider }}>
                <CardHeader 
                  title="Personal Information"
                  titleTypographyProps={{ variant: 'h6' }}
                  sx={{ bgcolor: '#f6f8fb' }}
                />
                <Divider />
                <CardContent sx={{ bgcolor: '#f6f8fb' }}>
                  <Box mb={2}>
                    <Typography variant="subtitle2" color="textSecondary">Role</Typography>
                    <Typography variant="body1">
                      {profile.User_role || 'Not specified'}
                    </Typography>
                  </Box>
                  <Box mb={2}>
                    <Typography variant="subtitle2" color="textSecondary">Location</Typography>
                    <Typography variant="body1">
                      {profile.User_location || 'Not specified'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="subtitle2" color="textSecondary">Member Since</Typography>
                    <Typography variant="body1">
                      {new Date(profile.User_createdAt).toLocaleDateString()}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined" sx={{ height: '100%', bgcolor: '#f6f8fb', borderColor: theme.palette.divider }}>
                <CardHeader 
                  title="About"
                  titleTypographyProps={{ variant: 'h6' }}
                  sx={{ bgcolor: '#f6f8fb' }}
                />
                <Divider />
                <CardContent sx={{ bgcolor: '#f6f8fb' }}>
                  <Typography variant="body1" sx={{ minHeight: 120 }}>
                    {profile.User_bio || 'No bio available. Add a bio to tell others more about yourself.'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Box mt={4} display="flex" justifyContent="center" gap={2}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<EditIcon />}
              onClick={() => navigate('/dashboard/profile/edit')}
              size="large"
            >
              Edit Profile
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<LogoutIcon />}
              onClick={handleLogout}
              size="large"
            >
              Logout
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};

export default Profile;
