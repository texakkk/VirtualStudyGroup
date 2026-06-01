import { useEffect, useCallback, useRef, useState } from 'react';
import { 
  handleListKeyNavigation, 
  handleGridKeyNavigation,
  announceToScreenReader 
} from '../utils/accessibility';

/**
 * Hook for keyboard navigation in lists
 */
export const useListKeyboardNavigation = (items, onSelect, options = {}) => {
  const [currentIndex, setCurrentIndex] = useState(options.initialIndex || 0);
  const { announceChanges = true } = options;

  const handleKeyDown = useCallback((event) => {
    const newIndex = handleListKeyNavigation(event, items, currentIndex, onSelect);
    
    if (newIndex !== currentIndex) {
      if (newIndex === -1) {
        setCurrentIndex(0);
      } else {
        setCurrentIndex(newIndex);
        
        if (announceChanges && items[newIndex]) {
          const itemLabel = items[newIndex].label || items[newIndex].name || `Item ${newIndex + 1}`;
          announceToScreenReader(`${itemLabel}, ${newIndex + 1} of ${items.length}`);
        }
      }
    }
  }, [items, currentIndex, onSelect, announceChanges]);

  return {
    currentIndex,
    setCurrentIndex,
    handleKeyDown,
    ariaProps: {
      role: 'listbox',
      'aria-activedescendant': `item-${currentIndex}`,
      tabIndex: 0
    }
  };
};

/**
 * Hook for keyboard navigation in grids/tables
 */
export const useGridKeyboardNavigation = (rows, cols, onSelect, options = {}) => {
  const [currentPosition, setCurrentPosition] = useState({
    row: options.initialRow || 0,
    col: options.initialCol || 0
  });
  const { announceChanges = true } = options;

  const handleKeyDown = useCallback((event) => {
    const newPosition = handleGridKeyNavigation(
      event, 
      rows, 
      cols, 
      currentPosition.row, 
      currentPosition.col, 
      onSelect
    );
    
    if (newPosition.row !== currentPosition.row || newPosition.col !== currentPosition.col) {
      setCurrentPosition(newPosition);
      
      if (announceChanges) {
        announceToScreenReader(
          `Row ${newPosition.row + 1}, Column ${newPosition.col + 1}`
        );
      }
    }
  }, [rows, cols, currentPosition, onSelect, announceChanges]);

  return {
    currentPosition,
    setCurrentPosition,
    handleKeyDown,
    ariaProps: {
      role: 'grid',
      'aria-rowcount': rows,
      'aria-colcount': cols,
      tabIndex: 0
    }
  };
};

/**
 * Hook for managing focus trap (for modals, dialogs)
 */
export const useFocusTrap = (isActive = true) => {
  const containerRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    previousFocusRef.current = document.activeElement;

    const getFocusableElements = () => {
      const focusableSelectors = [
        'a[href]',
        'button:not([disabled])',
        'textarea:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
      ].join(',');
      
      return Array.from(containerRef.current.querySelectorAll(focusableSelectors))
        .filter(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        });
    };

    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    const handleKeyDown = (event) => {
      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      
      if (previousFocusRef.current && previousFocusRef.current.focus) {
        previousFocusRef.current.focus();
      }
    };
  }, [isActive]);

  return containerRef;
};

/**
 * Hook for keyboard shortcuts
 */
export const useKeyboardShortcuts = (shortcuts, options = {}) => {
  const { enabled = true, preventDefault = true } = options;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event) => {
      const key = event.key.toLowerCase();
      const ctrl = event.ctrlKey || event.metaKey;
      const shift = event.shiftKey;
      const alt = event.altKey;

      let shortcutString = '';
      if (ctrl) shortcutString += 'ctrl+';
      if (shift) shortcutString += 'shift+';
      if (alt) shortcutString += 'alt+';
      shortcutString += key;

      const handler = shortcuts[shortcutString];
      if (handler) {
        if (preventDefault) {
          event.preventDefault();
        }
        handler(event);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts, enabled, preventDefault]);
};

/**
 * Hook for escape key handler
 */
export const useEscapeKey = (callback, enabled = true) => {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        callback(event);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [callback, enabled]);
};

const keyboardNavigationHooks = {
  useListKeyboardNavigation,
  useGridKeyboardNavigation,
  useFocusTrap,
  useKeyboardShortcuts,
  useEscapeKey
};

export default keyboardNavigationHooks;
