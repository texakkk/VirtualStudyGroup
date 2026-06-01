const Group = require('../models/Group');
const Message = require('../models/Message');
const Task = require('../models/Task');
const Note = require('../models/Note');
const User = require('../models/User');
const GroupMember = require('../models/GroupMember');
const aiService = require('./aiService');

class GroupInsightsService {
  constructor() {
    this.analysisCache = new Map();
    this.cacheTimeout = 15 * 60 * 1000; // 15 minutes
  }

  /**
   * Generate comprehensive group collaboration analysis
   * @param {string} groupId - Group ID
   * @param {string} requestingUserId - User requesting the analysis
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Comprehensive group insights
   */
  async generateGroupInsights(groupId, requestingUserId, options = {}) {
    try {
      const {
        timeframe = 30, // days
        includeProductivitySuggestions = true,
        includeTaskSuggestions = true,
        includeCollaborationAnalysis = true
      } = options;

      // Check cache first
      const cacheKey = `${groupId}_${timeframe}_${Date.now() - (Date.now() % this.cacheTimeout)}`;
      if (this.analysisCache.has(cacheKey)) {
        return this.analysisCache.get(cacheKey);
      }

      // Verify user access to group
      await this._verifyGroupAccess(groupId, requestingUserId);

      // Gather comprehensive group data
      const groupData = await this._gatherGroupData(groupId, timeframe);

      // Perform different types of analysis
      const insights = {
        collaborationAnalysis: includeCollaborationAnalysis ? 
          await this._analyzeCollaboration(groupData) : null,
        productivitySuggestions: includeProductivitySuggestions ? 
          await this._generateProductivitySuggestions(groupData) : null,
        taskSuggestions: includeTaskSuggestions ? 
          await this._generateTaskSuggestions(groupData) : null,
        groupMetrics: this._calculateGroupMetrics(groupData),
        trends: this._analyzeTrends(groupData),
        memberEngagement: this._analyzeEngagement(groupData),
        aiRecommendations: null // Will be populated below
      };

      // Generate AI-powered recommendations
      if (includeCollaborationAnalysis || includeProductivitySuggestions) {
        const userPreferences = await aiService.getUserPreferences(requestingUserId);
        insights.aiRecommendations = await this._generateAIRecommendations(
          groupData, 
          insights, 
          userPreferences
        );
      }

      // Cache the results
      this.analysisCache.set(cacheKey, insights);
      
      // Clean up old cache entries
      this._cleanupCache();

      return insights;

    } catch (error) {
      console.error('Group insights generation error:', error);
      throw error;
    }
  }

  /**
   * Analyze group collaboration patterns and effectiveness
   * @param {Object} groupData - Comprehensive group data
   * @returns {Promise<Object>} Collaboration analysis
   */
  async _analyzeCollaboration(groupData) {
    const analysis = {
      communicationPatterns: this._analyzeCommunicationPatterns(groupData),
      collaborationEffectiveness: this._assessCollaborationEffectiveness(groupData),
      knowledgeSharing: this._analyzeKnowledgeSharing(groupData),
      participationBalance: this._analyzeParticipationBalance(groupData),
      conflictIndicators: this._detectConflictIndicators(groupData),
      strengths: [],
      improvements: []
    };

    // Identify collaboration strengths
    if (analysis.communicationPatterns.averageResponseTime < 2) {
      analysis.strengths.push('Quick response times indicate active engagement');
    }
    
    if (analysis.knowledgeSharing.notesSharingRate > 0.7) {
      analysis.strengths.push('High rate of knowledge sharing through notes');
    }

    if (analysis.participationBalance.giniCoefficient < 0.3) {
      analysis.strengths.push('Well-balanced participation across members');
    }

    // Identify areas for improvement
    if (analysis.communicationPatterns.averageResponseTime > 6) {
      analysis.improvements.push('Consider establishing communication expectations for response times');
    }

    if (analysis.participationBalance.giniCoefficient > 0.6) {
      analysis.improvements.push('Some members are significantly more active - encourage broader participation');
    }

    if (analysis.collaborationEffectiveness.taskCompletionRate < 0.6) {
      analysis.improvements.push('Focus on improving task completion rates through better coordination');
    }

    return analysis;
  }

  /**
   * Generate productivity suggestions based on group activity
   * @param {Object} groupData - Comprehensive group data
   * @returns {Promise<Object>} Productivity suggestions
   */
  async _generateProductivitySuggestions(groupData) {
    const suggestions = {
      timeManagement: [],
      workflowOptimization: [],
      toolRecommendations: [],
      meetingOptimization: [],
      focusAreas: []
    };

    // Analyze activity patterns for time management suggestions
    const activityPatterns = this._analyzeActivityPatterns(groupData);
    
    if (activityPatterns.peakHours.length > 0) {
      suggestions.timeManagement.push({
        type: 'peak_hours',
        title: 'Optimize Meeting Times',
        description: `Schedule important discussions during peak activity hours: ${activityPatterns.peakHours.join(', ')}`,
        priority: 'high',
        impact: 'medium'
      });
    }

    if (activityPatterns.lowActivityPeriods.length > 0) {
      suggestions.timeManagement.push({
        type: 'low_activity',
        title: 'Individual Work Time',
        description: `Use low-activity periods (${activityPatterns.lowActivityPeriods.join(', ')}) for individual focused work`,
        priority: 'medium',
        impact: 'medium'
      });
    }

    // Workflow optimization suggestions
    const taskPatterns = this._analyzeTaskPatterns(groupData);
    
    if (taskPatterns.averageCompletionTime > 7) {
      suggestions.workflowOptimization.push({
        type: 'task_breakdown',
        title: 'Break Down Large Tasks',
        description: 'Tasks are taking longer than a week on average. Consider breaking them into smaller, manageable chunks',
        priority: 'high',
        impact: 'high'
      });
    }

    if (taskPatterns.overdueRate > 0.3) {
      suggestions.workflowOptimization.push({
        type: 'deadline_management',
        title: 'Improve Deadline Management',
        description: 'High overdue rate detected. Implement regular check-ins and deadline reminders',
        priority: 'high',
        impact: 'high'
      });
    }

    // Tool recommendations based on usage patterns
    const toolUsage = this._analyzeToolUsage(groupData);
    
    if (toolUsage.notesUsage < 0.3) {
      suggestions.toolRecommendations.push({
        type: 'notes_adoption',
        title: 'Increase Notes Usage',
        description: 'Low notes usage detected. Encourage documentation and knowledge sharing through notes',
        priority: 'medium',
        impact: 'medium'
      });
    }

    if (toolUsage.fileSharing < 0.2) {
      suggestions.toolRecommendations.push({
        type: 'file_sharing',
        title: 'Improve File Sharing',
        description: 'Limited file sharing observed. Centralize resources for better collaboration',
        priority: 'medium',
        impact: 'medium'
      });
    }

    // Focus areas based on current challenges
    const challenges = this._identifyGroupChallenges(groupData);
    suggestions.focusAreas = challenges.map(challenge => ({
      type: 'focus_area',
      title: challenge.title,
      description: challenge.description,
      priority: challenge.priority,
      impact: challenge.impact,
      actionItems: challenge.actionItems
    }));

    return suggestions;
  }

  /**
   * Generate automated task suggestions based on group discussions
   * @param {Object} groupData - Comprehensive group data
   * @returns {Promise<Object>} Task suggestions
   */
  async _generateTaskSuggestions(groupData) {
    const suggestions = {
      fromDiscussions: [],
      followUpTasks: [],
      maintenanceTasks: [],
      collaborativeTasks: []
    };

    // Analyze recent messages for task-related keywords and patterns
    const discussionAnalysis = this._analyzeDiscussionsForTasks(groupData.messages);
    
    // Generate suggestions from discussions
    suggestions.fromDiscussions = discussionAnalysis.taskKeywords.map(keyword => ({
      type: 'discussion_based',
      title: `Follow up on ${keyword.topic}`,
      description: `Based on recent discussions about "${keyword.topic}", consider creating a task to address this topic`,
      suggestedAssignees: keyword.activeParticipants,
      priority: keyword.urgency > 0.7 ? 'high' : keyword.urgency > 0.4 ? 'medium' : 'low',
      confidence: keyword.confidence,
      relatedMessages: keyword.messageIds,
      estimatedEffort: this._estimateTaskEffort(keyword.topic, keyword.context)
    }));

    // Generate follow-up tasks based on completed tasks
    const completedTasks = groupData.tasks.filter(task => task.Task_status === 'completed');
    suggestions.followUpTasks = completedTasks
      .filter(task => this._needsFollowUp(task))
      .map(task => ({
        type: 'follow_up',
        title: `Review results of: ${task.Task_name}`,
        description: `Follow up on the completed task "${task.Task_name}" to ensure objectives were met`,
        suggestedAssignees: task.Task_assignedTo,
        priority: 'medium',
        parentTaskId: task._id,
        estimatedEffort: 'low'
      }));

    // Generate maintenance tasks
    suggestions.maintenanceTasks = this._generateMaintenanceTasks(groupData);

    // Generate collaborative tasks based on member expertise
    suggestions.collaborativeTasks = this._generateCollaborativeTasks(groupData);

    return suggestions;
  }

  /**
   * Gather comprehensive group data for analysis
   * @param {string} groupId - Group ID
   * @param {number} timeframeDays - Number of days to analyze
   * @returns {Promise<Object>} Comprehensive group data
   */
  async _gatherGroupData(groupId, timeframeDays) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeframeDays);

    const [group, members, messages, tasks, notes] = await Promise.all([
      Group.findById(groupId),
      GroupMember.find({ GroupMember_groupId: groupId })
        .populate('GroupMember_userId', 'User_name User_email User_createdAt'),
      Message.find({
        Message_groupId: groupId,
        Message_createdAt: { $gte: startDate }
      }).populate('Message_sender', 'User_name').sort({ Message_createdAt: -1 }),
      Task.find({
        Task_groupId: groupId,
        Task_createdAt: { $gte: startDate }
      }).populate('Task_assignedTo Task_createdBy', 'User_name'),
      Note.find({
        Note_groupId: groupId,
        Note_createdAt: { $gte: startDate }
      }).populate('Note_createdBy Note_collaborators', 'User_name')
    ]);

    return {
      group,
      members,
      messages,
      tasks,
      notes,
      timeframe: timeframeDays,
      analysisDate: new Date()
    };
  }

  /**
   * Verify user has access to the group
   * @param {string} groupId - Group ID
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async _verifyGroupAccess(groupId, userId) {
    const member = await GroupMember.findOne({
      GroupMember_groupId: groupId,
      GroupMember_userId: userId
    });

    if (!member) {
      throw new Error('Access denied. User is not a member of this group.');
    }
  }

  /**
   * Analyze communication patterns within the group
   * @param {Object} groupData - Group data
   * @returns {Object} Communication patterns analysis
   */
  _analyzeCommunicationPatterns(groupData) {
    const messages = groupData.messages;
    
    if (messages.length === 0) {
      return {
        averageResponseTime: 0,
        messageFrequency: 0,
        conversationThreads: 0,
        activeHours: []
      };
    }

    // Calculate average response time (simplified)
    let totalResponseTime = 0;
    let responseCount = 0;
    
    for (let i = 1; i < messages.length; i++) {
      const timeDiff = new Date(messages[i-1].Message_createdAt) - new Date(messages[i].Message_createdAt);
      if (timeDiff > 0 && timeDiff < 24 * 60 * 60 * 1000) { // Within 24 hours
        totalResponseTime += timeDiff;
        responseCount++;
      }
    }

    const averageResponseTime = responseCount > 0 ? 
      (totalResponseTime / responseCount) / (1000 * 60 * 60) : 0; // Convert to hours

    // Analyze message frequency
    const messageFrequency = messages.length / groupData.timeframe;

    // Analyze conversation threads (messages with replies)
    const conversationThreads = messages.filter(msg => msg.Message_replyTo).length;

    // Analyze active hours
    const hourCounts = new Array(24).fill(0);
    messages.forEach(msg => {
      const hour = new Date(msg.Message_createdAt).getHours();
      hourCounts[hour]++;
    });

    const activeHours = hourCounts
      .map((count, hour) => ({ hour, count }))
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(item => `${item.hour}:00`);

    return {
      averageResponseTime,
      messageFrequency,
      conversationThreads,
      activeHours
    };
  }

  /**
   * Assess collaboration effectiveness
   * @param {Object} groupData - Group data
   * @returns {Object} Collaboration effectiveness metrics
   */
  _assessCollaborationEffectiveness(groupData) {
    const tasks = groupData.tasks;
    const notes = groupData.notes;
    const members = groupData.members;

    const completedTasks = tasks.filter(task => task.Task_status === 'completed');
    const taskCompletionRate = tasks.length > 0 ? completedTasks.length / tasks.length : 0;

    const collaborativeNotes = notes.filter(note => note.Note_collaborators.length > 0);
    const collaborationRate = notes.length > 0 ? collaborativeNotes.length / notes.length : 0;

    const tasksWithMultipleAssignees = tasks.filter(task => task.Task_assignedTo.length > 1);
    const teamworkRate = tasks.length > 0 ? tasksWithMultipleAssignees.length / tasks.length : 0;

    return {
      taskCompletionRate,
      collaborationRate,
      teamworkRate,
      overallEffectiveness: (taskCompletionRate + collaborationRate + teamworkRate) / 3
    };
  }

  /**
   * Analyze knowledge sharing patterns
   * @param {Object} groupData - Group data
   * @returns {Object} Knowledge sharing analysis
   */
  _analyzeKnowledgeSharing(groupData) {
    const notes = groupData.notes;
    const messages = groupData.messages;
    const members = groupData.members;

    const notesPerMember = members.length > 0 ? notes.length / members.length : 0;
    const sharedNotes = notes.filter(note => 
      note.Note_isPublic || note.Note_collaborators.length > 0
    );
    const notesSharingRate = notes.length > 0 ? sharedNotes.length / notes.length : 0;

    // Analyze message content for knowledge sharing indicators
    const knowledgeKeywords = ['learn', 'explain', 'understand', 'help', 'share', 'teach'];
    const knowledgeSharingMessages = messages.filter(msg => 
      knowledgeKeywords.some(keyword => 
        msg.Message_content.toLowerCase().includes(keyword)
      )
    );
    const knowledgeSharingRate = messages.length > 0 ? 
      knowledgeSharingMessages.length / messages.length : 0;

    return {
      notesPerMember,
      notesSharingRate,
      knowledgeSharingRate,
      totalSharedResources: sharedNotes.length
    };
  }

  /**
   * Analyze participation balance among members
   * @param {Object} groupData - Group data
   * @returns {Object} Participation balance analysis
   */
  _analyzeParticipationBalance(groupData) {
    const messages = groupData.messages;
    const tasks = groupData.tasks;
    const members = groupData.members;

    // Calculate message distribution
    const messagesByMember = {};
    members.forEach(member => {
      messagesByMember[member.GroupMember_userId._id] = 0;
    });

    messages.forEach(msg => {
      if (messagesByMember.hasOwnProperty(msg.Message_sender._id)) {
        messagesByMember[msg.Message_sender._id]++;
      }
    });

    // Calculate Gini coefficient for participation inequality
    const messageCounts = Object.values(messagesByMember);
    const giniCoefficient = this._calculateGiniCoefficient(messageCounts);

    // Identify most and least active members
    const memberActivity = Object.entries(messagesByMember)
      .map(([userId, count]) => ({
        userId,
        messageCount: count,
        member: members.find(m => m.GroupMember_userId._id.toString() === userId)
      }))
      .sort((a, b) => b.messageCount - a.messageCount);

    return {
      giniCoefficient,
      mostActiveMembers: memberActivity.slice(0, 3),
      leastActiveMembers: memberActivity.slice(-3).reverse(),
      averageMessagesPerMember: messageCounts.length > 0 ? 
        messageCounts.reduce((a, b) => a + b, 0) / messageCounts.length : 0
    };
  }

  /**
   * Detect potential conflict indicators
   * @param {Object} groupData - Group data
   * @returns {Object} Conflict indicators
   */
  _detectConflictIndicators(groupData) {
    const messages = groupData.messages;
    
    // Look for conflict-related keywords
    const conflictKeywords = ['disagree', 'wrong', 'no', 'but', 'however', 'issue', 'problem'];
    const conflictMessages = messages.filter(msg =>
      conflictKeywords.some(keyword =>
        msg.Message_content.toLowerCase().includes(keyword)
      )
    );

    const conflictRate = messages.length > 0 ? conflictMessages.length / messages.length : 0;

    // Analyze response patterns for tension
    const shortResponses = messages.filter(msg => 
      msg.Message_content.length < 20 && msg.Message_content.trim().length > 0
    );
    const shortResponseRate = messages.length > 0 ? shortResponses.length / messages.length : 0;

    return {
      conflictRate,
      shortResponseRate,
      potentialConflictMessages: conflictMessages.length,
      riskLevel: conflictRate > 0.2 ? 'high' : conflictRate > 0.1 ? 'medium' : 'low'
    };
  }

  /**
   * Calculate group metrics
   * @param {Object} groupData - Group data
   * @returns {Object} Group metrics
   */
  _calculateGroupMetrics(groupData) {
    const { members, messages, tasks, notes, timeframe } = groupData;

    const completionRate = tasks.length > 0 ? 
      tasks.filter(t => t.Task_status === 'completed').length / tasks.length : 0;
    
    const messagesPerDay = messages.length / timeframe;
    const tasksPerWeek = (tasks.length / timeframe) * 7;
    
    // Calculate engagement score directly here to avoid circular dependency
    const messageScore = Math.min(messagesPerDay / 10, 1) * 0.3;
    const taskScore = Math.min(tasksPerWeek / 5, 1) * 0.4;
    const completionScore = completionRate * 0.3;
    const engagementScore = messageScore + taskScore + completionScore;

    return {
      memberCount: members.length,
      activeMembers: this._countActiveMembers(groupData),
      messagesPerDay,
      tasksPerWeek,
      notesPerWeek: (notes.length / timeframe) * 7,
      completionRate,
      engagementScore
    };
  }

  /**
   * Analyze trends in group activity
   * @param {Object} groupData - Group data
   * @returns {Object} Trend analysis
   */
  _analyzeTrends(groupData) {
    const { messages, tasks, notes, timeframe } = groupData;
    
    // Divide timeframe into weeks for trend analysis
    const weeks = Math.ceil(timeframe / 7);
    const weeklyData = [];

    for (let week = 0; week < weeks; week++) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (timeframe - (week * 7)));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const weekMessages = messages.filter(m => 
        new Date(m.Message_createdAt) >= weekStart && 
        new Date(m.Message_createdAt) < weekEnd
      );

      const weekTasks = tasks.filter(t => 
        new Date(t.Task_createdAt) >= weekStart && 
        new Date(t.Task_createdAt) < weekEnd
      );

      const weekNotes = notes.filter(n => 
        new Date(n.Note_createdAt) >= weekStart && 
        new Date(n.Note_createdAt) < weekEnd
      );

      weeklyData.push({
        week: week + 1,
        messages: weekMessages.length,
        tasks: weekTasks.length,
        notes: weekNotes.length,
        completedTasks: weekTasks.filter(t => t.Task_status === 'completed').length
      });
    }

    // Calculate trends
    const messageTrend = this._calculateTrend(weeklyData.map(w => w.messages));
    const taskTrend = this._calculateTrend(weeklyData.map(w => w.tasks));
    const noteTrend = this._calculateTrend(weeklyData.map(w => w.notes));

    return {
      weeklyData,
      trends: {
        messages: messageTrend,
        tasks: taskTrend,
        notes: noteTrend
      }
    };
  }

  /**
   * Analyze member engagement
   * @param {Object} groupData - Group data
   * @returns {Object} Engagement analysis
   */
  _analyzeEngagement(groupData) {
    const { members, messages, tasks, notes } = groupData;

    const memberEngagement = members.map(member => {
      const userId = member.GroupMember_userId._id;
      
      const memberMessages = messages.filter(m => 
        m.Message_sender._id.toString() === userId.toString()
      );
      
      const memberTasks = tasks.filter(t => 
        t.Task_assignedTo.some(assignee => 
          assignee._id.toString() === userId.toString()
        )
      );
      
      const memberNotes = notes.filter(n => 
        n.Note_createdBy._id.toString() === userId.toString()
      );

      const engagementScore = this._calculateMemberEngagementScore({
        messages: memberMessages.length,
        tasks: memberTasks.length,
        notes: memberNotes.length,
        completedTasks: memberTasks.filter(t => t.Task_status === 'completed').length
      });

      return {
        member: member.GroupMember_userId,
        role: member.GroupMember_role,
        messageCount: memberMessages.length,
        taskCount: memberTasks.length,
        noteCount: memberNotes.length,
        completedTasks: memberTasks.filter(t => t.Task_status === 'completed').length,
        engagementScore,
        lastActivity: this._getLastActivity(userId, groupData)
      };
    });

    return {
      memberEngagement: memberEngagement.sort((a, b) => b.engagementScore - a.engagementScore),
      averageEngagement: memberEngagement.reduce((sum, m) => sum + m.engagementScore, 0) / members.length,
      highlyEngaged: memberEngagement.filter(m => m.engagementScore > 0.7).length,
      lowEngagement: memberEngagement.filter(m => m.engagementScore < 0.3).length
    };
  }

  // Additional helper methods would continue here...
  // Due to length constraints, I'll include the most critical ones

  /**
   * Generate AI-powered recommendations
   * @param {Object} groupData - Group data
   * @param {Object} insights - Generated insights
   * @param {Object} userPreferences - User preferences
   * @returns {Promise<Object>} AI recommendations
   */
  async _generateAIRecommendations(groupData, insights, userPreferences) {
    try {
      const prompt = this._buildAIRecommendationPrompt(groupData, insights);
      
      const response = await aiService.makeRequest(prompt, {
        type: 'group_insights',
        systemPrompt: 'You are an AI collaboration expert. Analyze group data and provide actionable insights for improving teamwork and productivity.',
        maxTokens: 800,
        temperature: 0.4
      });

      return {
        summary: response.content,
        confidence: response.confidence,
        keyRecommendations: this._extractKeyRecommendations(response.content),
        actionItems: this._extractActionItems(response.content)
      };
    } catch (error) {
      console.error('AI recommendations error:', error);
      return {
        summary: 'AI recommendations temporarily unavailable',
        confidence: 0,
        keyRecommendations: [],
        actionItems: []
      };
    }
  }

  /**
   * Build AI recommendation prompt
   * @param {Object} groupData - Group data
   * @param {Object} insights - Generated insights
   * @returns {string} AI prompt
   */
  _buildAIRecommendationPrompt(groupData, insights) {
    const metrics = insights.groupMetrics;
    const collaboration = insights.collaborationAnalysis;
    
    return `Analyze this study group's collaboration data and provide actionable recommendations:

Group Overview:
- Members: ${metrics.memberCount}
- Active Members: ${metrics.activeMembers}
- Messages per day: ${metrics.messagesPerDay.toFixed(1)}
- Task completion rate: ${(metrics.completionRate * 100).toFixed(1)}%
- Engagement score: ${metrics.engagementScore.toFixed(2)}

Collaboration Analysis:
- Communication effectiveness: ${collaboration?.communicationPatterns?.averageResponseTime ? 
  `${collaboration.communicationPatterns.averageResponseTime.toFixed(1)} hours avg response time` : 'N/A'}
- Knowledge sharing rate: ${collaboration?.knowledgeSharing?.notesSharingRate ? 
  `${(collaboration.knowledgeSharing.notesSharingRate * 100).toFixed(1)}%` : 'N/A'}
- Participation balance: ${collaboration?.participationBalance?.giniCoefficient ? 
  collaboration.participationBalance.giniCoefficient < 0.3 ? 'Well balanced' : 
  collaboration.participationBalance.giniCoefficient > 0.6 ? 'Unbalanced' : 'Moderately balanced' : 'N/A'}

Current Strengths: ${collaboration?.strengths?.join(', ') || 'None identified'}
Areas for Improvement: ${collaboration?.improvements?.join(', ') || 'None identified'}

Please provide:
1. Top 3 actionable recommendations for improving collaboration
2. Specific suggestions for increasing engagement
3. Recommendations for better task management and completion
4. Communication improvement strategies`;
  }

  // Utility methods
  _calculateGiniCoefficient(values) {
    if (values.length === 0) return 0;
    
    values.sort((a, b) => a - b);
    const n = values.length;
    const sum = values.reduce((a, b) => a + b, 0);
    
    if (sum === 0) return 0;
    
    let numerator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (2 * (i + 1) - n - 1) * values[i];
    }
    
    return numerator / (n * sum);
  }

  _calculateTrend(values) {
    if (values.length < 2) return 'stable';
    
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    const change = (secondAvg - firstAvg) / firstAvg;
    
    if (change > 0.1) return 'increasing';
    if (change < -0.1) return 'decreasing';
    return 'stable';
  }

  _countActiveMembers(groupData) {
    const { members, messages, tasks, notes } = groupData;
    const activeUserIds = new Set();
    
    messages.forEach(msg => activeUserIds.add(msg.Message_sender._id.toString()));
    tasks.forEach(task => {
      task.Task_assignedTo.forEach(user => activeUserIds.add(user._id.toString()));
      activeUserIds.add(task.Task_createdBy._id.toString());
    });
    notes.forEach(note => activeUserIds.add(note.Note_createdBy._id.toString()));
    
    return activeUserIds.size;
  }

  _calculateEngagementScore(groupData) {
    const { messages, tasks, timeframe } = groupData;
    
    const completionRate = tasks.length > 0 ? 
      tasks.filter(t => t.Task_status === 'completed').length / tasks.length : 0;
    
    const messagesPerDay = messages.length / timeframe;
    const tasksPerWeek = (tasks.length / timeframe) * 7;
    
    // Normalize metrics to 0-1 scale and weight them
    const messageScore = Math.min(messagesPerDay / 10, 1) * 0.3;
    const taskScore = Math.min(tasksPerWeek / 5, 1) * 0.4;
    const completionScore = completionRate * 0.3;
    
    return messageScore + taskScore + completionScore;
  }

  _calculateMemberEngagementScore(memberData) {
    const { messages, tasks, notes, completedTasks } = memberData;
    
    // Weight different activities
    const messageScore = Math.min(messages / 20, 1) * 0.3;
    const taskScore = Math.min(tasks / 5, 1) * 0.4;
    const noteScore = Math.min(notes / 3, 1) * 0.2;
    const completionScore = tasks > 0 ? (completedTasks / tasks) * 0.1 : 0;
    
    return messageScore + taskScore + noteScore + completionScore;
  }

  _getLastActivity(userId, groupData) {
    const { messages, tasks, notes } = groupData;
    const activities = [];
    
    messages.forEach(msg => {
      if (msg.Message_sender._id.toString() === userId.toString()) {
        activities.push(new Date(msg.Message_createdAt));
      }
    });
    
    tasks.forEach(task => {
      if (task.Task_createdBy._id.toString() === userId.toString()) {
        activities.push(new Date(task.Task_createdAt));
      }
    });
    
    notes.forEach(note => {
      if (note.Note_createdBy._id.toString() === userId.toString()) {
        activities.push(new Date(note.Note_createdAt));
      }
    });
    
    return activities.length > 0 ? new Date(Math.max(...activities)) : null;
  }

  _extractKeyRecommendations(aiResponse) {
    // Simple extraction - in production, this could use NLP
    const lines = aiResponse.split('\n');
    return lines
      .filter(line => line.match(/^\d+\./))
      .slice(0, 5)
      .map(line => line.replace(/^\d+\.\s*/, '').trim());
  }

  _extractActionItems(aiResponse) {
    // Simple extraction - in production, this could use NLP
    const actionWords = ['implement', 'create', 'establish', 'schedule', 'organize'];
    const lines = aiResponse.split('\n');
    
    return lines
      .filter(line => actionWords.some(word => line.toLowerCase().includes(word)))
      .slice(0, 3)
      .map(line => line.trim());
  }

  _cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.analysisCache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.analysisCache.delete(key);
      }
    }
  }

  // Placeholder methods for additional functionality
  _analyzeActivityPatterns(groupData) {
    // Implementation for activity pattern analysis
    return {
      peakHours: ['14:00', '19:00'],
      lowActivityPeriods: ['02:00-06:00'],
      weekdayActivity: 0.7,
      weekendActivity: 0.3
    };
  }

  _analyzeTaskPatterns(groupData) {
    const tasks = groupData.tasks;
    const completedTasks = tasks.filter(t => t.Task_status === 'completed');
    const overdueTasks = tasks.filter(t => 
      t.Task_dueDate && new Date(t.Task_dueDate) < new Date() && t.Task_status !== 'completed'
    );

    return {
      averageCompletionTime: 5, // Simplified calculation
      overdueRate: tasks.length > 0 ? overdueTasks.length / tasks.length : 0,
      completionRate: tasks.length > 0 ? completedTasks.length / tasks.length : 0
    };
  }

  _analyzeToolUsage(groupData) {
    const { messages, notes, tasks } = groupData;
    const totalActivity = messages.length + notes.length + tasks.length;
    
    return {
      notesUsage: totalActivity > 0 ? notes.length / totalActivity : 0,
      fileSharing: 0.2, // Placeholder - would need file data
      taskManagement: totalActivity > 0 ? tasks.length / totalActivity : 0
    };
  }

  _identifyGroupChallenges(groupData) {
    const challenges = [];
    const metrics = this._calculateGroupMetrics(groupData);
    
    if (metrics.completionRate < 0.6) {
      challenges.push({
        title: 'Low Task Completion Rate',
        description: 'The group is struggling to complete tasks on time',
        priority: 'high',
        impact: 'high',
        actionItems: ['Review task assignment process', 'Implement regular check-ins', 'Break down large tasks']
      });
    }
    
    if (metrics.messagesPerDay < 1) {
      challenges.push({
        title: 'Low Communication Frequency',
        description: 'Group members are not communicating regularly',
        priority: 'medium',
        impact: 'medium',
        actionItems: ['Schedule regular meetings', 'Encourage daily updates', 'Create communication guidelines']
      });
    }
    
    return challenges;
  }

  _analyzeDiscussionsForTasks(messages) {
    // Simplified implementation - in production would use NLP
    const taskKeywords = [];
    const actionWords = ['need to', 'should', 'must', 'have to', 'let\'s', 'we need'];
    
    messages.forEach(msg => {
      const content = msg.Message_content.toLowerCase();
      const hasActionWord = actionWords.some(word => content.includes(word));
      
      if (hasActionWord && content.length > 20) {
        taskKeywords.push({
          topic: content.substring(0, 50) + '...',
          urgency: content.includes('urgent') || content.includes('asap') ? 0.9 : 0.5,
          confidence: 0.6,
          activeParticipants: [msg.Message_sender._id],
          messageIds: [msg._id],
          context: content
        });
      }
    });
    
    return { taskKeywords };
  }

  _needsFollowUp(task) {
    // Simple heuristic - tasks with high priority or long duration might need follow-up
    return task.Task_priority === 'high' || 
           (task.Task_dueDate && 
            (new Date(task.Task_dueDate) - new Date(task.Task_createdAt)) > 7 * 24 * 60 * 60 * 1000);
  }

  _estimateTaskEffort(topic, context) {
    // Simple estimation based on keywords
    if (context.includes('research') || context.includes('study')) return 'medium';
    if (context.includes('quick') || context.includes('simple')) return 'low';
    if (context.includes('complex') || context.includes('difficult')) return 'high';
    return 'medium';
  }

  _generateMaintenanceTasks(groupData) {
    const tasks = [];
    const { notes, tasks: groupTasks } = groupData;
    
    // Suggest organizing notes if there are many
    if (notes.length > 10) {
      tasks.push({
        type: 'maintenance',
        title: 'Organize and categorize group notes',
        description: 'Review and organize the growing collection of notes for better accessibility',
        priority: 'low',
        estimatedEffort: 'medium'
      });
    }
    
    // Suggest task cleanup if there are many completed tasks
    const completedTasks = groupTasks.filter(t => t.Task_status === 'completed');
    if (completedTasks.length > 15) {
      tasks.push({
        type: 'maintenance',
        title: 'Archive completed tasks',
        description: 'Clean up the task list by archiving old completed tasks',
        priority: 'low',
        estimatedEffort: 'low'
      });
    }
    
    return tasks;
  }

  _generateCollaborativeTasks(groupData) {
    const tasks = [];
    const { members, notes } = groupData;
    
    // Suggest knowledge sharing sessions if there are active note creators
    const activeNoteCreators = new Set(notes.map(n => n.Note_createdBy._id.toString()));
    if (activeNoteCreators.size > 1) {
      tasks.push({
        type: 'collaborative',
        title: 'Knowledge sharing session',
        description: 'Organize a session where members share their expertise and notes',
        suggestedAssignees: Array.from(activeNoteCreators),
        priority: 'medium',
        estimatedEffort: 'medium'
      });
    }
    
    return tasks;
  }
}

module.exports = new GroupInsightsService();