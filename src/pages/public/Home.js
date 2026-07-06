// src/pages/Home.js
import React from "react";
import { Link } from "react-router-dom";
import {
  FaBell,
  FaBrain,
  FaCalendarAlt,
  FaCheckCircle,
  FaChartLine,
  FaFileAlt,
  FaGraduationCap,
  FaPlay,
  FaRegCalendarCheck,
  FaSearch,
  FaShieldAlt,
  FaUniversity,
  FaUsers,
  FaVideo,
} from "react-icons/fa";
import { FiArrowRight, FiBookOpen, FiFileText, FiMessageSquare, FiSettings } from "react-icons/fi";
import heroImage from "../../assets/home.jpg";
import "./Home.css";

const features = [
  {
    icon: <FaVideo />,
    title: "Video & Media Sessions",
    description: "Host live video calls and synchronized media sessions without losing group context.",
  },
  {
    icon: <FaRegCalendarCheck />,
    title: "Task Management",
    description: "Create tasks, assign teammates, track progress, and keep deadlines visible.",
  },
  {
    icon: <FiFileText />,
    title: "Notes & Document Tools",
    description: "Write rich notes, manage versions, share access, export work, and convert documents.",
  },
  {
    icon: <FiMessageSquare />,
    title: "Group Chat & Files",
    description: "Discuss work in real time with replies, message actions, read states, and file sharing.",
  },
  {
    icon: <FaUsers />,
    title: "Group Management",
    description: "Create study groups, invite members, manage roles, and keep every team organized.",
  },
  {
    icon: <FaBrain />,
    title: "AI Study Assistant",
    description: "Ask for study help, task suggestions, group insights, and smarter prioritization.",
  },
  {
    icon: <FaChartLine />,
    title: "Insights & Analytics",
    description: "Review task completion, engagement, member activity, and automated recommendations.",
  },
  {
    icon: <FaFileAlt />,
    title: "Project Reports",
    description: "Generate reports covering tasks, chats, video sessions, files, members, and activity.",
  },
  {
    icon: <FaCalendarAlt />,
    title: "Calendar & Scheduling",
    description: "Plan group events, study sessions, deadlines, and virtual meeting links.",
  },
  {
    icon: <FaBell />,
    title: "Notifications",
    description: "Stay on top of messages, tasks, video sessions, and recent dashboard activity.",
  },
  {
    icon: <FaSearch />,
    title: "Unified Search",
    description: "Find groups, tasks, users, and messages quickly from the dashboard top bar.",
  },
  {
    icon: <FiSettings />,
    title: "Profile & Settings",
    description: "Customize theme, language, accessibility, layout, notifications, and account details.",
  },
];

const stats = [
  { value: "2,500+", label: "Students" },
  { value: "300+", label: "Active Study Groups" },
  { value: "24/7", label: "Collaboration" },
];

const steps = [
  "Create a private study group for your course or project.",
  "Invite classmates and organize tasks, notes, and sessions.",
  "Meet, review progress, and keep everyone moving together.",
];

const faqs = [
  {
    question: "Can groups collaborate live?",
    answer: "Yes. Groups can use chat, video sessions, shared notes, and tasks from the same workspace.",
  },
  {
    question: "Is this useful for class projects?",
    answer: "Absolutely. The platform helps teams divide work, keep files together, and review progress.",
  },
  {
    question: "Can new students get started quickly?",
    answer: "Yes. The flow is simple: create a group, invite classmates, and start a study session.",
  },
];

const Home = () => {
  return (
    <div className="home-container">
      <section className="home-hero">
        <img src={heroImage} alt="Students collaborating in a study group" className="hero-image" />
        <div className="hero-overlay"></div>

        <div className="hero-shell">
          <div className="hero-content">
            <span className="hero-eyebrow">Collaborative Learning Platform</span>

            <h1>Study Better Together</h1>

            <p className="hero-subtitle">
              A focused workspace for group learning, shared notes, task management, and accountable
              progress all in one place.
            </p>

            <div className="hero-actions">
              <Link to="/get-started" className="btn-hero">
                Get Started <FiArrowRight aria-hidden="true" />
              </Link>

              <Link to="/features" className="btn-secondary">
                <FaPlay aria-hidden="true" /> Explore Features
              </Link>
            </div>

            <div className="trust-stats" aria-label="Platform statistics">
              {stats.map((stat) => (
                <div className="trust-stat" key={stat.label}>
                  <strong>{stat.value}</strong>
                  <span>{stat.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="dashboard-preview" aria-label="Virtual study dashboard preview">
            <div className="dashboard-topbar">
              <div>
                <span className="dashboard-kicker">Live Workspace</span>
                <h2>Biology Study Room</h2>
              </div>
              <span className="live-pill">Live</span>
            </div>

            <div className="dashboard-grid">
              <div className="video-panel">
                <div className="video-header">
                  <FaVideo aria-hidden="true" />
                  <span>Video Call</span>
                </div>
                <div className="participant-grid">
                  <span>AN</span>
                  <span>JK</span>
                  <span>LM</span>
                  <span>TS</span>
                </div>
              </div>

              <div className="notes-panel">
                <div className="panel-title">
                  <FiFileText aria-hidden="true" />
                  <span>Shared Notes</span>
                </div>
                <p>Chapter 7: Cell signaling</p>
                <div className="note-lines">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>

              <div className="tasks-panel">
                <div className="panel-title">
                  <FaCheckCircle aria-hidden="true" />
                  <span>Tasks</span>
                </div>
                <ul>
                  <li>Review slides</li>
                  <li>Summarize notes</li>
                  <li>Practice quiz</li>
                </ul>
              </div>

              <div className="chat-panel">
                <div className="panel-title">
                  <FiMessageSquare aria-hidden="true" />
                  <span>Group Chat</span>
                </div>
                <p>Ready to start the mock exam?</p>
                <span className="chat-reply">Yes, after notes sync.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="trusted-section landing-section">
        <span>Trusted by students building better study habits</span>
        <div className="trusted-row">
          <div><FaUniversity aria-hidden="true" /> University Teams</div>
          <div><FaUsers aria-hidden="true" /> Peer Groups</div>
          <div><FaGraduationCap aria-hidden="true" /> Course Cohorts</div>
        </div>
      </section>

      <section className="features-section landing-section">
        <div className="section-heading">
          <span>Features</span>
          <h2>Every dashboard feature, built for study groups</h2>
          <p>Plan work, meet live, share knowledge, track progress, and manage your group from one workspace.</p>
        </div>

        <div className="features-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <div className="feature-icon">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
              <Link to="/features" className="learn-more">
                Learn More <FiArrowRight aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="how-section landing-section">
        <div className="section-heading">
          <span>How It Works</span>
          <h2>From scattered chats to one clear study flow</h2>
        </div>

        <div className="steps-grid">
          {steps.map((step, index) => (
            <div className="step-card" key={step}>
              <span>{index + 1}</span>
              <p>{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="product-section landing-section">
        <div className="product-copy">
          <span>Product Preview</span>
          <h2>Bring every study workflow into one dashboard</h2>
          <p>
            The app combines group management, chat, notes, tasks, video, media sessions, AI tools,
            insights, reports, notifications, search, profile controls, and settings in one place.
          </p>
          <div className="product-feature-list">
            <span><FaShieldAlt aria-hidden="true" /> Private group workspaces</span>
            <span><FiBookOpen aria-hidden="true" /> Notes, files, and documents</span>
            <span><FaChartLine aria-hidden="true" /> Analytics and reports</span>
          </div>
        </div>

        <div className="product-screenshot">
          <div className="screen-sidebar">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div className="screen-main">
            <div className="screen-chart"></div>
            <div className="screen-cards">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      </section>

      <section className="faq-section landing-section">
        <div className="section-heading">
          <span>FAQ</span>
          <h2>Questions before you join?</h2>
        </div>

        <div className="faq-list">
          {faqs.map((faq) => (
            <article className="faq-item" key={faq.question}>
              <h3>{faq.question}</h3>
              <p>{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="final-cta">
        <div>
          <span>Ready when your group is</span>
          <h2>Start a better study routine today.</h2>
        </div>
        <Link to="/get-started" className="btn-hero">
          Create Your Group <FiArrowRight aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
};

export default Home;
