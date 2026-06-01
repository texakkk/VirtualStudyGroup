import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Avatar,
  Box,
  Grid,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, CloudUpload as CloudUploadIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../../contexts/AuthContext'; // eslint-disable-line no-unused-vars
import api from '../../api';

const EditProfile = () => {
  // const { logout } = useAuth(); // Reserved for future account deletion feature
  const navigate = useNavigate();
  const theme = useTheme();
  
  const [formData, setFormData] = useState({
    User_name: '',
    User_email: '',
    User_bio: '',
    User_location: '',
    User_role: 'student' // Default role
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [previewImage, setPreviewImage] = useState('');
  const [selectedImageFile, setSelectedImageFile] = useState(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get('/auth/profile');
        const { User_name, User_email, User_bio, User_location, User_role, User_profilePicture } = res.data;
        
        setFormData({
          User_name,
          User_email,
          User_bio: User_bio || '',
          User_location: User_location || '',
          User_role: User_role || 'student'
        });

        if (User_profilePicture) {
          setPreviewImage(User_profilePicture);
        }

      } catch (err) {
        setError(err?.response?.data?.message || 'Error loading profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('User_name', formData.User_name);
      formDataToSend.append('User_email', formData.User_email);
      formDataToSend.append('User_bio', formData.User_bio);
      formDataToSend.append('User_location', formData.User_location);
      formDataToSend.append('User_role', formData.User_role);
      
      // Only append a newly selected file
      if (selectedImageFile) {
        formDataToSend.append('User_profilePicture', selectedImageFile);
      }

      await api.put('/auth/profile', formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      navigate('/dashboard/profile', { state: { message: 'Profile updated successfully!' } });
    } catch (err) {
      setError(err?.response?.data?.message || 'Error updating profile');
      console.error('Update error:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 2.5, bgcolor: '#f8fafc' }}>
      <Box mb={3} display="flex" alignItems="center">
        <IconButton onClick={() => navigate(-1)} sx={{ mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" component="h1">
          Edit Profile
        </Typography>
      </Box>

      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: 2,
          border: `1px solid ${theme.palette.divider}`,
          bgcolor: '#f8fafc'
        }}
      >
        <form onSubmit={handleSubmit}>
          <Grid container spacing={4}>
            {/* Profile Picture Upload */}
            <Grid size={{ xs: 12 }} sx={{ textAlign: 'center' }}>
              <Box sx={{ position: 'relative', display: 'inline-block' }}>
                <Avatar
                  src={previewImage || `https://ui-avatars.com/api/?name=${formData.User_name}&background=random`}
                  sx={{ 
                    width: 150, 
                    height: 150,
                    border: `3px solid ${theme.palette.grey[300]}`,
                    mb: 2
                  }}
                />
                <input
                  accept="image/*"
                  id="profile-picture-upload"
                  type="file"
                  style={{ display: 'none' }}
                  onChange={handleImageChange}
                />
                <label htmlFor="profile-picture-upload">
                  <Button
                    variant="outlined"
                    component="span"
                    startIcon={<CloudUploadIcon />}
                    sx={{ mt: 2 }}
                  >
                    Change Photo
                  </Button>
                </label>
              </Box>
            </Grid>

            {/* Personal Information */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h6" gutterBottom sx={{ mb: 3, borderBottom: `1px solid ${theme.palette.divider}`, pb: 1 }}>
                Personal Information
              </Typography>
              
              <TextField
                fullWidth
                label="Full Name"
                name="User_name"
                value={formData.User_name}
                onChange={handleChange}
                margin="normal"
                required
              />

              <TextField
                fullWidth
                label="Email"
                name="User_email"
                type="email"
                value={formData.User_email}
                onChange={handleChange}
                margin="normal"
                required
              />

              <FormControl fullWidth margin="normal">
                <InputLabel>Role</InputLabel>
                <Select
                  name="User_role"
                  value={formData.User_role}
                  label="Role"
                  onChange={handleChange}
                  required
                >
                  <MenuItem value="student">Student</MenuItem>
                  <MenuItem value="teacher">Teacher</MenuItem>
                  <MenuItem value="admin">Administrator</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Additional Information */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h6" gutterBottom sx={{ mb: 3, borderBottom: `1px solid ${theme.palette.divider}`, pb: 1 }}>
                Additional Information
              </Typography>

              <TextField
                fullWidth
                label="Location"
                name="User_location"
                value={formData.User_location}
                onChange={handleChange}
                margin="normal"
                placeholder="Enter your location"
              />

              <TextField
                fullWidth
                label="Bio"
                name="User_bio"
                value={formData.User_bio}
                onChange={handleChange}
                margin="normal"
                multiline
                rows={4}
                placeholder="Tell us about yourself..."
                helperText={`${formData.User_bio.length}/500 characters`}
                inputProps={{ maxLength: 500 }}
              />
            </Grid>

            {/* Error Message */}
            {error && (
              <Grid size={{ xs: 12 }}>
                <Box 
                  sx={{ 
                    p: 2, 
                    backgroundColor: '#ffebee', 
                    borderRadius: 1, 
                    border: '1px solid #f44336' 
                  }}
                >
                  <Typography color="error" align="center" variant="body2">
                    {error}
                  </Typography>
                </Box>
              </Grid>
            )}

            <Grid size={{ xs: 12 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 1.25,
                  pt: 1.5,
                  borderTop: `1px solid ${theme.palette.divider}`
                }}
              >
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={() => navigate('/dashboard/profile')}
                  disabled={saving}
                  sx={{ minWidth: 110, height: 40, fontSize: '0.9rem', fontWeight: 500 }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  disabled={saving}
                  startIcon={saving ? <CircularProgress size={18} color="inherit" /> : null}
                  sx={{ minWidth: 150, height: 40, fontSize: '0.9rem', fontWeight: 600 }}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </Paper>
    </Container>
  );
};

export default EditProfile;
