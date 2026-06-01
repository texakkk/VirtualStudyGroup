import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api'; // Import the centralized API instance
import './ResetPassword.css'; // Assuming you have some styles

const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(''); // State to handle error messages
  const [message, setMessage] = useState(''); // State to handle success messages
  const { token } = useParams(); // Get the reset token from the URL
  const navigate = useNavigate(); // Use navigate for redirection

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    // Validate that both passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      // Send the reset request with the token and new password
      if (token) {
        // Corrected this line to use backticks for template literals
        const res = await api.put(`/auth/reset-password/${token}`, { password });

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
          <input
            type="password"
            placeholder="New Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Confirm New Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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
