const cron = require('node-cron');
const recommendationService = require('./recommendationService');
const NotificationService = require('./notificationService');
const User = require('../models/User');
const UserPreferences = require('../models/UserPreferences');

class ReminderSchedulerService {
  constructor() {
    this.jobs = new Map();
    this.isRunning = false;
    this.notificationService = new NotificationService();
  }

  /**
   * Start the reminder scheduler
   */
  start(io = null, notificationNamespace = null) {
    if (this.isRunning) {
      console.log('Reminder scheduler is already running');
      return;
    }

    console.log('Starting intelligent reminder scheduler...');
    this.notificationService = new NotificationService(io, notificationNamespace);

    // Schedule reminder checks every 30 minutes
    const reminderJob = cron.schedule('*/30 * * * *', async () => {
      await this.processIntelligentReminders();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    // Schedule daily study pattern analysis at 6 AM UTC
    const analysisJob = cron.schedule('0 6 * * *', async () => {
      await this.processDailyAnalysis();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    // Schedule weekly insights on Sundays at 8 AM UTC
    const weeklyInsightsJob = cron.schedule('0 8 * * 0', async () => {
      await this.processWeeklyInsights();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    // Start all jobs
    reminderJob.start();
    analysisJob.start();
    weeklyInsightsJob.start();

    // Store job references
    this.jobs.set('reminders', reminderJob);
    this.jobs.set('analysis', analysisJob);
    this.jobs.set('insights', weeklyInsightsJob);

    this.isRunning = true;
    console.log('Intelligent reminder scheduler started successfully');
  }

  /**
   * Stop the reminder scheduler
   */
  stop() {
    if (!this.isRunning) {
      console.log('Reminder scheduler is not running');
      return;
    }

    console.log('Stopping intelligent reminder scheduler...');

    // Stop all jobs
    this.jobs.forEach((job, name) => {
      job.stop();
      console.log(`Stopped ${name} job`);
    });

    this.jobs.clear();
    this.isRunning = false;
    console.log('Intelligent reminder scheduler stopped');
  }

  /**
   * Process intelligent reminders for all active users
   */
  async processIntelligentReminders() {
    try {
      console.log('Processing intelligent reminders...');

      // Get all users with reminder notifications enabled
      const activeUsers = await UserPreferences.find({
        'UserPref_notifications.study_reminders': true,
        UserPref_aiEnabled: true
      }).populate('UserPref_userId', 'User_name User_email');

      let processedCount = 0;
      let sentCount = 0;

      for (const userPref of activeUsers) {
        try {
          const userId = userPref.UserPref_userId._id;
          
          // Generate intelligent reminders
          const reminders = await recommendationService.generateIntelligentReminders(userId);
          
          if (reminders.length > 0) {
            // Send high priority reminders immediately
            const urgentReminders = reminders.filter(r => r.urgency === 'high');
            
            for (const reminder of urgentReminders) {
              await this.sendReminderNotification(userPref.UserPref_userId, reminder);
              sentCount++;
            }

            // Schedule medium priority reminders for appropriate times
            const mediumReminders = reminders.filter(r => r.urgency === 'medium');
            for (const reminder of mediumReminders) {
              if (this.shouldSendReminderNow(reminder, userPref)) {
                await this.sendReminderNotification(userPref.UserPref_userId, reminder);
                sentCount++;
              }
            }
          }

          processedCount++;
        } catch (userError) {
          console.error(`Error processing reminders for user ${userPref.UserPref_userId._id}:`, userError.message);
        }
      }

      console.log(`Processed reminders for ${processedCount} users, sent ${sentCount} notifications`);
    } catch (error) {
      console.error('Error in processIntelligentReminders:', error);
    }
  }

  /**
   * Process daily study pattern analysis
   */
  async processDailyAnalysis() {
    try {
      console.log('Processing daily study pattern analysis...');

      // Get users who have opted in for AI insights
      const users = await UserPreferences.find({
        'UserPref_notifications.ai_insights': true,
        UserPref_aiEnabled: true
      }).populate('UserPref_userId', 'User_name User_email');

      let processedCount = 0;

      for (const userPref of users) {
        try {
          const userId = userPref.UserPref_userId._id;
          
          // Analyze study patterns for the last 7 days
          const analysis = await recommendationService.analyzeStudyPatterns(userId, 7);
          
          // Send insights if there are actionable recommendations
          if (analysis.insights && analysis.insights.suggestions.length > 0) {
            await this.sendStudyInsightNotification(userPref.UserPref_userId, analysis);
          }

          processedCount++;
        } catch (userError) {
          console.error(`Error processing daily analysis for user ${userPref.UserPref_userId._id}:`, userError.message);
        }
      }

      console.log(`Processed daily analysis for ${processedCount} users`);
    } catch (error) {
      console.error('Error in processDailyAnalysis:', error);
    }
  }

  /**
   * Process weekly insights
   */
  async processWeeklyInsights() {
    try {
      console.log('Processing weekly insights...');

      // Get users who have opted in for productivity tips
      const users = await UserPreferences.find({
        'UserPref_notifications.productivity_tips': true,
        UserPref_aiEnabled: true
      }).populate('UserPref_userId', 'User_name User_email');

      let processedCount = 0;

      for (const userPref of users) {
        try {
          const userId = userPref.UserPref_userId._id;
          
          // Analyze study patterns for the last 30 days
          const analysis = await recommendationService.analyzeStudyPatterns(userId, 30);
          
          // Generate weekly summary
          const weeklyInsight = this.generateWeeklyInsight(analysis);
          
          if (weeklyInsight) {
            await this.sendWeeklyInsightNotification(userPref.UserPref_userId, weeklyInsight);
          }

          processedCount++;
        } catch (userError) {
          console.error(`Error processing weekly insights for user ${userPref.UserPref_userId._id}:`, userError.message);
        }
      }

      console.log(`Processed weekly insights for ${processedCount} users`);
    } catch (error) {
      console.error('Error in processWeeklyInsights:', error);
    }
  }

  /**
   * Determine if a reminder should be sent now based on user preferences
   * @private
   */
  shouldSendReminderNow(reminder, userPreferences) {
    const now = new Date();
    const currentHour = now.getHours();
    
    // Check if current time is within user's preferred study hours
    const studyHours = userPreferences.UserPref_studyHours || [];
    const isStudyTime = studyHours.some(timeStr => {
      const [hour] = timeStr.split(':').map(Number);
      return Math.abs(currentHour - hour) <= 1; // Within 1 hour of preferred time
    });

    // Send study session reminders during study times
    if (reminder.type === 'study_session' && isStudyTime) {
      return true;
    }

    // Send deadline reminders regardless of time if urgent
    if (reminder.type === 'deadline' && reminder.urgency === 'medium') {
      return true;
    }

    // Send productivity reminders during reasonable hours (8 AM - 10 PM)
    if (reminder.type === 'productivity' && currentHour >= 8 && currentHour <= 22) {
      return true;
    }

    return false;
  }

  /**
   * Send reminder notification to user
   * @private
   */
  async sendReminderNotification(user, reminder) {
    try {
      await this.notificationService.createNotification({
        Notification_userId: user._id,
        Notification_title: reminder.title,
        Notification_message: reminder.message,
        Notification_type: 'reminder',
        Notification_priority: reminder.urgency,
        Notification_metadata: {
          reminderType: reminder.type,
          taskId: reminder.taskId,
          scheduledTime: reminder.scheduledTime
        }
      });

      console.log(`Sent ${reminder.type} reminder to user ${user.User_name}`);
    } catch (error) {
      console.error(`Failed to send reminder to user ${user._id}:`, error.message);
    }
  }

  /**
   * Send study insight notification
   * @private
   */
  async sendStudyInsightNotification(user, analysis) {
    try {
      const insights = analysis.insights.suggestions.slice(0, 3).join('\n• ');
      
      await this.notificationService.createNotification({
        Notification_userId: user._id,
        Notification_title: 'Daily Study Insights',
        Notification_message: `Here are your personalized study insights:\n• ${insights}`,
        Notification_type: 'insight',
        Notification_priority: 'low',
        Notification_metadata: {
          analysisType: 'daily',
          confidence: analysis.confidence,
          patterns: analysis.patterns
        }
      });

      console.log(`Sent daily insights to user ${user.User_name}`);
    } catch (error) {
      console.error(`Failed to send insights to user ${user._id}:`, error.message);
    }
  }

  /**
   * Send weekly insight notification
   * @private
   */
  async sendWeeklyInsightNotification(user, insight) {
    try {
      await this.notificationService.createNotification({
        Notification_userId: user._id,
        Notification_title: 'Weekly Study Summary',
        Notification_message: insight.message,
        Notification_type: 'summary',
        Notification_priority: 'low',
        Notification_metadata: {
          analysisType: 'weekly',
          stats: insight.stats
        }
      });

      console.log(`Sent weekly summary to user ${user.User_name}`);
    } catch (error) {
      console.error(`Failed to send weekly summary to user ${user._id}:`, error.message);
    }
  }

  /**
   * Generate weekly insight summary
   * @private
   */
  generateWeeklyInsight(analysis) {
    if (!analysis.patterns) return null;

    const patterns = analysis.patterns;
    const stats = {
      weeklyHours: patterns.weeklyStudyHours,
      completionRate: patterns.taskCompletionRate,
      subjects: patterns.studySubjects.length,
      productiveTimes: patterns.mostProductiveTimes
    };

    let message = `Your weekly study summary:\n\n`;
    message += `📚 Study Time: ${stats.weeklyHours} hours\n`;
    message += `✅ Task Completion: ${stats.completionRate.toFixed(1)}%\n`;
    message += `📖 Subjects Covered: ${stats.subjects}\n`;
    
    if (stats.productiveTimes.length > 0) {
      message += `⏰ Most Productive: ${stats.productiveTimes[0]}\n`;
    }

    // Add motivational message based on performance
    if (stats.completionRate > 80) {
      message += `\n🎉 Excellent work! You're maintaining a high completion rate.`;
    } else if (stats.completionRate > 60) {
      message += `\n👍 Good progress! Consider breaking down larger tasks for better completion rates.`;
    } else {
      message += `\n💪 Keep going! Try setting smaller, achievable daily goals.`;
    }

    return {
      message,
      stats
    };
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeJobs: Array.from(this.jobs.keys()),
      nextRun: {
        reminders: this.jobs.get('reminders')?.nextDate()?.toISOString(),
        analysis: this.jobs.get('analysis')?.nextDate()?.toISOString(),
        insights: this.jobs.get('insights')?.nextDate()?.toISOString()
      }
    };
  }

  /**
   * Manually trigger reminder processing (for testing)
   */
  async triggerReminders() {
    console.log('Manually triggering reminder processing...');
    await this.processIntelligentReminders();
  }

  /**
   * Manually trigger daily analysis (for testing)
   */
  async triggerDailyAnalysis() {
    console.log('Manually triggering daily analysis...');
    await this.processDailyAnalysis();
  }

  /**
   * Manually trigger weekly insights (for testing)
   */
  async triggerWeeklyInsights() {
    console.log('Manually triggering weekly insights...');
    await this.processWeeklyInsights();
  }
}

module.exports = new ReminderSchedulerService();
