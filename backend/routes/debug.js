const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { isRedisConnected } = require('../config/redis');

// Debug endpoint to check all connections
router.get('/status', async (req, res) => {
  try {
    const status = {
      timestamp: new Date().toISOString(),
      mongodb: {
        connected: mongoose.connection.readyState === 1,
        readyState: mongoose.connection.readyState,
        readyStateText: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState],
        host: mongoose.connection.host,
        name: mongoose.connection.name
      },
      redis: {
        connected: isRedisConnected()
      },
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform
      }
    };

    res.json(status);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});

// Test MongoDB query
router.get('/test-db', async (req, res) => {
  try {
    const User = require('../models/User');
    const count = await User.countDocuments();
    res.json({
      success: true,
      message: 'Database query successful',
      userCount: count
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

module.exports = router;
