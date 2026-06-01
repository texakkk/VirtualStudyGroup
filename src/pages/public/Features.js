// src/pages/Features.js
import React from 'react';
import './Features.css'; 

const Features = () => {
  return (
    <div className="features-page">
      <h1>Our Features</h1>
      <div className="features-list">
        <div className="feature-item">
          <h2>Real-Time Chat</h2>
          <p>Communicate instantly with group members, share files, and stay connected.</p>
        </div>
        <div className="feature-item">
          <h2>Task Management</h2>
          <p>Create to-do lists, assign tasks, and track your progress effortlessly.</p>
        </div>
        <div className="feature-item">
          <h2>Video Chat</h2>
          <p>Host virtual study sessions with high-quality video and screen sharing.</p>
        </div>
      </div>
    </div>
  );
};

export default Features;
