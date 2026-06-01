import React, { useState, useEffect } from 'react';
import { FaCheck, FaExclamationTriangle, FaTimes } from 'react-icons/fa';
import './Toast.css';

const Toast = ({ message, type = 'success', duration = 5000, onClose }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Wait for fade out animation
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <FaCheck />;
      case 'warning':
        return <FaExclamationTriangle />;
      case 'error':
        return <FaTimes />;
      default:
        return <FaCheck />;
    }
  };

  return (
    <div className={`toast toast-${type} ${isVisible ? 'toast-visible' : 'toast-hidden'}`}>
      <div className="toast-icon">
        {getIcon()}
      </div>
      <div className="toast-message">
        {message}
      </div>
      <button className="toast-close" onClick={handleClose}>
        <FaTimes />
      </button>
    </div>
  );
};

export default Toast;