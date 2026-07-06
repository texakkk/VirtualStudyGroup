import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api';
import './SignIn.css';
import { useAuth } from '../../contexts/AuthContext';
import PasswordInput from '../../components/common/PasswordInput';

const SignIn = () => {
  const { setIsAuthenticated, setCurrentUser } = useAuth();
  const [User_email, setEmail] = useState('');
  const [User_password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const clearAuthState = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setCurrentUser(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Basic form validation for email and password
    if (!/\S+@\S+\.\S+/.test(User_email)) {
      return setError('Please enter a valid email address.');
    }
    if (User_password.length < 8) {
      return setError('Password must be at least 8 characters.');
    }

    setLoading(true);
    try {
      const loginData = { 
        User_email: User_email.trim(),
        User_password 
      };
      console.log('Sending login request with data:', loginData);
      
      // Make the API call to log in the user
      const res = await api.post('/auth/login', loginData);
      console.log('Login response:', res.data);

      const isLoginValid =
        res.status === 200 &&
        !!res.data?.token &&
        !!res.data?.refreshToken &&
        !!res.data?.user &&
        res.data?.success !== false;

      if (!isLoginValid) {
        clearAuthState();
        setError(res.data?.message || 'Invalid credentials');
        return;
      }

      // Store the token and user data in localStorage
      localStorage.setItem('token', res.data.token);
      if (res.data.refreshToken) {
        localStorage.setItem('refreshToken', res.data.refreshToken);
      }
      console.log("Token stored in localStorage:", res.data.token); // Debugging line
      localStorage.setItem('user', JSON.stringify(res.data.user || res.data)); // Store user data
      console.log("User data stored in localStorage:", res.data.user); // Debugging line
     


      // Update the authentication state
      setIsAuthenticated(true);
      setCurrentUser(res.data.user); // Set the current user in context

      // Redirect to the dashboard after successful login
      navigate('/dashboard');
     
    } catch (err) {
      clearAuthState();
      console.error('Login error:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        headers: err.response?.headers
      });
      setError(err.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="signin-container">
      <div className="signin-hero">
        <h1>Welcome Back to Our Learning Community</h1>
        <p>Sign in to continue your learning journey</p>
      </div>
      
      <div className="signin-layout">
        {/* Left Side Content */}
        <div className="left-content">
          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Track Your Progress</h3>
            <p>Pick up where you left off and see how far you've come in your learning journey.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🎓</div>
            <h3>Continue Learning</h3>
            <p>Access your courses, study materials, and continue your educational path.</p>
          </div>
        </div>
        
        {/* Center Form */}
        <div className="center-form">
          <div className="signin-form">
            <h2>Welcome Back!</h2>
            <p className="form-subtitle">Please sign in to continue</p>
            <form onSubmit={handleSubmit}>
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={User_email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <label htmlFor="password">Password</label>
              <PasswordInput
                id="password"
                placeholder="Enter your password"
                value={User_password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
              <button type="submit" className="btn-signin" disabled={loading}>
                {loading ? 'Signing In...' : 'Sign In'}
              </button>
              {error && <p className="error-message">{error}</p>}
            </form>
            <p className="forgot-password">
              <Link to="/forgot-password" className="forgot-password-link">Forgot Password?</Link>
            </p>
            <p className="signup-prompt">
              Don't have an account? <Link to="/get-started" className="signup-link">Get Started</Link>
            </p>
          </div>
        </div>
      
        {/* Right Side Content */}
        <div className="right-content">
          <div className="feature-card">
            <div className="feature-icon">🤝</div>
            <h3>Connect with Peers</h3>
            <p>Join study groups and collaborate with fellow learners to enhance your understanding.</p>
          </div>
          <div className="testimonial">
            <h3>What our users say</h3>
            <p>"The best learning platform I've used. Made studying so much more effective!"</p>
            <p className="testimonial-author">- Alex, College Student</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignIn;
