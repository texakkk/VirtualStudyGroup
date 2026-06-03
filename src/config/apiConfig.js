const DEFAULT_BACKEND_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://virtualstudygroup.onrender.com'
    : 'http://localhost:5001';

const stripTrailingSlash = (value) => value.replace(/\/+$/, '');

export const getBackendUrl = () =>
  stripTrailingSlash(process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_BACKEND_URL || DEFAULT_BACKEND_URL);

export const getApiBaseUrl = () =>
  stripTrailingSlash(process.env.REACT_APP_API_URL || `${getBackendUrl()}/api`);

export const getSocketBaseUrl = () =>
  stripTrailingSlash(process.env.REACT_APP_SOCKET_URL || getBackendUrl());
