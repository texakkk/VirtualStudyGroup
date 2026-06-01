# VStudy - Virtual Study Group Platform

![VStudy Logo](public/vstudygroup.png)

A comprehensive, full-stack web application that enables virtual study groups to collaborate in real-time. VStudy provides a modern, feature-rich environment for students and educators to share resources, conduct live sessions, and work together seamlessly across multiple features and devices.

**Version:** 0.1.0 | **Status:** Active Development

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Running the Application](#-running-the-application)
- [Project Structure](#-project-structure)
- [Core Modules](#-core-modules)
- [API Documentation](#-api-documentation)
- [Database Schema](#-database-schema)
- [Real-Time Features](#-real-time-features)
- [Authentication](#-authentication)
- [Development](#-development)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [License](#-license)
- [Support](#-support)

---

## ✨ Features

### Core Collaboration Features
- **Real-Time Communication**: Instant messaging and notifications via Socket.IO
- **Study Groups Management**: Create, join, and manage multiple study groups
- **Live Video Sessions**: Integrated video conferencing with annotation tools
- **Document Collaboration**: Real-time collaborative document editing with Quill rich text editor
- **Whiteboard & Drawing**: Interactive whiteboard for sketching and explaining concepts
- **File Sharing**: Secure file upload and sharing with group members
- **Task Management**: Create, assign, and track study tasks and assignments

### Advanced Features
- **AI-Powered Assistance**: Integration with Google AI (Gemini) for intelligent suggestions
- **Document Generation**: Export notes and documents as PDF with jsPDF
- **Multi-Language Support**: i18n support for internationalization
- **Drag & Drop Interface**: Intuitive drag-and-drop components with react-beautiful-dnd
- **Video Annotation**: Mark up and annotate during video sessions
- **Cross-Group Collaboration**: Collaborate across multiple study groups
- **Device Synchronization**: Seamless experience across desktop and mobile devices
- **Content Moderation**: Built-in content moderation for safe community
- **Analytics Dashboard**: Track group performance and activity metrics
- **Theme Customization**: Dark/Light mode support
- **Accessibility Features**: WCAG compliant with keyboard navigation and screen reader support

### Study Tools
- **Rich Note-Taking**: Quill-based rich text editor with formatting
- **Emoji Support**: Integrated emoji picker for expressive communication
- **Search Functionality**: Full-text search across messages and documents
- **Notification System**: Smart notifications with snackbar and toast alerts
- **YouTube Integration**: Embed and share YouTube videos
- **Meeting Scheduling**: Schedule and manage group study sessions
- **Report Generation**: Generate performance reports and statistics

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 18.3.1
- **UI Libraries**: Material-UI (MUI), Ant Design (antd)
- **State Management**: Redux Toolkit
- **Styling**: Emotion, CSS-in-JS
- **Routing**: React Router v6
- **Real-Time**: Socket.IO Client
- **Rich Text Editor**: Quill, react-quill-new
- **Drag & Drop**: react-beautiful-dnd, react-draggable
- **Internationalization**: i18next, react-i18next
- **Utilities**: Axios, date-fns, react-icons
- **PDF Generation**: jsPDF, html2canvas, docx
- **Video Player**: react-player
- **Notifications**: Notistack, react-toastify
- **Virtualization**: react-window (for large lists)
- **P2P Communication**: simple-peer (for WebRTC)

### Backend
- **Runtime**: Node.js (v24+)
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (jsonwebtoken)
- **Real-Time**: Socket.IO
- **Password Hashing**: bcryptjs
- **Security**: Helmet, Express Rate Limit, XSS protection
- **Email Service**: Nodemailer
- **Task Scheduling**: node-cron
- **Caching**: Redis, node-cache
- **AI Integration**: Google GenAI API
- **File Upload**: Multer
- **Validation**: Validator
- **HTTP Client**: Axios

### DevOps & Tools
- **Package Manager**: npm
- **Testing**: Jest, Supertest
- **Development**: Nodemon
- **Code Quality**: ESLint
- **Environment Variables**: dotenv
- **Monitoring & Logs**: Custom logging middleware

---

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 24.0.0 or higher ([Download](https://nodejs.org))
- **npm**: Version 10.0.0 or higher (comes with Node.js)
- **MongoDB**: Version 5.0 or higher ([Download](https://www.mongodb.com/try/download/community) or use MongoDB Atlas)
- **Redis**: Version 6.0 or higher ([Download](https://redis.io/download)) (Optional but recommended for production)
- **Git**: For version control ([Download](https://git-scm.com))

### System Requirements
- **RAM**: Minimum 4GB (8GB recommended)
- **Disk Space**: 2GB minimum
- **OS**: Windows, macOS, or Linux

---

## 📥 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/vstudy.git
cd vstudy
```

### 2. Install Frontend Dependencies

```bash
cd ./frontend  # or at root if frontend is there
npm install
```

### 3. Install Backend Dependencies

```bash
cd ./backend
npm install
cd ..
```

### 4. Verify Node Version

```bash
node --version  # Should be v24.0.0 or higher
```

---

## ⚙️ Configuration

### Frontend Configuration (Frontend Directory)

Create a `.env.local` file in the frontend root:

```env
REACT_APP_API_URL=http://localhost:5000
REACT_APP_SOCKET_URL=http://localhost:5000
REACT_APP_ENV=development
```

### Backend Configuration (Backend Directory)

Create a `.env` file in the backend root:

```env
# Server Configuration
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:3000

# Database
MONGO_URI=mongodb://localhost:27017/vstudy
# Or use MongoDB Atlas:
# MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/vstudy

# Redis (Optional)
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your_super_secret_jwt_key_here_min_32_chars
JWT_EXPIRE=7d
REFRESH_TOKEN_SECRET=your_refresh_secret_key_here
REFRESH_TOKEN_EXPIRE=30d

# Email Service (Nodemailer)
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-specific-password

# Google AI (Gemini API)
GOOGLE_API_KEY=your_google_genai_api_key

# File Upload
MAX_FILE_SIZE=52428800  # 50MB in bytes
UPLOAD_DIR=./uploads

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100

# Session Configuration
SESSION_COOKIE_SECURE=false  # Set to true in production with HTTPS
SESSION_COOKIE_HTTP_ONLY=true

# Logging
LOG_LEVEL=debug
```

### Environment-Specific Configs

**Production**:
```env
NODE_ENV=production
CLIENT_URL=https://yourdomain.com
SESSION_COOKIE_SECURE=true
JWT_EXPIRE=7d
```

**Testing**:
```env
NODE_ENV=test
MONGO_URI=mongodb://localhost:27017/vstudy-test
PORT=5001
```

---

## 🚀 Running the Application

### Development Mode

#### Option 1: Run Services Separately

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
# Backend will run on http://localhost:5000
```

**Terminal 2 - Frontend:**
```bash
npm start
# Frontend will run on http://localhost:3000
```

#### Option 2: Run Both Concurrently (if script exists)
```bash
npm run dev:all
```

### Production Mode

**Build Frontend:**
```bash
npm run build
# Creates optimized build in ./build directory
```

**Start Backend:**
```bash
cd backend
npm start
# Backend runs on configured PORT (default 5000)
```

**Access Application:**
- Open `http://localhost:3000` in your browser

---

## 📁 Project Structure

```
vstudy/
├── public/                    # Static assets
│   ├── index.html            # HTML template
│   ├── favicon.ico           # Favicon
│   ├── locales/              # i18n translation files
│   └── images/               # Static images
│
├── src/                       # Frontend React application
│   ├── components/           # Reusable React components
│   │   ├── layout/          # Layout components (Header, Footer, etc.)
│   │   ├── common/          # Shared UI components
│   │   ├── accessibility/   # A11y components (ARIA, screen reader support)
│   │   └── ...
│   ├── pages/               # Page components (routing destinations)
│   │   ├── public/          # Public pages (Home, About, Features)
│   │   ├── auth/            # Authentication pages (Login, Register)
│   │   └── Dashboard/       # Dashboard and study group pages
│   ├── features/            # Redux slices and feature-specific logic
│   ├── hooks/               # Custom React hooks
│   ├── contexts/            # React Context for state management
│   │   ├── AuthContext.js
│   │   ├── ThemeContext.js
│   │   └── ...
│   ├── services/            # API service calls (Axios)
│   ├── utils/               # Utility functions
│   ├── styles/              # Global styles and theme configuration
│   ├── config/              # Configuration files
│   ├── i18n/                # i18n configuration
│   ├── assets/              # Images, icons, fonts
│   ├── App.js               # Main App component
│   ├── index.js             # React entry point
│   └── store.js             # Redux store configuration
│
├── backend/                  # Node.js/Express backend
│   ├── config/              # Configuration files
│   │   ├── redis.js         # Redis configuration
│   │   ├── database.js      # MongoDB connection
│   │   └── ...
│   ├── models/              # Mongoose schemas
│   │   ├── User.js
│   │   ├── Group.js
│   │   ├── Message.js
│   │   └── ...
│   ├── routes/              # Express route handlers
│   │   ├── auth.js          # Authentication routes
│   │   ├── group.js         # Group management routes
│   │   ├── message.js       # Messaging routes
│   │   ├── video.js         # Video session routes
│   │   └── ...
│   ├── middleware/          # Express middleware
│   │   ├── auth.js          # JWT verification
│   │   ├── errorHandler.js  # Error handling
│   │   └── ...
│   ├── services/            # Business logic layer
│   │   ├── groupService.js
│   │   ├── messageService.js
│   │   └── ...
│   ├── sockets/             # Socket.IO event handlers
│   │   ├── groupSocket.js
│   │   ├── messageSocket.js
│   │   └── ...
│   ├── utils/               # Utility functions
│   ├── migrations/          # Database migrations
│   ├── logs/                # Application logs
│   ├── uploads/             # File uploads directory
│   ├── server.js            # Express app initialization
│   ├── package.json
│   └── .env                 # Environment variables
│
├── build/                   # Production build output (generated)
├── node_modules/            # Dependencies (generated)
├── .git/                    # Git repository
├── .gitignore               # Git ignore rules
├── package.json             # Root package configuration
├── README.md                # This file
└── .env                     # Root environment variables
```

---

## 🔌 Core Modules

### Authentication Module (`backend/routes/auth.js`)
- User registration with email verification
- Login with JWT token generation
- Password reset functionality
- Token refresh mechanism
- OAuth integration ready

### Group Management (`backend/routes/group.js`)
- Create and manage study groups
- Member invitation and management
- Group settings and customization
- Access control and permissions
- Group analytics

### Real-Time Messaging (`backend/routes/message.js`)
- Instant messaging between group members
- Message history and pagination
- Emoji and rich text support
- Message editing and deletion
- Read receipts and typing indicators

### Video Sessions (`backend/routes/videosession.js`)
- Real-time video conferencing
- Screen sharing capabilities
- Recording sessions
- Meeting scheduling
- WebRTC integration

### Document Collaboration (`backend/routes/documentCollab.js`)
- Real-time collaborative editing
- Document version history
- Change tracking
- Conflict resolution

### Whiteboard (`backend/routes/whiteboard.js`)
- Real-time drawing and sketching
- Shape tools and annotations
- Color and brush customization
- Clear and undo/redo functionality

### File Management (`backend/routes/fileUpload.js`)
- Secure file upload with Multer
- File validation and scanning
- Download and preview
- Storage management

### Analytics (`backend/routes/groupAnalytics.js`)
- Group activity tracking
- User engagement metrics
- Performance statistics
- Report generation

### AI Integration (`backend/routes/ai.js`)
- Google Gemini AI integration
- Smart suggestions and content enhancement
- Automated summaries
- Q&A assistance

---

## 📡 API Documentation

### Base URL
- Development: `http://localhost:5000/api`
- Production: `https://yourdomain.com/api`

### Authentication Endpoints

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "firstName": "John",
  "lastName": "Doe"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}

Response:
{
  "token": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": { ... }
}
```

#### Refresh Token
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGc..."
}
```

### Group Endpoints

#### Get All Groups
```http
GET /api/groups
Authorization: Bearer <token>
```

#### Create Group
```http
POST /api/groups
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Advanced Calculus Study Group",
  "description": "Group for advanced calculus students",
  "subject": "Mathematics"
}
```

#### Get Group Details
```http
GET /api/groups/:groupId
Authorization: Bearer <token>
```

#### Update Group
```http
PUT /api/groups/:groupId
Authorization: Bearer <token>
Content-Type: application/json
```

#### Delete Group
```http
DELETE /api/groups/:groupId
Authorization: Bearer <token>
```

### Message Endpoints

#### Get Messages
```http
GET /api/messages/:groupId?limit=50&page=1
Authorization: Bearer <token>
```

#### Send Message
```http
POST /api/messages/:groupId
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "This is a message",
  "type": "text"
}
```

#### Edit Message
```http
PUT /api/messages/:messageId
Authorization: Bearer <token>
```

#### Delete Message
```http
DELETE /api/messages/:messageId
Authorization: Bearer <token>
```

### File Upload Endpoints

#### Upload File
```http
POST /api/files/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

Body: {
  "file": <binary file data>,
  "groupId": "groupId123"
}
```

#### Get File
```http
GET /api/files/:fileId
Authorization: Bearer <token>
```

#### Delete File
```http
DELETE /api/files/:fileId
Authorization: Bearer <token>
```

### For Complete API Documentation
See `backend/routes/` directory for all available endpoints and their parameters.

---

## 🗄️ Database Schema

### Key Collections

#### Users Collection
```javascript
{
  _id: ObjectId,
  email: String (unique),
  firstName: String,
  lastName: String,
  password: String (hashed),
  avatar: String,
  bio: String,
  role: String (user/admin/moderator),
  groups: [ObjectId],
  preferences: Object,
  createdAt: Date,
  updatedAt: Date
}
```

#### Groups Collection
```javascript
{
  _id: ObjectId,
  name: String,
  description: String,
  subject: String,
  image: String,
  owner: ObjectId,
  members: [ObjectId],
  moderators: [ObjectId],
  settings: Object,
  privacy: String (public/private),
  createdAt: Date,
  updatedAt: Date
}
```

#### Messages Collection
```javascript
{
  _id: ObjectId,
  groupId: ObjectId,
  userId: ObjectId,
  content: String,
  type: String (text/image/file/video),
  attachments: [String],
  reactions: [Object],
  readBy: [ObjectId],
  editedAt: Date,
  createdAt: Date
}
```

#### Tasks Collection
```javascript
{
  _id: ObjectId,
  groupId: ObjectId,
  title: String,
  description: String,
  assignedTo: [ObjectId],
  dueDate: Date,
  status: String (pending/in-progress/completed),
  priority: String (low/medium/high),
  createdBy: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```

#### Video Sessions Collection
```javascript
{
  _id: ObjectId,
  groupId: ObjectId,
  title: String,
  startTime: Date,
  endTime: Date,
  participants: [ObjectId],
  recordingUrl: String,
  status: String (scheduled/active/ended),
  createdAt: Date
}
```

---

## 🔄 Real-Time Features (Socket.IO)

### Connection Events
- `connect`: Client connects to server
- `disconnect`: Client disconnects
- `reconnect`: Client reconnects after disconnect

### Message Events
- `messageReceived`: New message in group
- `messageUpdated`: Message edited
- `messageDeleted`: Message removed
- `typingIndicator`: User is typing

### Group Events
- `memberJoined`: New member added to group
- `memberLeft`: Member left the group
- `memberUpdated`: Member information updated
- `groupUpdated`: Group settings changed

### Video Session Events
- `videoSessionStarted`: Video call initiated
- `userJoinedVideo`: User joined video call
- `userLeftVideo`: User left video call
- `screenShareStarted`: Screen sharing activated
- `screenShareEnded`: Screen sharing stopped

### Document Collaboration Events
- `documentUpdated`: Content changed
- `cursorMoved`: User cursor position
- `selectionChanged`: User selection changed
- `collaboratorJoined`: Collaborator joined document
- `collaboratorLeft`: Collaborator left document

### Whiteboard Events
- `drawingUpdated`: Drawing made on whiteboard
- `whiteboardCleared`: Whiteboard cleared
- `shapeAdded`: Shape tool used
- `colorChanged`: Brush color changed

---

## 🔐 Authentication

### Authentication Flow

1. **Registration**
   - User provides email and password
   - Email verification sent
   - User account created after verification

2. **Login**
   - User provides credentials
   - Server validates and issues JWT
   - Token stored in secure HTTP-only cookie

3. **Request Authentication**
   - Client includes JWT in Authorization header: `Bearer <token>`
   - Middleware verifies token validity
   - Request proceeds if valid, rejects if expired/invalid

4. **Token Refresh**
   - Access token expires after 7 days
   - Refresh token can be used to get new access token
   - Refresh token expires after 30 days

### Security Features
- Passwords hashed with bcryptjs (salt rounds: 10)
- JWT tokens with expiration
- Rate limiting on sensitive endpoints
- CORS configured for allowed origins
- Helmet.js for HTTP headers security
- XSS protection via sanitization
- CSRF tokens for state-changing requests

---

## 👨‍💻 Development

### Development Setup

1. **Install dependencies** (already done in Installation section)

2. **Set up MongoDB locally**
   ```bash
   # macOS (using Homebrew)
   brew services start mongodb-community
   
   # Windows (using WSL)
   wsl -- sudo systemctl start mongodb
   
   # Or use MongoDB Atlas (cloud)
   ```

3. **Start Redis (optional but recommended)**
   ```bash
   redis-server
   ```

4. **Run development servers**
   ```bash
   # Terminal 1: Backend
   cd backend && npm run dev
   
   # Terminal 2: Frontend
   npm start
   ```

5. **Access application**
   - Frontend: http://localhost:3000
   - Backend: http://localhost:5000
   - API: http://localhost:5000/api

### Development Tools

- **Nodemon**: Auto-restart backend on file changes (`npm run dev` in backend)
- **React Fast Refresh**: Auto-reload React components on changes
- **Redux DevTools**: Browser extension for Redux debugging
- **VS Code Extensions**: ESLint, Prettier, MongoDB for VS Code

### Code Style

- **ESLint**: Enforces consistent code style
- **Prettier**: Auto-formats code on save (if configured)
- **Git Hooks**: Pre-commit hooks for linting (if configured)

### Debugging

**Frontend**:
```bash
# Open Chrome DevTools (F12)
# Use React DevTools extension
# Use Redux DevTools extension
# Set breakpoints in Sources tab
```

**Backend**:
```bash
# Debug mode
node --inspect backend/server.js

# Then open chrome://inspect in Chrome
```

---

## 🧪 Testing

### Running Tests

**Backend Tests:**
```bash
cd backend

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage
```

**Frontend Tests:**
```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

### Test Structure

**Backend** (`backend/tests/`):
- Unit tests for models and services
- Integration tests for API endpoints
- Socket.IO event tests

**Frontend** (`src/__tests__/`):
- Component tests with React Testing Library
- Hook tests
- Utility function tests

### Writing Tests

**Example Backend Test:**
```javascript
describe('Auth API', () => {
  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });
    
    expect(res.status).toBe(201);
    expect(res.body.user).toHaveProperty('email');
  });
});
```

**Example Frontend Test:**
```javascript
import { render, screen } from '@testing-library/react';
import LoginPage from './LoginPage';

test('renders login form', () => {
  render(<LoginPage />);
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
});
```

---

## 🚢 Deployment

### Backend Deployment (Heroku, Railway, Render)

#### Prerequisites
- Git repository
- MongoDB Atlas account (cloud database)
- Redis Cloud account (optional)
- Environment variables configured

#### Deploy to Railway (Recommended)

1. Connect GitHub repository to Railway
2. Configure environment variables in Railway dashboard
3. Set start command: `npm start`
4. Deploy automatically on push

#### Deploy to Vercel (Frontend Only)

1. Push code to GitHub
2. Import project in Vercel
3. Set build command: `npm run build`
4. Set output directory: `build`
5. Add environment variables
6. Deploy

#### Deploy to Docker

**Dockerfile (Backend):**
```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

**Dockerfile (Frontend):**
```dockerfile
FROM node:24-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Docker Compose:**
```yaml
version: '3.8'
services:
  frontend:
    build: .
    ports:
      - "3000:3000"
  backend:
    build: ./backend
    ports:
      - "5000:5000"
    environment:
      - MONGO_URI=${MONGO_URI}
      - JWT_SECRET=${JWT_SECRET}
  mongodb:
    image: mongo:6
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  mongo_data:
```

### Environment Variables for Production

```env
NODE_ENV=production
PORT=5000
CLIENT_URL=https://yourdomain.com

# Database
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/vstudy

# Redis
REDIS_URL=redis://redistogo.com:12345

# Security
JWT_SECRET=long_random_secret_min_32_chars
JWT_EXPIRE=7d

# Email
EMAIL_SERVICE=SendGrid
SENDGRID_API_KEY=your_sendgrid_key

# Google AI
GOOGLE_API_KEY=your_api_key

# Logging
LOG_LEVEL=info
```

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong JWT secret
- [ ] Enable HTTPS/SSL
- [ ] Set secure cookies
- [ ] Configure rate limiting
- [ ] Set up error logging
- [ ] Configure backup strategy
- [ ] Set up monitoring and alerts
- [ ] Implement CI/CD pipeline
- [ ] Regular security audits
- [ ] Test disaster recovery

---

## 🤝 Contributing

We welcome contributions! Here's how to get started:

### Contributing Guidelines

1. **Fork the repository**
   ```bash
   git clone https://github.com/yourusername/vstudy.git
   ```

2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```

3. **Make your changes**
   - Follow existing code style
   - Add tests for new features
   - Update documentation

4. **Commit your changes**
   ```bash
   git commit -m "Add amazing feature"
   ```

5. **Push to your branch**
   ```bash
   git push origin feature/amazing-feature
   ```

6. **Open a Pull Request**
   - Describe your changes
   - Link related issues
   - Request review from maintainers

### Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- No harassment or discrimination
- Report violations to maintainers

### Development Standards

- **Naming**: camelCase for variables/functions, PascalCase for components
- **Comments**: Only for complex logic
- **Error Handling**: Try-catch for async operations
- **Logging**: Use appropriate log levels (debug, info, warn, error)
- **Testing**: Write tests for new features
- **Performance**: Consider performance implications
- **Security**: Follow security best practices

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### Third-Party Licenses

All dependencies used in this project are listed in respective `package.json` files. Each dependency maintains its own license. See `LICENSE` files in `node_modules` for specific third-party licenses.

---

## 📞 Support

### Getting Help

- **Documentation**: Check existing docs and guides
- **Issues**: Search existing GitHub issues before creating new ones
- **Discussions**: Use GitHub Discussions for questions
- **Email**: Contact support@vstudy.com
- **Discord/Slack**: Join our community server

### Reporting Issues

When reporting bugs, please include:

1. **Description**: Clear explanation of the issue
2. **Steps to Reproduce**: Detailed reproduction steps
3. **Expected Behavior**: What should happen
4. **Actual Behavior**: What actually happens
5. **Environment**: OS, Node version, browser, etc.
6. **Screenshots**: Visual representation if applicable
7. **Error Logs**: Relevant error messages or stack traces

### Feature Requests

To suggest new features:

1. Use GitHub Discussions
2. Clearly describe the use case
3. Explain the expected behavior
4. Provide mock-ups if applicable
5. Consider implementation complexity

---

## 🙏 Acknowledgments

- **Contributors**: Thanks to all contributors who have helped with this project
- **Community**: Appreciation for community feedback and suggestions
- **Libraries**: Gratitude to all open-source libraries we depend on
- **Users**: Thanks to all users testing and improving the platform

---

## 📊 Project Statistics

- **GitHub Stars**: ⭐ Star us if you find this helpful!
- **Active Contributors**: Growing team of developers
- **Lines of Code**: Frontend + Backend
- **Test Coverage**: Continuous improvement
- **Last Updated**: 2026

---

## 🔗 Useful Links

- **GitHub Repository**: https://github.com/yourusername/vstudy
- **Project Website**: https://vstudy.com
- **Documentation**: https://docs.vstudy.com
- **Community Forum**: https://forum.vstudy.com
- **Issue Tracker**: https://github.com/yourusername/vstudy/issues

---

## 📋 Changelog

### Latest Changes (v0.1.0)
- Initial project setup
- Core features implementation
- Real-time communication
- User authentication
- Study group management
- Document collaboration

For detailed changelog, see [CHANGELOG.md](CHANGELOG.md)

---

## 🎯 Roadmap

### Future Features
- [ ] Mobile app (React Native)
- [ ] Advanced scheduling system
- [ ] Marketplace for study materials
- [ ] Peer review system
- [ ] Gamification elements
- [ ] Video transcription
- [ ] Advanced analytics
- [ ] API for third-party integrations
- [ ] Plugin system
- [ ] Enterprise features

See [ROADMAP.md](ROADMAP.md) for detailed plans.

---

## 🌟 Show Your Support

If you found this project helpful:
- ⭐ Star this repository
- 🐛 Report bugs and suggest features
- 🔗 Share with friends and colleagues
- 💬 Participate in discussions
- 🤝 Contribute code improvements

---

## ©️ Copyright

Copyright © 2026 VStudy. All rights reserved.

---

**Happy studying! 📚**
