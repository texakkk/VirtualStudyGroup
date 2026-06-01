const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/authMiddleware');
const User = require('../models/User');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const Task = require('../models/Task');
const Message = require('../models/Message');

// Unified search endpoint
router.get('/all', authenticateUser, async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    const userId = req.user._id;

    if (!q || q.trim().length === 0) {
      return res.json({ 
        success: true,
        results: [],
        total: 0,
        breakdown: {
          groups: 0,
          tasks: 0,
          users: 0,
          messages: 0
        }
      });
    }

    // Get user's groups for filtering
    const userGroups = await GroupMember.find({ 
      GroupMember_userId: userId 
    }).select('GroupMember_groupId');
    
    const groupIds = userGroups.map(member => member.GroupMember_groupId);

    // Search all data types in parallel
    const [groups, tasks, users, messages] = await Promise.allSettled([
      // Search Groups
      Group.find({
        _id: { $in: groupIds },
        $or: [
          { Group_name: { $regex: q, $options: 'i' } },
          { Group_description: { $regex: q, $options: 'i' } }
        ]
      })
      .limit(5)
      .populate('Group_createdBy', 'User_name')
      .sort({ Group_createdAt: -1 }),

      // Search Tasks
      Task.find({
        $and: [
          {
            $or: [
              { Task_assignedTo: userId },
              { Task_createdBy: userId }
            ]
          },
          {
            $or: [
              { Task_name: { $regex: q, $options: 'i' } },
              { Task_description: { $regex: q, $options: 'i' } }
            ]
          }
        ]
      })
      .limit(5)
      .populate('Task_assignedTo', 'User_name')
      .populate('Task_groupId', 'Group_name')
      .sort({ Task_createdAt: -1 }),

      // Search Users (in same groups)
      GroupMember.find({
        GroupMember_groupId: { $in: groupIds },
        GroupMember_userId: { $ne: userId }
      })
      .populate({
        path: 'GroupMember_userId',
        match: {
          $or: [
            { User_name: { $regex: q, $options: 'i' } },
            { User_email: { $regex: q, $options: 'i' } }
          ]
        },
        select: 'User_name User_email User_profilePicture User_role'
      })
      .limit(5),

      // Search Messages
      Message.find({
        Message_groupId: { $in: groupIds },
        Message_content: { $regex: q, $options: 'i' }
      })
      .limit(3)
      .populate('Message_sender', 'User_name')
      .populate('Message_groupId', 'Group_name')
      .sort({ Message_createdAt: -1 })
    ]);

    // Process results
    const allResults = [];

    // Process groups
    if (groups.status === 'fulfilled' && groups.value) {
      const groupResults = await Promise.all(
        groups.value.map(async (group) => {
          const memberCount = await GroupMember.countDocuments({
            GroupMember_groupId: group._id
          });
          return {
            type: 'group',
            id: group._id,
            name: group.Group_name,
            description: group.Group_description || `${memberCount} members`,
            createdBy: group.Group_createdBy?.User_name,
            memberCount,
            data: group
          };
        })
      );
      allResults.push(...groupResults);
    }

    // Process tasks
    if (tasks.status === 'fulfilled' && tasks.value) {
      const taskResults = tasks.value.map(task => ({
        type: 'task',
        id: task._id,
        name: task.Task_name,
        description: task.Task_description || `Due: ${new Date(task.Task_dueDate).toLocaleDateString()}`,
        assignedTo: task.Task_assignedTo?.User_name,
        groupName: task.Task_groupId?.Group_name,
        priority: task.Task_priority,
        status: task.Task_status,
        data: task
      }));
      allResults.push(...taskResults);
    }

    // Process users
    if (users.status === 'fulfilled' && users.value) {
      const userResults = users.value
        .filter(member => member.GroupMember_userId) // Filter out null populated results
        .map(member => ({
          type: 'user',
          id: member.GroupMember_userId._id,
          name: member.GroupMember_userId.User_name,
          description: member.GroupMember_userId.User_email,
          avatar: member.GroupMember_userId.User_profilePicture,
          role: member.GroupMember_userId.User_role,
          data: member.GroupMember_userId
        }));
      allResults.push(...userResults);
    }

    // Process messages
    if (messages.status === 'fulfilled' && messages.value) {
      const messageResults = messages.value.map(message => ({
        type: 'message',
        id: message._id,
        name: `Message from ${message.Message_sender?.User_name || 'Unknown'}`,
        description: message.Message_content?.substring(0, 100) + (message.Message_content?.length > 100 ? '...' : ''),
        senderName: message.Message_sender?.User_name,
        groupName: message.Message_groupId?.Group_name,
        createdAt: message.Message_createdAt,
        data: message
      }));
      allResults.push(...messageResults);
    }

    // Sort by relevance (exact matches first, then by creation date)
    const sortedResults = allResults.sort((a, b) => {
      const aExact = a.name.toLowerCase() === q.toLowerCase();
      const bExact = b.name.toLowerCase() === q.toLowerCase();
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      
      // Sort by creation date if available
      const aDate = a.data?.createdAt || a.data?.Task_createdAt || a.data?.Group_createdAt || a.data?.Message_createdAt;
      const bDate = b.data?.createdAt || b.data?.Task_createdAt || b.data?.Group_createdAt || b.data?.Message_createdAt;
      if (aDate && bDate) {
        return new Date(bDate) - new Date(aDate);
      }
      
      return 0;
    });

    // Apply overall limit
    const limitedResults = sortedResults.slice(0, parseInt(limit));

    // Calculate breakdown
    const breakdown = {
      groups: allResults.filter(r => r.type === 'group').length,
      tasks: allResults.filter(r => r.type === 'task').length,
      users: allResults.filter(r => r.type === 'user').length,
      messages: allResults.filter(r => r.type === 'message').length
    };

    res.json({
      success: true,
      results: limitedResults,
      total: allResults.length,
      breakdown,
      query: q
    });

  } catch (error) {
    console.error('Unified search error:', error);
    res.status(500).json({
      success: false,
      message: 'Error performing search',
      error: error.message
    });
  }
});

module.exports = router;