const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const dns = require("node:dns/promises");
dns.setDefaultResultOrder('ipv4first');
// Force public DNS servers (Google + Cloudflare)
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1']);

// Initialize Redis
const { initializeRedis, closeRedis } = require('./config/redis');

// Validate required environment variables
["MONGO_URI", "CLIENT_URL"].forEach((key) => {
  if (!process.env[key]) {
    console.warn(`⚠️ Missing required environment variable: ${key}`);
  }
});

const allowedOrigins = [
  process.env.CLIENT_URL || "http://localhost:3000",
  process.env.PRODUCTION_CLIENT_URL || "https://virtual-study-group-hazel.vercel.app"
].filter(Boolean);

// Create Express and HTTP server
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS settings
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  maxHttpBufferSize: 1e8,
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  connectTimeout: 45000
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.disable('x-powered-by'); // Don't leak Express version

// Security middleware
const { 
  addSecurityHeaders, 
  preventParameterPollution,
  detectSuspiciousRequests 
} = require('./middleware/securityMiddleware');
const { generalApiLimiter } = require('./middleware/rateLimitMiddleware');

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  exposedHeaders: ["Content-Disposition", "Authorization"],
};

// Apply CORS to all routes BEFORE rate limiting so error responses include CORS headers
app.use(cors(corsOptions));

// Handle preflight requests for all routes
app.options("*", cors(corsOptions));

// Apply security headers
app.use(addSecurityHeaders());

// Prevent parameter pollution
app.use(preventParameterPollution());

// Apply general rate limiting to all API routes
// Exempt public localization endpoints from rate limiting (called on every page load)
const { createRateLimiter } = require('./middleware/rateLimitMiddleware');
const localizationLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 500, // generous limit for public translation assets
  message: 'Too many translation requests, please try again later',
  useRedis: false // use memory store for simplicity
});

app.use('/api', (req, res, next) => {
  // Skip all rate limiting in development
  if (process.env.NODE_ENV !== 'production') return next();

  const exemptPaths = [
    '/settings/languages',
    '/settings/translations/',
  ];
  const isExempt = exemptPaths.some(p => req.path.startsWith(p));
  if (isExempt) return localizationLimiter(req, res, next);
  return generalApiLimiter(req, res, next);
});

// Detect suspicious requests
app.use('/api', detectSuspiciousRequests());

// Serve static files with proper headers
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    dotfiles: "allow",
    setHeaders: (res) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Cache-Control", "public, max-age=31536000");
      res.setHeader(
        "Access-Control-Expose-Headers",
        "Content-Length,Content-Type"
      );
    },
  })
);

app.set("io", io); // Make io accessible in routes if needed

// Route imports
const authRoutes = require("./routes/auth");
const groupRoutes = require("./routes/group");
const taskRoutes = require("./routes/task");
const messageRoutes = require("./routes/message");
const videosessionRoutes = require("./routes/videosession");
const settingsRoutes = require("./routes/settings");
const dashboardRoutes = require("./routes/dashboard");
const notificationRoutes = require("./routes/notification");
const searchRoutes = require("./routes/search");
const reportRoutes = require("./routes/report");
const notesRoutes = require("./routes/notes");
const documentCollabRoutes = require("./routes/documentCollab");
const whiteboardRoutes = require("./routes/whiteboard");
const mediaSessionRoutes = require("./routes/mediaSession");
const youtubeRoutes = require("./routes/youtube");
const aiRoutes = require("./routes/ai");
const groupEventsRoutes = require("./routes/groupEvents");
const groupAnalyticsRoutes = require("./routes/groupAnalytics");
const contentModerationRoutes = require("./routes/contentModeration");
const subGroupMessagesRoutes = require("./routes/subGroupMessages");
const crossGroupCollaborationRoutes = require("./routes/crossGroupCollaboration");
const deviceSyncRoutes = require("./routes/deviceSync");
const accessibilityRoutes = require("./routes/accessibility");
const videoAnnotationRoutes = require("./routes/videoAnnotation");
const mobileRoutes = require("./routes/mobile");
const monitoringRoutes = require("./routes/monitoring");
const debugRoutes = require("./routes/debug");

// Import middleware
const { 
  loadUserPreferences, 
  formatAccessibleResponse, 
  translateResponse, 
  formatLocaleData 
} = require('./middleware/userPreferencesMiddleware');

// Helper to skip middleware for localization endpoints (their responses must be plain JSON for i18n)
const skipForLocalization = (middleware) => (req, res, next) => {
  const localizationPaths = ['/settings/languages', '/settings/translations/'];
  if (localizationPaths.some(p => req.path.startsWith(p))) return next();
  return middleware(req, res, next);
};

// Apply user preferences middleware to API routes
app.use('/api', loadUserPreferences);
app.use('/api', skipForLocalization(formatAccessibleResponse));
app.use('/api', skipForLocalization(translateResponse));
app.use('/api', skipForLocalization(formatLocaleData));

// Use Routes
app.use("/api/auth", authRoutes);
app.use("/api/group", groupRoutes);
app.use("/api/task", taskRoutes);
app.use("/api/message", messageRoutes);
app.use("/api/videosession", videosessionRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/report", reportRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/document-collaboration", documentCollabRoutes);
app.use("/api/whiteboard", whiteboardRoutes);
app.use("/api/media-sessions", mediaSessionRoutes);
app.use("/api/youtube", youtubeRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/group-events", groupEventsRoutes);
app.use("/api/group-analytics", groupAnalyticsRoutes);
app.use("/api/content-moderation", contentModerationRoutes);
app.use("/api/subgroup-messages", subGroupMessagesRoutes);
app.use("/api/cross-group-collaboration", crossGroupCollaborationRoutes);
app.use("/api/device-sync", deviceSyncRoutes);
app.use("/api/accessibility", accessibilityRoutes);
app.use("/api/video-annotations", videoAnnotationRoutes);
app.use("/api/mobile", mobileRoutes);
app.use("/api/monitoring", monitoringRoutes);
app.use("/api/debug", debugRoutes);

// Root route for testing
app.get("/", (_req, res) => {
  res.send("Welcome to the Virtual Study Group API!");
});

// Health check endpoint
app.get("/api/health", async (req, res) => {
  const { isRedisConnected } = require('./config/redis');
  
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    redis: isRedisConnected() ? 'connected' : 'disconnected',
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  };

  const httpStatus = health.mongodb === 'connected' ? 200 : 503;
  res.status(httpStatus).json(health);
});

// Connect to MongoDB Atlas using the configured connection
const connectDB = require('./config/db');
connectDB();

// Setup custom socket handlers
const setupChatSockets = require("./sockets/chatsocket");
const setupVideoChatSockets = require("./sockets/Videochatsocket");
const setupNotificationSockets = require("./sockets/notificationSocket");
const setupDocumentCollabSockets = require("./sockets/documentCollabSocket");
const setupWhiteboardSockets = require("./sockets/whiteboardSocket");
const setupMediaSessionSockets = require("./sockets/mediaSessionSocket");
const setupSubGroupSockets = require("./sockets/subGroupSocket");

setupChatSockets(io);
setupVideoChatSockets(io);
const notificationNamespace = setupNotificationSockets(io);
const documentCollabNamespace = setupDocumentCollabSockets(io);
const whiteboardNamespace = setupWhiteboardSockets(io);
const mediaSessionNamespace = setupMediaSessionSockets(io);
const subGroupNamespace = setupSubGroupSockets(io);

// Make notification namespace available to routes
app.set("notificationNamespace", notificationNamespace);
app.set("documentCollabNamespace", documentCollabNamespace);
app.set("whiteboardNamespace", whiteboardNamespace);
app.set("mediaSessionNamespace", mediaSessionNamespace);
app.set("subGroupNamespace", subGroupNamespace);

// Initialize services
const reminderSchedulerService = require('./services/reminderSchedulerService');
const localizationService = require('./services/localizationService');
const deviceSyncService = require('./services/deviceSyncService');

// Start services after database connection
mongoose.connection.once('open', async () => {
  console.log('📊 Database connected, initializing services...');
  
  // Initialize Redis
  try {
    await initializeRedis();
  } catch (error) {
    console.error('❌ Failed to initialize Redis:', error.message);
  }
  
  // Initialize localization service
  try {
    localizationService.initialize().then(() => {
      console.log('✅ Localization service initialized');
    }).catch(error => {
      console.error('❌ Failed to initialize localization service:', error.message);
    });
  } catch (error) {
    console.error('❌ Failed to start localization service:', error.message);
  }
  
  // Initialize device sync service
  try {
    deviceSyncService.initialize();
    console.log('✅ Device sync service initialized');
  } catch (error) {
    console.error('❌ Failed to start device sync service:', error.message);
  }
  
  // Start the intelligent reminder scheduler
  try {
    reminderSchedulerService.start(io, notificationNamespace);
    console.log('✅ Intelligent reminder scheduler initialized');
  } catch (error) {
    console.error('❌ Failed to start reminder scheduler:', error.message);
  }
  
  // Start performance monitoring
  try {
    startResourceMonitoring(60000); // Sample every minute
    console.log('✅ Performance monitoring started');
  } catch (error) {
    console.error('❌ Failed to start performance monitoring:', error.message);
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server gracefully...');
  
  // Stop reminder scheduler
  try {
    reminderSchedulerService.stop();
    console.log('✅ Reminder scheduler stopped');
  } catch (error) {
    console.error('❌ Error stopping reminder scheduler:', error.message);
  }
  
  // Close Redis connection
  try {
    await closeRedis();
  } catch (error) {
    console.error('❌ Error closing Redis connection:', error.message);
  }
  
  // Close database connection
  try {
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error closing database connection:', error.message);
    process.exit(1);
  }
});

// Global error handler
const { errorHandlingMiddleware } = require('./middleware/../services/errorTrackingService');
const { performanceMonitoringMiddleware, startResourceMonitoring } = require('./services/performanceMonitoringService');
const { requestLoggingMiddleware } = require('./services/loggingService');

// Apply logging middleware
app.use(requestLoggingMiddleware());

// Apply performance monitoring middleware
app.use(performanceMonitoringMiddleware());

// Global error handler (must be after all routes)
app.use(errorHandlingMiddleware());

// Start server
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// Export app for testing
module.exports = app;
