// src/pages/Home.js
import React from 'react';
import { Link } from 'react-router-dom';
import './Home.css'; // Ensure to create this file for styling

const Home = () => {
  return (
    <div className="home-container">
      <div className="home-hero">
        <img src="home.jpg" alt="Study Group" className="hero-image" />
        <div className="hero-overlay" />
        <div className="hero-content">
          <p className="hero-eyebrow">VStudy</p>
          <h1>Study Better Together</h1>
          <p className="hero-subtitle">A focused workspace for group learning, shared notes, and accountable progress.</p>
          <div className="hero-actions">
            <Link to="/get-started" className="btn-hero">Get Started</Link>
            <Link to="/features" className="btn-secondary">Explore Features</Link>
          </div>
        </div>
      </div>
      
      <div className="home-features-preview">
        <div className="features-header">
          <h2>Everything Your Study Group Needs</h2>
          <p>One place to plan work, discuss ideas, and keep momentum.</p>
        </div>
        <div className="features-grid">
          <div className="feature-card">
            <h3>Real-Time Collaboration</h3>
            <p>Chat, video call, and collaborate seamlessly in real-time.</p>
          </div>
          <div className="feature-card">
            <h3>Task Management</h3>
            <p>Stay organized with powerful task management tools.</p>
          </div>
          <div className="feature-card">
            <h3>Shared Notes</h3>
            <p>Create, edit, and share notes with your group members.</p>
          </div>
          <div className="feature-card">
            <h3>Video Integration</h3>
            <p>Integrate YouTube content directly into your study sessions.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
