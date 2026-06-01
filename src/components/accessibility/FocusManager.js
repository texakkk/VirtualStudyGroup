import React, { useEffect, useRef } from 'react';
import { focusFirstElement, createFocusManager } from '../../utils/accessibility';

/**
 * FocusManager Component
 * Manages focus for dynamic content and route changes
 */
const FocusManager = ({ children, autoFocus = false, restoreFocus = false }) => {
  const containerRef = useRef(null);
  const focusManager = useRef(createFocusManager());

  useEffect(() => {
    if (restoreFocus) {
      focusManager.current.saveFocus();
    }

    if (autoFocus && containerRef.current) {
      focusFirstElement(containerRef.current);
    }

    return () => {
      if (restoreFocus) {
        focusManager.current.restoreFocus();
      }
    };
  }, [autoFocus, restoreFocus]);

  return (
    <div ref={containerRef} className="focus-manager">
      {children}
    </div>
  );
};

export default FocusManager;
