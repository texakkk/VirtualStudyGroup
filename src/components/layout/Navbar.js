import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import './Navbar.css';

const Navbar = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);

  const toggleMobileMenu = () => {
    const newState = !isMobileMenuOpen;
    setIsMobileMenuOpen(newState);
    
    // Toggle body scroll
    if (newState) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
  };
  
  // Clean up the body style when component unmounts
  useEffect(() => {
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setHasScrolled(window.scrollY > 24);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
    document.body.style.overflow = 'auto';
  };

  return (
    <nav className={`navbar ${hasScrolled || isMobileMenuOpen ? 'scrolled' : ''}`} role="navigation" aria-label="Main navigation" id="navigation">
      <div className="navbar-container">
        {/* Logo Section */}
        <div className="navbar-logo">
          <NavLink to="/" onClick={closeMobileMenu} aria-label="Study - Home">
            <img src="/logo512.png" alt="" className="logo" aria-hidden="true" />
            <span>Study</span>
          </NavLink>
        </div>

        {/* Mobile Menu Toggle */}
        <button 
          className="mobile-menu-toggle" 
          onClick={toggleMobileMenu}
          aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isMobileMenuOpen}
          aria-controls="navbar-menu"
        >
          <span aria-hidden="true">{isMobileMenuOpen ? '✕' : '☰'}</span>
        </button>

        {/* Mobile Overlay */}
        {isMobileMenuOpen && (
          <div 
            className={`mobile-overlay ${isMobileMenuOpen ? 'active' : ''}`}
            onClick={closeMobileMenu}
            role="button"
            tabIndex="0"
            onKeyDown={(e) => {
              if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                closeMobileMenu();
              }
            }}
            aria-label="Close navigation menu"
          />
        )}

        {/* Navbar Links */}
        <ul 
          id="navbar-menu"
          className={`navbar-links ${isMobileMenuOpen ? 'active' : ''}`}
          role="menubar"
          aria-label="Main menu"
        >
          <li role="none">
            <NavLink 
              to="/features" 
              onClick={closeMobileMenu} 
              activeclassname="active"
              role="menuitem"
              aria-label="Features page"
            >
              Features
            </NavLink>
          </li>
          <li role="none">
            <NavLink 
              to="/pricing" 
              onClick={closeMobileMenu} 
              activeclassname="active"
              role="menuitem"
              aria-label="Pricing page"
            >
              Pricing
            </NavLink>
          </li>
          <li role="none">
            <NavLink 
              to="/signin" 
              onClick={closeMobileMenu} 
              activeclassname="active"
              role="menuitem"
              aria-label="Sign in to your account"
            >
              Sign In
            </NavLink>
          </li>
          <li role="none">
            <NavLink 
              to="/get-started" 
              onClick={closeMobileMenu} 
              className="btn-get-started" 
              activeclassname="active"
              role="menuitem"
              aria-label="Get started with Study"
            >
              Get Started
            </NavLink>
          </li>
        </ul>
      </div>
    </nav>
  );
};

export default Navbar;
