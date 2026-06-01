import { useEffect } from 'react';
import { useAccessibilityFeatures } from '../../hooks/useAccessibilityFeatures';

/**
 * AccessibilityEnhancer Component
 * Wraps the application to provide global accessibility enhancements
 */
const AccessibilityEnhancer = ({ children }) => {
  const { 
    isScreenReaderEnabled, 
    isKeyboardNavigationEnabled,
    announce 
  } = useAccessibilityFeatures();

  useEffect(() => {
    // Announce page changes to screen readers
    const handleRouteChange = () => {
      const pageTitle = document.title;
      if (isScreenReaderEnabled) {
        announce(`Navigated to ${pageTitle}`, 'polite');
      }
    };

    // Listen for route changes
    window.addEventListener('popstate', handleRouteChange);
    
    // Announce initial page load
    if (isScreenReaderEnabled) {
      announce(`Page loaded: ${document.title}`, 'polite');
    }

    return () => {
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, [isScreenReaderEnabled, announce]);

  useEffect(() => {
    // Add keyboard navigation class to body
    if (isKeyboardNavigationEnabled) {
      document.body.classList.add('keyboard-navigation-active');
    } else {
      document.body.classList.remove('keyboard-navigation-active');
    }
  }, [isKeyboardNavigationEnabled]);

  return <>{children}</>;
};

export default AccessibilityEnhancer;
