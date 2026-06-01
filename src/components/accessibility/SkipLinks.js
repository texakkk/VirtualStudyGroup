import React from 'react';
import './SkipLinks.css';

/**
 * SkipLinks Component
 * Provides keyboard navigation shortcuts to main content areas
 */
const SkipLinks = ({ links }) => {
  const defaultLinks = [
    { id: 'main-content', label: 'Skip to main content' },
    { id: 'navigation', label: 'Skip to navigation' },
    { id: 'search', label: 'Skip to search' }
  ];

  const skipLinks = links || defaultLinks;

  const handleSkipClick = (e, targetId) => {
    e.preventDefault();
    const target = document.getElementById(targetId);
    if (target) {
      target.focus();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      
      // Ensure element is focusable
      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
      }
    }
  };

  return (
    <nav className="skip-links" aria-label="Skip links">
      {skipLinks.map((link) => (
        <a
          key={link.id}
          href={`#${link.id}`}
          className="skip-link"
          onClick={(e) => handleSkipClick(e, link.id)}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
};

export default SkipLinks;
