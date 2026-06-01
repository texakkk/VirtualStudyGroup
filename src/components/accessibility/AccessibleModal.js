import React, { useEffect } from 'react';
import { useFocusTrap, useEscapeKey } from '../../hooks/useKeyboardNavigation';
import { announceToScreenReader } from '../../utils/accessibility';

/**
 * AccessibleModal Component
 * A modal dialog with full accessibility support
 */
const AccessibleModal = ({
  isOpen,
  onClose,
  title,
  children,
  ariaLabel,
  ariaDescribedBy,
  className = '',
  closeOnEscape = true,
  closeOnBackdropClick = true,
  showCloseButton = true
}) => {
  const modalRef = useFocusTrap(isOpen);

  useEscapeKey(() => {
    if (closeOnEscape && isOpen) {
      onClose();
    }
  }, isOpen);

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('modal-open');
      announceToScreenReader(`Dialog opened: ${title || ariaLabel || 'Modal'}`, 'polite');
    } else {
      document.body.classList.remove('modal-open');
    }

    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [isOpen, title, ariaLabel]);

  const handleBackdropClick = (e) => {
    if (closeOnBackdropClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title}
        aria-describedby={ariaDescribedBy}
        className={`accessible-modal ${className}`}
      >
        {title && (
          <h2 id="modal-title" className="accessible-modal__title">
            {title}
          </h2>
        )}
        
        {showCloseButton && (
          <button
            type="button"
            className="accessible-modal__close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        )}
        
        <div
          id={ariaDescribedBy || 'modal-content'}
          className="accessible-modal__content"
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export default AccessibleModal;
