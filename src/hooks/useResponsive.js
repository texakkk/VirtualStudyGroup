/**
 * useResponsive Hook
 * Task 19.1: Mobile-responsive utilities for React components
 * 
 * Provides responsive breakpoint detection, device type detection,
 * and touch interaction utilities
 */

import { useState, useEffect, useCallback } from 'react';

// Breakpoint definitions
const BREAKPOINTS = {
  xs: 320,
  sm: 576,
  md: 768,
  lg: 1024,
  xl: 1280,
  xxl: 1536,
};

/**
 * Main responsive hook
 * @returns {Object} Responsive utilities and state
 */
export const useResponsive = () => {
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  const [orientation, setOrientation] = useState(
    typeof window !== 'undefined' && window.innerWidth > window.innerHeight
      ? 'landscape'
      : 'portrait'
  );

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      setWindowSize({ width, height });
      setOrientation(width > height ? 'landscape' : 'portrait');
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial call

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Breakpoint checks
  const isMobile = windowSize.width < BREAKPOINTS.md;
  const isTablet = windowSize.width >= BREAKPOINTS.md && windowSize.width < BREAKPOINTS.lg;
  const isDesktop = windowSize.width >= BREAKPOINTS.lg;
  const isSmallMobile = windowSize.width < BREAKPOINTS.sm;
  const isLargeMobile = windowSize.width >= BREAKPOINTS.sm && windowSize.width < BREAKPOINTS.md;

  // Specific breakpoint checks
  const isXs = windowSize.width < BREAKPOINTS.sm;
  const isSm = windowSize.width >= BREAKPOINTS.sm && windowSize.width < BREAKPOINTS.md;
  const isMd = windowSize.width >= BREAKPOINTS.md && windowSize.width < BREAKPOINTS.lg;
  const isLg = windowSize.width >= BREAKPOINTS.lg && windowSize.width < BREAKPOINTS.xl;
  const isXl = windowSize.width >= BREAKPOINTS.xl && windowSize.width < BREAKPOINTS.xxl;
  const isXxl = windowSize.width >= BREAKPOINTS.xxl;

  // Min-width checks (mobile-first)
  const isSmUp = windowSize.width >= BREAKPOINTS.sm;
  const isMdUp = windowSize.width >= BREAKPOINTS.md;
  const isLgUp = windowSize.width >= BREAKPOINTS.lg;
  const isXlUp = windowSize.width >= BREAKPOINTS.xl;

  // Max-width checks
  const isSmDown = windowSize.width < BREAKPOINTS.md;
  const isMdDown = windowSize.width < BREAKPOINTS.lg;
  const isLgDown = windowSize.width < BREAKPOINTS.xl;

  return {
    // Window dimensions
    width: windowSize.width,
    height: windowSize.height,
    orientation,
    
    // Device type
    isMobile,
    isTablet,
    isDesktop,
    isSmallMobile,
    isLargeMobile,
    
    // Specific breakpoints
    isXs,
    isSm,
    isMd,
    isLg,
    isXl,
    isXxl,
    
    // Min-width (mobile-first)
    isSmUp,
    isMdUp,
    isLgUp,
    isXlUp,
    
    // Max-width
    isSmDown,
    isMdDown,
    isLgDown,
    
    // Orientation
    isLandscape: orientation === 'landscape',
    isPortrait: orientation === 'portrait',
  };
};

/**
 * Hook for detecting touch device
 * @returns {boolean} Whether device supports touch
 */
export const useTouchDevice = () => {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    const checkTouch = () => {
      setIsTouch(
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        navigator.msMaxTouchPoints > 0
      );
    };

    checkTouch();
  }, []);

  return isTouch;
};

/**
 * Hook for swipe gesture detection
 * @param {Object} options - Swipe configuration
 * @returns {Object} Swipe handlers
 */
export const useSwipe = (options = {}) => {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    threshold = 50,
  } = options;

  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  const minSwipeDistance = threshold;

  const onTouchStart = useCallback((e) => {
    setTouchEnd(null);
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    });
  }, []);

  const onTouchMove = useCallback((e) => {
    setTouchEnd({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    });
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!touchStart || !touchEnd) return;

    const distanceX = touchStart.x - touchEnd.x;
    const distanceY = touchStart.y - touchEnd.y;
    const isHorizontalSwipe = Math.abs(distanceX) > Math.abs(distanceY);

    if (isHorizontalSwipe) {
      if (distanceX > minSwipeDistance) {
        onSwipeLeft?.();
      } else if (distanceX < -minSwipeDistance) {
        onSwipeRight?.();
      }
    } else {
      if (distanceY > minSwipeDistance) {
        onSwipeUp?.();
      } else if (distanceY < -minSwipeDistance) {
        onSwipeDown?.();
      }
    }
  }, [touchStart, touchEnd, minSwipeDistance, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
};

/**
 * Hook for viewport visibility detection
 * @param {React.RefObject} ref - Element reference
 * @param {Object} options - Intersection observer options
 * @returns {boolean} Whether element is visible
 */
export const useInViewport = (ref, options = {}) => {
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setIsIntersecting(entry.isIntersecting),
      {
        threshold: 0.1,
        ...options,
      }
    );

    const currentRef = ref.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [ref, options]);

  return isIntersecting;
};

/**
 * Hook for keyboard visibility on mobile
 * @returns {boolean} Whether keyboard is visible
 */
export const useKeyboardVisible = () => {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      // On mobile, when keyboard opens, viewport height decreases
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const windowHeight = window.innerHeight;
      
      setIsKeyboardVisible(viewportHeight < windowHeight * 0.75);
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      return () => window.visualViewport.removeEventListener('resize', handleResize);
    }
  }, []);

  return isKeyboardVisible;
};

/**
 * Hook for safe area insets (notched devices)
 * @returns {Object} Safe area inset values
 */
export const useSafeAreaInsets = () => {
  const [insets, setInsets] = useState({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });

  useEffect(() => {
    const getInset = (side) => {
      const value = getComputedStyle(document.documentElement)
        .getPropertyValue(`env(safe-area-inset-${side})`);
      return parseInt(value) || 0;
    };

    setInsets({
      top: getInset('top'),
      right: getInset('right'),
      bottom: getInset('bottom'),
      left: getInset('left'),
    });
  }, []);

  return insets;
};

/**
 * Hook for responsive columns calculation
 * @param {Object} breakpoints - Column counts per breakpoint
 * @returns {number} Current column count
 */
export const useResponsiveColumns = (breakpoints = {}) => {
  const { isMobile, isTablet, isDesktop } = useResponsive();
  
  const defaultBreakpoints = {
    mobile: 1,
    tablet: 2,
    desktop: 3,
    ...breakpoints,
  };

  if (isMobile) return defaultBreakpoints.mobile;
  if (isTablet) return defaultBreakpoints.tablet;
  if (isDesktop) return defaultBreakpoints.desktop;
  
  return defaultBreakpoints.mobile;
};

/**
 * Hook for responsive font size
 * @param {Object} sizes - Font sizes per breakpoint
 * @returns {string} Current font size
 */
export const useResponsiveFontSize = (sizes = {}) => {
  const { isMobile, isTablet, isDesktop } = useResponsive();
  
  const defaultSizes = {
    mobile: '14px',
    tablet: '16px',
    desktop: '18px',
    ...sizes,
  };

  if (isMobile) return defaultSizes.mobile;
  if (isTablet) return defaultSizes.tablet;
  if (isDesktop) return defaultSizes.desktop;
  
  return defaultSizes.mobile;
};

/**
 * Hook for detecting network connection quality
 * @returns {Object} Network information
 */
export const useNetworkQuality = () => {
  const [networkInfo, setNetworkInfo] = useState({
    effectiveType: '4g',
    downlink: 10,
    rtt: 50,
    saveData: false,
  });

  useEffect(() => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    
    if (connection) {
      const updateNetworkInfo = () => {
        setNetworkInfo({
          effectiveType: connection.effectiveType || '4g',
          downlink: connection.downlink || 10,
          rtt: connection.rtt || 50,
          saveData: connection.saveData || false,
        });
      };

      updateNetworkInfo();
      connection.addEventListener('change', updateNetworkInfo);
      
      return () => connection.removeEventListener('change', updateNetworkInfo);
    }
  }, []);

  return {
    ...networkInfo,
    isSlowConnection: networkInfo.effectiveType === 'slow-2g' || networkInfo.effectiveType === '2g',
    isFastConnection: networkInfo.effectiveType === '4g',
  };
};

export default useResponsive;
