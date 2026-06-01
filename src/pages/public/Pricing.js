// src/pages/Pricing.js
import React from 'react';
import './Pricing.css';

const Pricing = () => {
  return (
    <div className="pricing-container">
      <h1>Choose Your Plan</h1>
      <p>Whether you're a casual learner or a professional, we have a plan that fits your needs.</p>
      <div className="pricing-plans">
        <div className="plan-card">
          <h2>Free</h2>
          <p className="price">$0 <span>/ month</span></p>
          <ul>
            <li>Up to 2 Groups</li>
            <li>Basic Chat Features</li>
            <li>Task Management</li>
            <li>Shared Notes</li>
          </ul>
          <button className="btn-select">Get Started</button>
        </div>

        <div className="plan-card premium">
          <h2>Premium</h2>
          <p className="price">$9.99 <span>/ month</span></p>
          <ul>
            <li>Unlimited Groups</li>
            <li>Advanced Chat Features</li>
            <li>Task Management + Reminders</li>
            <li>Shared Notes with Real-time Collaboration</li>
            <li>Video Chat Integration</li>
            <li>YouTube Content Streaming</li>
          </ul>
          <button className="btn-select">Get Premium</button>
        </div>

        <div className="plan-card">
          <h2>Enterprise</h2>
          <p className="price">Custom Pricing</p>
          <ul>
            <li>All Premium Features</li>
            <li>Custom Branding</li>
            <li>Dedicated Support</li>
            <li>Enhanced Security</li>
            <li>Team Analytics</li>
          </ul>
          <button className="btn-select">Contact Us</button>
        </div>
      </div>
    </div>
  );
};

export default Pricing;
