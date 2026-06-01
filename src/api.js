import axios from 'axios';

// Helper function to recursively convert ObjectIds to strings
const convertObjectIdsToStrings = (obj) => {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => convertObjectIdsToStrings(item));
  }
  
  // Handle objects
  if (typeof obj === 'object') {
    // Check if this looks like a MongoDB ObjectId
    if (obj.$oid) {
      return obj.$oid;
    }
    
    // Check if it has a toString method and looks like an ObjectId
    // MongoDB ObjectIds have specific properties when serialized
    const keys = Object.keys(obj);
    
    // If object has toString and looks like it might be an ObjectId
    if (typeof obj.toString === 'function' && keys.length > 0) {
      const stringValue = obj.toString();
      // Check if toString returns a 24-character hex string (MongoDB ObjectId format)
      if (/^[0-9a-fA-F]{24}$/.test(stringValue)) {
        return stringValue;
      }
    }
    
    // Check if it has typical ObjectId properties but no other data
    if (keys.length > 0 && keys.length < 5 && 
        (keys.includes('id') || keys.includes('str') || keys.includes('_bsontype'))) {
      // Try to extract string representation
      if (obj.id && typeof obj.id === 'string') return obj.id;
      if (obj.str && typeof obj.str === 'string') return obj.str;
      if (obj._bsontype === 'ObjectID' && obj.id) {
        // Convert Buffer to hex string if needed
        if (obj.id.type === 'Buffer' && Array.isArray(obj.id.data)) {
          return obj.id.data.map(b => b.toString(16).padStart(2, '0')).join('');
        }
      }
    }
    
    // Recursively process object properties
    const result = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[key] = convertObjectIdsToStrings(obj[key]);
      }
    }
    return result;
  }
  
  // Return primitives as-is
  return obj;
};

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5001/api',
  timeout: 60000, // 60 second timeout for requests
  headers: { 
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Allow cookies/authentication
  // Retry configuration
  validateStatus: (status) => status < 500, // Don't throw on 4xx errors
  // Transform response to convert ObjectIds to strings
  transformResponse: [
    ...axios.defaults.transformResponse,
    (data) => {
      if (data && typeof data === 'object') {
        return convertObjectIdsToStrings(data);
      }
      return data;
    }
  ],
});

// Flag to prevent multiple refresh attempts
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request interceptor to add token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Response interceptor to handle token expiration
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If error is 401 and we haven't tried to refresh yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // If already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(token => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch(err => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refreshToken');

      if (!refreshToken) {
        // No refresh token, logout user
        isRefreshing = false;
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/signin';
        return Promise.reject(error);
      }

      try {
        // Attempt to refresh the token
        const response = await axios.post(
          `${process.env.REACT_APP_API_URL || 'http://localhost:5001/api'}/auth/refresh`,
          { refreshToken }
        );

        const { token: newToken } = response.data;
        
        // Update token in localStorage
        localStorage.setItem('token', newToken);
        
        // Update authorization header
        api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        
        // Process queued requests
        processQueue(null, newToken);
        isRefreshing = false;

        // Retry original request
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed, logout user
        processQueue(refreshError, null);
        isRefreshing = false;
        
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        
        // Redirect to login
        window.location.href = '/signin';
        
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
