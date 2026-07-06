import React, { useState } from 'react';
import api from '../../api';
import { useParams, useNavigate } from 'react-router-dom';
import './JoinGroup.css';
import PasswordInput from '../../components/common/PasswordInput';

const JoinGroup = () => {
  const { invitationToken } = useParams();
  const [User_email, setUser_email] = useState('');
  const [User_password, setUser_password] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const navigate = useNavigate();

  const clearAuthState = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  };

  // Handle login
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/auth/login', { User_email, User_password });

      const isLoginValid =
        res.status === 200 &&
        !!res.data?.token &&
        !!res.data?.refreshToken &&
        !!res.data?.user &&
        res.data?.success !== false;

      if (!isLoginValid) {
        clearAuthState();
        setStatusMessage('');
        setErrorMessage(res.data?.message || 'Login failed. Please check your credentials or sign up.');
        return;
      }

      localStorage.setItem('token', res.data.token); // Save the token for future use
      if (res.data.refreshToken) {
        localStorage.setItem('refreshToken', res.data.refreshToken);
      }
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setErrorMessage('');
      setStatusMessage('Login successful! Joining the group...');
      joinGroup(res.data.token); // Proceed to join the group after login
    } catch (error) {
      clearAuthState();
      setStatusMessage('');
      setErrorMessage('Login failed. Please check your credentials or sign up.');
    }
  };

  // Join the group
  const joinGroup = async (token) => {
    setIsJoining(true);
    try {
      const res = await api.post(`/group/join/${invitationToken}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.data.success) {
        setStatusMessage(res.data.message || 'Successfully joined the group!');
        // Store group ID in localStorage for potential future use
        localStorage.setItem('joinedGroupId', res.data.group?._id);
        // Navigate to the dashboard after successful join
        setTimeout(() => {
          navigate('/dashboard');
        }, 2000);
      } else {
        setErrorMessage(res.data.message || 'Failed to join group');
      }
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Error joining the group');
      console.error('Join group error:', error);
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="join-group-container">
      <h2>Join Group</h2>
      <div className="status-container">
        {statusMessage && (
          <div className="status-message success">{statusMessage}</div>
        )}
        {errorMessage && (
          <div className="status-message error">{errorMessage}</div>
        )}
      </div>
      <form onSubmit={handleLogin} className="join-form">
        <div className="form-group">
          <label htmlFor="User_email">Email</label>
          <input
            type="email"
            id="User_email"
            value={User_email}
            onChange={(e) => setUser_email(e.target.value)}
            required
            disabled={isJoining}
            placeholder="Enter your email"
          />
        </div>
        <div className="form-group">
          <label htmlFor="User_password">Password</label>
          <PasswordInput
            id="User_password"
            value={User_password}
            onChange={(e) => setUser_password(e.target.value)}
            required
            disabled={isJoining}
            placeholder="Enter your password"
          />
        </div>
        <button type="submit" disabled={isJoining}>
          {isJoining ? 'Joining...' : 'Join Group'}
        </button>
        <p className="signup-link">
          Don't have an account? <a href="/get-started">Sign up</a>
        </p>
      </form>
    </div>
  );
};

export default JoinGroup;
