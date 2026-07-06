import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api'; // Ensure that api.js exports an Axios instance
import './GetStarted.css';
import PasswordInput from '../../components/common/PasswordInput';

const GetStarted = () => {
  const [User_name, setName] = useState('');
  const [User_email, setEmail] = useState('');
  const [User_password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); // Added state for Confirm Password
  const [error, setError] = useState(''); // State to handle error messages
  const [message, setMessage] = useState(''); // State to handle success messages
  const navigate = useNavigate(); // Use navigate for redirection
  const passwordMinLength = 8;

  // Handle Sign Up form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); // Reset any previous error
    setMessage(''); // Reset any previous success message

    if (User_password.length < passwordMinLength) {
      setError(`Password must be at least ${passwordMinLength} characters`);
      return;
    }

    // Validate password and confirmPassword match
    if (User_password !== confirmPassword) {
      setError('Passwords do not match'); // Show error if passwords don't match
      return;
    }

    try {
      // Use the api instance for the POST request
      const res = await api.post('/auth/register', { User_name, User_email, User_password });
      if (res.status >= 400 || res.data?.success === false) {
        setError(res.data?.message || res.data?.details?.[0]?.error || 'Error creating account');
        return;
      }

      // Set success message
      setMessage(res.data.message);

      // The /register endpoint automatically logs the user in. To redirect to the
      // login page for manual sign-in, we remove the token that was just received.
      localStorage.removeItem('token');

      // Clear the form fields
      setName('');
      setEmail('');
      setPassword('');
      setConfirmPassword(''); // Clear confirm password

      // Redirect to the Sign In page after successful registration
      setTimeout(() => {
        navigate('/signin');
      }, 2000); // Optional: Add a short delay before redirecting
    } catch (err) {
      // Set error message if registration fails
      setError(err.response?.data?.message || 'Error creating account');
    }
  };

  return (
    <div className="getstarted-container">
      <div className="getstarted-hero">
        <h1>Join Our Learning Community</h1>
        <p>Connect with fellow learners and enhance your study experience</p>
      </div>
      
      <div className="getstarted-layout">
        {/* Left Side Content */}
        <div className="left-content">
          <div className="feature-card">
            <div className="feature-icon">📚</div>
            <h3>Study Groups</h3>
            <p>Join or create study groups with like-minded learners and enhance your learning experience.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🎯</div>
            <h3>Track Progress</h3>
            <p>Monitor your learning journey, set study goals, and achieve more with our tracking tools.</p>
          </div>
        </div>
        
        {/* Center Form */}
        <div className="center-form">
          <div className="getstarted-form">
          <h2>Create Your Account</h2>
          <p className="form-subtitle">Join thousands of students already learning together</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Full Name"
            value={User_name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            type="email"
            placeholder="Email Address"
            value={User_email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <PasswordInput
            placeholder="Password (min 8 characters)"
            value={User_password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={passwordMinLength}
            required
          />
          <PasswordInput
            placeholder="Confirm Password"
            value={confirmPassword} // Separate state for confirm password
            onChange={(e) => setConfirmPassword(e.target.value)} // Use confirmPassword state
            minLength={passwordMinLength}
            required
          />
          <button type="submit" className="btn-getstarted">Create Account</button>
          {message && <p className="success-message">{message}</p>} {/* Display success message */}
          {error && <p className="error-message">{error}</p>} {/* Display error message */}
          <p className="terms-text">
            By signing up, you agree to our <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>
          </p>
          <p className="login-prompt">
            Already have an account? <Link to="/signin" className="login-link">Sign In</Link>
          </p>
          </form>
        </div>
      </div>
      
      {/* Right Side Content */}
      <div className="right-content">
          <div className="feature-card">
            <div className="feature-icon">💬</div>
            <h3>Collaborate</h3>
            <p>Share notes, resources, and ideas with your study group in real-time.</p>
          </div>
          <div className="testimonial">
            <h3>What our users say</h3>
            <p>"This platform transformed how I study. The group features are amazing!"</p>
            <p className="testimonial-author">- Sarah, University Student</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GetStarted;
