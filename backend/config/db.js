// config/db.js
const mongoose = require('mongoose');

// Configure mongoose to properly serialize ObjectIds to strings
mongoose.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    // Convert _id to string
    if (ret._id) {
      ret._id = ret._id.toString();
    }
    // Convert any other ObjectId fields to strings
    Object.keys(ret).forEach(key => {
      if (ret[key] && ret[key]._bsontype === 'ObjectId') {
        ret[key] = ret[key].toString();
      }
    });
    return ret;
  }
});

mongoose.set('toObject', {
  virtuals: true,
  transform: function(doc, ret) {
    // Convert _id to string
    if (ret._id) {
      ret._id = ret._id.toString();
    }
    // Convert any other ObjectId fields to strings
    Object.keys(ret).forEach(key => {
      if (ret[key] && ret[key]._bsontype === 'ObjectId') {
        ret[key] = ret[key].toString();
      }
    });
    return ret;
  }
});

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      // Connection timeout settings - CRITICAL for preventing drops
      serverSelectionTimeoutMS: 30000, // 30 seconds to select a server
      connectTimeoutMS: 30000, // 30 seconds to establish initial connection
      socketTimeoutMS: 0, // Disable socket timeout (0 = infinite, prevents timeout during idle)
      
      // Connection pool settings - Keep connections alive
      maxPoolSize: 50, // Maximum number of connections in pool
      minPoolSize: 10, // Minimum connections to keep alive (increased from 5)
      maxIdleTimeMS: 300000, // 5 minutes before closing idle connections
      waitQueueTimeoutMS: 30000, // 30 seconds to wait for available connection
      
      // Heartbeat and monitoring - Detect connection issues early
      heartbeatFrequencyMS: 10000, // Check connection health every 10 seconds
      
      // Retry settings - Auto-retry failed operations
      retryWrites: true,
      retryReads: true,
      
      // Use IPv4 (more stable than IPv6 in many environments)
      family: 4,
      
      // Server API version for compatibility
      serverApi: {
        version: '1',
        strict: false,
        deprecationErrors: false,
      }
    });
    
    console.log("✅ MongoDB connected successfully!");

    // Handle connection events
    mongoose.connection.on('connected', () => {
      console.log('✅ Mongoose connected to MongoDB');
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected successfully');
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err.message);
    });

    mongoose.connection.on('close', () => {
      console.warn('⚠️  MongoDB connection closed');
    });
    
    // Monitor connection state periodically
    setInterval(() => {
      const state = mongoose.connection.readyState;
      const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
      if (state !== 1) { // Only log if not connected
        console.log(`📊 MongoDB connection state: ${states[state]}`);
      }
    }, 30000); // Check every 30 seconds
    
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
