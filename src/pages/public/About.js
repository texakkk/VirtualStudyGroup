// src/pages/About.js
import React from 'react';
import './About.css';

const About = () => {
  return (
    <div className="about-container">
      <h1>About Virtual Study Group</h1>
      <div className="about-content">
        <div className="about-image">
          <img src="/assets/team.png" alt="Our Team" />
        </div>
        <div className="about-text">
          <h2>Our Mission</h2>
          <p>Our mission is to create a unified platform that makes collaborative learning easy, engaging, and effective. We believe in empowering students and educators by providing the right tools to connect and share knowledge seamlessly.</p>
          <h2>Our Team</h2>
          <p>We are a team of passionate developers, educators, and designers dedicated to improving the way people learn and collaborate. We work closely with educational institutions and student communities to build a platform that meets their unique needs.</p>
          <h2>Get in Touch</h2>
          <p>If you have any questions or would like to learn more, feel free to reach out to us at hello@virtualstudygroup.com.</p>
        </div>
      </div>
    </div>
  );
};

export default About;
