import React, { useState } from 'react';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import './PasswordInput.css';

const PasswordInput = ({ id, className = '', inputClassName = '', ...props }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className={`password-input-wrapper ${className}`}>
      <input
        {...props}
        id={id}
        className={inputClassName}
        type={isVisible ? 'text' : 'password'}
      />
      <button
        type="button"
        className="password-visibility-toggle"
        onClick={() => setIsVisible((current) => !current)}
        aria-label={isVisible ? 'Hide password' : 'Show password'}
        title={isVisible ? 'Hide password' : 'Show password'}
      >
        {isVisible ? <FaEyeSlash /> : <FaEye />}
      </button>
    </div>
  );
};

export default PasswordInput;
