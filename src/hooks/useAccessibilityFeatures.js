import { useEffect, useState, useCallback } from 'react';
import { useAccessibility } from './useSettings';
import { 
  announceToScreenReader, 
  prefersReducedMotion, 
  prefersHighContrast 
} from '../utils/accessibility';

export const useAccessibilityFeatures = () => {
  const { accessibility, updateAccessibility } = useAccessibility();
  const [systemPreferences, setSystemPreferences] = useState({
    reducedMotion: prefersReducedMotion(),
    highContrast: prefersHighContrast()
  });

  useEffect(() => {
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const highContrastQuery = window.matchMedia('(prefers-contrast: high)');

    const handleReducedMotionChange = (e) => {
      setSystemPreferences(prev => ({ ...prev, reducedMotion: e.matches }));
    };

    const handleHighContrastChange = (e) => {
      setSystemPreferences(prev => ({ ...prev, highContrast: e.matches }));
    };

    reducedMotionQuery.addEventListener('change', handleReducedMotionChange);
    highContrastQuery.addEventListener('change', handleHighContrastChange);

    return () => {
      reducedMotionQuery.removeEventListener('change', handleReducedMotionChange);
      highContrastQuery.removeEventListener('change', handleHighContrastChange);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    if (accessibility?.screenReader) {
      root.setAttribute('data-screen-reader', 'true');
    } else {
      root.removeAttribute('data-screen-reader');
    }

    if (accessibility?.keyboardNavigation) {
      root.setAttribute('data-keyboard-nav', 'true');
      root.classList.add('keyboard-navigation-enabled');
    } else {
      root.removeAttribute('data-keyboard-nav');
      root.classList.remove('keyboard-navigation-enabled');
    }

    const shouldReduceMotion = accessibility?.reducedMotion || systemPreferences.reducedMotion;
    if (shouldReduceMotion) {
      root.setAttribute('data-reduced-motion', 'true');
      root.classList.add('reduced-motion');
    } else {
      root.removeAttribute('data-reduced-motion');
      root.classList.remove('reduced-motion');
    }

    const shouldUseHighContrast = accessibility?.highContrast || systemPreferences.highContrast;
    if (shouldUseHighContrast) {
      root.setAttribute('data-high-contrast', 'true');
      root.classList.add('high-contrast');
    } else {
      root.removeAttribute('data-high-contrast');
      root.classList.remove('high-contrast');
    }

    if (accessibility?.focusIndicators !== false) {
      root.classList.add('enhanced-focus');
    } else {
      root.classList.remove('enhanced-focus');
    }
  }, [accessibility, systemPreferences]);

  const announce = useCallback((message, priority = 'polite') => {
    if (accessibility?.screenReader) {
      announceToScreenReader(message, priority);
    }
  }, [accessibility]);

  const toggleScreenReader = useCallback(() => {
    updateAccessibility({
      ...accessibility,
      screenReader: !accessibility?.screenReader
    });
  }, [accessibility, updateAccessibility]);

  const toggleKeyboardNavigation = useCallback(() => {
    updateAccessibility({
      ...accessibility,
      keyboardNavigation: !accessibility?.keyboardNavigation
    });
  }, [accessibility, updateAccessibility]);

  const toggleReducedMotion = useCallback(() => {
    updateAccessibility({
      ...accessibility,
      reducedMotion: !accessibility?.reducedMotion
    });
  }, [accessibility, updateAccessibility]);

  const toggleHighContrast = useCallback(() => {
    updateAccessibility({
      ...accessibility,
      highContrast: !accessibility?.highContrast
    });
  }, [accessibility, updateAccessibility]);

  return {
    accessibility: accessibility || {},
    systemPreferences,
    announce,
    toggleScreenReader,
    toggleKeyboardNavigation,
    toggleReducedMotion,
    toggleHighContrast,
    isScreenReaderEnabled: accessibility?.screenReader || false,
    isKeyboardNavigationEnabled: accessibility?.keyboardNavigation || false,
    isReducedMotionEnabled: accessibility?.reducedMotion || systemPreferences.reducedMotion,
    isHighContrastEnabled: accessibility?.highContrast || systemPreferences.highContrast
  };
};

export default useAccessibilityFeatures;
