import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api';
import { subscribeToGroupsUpdated } from '../../utils/groupEvents';
import './GroupInsightsDashboard.css';

const GroupInsightsDashboard = () => {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(groupId || null);
  const [insights, setInsights] = useState(null);
  const [productivitySuggestions, setProductivitySuggestions] = useState(null);
  const [taskSuggestions, setTaskSuggestions] = useState(null);
  const [collaborationAnalysis, setCollaborationAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timeframe, setTimeframe] = useState(30);
  const inFlightRequestRef = useRef(null);
  const lastCompletedRequestRef = useRef({ key: null, timestamp: 0 });

  const handleGroupChange = (nextGroupId) => {
    setActiveGroup(nextGroupId || null);

    if (nextGroupId) {
      navigate(`/dashboard/group-insights/${nextGroupId}`, { replace: true });
    } else {
      navigate('/dashboard/group-insights', { replace: true });
    }
  };

  const fetchGroups = useCallback(async () => {
    try {
      const res = await api.get('/group/user-groups');
      setGroups(res.data.groups || []);
      if (!groupId && res.data.groups.length > 0) {
        setActiveGroup(res.data.groups[0]._id);
      }
    } catch (err) {
      console.error('Error fetching groups:', err);
    }
  }, [groupId]);

  const fetchGroupInsights = useCallback(async (force = false) => {
    if (!activeGroup) return;

    const requestKey = `${activeGroup}:${timeframe}`;
    const lastCompleted = lastCompletedRequestRef.current;

    if (inFlightRequestRef.current === requestKey) {
      return;
    }

    if (!force && lastCompleted.key === requestKey && Date.now() - lastCompleted.timestamp < 60000) {
      return;
    }

    inFlightRequestRef.current = requestKey;
    setLoading(true);
    setError('');
    try {
      
      // Fetch comprehensive insights
      const insightsRes = await api.post('/ai/group-insights', {
        groupId: activeGroup,
        timeframe,
        options: {
          includeProductivitySuggestions: true,
          includeTaskSuggestions: true,
          includeCollaborationAnalysis: true
        }
      });

      const data = insightsRes.data?.data;
      if (!data) {
        setError('Unexpected response from server. Please try again');
        return;
      }
      setInsights(data);
      setProductivitySuggestions(data.productivitySuggestions || null);
      setTaskSuggestions(data.taskSuggestions || null);
      setCollaborationAnalysis(data.collaborationAnalysis || null);
      lastCompletedRequestRef.current = { key: requestKey, timestamp: Date.now() };
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.response?.data?.error?.message || 'Failed to fetch insights';
      setError(errorMessage);
      console.error('Error fetching insights:', err);
      
      // Handle 401 specifically
      if (err.response?.status === 401) {
        setError('Session expired. Please log in again.');
        // Optionally redirect to login
        // window.location.href = '/login';
      } else if (err.response?.status === 429) {
        setError('Too many insight refreshes. Please wait a moment before trying again.');
      }
    } finally {
      if (inFlightRequestRef.current === requestKey) {
        inFlightRequestRef.current = null;
      }
      setLoading(false);
    }
  }, [activeGroup, timeframe]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    setActiveGroup(groupId || null);
  }, [groupId]);

  useEffect(() => {
    const unsubscribe = subscribeToGroupsUpdated(() => {
      fetchGroups();
    });
    return unsubscribe;
  }, [fetchGroups]);

  useEffect(() => {
    if (activeGroup) {
      fetchGroupInsights();
    }
  }, [activeGroup, timeframe, fetchGroupInsights]);

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'increasing': return { icon: 'fa-arrow-up', color: '#4CAF50' };
      case 'decreasing': return { icon: 'fa-arrow-down', color: '#f44336' };
      case 'stable': return { icon: 'fa-minus', color: '#ff9800' };
      default: return { icon: 'fa-minus', color: '#999' };
    }
  };

  const getEngagementColor = (score) => {
    if (score >= 0.8) return '#4CAF50';
    if (score >= 0.5) return '#ff9800';
    return '#f44336';
  };

  const formatNumber = (value, decimals = 1) => {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number.toFixed(decimals) : '0.0';
  };

  const getCommunicationSummary = () => {
    const patterns = collaborationAnalysis?.communicationPatterns;
    if (!patterns || typeof patterns !== 'object') {
      return patterns || 'No communication data available yet.';
    }

    const activeHours = Array.isArray(patterns.activeHours) && patterns.activeHours.length > 0
      ? ` Peak hours: ${patterns.activeHours.join(', ')}.`
      : '';

    return `${formatNumber(patterns.messageFrequency)} messages per day, ${formatNumber(patterns.averageResponseTime)} hour average response time, and ${patterns.conversationThreads || 0} threaded discussions.${activeHours}`;
  };

  const getParticipationSummary = () => {
    const balance = collaborationAnalysis?.participationBalance;
    if (!balance || typeof balance !== 'object') {
      return balance || 'No participation data available yet.';
    }

    const balanceLabel = balance.giniCoefficient < 0.3
      ? 'well balanced'
      : balance.giniCoefficient > 0.6
        ? 'uneven'
        : 'moderately balanced';

    return `Participation is ${balanceLabel}, with ${formatNumber(balance.averageMessagesPerMember)} messages per member on average.`;
  };

  const getEffectivenessSummary = () => {
    const effectiveness = collaborationAnalysis?.collaborationEffectiveness;
    if (!effectiveness || typeof effectiveness !== 'object') {
      return collaborationAnalysis?.responseTime || 'No effectiveness data available yet.';
    }

    return `${formatNumber(effectiveness.taskCompletionRate * 100, 0)}% task completion, ${formatNumber(effectiveness.collaborationRate * 100, 0)}% note collaboration, and ${formatNumber(effectiveness.teamworkRate * 100, 0)}% shared task work.`;
  };

  const memberEngagementList = insights?.memberEngagement?.memberEngagement || [];

  return (
    <div className="group-insights-dashboard">
      <div className="dashboard-header">
        <h1>Group Insights Dashboard</h1>
        <div className="header-controls">
          {activeGroup && (
            <button
              type="button"
              className="manage-group-button"
              onClick={() => navigate('/dashboard/group-management')}
            >
              <i className="fas fa-users-cog"></i> Manage Group
            </button>
          )}
          <select
            value={activeGroup || ''}
            onChange={(e) => handleGroupChange(e.target.value)}
            className="group-select"
          >
            <option value="">Select a group</option>
            {groups.map(group => (
              <option key={group._id} value={group._id}>
                {group.Group_name}
              </option>
            ))}
          </select>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(Number(e.target.value))}
            className="timeframe-select"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button onClick={() => fetchGroupInsights(true)} disabled={loading}>
            <i className="fas fa-sync-alt"></i> Refresh
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {activeGroup && (
        <div className="dashboard-content">
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Analyzing group data...</p>
            </div>
          ) : insights ? (
            <>
              {/* Group Metrics Overview */}
              <div className="section metrics-section">
                <h2><i className="fas fa-chart-bar"></i> Group Metrics</h2>
                <div className="metrics-grid">
                  <div className="metric-card">
                    <div className="metric-icon">
                      <i className="fas fa-comments"></i>
                    </div>
                    <div className="metric-content">
                      <div className="metric-value">{formatNumber(insights.groupMetrics?.messagesPerDay)}</div>
                      <div className="metric-label">Messages Per Day</div>
                      {insights.trends?.messageVolume && (
                        <div className="metric-trend" style={{ color: getTrendIcon(insights.trends.messageVolume).color }}>
                          <i className={`fas ${getTrendIcon(insights.trends.messageVolume).icon}`}></i>
                          {insights.trends.messageVolume}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-icon">
                      <i className="fas fa-tasks"></i>
                    </div>
                    <div className="metric-content">
                      <div className="metric-value">{formatNumber((insights.groupMetrics?.completionRate || 0) * 100, 0)}%</div>
                      <div className="metric-label">Task Completion</div>
                      {insights.trends?.taskCompletion && (
                        <div className="metric-trend" style={{ color: getTrendIcon(insights.trends.taskCompletion).color }}>
                          <i className={`fas ${getTrendIcon(insights.trends.taskCompletion).icon}`}></i>
                          {insights.trends.taskCompletion}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-icon">
                      <i className="fas fa-users"></i>
                    </div>
                    <div className="metric-content">
                      <div className="metric-value">{insights.groupMetrics?.activeMembers || 0}</div>
                      <div className="metric-label">Active Members</div>
                      {insights.trends?.memberActivity && (
                        <div className="metric-trend" style={{ color: getTrendIcon(insights.trends.memberActivity).color }}>
                          <i className={`fas ${getTrendIcon(insights.trends.memberActivity).icon}`}></i>
                          {insights.trends.memberActivity}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-icon">
                      <i className="fas fa-star"></i>
                    </div>
                    <div className="metric-content">
                      <div className="metric-value">
                        {((insights.groupMetrics?.engagementScore || 0) * 100).toFixed(0)}%
                      </div>
                      <div className="metric-label">Engagement Score</div>
                      <div 
                        className="engagement-bar"
                        style={{ 
                          width: `${(insights.groupMetrics?.engagementScore || 0) * 100}%`,
                          background: getEngagementColor(insights.groupMetrics?.engagementScore || 0)
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Productivity Suggestions */}
              {productivitySuggestions && (
                <div className="section suggestions-section">
                  <h2><i className="fas fa-lightbulb"></i> Productivity Suggestions</h2>
                  <div className="suggestions-grid">
                    {productivitySuggestions.timeManagement && productivitySuggestions.timeManagement.length > 0 && (
                      <div className="suggestion-category">
                        <h3><i className="fas fa-clock"></i> Time Management</h3>
                        <ul>
                          {productivitySuggestions.timeManagement.map((suggestion, index) => (
                            <li key={index}>
                              <strong>{suggestion.title || suggestion}</strong>
                              {suggestion.description && <p>{suggestion.description}</p>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {productivitySuggestions.workflowOptimization && productivitySuggestions.workflowOptimization.length > 0 && (
                      <div className="suggestion-category">
                        <h3><i className="fas fa-cogs"></i> Workflow Optimization</h3>
                        <ul>
                          {productivitySuggestions.workflowOptimization.map((suggestion, index) => (
                            <li key={index}>
                              <strong>{suggestion.title || suggestion}</strong>
                              {suggestion.description && <p>{suggestion.description}</p>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {productivitySuggestions.toolRecommendations && productivitySuggestions.toolRecommendations.length > 0 && (
                      <div className="suggestion-category">
                        <h3><i className="fas fa-tools"></i> Tool Recommendations</h3>
                        <ul>
                          {productivitySuggestions.toolRecommendations.map((suggestion, index) => (
                            <li key={index}>
                              <strong>{suggestion.title || suggestion}</strong>
                              {suggestion.description && <p>{suggestion.description}</p>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {productivitySuggestions.meetingOptimization && productivitySuggestions.meetingOptimization.length > 0 && (
                      <div className="suggestion-category">
                        <h3><i className="fas fa-calendar-alt"></i> Meeting Optimization</h3>
                        <ul>
                          {productivitySuggestions.meetingOptimization.map((suggestion, index) => (
                            <li key={index}>
                              <strong>{suggestion.title || suggestion}</strong>
                              {suggestion.description && <p>{suggestion.description}</p>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {productivitySuggestions.focusAreas && productivitySuggestions.focusAreas.length > 0 && (
                      <div className="suggestion-category">
                        <h3><i className="fas fa-bullseye"></i> Focus Areas</h3>
                        <ul>
                          {productivitySuggestions.focusAreas.map((suggestion, index) => (
                            <li key={index}>
                              <strong>{suggestion.title || suggestion}</strong>
                              {suggestion.description && <p>{suggestion.description}</p>}
                              {suggestion.actionItems && suggestion.actionItems.length > 0 && (
                                <ul className="action-items">
                                  {suggestion.actionItems.map((action, idx) => (
                                    <li key={idx}>{action}</li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Task Suggestions */}
              {taskSuggestions?.fromDiscussions && taskSuggestions.fromDiscussions.length > 0 && (
                <div className="section task-suggestions-section">
                  <h2><i className="fas fa-magic"></i> Automated Task Suggestions</h2>
                  <div className="task-suggestions-list">
                    {taskSuggestions.fromDiscussions.map((suggestion, index) => (
                      <div key={index} className="task-suggestion-item">
                        <div className="suggestion-header">
                          <h3>{suggestion.suggestedTitle || suggestion.title}</h3>
                          <span className={`priority-badge priority-${suggestion.priority}`}>
                            {suggestion.priority}
                          </span>
                        </div>
                        <p className="suggestion-reason">{suggestion.reason || suggestion.description}</p>
                        {suggestion.relatedMessages && suggestion.relatedMessages.length > 0 && (
                          <div className="related-messages">
                            <i className="fas fa-link"></i>
                            {suggestion.relatedMessages.length} related discussion{suggestion.relatedMessages.length > 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Collaboration Analysis */}
              {collaborationAnalysis && (
                <div className="section collaboration-section">
                  <h2><i className="fas fa-project-diagram"></i> Collaboration Analysis</h2>
                  <div className="collaboration-content">
                    <div className="collaboration-insights">
                      <div className="insight-item">
                        <h3>Communication Patterns</h3>
                        <p>{getCommunicationSummary()}</p>
                      </div>
                      <div className="insight-item">
                        <h3>Participation Balance</h3>
                        <p>{getParticipationSummary()}</p>
                      </div>
                      <div className="insight-item">
                        <h3>Collaboration Effectiveness</h3>
                        <p>{getEffectivenessSummary()}</p>
                      </div>
                    </div>

                    {memberEngagementList.length > 0 && (
                      <div className="member-engagement">
                        <h3>Member Engagement</h3>
                        <div className="engagement-list">
                          {memberEngagementList.map((member, index) => (
                            <div key={index} className="engagement-item">
                              <div className="member-info">
                                <div className="member-name">{member.userName || member.member?.User_name || 'Member'}</div>
                                <div className="member-stats">
                                  <span><i className="fas fa-comments"></i> {member.messageCount} messages</span>
                                  <span><i className="fas fa-check-circle"></i> {member.completedTasks || 0}/{member.taskCount || 0} tasks</span>
                                </div>
                              </div>
                              <div className="engagement-score">
                                <div 
                                  className="score-bar"
                                  style={{ 
                                    width: `${member.engagementScore * 100}%`,
                                    background: getEngagementColor(member.engagementScore)
                                  }}
                                ></div>
                                <span>{(member.engagementScore * 100).toFixed(0)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <i className="fas fa-chart-line"></i>
              <p>Select a group to view insights</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GroupInsightsDashboard;
