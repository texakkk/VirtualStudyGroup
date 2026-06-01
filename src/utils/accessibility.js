/**
 * Accessibility Utilities
 * Provides helper functions for implementing accessibility features
 */

/**
 * Generate unique ID for ARIA attributes
 */
export const generateAriaId = (prefix = 'aria') => {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Announce message to screen readers
 * @param {string} message - Message to announce
 * @param {string} priority - 'polite' or 'assertive'
 */
export const announceToScreenReader = (message, priority = 'polite') => {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;
  
  document.body.appendChild(announcement);
  
  // Remove after announcement
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
};

/**
 * Check if element is focusable
 */
export const isFocusable = (element) => {
  if (!element) return false;
  
  const focusableSelectors = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ];
  
  return focusableSelectors.some(selector => element.matches(selector));
};

/**
 * Get all focusable elements within a container
 */
export const getFocusableElements = (container) => {
  if (!container) return [];
  
  const focusableSelectors = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ].join(',');
  
  return Array.from(container.querySelectorAll(focusableSelectors))
    .filter(el => {
      // Check if element is visible
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && 
             style.visibility !== 'hidden' && 
             el.offsetParent !== null;
    });
};

/**
 * Trap focus within a container (for modals, dialogs)
 */
export const trapFocus = (container, event) => {
  const focusableElements = getFocusableElements(container);
  
  if (focusableElements.length === 0) return;
  
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  
  // Tab key
  if (event.key === 'Tab') {
    if (event.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }
};

/**
 * Set focus to first focusable element in container
 */
export const focusFirstElement = (container) => {
  const focusableElements = getFocusableElements(container);
  if (focusableElements.length > 0) {
    focusableElements[0].focus();
  }
};

/**
 * Restore focus to previously focused element
 */
export const createFocusManager = () => {
  let previousFocus = null;
  
  return {
    saveFocus: () => {
      previousFocus = document.activeElement;
    },
    restoreFocus: () => {
      if (previousFocus && previousFocus.focus) {
        previousFocus.focus();
      }
    }
  };
};

/**
 * Generate ARIA label for interactive elements
 */
export const generateAriaLabel = (type, context = {}) => {
  const labels = {
    button: {
      close: 'Close',
      menu: 'Open menu',
      submit: 'Submit form',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      save: 'Save',
      search: 'Search',
      filter: 'Filter',
      sort: 'Sort',
      expand: 'Expand',
      collapse: 'Collapse'
    },
    link: {
      home: 'Go to home page',
      back: 'Go back',
      next: 'Go to next page',
      previous: 'Go to previous page'
    },
    input: {
      search: 'Search',
      email: 'Email address',
      password: 'Password',
      username: 'Username',
      message: 'Message'
    }
  };
  
  const typeLabels = labels[type] || {};
  const label = typeLabels[context.action] || context.label || '';
  
  return context.itemName ? `${label} ${context.itemName}` : label;
};

/**
 * Check if reduced motion is preferred
 */
export const prefersReducedMotion = () => {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Check if high contrast is preferred
 */
export const prefersHighContrast = () => {
  return window.matchMedia('(prefers-contrast: high)').matches;
};

/**
 * Get keyboard navigation instructions for component type
 */
export const getKeyboardInstructions = (componentType) => {
  const instructions = {
    list: 'Use arrow keys to navigate, Enter to select, Escape to exit',
    menu: 'Use arrow keys to navigate menu items, Enter to select, Escape to close',
    modal: 'Use Tab to navigate, Escape to close modal',
    form: 'Use Tab to move between fields, Enter to submit, Escape to cancel',
    table: 'Use arrow keys to navigate cells, Tab to move between interactive elements',
    tabs: 'Use arrow keys to navigate tabs, Enter or Space to select',
    tree: 'Use arrow keys to navigate, Enter to expand/collapse, Space to select',
    grid: 'Use arrow keys to navigate grid cells, Enter to activate',
    combobox: 'Type to filter, arrow keys to navigate, Enter to select',
    slider: 'Use arrow keys or Page Up/Down to adjust value'
  };
  
  return instructions[componentType] || 'Use Tab to navigate, Enter to activate';
};

/**
 * Create skip link for keyboard navigation
 */
export const createSkipLink = (targetId, label) => {
  return {
    id: `skip-to-${targetId}`,
    href: `#${targetId}`,
    label: label || `Skip to ${targetId}`,
    onClick: (e) => {
      e.preventDefault();
      const target = document.getElementById(targetId);
      if (target) {
        target.focus();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };
};

/**
 * Handle keyboard navigation for lists
 */
export const handleListKeyNavigation = (event, items, currentIndex, onSelect) => {
  let newIndex = currentIndex;
  
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      newIndex = Math.min(currentIndex + 1, items.length - 1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      newIndex = Math.max(currentIndex - 1, 0);
      break;
    case 'Home':
      event.preventDefault();
      newIndex = 0;
      break;
    case 'End':
      event.preventDefault();
      newIndex = items.length - 1;
      break;
    case 'Enter':
    case ' ':
      event.preventDefault();
      if (onSelect && items[currentIndex]) {
        onSelect(items[currentIndex]);
      }
      return currentIndex;
    case 'Escape':
      event.preventDefault();
      return -1;
    default:
      return currentIndex;
  }
  
  return newIndex;
};

/**
 * Handle keyboard navigation for grids/tables
 */
export const handleGridKeyNavigation = (event, rows, cols, currentRow, currentCol, onSelect) => {
  let newRow = currentRow;
  let newCol = currentCol;
  
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      newRow = Math.min(currentRow + 1, rows - 1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      newRow = Math.max(currentRow - 1, 0);
      break;
    case 'ArrowRight':
      event.preventDefault();
      newCol = Math.min(currentCol + 1, cols - 1);
      break;
    case 'ArrowLeft':
      event.preventDefault();
      newCol = Math.max(currentCol - 1, 0);
      break;
    case 'Home':
      event.preventDefault();
      if (event.ctrlKey) {
        newRow = 0;
        newCol = 0;
      } else {
        newCol = 0;
      }
      break;
    case 'End':
      event.preventDefault();
      if (event.ctrlKey) {
        newRow = rows - 1;
        newCol = cols - 1;
      } else {
        newCol = cols - 1;
      }
      break;
    case 'Enter':
    case ' ':
      event.preventDefault();
      if (onSelect) {
        onSelect(currentRow, currentCol);
      }
      return { row: currentRow, col: currentCol };
    default:
      return { row: currentRow, col: currentCol };
  }
  
  return { row: newRow, col: newCol };
};

/**
 * Add ARIA live region for dynamic content updates
 */
export const createLiveRegion = (priority = 'polite') => {
  const region = document.createElement('div');
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', priority);
  region.setAttribute('aria-atomic', 'true');
  region.className = 'sr-only';
  document.body.appendChild(region);
  
  return {
    announce: (message) => {
      region.textContent = message;
    },
    remove: () => {
      if (region.parentNode) {
        document.body.removeChild(region);
      }
    }
  };
};

/**
 * Format time for screen readers
 */
export const formatTimeForScreenReader = (date) => {
  if (!date) return '';
  
  const dateObj = new Date(date);
  const now = new Date();
  const diffMs = now - dateObj;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return dateObj.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
};

/**
 * Check if element is visible to screen readers
 */
export const isVisibleToScreenReader = (element) => {
  if (!element) return false;
  
  const ariaHidden = element.getAttribute('aria-hidden');
  if (ariaHidden === 'true') return false;
  
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }
  
  return true;
};
