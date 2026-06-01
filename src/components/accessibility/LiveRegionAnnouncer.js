import React, { useEffect, useRef } from 'react';
import { useAccessibilityFeatures } from '../../hooks/useAccessibilityFeatures';

/**
 * LiveRegionAnnouncer Component
 * Provides ARIA live regions for dynamic content announcements
 */
const LiveRegionAnnouncer = () => {
  const politeRef = useRef(null);
  const assertiveRef = useRef(null);
  const { isScreenReaderEnabled } = useAccessibilityFeatures();

  useEffect(() => {
    // Create global announcement function
    window.announceToScreenReader = (message, priority = 'polite') => {
      if (!isScreenReaderEnabled) return;

      const region = priority === 'assertive' ? assertiveRef.current : politeRef.current;
      if (region) {
        // Clear and set new message
        region.textContent = '';
        setTimeout(() => {
          region.textContent = message;
        }, 100);
      }
    };

    return () => {
      delete window.announceToScreenReader;
    };
  }, [isScreenReaderEnabled]);

  return (
    <>
      {/* Polite announcements - don't interrupt current speech */}
      <div
        ref={politeRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
      
      {/* Assertive announcements - interrupt current speech */}
      <div
        ref={assertiveRef}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      />
    </>
  );
};

export default LiveRegionAnnouncer;
