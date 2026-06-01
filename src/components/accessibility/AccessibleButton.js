import React from 'react';
import { generateAriaLabel } from '../../utils/accessibility';

/**
 * AccessibleButton Component
 * A button component with built-in accessibility features
 */
const AccessibleButton = ({
  children,
  onClick,
  ariaLabel,
  ariaDescribedBy,
  disabled = false,
  type = 'button',
  variant = 'primary',
  size = 'medium',
  icon,
  loading = false,
  className = '',
  ...props
}) => {
  const buttonClasses = [
    'accessible-button',
    `accessible-button--${variant}`,
    `accessible-button--${size}`,
    loading && 'accessible-button--loading',
    className
  ].filter(Boolean).join(' ');

  const handleClick = (e) => {
    if (!disabled && !loading && onClick) {
      onClick(e);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(e);
    }
  };

  return (
    <button
      type={type}
      className={buttonClasses}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {icon && <span className="accessible-button__icon" aria-hidden="true">{icon}</span>}
      <span className="accessible-button__text">{children}</span>
      {loading && (
        <span className="accessible-button__spinner" role="status" aria-label="Loading">
          <span className="sr-only">Loading...</span>
        </span>
      )}
    </button>
  );
};

export default AccessibleButton;
