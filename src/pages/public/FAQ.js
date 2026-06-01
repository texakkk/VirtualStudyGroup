// src/pages/FAQ.js
import React from 'react';
import './FAQ.css';

const FAQ = () => {
  return (
    <div className="faq-container">
      <h1>Frequently Asked Questions</h1>
      <div className="faq-list">
        <div className="faq-item">
          <h3>What is Virtual Study Group?</h3>
          <p>Virtual Study Group is an integrated platform that helps students collaborate through real-time chat, task management, video chats, and more.</p>
        </div>

        <div className="faq-item">
          <h3>How much does it cost?</h3>
          <p>We offer a free plan with limited features and a Premium plan starting at $9.99/month.</p>
        </div>

        <div className="faq-item">
          <h3>Can I cancel my subscription?</h3>
          <p>Yes, you can cancel anytime from your account settings.</p>
        </div>

        <div className="faq-item">
          <h3>Is my data secure?</h3>
          <p>We take data security very seriously and use the latest encryption standards to protect your information.</p>
        </div>

        <div className="faq-item">
          <h3>How can I contact support?</h3>
          <p>You can reach us at support@virtualstudygroup.com or through our Contact Us page.</p>
        </div>
      </div>
    </div>
  );
};

export default FAQ;
