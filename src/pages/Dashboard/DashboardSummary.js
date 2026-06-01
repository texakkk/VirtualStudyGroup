import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Button,
  IconButton,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import {
  Assignment as AssignmentIcon,
  Group as GroupIcon,
  ChatBubble as ChatIcon,
  CheckCircle as CheckCircleIcon,
  Videocam as VideocamIcon,
  Refresh as RefreshIcon,
  Schedule as ScheduleIcon,
  Person as PersonIcon,
  AccessTime as AccessTimeIcon,
  StickyNote2 as NotesIcon,
} from "@mui/icons-material";
import io from "socket.io-client";
import api from "../../api";
import NotificationSummary from "../../components/notifications/NotificationSummary";
import { useNotification } from "../../contexts/NotificationContext";

const SummaryCard = ({ title, value, icon: Icon, color = "primary" }) => (
  <Card elevation={3} sx={{ height: "100%" }}>
    <CardContent>
      <Box display="flex" alignItems="center" mb={2}>
        <Icon color={color} sx={{ fontSize: 40, mr: 2 }} />
        <Box>
          <Typography color="textSecondary" variant="subtitle2">
            {title}
          </Typography>
          <Typography variant="h4">{value}</Typography>
        </Box>
      </Box>
    </CardContent>
  </Card>
);

const DashboardSummary = () => {
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [timelineFilter, setTimelineFilter] = useState("168"); // Default to 7 days (168 hours)

  // Use notification context for real-time unread count
  const { unreadCount } = useNotification();

  // Timeline filter options
  const timelineOptions = [
    { value: "1", label: "1 Hour", shortLabel: "1h" },
    { value: "6", label: "6 Hours", shortLabel: "6h" },
    { value: "24", label: "24 Hours", shortLabel: "1d" },
    { value: "72", label: "3 Days", shortLabel: "3d" },
    { value: "168", label: "7 Days", shortLabel: "7d" },
    { value: "720", label: "30 Days", shortLabel: "30d" },
  ];

  const fetchSummary = useCallback(async (isRefresh = false, timeline = timelineFilter) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const response = await api.get(`/dashboard/summary?timeline=${timeline}`);
      setSummary(response.data || {});
    } catch (err) {
      console.error("Error fetching dashboard summary:", err);
      setError("Failed to load dashboard data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [timelineFilter]);

  // Handle timeline filter change
  const handleTimelineChange = (event, newTimeline) => {
    if (newTimeline !== null) {
      setTimelineFilter(newTimeline);
      fetchSummary(false, newTimeline);
    }
  };

  useEffect(() => {
    fetchSummary();

    // Set up socket connection for real-time updates using chat namespace
    const token = localStorage.getItem("token");
    socketRef.current = io("http://localhost:5001/chat", {
      auth: { token },
      transports: ["websocket", "polling"],
      timeout: 20000,
    });

    socketRef.current.on("connect", () => {
      console.log("Dashboard socket connected:", socketRef.current.id);
    });

    socketRef.current.on("disconnect", () => {
      console.log("Dashboard socket disconnected");
    });

    socketRef.current.on("messagesRead", () => {
      fetchSummary(true, timelineFilter);
    });

    socketRef.current.on("receiveMessage", () => {
      fetchSummary(true, timelineFilter);
    });

    // Auto-refresh every 5 minutes
    const interval = setInterval(() => {
      fetchSummary(true, timelineFilter);
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(interval);
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [timelineFilter, fetchSummary]);

  const handleRefresh = () => {
    fetchSummary(true);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  // Safe default values
  const activeGroups = summary.Active_groups || 0;
  const totalTasks = summary.Total_tasks || 0;
  const completedTasks = summary.Completed_tasks || 0;
  const totalNotes = summary.Total_notes || 0;
  const unreadMessages = unreadCount || 0;
  const upcomingDeadlines = summary.Upcoming_deadlines || [];
  const recentActivity = summary.Recent_activity || [];
  const activeSessions = summary.Active_sessions || [];
  const upcomingSessions = summary.Upcoming_sessions || [];

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Dashboard Overview</Typography>
        <IconButton
          onClick={handleRefresh}
          disabled={refreshing}
          title="Refresh Dashboard"
          sx={{
            bgcolor: "primary.main",
            color: "white",
            "&:hover": { bgcolor: "primary.dark" },
            "&:disabled": { bgcolor: "grey.300" },
          }}
        >
          <RefreshIcon
            sx={{
              animation: refreshing ? "spin 1s linear infinite" : "none",
              "@keyframes spin": {
                "0%": { transform: "rotate(0deg)" },
                "100%": { transform: "rotate(360deg)" },
              },
            }}
          />
        </IconButton>
      </Box>

      {/* Summary Cards — MUI v7 Grid v2: use size prop instead of item + xs/sm/md/lg */}
      <Grid container spacing={3} mb={4}>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <SummaryCard title="Active Groups" value={activeGroups} icon={GroupIcon} color="info" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <SummaryCard title="Total Tasks" value={totalTasks} icon={AssignmentIcon} color="primary" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <SummaryCard title="Completed Tasks" value={completedTasks} icon={CheckCircleIcon} color="success" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <Card
            elevation={3}
            sx={{ height: "100%", cursor: "pointer", "&:hover": { transform: "translateY(-2px)", boxShadow: 4 } }}
            onClick={() => navigate("/dashboard/notes")}
          >
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <NotesIcon color="secondary" sx={{ fontSize: 40, mr: 2 }} />
                <Box flex={1}>
                  <Typography color="textSecondary" variant="subtitle2">My Notes</Typography>
                  <Typography variant="h4">{totalNotes}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <Card elevation={3} sx={{ height: "100%" }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <ChatIcon color="warning" sx={{ fontSize: 40, mr: 2 }} />
                <Box flex={1}>
                  <Typography color="textSecondary" variant="subtitle2">Unread Notifications</Typography>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="h4">{unreadMessages}</Typography>
                    <IconButton
                      size="small"
                      onClick={() => navigate("/dashboard/notifications")}
                      title="View all notifications"
                      sx={{ opacity: 0.7, "&:hover": { opacity: 1 } }}
                    >
                      <RefreshIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Notification Summary */}
      <Grid container spacing={3} mb={4}>
        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <NotificationSummary />
        </Grid>
      </Grid>

      {/* Recent Activity */}
      <Card elevation={3} sx={{ mt: 4 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Box display="flex" alignItems="center" gap={2}>
              <Typography variant="h6">Recent Activity</Typography>
              {recentActivity.length > 0 && (
                <Chip
                  label={`${recentActivity.length} ${recentActivity.length === 1 ? "activity" : "activities"}`}
                  size="small"
                  variant="outlined"
                  color="primary"
                />
              )}
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              <AccessTimeIcon sx={{ fontSize: 20, color: "text.secondary" }} />
              <ToggleButtonGroup
                value={timelineFilter}
                exclusive
                onChange={handleTimelineChange}
                size="small"
                sx={{
                  "& .MuiToggleButton-root": {
                    px: 1.5, py: 0.5, fontSize: "0.75rem", minWidth: "auto",
                  },
                }}
              >
                {timelineOptions.map((option) => (
                  <ToggleButton key={option.value} value={option.value} title={option.label}>
                    {option.shortLabel}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
          </Box>
          <Divider sx={{ mb: 2 }} />
          {recentActivity.length > 0 ? (
            recentActivity.slice(0, 10).map((activity, index) => {
              const getActivityIcon = (type) => {
                switch (type) {
                  case "group_created":
                  case "group_join":
                    return <GroupIcon sx={{ fontSize: 16 }} />;
                  case "task":
                    return <AssignmentIcon sx={{ fontSize: 16 }} />;
                  case "message":
                    return <ChatIcon sx={{ fontSize: 16 }} />;
                  case "video_session":
                    return <VideocamIcon sx={{ fontSize: 16 }} />;
                  case "note_created":
                  case "note_updated":
                  case "note_shared":
                    return <NotesIcon sx={{ fontSize: 16 }} />;
                  default:
                    return <PersonIcon sx={{ fontSize: 16 }} />;
                }
              };

              const getActivityColor = (type) => {
                switch (type) {
                  case "group_created": return "primary";
                  case "group_join":    return "info";
                  case "task":         return "success";
                  case "message":      return "warning";
                  case "video_session":
                  case "note_created":
                  case "note_updated":
                  case "note_shared":  return "secondary";
                  default:             return "default";
                }
              };

              const formatTimestamp = (timestamp) => {
                const date = new Date(timestamp);
                const now = new Date();
                const diffInMinutes = Math.floor((now - date) / (1000 * 60));
                const diffInHours = Math.floor(diffInMinutes / 60);
                const diffInDays = Math.floor(diffInHours / 24);

                if (timelineFilter === "1") {
                  if (diffInMinutes < 1) return "Just now";
                  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
                  return `${diffInHours}h ago`;
                } else if (timelineFilter === "6" || timelineFilter === "24") {
                  if (diffInMinutes < 1) return "Just now";
                  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
                  if (diffInHours < 24) return `${diffInHours}h ago`;
                  return `${diffInDays}d ago`;
                } else {
                  if (diffInMinutes < 1) return "Just now";
                  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
                  if (diffInHours < 24) return `${diffInHours}h ago`;
                  if (diffInDays < 30) return `${diffInDays}d ago`;
                  return date.toLocaleDateString();
                }
              };

              const getActivityText = (a) => {
                switch (a.type) {
                  case "group_created":  return `${a.user_name} created group: ${a.Group_name}`;
                  case "group_join":     return `${a.user_name} joined group: ${a.Group_name} as ${a.role}`;
                  case "task":           return `Task "${a.Task_name}" in ${a.Group_name} (${a.Task_status}) - Assigned to: ${a.assignedTo}`;
                  case "message":        return `New message in ${a.Group_name}`;
                  case "video_session":  return `Video session ${a.session_status} in ${a.Group_name} by ${a.host_name}`;
                  case "note_created":   return `${a.user_name} created note: "${a.note_title}" in ${a.Group_name}`;
                  case "note_updated":   return `${a.user_name} updated note: "${a.note_title}" in ${a.Group_name}`;
                  case "note_shared":    return `${a.user_name} shared note: "${a.note_title}" in ${a.Group_name}`;
                  default:               return a.description || "Activity recorded";
                }
              };

              return (
                <Box key={index} mb={2}>
                  <Box display="flex" alignItems="center" gap={2}>
                    <Chip
                      icon={getActivityIcon(activity.type)}
                      label={activity.type.charAt(0).toUpperCase() + activity.type.slice(1)}
                      size="small"
                      color={getActivityColor(activity.type)}
                      variant="outlined"
                    />
                    <Typography variant="body2" color="textSecondary" sx={{ ml: "auto" }}>
                      {formatTimestamp(activity.timestamp)}
                    </Typography>
                  </Box>
                  <Typography sx={{ mt: 1, ml: 1 }}>{getActivityText(activity)}</Typography>
                  {index < Math.min(recentActivity.length, 10) - 1 && <Divider sx={{ my: 1 }} />}
                </Box>
              );
            })
          ) : (
            <Typography color="textSecondary" textAlign="center" py={3}>
              No recent activity
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Deadlines */}
      <Card elevation={3} sx={{ mt: 4 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Upcoming Deadlines</Typography>
          <Divider sx={{ mb: 2 }} />
          {upcomingDeadlines.length > 0 ? (
            upcomingDeadlines.map((deadline, index) => {
              const dueDate = new Date(deadline.Task_dueDate);
              const daysUntilDue = Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24));
              const getUrgencyColor = (d) => d <= 1 ? "error" : d <= 3 ? "warning" : d <= 7 ? "info" : "default";
              const getUrgencyText = (d) => d < 0 ? "Overdue" : d === 0 ? "Due today" : d === 1 ? "Due tomorrow" : `${d} days left`;

              return (
                <Box key={index} mb={2}>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Box flex={1}>
                      <Typography variant="subtitle1">{deadline.Task_name}</Typography>
                      <Typography variant="body2" color="textSecondary">{deadline.Group_name}</Typography>
                      {deadline.assignedTo?.length > 0 && (
                        <Typography variant="caption" color="textSecondary">
                          Assigned to: {deadline.assignedTo.map((u) => u.name).join(", ")}
                        </Typography>
                      )}
                    </Box>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Chip
                        icon={<ScheduleIcon sx={{ fontSize: 16 }} />}
                        label={getUrgencyText(daysUntilDue)}
                        size="small"
                        color={getUrgencyColor(daysUntilDue)}
                        variant={daysUntilDue <= 3 ? "filled" : "outlined"}
                      />
                      <Typography variant="body2" color="textSecondary">
                        {dueDate.toLocaleDateString()}
                      </Typography>
                    </Box>
                  </Box>
                  {index < upcomingDeadlines.length - 1 && <Divider sx={{ my: 1 }} />}
                </Box>
              );
            })
          ) : (
            <Typography color="textSecondary" textAlign="center" py={3}>
              No upcoming deadlines
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Active Video Sessions */}
      {activeSessions.length > 0 && (
        <Card elevation={3} sx={{ mt: 4, border: "2px solid", borderColor: "success.main" }}>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6" color="success.main">🔴 Active Video Sessions</Typography>
              <Chip label={`${activeSessions.length} Live`} color="success" size="small" sx={{ fontWeight: "bold" }} />
            </Box>
            <Divider sx={{ mb: 2 }} />
            {activeSessions.map((session, index) => (
              <Box key={session.Session_id} mb={2}>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>{session.Group_name}</Typography>
                    <Typography variant="body2" color="textSecondary">Hosted by {session.Host_name}</Typography>
                    <Typography variant="caption" color="success.main">
                      Started: {new Date(session.Started_at).toLocaleString()}
                    </Typography>
                  </Box>
                  <Button
                    variant="contained"
                    color="success"
                    size="small"
                    startIcon={<VideocamIcon />}
                    onClick={() => navigate("/dashboard/group-chat-page")}
                  >
                    Join Now
                  </Button>
                </Box>
                {index < activeSessions.length - 1 && <Divider sx={{ my: 1 }} />}
              </Box>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card elevation={3} sx={{ mt: 4 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Quick Actions</Typography>
          <Divider sx={{ mb: 2 }} />
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Button fullWidth variant="outlined" startIcon={<GroupIcon />}
                onClick={() => navigate("/dashboard/group-management")}>
                Create Group
              </Button>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Button fullWidth variant="outlined" startIcon={<AssignmentIcon />}
                onClick={() => navigate("/dashboard/task-manager")}>
                Create Task
              </Button>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Button fullWidth variant="outlined" startIcon={<NotesIcon />}
                onClick={() => navigate("/dashboard/notes")}>
                Create Note
              </Button>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Button fullWidth variant="outlined" startIcon={<ChatIcon />}
                onClick={() => navigate("/dashboard/group-chat-page")}>
                Start Chat
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Upcoming Video Sessions */}
      <Card elevation={3} sx={{ mt: 4 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">Upcoming Video Sessions</Typography>
            <Button variant="outlined" startIcon={<VideocamIcon />} size="small"
              onClick={() => navigate("/dashboard/group-chat-page")}>
              View All
            </Button>
          </Box>
          <Divider sx={{ mb: 2 }} />
          {upcomingSessions.length > 0 ? (
            upcomingSessions.map((session, index) => (
              <Box key={session.Session_id} mb={2}>
                <Box display="flex" justifyContent="space-between">
                  <Box>
                    <Typography>{session.Group_name}</Typography>
                    <Typography variant="body2" color="textSecondary">Hosted by {session.Host_name}</Typography>
                  </Box>
                  <Typography variant="body2" color="textSecondary">
                    {new Date(session.Start_time).toLocaleString()}
                  </Typography>
                </Box>
                {index < upcomingSessions.length - 1 && <Divider sx={{ my: 1 }} />}
              </Box>
            ))
          ) : (
            <Typography color="textSecondary" textAlign="center" py={3}>
              No upcoming video sessions
            </Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default DashboardSummary;
