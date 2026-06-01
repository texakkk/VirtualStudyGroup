const AIInteraction = require('../models/AIInteraction');
const UserPreferences = require('../models/UserPreferences');
const { GoogleGenAI } = require('@google/genai');

class AIService {
  constructor() {
    this.provider = this._resolveProvider();
    this.apiKey = this._resolveApiKey();
    this.baseURL = this._resolveBaseURL();
    this.defaultModel = this._resolveDefaultModel();
    this.maxRetries = 3;
    this.timeout = 30000; // 30 seconds
    this.rateLimitCooldownUntil = 0;
    this.genAIClient = this.provider === 'gemini' && this.apiKey
      ? new GoogleGenAI({ apiKey: this.apiKey })
      : null;
  }

  _resolveProvider() {
    const configuredProvider = (process.env.AI_PROVIDER || '').toLowerCase();
    const configuredModel = (process.env.AI_MODEL || '').toLowerCase();
    const configuredUrl = (process.env.AI_API_URL || '').toLowerCase();

    if (configuredProvider.includes('gemini') || configuredProvider.includes('google')) {
      return 'gemini';
    }

    if (configuredProvider.includes('openai')) {
      return 'openai';
    }

    if (
      process.env.GEMINI_API_KEY ||
      configuredModel.includes('gemini') ||
      configuredUrl.includes('generativelanguage.googleapis.com') ||
      configuredUrl.includes('aistudio.google.com')
    ) {
      return 'gemini';
    }

    return 'openai';
  }

  _resolveApiKey() {
    if (this.provider === 'gemini') {
      return process.env.GEMINI_API_KEY || process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
    }

    return process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
  }

  _resolveBaseURL() {
    const configuredUrl = process.env.AI_API_URL;

    if (this.provider === 'gemini') {
      if (configuredUrl && !configuredUrl.includes('aistudio.google.com')) {
        return configuredUrl.replace(/\/$/, '');
      }

      return 'https://aistudio.google.com/api-keys?project=gen-lang-client-0551908757&projectFilter=gen-lang-client-0338402639';
    }

    return (configuredUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  }

  _resolveDefaultModel() {
    const configuredModel = process.env.AI_MODEL;

    if (this.provider === 'gemini') {
      if (!configuredModel || configuredModel.toLowerCase() === 'gemini') {
        return 'gemini-2.0-flash';
      }

      return configuredModel;
    }

    return configuredModel || 'gpt-3.5-turbo';
  }

  _shouldUseLocalProvider() {
    const configuredProvider = (process.env.AI_PROVIDER || '').toLowerCase();
    const localMode = (process.env.AI_LOCAL_MODE || '').toLowerCase();

    if (configuredProvider === 'local' || configuredProvider === 'mock') {
      return true;
    }

    if (localMode === 'true' || localMode === '1') {
      return true;
    }

    if (localMode === 'false' || localMode === '0') {
      return false;
    }

    return process.env.NODE_ENV !== 'production';
  }

  normalizeInteractionType(type) {
    const validTypes = new Set([
      'recommendation',
      'reminder',
      'question',
      'analysis',
      'prioritization',
      'insight',
    ]);

    if (validTypes.has(type)) {
      return type;
    }

    const aliases = {
      group_insights: 'insight',
      productivity_suggestions: 'insight',
      task_suggestions: 'insight',
      collaboration_analysis: 'analysis',
    };

    return aliases[type] || 'analysis';
  }

  /**
   * Make a request to the AI service
   * @param {string} prompt - The prompt to send to AI
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} AI response
   */
  async makeRequest(prompt, options = {}) {
    const startTime = Date.now();
    
    try {
      if (this._shouldUseLocalProvider()) {
        return this._makeLocalRequest(prompt, options, startTime);
      }

      // Validate API key
      if (!this.apiKey) {
        if (process.env.NODE_ENV !== 'production') {
          return this._makeLocalRequest(prompt, options, startTime);
        }

        throw new Error('AI API key not configured');
      }

      const cooldownSeconds = this._getRateLimitCooldownSeconds();
      if (cooldownSeconds > 0) {
        throw new Error(`AI provider is rate-limited. Try again in about ${cooldownSeconds} seconds.`);
      }

      if (this.provider === 'gemini') {
        return await this._makeGeminiRequest(prompt, options, startTime);
      }

      return await this._makeOpenAIRequest(prompt, options, startTime);
    } catch (error) {
      console.error('AI Service Error:', error.message);

      if (process.env.NODE_ENV !== 'production') {
        return this._makeLocalRequest(prompt, options, startTime, error);
      }
      
      // Return fallback response for graceful degradation
      return {
        content: this._getFallbackResponse(options.type, error),
        model: 'fallback',
        tokensUsed: 0,
        responseTime: Date.now() - startTime,
        confidence: 0.1,
        error: error.message,
      };
    }
  }

  /**
   * Generate task prioritization recommendations
   * @param {Array} tasks - Array of tasks to prioritize
   * @param {Object} userPreferences - User preferences
   * @returns {Promise<Object>} Prioritization response
   */
  async generateTaskPrioritization(tasks, userPreferences) {
    const prompt = this._buildTaskPrioritizationPrompt(tasks, userPreferences);
    
    const response = await this.makeRequest(prompt, {
      type: 'prioritization',
      systemPrompt: 'You are an AI assistant specialized in task prioritization and productivity. Provide clear, actionable recommendations.',
      maxTokens: 800,
      temperature: 0.3, // Lower temperature for more consistent recommendations
    });

    return response;
  }

  /**
   * Generate study recommendations based on user patterns
   * @param {Object} studyData - User's study patterns and data
   * @param {Object} userPreferences - User preferences
   * @returns {Promise<Object>} Study recommendations
   */
  async generateStudyRecommendations(studyData, userPreferences) {
    const prompt = this._buildStudyRecommendationPrompt(studyData, userPreferences);
    
    const response = await this.makeRequest(prompt, {
      type: 'recommendation',
      systemPrompt: 'You are an AI study coach. Provide personalized, evidence-based study recommendations.',
      maxTokens: 600,
      temperature: 0.5,
    });

    return response;
  }

  /**
   * Generate group insights and collaboration suggestions
   * @param {Object} groupData - Group activity and collaboration data
   * @param {Object} userPreferences - User preferences
   * @returns {Promise<Object>} Group insights
   */
  async generateGroupInsights(groupData, userPreferences) {
    const prompt = this._buildGroupInsightsPrompt(groupData, userPreferences);
    
    const response = await this.makeRequest(prompt, {
      type: 'insight',
      systemPrompt: 'You are an AI collaboration expert. Analyze group dynamics and provide actionable insights for better teamwork.',
      maxTokens: 700,
      temperature: 0.4,
    });

    return response;
  }

  /**
   * Answer user questions with context
   * @param {string} question - User's question
   * @param {Object} context - Relevant context (tasks, notes, group data)
   * @param {Object} userPreferences - User preferences
   * @returns {Promise<Object>} AI response
   */
  async answerQuestion(question, context, userPreferences) {
    const prompt = this._buildQuestionPrompt(question, context, userPreferences);
    
    const response = await this.makeRequest(prompt, {
      type: 'question',
      systemPrompt: 'You are a knowledgeable AI tutor. Provide helpful, accurate answers while encouraging learning.',
      maxTokens: 600,
      temperature: 0.6,
    });

    return response;
  }

  /**
   * Log AI interaction to database
   * @param {string} userId - User ID
   * @param {string} groupId - Group ID (optional)
   * @param {string} type - Interaction type
   * @param {string} input - User input
   * @param {Object} response - AI response
   * @returns {Promise<Object>} Saved interaction
   */
  async logInteraction(userId, groupId, type, input, response) {
    try {
      const interaction = new AIInteraction({
        AI_userId: userId,
        AI_groupId: groupId || null,
        AI_type: this.normalizeInteractionType(type),
        AI_input: input,
        AI_response: response.content,
        AI_confidence: response.confidence,
        AI_metadata: {
          model: response.model,
          tokens_used: response.tokensUsed,
          response_time: response.responseTime,
          context: response.context || {},
        },
      });

      return await interaction.save();
    } catch (error) {
      console.error('Error logging AI interaction:', error.message);
      throw error;
    }
  }

  /**
   * Get user preferences with defaults
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User preferences
   */
  async getUserPreferences(userId) {
    try {
      let preferences = await UserPreferences.findOne({ UserPref_userId: userId });
      
      if (!preferences) {
        // Create default preferences for new user
        preferences = new UserPreferences({
          UserPref_userId: userId,
        });
        await preferences.save();
      }
      
      return preferences;
    } catch (error) {
      console.error('Error getting user preferences:', error.message);
      throw error;
    }
  }

  /**
   * Update user preferences
   * @param {string} userId - User ID
   * @param {Object} updates - Preference updates
   * @returns {Promise<Object>} Updated preferences
   */
  async updateUserPreferences(userId, updates) {
    try {
      const preferences = await UserPreferences.findOneAndUpdate(
        { UserPref_userId: userId },
        { $set: updates },
        { returnDocument: 'after', upsert: true }
      );
      
      return preferences;
    } catch (error) {
      console.error('Error updating user preferences:', error.message);
      throw error;
    }
  }

  /**
   * Get AI interaction history for user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Interaction history
   */
  async getInteractionHistory(userId, options = {}) {
    try {
      const {
        limit = 50,
        offset = 0,
        type = null,
        groupId = null,
        startDate = null,
        endDate = null,
      } = options;

      const query = { AI_userId: userId };
      
      if (type) query.AI_type = type;
      if (groupId) query.AI_groupId = groupId;
      if (startDate || endDate) {
        query.AI_createdAt = {};
        if (startDate) query.AI_createdAt.$gte = new Date(startDate);
        if (endDate) query.AI_createdAt.$lte = new Date(endDate);
      }

      const interactions = await AIInteraction.find(query)
        .sort({ AI_createdAt: -1 })
        .limit(limit)
        .skip(offset)
        .populate('AI_userId', 'User_name User_email')
        .populate('AI_groupId', 'Group_name')
        .lean();

      return interactions.map((interaction) => this.serializeInteraction(interaction));
    } catch (error) {
      console.error('Error getting interaction history:', error.message);
      throw error;
    }
  }

  serializeInteraction(interaction) {
    if (!interaction || typeof interaction !== 'object') {
      return interaction;
    }

    const group =
      interaction.AI_groupId && typeof interaction.AI_groupId === 'object'
        ? interaction.AI_groupId
        : null;
    const user =
      interaction.AI_userId && typeof interaction.AI_userId === 'object'
        ? interaction.AI_userId
        : null;

    return {
      ...interaction,
      id: interaction._id?.toString() || interaction.AI_id?.toString(),
      userId: user?._id?.toString() || interaction.AI_userId?.toString() || null,
      userName: user?.User_name || null,
      groupId: group?._id?.toString() || interaction.AI_groupId?.toString() || null,
      groupName: group?.Group_name || null,
      type: interaction.AI_type,
      input: interaction.AI_input,
      response: interaction.AI_response,
      confidence: interaction.AI_confidence,
      feedback: interaction.AI_feedback,
      createdAt: interaction.AI_createdAt,
      updatedAt: interaction.AI_updatedAt,
    };
  }

  async clearInteractionHistory(userId, options = {}) {
    try {
      const { groupId = null } = options;
      const query = { AI_userId: userId };

      if (groupId) {
        query.AI_groupId = groupId;
      }

      const result = await AIInteraction.deleteMany(query);
      return result.deletedCount || 0;
    } catch (error) {
      console.error('Error clearing interaction history:', error.message);
      throw error;
    }
  }

  /**
   * Provide feedback on AI response
   * @param {string} interactionId - Interaction ID
   * @param {string} feedback - User feedback
   * @returns {Promise<Object>} Updated interaction
   */
  async provideFeedback(interactionId, feedback) {
    try {
      const interaction = await AIInteraction.findByIdAndUpdate(
        interactionId,
        { AI_feedback: feedback },
        { returnDocument: 'after' }
      );
      
      if (!interaction) {
        throw new Error('Interaction not found');
      }
      
      return interaction;
    } catch (error) {
      console.error('Error providing feedback:', error.message);
      throw error;
    }
  }

  // Private helper methods

  _makeLocalRequest(prompt, options, startTime, sourceError = null) {
    const content = this._generateLocalContent(prompt, options, sourceError);

    return {
      content,
      model: 'local-project-assistant',
      tokensUsed: Math.ceil(content.length / 4),
      responseTime: Date.now() - startTime,
      confidence: 0.72,
      context: {
        local: true,
        sourceError: sourceError?.message,
      },
    };
  }

  _generateLocalContent(prompt, options = {}, sourceError = null) {
    const type = this.normalizeInteractionType(options.type || 'question');

    if (type === 'prioritization') {
      return this._generateLocalPrioritization(prompt);
    }

    if (type === 'recommendation') {
      return this._generateLocalStudyRecommendation(prompt);
    }

    if (type === 'insight' || type === 'analysis') {
      return this._generateLocalGroupInsights(prompt);
    }

    if (type === 'reminder') {
      return '1. Check upcoming deadlines and start with anything due today or tomorrow.\n2. Create a short focused study block for the next open task.\n3. Review group updates before your session so you do not miss shared files, notes, or decisions.';
    }

    return this._generateLocalQuestionAnswer(prompt, sourceError);
  }

  _generateLocalQuestionAnswer(prompt, sourceError = null) {
    const question = this._extractUserQuestion(prompt);
    const normalized = question.toLowerCase();
    const context = this._extractPromptSection(prompt, 'Context:');
    const contextHint = context.trim()
      ? '\n\nFrom your current workspace context, I can also see relevant tasks/notes, so use those as your immediate starting point.'
      : '';
    const localNote = sourceError
      ? '\n\nNote: this is a local project-aware answer while the external AI provider is unavailable.'
      : '';

    if (this._matches(normalized, ['what is', 'overview', 'about this project', 'vstudy', 'virtual study'])) {
      return `${this._projectOverview()}${contextHint}${localNote}`;
    }

    if (this._matches(normalized, ['group', 'groups', 'join', 'member', 'collaboration'])) {
      return 'VStudy groups are the main collaboration space. Use a group to chat, assign tasks, share files, create notes, schedule events, run study sessions, and review group insights. A good workflow is: create or join a group, invite members, agree on tasks, keep discussion in group chat, then use notes/files to preserve study material.' + contextHint + localNote;
    }

    if (this._matches(normalized, ['task', 'tasks', 'priority', 'prioritize', 'deadline', 'todo'])) {
      return 'For tasks in VStudy, start with overdue and due-soon items, then high-priority tasks, then work that blocks other members. Keep each task title specific, add a due date, mark status as pending/in-progress/completed, and use Smart Prioritization to scan what needs attention first. For group work, assign ownership so every task has one clear responsible person.' + contextHint + localNote;
    }

    if (this._matches(normalized, ['note', 'notes', 'document', 'version', 'study material'])) {
      return 'Use Notes for durable study material: summaries, meeting decisions, formulas, references, and revision outlines. Keep titles searchable, split long notes by topic, and use version history when you need to compare changes. For group study, convert chat decisions into notes so they do not get buried in messages.' + contextHint + localNote;
    }

    if (this._matches(normalized, ['chat', 'message', 'discussion'])) {
      return 'Use group chat for quick coordination, questions, and decisions. Keep long explanations in notes, use task links or task names when assigning work, and summarize decisions after a busy discussion. If a chat produces action items, move them into Task Manager so they can be tracked.' + contextHint + localNote;
    }

    if (this._matches(normalized, ['video', 'media', 'session', 'watch', 'annotation'])) {
      return 'Video and media sessions are for synchronous study. Use them when the group needs to review the same material together, discuss a recording, or annotate important moments. Before a session, set a goal; during it, capture key points as notes or annotations; after it, create tasks for follow-up work.' + contextHint + localNote;
    }

    if (this._matches(normalized, ['whiteboard', 'draw', 'diagram'])) {
      return 'Use the whiteboard for visual thinking: diagrams, problem solving, workflows, and quick sketches. It works best when one person frames the problem, then members add examples or corrections. After the session, save the key outcome into notes or tasks.' + contextHint + localNote;
    }

    if (this._matches(normalized, ['file', 'upload', 'pdf', 'resource'])) {
      return 'Use file sharing for source material like PDFs, images, assignments, and references. Name files clearly, share them inside the right group, and create a note that explains what each important file is for. That makes the material easier to find later.' + contextHint + localNote;
    }

    if (this._matches(normalized, ['calendar', 'event', 'schedule', 'meeting'])) {
      return 'Use the group calendar for study sessions, assignment milestones, and check-ins. A healthy schedule includes short recurring study blocks, deadline reminders, and review sessions before major submissions. Put the agenda in the event description when possible.' + contextHint + localNote;
    }

    if (this._matches(normalized, ['notification', 'reminder', 'alert'])) {
      return 'Notifications and intelligent reminders help you keep track of deadlines, group updates, and study prompts. Keep reminders actionable: what needs to happen, by when, and where the related task or note lives.' + contextHint + localNote;
    }

    if (this._matches(normalized, ['ai', 'assistant', 'history', 'feedback'])) {
      return 'The AI Assistant page is meant to answer study and project questions, keep per-group interaction history, and collect feedback on responses. In local mode it gives project-aware guidance without calling Gemini. Later, you can reconnect a real AI provider and keep the same frontend flow.' + contextHint + localNote;
    }

    if (this._matches(normalized, ['study habit', 'study habits', 'improve', 'focus', 'revision', 'read'])) {
      return 'A strong VStudy routine is: choose one clear goal, study for 25-45 minutes, write a short note summary, create tasks for unfinished work, then review with your group. Use notes for memory, tasks for accountability, calendar for consistency, and group chat for quick clarification.' + contextHint + localNote;
    }

    return `Here is a practical VStudy answer: use the project around groups, tasks, notes, chat, files, calendar events, video/media sessions, and whiteboard work. If your question is about planning, start in Tasks and Calendar. If it is about learning material, start in Notes and Files. If it is about teamwork, start in Group Chat and Group Insights. Ask a more specific question like "how do I prioritize tasks?", "how do groups work?", or "how should we run a study session?" and I can give a more targeted answer.${contextHint}${localNote}`;
  }

  _generateLocalPrioritization(prompt) {
    const taskLines = this._extractPromptLines(prompt, /^-\s+(.+?)\s+\(Due:\s*(.*?),\s*Priority:\s*(.*?)\)/i);
    const taskSummary = taskLines.length
      ? taskLines.slice(0, 5).map((task, index) => `${index + 1}. ${task[1]} - ${this._taskReason(task[2], task[3])}`).join('\n')
      : '1. Start with overdue or due-today tasks.\n2. Then handle high-priority tasks.\n3. Finish with lower-priority work or tasks without deadlines.';

    return `Recommended task order:\n${taskSummary}\n\nSuggested time allocation:\n- High priority or overdue tasks: 45-60 minutes first.\n- Medium priority tasks: 25-45 minutes.\n- Low priority or no-deadline tasks: short 15-25 minute cleanup blocks.\n\nCoordination tip:\nUse Task Manager to update status after each study block. For group tasks, confirm the owner in group chat and save important decisions in notes.`;
  }

  _generateLocalStudyRecommendation(prompt) {
    const weeklyHours = this._extractMetric(prompt, /Total study time this week:\s*([^\n]+)/i, '0 hours');
    const avgSession = this._extractMetric(prompt, /Average session length:\s*([^\n]+)/i, 'unknown');
    const productiveTimes = this._extractMetric(prompt, /Most productive times:\s*([^\n]+)/i, 'your most consistent free time');
    const learningStyle = this._extractMetric(prompt, /Learning Style:\s*([^\n]+)/i, 'balanced');

    return `Study schedule:\n1. Use ${productiveTimes} for your hardest work and protect that time on the calendar.\n2. Keep sessions close to ${avgSession}; if that is very long, split it with breaks.\n3. Since this week shows ${weeklyHours}, set a realistic next target rather than jumping too sharply.\n\nEffectiveness tips:\n1. For a ${learningStyle} learning style, combine notes, examples, and quick recall questions.\n2. Convert every study session into one short note summary and one next task.\n3. Review yesterday's notes before opening new material.\n\nBalance:\nSchedule breaks, stop each session with a clear next action, and use group chat only for blockers that another member can actually help resolve.`;
  }

  _generateLocalGroupInsights(prompt) {
    const members = this._extractMetric(prompt, /Members:\s*([^\n]+)/i, this._extractMetric(prompt, /Total members:\s*([^\n]+)/i, 'the current members'));
    const activeMembers = this._extractMetric(prompt, /Active Members:\s*([^\n]+)/i, this._extractMetric(prompt, /Active members this week:\s*([^\n]+)/i, 'active members'));
    const messages = this._extractMetric(prompt, /Messages(?: exchanged| per day)?:\s*([^\n]+)/i, 'recent messages');
    const completion = this._extractMetric(prompt, /Task completion rate:\s*([^\n]+)/i, 'the current completion rate');

    return `1. Establish a weekly group check-in. With ${members} members and ${activeMembers} active, a short recurring check-in will keep quieter members visible.\n2. Organize tasks by owner and deadline. The task completion signal is ${completion}, so focus first on blocked, overdue, and high-priority work.\n3. Create shared notes after important discussions. The message activity is ${messages}; summaries prevent decisions from getting lost in chat.\n4. Schedule focused study sessions for difficult topics, then create follow-up tasks immediately after each session.\n5. Improve communication by using group chat for quick questions, notes for durable explanations, and calendar events for agreed meeting times.`;
  }

  _projectOverview() {
    return 'VStudy is a virtual study group platform. Its core workflow is: create or join groups, coordinate in group chat, manage tasks, write and share notes, schedule group events, upload files, run video/media sessions, use a collaborative whiteboard, and track notifications. The AI pages add study help, task prioritization, reminders, study pattern summaries, and group collaboration insights.';
  }

  _extractUserQuestion(prompt) {
    const match = prompt.match(/User Question:\s*([\s\S]*?)(?:\n\s*Context:|$)/i);
    return (match?.[1] || prompt || '').trim();
  }

  _extractPromptSection(prompt, label) {
    const index = prompt.indexOf(label);
    return index === -1 ? '' : prompt.slice(index + label.length);
  }

  _extractPromptLines(prompt, pattern) {
    return prompt
      .split('\n')
      .map(line => line.match(pattern))
      .filter(Boolean);
  }

  _extractMetric(prompt, pattern, fallback) {
    const match = prompt.match(pattern);
    return (match?.[1] || fallback).trim();
  }

  _matches(text, keywords) {
    return keywords.some(keyword => text.includes(keyword));
  }

  _taskReason(dueDate, priority) {
    const normalizedPriority = (priority || '').toLowerCase();
    const due = dueDate || 'No deadline';

    if (normalizedPriority.includes('high')) {
      return `high priority, due ${due}`;
    }

    if (/today|tomorrow|overdue/i.test(due)) {
      return `deadline-sensitive, due ${due}`;
    }

    if (!due || due.toLowerCase() === 'no deadline') {
      return `no deadline, use as a filler task after urgent work`;
    }

    return `priority ${priority || 'normal'}, due ${due}`;
  }

  async _makeOpenAIRequest(prompt, options, startTime) {
    const requestBody = {
      model: options.model || this.defaultModel,
      messages: [
        {
          role: 'system',
          content: options.systemPrompt || 'You are a helpful AI assistant for students and study groups.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: options.maxTokens || 500,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 1,
      frequency_penalty: options.frequencyPenalty ?? 0,
      presence_penalty: options.presencePenalty ?? 0,
    };

    const response = await this._fetchWithRetry('/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const responseTime = Date.now() - startTime;

    if (!response.choices || response.choices.length === 0) {
      throw new Error('No response from AI service');
    }

    return {
      content: response.choices[0].message.content.trim(),
      model: response.model,
      tokensUsed: response.usage?.total_tokens || 0,
      responseTime,
      confidence: this._calculateConfidence(response),
    };
  }

  async _makeGeminiRequest(prompt, options, startTime) {
    if (!this.genAIClient) {
      throw new Error('Gemini SDK client is not configured');
    }

    const model = options.model || this.defaultModel;
    const response = await this._runWithRetry(async () => {
      return this.genAIClient.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: options.systemPrompt || 'You are a helpful AI assistant for students and study groups.',
          temperature: options.temperature ?? 0.7,
          topP: options.topP ?? 1,
          maxOutputTokens: options.maxTokens || 500,
        },
      });
    });

    const responseTime = Date.now() - startTime;
    const content = response.text || this._extractGeminiText(response);

    if (!content) {
      throw new Error(this._describeGeminiEmptyResponse(response));
    }

    return {
      content: content.trim(),
      model: response.modelVersion || model,
      tokensUsed: response.usageMetadata?.totalTokenCount || 0,
      responseTime,
      confidence: this._calculateConfidence(response),
    };
  }

  _buildGeminiRestBody(prompt, options) {
    return {
      systemInstruction: {
        parts: [
          {
            text: options.systemPrompt || 'You are a helpful AI assistant for students and study groups.',
          },
        ],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: options.maxTokens || 500,
        temperature: options.temperature ?? 0.7,
        topP: options.topP ?? 1,
      },
    };
  }

  /**
   * Fetch with retry logic
   * @private
   */
  async _fetchWithRetry(endpoint, options, retries = 0) {
    const axios = require('axios');

    return this._runWithRetry(async () => {
      const url = endpoint.startsWith('http') ? endpoint : `${this.baseURL}${endpoint}`;
      const response = await axios({
        method: options.method || 'GET',
        url,
        data: options.body ? JSON.parse(options.body) : undefined,
        headers: options.headers,
        timeout: this.timeout,
      });
      
      return response.data;
    }, retries);
  }

  async _runWithRetry(operation, retries = 0) {
    try {
      return await operation();
    } catch (error) {
      if (this._isRateLimitError(error)) {
        const retryAfterMs = this._getRetryAfterMs(error) || 60000;
        if (this._shouldUseRateLimitCooldown()) {
          this._setRateLimitCooldown(retryAfterMs);
        }
        throw new Error(this._buildRateLimitMessage(retryAfterMs));
      }

      if (retries < this.maxRetries && this._isRetryableError(error)) {
        console.warn(`AI API retry ${retries + 1}/${this.maxRetries}:`, error.message);
        await this._delay(Math.pow(2, retries) * 1000);
        return this._runWithRetry(operation, retries + 1);
      }

      throw error;
    }
  }

  _isRateLimitError(error) {
    return (
      error.response?.status === 429 ||
      error.status === 429 ||
      error.code === 429 ||
      error.response?.data?.error?.status === 'RESOURCE_EXHAUSTED'
    );
  }

  _isRetryableError(error) {
    const status = error.response?.status || error.status;

    if (error.code === 'ECONNABORTED') {
      return false;
    }

    return !status || status === 408 || status >= 500;
  }

  _getRetryAfterMs(error) {
    const retryAfterHeader =
      error.response?.headers?.['retry-after'] ||
      error.response?.headers?.get?.('retry-after');
    const headerSeconds = Number(retryAfterHeader);

    if (Number.isFinite(headerSeconds) && headerSeconds > 0) {
      return headerSeconds * 1000;
    }

    const retryDelay = error.response?.data?.error?.details
      ?.map(detail => detail.retryDelay)
      .find(Boolean);

    if (typeof retryDelay === 'string') {
      const seconds = Number(retryDelay.replace(/s$/, ''));
      if (Number.isFinite(seconds) && seconds > 0) {
        return seconds * 1000;
      }
    }

    return null;
  }

  _setRateLimitCooldown(durationMs) {
    this.rateLimitCooldownUntil = Math.max(
      this.rateLimitCooldownUntil,
      Date.now() + durationMs
    );
  }

  _getRateLimitCooldownSeconds() {
    if (!this._shouldUseRateLimitCooldown()) {
      return 0;
    }

    return Math.max(0, Math.ceil((this.rateLimitCooldownUntil - Date.now()) / 1000));
  }

  _shouldUseRateLimitCooldown() {
    return process.env.NODE_ENV === 'production';
  }

  _buildRateLimitMessage(retryAfterMs) {
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    return `AI provider rate limit or quota reached (HTTP 429). Try again in about ${retryAfterSeconds} seconds.`;
  }

  /**
   * Calculate confidence score based on response
   * @private
   */
  _calculateConfidence(response) {
    // Simple confidence calculation based on response characteristics
    let confidence = 0.5;
    
    if (response.choices && response.choices[0]) {
      const choice = response.choices[0];
      
      // Higher confidence for longer, more detailed responses
      if (choice.message.content.length > 100) confidence += 0.2;
      if (choice.message.content.length > 300) confidence += 0.1;
      
      // Lower confidence if finish_reason indicates truncation
      if (choice.finish_reason === 'length') confidence -= 0.2;
      
      // Adjust based on model used
      if (response.model && response.model.includes('gpt-4')) confidence += 0.1;
    }

    if (response.candidates && response.candidates[0]) {
      const candidate = response.candidates[0];
      const content = this._extractGeminiText(response);

      if (content.length > 100) confidence += 0.2;
      if (content.length > 300) confidence += 0.1;
      if (candidate.finishReason === 'MAX_TOKENS') confidence -= 0.2;
      if (response.modelVersion && response.modelVersion.includes('gemini')) confidence += 0.1;
    }
    
    return Math.max(0, Math.min(1, confidence));
  }

  _extractGeminiText(response) {
    if (!response || typeof response !== 'object') {
      return '';
    }

    return (response.candidates?.[0]?.content?.parts || [])
      .map(part => part.text)
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  _describeGeminiEmptyResponse(response) {
    if (!response || typeof response !== 'object') {
      return 'Gemini returned a non-JSON response. Check that AI_API_URL points to https://generativelanguage.googleapis.com/v1beta, not Google AI Studio.';
    }

    const promptBlockReason = response.promptFeedback?.blockReason;
    if (promptBlockReason) {
      return `Gemini blocked the prompt (${promptBlockReason}). Try a different prompt or review the key/project safety settings.`;
    }

    const candidate = response.candidates?.[0];
    if (!candidate) {
      return 'Gemini returned no candidates. Check the model name and project quota in Google AI Studio.';
    }

    const finishReason = candidate.finishReason;
    if (finishReason === 'SAFETY') {
      return 'Gemini blocked the response for safety reasons. Try rephrasing the prompt.';
    }

    if (finishReason === 'MAX_TOKENS') {
      return 'Gemini stopped because the max token limit was reached before text was returned.';
    }

    if (finishReason) {
      return `Gemini returned no text. Finish reason: ${finishReason}.`;
    }

    return 'Gemini returned no text content in the response.';
  }

  /**
   * Get fallback response for service failures
   * @private
   */
  _getFallbackResponse(type, error = null) {
    const errorMessage = error?.message || '';

    if (
      errorMessage.includes('HTTP 429') ||
      errorMessage.toLowerCase().includes('rate-limit') ||
      errorMessage.toLowerCase().includes('rate limited') ||
      errorMessage.toLowerCase().includes('quota')
    ) {
      return 'The AI service is connected, but Gemini is currently rate-limiting or quota-limiting requests. Please wait a bit and try again, or check the Gemini API quota for this key.';
    }

    const fallbacks = {
      prioritization: 'I apologize, but I cannot provide task prioritization at the moment. Please try organizing your tasks by deadline and importance manually.',
      recommendation: 'I am currently unable to provide personalized recommendations. Consider reviewing your recent study patterns and adjusting your schedule accordingly.',
      insight: 'Group insights are temporarily unavailable. Consider discussing collaboration strategies with your group members directly.',
      question: 'I am unable to answer your question right now. Please try rephrasing your question or consult your study materials.',
      reminder: 'Reminder service is temporarily unavailable. Please set manual reminders for your important tasks.',
      analysis: 'Analysis features are currently unavailable. Please review your data manually for insights.',
    };
    
    return fallbacks[type] || 'I apologize, but I am temporarily unable to assist. Please try again later.';
  }

  /**
   * Build task prioritization prompt
   * @private
   */
  _buildTaskPrioritizationPrompt(tasks, userPreferences) {
    const tasksText = tasks.map(task => 
      `- ${task.title} (Due: ${task.dueDate || 'No deadline'}, Priority: ${task.priority || 'Normal'})`
    ).join('\n');
    
    return `Based on the following tasks and user preferences, provide prioritization recommendations:

Tasks:
${tasksText}

User Preferences:
- Learning Style: ${userPreferences.UserPref_learningStyle}
- Study Hours: ${userPreferences.UserPref_studyHours?.join(', ')}
- Preferred Session Length: ${userPreferences.UserPref_studyGoals?.preferred_session_length} minutes
- Daily Goal: ${userPreferences.UserPref_studyGoals?.daily_hours} hours

Please provide:
1. Recommended task order with reasoning
2. Suggested time allocation for each task
3. Any scheduling recommendations based on user preferences`;
  }

  /**
   * Build study recommendation prompt
   * @private
   */
  _buildStudyRecommendationPrompt(studyData, userPreferences) {
    return `Based on the following study data and user preferences, provide personalized study recommendations:

Recent Study Patterns:
- Total study time this week: ${studyData.weeklyHours || 0} hours
- Average session length: ${studyData.avgSessionLength || 0} minutes
- Most productive times: ${studyData.productiveTimes?.join(', ') || 'Unknown'}
- Subjects studied: ${studyData.subjects?.join(', ') || 'Various'}

User Preferences:
- Learning Style: ${userPreferences.UserPref_learningStyle}
- Goal: ${userPreferences.UserPref_studyGoals?.daily_hours} hours/day
- Preferred break frequency: ${userPreferences.UserPref_studyGoals?.break_frequency} minutes

Please provide:
1. Personalized study schedule recommendations
2. Suggestions for improving study effectiveness
3. Recommendations for better work-life balance`;
  }

  /**
   * Build group insights prompt
   * @private
   */
  _buildGroupInsightsPrompt(groupData, userPreferences) {
    return `Analyze the following group collaboration data and provide insights:

Group Activity:
- Total members: ${groupData.memberCount || 0}
- Active members this week: ${groupData.activeMembers || 0}
- Messages exchanged: ${groupData.messageCount || 0}
- Files shared: ${groupData.fileCount || 0}
- Study sessions: ${groupData.sessionCount || 0}

Collaboration Patterns:
- Most active times: ${groupData.activeTimes?.join(', ') || 'Unknown'}
- Popular discussion topics: ${groupData.topics?.join(', ') || 'Various'}
- Average session participation: ${groupData.avgParticipation || 0}%

Please provide:
1. Analysis of group collaboration effectiveness
2. Suggestions for improving group dynamics
3. Recommendations for better coordination and productivity`;
  }

  /**
   * Build question answering prompt
   * @private
   */
  _buildQuestionPrompt(question, context, userPreferences) {
    let contextText = '';
    
    if (context.tasks && context.tasks.length > 0) {
      contextText += `\nRelevant Tasks:\n${context.tasks.map(t => `- ${t.title}`).join('\n')}`;
    }
    
    if (context.notes && context.notes.length > 0) {
      contextText += `\nRelevant Notes:\n${context.notes.map(n => `- ${n.title}`).join('\n')}`;
    }
    
    if (context.groupActivity) {
      contextText += `\nGroup Context: Recent discussions about ${context.groupActivity.topics?.join(', ') || 'various topics'}`;
    }
    
    return `User Question: ${question}

Context:${contextText}

User Learning Style: ${userPreferences.UserPref_learningStyle}
Preferred AI Personality: ${userPreferences.UserPref_aiPersonality}

Please provide a helpful, personalized answer that considers the user's learning style and available context.`;
  }

  /**
   * Delay utility for retry logic
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new AIService(); 
