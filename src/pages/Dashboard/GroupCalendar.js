import React, { useState, useEffect } from 'react';
import api from '../../api';
import './GroupCalendar.css';

const createEmptyEvent = () => ({
  title: '',
  description: '',
  type: 'meeting',
  startDate: '',
  endDate: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  isAllDay: false,
  location: { type: 'virtual', details: '' },
  visibility: 'members-only',
  isRecurring: false,
  recurrence: {
    frequency: 'weekly',
    interval: 1,
    endDate: ''
  }
});

const GroupCalendar = ({ groupId, onClose }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [canManageCalendar, setCanManageCalendar] = useState(false);
  const [newEvent, setNewEvent] = useState(createEmptyEvent);

  useEffect(() => {
    if (groupId) {
      fetchEvents();
      fetchAnalytics();
      fetchCalendarPermission();
    }
  }, [groupId, currentDate]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const startDate = getMonthStart(currentDate);
      const endDate = getMonthEnd(currentDate);

      const response = await api.get(`/group-events/${groupId}`, {
        params: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setEvents(response.data.events);
      }
    } catch (error) {
      setNotification({
        message: error.response?.data?.message || 'Failed to load events',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get(`/group-events/${groupId}/summary`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setAnalytics(response.data.analytics);
      }
    } catch (error) {
      console.error('Failed to load calendar summary:', error);
    }
  };

  const fetchCalendarPermission = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get(`/group/${groupId}/permissions/manageCalendar`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setCanManageCalendar(Boolean(response.data.hasPermission));
      }
    } catch (error) {
      setCanManageCalendar(false);
    }
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (!newEvent.title.trim() || !newEvent.startDate) {
      setNotification({ message: 'Title and start date are required', type: 'error' });
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const eventPayload = {
        ...newEvent,
        location: {
          ...newEvent.location,
          virtualLink: newEvent.location.details,
          address: newEvent.location.details
        },
        recurrence: {
          isRecurring: newEvent.isRecurring,
          pattern: newEvent.recurrence.frequency,
          frequency: newEvent.recurrence.frequency,
          interval: Number(newEvent.recurrence.interval) || 1,
          endDate: newEvent.recurrence.endDate || null
        }
      };

      const response = await api.post(`/group-events/${groupId}`, eventPayload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setEvents([...events, response.data.event]);
        setShowEventModal(false);
        setNewEvent(createEmptyEvent());
        setNotification({ message: 'Event created successfully', type: 'success' });
        fetchAnalytics();
      }
    } catch (error) {
      setNotification({
        message: error.response?.data?.message || 'Failed to create event',
        type: 'error'
      });
    }
  };

  const handleUpdateAttendance = async (eventId, status) => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.patch(
        `/group-events/${groupId}/events/${eventId}/attendance`,
        { status },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setEvents(events.map(event =>
          event._id === eventId ? { ...event, userStatus: status } : event
        ));
        if (selectedEvent?._id === eventId) {
          setSelectedEvent({ ...selectedEvent, userStatus: status });
        }
        setNotification({ message: `Attendance updated to ${status}`, type: 'success' });
      }
    } catch (error) {
      setNotification({
        message: error.response?.data?.message || 'Failed to update attendance',
        type: 'error'
      });
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm('Are you sure you want to delete this event?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await api.delete(`/group-events/${groupId}/events/${eventId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setEvents(events.filter(event => event._id !== eventId));
      setSelectedEvent(null);
      setNotification({ message: 'Event deleted successfully', type: 'success' });
      fetchAnalytics();
    } catch (error) {
      setNotification({
        message: error.response?.data?.message || 'Failed to delete event',
        type: 'error'
      });
    }
  };

  const getMonthStart = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

  const getMonthEnd = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    for (let i = 0; i < startingDayOfWeek; i += 1) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i += 1) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const getEventsForDay = (day) => {
    if (!day) return [];
    return events.filter(event => {
      const eventDate = new Date(event.GroupEvent_startDate);
      return eventDate.toDateString() === day.toDateString();
    });
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const navigateMonth = (direction) => {
    const newDateValue = new Date(currentDate);
    newDateValue.setMonth(newDateValue.getMonth() + direction);
    setCurrentDate(newDateValue);
  };

  const getLocationText = (event) => (
    event.GroupEvent_location?.details ||
    event.GroupEvent_location?.virtualLink ||
    event.GroupEvent_location?.address ||
    ''
  );

  if (loading) {
    return <div className="calendar-loading">Loading calendar...</div>;
  }

  return (
    <div className="group-calendar-modal">
      <div className="calendar-header">
        <h2>Group Calendar & Scheduling</h2>
        <button className="close-button" onClick={onClose}>x</button>
      </div>

      {notification.message && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}

      <div className="calendar-toolbar">
        <div className="calendar-navigation">
          <button onClick={() => navigateMonth(-1)}>&lt;</button>
          <h3>
            {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h3>
          <button onClick={() => navigateMonth(1)}>&gt;</button>
        </div>
        {canManageCalendar && (
          <button className="create-event-button" onClick={() => setShowEventModal(true)}>
            + Create Event
          </button>
        )}
      </div>

      {analytics && (
        <div className="participation-analytics">
          <h4>Participation Analytics</h4>
          <div className="analytics-grid">
            <div className="analytics-card">
              <span className="analytics-value">{analytics.totalEvents || 0}</span>
              <span className="analytics-label">Total Events</span>
            </div>
            <div className="analytics-card">
              <span className="analytics-value">{analytics.averageAttendance || 0}%</span>
              <span className="analytics-label">Avg Attendance</span>
            </div>
            <div className="analytics-card">
              <span className="analytics-value">{analytics.upcomingEvents || 0}</span>
              <span className="analytics-label">Upcoming</span>
            </div>
            <div className="analytics-card">
              <span className="analytics-value">{analytics.activeMembers || 0}</span>
              <span className="analytics-label">Active Members</span>
            </div>
          </div>
        </div>
      )}

      <div className="calendar-grid">
        <div className="calendar-weekdays">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="weekday">{day}</div>
          ))}
        </div>
        <div className="calendar-days">
          {getDaysInMonth(currentDate).map((day, index) => (
            <div
              key={`${day ? day.toISOString() : 'empty'}-${index}`}
              className={`calendar-day ${!day ? 'empty' : ''} ${
                day && day.toDateString() === new Date().toDateString() ? 'today' : ''
              }`}
            >
              {day && (
                <>
                  <div className="day-number">{day.getDate()}</div>
                  <div className="day-events">
                    {getEventsForDay(day).map(event => (
                      <div
                        key={event._id}
                        className={`event-pill ${event.GroupEvent_type}`}
                        onClick={() => setSelectedEvent(event)}
                      >
                        {event.GroupEvent_title}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {showEventModal && (
        <div className="event-modal-overlay" onClick={() => setShowEventModal(false)}>
          <div className="event-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create New Event</h3>
            <form onSubmit={handleCreateEvent}>
              <input
                type="text"
                placeholder="Event title"
                value={newEvent.title}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                required
              />
              <textarea
                placeholder="Description"
                value={newEvent.description}
                onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
              />
              <select
                value={newEvent.type}
                onChange={(e) => setNewEvent({ ...newEvent, type: e.target.value })}
              >
                <option value="meeting">Meeting</option>
                <option value="study-session">Study Session</option>
                <option value="deadline">Deadline</option>
                <option value="exam">Exam</option>
                <option value="presentation">Presentation</option>
                <option value="other">Other</option>
              </select>
              <div className="date-inputs">
                <div>
                  <label>Start Date & Time</label>
                  <input
                    type="datetime-local"
                    value={newEvent.startDate}
                    onChange={(e) => setNewEvent({ ...newEvent, startDate: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label>End Date & Time</label>
                  <input
                    type="datetime-local"
                    value={newEvent.endDate}
                    onChange={(e) => setNewEvent({ ...newEvent, endDate: e.target.value })}
                  />
                </div>
              </div>
              <input
                type="text"
                placeholder="Location/Meeting link"
                value={newEvent.location.details}
                onChange={(e) => setNewEvent({
                  ...newEvent,
                  location: { ...newEvent.location, details: e.target.value }
                })}
              />
              <div className="timezone-selector">
                <label>Timezone</label>
                <select
                  value={newEvent.timezone}
                  onChange={(e) => setNewEvent({ ...newEvent, timezone: e.target.value })}
                >
                  <option value="America/New_York">Eastern Time (ET)</option>
                  <option value="America/Chicago">Central Time (CT)</option>
                  <option value="America/Denver">Mountain Time (MT)</option>
                  <option value="America/Los_Angeles">Pacific Time (PT)</option>
                  <option value="Europe/London">London (GMT)</option>
                  <option value="Europe/Paris">Paris (CET)</option>
                  <option value="Asia/Tokyo">Tokyo (JST)</option>
                  <option value="Asia/Shanghai">Shanghai (CST)</option>
                  <option value="Australia/Sydney">Sydney (AEDT)</option>
                  <option value={Intl.DateTimeFormat().resolvedOptions().timeZone}>
                    Local Timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                  </option>
                </select>
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={newEvent.isAllDay}
                  onChange={(e) => setNewEvent({ ...newEvent, isAllDay: e.target.checked })}
                />
                All-day event
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={newEvent.isRecurring}
                  onChange={(e) => setNewEvent({ ...newEvent, isRecurring: e.target.checked })}
                />
                Recurring event
              </label>
              {newEvent.isRecurring && (
                <div className="recurrence-options">
                  <h4>Recurrence Settings</h4>
                  <div className="recurrence-grid">
                    <div>
                      <label>Frequency</label>
                      <select
                        value={newEvent.recurrence.frequency}
                        onChange={(e) => setNewEvent({
                          ...newEvent,
                          recurrence: { ...newEvent.recurrence, frequency: e.target.value }
                        })}
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <div>
                      <label>Repeat every</label>
                      <input
                        type="number"
                        min="1"
                        value={newEvent.recurrence.interval}
                        onChange={(e) => setNewEvent({
                          ...newEvent,
                          recurrence: { ...newEvent.recurrence, interval: parseInt(e.target.value, 10) || 1 }
                        })}
                      />
                    </div>
                    <div>
                      <label>End date (optional)</label>
                      <input
                        type="date"
                        value={newEvent.recurrence.endDate}
                        onChange={(e) => setNewEvent({
                          ...newEvent,
                          recurrence: { ...newEvent.recurrence, endDate: e.target.value }
                        })}
                      />
                    </div>
                  </div>
                </div>
              )}
              <div className="modal-buttons">
                <button type="button" onClick={() => setShowEventModal(false)}>Cancel</button>
                <button type="submit">Create Event</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedEvent && (
        <div className="event-details-overlay" onClick={() => setSelectedEvent(null)}>
          <div className="event-details" onClick={(e) => e.stopPropagation()}>
            <h3>{selectedEvent.GroupEvent_title}</h3>
            <div className="event-info">
              <p><strong>Type:</strong> {selectedEvent.GroupEvent_type}</p>
              <p><strong>Date:</strong> {formatDate(selectedEvent.GroupEvent_startDate)}</p>
              <p>
                <strong>Time:</strong> {formatTime(selectedEvent.GroupEvent_startDate)}
                {selectedEvent.GroupEvent_endDate && ` - ${formatTime(selectedEvent.GroupEvent_endDate)}`}
              </p>
              {selectedEvent.GroupEvent_description && (
                <p><strong>Description:</strong> {selectedEvent.GroupEvent_description}</p>
              )}
              {getLocationText(selectedEvent) && (
                <p><strong>Location:</strong> {getLocationText(selectedEvent)}</p>
              )}
            </div>
            <div className="attendance-section">
              <h4>Your Attendance</h4>
              <div className="attendance-buttons">
                <button
                  className={`attendance-btn ${selectedEvent.userStatus === 'accepted' ? 'active' : ''}`}
                  onClick={() => handleUpdateAttendance(selectedEvent._id, 'accepted')}
                >
                  Attending
                </button>
                <button
                  className={`attendance-btn ${selectedEvent.userStatus === 'maybe' ? 'active' : ''}`}
                  onClick={() => handleUpdateAttendance(selectedEvent._id, 'maybe')}
                >
                  Maybe
                </button>
                <button
                  className={`attendance-btn ${selectedEvent.userStatus === 'declined' ? 'active' : ''}`}
                  onClick={() => handleUpdateAttendance(selectedEvent._id, 'declined')}
                >
                  Not Attending
                </button>
              </div>
            </div>
            {canManageCalendar && (
              <button
                className="delete-event-btn"
                onClick={() => handleDeleteEvent(selectedEvent._id)}
              >
                Delete Event
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupCalendar;
