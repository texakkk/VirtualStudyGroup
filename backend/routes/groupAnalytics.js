const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const GroupAnalytics = require("../models/GroupAnalytics");
const Group = require("../models/Group");
const GroupMember = require("../models/GroupMember");
const { authenticateUser } = require("../middleware/authMiddleware");

// Get group analytics overview
router.get("/:groupId", authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const { period = 'daily', startDate, endDate } = req.query;

    // Check if user has permission to access analytics
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    const hasPermission = await group.hasPermission(userId, 'accessAnalytics');
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to access group analytics",
      });
    }

    // Set default date range if not provided
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    // Get analytics data
    const analyticsData = await GroupAnalytics.getAnalyticsSummary(groupId, start, end, period);

    // Get current analytics or create if doesn't exist
    let currentAnalytics = await GroupAnalytics.updateGroupAnalytics(groupId, new Date(), period);
    
    // Calculate current group statistics
    const [totalMembers, activeMembers] = await Promise.all([
      GroupMember.countDocuments({ GroupMember_groupId: groupId }),
      GroupMember.countDocuments({ 
        GroupMember_groupId: groupId,
        GroupMember_status: 'active',
        GroupMember_lastActive: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      })
    ]);

    currentAnalytics.GroupAnalytics_memberStats.totalMembers = totalMembers;
    currentAnalytics.GroupAnalytics_memberStats.activeMembers = activeMembers;
    await currentAnalytics.save();

    // Calculate summary statistics
    const summary = {
      totalMembers,
      activeMembers,
      healthScore: currentAnalytics.calculateGroupHealthScore(),
      totalAnalyticsRecords: analyticsData.length,
      dateRange: { start, end },
      period
    };

    res.status(200).json({
      success: true,
      summary,
      analytics: analyticsData,
      current: currentAnalytics
    });
  } catch (error) {
    console.error("Error fetching group analytics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch group analytics",
    });
  }
});

// Get member participation analytics
router.get("/:groupId/participation", authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const { limit = 20, sortBy = 'participationScore' } = req.query;

    // Check permissions
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    const hasPermission = await group.hasPermission(userId, 'accessAnalytics');
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to access participation analytics",
      });
    }

    // Get current analytics
    const analytics = await GroupAnalytics.updateGroupAnalytics(groupId);
    
    // Get top participants
    const topParticipants = analytics.getTopParticipants(parseInt(limit));
    
    // Populate user details
    const populatedParticipants = await Promise.all(
      topParticipants.map(async (participant) => {
        const User = mongoose.model('User');
        const user = await User.findById(participant.userId).select('User_name User_email');
        return {
          ...participant.toObject(),
          user,
          engagementLevel: analytics.getMemberEngagementLevel(participant.userId)
        };
      })
    );

    // Calculate participation distribution
    const engagementLevels = {
      'very-active': 0,
      'active': 0,
      'moderate': 0,
      'low': 0,
      'inactive': 0
    };

    analytics.GroupAnalytics_participationByMember.forEach(member => {
      const level = analytics.getMemberEngagementLevel(member.userId);
      engagementLevels[level]++;
    });

    res.status(200).json({
      success: true,
      participants: populatedParticipants,
      engagementDistribution: engagementLevels,
      totalParticipants: analytics.GroupAnalytics_participationByMember.length
    });
  } catch (error) {
    console.error("Error fetching participation analytics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch participation analytics",
    });
  }
});

// Get activity trends
router.get("/:groupId/trends", authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const { period = 'daily', days = 30 } = req.query;

    // Check permissions
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    const hasPermission = await group.hasPermission(userId, 'accessAnalytics');
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to access analytics trends",
      });
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - parseInt(days) * 24 * 60 * 60 * 1000);

    // Get analytics data for the period
    const analyticsData = await GroupAnalytics.getAnalyticsSummary(groupId, startDate, endDate, period);

    // Process trends data
    const trends = {
      messages: analyticsData.map(a => ({
        date: a.GroupAnalytics_date,
        value: a.GroupAnalytics_activityStats.totalMessages
      })),
      files: analyticsData.map(a => ({
        date: a.GroupAnalytics_date,
        value: a.GroupAnalytics_activityStats.totalFiles
      })),
      tasks: analyticsData.map(a => ({
        date: a.GroupAnalytics_date,
        value: a.GroupAnalytics_activityStats.totalTasks
      })),
      events: analyticsData.map(a => ({
        date: a.GroupAnalytics_date,
        value: a.GroupAnalytics_activityStats.totalEvents
      })),
      activeMembers: analyticsData.map(a => ({
        date: a.GroupAnalytics_date,
        value: a.GroupAnalytics_memberStats.activeMembers
      }))
    };

    // Calculate growth rates
    const calculateGrowthRate = (data) => {
      if (data.length < 2) return 0;
      const latest = data[data.length - 1].value;
      const previous = data[data.length - 2].value;
      return previous === 0 ? 0 : ((latest - previous) / previous) * 100;
    };

    const growthRates = {
      messages: calculateGrowthRate(trends.messages),
      files: calculateGrowthRate(trends.files),
      tasks: calculateGrowthRate(trends.tasks),
      events: calculateGrowthRate(trends.events),
      activeMembers: calculateGrowthRate(trends.activeMembers)
    };

    res.status(200).json({
      success: true,
      trends,
      growthRates,
      period,
      dateRange: { startDate, endDate }
    });
  } catch (error) {
    console.error("Error fetching analytics trends:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch analytics trends",
    });
  }
});

// Update member activity (called by other services)
router.post("/:groupId/activity", authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { memberId, activityType, increment = 1 } = req.body;

    if (!memberId || !activityType) {
      return res.status(400).json({
        success: false,
        message: "Member ID and activity type are required",
      });
    }

    // Verify the member belongs to the group
    const membership = await GroupMember.findOne({
      GroupMember_groupId: groupId,
      GroupMember_userId: memberId,
    });

    if (!membership) {
      return res.status(400).json({
        success: false,
        message: "User is not a member of this group",
      });
    }

    // Get or create analytics record
    const analytics = await GroupAnalytics.updateGroupAnalytics(groupId);
    
    // Update member participation
    await analytics.updateMemberParticipation(memberId, activityType, increment);

    res.status(200).json({
      success: true,
      message: "Activity recorded successfully",
    });
  } catch (error) {
    console.error("Error recording activity:", error);
    res.status(500).json({
      success: false,
      message: "Failed to record activity",
    });
  }
});

// Get group health score
router.get("/:groupId/health", authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    // Check if user is a member
    const membership = await GroupMember.findOne({
      GroupMember_groupId: groupId,
      GroupMember_userId: userId,
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group",
      });
    }

    // Get current analytics
    const analytics = await GroupAnalytics.updateGroupAnalytics(groupId);
    
    const healthScore = analytics.calculateGroupHealthScore();
    
    // Determine health status
    let healthStatus;
    if (healthScore >= 80) healthStatus = 'excellent';
    else if (healthScore >= 60) healthStatus = 'good';
    else if (healthScore >= 40) healthStatus = 'fair';
    else if (healthScore >= 20) healthStatus = 'poor';
    else healthStatus = 'critical';

    // Get recommendations based on health score
    const recommendations = [];
    
    if (analytics.GroupAnalytics_activityStats.totalMessages < 10) {
      recommendations.push("Encourage more group discussions and communication");
    }
    
    if (analytics.GroupAnalytics_engagementStats.eventAttendanceRate < 50) {
      recommendations.push("Improve event planning and member engagement");
    }
    
    if (analytics.GroupAnalytics_engagementStats.taskCompletionRate < 70) {
      recommendations.push("Focus on task management and follow-up");
    }
    
    const activeRatio = analytics.GroupAnalytics_memberStats.activeMembers / 
                       analytics.GroupAnalytics_memberStats.totalMembers;
    if (activeRatio < 0.5) {
      recommendations.push("Increase member engagement and participation");
    }

    res.status(200).json({
      success: true,
      healthScore,
      healthStatus,
      recommendations,
      metrics: {
        memberStats: analytics.GroupAnalytics_memberStats,
        activityStats: analytics.GroupAnalytics_activityStats,
        engagementStats: analytics.GroupAnalytics_engagementStats
      }
    });
  } catch (error) {
    console.error("Error fetching group health:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch group health score",
    });
  }
});

// Export analytics data
router.get("/:groupId/export", authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const { format = 'json', startDate, endDate } = req.query;

    // Check permissions (admin only)
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    const isAdmin = await group.isAdmin(userId);
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Only group admins can export analytics data",
      });
    }

    // Set date range
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Get analytics data
    const analyticsData = await GroupAnalytics.getAnalyticsSummary(groupId, start, end, 'daily');

    if (format === 'csv') {
      // Convert to CSV format
      const csvHeaders = [
        'Date',
        'Total Members',
        'Active Members',
        'Messages',
        'Files',
        'Tasks',
        'Completed Tasks',
        'Events',
        'Attended Events',
        'Health Score'
      ];

      const csvRows = analyticsData.map(analytics => [
        analytics.GroupAnalytics_date.toISOString().split('T')[0],
        analytics.GroupAnalytics_memberStats.totalMembers,
        analytics.GroupAnalytics_memberStats.activeMembers,
        analytics.GroupAnalytics_activityStats.totalMessages,
        analytics.GroupAnalytics_activityStats.totalFiles,
        analytics.GroupAnalytics_activityStats.totalTasks,
        analytics.GroupAnalytics_activityStats.completedTasks,
        analytics.GroupAnalytics_activityStats.totalEvents,
        analytics.GroupAnalytics_activityStats.attendedEvents,
        analytics.calculateGroupHealthScore()
      ]);

      const csvContent = [csvHeaders, ...csvRows]
        .map(row => row.join(','))
        .join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="group-analytics-${groupId}.csv"`);
      res.send(csvContent);
    } else {
      // Return JSON format
      res.status(200).json({
        success: true,
        data: analyticsData,
        exportInfo: {
          groupId,
          dateRange: { start, end },
          recordCount: analyticsData.length,
          exportedAt: new Date()
        }
      });
    }
  } catch (error) {
    console.error("Error exporting analytics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export analytics data",
    });
  }
});

module.exports = router;