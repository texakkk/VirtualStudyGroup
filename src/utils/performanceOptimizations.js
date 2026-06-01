/**
 * Performance Optimization Utilities
 * Collection of utilities for improving frontend performance
 */

/**
 * Debounce function - Delays execution until after wait time has elapsed
 * @param {Function} func - Function to debounce
 * @param {Number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export const debounce = (func, wait = 300) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Throttle function - Limits execution to once per wait period
 * @param {Function} func - Function to throttle
 * @param {Number} wait - Wait time in milliseconds
 * @returns {Function} Throttled function
 */
export const throttle = (func, wait = 300) => {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), wait);
    }
  };
};

/**
 * Lazy load images when they enter viewport
 * @param {String} selector - CSS selector for images to lazy load
 */
export const lazyLoadImages = (selector = 'img[data-src]') => {
  const images = document.querySelectorAll(selector);
  
  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.classList.add('loaded');
        observer.unobserve(img);
      }
    });
  });

  images.forEach((img) => imageObserver.observe(img));
};

/**
 * Preload critical resources
 * @param {Array} resources - Array of resource URLs to preload
 * @param {String} type - Resource type ('image', 'script', 'style')
 */
export const preloadResources = (resources, type = 'image') => {
  resources.forEach((resource) => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = type;
    link.href = resource;
    document.head.appendChild(link);
  });
};

/**
 * Chunk array into smaller arrays for batch processing
 * @param {Array} array - Array to chunk
 * @param {Number} size - Chunk size
 * @returns {Array} Array of chunks
 */
export const chunkArray = (array, size = 10) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

/**
 * Request idle callback wrapper with fallback
 * @param {Function} callback - Function to execute during idle time
 * @param {Object} options - Options for requestIdleCallback
 */
export const runWhenIdle = (callback, options = {}) => {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(callback, options);
  } else {
    setTimeout(callback, 1);
  }
};

/**
 * Measure component render performance
 * @param {String} componentName - Name of component to measure
 * @param {Function} callback - Function to execute and measure
 */
export const measurePerformance = (componentName, callback) => {
  const startMark = `${componentName}-start`;
  const endMark = `${componentName}-end`;
  const measureName = `${componentName}-render`;

  performance.mark(startMark);
  const result = callback();
  performance.mark(endMark);
  performance.measure(measureName, startMark, endMark);

  const measure = performance.getEntriesByName(measureName)[0];
  console.log(`${componentName} render time: ${measure.duration.toFixed(2)}ms`);

  // Clean up marks and measures
  performance.clearMarks(startMark);
  performance.clearMarks(endMark);
  performance.clearMeasures(measureName);

  return result;
};

/**
 * Create optimized image srcset for responsive images
 * @param {String} baseUrl - Base URL of image
 * @param {Array} sizes - Array of sizes [320, 640, 1024, 1920]
 * @returns {String} srcset string
 */
export const createImageSrcSet = (baseUrl, sizes = [320, 640, 1024, 1920]) => {
  return sizes
    .map((size) => `${baseUrl}?w=${size} ${size}w`)
    .join(', ');
};

/**
 * Detect if user prefers reduced motion
 * @returns {Boolean}
 */
export const prefersReducedMotion = () => {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Get network information for adaptive loading
 * @returns {Object} Network information
 */
export const getNetworkInfo = () => {
  if ('connection' in navigator) {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return {
      effectiveType: connection.effectiveType,
      downlink: connection.downlink,
      rtt: connection.rtt,
      saveData: connection.saveData,
    };
  }
  return null;
};

/**
 * Check if device is low-end based on hardware concurrency
 * @returns {Boolean}
 */
export const isLowEndDevice = () => {
  return navigator.hardwareConcurrency <= 4;
};

/**
 * Adaptive loading strategy based on network and device
 * @returns {Object} Loading strategy configuration
 */
export const getLoadingStrategy = () => {
  const networkInfo = getNetworkInfo();
  const isLowEnd = isLowEndDevice();

  let strategy = {
    imageQuality: 'high',
    enableAnimations: true,
    lazyLoadThreshold: '50px',
    chunkSize: 20,
  };

  // Adjust for slow network
  if (networkInfo && (networkInfo.effectiveType === 'slow-2g' || networkInfo.effectiveType === '2g')) {
    strategy.imageQuality = 'low';
    strategy.enableAnimations = false;
    strategy.lazyLoadThreshold = '200px';
    strategy.chunkSize = 10;
  } else if (networkInfo && networkInfo.effectiveType === '3g') {
    strategy.imageQuality = 'medium';
    strategy.lazyLoadThreshold = '100px';
    strategy.chunkSize = 15;
  }

  // Adjust for low-end device
  if (isLowEnd) {
    strategy.enableAnimations = false;
    strategy.chunkSize = Math.min(strategy.chunkSize, 10);
  }

  // Respect data saver mode
  if (networkInfo && networkInfo.saveData) {
    strategy.imageQuality = 'low';
    strategy.enableAnimations = false;
  }

  return strategy;
};

export default {
  debounce,
  throttle,
  lazyLoadImages,
  preloadResources,
  chunkArray,
  runWhenIdle,
  measurePerformance,
  createImageSrcSet,
  prefersReducedMotion,
  getNetworkInfo,
  isLowEndDevice,
  getLoadingStrategy,
};
