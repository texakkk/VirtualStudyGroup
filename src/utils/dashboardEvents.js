export const DASHBOARD_DATA_CHANGED_EVENT = 'dashboard-data-changed';

const DASHBOARD_MUTATION_PATHS = [
  '/group',
  '/group-events',
  '/task',
  '/message',
  '/notes',
  '/videosession',
  '/media-sessions',
  '/video-annotations',
  '/files',
];

const getPathname = (url = '', baseURL) => {
  try {
    const fallbackBaseURL = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
    return new URL(url, baseURL || fallbackBaseURL).pathname;
  } catch (error) {
    return String(url).split('?')[0];
  }
};

export const isDashboardMutation = (config = {}) => {
  const method = String(config.method || 'get').toLowerCase();

  if (!['post', 'put', 'patch', 'delete'].includes(method)) {
    return false;
  }

  const pathname = getPathname(config.url, config.baseURL);
  return DASHBOARD_MUTATION_PATHS.some((path) => (
    pathname === path || pathname.startsWith(`${path}/`)
  ));
};

export const notifyDashboardDataChanged = (detail = {}) => {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new CustomEvent(DASHBOARD_DATA_CHANGED_EVENT, { detail }));
};
