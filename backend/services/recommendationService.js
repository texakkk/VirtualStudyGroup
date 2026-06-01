const Task = require('../models/Task');
const Note = require('../models/Note');
const User = require('../models/User');
const UserPreferences = require('../models/UserPreferences');
const AIInteraction = require('../models/AIInteraction');
const GroupMember = require('../models/GroupMember');
const aiService = require('./aiService');

class RecommendationService {
  constructor() {
    this.priorityWeights = {
      deadline: 0.4,
      importance: 0.3,
      difficulty: 0.2,
      dependencies: 0.1
    };
  }

  /**
   * Generate task prioritization recommendations
   * @param {string} userId - User ID
   * @param {string} groupId - Group ID (optional)
   * @returns {Promise<Object>} Prioritization recommendations
   */
  async generateTaskPrioritization(userId, groupId = null) {
    try {
      // The group prioritization screen summarizes all open group tasks, so the
      // recommendation query must use the same scope when a group is selected.
      const query = groupId
        ? { Task_groupId: groupId, Task_status: { $ne: 'completed' } }
        : { Task_assignedTo: userId, Task_status: { $ne: 'completed' } };

      if (groupId) {
        const membership = await GroupMember.findOne({
          GroupMember_groupId: groupId,
          GroupMember_userId: userId
        }).lean();

        if (!membership) {
          throw new Error('Access denied to group tasks');
        }
      }
      
      const tasks = await Task.find(query)
        .populate('Task_assignedTo', 'User_name')
        .populate('Task_groupId', 'Group_name')
        .sort({ Task_createdAt: -1 });

      if (tasks.length === 0) {
        return {
          recommendations: [],
          message: 'No tasks found to prioritize',
          confidence: 1.0
        };
      }

      // Calculate priority scores for each task
      const prioritizedTasks = await this._calculateTaskPriorities(tasks, userId);

      // Get user preferences for personalization
      const userPreferences = await aiService.getUserPreferences(userId);

      // Generate AI-powered recommendations
      const aiRecommendations = await aiService.generateTaskPrioritization(
        prioritizedTasks.map(task => ({
          title: task.Task_name || task.Task_title,
          dueDate: task.Task_dueDate,
          priority: task.Task_priority,
          estimatedTime: task.estimatedTime,
          priorityScore: task.priorityScore
        })),
        userPreferences
      );

      return {
        recommendations: prioritizedTasks,
        aiInsights: aiRecommendations.content,
        confidence: aiRecommendations.confidence,
        metadata: {
          totalTasks: tasks.length,
          highPriorityTasks: prioritizedTasks.filter(t => t.priorityScore > 0.7).length,
          overdueTasks: prioritizedTasks.filter(t => t.isOverdue).length
        }
      };
    } catch (error) {
      console.error('Task prioritization error:', error);
      throw error;
    }
  }

  /**
   * Analyze study patterns and generate recommendations
   * @param {string} userId - User ID
   * @param {number} days - Number of days to analyze (default: 30)
   * @returns {Promise<Object>} Study pattern analysis and recommendations
   */
  async analyzeStudyPatterns(userId, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get user's study activity data
      const [tasks, notes, aiInteractions, userPreferences] = await Promise.all([
        Task.find({
          Task_assignedTo: userId,
          Task_createdAt: { $gte: startDate }
        }).sort({ Task_createdAt: -1 }),
        
        Note.find({
          Note_createdBy: userId,
          Note_createdAt: { $gte: startDate }
        }).sort({ Note_createdAt: -1 }),
        
        AIInteraction.find({
          AI_userId: userId,
          AI_createdAt: { $gte: startDate }
        }).sort({ AI_createdAt: -1 }),
        
        aiService.getUserPreferences(userId)
      ]);

      // Analyze patterns
      const patterns = this._analyzeUserPatterns(tasks, notes, aiInteractions);
      
      // Generate study recommendations
      const studyData = {
        weeklyHours: patterns.weeklyStudyHours,
        avgSessionLength: patterns.avgSessionLength,
        productiveTimes: patterns.mostProductiveTimes,
        subjects: patterns.studySubjects,
        completionRate: patterns.taskCompletionRate,
        studyStreak: patterns.currentStreak,
        preferredFormats: patterns.preferredContentTypes
      };

      const aiRecommendations = await aiService.generateStudyRecommendations(studyData, userPreferences);

      return {
        patterns,
        recommendations: aiRecommendations.content,
        confidence: aiRecommendations.confidence,
        insights: {
          strengths: this._identifyStrengths(patterns),
          improvements: this._identifyImprovements(patterns),
          suggestions: this._generateActionableInsights(patterns, userPreferences)
        }
      };
    } catch (error) {
      console.error('Study pattern analysis error:', error);
      throw error;
    }
  }

  /**
   * Generate intelligent reminders based on user preferences and patterns
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of intelligent reminders
   */
  async generateIntelligentReminders(userId) {
    try {
      const userPreferences = await aiService.getUserPreferences(userId);
      
      if (!userPreferences.UserPref_notifications?.study_reminders) {
        return [];
      }

      const now = new Date();
      const reminders = [];

      // Get upcoming tasks
      const upcomingTasks = await Task.find({
        Task_assignedTo: userId,
        Task_status: { $ne: 'completed' },
        Task_dueDate: { $gte: now }
      }).sort({ Task_dueDate: 1 }).limit(10);

      // Generate deadline reminders
      for (const task of upcomingTasks) {
        const timeUntilDue = new Date(task.Task_dueDate) - now;
        const daysUntilDue = Math.ceil(timeUntilDue / (1000 * 60 * 60 * 24));
        
        if (this._shouldRemindForTask(task, daysUntilDue, userPreferences)) {
          reminders.push({
            type: 'deadline',
            priority: this._calculateReminderPriority(task, daysUntilDue),
            title: `Upcoming Deadline: ${task.Task_title}`,
            message: this._generateReminderMessage(task, daysUntilDue, userPreferences),
            dueDate: task.Task_dueDate,
            taskId: task._id,
            urgency: daysUntilDue <= 1 ? 'high' : daysUntilDue <= 3 ? 'medium' : 'low'
          });
        }
      }

      // Generate study session reminders based on preferences
      const studyReminders = this._generateStudySessionReminders(userPreferences);
      reminders.push(...studyReminders);

      // Generate productivity reminders
      const productivityReminders = await this._generateProductivityReminders(userId, userPreferences);
      reminders.push(...productivityReminders);

      // Sort by priority and return top reminders
      return reminders
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 5);
        
    } catch (error) {
      console.error('Intelligent reminders error:', error);
      throw error;
    }
  }

  /**
   * Get personalized content recommendations
   * @param {string} userId - User ID
   * @param {string} context - Context for recommendations ('study', 'task', 'group')
   * @returns {Promise<Object>} Content recommendations
   */
  async getContentRecommendations(userId, context = 'study') {
    try {
      const userPreferences = await aiService.getUserPreferences(userId);
      const recentActivity = await this._getRecentUserActivity(userId);
      
      const recommendations = {
        notes: [],
        tasks: [],
        resources: [],
        studyTips: []
      };

      // Recommend relevant notes
      const relevantNotes = await this._findRelevantNotes(userId, recentActivity);
      recommendations.notes = relevantNotes.slice(0, 3);

      // Recommend similar tasks or templates
      const taskSuggestions = await this._generateTaskSuggestions(userId, recentActivity);
      recommendations.tasks = taskSuggestions.slice(0, 3);

      // Generate study tips based on learning style
      recommendations.studyTips = this._generateStudyTips(userPreferences, recentActivity);

      return recommendations;
    } catch (error) {
      console.error('Content recommendations error:', error);
      throw error;
    }
  }

  // Private helper methods

  /**
   * Calculate priority scores for tasks
   * @private
   */
  async _calculateTaskPriorities(tasks, userId) {
    const now = new Date();
    
    return tasks.map(task => {
      let score = 0;
      
      // Deadline factor (0-1, higher for closer deadlines)
      if (task.Task_dueDate) {
        const timeUntilDue = new Date(task.Task_dueDate) - now;
        const daysUntilDue = timeUntilDue / (1000 * 60 * 60 * 24);
        
        if (daysUntilDue < 0) {
          score += 1.0; // Overdue tasks get maximum deadline score
        } else if (daysUntilDue <= 1) {
          score += 0.9;
        } else if (daysUntilDue <= 3) {
          score += 0.7;
        } else if (daysUntilDue <= 7) {
          score += 0.5;
        } else {
          score += Math.max(0.1, 1 / Math.log(daysUntilDue + 1));
        }
      }
      
      // Importance factor
      const importanceMap = { low: 0.2, medium: 0.5, high: 0.8, urgent: 1.0 };
      score += (importanceMap[task.Task_priority] || 0.5) * this.priorityWeights.importance;
      
      // Estimated difficulty/time factor
      const estimatedHours = task.estimatedTime || 2;
      const difficultyScore = Math.min(1.0, estimatedHours / 8); // Normalize to 8 hours max
      score += difficultyScore * this.priorityWeights.difficulty;
      
      return {
        ...task.toObject(),
        priorityScore: Math.min(1.0, score),
        isOverdue: task.Task_dueDate && new Date(task.Task_dueDate) < now,
        daysUntilDue: task.Task_dueDate ? Math.ceil((new Date(task.Task_dueDate) - now) / (1000 * 60 * 60 * 24)) : null,
        estimatedTime: estimatedHours
      };
    }).sort((a, b) => b.priorityScore - a.priorityScore);
  }

  /**
   * Analyze user study patterns
   * @private
   */
  _analyzeUserPatterns(tasks, notes, aiInteractions) {
    const patterns = {
      weeklyStudyHours: 0,
      avgSessionLength: 0,
      mostProductiveTimes: [],
      studySubjects: [],
      taskCompletionRate: 0,
      currentStreak: 0,
      preferredContentTypes: []
    };

    // Calculate task completion rate
    const completedTasks = tasks.filter(t => t.Task_status === 'completed');
    patterns.taskCompletionRate = tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0;

    // Analyze activity by hour to find productive times
    const hourlyActivity = new Array(24).fill(0);
    [...tasks, ...notes, ...aiInteractions].forEach(item => {
      const hour = new Date(item.createdAt || item.Task_createdAt || item.Note_createdAt || item.AI_createdAt).getHours();
      hourlyActivity[hour]++;
    });

    // Find top 3 most active hours
    const topHours = hourlyActivity
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(item => `${item.hour}:00`);
    
    patterns.mostProductiveTimes = topHours;

    // Estimate weekly study hours (simplified calculation)
    patterns.weeklyStudyHours = Math.min(40, (tasks.length + notes.length) * 0.5);

    // Extract subjects from task titles and note content
    const subjectKeywords = ['math', 'science', 'history', 'english', 'physics', 'chemistry', 'biology'];
    const foundSubjects = new Set();
    
    [...tasks, ...notes].forEach(item => {
      const text = (item.Task_title || item.Note_title || '').toLowerCase();
      subjectKeywords.forEach(subject => {
        if (text.includes(subject)) foundSubjects.add(subject);
      });
    });
    
    patterns.studySubjects = Array.from(foundSubjects);

    return patterns;
  }

  /**
   * Identify user strengths based on patterns
   * @private
   */
  _identifyStrengths(patterns) {
    const strengths = [];
    
    if (patterns.taskCompletionRate > 80) {
      strengths.push('High task completion rate - you\'re great at following through!');
    }
    
    if (patterns.weeklyStudyHours > 15) {
      strengths.push('Consistent study schedule - you put in good hours each week');
    }
    
    if (patterns.mostProductiveTimes.length > 0) {
      strengths.push(`You have identified productive times: ${patterns.mostProductiveTimes.join(', ')}`);
    }
    
    return strengths;
  }

  /**
   * Identify areas for improvement
   * @private
   */
  _identifyImprovements(patterns) {
    const improvements = [];
    
    if (patterns.taskCompletionRate < 60) {
      improvements.push('Consider breaking large tasks into smaller, manageable chunks');
    }
    
    if (patterns.weeklyStudyHours < 10) {
      improvements.push('Try to establish a more consistent study routine');
    }
    
    if (patterns.studySubjects.length < 2) {
      improvements.push('Consider diversifying your study subjects for better learning');
    }
    
    return improvements;
  }

  /**
   * Generate actionable insights
   * @private
   */
  _generateActionableInsights(patterns, userPreferences) {
    const insights = [];
    
    // Time-based insights
    if (patterns.mostProductiveTimes.length > 0) {
      insights.push(`Schedule your most challenging tasks during ${patterns.mostProductiveTimes[0]} when you're most productive`);
    }
    
    // Learning style insights
    if (userPreferences.UserPref_learningStyle === 'visual') {
      insights.push('Create mind maps and diagrams to enhance your visual learning style');
    } else if (userPreferences.UserPref_learningStyle === 'auditory') {
      insights.push('Try recording yourself explaining concepts or join study groups for discussion');
    }
    
    // Goal-based insights
    const dailyGoal = userPreferences.UserPref_studyGoals?.daily_hours || 2;
    const currentDaily = patterns.weeklyStudyHours / 7;
    
    if (currentDaily < dailyGoal) {
      insights.push(`Increase daily study time by ${Math.ceil((dailyGoal - currentDaily) * 60)} minutes to reach your goal`);
    }
    
    return insights;
  }

  /**
   * Determine if user should be reminded for a task
   * @private
   */
  _shouldRemindForTask(task, daysUntilDue, userPreferences) {
    const frequency = userPreferences.UserPref_reminderFrequency || 'medium';
    
    switch (frequency) {
      case 'high':
        return daysUntilDue <= 7;
      case 'medium':
        return daysUntilDue <= 3;
      case 'low':
        return daysUntilDue <= 1;
      default:
        return false;
    }
  }

  /**
   * Calculate reminder priority
   * @private
   */
  _calculateReminderPriority(task, daysUntilDue) {
    let priority = 0.5;
    
    // Urgency factor
    if (daysUntilDue <= 0) priority += 0.4;
    else if (daysUntilDue <= 1) priority += 0.3;
    else if (daysUntilDue <= 3) priority += 0.2;
    
    // Task importance factor
    const importanceMap = { low: 0.1, medium: 0.2, high: 0.3, urgent: 0.4 };
    priority += importanceMap[task.Task_priority] || 0.2;
    
    return Math.min(1.0, priority);
  }

  /**
   * Generate personalized reminder message
   * @private
   */
  _generateReminderMessage(task, daysUntilDue, userPreferences) {
    const personality = userPreferences.UserPref_aiPersonality || 'encouraging';
    
    let message = '';
    
    if (daysUntilDue <= 0) {
      message = personality === 'direct' 
        ? `Task "${task.Task_title}" is overdue. Complete it now.`
        : `Don't worry! "${task.Task_title}" is overdue, but you can still catch up. Let's tackle it together!`;
    } else if (daysUntilDue === 1) {
      message = personality === 'direct'
        ? `"${task.Task_title}" is due tomorrow. Plan your time accordingly.`
        : `Tomorrow's the day for "${task.Task_title}"! You've got this - just one more push!`;
    } else {
      message = personality === 'direct'
        ? `"${task.Task_title}" is due in ${daysUntilDue} days.`
        : `You have ${daysUntilDue} days to complete "${task.Task_title}". Perfect time to make steady progress!`;
    }
    
    return message;
  }

  /**
   * Generate study session reminders
   * @private
   */
  _generateStudySessionReminders(userPreferences) {
    const reminders = [];
    const now = new Date();
    const currentHour = now.getHours();
    
    const studyHours = userPreferences.UserPref_studyHours || ['09:00', '14:00', '19:00'];
    
    studyHours.forEach(timeStr => {
      const [hour] = timeStr.split(':').map(Number);
      
      // Remind 30 minutes before preferred study time
      if (currentHour === hour - 1 && now.getMinutes() >= 30) {
        reminders.push({
          type: 'study_session',
          priority: 0.6,
          title: 'Study Time Approaching',
          message: `Your preferred study time (${timeStr}) is coming up in 30 minutes. Get ready to focus!`,
          scheduledTime: timeStr,
          urgency: 'medium'
        });
      }
    });
    
    return reminders;
  }

  /**
   * Generate productivity reminders
   * @private
   */
  async _generateProductivityReminders(userId, userPreferences) {
    const reminders = [];
    
    // Check for long periods of inactivity
    const lastActivity = await this._getLastUserActivity(userId);
    const hoursSinceActivity = (Date.now() - lastActivity) / (1000 * 60 * 60);
    
    if (hoursSinceActivity > 24 && userPreferences.UserPref_notifications?.productivity_tips) {
      reminders.push({
        type: 'productivity',
        priority: 0.4,
        title: 'Stay Connected',
        message: 'You haven\'t been active lately. Check in with your study group or review your goals!',
        urgency: 'low'
      });
    }
    
    return reminders;
  }

  /**
   * Get recent user activity
   * @private
   */
  async _getRecentUserActivity(userId, days = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const [tasks, notes, interactions] = await Promise.all([
      Task.find({ Task_assignedTo: userId, Task_createdAt: { $gte: startDate } }),
      Note.find({ Note_createdBy: userId, Note_createdAt: { $gte: startDate } }),
      AIInteraction.find({ AI_userId: userId, AI_createdAt: { $gte: startDate } })
    ]);
    
    return { tasks, notes, interactions };
  }

  /**
   * Find relevant notes for recommendations
   * @private
   */
  async _findRelevantNotes(userId, recentActivity) {
    // Simple relevance based on recent task subjects
    const taskTitles = recentActivity.tasks
      .filter(t => t.Task_name || t.Task_title) // Handle both field names
      .map(t => (t.Task_name || t.Task_title).toLowerCase());
    const keywords = taskTitles.join(' ').split(' ').filter(word => word.length > 3);
    
    if (keywords.length === 0) return [];
    
    const relevantNotes = await Note.find({
      $or: [
        { Note_createdBy: userId },
        { Note_collaborators: userId }
      ],
      $text: { $search: keywords.slice(0, 3).join(' ') }
    }).limit(5);
    
    return relevantNotes;
  }

  /**
   * Generate task suggestions
   * @private
   */
  async _generateTaskSuggestions(userId, recentActivity) {
    const suggestions = [];
    
    // Suggest follow-up tasks based on completed ones
    const completedTasks = recentActivity.tasks.filter(t => t.Task_status === 'completed');
    
    completedTasks.forEach(task => {
      const taskTitle = task.Task_name || task.Task_title || '';
      if (taskTitle.toLowerCase().includes('read')) {
        suggestions.push({
          title: `Review notes from: ${taskTitle}`,
          type: 'follow_up',
          priority: 'medium'
        });
      }
    });
    
    return suggestions.slice(0, 3);
  }

  /**
   * Generate study tips based on learning style
   * @private
   */
  _generateStudyTips(userPreferences, recentActivity) {
    const tips = [];
    const learningStyle = userPreferences.UserPref_learningStyle || 'mixed';
    
    const tipsByStyle = {
      visual: [
        'Create colorful mind maps for complex topics',
        'Use diagrams and charts to visualize information',
        'Try the Cornell note-taking method for better organization'
      ],
      auditory: [
        'Record yourself explaining concepts and listen back',
        'Join study groups for discussion and explanation',
        'Use text-to-speech tools for reading materials'
      ],
      kinesthetic: [
        'Take breaks every 25 minutes to move around',
        'Use hands-on activities and experiments when possible',
        'Try standing or walking while reviewing notes'
      ],
      reading_writing: [
        'Rewrite notes in your own words',
        'Create detailed outlines and summaries',
        'Use flashcards for memorization'
      ]
    };
    
    const styleTips = tipsByStyle[learningStyle] || tipsByStyle.mixed || [];
    return styleTips.slice(0, 2);
  }

  /**
   * Get last user activity timestamp
   * @private
   */
  async _getLastUserActivity(userId) {
    const [lastTask, lastNote, lastInteraction] = await Promise.all([
      Task.findOne({ Task_assignedTo: userId }).sort({ Task_createdAt: -1 }),
      Note.findOne({ Note_createdBy: userId }).sort({ Note_createdAt: -1 }),
      AIInteraction.findOne({ AI_userId: userId }).sort({ AI_createdAt: -1 })
    ]);
    
    const timestamps = [
      lastTask?.Task_createdAt,
      lastNote?.Note_createdAt,
      lastInteraction?.AI_createdAt
    ].filter(Boolean);
    
    return timestamps.length > 0 ? Math.max(...timestamps.map(d => d.getTime())) : Date.now() - (7 * 24 * 60 * 60 * 1000);
  }
}

module.exports = new RecommendationService();
