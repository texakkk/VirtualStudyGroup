import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { FaArrowLeft, FaHistory, FaRobot, FaTrash, FaUser, FaExclamationTriangle, FaThumbsUp, FaThumbsDown, FaPaperPlane } from 'react-icons/fa';
import api from '../../api';
import { subscribeToGroupsUpdated } from '../../utils/groupEvents';
import './AIAssistant.css';

const AIAssistant = () => {
  const { groupId } = useParams();
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(groupId || null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchGroups = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await api.get('/group/user-groups', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const fetchedGroups = res.data.groups || [];
      setGroups(fetchedGroups);
      setActiveGroup(prevGroup => {
        if (prevGroup !== null || groupId || fetchedGroups.length === 0) {
          return prevGroup;
        }

        return toStableId(fetchedGroups[0]._id);
      });
    } catch (err) {
      console.error('Error fetching groups:', err);
    }
  }, [groupId]);

  const fetchHistory = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await api.get('/ai/history', {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          limit: 20,
          ...(activeGroup ? { groupId: toStableId(activeGroup) } : {})
        }
      });
      setHistory(res.data.data || []);
    } catch (err) {
      console.error('Error fetching history:', err);
    }
  }, [activeGroup]);

  useEffect(() => {
    setActiveGroup(groupId || null);
  }, [groupId]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    const unsubscribe = subscribeToGroupsUpdated(() => {
      fetchGroups();
    });
    return unsubscribe;
  }, [fetchGroups]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const res = await api.post('/ai/ask-question', {
        question: inputMessage,
        groupId: activeGroup,
        includeContext: true
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const aiMessage = {
        id: Date.now() + 1,
        type: 'ai',
        content: res.data.data.answer,
        confidence: res.data.data.confidence,
        interactionId: res.data.data.interactionId,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);
      fetchHistory();
    } catch (err) {
      const errorMessage = {
        id: Date.now() + 1,
        type: 'error',
        content: err.response?.data?.message || 'Failed to get AI response',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleFeedback = async (interactionId, feedback) => {
    try {
      const token = localStorage.getItem('token');
      await api.post('/ai/feedback', {
        interactionId,
        feedback
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setMessages(prev => prev.map(msg => 
        msg.interactionId === interactionId 
          ? { ...msg, feedback } 
          : msg
      ));
      fetchHistory();
    } catch (err) {
      console.error('Error submitting feedback:', err);
    }
  };

  const getHistoryInput = (item) =>
    getHistoryField(item, ['AI_input', 'input', 'question', 'prompt', 'AI_question', 'query'], ['input', 'question', 'prompt', 'query']) ||
    'No prompt text available';

  const getHistoryResponse = (item) =>
    getHistoryField(item, ['AI_response', 'response', 'answer', 'AI_answer'], ['response', 'answer', 'output', 'result']) ||
    'No response text available.';

  const getHistoryType = (item) =>
    getHistoryField(item, ['AI_type', 'type'], ['type', 'category']) || 'interaction';

  function getHistoryField(item, fieldNames, keywords) {
    if (!item || typeof item !== 'object') return null;

    const directValue = findDirectField(item, fieldNames);
    if (directValue) return directValue;

    return extractFieldByKeywords(item, keywords);
  }

  function findDirectField(item, fieldNames, visited = new Set()) {
    if (!item || typeof item !== 'object' || visited.has(item)) return null;
    visited.add(item);

    for (const fieldName of fieldNames) {
      const value = item[fieldName];
      const normalized = normalizeHistoryValue(value);
      if (normalized) return normalized;
    }

    for (const key of ['_doc', 'doc', 'data', 'interaction']) {
      const value = findDirectField(item[key], fieldNames, visited);
      if (value) return value;
    }

    return null;
  }

  function extractFieldByKeywords(item, keywords, visited = new Set()) {
    if (!item || typeof item !== 'object' || visited.has(item)) return null;
    visited.add(item);

    for (const [key, value] of Object.entries(item)) {
      const keyLower = key.toLowerCase();
      const keyMatch = keywords.some(k => keyLower.includes(k));
      if (!keyMatch) continue;

      const normalized = normalizeHistoryValue(value);
      if (normalized) return normalized;
    }

    for (const value of Object.values(item)) {
      if (!value || typeof value !== 'object') continue;
      const nestedValue = extractFieldByKeywords(value, keywords, visited);
      if (nestedValue) return nestedValue;
    }

    return null;
  }

  function normalizeHistoryValue(value) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
    if (value && typeof value === 'object') {
      if (typeof value.$date === 'string') return value.$date;
      if (typeof value.date === 'string') return value.date;
      if (typeof value.value === 'string') return value.value;
    }

    return null;
  }

  const formatHistoryDate = (item) => {
    const rawDate =
      item?.AI_createdAt ||
      item?.createdAt ||
      item?.AI_updatedAt ||
      item?.updatedAt ||
      item?.timestamp ||
      item?.date ||
      findDirectField(item, ['AI_createdAt', 'createdAt', 'AI_updatedAt', 'updatedAt', 'timestamp', 'date']) ||
      extractFieldByKeywords(item, ['created', 'updated', 'date', 'time']);

    if (!rawDate) return 'Date unavailable';

    const normalizedDate =
      rawDate && typeof rawDate === 'object'
        ? rawDate.$date || rawDate.date || rawDate.value || rawDate
        : rawDate;

    const parsed = new Date(normalizedDate);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString();

    const numeric = Number(normalizedDate);
    if (!Number.isNaN(numeric)) {
      const parsedNumeric = new Date(numeric);
      if (!Number.isNaN(parsedNumeric.getTime())) return parsedNumeric.toLocaleString();
    }

    return 'Date unavailable';
  };

  function toStableId(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string' || typeof value === 'number') return String(value);

    if (typeof value === 'object') {
      if (typeof value.$oid === 'string') return value.$oid;
      if (typeof value._id === 'string' || typeof value._id === 'number') return String(value._id);
      if (typeof value.id === 'string' || typeof value.id === 'number') return String(value.id);
      if (value.id?.type === 'Buffer' && Array.isArray(value.id.data)) {
        return value.id.data.map(byte => byte.toString(16).padStart(2, '0')).join('');
      }
      if (value._id?.$oid) return value._id.$oid;
    }

    return fallback;
  }

  function getHistoryId(item, index = '') {
    return (
      toStableId(item?._id) ||
      toStableId(item?.id) ||
      toStableId(findDirectField(item, ['_id', 'id'])) ||
      `history-${index}`
    );
  }

  const loadHistoryItem = (item) => {
    const rawDate =
      item?.AI_createdAt ||
      item?.createdAt ||
      item?.AI_updatedAt ||
      item?.updatedAt ||
      item?.timestamp ||
      item?.date ||
      findDirectField(item, ['AI_createdAt', 'createdAt', 'AI_updatedAt', 'updatedAt', 'timestamp', 'date']) ||
      Date.now();

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: getHistoryInput(item),
      timestamp: new Date(rawDate)
    };

    const aiMessage = {
      id: Date.now() + 1,
      type: 'ai',
      content: getHistoryResponse(item),
      confidence: item?.AI_confidence ?? item?.confidence,
      interactionId: getHistoryId(item),
      feedback: item?.AI_feedback || item?.feedback,
      timestamp: new Date(rawDate)
    };

    setMessages([userMessage, aiMessage]);
    setShowHistory(false);
  };

  const clearChat = async () => {
    setMessages([]);

    if (!showHistory) return;

    try {
      setClearingHistory(true);
      const token = localStorage.getItem('token');
      await api.delete('/ai/history', {
        headers: { Authorization: `Bearer ${token}` },
        params: activeGroup ? { groupId: toStableId(activeGroup) } : {}
      });
      setHistory([]);
    } catch (err) {
      console.error('Error clearing history:', err);
      fetchHistory();
    } finally {
      setClearingHistory(false);
    }
  };

  return (
    <div className="ai-assistant">
      <div className="ai-assistant-header">
        <h1>AI Assistant</h1>
        <div className="header-actions">
          <select
            value={toStableId(activeGroup)}
            onChange={(e) => setActiveGroup(e.target.value)}
            className="group-select"
          >
            <option value="">All Groups</option>
            {groups.map((group, index) => {
              const groupOptionId = toStableId(group._id, `group-${index}`);

              return (
              <option key={groupOptionId} value={groupOptionId}>
                {group.Group_name}
              </option>
              );
            })}
          </select>
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className="btn-secondary"
          >
            <FaHistory /> History
          </button>
          <button onClick={clearChat} className="btn-secondary" disabled={clearingHistory}>
            <FaTrash /> Clear
          </button>
        </div>
      </div>

      <div className="ai-assistant-content">
        {showHistory ? (
          <div className="history-panel">
            <div className="history-panel-header">
              <button
                type="button"
                onClick={() => setShowHistory(false)}
                className="btn-secondary history-back"
              >
                <FaArrowLeft /> Back
              </button>
              <h2>Interaction History</h2>
            </div>
            {history.length === 0 ? (
              <p className="empty-state">No history yet</p>
            ) : (
              <div className="history-list">
                {history.map((item, index) => (
                  <div 
                    key={getHistoryId(item, index)} 
                    className="history-item"
                    onClick={() => loadHistoryItem(item)}
                  >
                    <div className="history-type">{getHistoryType(item)}</div>
                    <div className="history-input">{getHistoryInput(item)}</div>
                    <div className="history-date">
                      {formatHistoryDate(item)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="chat-container">
            <div className="messages-container">
              {messages.length === 0 ? (
                <div className="welcome-message">
                  <FaRobot />
                  <h2>Hello! I'm your AI Assistant</h2>
                  <p>Ask me anything about your studies, tasks, or group activities.</p>
                  <div className="suggestions">
                    <button onClick={() => setInputMessage('How can I improve my study habits?')}>
                      Study tips
                    </button>
                    <button onClick={() => setInputMessage('What tasks should I prioritize?')}>
                      Task prioritization
                    </button>
                    <button onClick={() => setInputMessage('How is my group performing?')}>
                      Group insights
                    </button>
                  </div>
                </div>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} className={`message ${msg.type}`}>
                    <div className="message-avatar">
                      {msg.type === 'user' ? (
                        <FaUser />
                      ) : msg.type === 'ai' ? (
                        <FaRobot />
                      ) : (
                        <FaExclamationTriangle />
                      )}
                    </div>
                    <div className="message-content">
                      <div className="message-text">{msg.content}</div>
                      {msg.confidence && (
                        <div className="message-confidence">
                          Confidence: {(msg.confidence * 100).toFixed(0)}%
                        </div>
                      )}
                      {msg.type === 'ai' && msg.interactionId && !msg.feedback && (
                        <div className="message-feedback">
                          <span>Was this helpful?</span>
                          <button onClick={() => handleFeedback(msg.interactionId, 'helpful')}>
                            <FaThumbsUp />
                          </button>
                          <button onClick={() => handleFeedback(msg.interactionId, 'not_helpful')}>
                            <FaThumbsDown />
                          </button>
                        </div>
                      )}
                      {msg.feedback && (
                        <div className="message-feedback-given">
                          Feedback: {msg.feedback}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              {loading && (
                <div className="message ai loading">
                <div className="message-avatar">
                    <FaRobot />
                  </div>
                  <div className="message-content">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="input-container">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Ask me anything..."
                disabled={loading}
              />
              <button type="submit" disabled={loading || !inputMessage.trim()}>
                <FaPaperPlane />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIAssistant;
