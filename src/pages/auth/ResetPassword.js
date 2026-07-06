import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api'; // Import the centralized API instance
import './ResetPassword.css'; // Assuming you have some styles
import PasswordInput from '../../components/common/PasswordInput';

const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(''); // State to handle error messages
  const [message, setMessage] = useState(''); // State to handle success messages
  const { token } = useParams(); // Get the reset token from the URL
  const navigate = useNavigate(); // Use navigate for redirection
  const passwordMinLength = 8;

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password.length < passwordMinLength) {
      setError(`Password must be at least ${passwordMinLength} characters`);
      return;
    }

    // Validate that both passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      // Send the reset request with the token and new password
      if (token) {
        // Corrected this line to use backticks for template literals
        const res = await api.put(`/auth/reset-password/${token}`, { User_password: password });
        if (res.status >= 400 || res.data?.success === false) {
          setError(res.data?.message || res.data?.details?.[0]?.error || 'Error resetting password');
          return;
        }

        // Set success message
        setMessage(res.data.message);

        // Optionally, redirect to the login page after password reset
        setTimeout(() => {
          navigate('/signin');
        }, 2000);
      } else {
        setError('Invalid or missing token');
      }
    } catch (err) {
      // Set error message if password reset fails
      setError(err.response?.data?.message || 'Error resetting password');
    }
  };

  return (
    <div className="reset-password-container">
      <div className="reset-password-form">
        <h2>Reset Your Password</h2>
        <form onSubmit={handleSubmit}>
          <PasswordInput
            placeholder="New Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={passwordMinLength}
            required
          />
          <PasswordInput
            placeholder="Confirm New Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={passwordMinLength}
            required
          />
          <button type="submit" className="btn-reset-password">Reset Password</button>
          {message && <p className="success-message">{message}</p>} {/* Display success message */}
          {error && <p className="error-message">{error}</p>} {/* Display error message */}
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
