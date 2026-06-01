import React, { useState } from 'react';
import api from '../../api';
import './ForgotPassword.css';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validateEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');

    if (!validateEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    try {
      setLoading(true);
      const res = await api.post('/auth/forgot-password', { email });
      setMessage(res.data.message);
      setEmail('');
    } catch (err) {
      setError(err.response?.data?.message || 'Error sending reset link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="forgot-password-container">
      <div className="forgot-password-form">
        <h1>Reset Password</h1>
        <p className="form-subtitle">
          Enter your account email and we will send you a reset link.
        </p>

        <form onSubmit={handleSubmit} aria-live="polite">
          <label htmlFor="email">Email Address</label>
          <input
            id="email"
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-required="true"
            className={error ? 'input-error' : ''}
            disabled={loading}
          />

          <button type="submit" className="btn-reset" disabled={loading}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>

          {message && <p className="success-message">{message}</p>}
          {error && (
            <p className="error-message" aria-live="assertive">
              {error}
            </p>
          )}

          <p className="back-to-login">
            Remember your password?{' '}
            <a href="/signin" className="login-link">
              Log in
            </a>
          </p>
        </form>
      </div>
    </div>
  );
};

export default ForgotPassword;
