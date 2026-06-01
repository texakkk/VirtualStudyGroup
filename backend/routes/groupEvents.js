const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const GroupEvent = require("../models/GroupEvent");
const Group = require("../models/Group");
const GroupMember = require("../models/GroupMember");
const { authenticateUser } = require("../middleware/authMiddleware");

const serializeEventForUser = (event, userId) => {
  const eventObject = typeof event.toObject === 'function' ? event.toObject() : event;

  return {
    ...eventObject,
    userStatus: typeof event.getAttendeeStatus === 'function'
      ? event.getAttendeeStatus(userId)
      : eventObject.GroupEvent_attendees?.find(att => att.userId?.toString() === userId.toString())?.status || null,
    attendanceStats: typeof event.getAttendanceStats === 'function'
      ? event.getAttendanceStats()
      : null
  };
};

// Get all events for a group
router.get("/:groupId", authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const { startDate, endDate, type, status } = req.query;

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

    // Build query
    let query = { GroupEvent_groupId: groupId };
    
    if (type) {
      query.GroupEvent_type = type;
    }
    
    if (status) {
      query.GroupEvent_status = status;
    }

    let events;
    if (startDate && endDate) {
      events = await GroupEvent.findByDateRange(
        groupId,
        new Date(startDate),
        new Date(endDate)
      )
        .populate('GroupEvent_createdBy', 'User_name User_email')
        .populate('GroupEvent_attendees.userId', 'User_name User_email');
    } else {
      events = await GroupEvent.find(query)
        .populate('GroupEvent_createdBy', 'User_name User_email')
        .populate('GroupEvent_attendees.userId', 'User_name User_email')
        .sort({ GroupEvent_startDate: 1 });
    }

    // Filter events based on visibility
    const visibleEvents = events.filter(event => {
      if (event.GroupEvent_visibility === 'public') return true;
      if (event.GroupEvent_visibility === 'members-only') return true;
      if (event.GroupEvent_visibility === 'private') {
        return event.GroupEvent_createdBy._id.toString() === userId.toString() ||
               event.isAttending(userId);
      }
      return false;
    });

    res.status(200).json({
      success: true,
      events: visibleEvents.map(event => serializeEventForUser(event, userId)),
    });
  } catch (error) {
    console.error("Error fetching group events:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch group events",
    });
  }
});

// Get calendar summary for a group
router.get("/:groupId/summary", authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

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

    const now = new Date();
    const [totalEvents, upcomingEvents, activeMembers, attendanceAggregate] = await Promise.all([
      GroupEvent.countDocuments({ GroupEvent_groupId: groupId }),
      GroupEvent.countDocuments({
        GroupEvent_groupId: groupId,
        GroupEvent_startDate: { $gte: now },
        GroupEvent_status: { $ne: 'cancelled' }
      }),
      GroupMember.countDocuments({
        GroupMember_groupId: groupId,
        GroupMember_status: 'active'
      }),
      GroupEvent.aggregate([
        { $match: { GroupEvent_groupId: new mongoose.Types.ObjectId(groupId) } },
        { $unwind: { path: '$GroupEvent_attendees', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: null,
            totalResponses: { $sum: { $cond: ['$GroupEvent_attendees.status', 1, 0] } },
            acceptedResponses: {
              $sum: {
                $cond: [{ $in: ['$GroupEvent_attendees.status', ['accepted', 'attended']] }, 1, 0]
              }
            }
          }
        }
      ])
    ]);

    const attendance = attendanceAggregate[0] || { totalResponses: 0, acceptedResponses: 0 };
    const averageAttendance = attendance.totalResponses
      ? Math.round((attendance.acceptedResponses / attendance.totalResponses) * 100)
      : 0;

    res.status(200).json({
      success: true,
      analytics: {
        totalEvents,
        averageAttendance,
        upcomingEvents,
        activeMembers
      }
    });
  } catch (error) {
    console.error("Error fetching calendar summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch calendar summary",
    });
  }
});

// Create a new event
router.post("/:groupId", authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const eventData = req.body;

    // Check if user has permission to create events
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    const hasPermission = await group.hasPermission(userId, 'manageCalendar');
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to create events",
      });
    }

    // Validate required fields
    if (!eventData.title || !eventData.startDate) {
      return res.status(400).json({
        success: false,
        message: "Event title and start date are required",
      });
    }

    const start = new Date(eventData.startDate);
    const end = eventData.endDate
      ? new Date(eventData.endDate)
      : new Date(start.getTime() + 60 * 60 * 1000);
    const locationDetails = eventData.location?.details || eventData.location?.virtualLink || eventData.location?.address || '';

    const event = new GroupEvent({
      GroupEvent_groupId: groupId,
      GroupEvent_title: eventData.title,
      GroupEvent_description: eventData.description,
      GroupEvent_type: eventData.type || 'meeting',
      GroupEvent_startDate: start,
      GroupEvent_endDate: end,
      GroupEvent_timezone: eventData.timezone || 'UTC',
      GroupEvent_isAllDay: eventData.isAllDay || false,
      GroupEvent_location: {
        type: eventData.location?.type || 'virtual',
        details: locationDetails,
        virtualLink: eventData.location?.virtualLink || locationDetails,
        address: eventData.location?.address || locationDetails,
        platform: eventData.location?.platform || ''
      },
      GroupEvent_createdBy: userId,
      GroupEvent_recurrence: {
        isRecurring: Boolean(eventData.isRecurring || eventData.recurrence?.isRecurring),
        pattern: eventData.recurrence?.pattern || eventData.recurrence?.frequency || null,
        interval: eventData.recurrence?.interval || 1,
        endDate: eventData.recurrence?.endDate || null
      },
      GroupEvent_reminders: eventData.reminders || [],
      GroupEvent_visibility: eventData.visibility || 'members-only',
      GroupEvent_attendees: [{
        userId,
        status: 'accepted',
        respondedAt: new Date()
      }]
    });

    // Add other attendees if specified
    if (eventData.attendees && Array.isArray(eventData.attendees)) {
      for (const attendeeId of eventData.attendees) {
        // Verify attendee is a group member
        const isMember = await GroupMember.findOne({
          GroupMember_groupId: groupId,
          GroupMember_userId: attendeeId,
        });
        
        if (isMember) {
          event.GroupEvent_attendees.push({
            userId: attendeeId,
            status: 'invited'
          });
        }
      }
    }

    await event.save();

    const populatedEvent = await GroupEvent.findById(event._id)
      .populate('GroupEvent_createdBy', 'User_name User_email')
      .populate('GroupEvent_attendees.userId', 'User_name User_email');

    res.status(201).json({
      success: true,
      message: "Event created successfully",
      event: serializeEventForUser(populatedEvent, userId),
    });
  } catch (error) {
    console.error("Error creating event:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create event",
    });
  }
});

// Get specific event details
router.get("/:groupId/events/:eventId", authenticateUser, async (req, res) => {
  try {
    const { groupId, eventId } = req.params;
    const userId = req.user._id;

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

    const event = await GroupEvent.findOne({
      _id: eventId,
      GroupEvent_groupId: groupId,
    })
      .populate('GroupEvent_createdBy', 'User_name User_email')
      .populate('GroupEvent_attendees.userId', 'User_name User_email');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Check visibility permissions
    if (event.GroupEvent_visibility === 'private') {
      const canView = event.GroupEvent_createdBy._id.toString() === userId.toString() ||
                     event.isAttending(userId);
      
      if (!canView) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to view this event",
        });
      }
    }

    res.status(200).json({
      success: true,
      event,
      userStatus: event.getAttendeeStatus(userId),
      attendanceStats: event.getAttendanceStats(),
    });
  } catch (error) {
    console.error("Error fetching event:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch event",
    });
  }
});

// Update event
router.put("/:groupId/events/:eventId", authenticateUser, async (req, res) => {
  try {
    const { groupId, eventId } = req.params;
    const userId = req.user._id;
    const updateData = req.body;

    const event = await GroupEvent.findOne({
      _id: eventId,
      GroupEvent_groupId: groupId,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Check if user can edit this event
    const isCreator = event.GroupEvent_createdBy.toString() === userId.toString();
    const group = await Group.findById(groupId);
    const hasPermission = await group.hasPermission(userId, 'manageCalendar');

    if (!isCreator && !hasPermission) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to edit this event",
      });
    }

    // Update allowed fields
    const allowedFields = [
      'GroupEvent_title',
      'GroupEvent_description',
      'GroupEvent_type',
      'GroupEvent_startDate',
      'GroupEvent_endDate',
      'GroupEvent_timezone',
      'GroupEvent_isAllDay',
      'GroupEvent_location',
      'GroupEvent_recurrence',
      'GroupEvent_reminders',
      'GroupEvent_visibility'
    ];

    allowedFields.forEach(field => {
      const updateField = field.replace('GroupEvent_', '');
      if (updateData[updateField] !== undefined) {
        if (field.includes('Date')) {
          event[field] = new Date(updateData[updateField]);
        } else {
          event[field] = updateData[updateField];
        }
      }
    });

    await event.save();

    const updatedEvent = await GroupEvent.findById(event._id)
      .populate('GroupEvent_createdBy', 'User_name User_email')
      .populate('GroupEvent_attendees.userId', 'User_name User_email');

    res.status(200).json({
      success: true,
      message: "Event updated successfully",
      event: updatedEvent,
    });
  } catch (error) {
    console.error("Error updating event:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update event",
    });
  }
});

// Delete event
router.delete("/:groupId/events/:eventId", authenticateUser, async (req, res) => {
  try {
    const { groupId, eventId } = req.params;
    const userId = req.user._id;

    const event = await GroupEvent.findOne({
      _id: eventId,
      GroupEvent_groupId: groupId,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Check if user can delete this event
    const isCreator = event.GroupEvent_createdBy.toString() === userId.toString();
    const group = await Group.findById(groupId);
    const hasPermission = await group.hasPermission(userId, 'manageCalendar');

    if (!isCreator && !hasPermission) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to delete this event",
      });
    }

    await GroupEvent.findByIdAndDelete(eventId);

    res.status(200).json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting event:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete event",
    });
  }
});

// Update attendance status
router.patch("/:groupId/events/:eventId/attendance", authenticateUser, async (req, res) => {
  try {
    const { groupId, eventId } = req.params;
    const userId = req.user._id;
    const { status } = req.body;

    if (!['accepted', 'declined', 'maybe'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid attendance status",
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

    const event = await GroupEvent.findOne({
      _id: eventId,
      GroupEvent_groupId: groupId,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    await event.updateAttendeeStatus(userId, status);

    res.status(200).json({
      success: true,
      message: `Attendance status updated to ${status}`,
      attendanceStats: event.getAttendanceStats(),
    });
  } catch (error) {
    console.error("Error updating attendance:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update attendance",
    });
  }
});

// Add attendees to event
router.post("/:groupId/events/:eventId/attendees", authenticateUser, async (req, res) => {
  try {
    const { groupId, eventId } = req.params;
    const userId = req.user._id;
    const { attendeeIds } = req.body;

    if (!Array.isArray(attendeeIds) || attendeeIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Attendee IDs array is required",
      });
    }

    const event = await GroupEvent.findOne({
      _id: eventId,
      GroupEvent_groupId: groupId,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Check if user can manage attendees
    const isCreator = event.GroupEvent_createdBy.toString() === userId.toString();
    const group = await Group.findById(groupId);
    const hasPermission = await group.hasPermission(userId, 'manageCalendar');

    if (!isCreator && !hasPermission) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to manage event attendees",
      });
    }

    // Add attendees (only if they are group members)
    const addedAttendees = [];
    for (const attendeeId of attendeeIds) {
      const isMember = await GroupMember.findOne({
        GroupMember_groupId: groupId,
        GroupMember_userId: attendeeId,
      });
      
      if (isMember) {
        await event.addAttendee(attendeeId, 'invited');
        addedAttendees.push(attendeeId);
      }
    }

    res.status(200).json({
      success: true,
      message: `${addedAttendees.length} attendees added successfully`,
      addedCount: addedAttendees.length,
      attendanceStats: event.getAttendanceStats(),
    });
  } catch (error) {
    console.error("Error adding attendees:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add attendees",
    });
  }
});

// Remove attendee from event
router.delete("/:groupId/events/:eventId/attendees/:attendeeId", authenticateUser, async (req, res) => {
  try {
    const { groupId, eventId, attendeeId } = req.params;
    const userId = req.user._id;

    const event = await GroupEvent.findOne({
      _id: eventId,
      GroupEvent_groupId: groupId,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Check if user can remove attendees (creator, admin, or removing themselves)
    const isCreator = event.GroupEvent_createdBy.toString() === userId.toString();
    const group = await Group.findById(groupId);
    const hasPermission = await group.hasPermission(userId, 'manageCalendar');
    const isSelf = userId.toString() === attendeeId;

    if (!isCreator && !hasPermission && !isSelf) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to remove this attendee",
      });
    }

    await event.removeAttendee(attendeeId);

    res.status(200).json({
      success: true,
      message: "Attendee removed successfully",
      attendanceStats: event.getAttendanceStats(),
    });
  } catch (error) {
    console.error("Error removing attendee:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove attendee",
    });
  }
});

module.exports = router;
