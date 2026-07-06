import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaEnvelope, FaArrowLeft } from 'react-icons/fa';
import api from '../../api';
import './ForgotPassword.css';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validateEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    setError('');

    const normalizedEmail = email.trim();

    if (!validateEmail(normalizedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    try {
      setLoading(true);
      const response = await api.post('/auth/forgot-password', {
        User_email: normalizedEmail,
      });

      if (response.status >= 400 || response.data?.success === false) {
        setError(response.data?.message || response.data?.details?.[0]?.error || 'Error sending reset link');
        return;
      }

      setMessage(response.data?.message || 'Reset link sent. Please check your email.');
      setEmail('');
    } catch (err) {
      setError(err.response?.data?.message || 'Error sending reset link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="forgot-page">
      <section className="forgot-panel" aria-labelledby="forgot-password-title">
        <Link to="/signin" className="forgot-back-link">
          <FaArrowLeft aria-hidden="true" />
          <span>Back to sign in</span>
        </Link>

        <div className="forgot-icon" aria-hidden="true">
          <FaEnvelope />
        </div>

        <h1 id="forgot-password-title">Forgot Password</h1>
        <p className="forgot-copy">
          Enter your account email and we will send you a reset link.
        </p>

        <form className="forgot-form" onSubmit={handleSubmit}>
          <div className="forgot-field">
            <label htmlFor="forgot-email">Email Address</label>
            <input
              id="forgot-email"
              name="User_email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              disabled={loading}
              aria-invalid={Boolean(error)}
            />
          </div>

          <button type="submit" className="forgot-submit" disabled={loading}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>

          {message && <p className="forgot-message success">{message}</p>}
          {error && (
            <p className="forgot-message error" aria-live="assertive">
              {error}
            </p>
          )}
        </form>
      </section>
    </main>
  );
};

export default ForgotPassword;
