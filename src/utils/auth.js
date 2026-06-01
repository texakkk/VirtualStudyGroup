import api from './api';

export const verifyToken = async (token) => {
  try {
    const response = await api.get('/auth/verify-token', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data.valid;
  } catch (error) {
    console.error('Token verification failed:', error);
    return false;
  }
};

export const getStoredAuth = () => {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  
  if (!token || !user) return null;
  
  try {
    return {
      token,
      user: JSON.parse(user)
    };
  } catch (e) {
    console.error('Error parsing stored user data:', e);
    return null;
  }
};
