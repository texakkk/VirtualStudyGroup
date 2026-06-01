const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const ContentReport = require("../models/ContentReport");
const Group = require("../models/Group");
const GroupMember = require("../models/GroupMember");
const { authenticateUser } = require("../middleware/authMiddleware");

// Create a content report
router.post("/report", authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      groupId,
      contentType,
      contentId,
      contentOwnerId,
      reason,
      description,
      severity = 'medium',
      evidence = []
    } = req.body;

    // Validate required fields
    if (!groupId || !contentType || !contentId || !contentOwnerId || !reason || !description) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    // Check if user is a member of the group
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

    // Check if user is trying to report themselves
    if (userId.toString() === contentOwnerId.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot report your own content",
      });
    }

    // Check if user has already reported this content
    const existingReport = await ContentReport.findOne({
      ContentReport_groupId: groupId,
      ContentReport_reportedBy: userId,
      ContentReport_contentType: contentType,
      ContentReport_contentId: contentId,
      ContentReport_status: { $in: ['pending', 'under-review'] }
    });

    if (existingReport) {
      return res.status(400).json({
        success: false,
        message: "You have already reported this content",
      });
    }

    // Create the report
    const report = new ContentReport({
      ContentReport_groupId: groupId,
      ContentReport_reportedBy: userId,
      ContentReport_contentType: contentType,
      ContentReport_contentId: contentId,
      ContentReport_contentOwnerId: contentOwnerId,
      ContentReport_reason: reason,
      ContentReport_description: description,
      ContentReport_severity: severity,
      ContentReport_evidence: evidence
    });

    await report.save();

    // Check if this content has reached the report threshold
    const group = await Group.findById(groupId);
    const settings = await group.getSettings();
    const reportThreshold = settings.GroupSettings_moderation.reportThreshold;

    const totalReports = await ContentReport.countDocuments({
      ContentReport_contentType: contentType,
      ContentReport_contentId: contentId,
      ContentReport_status: { $in: ['pending', 'under-review'] }
    });

    // Auto-escalate if threshold is reached
    if (totalReports >= reportThreshold) {
      report.ContentReport_status = 'escalated';
      report.ContentReport_priority = Math.min(10, report.ContentReport_priority + 3);
      await report.save();
    }

    const populatedReport = await ContentReport.findById(report._id)
      .populate('ContentReport_reportedBy', 'User_name User_email')
      .populate('ContentReport_contentOwnerId', 'User_name User_email');

    res.status(201).json({
      success: true,
      message: "Content reported successfully",
      report: populatedReport,
      totalReports,
      thresholdReached: totalReports >= reportThreshold
    });
  } catch (error) {
    console.error("Error creating content report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create content report",
    });
  }
});

// Get reports for a group (moderators/admins only)
router.get("/:groupId/reports", authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const { 
      status = 'pending', 
      limit = 50, 
      page = 1,
      contentType,
      severity,
      sortBy = 'priority'
    } = req.query;

    // Check if user has moderation permissions
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    const hasPermission = await group.hasPermission(userId, 'moderateContent');
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to view reports",
      });
    }

    // Build query
    let query = { ContentReport_groupId: groupId };
    
    if (status !== 'all') {
      if (status === 'active') {
        query.ContentReport_status = { $in: ['pending', 'under-review'] };
      } else {
        query.ContentReport_status = status;
      }
    }
    
    if (contentType) {
      query.ContentReport_contentType = contentType;
    }
    
    if (severity) {
      query.ContentReport_severity = severity;
    }

    // Build sort criteria
    let sortCriteria = {};
    switch (sortBy) {
      case 'priority':
        sortCriteria = { ContentReport_priority: -1, ContentReport_createdAt: 1 };
        break;
      case 'date':
        sortCriteria = { ContentReport_createdAt: -1 };
        break;
      case 'severity':
        sortCriteria = { ContentReport_severity: -1, ContentReport_createdAt: 1 };
        break;
      default:
        sortCriteria = { ContentReport_priority: -1, ContentReport_createdAt: 1 };
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [reports, totalCount] = await Promise.all([
      ContentReport.find(query)
        .populate('ContentReport_reportedBy', 'User_name User_email')
        .populate('ContentReport_contentOwnerId', 'User_name User_email')
        .populate('ContentReport_moderatorActions.moderatorId', 'User_name User_email')
        .sort(sortCriteria)
        .skip(skip)
        .limit(parseInt(limit)),
      ContentReport.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      reports,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
    });
  }
});

// Get specific report details
router.get("/:groupId/reports/:reportId", authenticateUser, async (req, res) => {
  try {
    const { groupId, reportId } = req.params;
    const userId = req.user._id;

    // Check permissions
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    const hasPermission = await group.hasPermission(userId, 'moderateContent');
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to view this report",
      });
    }

    const report = await ContentReport.findOne({
      _id: reportId,
      ContentReport_groupId: groupId
    })
      .populate('ContentReport_reportedBy', 'User_name User_email')
      .populate('ContentReport_contentOwnerId', 'User_name User_email')
      .populate('ContentReport_moderatorActions.moderatorId', 'User_name User_email')
      .populate('ContentReport_resolution.resolvedBy', 'User_name User_email');

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    // Get related reports for the same content
    const relatedReports = await ContentReport.find({
      ContentReport_contentType: report.ContentReport_contentType,
      ContentReport_contentId: report.ContentReport_contentId,
      _id: { $ne: reportId }
    })
      .populate('ContentReport_reportedBy', 'User_name User_email')
      .sort({ ContentReport_createdAt: -1 });

    res.status(200).json({
      success: true,
      report,
      relatedReports,
      totalReportsForContent: relatedReports.length + 1
    });
  } catch (error) {
    console.error("Error fetching report details:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch report details",
    });
  }
});

// Take moderator action on a report
router.post("/:groupId/reports/:reportId/action", authenticateUser, async (req, res) => {
  try {
    const { groupId, reportId } = req.params;
    const userId = req.user._id;
    const { action, reason, notes, duration } = req.body;

    if (!action || !reason) {
      return res.status(400).json({
        success: false,
        message: "Action and reason are required",
      });
    }

    // Check permissions
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    const hasPermission = await group.hasPermission(userId, 'moderateContent');
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to take moderation actions",
      });
    }

    const report = await ContentReport.findOne({
      _id: reportId,
      ContentReport_groupId: groupId
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    // Add moderator action
    await report.addModeratorAction(userId, action, reason, notes, duration);

    // Handle specific actions
    switch (action) {
      case 'user-suspended':
        // Update user status in GroupMember
        await GroupMember.findOneAndUpdate(
          {
            GroupMember_groupId: groupId,
            GroupMember_userId: report.ContentReport_contentOwnerId
          },
          { GroupMember_status: 'suspended' }
        );
        break;
      
      case 'user-banned':
        // Remove user from group
        await GroupMember.findOneAndDelete({
          GroupMember_groupId: groupId,
          GroupMember_userId: report.ContentReport_contentOwnerId
        });
        break;
    }

    const updatedReport = await ContentReport.findById(reportId)
      .populate('ContentReport_reportedBy', 'User_name User_email')
      .populate('ContentReport_contentOwnerId', 'User_name User_email')
      .populate('ContentReport_moderatorActions.moderatorId', 'User_name User_email');

    res.status(200).json({
      success: true,
      message: "Moderator action taken successfully",
      report: updatedReport
    });
  } catch (error) {
    console.error("Error taking moderator action:", error);
    res.status(500).json({
      success: false,
      message: "Failed to take moderator action",
    });
  }
});

// Resolve a report
router.patch("/:groupId/reports/:reportId/resolve", authenticateUser, async (req, res) => {
  try {
    const { groupId, reportId } = req.params;
    const userId = req.user._id;
    const { resolutionNotes, finalAction } = req.body;

    if (!resolutionNotes || !finalAction) {
      return res.status(400).json({
        success: false,
        message: "Resolution notes and final action are required",
      });
    }

    // Check permissions
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    const hasPermission = await group.hasPermission(userId, 'moderateContent');
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to resolve reports",
      });
    }

    const report = await ContentReport.findOne({
      _id: reportId,
      ContentReport_groupId: groupId
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    await report.resolve(userId, resolutionNotes, finalAction);

    const resolvedReport = await ContentReport.findById(reportId)
      .populate('ContentReport_reportedBy', 'User_name User_email')
      .populate('ContentReport_contentOwnerId', 'User_name User_email')
      .populate('ContentReport_resolution.resolvedBy', 'User_name User_email');

    res.status(200).json({
      success: true,
      message: "Report resolved successfully",
      report: resolvedReport
    });
  } catch (error) {
    console.error("Error resolving report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to resolve report",
    });
  }
});

// Dismiss a report
router.patch("/:groupId/reports/:reportId/dismiss", authenticateUser, async (req, res) => {
  try {
    const { groupId, reportId } = req.params;
    const userId = req.user._id;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Dismissal reason is required",
      });
    }

    // Check permissions
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    const hasPermission = await group.hasPermission(userId, 'moderateContent');
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to dismiss reports",
      });
    }

    const report = await ContentReport.findOne({
      _id: reportId,
      ContentReport_groupId: groupId
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    await report.dismiss(userId, reason);

    const dismissedReport = await ContentReport.findById(reportId)
      .populate('ContentReport_reportedBy', 'User_name User_email')
      .populate('ContentReport_contentOwnerId', 'User_name User_email')
      .populate('ContentReport_resolution.resolvedBy', 'User_name User_email');

    res.status(200).json({
      success: true,
      message: "Report dismissed successfully",
      report: dismissedReport
    });
  } catch (error) {
    console.error("Error dismissing report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to dismiss report",
    });
  }
});

// Get moderation statistics
router.get("/:groupId/stats", authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const { startDate, endDate } = req.query;

    // Check permissions
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    const hasPermission = await group.hasPermission(userId, 'moderateContent');
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to view moderation statistics",
      });
    }

    // Set default date range (last 30 days)
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const stats = await ContentReport.getModerationStats(groupId, start, end);

    // Get additional statistics
    const [
      pendingReports,
      escalatedReports,
      topReporters,
      topReportedUsers
    ] = await Promise.all([
      ContentReport.countDocuments({
        ContentReport_groupId: groupId,
        ContentReport_status: 'pending'
      }),
      ContentReport.countDocuments({
        ContentReport_groupId: groupId,
        ContentReport_status: 'escalated'
      }),
      ContentReport.aggregate([
        { $match: { ContentReport_groupId: new mongoose.Types.ObjectId(groupId) } },
        { $group: { _id: '$ContentReport_reportedBy', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]),
      ContentReport.aggregate([
        { $match: { ContentReport_groupId: new mongoose.Types.ObjectId(groupId) } },
        { $group: { _id: '$ContentReport_contentOwnerId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ])
    ]);

    res.status(200).json({
      success: true,
      stats: {
        ...stats,
        pendingReports,
        escalatedReports,
        topReporters,
        topReportedUsers
      },
      dateRange: { start, end }
    });
  } catch (error) {
    console.error("Error fetching moderation stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch moderation statistics",
    });
  }
});

// Get user's report history
router.get("/user/:userId/reports", authenticateUser, async (req, res) => {
  try {
    const { userId: targetUserId } = req.params;
    const requestingUserId = req.user._id;
    const { asReporter = true, limit = 20 } = req.query;

    // Users can only view their own report history, unless they're a moderator
    if (requestingUserId.toString() !== targetUserId) {
      // Check if requesting user is a moderator in any shared groups
      const sharedGroups = await GroupMember.aggregate([
        { $match: { GroupMember_userId: new mongoose.Types.ObjectId(requestingUserId) } },
        { $lookup: {
          from: 'groupmembers',
          let: { groupId: '$GroupMember_groupId' },
          pipeline: [
            { $match: { 
              $expr: { 
                $and: [
                  { $eq: ['$GroupMember_groupId', '$$groupId'] },
                  { $eq: ['$GroupMember_userId', new mongoose.Types.ObjectId(targetUserId)] }
                ]
              }
            }}
          ],
          as: 'targetUserMembership'
        }},
        { $match: { 
          'targetUserMembership': { $ne: [] },
          'GroupMember_role': { $in: ['admin', 'moderator'] }
        }}
      ]);

      if (sharedGroups.length === 0) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to view this user's report history",
        });
      }
    }

    const reports = await ContentReport.getUserReports(targetUserId, asReporter === 'true')
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      reports,
      asReporter: asReporter === 'true'
    });
  } catch (error) {
    console.error("Error fetching user report history:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user report history",
    });
  }
});

module.exports = router;
