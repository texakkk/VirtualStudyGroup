const express = require('express');
const router = express.Router();
const aiService = require('../services/aiService');
const recommendationService = require('../services/recommendationService');
const groupInsightsService = require('../services/groupInsightsService');
const { authenticateUser } = require('../middleware/authMiddleware');
const {
  recommendationRateLimit,
  cacheRecommendations,
  validateRecommendationRequest,
  logRecommendationUsage,
  handleRecommendationErrors
} = require('../middleware/recommendationMiddleware');
const Task = require('../models/Task');
const Note = require('../models/Note');
const Group = require('../models/Group');
const Message = require('../models/Message');

// Apply middleware to all recommendation routes
router.use('/smart-prioritization*', authenticateUser, recommendationRateLimit, validateRecommendationRequest, logRecommendationUsage);
router.use('/study-patterns*', authenticateUser, recommendationRateLimit, validateRecommendationRequest, logRecommendationUsage);
router.use('/intelligent-reminders*', authenticateUser, recommendationRateLimit, validateRecommendationRequest, logRecommendationUsage);
router.use('/content-recommendations*', authenticateUser, recommendationRateLimit, validateRecommendationRequest, logRecommendationUsage);
router.use('/group-insights*', authenticateUser, recommendationRateLimit, validateRecommendationRequest, logRecommendationUsage);
router.use('/group-productivity-suggestions*', authenticateUser, recommendationRateLimit, validateRecommendationRequest, logRecommendationUsage);
router.use('/group-task-suggestions*', authenticateUser, recommendationRateLimit, validateRecommendationRequest, logRecommendationUsage);
router.use('/group-collaboration-analysis*', authenticateUser, recommendationRateLimit, validateRecommendationRequest, logRecommendationUsage);

/**
 * @route POST /api/ai/prioritize-tasks
 * @desc Get AI-powered task prioritization
 * @access Private
 */
router.post('/prioritize-tasks', authenticateUser, async (req, res) => {
    try {
        const { tasks, groupId } = req.body;
        const userId = req.user._id;

        // Validate input
        if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
            return res.status(400).json({
                success: false,
                error: { message: 'Tasks array is required and cannot be empty' }
            });
        }

        // Get user preferences
        const userPreferences = await aiService.getUserPreferences(userId);

        // Generate prioritization
        const response = await aiService.generateTaskPrioritization(tasks, userPreferences);

        // Log interaction
        const interaction = await aiService.logInteraction(
            userId,
            groupId,
            'prioritization',
            `Prioritize ${tasks.length} tasks`,
            response
        );

        res.json({
            success: true,
            data: {
                recommendations: response.content,
                confidence: response.confidence,
                interactionId: interaction._id,
                metadata: {
                    model: response.model,
                    tokensUsed: response.tokensUsed,
                    responseTime: response.responseTime
                }
            }
        });
    } catch (error) {
        console.error('Task prioritization error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to generate task prioritization' }
        });
    }
});

/**
 * @route POST /api/ai/study-recommendations
 * @desc Get personalized study recommendations
 * @access Private
 */
router.post('/study-recommendations', authenticateUser, async (req, res) => {
    try {
        const { studyData, groupId } = req.body;
        const userId = req.user._id;

        // Get user preferences
        const userPreferences = await aiService.getUserPreferences(userId);

        // Generate recommendations
        const response = await aiService.generateStudyRecommendations(studyData || {}, userPreferences);

        // Log interaction
        const interaction = await aiService.logInteraction(
            userId,
            groupId,
            'recommendation',
            'Request study recommendations',
            response
        );

        res.json({
            success: true,
            data: {
                recommendations: response.content,
                confidence: response.confidence,
                interactionId: interaction._id,
                metadata: {
                    model: response.model,
                    tokensUsed: response.tokensUsed,
                    responseTime: response.responseTime
                }
            }
        });
    } catch (error) {
        console.error('Study recommendations error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to generate study recommendations' }
        });
    }
});

/**
 * @route POST /api/ai/group-insights
 * @desc Get AI-powered group collaboration insights with comprehensive analysis
 * @access Private
 */
router.post('/group-insights', authenticateUser, async (req, res) => {
    try {
        const { groupId, timeframe = 30, options = {} } = req.body;
        const userId = req.user._id;

        if (!groupId) {
            return res.status(400).json({
                success: false,
                error: { message: 'Group ID is required' }
            });
        }

        // Validate timeframe
        if (timeframe < 1 || timeframe > 365) {
            return res.status(400).json({
                success: false,
                error: { message: 'Timeframe must be between 1 and 365 days' }
            });
        }

        // Generate comprehensive group insights
        const insights = await groupInsightsService.generateGroupInsights(
            groupId, 
            userId, 
            {
                timeframe,
                includeProductivitySuggestions: options.includeProductivitySuggestions !== false,
                includeTaskSuggestions: options.includeTaskSuggestions !== false,
                includeCollaborationAnalysis: options.includeCollaborationAnalysis !== false
            }
        );

        // Log interaction
        const interaction = await aiService.logInteraction(
            userId,
            groupId,
            'insight',
            `Comprehensive group analysis for ${timeframe} days`,
            {
                content: JSON.stringify({
                    collaborationScore: insights.groupMetrics?.engagementScore || 0,
                    recommendationsCount: insights.productivitySuggestions?.timeManagement?.length || 0,
                    taskSuggestionsCount: insights.taskSuggestions?.fromDiscussions?.length || 0
                }),
                confidence: insights.aiRecommendations?.confidence || 0.7,
                model: 'group-insights-analyzer'
            }
        );

        res.json({
            success: true,
            data: {
                ...insights,
                interactionId: interaction._id,
                analysisMetadata: {
                    timeframe,
                    analysisDate: new Date(),
                    requestedBy: userId
                }
            }
        });

    } catch (error) {
        console.error('Group insights error:', error);
        
        // Handle specific error types
        if (error.message.includes('Access denied')) {
            return res.status(403).json({
                success: false,
                error: { message: error.message }
            });
        }
        
        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                error: { message: 'Group not found' }
            });
        }

        res.status(500).json({
            success: false,
            error: { message: 'Failed to generate group insights' }
        });
    }
});

/**
 * @route POST /api/ai/group-productivity-suggestions
 * @desc Get productivity suggestions based on group activity analysis
 * @access Private
 */
router.post('/group-productivity-suggestions', authenticateUser, async (req, res) => {
    try {
        const { groupId, timeframe = 30 } = req.body;
        const userId = req.user._id;

        if (!groupId) {
            return res.status(400).json({
                success: false,
                error: { message: 'Group ID is required' }
            });
        }

        // Generate productivity suggestions
        const insights = await groupInsightsService.generateGroupInsights(
            groupId, 
            userId, 
            {
                timeframe,
                includeProductivitySuggestions: true,
                includeTaskSuggestions: false,
                includeCollaborationAnalysis: false
            }
        );

        // Log interaction
        const interaction = await aiService.logInteraction(
            userId,
            groupId,
            'productivity_suggestions',
            `Productivity analysis for group`,
            {
                content: JSON.stringify(insights.productivitySuggestions),
                confidence: 0.8,
                model: 'productivity-analyzer'
            }
        );

        res.json({
            success: true,
            data: {
                suggestions: insights.productivitySuggestions,
                groupMetrics: insights.groupMetrics,
                trends: insights.trends,
                interactionId: interaction._id
            }
        });

    } catch (error) {
        console.error('Productivity suggestions error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to generate productivity suggestions' }
        });
    }
});

/**
 * @route POST /api/ai/group-task-suggestions
 * @desc Get automated task suggestions based on group discussions
 * @access Private
 */
router.post('/group-task-suggestions', authenticateUser, async (req, res) => {
    try {
        const { groupId, timeframe = 7 } = req.body; // Shorter timeframe for task suggestions
        const userId = req.user._id;

        if (!groupId) {
            return res.status(400).json({
                success: false,
                error: { message: 'Group ID is required' }
            });
        }

        // Generate task suggestions
        const insights = await groupInsightsService.generateGroupInsights(
            groupId, 
            userId, 
            {
                timeframe,
                includeProductivitySuggestions: false,
                includeTaskSuggestions: true,
                includeCollaborationAnalysis: false
            }
        );

        // Log interaction
        const interaction = await aiService.logInteraction(
            userId,
            groupId,
            'task_suggestions',
            `Automated task suggestions from discussions`,
            {
                content: JSON.stringify(insights.taskSuggestions),
                confidence: 0.7,
                model: 'task-suggestion-analyzer'
            }
        );

        res.json({
            success: true,
            data: {
                suggestions: insights.taskSuggestions,
                interactionId: interaction._id,
                analysisTimeframe: timeframe
            }
        });

    } catch (error) {
        console.error('Task suggestions error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to generate task suggestions' }
        });
    }
});

/**
 * @route GET /api/ai/group-collaboration-analysis/:groupId
 * @desc Get detailed collaboration analysis for a group
 * @access Private
 */
router.get('/group-collaboration-analysis/:groupId', authenticateUser, async (req, res) => {
    try {
        const { groupId } = req.params;
        const { timeframe = 30 } = req.query;
        const userId = req.user._id;

        if (!groupId) {
            return res.status(400).json({
                success: false,
                error: { message: 'Group ID is required' }
            });
        }

        // Generate collaboration analysis
        const insights = await groupInsightsService.generateGroupInsights(
            groupId, 
            userId, 
            {
                timeframe: parseInt(timeframe),
                includeProductivitySuggestions: false,
                includeTaskSuggestions: false,
                includeCollaborationAnalysis: true
            }
        );

        // Log interaction
        const interaction = await aiService.logInteraction(
            userId,
            groupId,
            'collaboration_analysis',
            `Collaboration analysis for ${timeframe} days`,
            {
                content: JSON.stringify(insights.collaborationAnalysis),
                confidence: 0.8,
                model: 'collaboration-analyzer'
            }
        );

        res.json({
            success: true,
            data: {
                collaborationAnalysis: insights.collaborationAnalysis,
                memberEngagement: insights.memberEngagement,
                groupMetrics: insights.groupMetrics,
                trends: insights.trends,
                interactionId: interaction._id
            }
        });

    } catch (error) {
        console.error('Collaboration analysis error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to generate collaboration analysis' }
        });
    }
});

/**
 * @route POST /api/ai/ask-question
 * @desc Ask AI a question with context
 * @access Private
 */
router.post('/ask-question', authenticateUser, async (req, res) => {
    try {
        const { question, groupId, includeContext = true } = req.body;
        const userId = req.user._id;

        if (!question || question.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: { message: 'Question is required' }
            });
        }

        // Build context if requested
        let context = {};
        if (includeContext) {
            // Get user's recent tasks
            const tasks = await Task.find({ Task_assignedTo: userId })
                .sort({ Task_createdAt: -1 })
                .limit(10)
                .select('Task_title Task_description Task_dueDate');

            // Get user's recent notes
            const notes = await Note.find({ Note_createdBy: userId })
                .sort({ Note_createdAt: -1 })
                .limit(5)
                .select('Note_title Note_content');

            context = { tasks, notes };

            // Add group context if groupId provided
            if (groupId) {
                const recentMessages = await Message.find({ Message_groupId: groupId })
                    .sort({ Message_createdAt: -1 })
                    .limit(20)
                    .select('Message_content');

                context.groupActivity = {
                    topics: [] // Would need text analysis
                };
            }
        }

        // Get user preferences
        const userPreferences = await aiService.getUserPreferences(userId);

        // Generate answer
        const response = await aiService.answerQuestion(question, context, userPreferences);

        // Log interaction
        const interaction = await aiService.logInteraction(
            userId,
            groupId,
            'question',
            question,
            response
        );

        res.json({
            success: true,
            data: {
                answer: response.content,
                confidence: response.confidence,
                interactionId: interaction._id,
                metadata: {
                    model: response.model,
                    tokensUsed: response.tokensUsed,
                    responseTime: response.responseTime
                }
            }
        });
    } catch (error) {
        console.error('Question answering error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to answer question' }
        });
    }
});

/**
 * @route GET /api/ai/preferences
 * @desc Get user AI preferences
 * @access Private
 */
router.get('/preferences', authenticateUser, async (req, res) => {
    try {
        const userId = req.user._id;
        const preferences = await aiService.getUserPreferences(userId);

        res.json({
            success: true,
            data: preferences
        });
    } catch (error) {
        console.error('Get preferences error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to get user preferences' }
        });
    }
});

/**
 * @route PUT /api/ai/preferences
 * @desc Update user AI preferences
 * @access Private
 */
router.put('/preferences', authenticateUser, async (req, res) => {
    try {
        const userId = req.user._id;
        const updates = req.body;

        // Validate updates object
        if (!updates || typeof updates !== 'object') {
            return res.status(400).json({
                success: false,
                error: { message: 'Updates object is required' }
            });
        }

        const preferences = await aiService.updateUserPreferences(userId, updates);

        res.json({
            success: true,
            data: preferences
        });
    } catch (error) {
        console.error('Update preferences error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to update user preferences' }
        });
    }
});

/**
 * @route GET /api/ai/history
 * @desc Get AI interaction history
 * @access Private
 */
router.get('/history', authenticateUser, async (req, res) => {
    try {
        const userId = req.user._id;
        const {
            limit = 20,
            offset = 0,
            type,
            groupId,
            startDate,
            endDate
        } = req.query;

        const options = {
            limit: parseInt(limit),
            offset: parseInt(offset),
            type,
            groupId,
            startDate,
            endDate
        };

        const interactions = await aiService.getInteractionHistory(userId, options);

        res.json({
            success: true,
            data: interactions
        });
    } catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to get interaction history' }
        });
    }
});

/**
 * @route DELETE /api/ai/history
 * @desc Clear AI interaction history
 * @access Private
 */
router.delete('/history', authenticateUser, async (req, res) => {
    try {
        const userId = req.user._id;
        const { groupId } = req.query;
        const deletedCount = await aiService.clearInteractionHistory(userId, { groupId });

        res.json({
            success: true,
            data: { deletedCount }
        });
    } catch (error) {
        console.error('Clear history error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to clear interaction history' }
        });
    }
});

/**
 * @route POST /api/ai/feedback
 * @desc Provide feedback on AI response
 * @access Private
 */
router.post('/feedback', authenticateUser, async (req, res) => {
    try {
        const { interactionId, feedback } = req.body;

        if (!interactionId || !feedback) {
            return res.status(400).json({
                success: false,
                error: { message: 'Interaction ID and feedback are required' }
            });
        }

        const validFeedback = ['helpful', 'not_helpful', 'partially_helpful'];
        if (!validFeedback.includes(feedback)) {
            return res.status(400).json({
                success: false,
                error: { message: 'Invalid feedback value' }
            });
        }

        const interaction = await aiService.provideFeedback(interactionId, feedback);

        res.json({
            success: true,
            data: interaction
        });
    } catch (error) {
        console.error('Provide feedback error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to provide feedback' }
        });
    }
});

/**
 * @route GET /api/ai/smart-prioritization/:groupId?
 * @desc Get smart task prioritization recommendations
 * @access Private
 */
router.get('/smart-prioritization/:groupId?', 
  authenticateUser, 
  cacheRecommendations('prioritization', 600), // Cache for 10 minutes
  async (req, res) => {
    try {
        const userId = req.user._id;
        const groupId = req.params.groupId || null;

        const recommendations = await recommendationService.generateTaskPrioritization(userId, groupId);

        // Log interaction
        const interaction = await aiService.logInteraction(
            userId,
            groupId,
            'prioritization',
            'Smart task prioritization request',
            {
                content: JSON.stringify(recommendations.recommendations),
                confidence: recommendations.confidence,
                model: 'recommendation-engine'
            }
        );

        res.json({
            success: true,
            data: {
                ...recommendations,
                interactionId: interaction._id
            }
        });
    } catch (error) {
        console.error('Smart prioritization error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to generate smart prioritization' }
        });
    }
});

/**
 * @route GET /api/ai/study-patterns/:days?
 * @desc Analyze study patterns and generate recommendations
 * @access Private
 */
router.get('/study-patterns/:days?', 
  authenticateUser, 
  cacheRecommendations('study-patterns', 1800), // Cache for 30 minutes
  async (req, res) => {
    try {
        const userId = req.user._id;
        const days = parseInt(req.params.days) || 30;

        if (days < 1 || days > 365) {
            return res.status(400).json({
                success: false,
                error: { message: 'Days parameter must be between 1 and 365' }
            });
        }

        const analysis = await recommendationService.analyzeStudyPatterns(userId, days);

        // Log interaction
        const interaction = await aiService.logInteraction(
            userId,
            null,
            'analysis',
            `Study pattern analysis for ${days} days`,
            {
                content: analysis.recommendations,
                confidence: analysis.confidence,
                model: 'pattern-analyzer'
            }
        );

        res.json({
            success: true,
            data: {
                ...analysis,
                interactionId: interaction._id
            }
        });
    } catch (error) {
        console.error('Study patterns analysis error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to analyze study patterns' }
        });
    }
});

/**
 * @route GET /api/ai/intelligent-reminders
 * @desc Get intelligent reminders based on user preferences and patterns
 * @access Private
 */
router.get('/intelligent-reminders', 
  authenticateUser, 
  cacheRecommendations('reminders', 300), // Cache for 5 minutes
  async (req, res) => {
    try {
        const userId = req.user._id;

        const reminders = await recommendationService.generateIntelligentReminders(userId);

        // Log interaction if reminders were generated
        if (reminders.length > 0) {
            const interaction = await aiService.logInteraction(
                userId,
                null,
                'reminder',
                'Intelligent reminders request',
                {
                    content: `Generated ${reminders.length} intelligent reminders`,
                    confidence: 0.8,
                    model: 'reminder-engine'
                }
            );

            res.json({
                success: true,
                data: {
                    reminders,
                    count: reminders.length,
                    interactionId: interaction._id
                }
            });
        } else {
            res.json({
                success: true,
                data: {
                    reminders: [],
                    count: 0,
                    message: 'No reminders needed at this time'
                }
            });
        }
    } catch (error) {
        console.error('Intelligent reminders error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to generate intelligent reminders' }
        });
    }
});

/**
 * @route GET /api/ai/content-recommendations/:context?
 * @desc Get personalized content recommendations
 * @access Private
 */
router.get('/content-recommendations/:context?', 
  authenticateUser, 
  cacheRecommendations('content-recommendations', 900), // Cache for 15 minutes
  async (req, res) => {
    try {
        const userId = req.user._id;
        const context = req.params.context || 'study';

        const validContexts = ['study', 'task', 'group'];
        if (!validContexts.includes(context)) {
            return res.status(400).json({
                success: false,
                error: { message: 'Invalid context. Must be one of: study, task, group' }
            });
        }

        const recommendations = await recommendationService.getContentRecommendations(userId, context);

        // Log interaction
        const interaction = await aiService.logInteraction(
            userId,
            null,
            'recommendation',
            `Content recommendations for ${context}`,
            {
                content: JSON.stringify(recommendations),
                confidence: 0.7,
                model: 'content-recommender'
            }
        );

        res.json({
            success: true,
            data: {
                recommendations,
                context,
                interactionId: interaction._id
            }
        });
    } catch (error) {
        console.error('Content recommendations error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to generate content recommendations' }
        });
    }
});

// Apply error handling middleware
router.use(handleRecommendationErrors);

module.exports = router;
