import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FaBell,
  FaBrain,
  FaCalendarAlt,
  FaCheckCircle,
  FaChartLine,
  FaClock,
  FaExclamationTriangle,
  FaLightbulb,
  FaRedo,
  FaTasks,
} from 'react-icons/fa';
import api from '../../api';
import { ensureStringId } from '../../utils/objectId';
import { subscribeToGroupsUpdated } from '../../utils/groupEvents';
import './SmartTaskPrioritization.css';

const SmartTaskPrioritization = () => {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(groupId || null);
  const [tasks, setTasks] = useState([]);
  const [recommendations, setRecommendations] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [studyPatterns, setStudyPatterns] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDays, setSelectedDays] = useState(30);

  const fetchGroups = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await api.get('/group/user-groups', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const fetchedGroups = res.data.groups || [];
      setGroups(fetchedGroups);

      const routeGroupId = groupId ? ensureStringId(groupId) : null;
      const routeGroupExists = routeGroupId
        ? fetchedGroups.some((group) => ensureStringId(group._id) === routeGroupId)
        : false;
      const nextGroupId = routeGroupExists
        ? routeGroupId
        : fetchedGroups.length > 0
        ? ensureStringId(fetchedGroups[0]._id)
        : null;

      if (nextGroupId) {
        setActiveGroup(nextGroupId);
      }
    } catch (err) {
      setError('Failed to load your groups.');
      console.error('Error fetching groups:', err);
    }
  }, [groupId]);

  const fetchTasks = useCallback(async () => {
    if (!activeGroup) {
      setTasks([]);
      return;
    }

    setTasksLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await api.get(`/task/group/${activeGroup}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTasks(res.data.tasks || res.data || []);
    } catch (err) {
      setTasks([]);
      console.error('Error fetching tasks:', err);
    } finally {
      setTasksLoading(false);
    }
  }, [activeGroup]);

  const fetchSmartPrioritization = useCallback(async () => {
    if (!activeGroup) return;

    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await api.get(`/ai/smart-prioritization/${activeGroup}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) return;
      setRecommendations(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch smart prioritization.');
      console.error('Error fetching prioritization:', err);
    } finally {
      setLoading(false);
    }
  }, [activeGroup]);

  const fetchReminders = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await api.get('/ai/intelligent-reminders', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) return;
      setReminders(res.data?.data?.reminders || []);
    } catch (err) {
      console.error('Error fetching reminders:', err);
    }
  }, []);

  const fetchStudyPatterns = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await api.get(`/ai/study-patterns/${selectedDays}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) return;
      setStudyPatterns(res.data?.data || null);
    } catch (err) {
      console.error('Error fetching study patterns:', err);
    }
  }, [selectedDays]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    const unsubscribe = subscribeToGroupsUpdated(() => {
      fetchGroups();
    });
    return unsubscribe;
  }, [fetchGroups]);

  useEffect(() => {
    if (activeGroup) {
      fetchTasks();
      fetchSmartPrioritization();
      fetchReminders();
    }
  }, [activeGroup, fetchTasks, fetchSmartPrioritization, fetchReminders]);

  useEffect(() => {
    fetchStudyPatterns();
  }, [fetchStudyPatterns]);

  const activeGroupName = useMemo(() => {
    const group = groups.find((item) => ensureStringId(item._id) === ensureStringId(activeGroup));
    return group?.Group_name || 'Selected group';
  }, [groups, activeGroup]);

  const prioritizedTasks = useMemo(() => {
    const recommendedTasks = Array.isArray(recommendations?.recommendations)
      ? recommendations.recommendations
      : [];
    const recommendedIds = new Set(
      recommendedTasks
        .map((task) => ensureStringId(task._id || task.taskId))
        .filter(Boolean)
    );
    const missingOpenTasks = tasks.filter((task) => {
      const taskId = ensureStringId(task._id || task.taskId);
      const status = (task?.Task_status || task?.status || 'pending').toLowerCase();
      return status !== 'completed' && taskId && !recommendedIds.has(taskId);
    });

    return [...recommendedTasks, ...missingOpenTasks];
  }, [recommendations, tasks]);

  const taskStats = useMemo(() => {
    const openTasks = tasks.filter((task) => task.Task_status !== 'completed');
    const overdueTasks = tasks.filter((task) => {
      if (!task.Task_dueDate || task.Task_status === 'completed') return false;
      return new Date(task.Task_dueDate) < new Date();
    });
    const highPriorityTasks = tasks.filter(
      (task) => task.Task_priority?.toLowerCase() === 'high' && task.Task_status !== 'completed'
    );

    return {
      total: tasks.length,
      open: openTasks.length,
      overdue: overdueTasks.length,
      highPriority: highPriorityTasks.length,
    };
  }, [tasks]);

  const getPriorityColor = (priority) => {
    const normalizedPriority =
      typeof priority === 'number'
        ? priority >= 0.7
          ? 'high'
          : priority >= 0.4
          ? 'medium'
          : 'low'
        : priority?.toLowerCase();

    switch (normalizedPriority) {
      case 'high':
        return '#dc2626';
      case 'medium':
        return '#d97706';
      case 'low':
        return '#059669';
      default:
        return '#64748b';
    }
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      pending: { label: 'Pending', color: '#64748b' },
      'in-progress': { label: 'In Progress', color: '#2563eb' },
      completed: { label: 'Completed', color: '#059669' },
    };
    return statusMap[status?.toLowerCase()] || statusMap.pending;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'No due date';
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = date - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'Overdue';
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    if (diffDays <= 7) return `Due in ${diffDays} days`;
    return date.toLocaleDateString();
  };

  const getTaskTitle = (task) => task?.Task_name || task?.Task_title || task?.title || 'Untitled task';
  const getTaskPriority = (task) => task?.Task_priority || task?.priority || 'medium';
  const getTaskStatus = (task) => task?.Task_status || task?.status || 'pending';
  const getTaskDueDate = (task) => task?.Task_dueDate || task?.dueDate;
  const getTaskScore = (task) =>
    typeof task?.priorityScore === 'number' ? Math.round(task.priorityScore * 100) : null;

  const handleGroupChange = (e) => {
    const selectedGroup = ensureStringId(e.target.value);
    setActiveGroup(selectedGroup);
    setRecommendations(null);
    setError('');

    if (selectedGroup) {
      navigate(`/dashboard/smart-prioritization/${selectedGroup}`);
    } else {
      navigate('/dashboard/smart-prioritization');
    }
  };

  const navigateToTasks = () => {
    navigate(activeGroup ? `/dashboard/task-manager/${activeGroup}` : '/dashboard/task-manager');
  };

  const renderInsights = () => {
    const insight = recommendations?.aiInsights || recommendations?.recommendations;
    if (!insight || Array.isArray(insight)) return null;

    return (
      <div className="ai-insight">
        <div className="insight-icon">
          <FaLightbulb />
        </div>
        <p>{insight}</p>
      </div>
    );
  };

  return (
    <div className="smart-prioritization">
      <div className="smart-hero">
        <div>
          <p className="eyebrow">AI planning</p>
          <h1>Smart Task Prioritization</h1>
          <p className="hero-copy">
            See what needs attention first, why it matters, and where to act next.
          </p>
        </div>
        <div className="hero-actions">
          <select value={activeGroup || ''} onChange={handleGroupChange} className="group-select">
            <option value="">Select a group</option>
            {groups.map((group) => (
              <option key={group._id} value={group._id}>
                {group.Group_name}
              </option>
            ))}
          </select>
          <button className="secondary-action" onClick={navigateToTasks}>
            <FaTasks /> Task Manager
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {!activeGroup ? (
        <div className="empty-panel">
          <FaTasks />
          <h2>No group selected</h2>
          <p>Select a group to generate task priorities and study recommendations.</p>
        </div>
      ) : (
        <div className="prioritization-content">
          <div className="summary-grid">
            <div className="summary-card">
              <span>Group tasks</span>
              <strong>{tasksLoading ? '...' : taskStats.total}</strong>
            </div>
            <div className="summary-card">
              <span>Open tasks</span>
              <strong>{tasksLoading ? '...' : taskStats.open}</strong>
            </div>
            <div className="summary-card danger">
              <span>Overdue</span>
              <strong>{tasksLoading ? '...' : taskStats.overdue}</strong>
            </div>
            <div className="summary-card warning">
              <span>High priority</span>
              <strong>{tasksLoading ? '...' : taskStats.highPriority}</strong>
            </div>
          </div>

          <div className="section recommendations-section">
            <div className="section-header">
              <div>
                <h2>
                  <FaBrain /> Priority Plan
                </h2>
                <p>Ranked from most urgent to least urgent for {activeGroupName}.</p>
              </div>
              <button onClick={fetchSmartPrioritization} disabled={loading} className="refresh-button">
                <FaRedo /> Refresh
              </button>
            </div>
            {loading ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Analyzing tasks...</p>
              </div>
            ) : recommendations || prioritizedTasks.length > 0 ? (
              <div className="recommendations-content">
                <div className="recommendation-topline">
                  <div className="confidence-badge">
                    Confidence: {Math.round((recommendations?.confidence || 0) * 100)}%
                  </div>
                  {recommendations?.metadata && (
                    <div className="metadata-pills">
                      <span>{recommendations.metadata.totalTasks || 0} open group tasks analyzed</span>
                      <span>{recommendations.metadata.overdueTasks || 0} overdue</span>
                    </div>
                  )}
                </div>
                {renderInsights()}
                {prioritizedTasks.length > 0 ? (
                  <div className="priority-list">
                    {prioritizedTasks.map((task, index) => {
                      const score = getTaskScore(task);
                      const status = getStatusBadge(getTaskStatus(task));

                      return (
                        <div
                          key={task._id || task.taskId || index}
                          className="priority-item"
                          onClick={navigateToTasks}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') navigateToTasks();
                          }}
                        >
                          <div className="priority-rank">#{index + 1}</div>
                          <div className="priority-details">
                            <h3>{getTaskTitle(task)}</h3>
                            <p className="priority-reason">
                              {task.isOverdue
                                ? 'This task is overdue and should be handled first.'
                                : task.daysUntilDue === 0
                                ? 'This task is due today.'
                                : task.daysUntilDue
                                ? `Due in ${task.daysUntilDue} day${task.daysUntilDue === 1 ? '' : 's'}.`
                                : 'Prioritized from deadline, priority, and estimated effort.'}
                            </p>
                            <div className="priority-meta">
                              <span
                                className="priority-badge"
                                style={{ background: getPriorityColor(getTaskPriority(task)) }}
                              >
                                {getTaskPriority(task)}
                              </span>
                              <span className="status-badge" style={{ background: status.color }}>
                                {status.label}
                              </span>
                              <span className="due-date">
                                <FaCalendarAlt /> {formatDate(getTaskDueDate(task))}
                              </span>
                              {score !== null && <span className="score-pill">{score}% focus score</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state">
                    <FaCheckCircle />
                    <p>{recommendations?.message || 'No assigned tasks need prioritization right now.'}</p>
                    <button onClick={navigateToTasks}>Open Task Manager</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state">
                <FaBrain />
                <p>No recommendations available yet.</p>
              </div>
            )}
          </div>

          <div className="section reminders-section">
            <div className="section-header">
              <div>
                <h2>
                  <FaBell /> Intelligent Reminders
                </h2>
                <p>Timely nudges based on due dates and study habits.</p>
              </div>
            </div>
            {reminders.length === 0 ? (
              <div className="empty-state compact">
                <FaCheckCircle />
                <p>No reminders at this time.</p>
              </div>
            ) : (
              <div className="reminders-list">
                {reminders.map((reminder, index) => (
                  <div key={index} className={`reminder-item priority-${reminder.urgency || reminder.priority}`}>
                    <div className="reminder-icon">
                      <FaExclamationTriangle />
                    </div>
                    <div className="reminder-content">
                      <h3>{reminder.title || reminder.message}</h3>
                      {reminder.title && <p>{reminder.message}</p>}
                      <p className="reminder-time">
                        {reminder.dueDate
                          ? `Due: ${formatDate(reminder.dueDate)}`
                          : reminder.suggestedTime
                          ? `Suggested: ${new Date(reminder.suggestedTime).toLocaleString()}`
                          : 'Suggested study reminder'}
                      </p>
                    </div>
                    <span
                      className="reminder-priority"
                      style={{ background: getPriorityColor(reminder.urgency || reminder.priority) }}
                    >
                      {typeof reminder.priority === 'number' ? reminder.urgency || 'medium' : reminder.priority}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="section patterns-section">
            <div className="section-header">
              <div>
                <h2>
                  <FaChartLine /> Study Pattern Analysis
                </h2>
                <p>Activity patterns that can guide better planning.</p>
              </div>
              <select
                value={selectedDays}
                onChange={(e) => setSelectedDays(Number(e.target.value))}
                className="days-select"
              >
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>
            {studyPatterns ? (
              <div className="patterns-content">
                <div className="patterns-grid">
                  <div className="pattern-card teal">
                    <div className="pattern-icon">
                      <FaClock />
                    </div>
                    <div className="pattern-info">
                      <h3>Most Productive Times</h3>
                      <p>{studyPatterns.patterns?.mostProductiveTimes?.join(', ') || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="pattern-card blue">
                    <div className="pattern-icon">
                      <FaTasks />
                    </div>
                    <div className="pattern-info">
                      <h3>Weekly Study Estimate</h3>
                      <p>{studyPatterns.patterns?.weeklyStudyHours?.toFixed(1) || 0} hours</p>
                    </div>
                  </div>
                  <div className="pattern-card gold">
                    <div className="pattern-icon">
                      <FaCheckCircle />
                    </div>
                    <div className="pattern-info">
                      <h3>Completion Rate</h3>
                      <p>{(studyPatterns.patterns?.taskCompletionRate || 0).toFixed(0)}%</p>
                    </div>
                  </div>
                </div>
                {studyPatterns.recommendations && (
                  <div className="pattern-recommendations">
                    <h3>Recommendations</h3>
                    <p>{studyPatterns.recommendations}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state compact">
                <div className="spinner small"></div>
                <p>Loading study patterns...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartTaskPrioritization;
