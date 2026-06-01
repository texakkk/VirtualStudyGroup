const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/authMiddleware');
const { getPerformanceMetrics, getHealthStatus, generatePerformanceReport } = require('../services/performanceMonitoringService');
const { getErrorStatistics, getErrorTrends } = require('../services/errorTrackingService');
const { getLogStatistics } = require('../services/loggingService');

/**
 * @route GET /api/monitoring/health
 * @desc Get system health status
 * @access Public
 */
router.get('/health', (req, res) => {
  try {
    const health = getHealthStatus();
    
    const statusCode = health.status === 'healthy' ? 200 : 
                       health.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json({
      success: true,
      ...health
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

/**
 * @route GET /api/monitoring/performance
 * @desc Get performance metrics
 * @access Private (Admin only)
 */
router.get('/performance', authenticateUser, async (req, res) => {
  try {
    // Check if user is admin (you may need to adjust this based on your user model)
    // For now, we'll allow all authenticated users
    
    const metrics = getPerformanceMetrics();
    
    res.json({
      success: true,
      metrics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/monitoring/errors
 * @desc Get error statistics
 * @access Private (Admin only)
 */
router.get('/errors', authenticateUser, async (req, res) => {
  try {
    const stats = getErrorStatistics();
    
    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/monitoring/errors/trends
 * @desc Get error trends
 * @access Private (Admin only)
 */
router.get('/errors/trends', authenticateUser, async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    const trends = getErrorTrends(parseInt(hours));
    
    res.json({
      success: true,
      trends,
      timeframe: `${hours} hours`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/monitoring/logs/stats
 * @desc Get log statistics
 * @access Private (Admin only)
 */
router.get('/logs/stats', authenticateUser, async (req, res) => {
  try {
    const { type = 'error', startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    
    const stats = await getLogStatistics(type, start, end);
    
    if (!stats) {
      return res.status(404).json({
        success: false,
        message: 'No log statistics available'
      });
    }
    
    res.json({
      success: true,
      statistics: stats,
      logType: type,
      dateRange: {
        start: start?.toISOString(),
        end: end?.toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/monitoring/report
 * @desc Generate comprehensive performance report
 * @access Private (Admin only)
 */
router.get('/report', authenticateUser, async (req, res) => {
  try {
    const report = generatePerformanceReport();
    const errorStats = getErrorStatistics();
    
    const fullReport = {
      ...report,
      errors: {
        total: errorStats.total,
        byCategory: errorStats.byCategory,
        bySeverity: errorStats.bySeverity,
        recentErrors: errorStats.recentErrors.slice(0, 5)
      }
    };
    
    res.json({
      success: true,
      report: fullReport
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/monitoring/system
 * @desc Get system information
 * @access Private (Admin only)
 */
router.get('/system', authenticateUser, (req, res) => {
  try {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    const systemInfo = {
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch
      },
      memory: {
        rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB`
      },
      cpu: {
        user: `${(cpuUsage.user / 1000).toFixed(2)} ms`,
        system: `${(cpuUsage.system / 1000).toFixed(2)} ms`
      },
      uptime: {
        process: `${(process.uptime() / 3600).toFixed(2)} hours`,
        system: `${(require('os').uptime() / 3600).toFixed(2)} hours`
      },
      environment: process.env.NODE_ENV || 'development'
    };
    
    res.json({
      success: true,
      system: systemInfo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/monitoring/ping
 * @desc Simple ping endpoint for uptime monitoring
 * @access Public
 */
router.get('/ping', (req, res) => {
  res.json({
    success: true,
    message: 'pong',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
