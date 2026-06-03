const isLocalhost = () => {
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  return host === 'localhost' || host === '127.0.0.1';
};

const DEFAULT_BACKEND_URL =
  isLocalhost()
    ? 'http://localhost:5001'
    : 'https://virtualstudygroup.onrender.com';

const stripTrailingSlash = (value) => value.replace(/\/+$/, '');

export const getBackendUrl = () =>
  stripTrailingSlash(process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_BACKEND_URL || DEFAULT_BACKEND_URL);

export const getApiBaseUrl = () =>
  stripTrailingSlash(process.env.REACT_APP_API_URL || `${getBackendUrl()}/api`);

export const getSocketBaseUrl = () =>
  stripTrailingSlash(process.env.REACT_APP_SOCKET_URL || getBackendUrl());
