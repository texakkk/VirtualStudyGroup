import React, { useEffect, useState } from "react";
import "./ProjectReport.css";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import api from "../../api";
import { format, subDays, isValid } from "date-fns";

// Text sanitization utilities
const sanitizeText = (text) => {
  if (!text || typeof text !== "string") return "";

  return (
    text
      // Remove or replace problematic characters
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // Remove control characters
      .replace(/[\u2000-\u206F\u2E00-\u2E7F\u3000-\u303F]/g, " ") // Replace special spaces and punctuation
      .replace(/[\uD800-\uDFFF]/g, "?") // Replace unpaired surrogates
      // Handle common emojis and symbols
      .replace(/[\u{1F600}-\u{1F64F}]/gu, "[emoji]") // Emoticons
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, "[symbol]") // Misc symbols
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, "[transport]") // Transport symbols
      .replace(/[\u{1F700}-\u{1F77F}]/gu, "[symbol]") // Alchemical symbols
      .replace(/[\u{1F780}-\u{1F7FF}]/gu, "[symbol]") // Geometric shapes
      .replace(/[\u{1F800}-\u{1F8FF}]/gu, "[symbol]") // Supplemental arrows
      .replace(/[\u{1F900}-\u{1F9FF}]/gu, "[symbol]") // Supplemental symbols
      .replace(/[\u{1FA00}-\u{1FA6F}]/gu, "[symbol]") // Chess symbols
      .replace(/[\u{1FA70}-\u{1FAFF}]/gu, "[symbol]") // Symbols and pictographs
      // Clean up multiple spaces and trim
      .replace(/\s+/g, " ")
      .trim()
  );
};

const sanitizeFileName = (fileName) => {
  if (!fileName || typeof fileName !== "string") return "unknown_file";

  return (
    fileName
      // Remove path separators and dangerous characters
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      // Replace spaces with underscores
      .replace(/\s+/g, "_")
      // Remove multiple underscores
      .replace(/_+/g, "_")
      // Remove leading/trailing underscores
      .replace(/^_+|_+$/g, "")
      // Limit length
      .substring(0, 100) || "unknown_file"
  );
};

const cleanTextForExport = (text, maxLength = 1000) => {
  const cleaned = sanitizeText(text);
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength - 3) + "...";
};

// Buffer polyfill for browser compatibility
if (typeof global === "undefined") {
  window.global = window;
}

if (typeof Buffer === "undefined") {
  window.Buffer = {
    concat: (buffers) => {
      const totalLength = buffers.reduce((acc, buf) => acc + buf.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const buf of buffers) {
        result.set(buf, offset);
        offset += buf.length;
      }
      return result;
    },
    from: (data, encoding) => {
      if (typeof data === "string") {
        return new TextEncoder().encode(data);
      }
      return new Uint8Array(data);
    },
    isBuffer: (obj) => obj instanceof Uint8Array,
  };
}

const ProjectReport = () => {
  const [userData, setUserData] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupData, setGroupData] = useState([]);
  const [taskData, setTaskData] = useState([]);
  const [members, setMembers] = useState([]);
  const [chatData, setChatData] = useState([]);
  const [videoData, setVideoData] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState("30d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analytics, setAnalytics] = useState({});
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Safe date formatting function
  const formatDate = (dateValue, formatString = "MMM dd, yyyy") => {
    if (!dateValue) return "N/A";

    try {
      const date = new Date(dateValue);
      if (!isValid(date)) return "N/A";
      return format(date, formatString);
    } catch (error) {
      console.warn("Date formatting error:", error);
      return "N/A";
    }
  };

  // File size formatting function
  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Extract file name from message content
  const extractFileNameFromContent = (content) => {
    if (!content) return null;

    // Common patterns for file sharing messages
    const patterns = [
      /uploaded a file[:\s]+(.+)/i,
      /shared a file[:\s]+(.+)/i,
      /sent a file[:\s]+(.+)/i,
      /file[:\s]+(.+)/i,
      /attachment[:\s]+(.+)/i,
      // Look for file extensions in the content
      /([^\s]+\.[a-zA-Z0-9]{2,4})/g,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  };

  // Get appropriate icon for file type
  const getFileIcon = (fileName) => {
    if (!fileName) return "📎";

    const extension = fileName.split(".").pop()?.toLowerCase();

    const iconMap = {
      // Documents
      pdf: "📄",
      doc: "📝",
      docx: "📝",
      txt: "📄",
      rtf: "📄",

      // Spreadsheets
      xls: "📊",
      xlsx: "📊",
      csv: "📊",

      // Presentations
      ppt: "📊",
      pptx: "📊",

      // Default
      default: "📎",
    };

    return iconMap[extension] || iconMap["default"];
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError("");
      try {
        const token = localStorage.getItem("token");
        const [userRes, groupRes] = await Promise.all([
          api.get("/auth/profile", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          api.get("/group/user-groups", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        setUserData(userRes.data);

        const groups = groupRes.data.groups || [];

        // Fetch member counts for each group
        const groupsWithMemberCounts = await Promise.all(
          groups.map(async (group) => {
            try {
              const groupIdStr = typeof group._id === 'object' ? String(group._id) : group._id;
              const memberRes = await api.get(
                `/auth/group-users/${groupIdStr}`,
                {
                  headers: { Authorization: `Bearer ${token}` },
                }
              );
              return {
                ...group,
                Group_memberCount: memberRes.data.users?.length || 0,
              };
            } catch (err) {
              console.warn(
                `Failed to fetch member count for group ${group._id}:`,
                err
              );
              return {
                ...group,
                Group_memberCount: 0,
              };
            }
          })
        );

        setGroupData(groupsWithMemberCounts);

        // Calculate overall analytics
        console.log("Groups data for analytics:", groupsWithMemberCounts);
        calculateOverallAnalytics(groupsWithMemberCounts);
      } catch (err) {
        console.error("Error fetching user or group data:", err);
        setError("Failed to fetch user or group data.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Refresh selected group data when period changes
  useEffect(() => {
    if (selectedGroup && selectedGroup._id) {
      console.log(`Period changed to ${selectedPeriod}, refreshing group data`);
      const groupIdStr = typeof selectedGroup._id === 'object' ? String(selectedGroup._id) : selectedGroup._id;
      fetchGroupDetails(groupIdStr, selectedPeriod);
    }
  }, [selectedPeriod]);

  // Auto-refresh functionality
  useEffect(() => {
    let interval;
    if (autoRefresh && selectedGroup) {
      interval = setInterval(() => {
        console.log("Auto-refreshing data...");
        const groupIdStr = typeof selectedGroup._id === 'object' ? String(selectedGroup._id) : selectedGroup._id;
        fetchGroupDetails(groupIdStr, selectedPeriod);
        setLastUpdated(new Date());
      }, 30000); // Refresh every 30 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, selectedGroup, selectedPeriod]);

  const calculateOverallAnalytics = (groups) => {
    if (!groups || !Array.isArray(groups)) {
      setAnalytics({
        totalGroups: 0,
        activeGroups: 0,
        inactiveGroups: 0,
        groupGrowth: 0,
      });
      return;
    }

    const totalGroups = groups.length;
    const activeGroups = groups.filter(
      (group) =>
        group.Group_updatedAt &&
        new Date(group.Group_updatedAt) > subDays(new Date(), 7)
    ).length;

    setAnalytics({
      totalGroups,
      activeGroups,
      inactiveGroups: totalGroups - activeGroups,
      groupGrowth: calculateGrowthRate(groups),
    });
  };

  const calculateGrowthRate = (groups) => {
    if (!groups || !Array.isArray(groups) || groups.length === 0) {
      return 0;
    }

    const now = new Date();
    const lastMonth = subDays(now, 30);
    const recentGroups = groups.filter(
      (group) =>
        group.Group_createdAt && new Date(group.Group_createdAt) > lastMonth
    ).length;

    return ((recentGroups / groups.length) * 100).toFixed(1);
  };

  const fetchGroupDetails = async (groupId, period = "30d") => {
    setLoading(true);
    setError("");

    // Ensure groupId is a string
    const groupIdStr = typeof groupId === 'object' ? String(groupId) : groupId;

    // Clear previous group data
    setSelectedGroup(null);
    setMembers([]);
    setTaskData([]);
    setChatData([]);
    setVideoData([]);

    try {
      const token = localStorage.getItem("token");

      console.log(
        `Fetching details for group ${groupIdStr} with period ${period}`
      );

      const [memberRes, taskRes, chatRes, videoRes, groupRes] =
        await Promise.all([
          api
            .get(`/auth/group-users/${groupIdStr}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            .catch((err) => {
              console.warn("Failed to fetch group members:", err);
              return { data: { users: [] } };
            }),
          api
            .get(`/task/group/${groupIdStr}?period=${period}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            .catch((err) => {
              console.warn("Failed to fetch group tasks:", err);
              return { data: { tasks: [] } };
            }),
          api
            .get(`/message/group/${groupIdStr}?period=${period}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            .catch((err) => {
              console.warn("Failed to fetch group messages:", err);
              return { data: { messages: [] } };
            }),
          api
            .get(`/videosession/group/${groupIdStr}?period=${period}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            .catch((err) => {
              console.warn("Failed to fetch video sessions:", err);
              return { data: { report: [] } };
            }),
          api.get(`/group/${groupIdStr}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

      console.log("API responses:", {
        group: groupRes.data,
        members: memberRes.data,
        tasks: taskRes.data,
        messages: chatRes.data,
        videos: videoRes.data,
      });

      setSelectedGroup(groupRes.data.group || groupRes.data || {});
      setMembers(memberRes.data.users || []);
      setTaskData(taskRes.data.tasks || []);
      setChatData(chatRes.data.messages || []);
      setVideoData(videoRes.data.report || []);

      console.log(`Successfully loaded data for group ${groupId}`);
    } catch (err) {
      console.error("Error fetching group details:", err.response || err);
      setError(
        `Failed to fetch group details: ${
          err.response?.data?.message || err.message
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  const calculateTaskMetrics = () => {
    if (!taskData.length) return {};

    const completed = taskData.filter(
      (task) => task.Task_status === "completed"
    ).length;
    const inProgress = taskData.filter(
      (task) => task.Task_status === "in-progress"
    ).length;
    const pending = taskData.filter(
      (task) => task.Task_status === "pending" || !task.Task_status
    ).length;
    const overdue = taskData.filter(
      (task) =>
        task.Task_dueDate &&
        new Date(task.Task_dueDate) < new Date() &&
        task.Task_status !== "completed"
    ).length;

    // Calculate average progress
    const totalProgress = taskData.reduce(
      (sum, task) => sum + (task.Task_progress || 0),
      0
    );
    const avgProgress =
      taskData.length > 0 ? (totalProgress / taskData.length).toFixed(1) : 0;

    // Progress distribution
    const highProgress = taskData.filter(
      (task) => (task.Task_progress || 0) >= 75
    ).length;
    const mediumProgress = taskData.filter(
      (task) =>
        (task.Task_progress || 0) >= 25 && (task.Task_progress || 0) < 75
    ).length;
    const lowProgress = taskData.filter(
      (task) => (task.Task_progress || 0) < 25
    ).length;

    return {
      total: taskData.length,
      completed,
      inProgress,
      pending,
      overdue,
      completionRate: ((completed / taskData.length) * 100).toFixed(1),
      avgProgress,
      highProgress,
      mediumProgress,
      lowProgress,
    };
  };

  const calculateEngagementMetrics = () => {
    const totalMessages = chatData.length;
    const uniqueSenders = [
      ...new Set(chatData.map((msg) => msg.Message_sender?._id)),
    ].length;
    const totalVideoSessions = videoData.length;
    const totalVideoTime = videoData.reduce((acc, session) => {
      if (session.VideoSession_endTime && session.VideoSession_startTime) {
        return (
          acc +
          (new Date(session.VideoSession_endTime) -
            new Date(session.VideoSession_startTime))
        );
      }
      return acc;
    }, 0);

    return {
      totalMessages,
      uniqueSenders,
      totalVideoSessions,
      avgVideoTime:
        totalVideoSessions > 0
          ? Math.round(totalVideoTime / totalVideoSessions / 60000)
          : 0, // in minutes
      messagesPerUser:
        uniqueSenders > 0 ? Math.round(totalMessages / uniqueSenders) : 0,
    };
  };

  const calculateChatMetrics = () => {
    const { filteredChatData } = getFilteredData();

    const totalMessages = filteredChatData.length;
    const textMessages = filteredChatData.filter(
      (msg) => msg.Message_type !== "file" && !msg.Message_fileId
    ).length;
    const fileMessages = filteredChatData.filter(
      (msg) => msg.Message_type === "file" || msg.Message_fileId
    ).length;
    const mixedMessages = filteredChatData.filter(
      (msg) => msg.Message_type === "mixed"
    ).length;

    const uniqueSenders = [
      ...new Set(filteredChatData.map((msg) => msg.Message_sender?._id)),
    ].length;

    // Calculate messages by day
    const messagesByDay = {};
    filteredChatData.forEach((msg) => {
      const date = formatDate(
        msg.Message_timestamp || msg.createdAt || msg.Message_createdAt,
        "MMM dd"
      );
      messagesByDay[date] = (messagesByDay[date] || 0) + 1;
    });

    const avgMessagesPerDay =
      totalMessages > 0
        ? Math.round(
            totalMessages / Math.max(Object.keys(messagesByDay).length, 1)
          )
        : 0;

    // Most active hours
    const messagesByHour = {};
    filteredChatData.forEach((msg) => {
      const hour = new Date(
        msg.Message_timestamp || msg.createdAt || msg.Message_createdAt
      ).getHours();
      messagesByHour[hour] = (messagesByHour[hour] || 0) + 1;
    });

    const mostActiveHour =
      Object.entries(messagesByHour).sort(([, a], [, b]) => b - a)[0]?.[0] || 0;

    return {
      totalMessages,
      textMessages,
      fileMessages,
      mixedMessages,
      uniqueSenders,
      avgMessagesPerDay,
      mostActiveHour: `${mostActiveHour}:00`,
      messagesByDay,
      messagesPerUser:
        uniqueSenders > 0 ? Math.round(totalMessages / uniqueSenders) : 0,
    };
  };

  const getMostActiveMembers = () => {
    const memberActivity = {};

    chatData.forEach((msg) => {
      const senderId = msg.Message_sender?._id;
      if (senderId) {
        memberActivity[senderId] = (memberActivity[senderId] || 0) + 1;
      }
    });

    return Object.entries(memberActivity)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([userId, count]) => {
        const member = members.find(
          (m) => m._id === userId || m.User_id === userId
        );
        return {
          name: member?.User_name || member?.name || "Unknown",
          messageCount: count,
        };
      });
  };

  // Filter data by selected period
  const getFilteredData = () => {
    const periodDays = parseInt(selectedPeriod.replace("d", ""));
    const cutoffDate = subDays(new Date(), periodDays);

    return {
      filteredChatData: chatData.filter((message) => {
        const messageDate = new Date(
          message.Message_timestamp ||
            message.createdAt ||
            message.Message_createdAt
        );
        return messageDate >= cutoffDate;
      }),
      filteredTaskData: taskData.filter((task) => {
        const taskDate = new Date(task.Task_createdAt || task.createdAt);
        return taskDate >= cutoffDate;
      }),
      filteredVideoData: videoData.filter((session) => {
        const sessionDate = new Date(
          session.VideoSession_startTime || session.startTime
        );
        return sessionDate >= cutoffDate;
      }),
    };
  };

  const getRecentActivity = () => {
    const activities = [];
    const { filteredChatData, filteredTaskData, filteredVideoData } =
      getFilteredData();

    // Add messages
    filteredChatData.forEach((message) => {
      // Check if this message contains a file based on the actual message structure
      const isFileMessage =
        message.Message_type === "file" ||
        message.Message_type === "mixed" ||
        message.Message_fileId ||
        message.type === "file";

      let activityType, icon, title, content;

      if (isFileMessage) {
        // This is a file message - get file info from populated Message_fileId
        const fileInfo = message.Message_fileId;
        const fileName =
          fileInfo?.File_originalName ||
          extractFileNameFromContent(
            message.Message_content || message.content
          ) ||
          "Unknown file";

        activityType = "file_message";
        icon = getFileIcon(fileName);
        title = "Shared a file";
        content = fileName;

        // If it's a mixed message (has both text and file), show both
        if (message.Message_type === "mixed" && message.Message_content) {
          content = `${fileName} - "${message.Message_content}"`;
        }
      } else {
        // Regular text message
        activityType = "message";
        icon = "💬";
        title = "Sent a message";
        content =
          message.Message_content || message.content || "Message content";
      }

      activities.push({
        id: message._id,
        type: activityType,
        icon: icon,
        title: title,
        content: content,
        user: message.Message_sender?.User_name || "Unknown User",
        timestamp:
          message.Message_timestamp ||
          message.createdAt ||
          message.Message_createdAt,
        priority: isFileMessage ? 2 : 1,
        metadata:
          isFileMessage && message.Message_fileId
            ? {
                fileUrl: message.Message_fileId.File_url,
                fileSize: message.Message_fileId.File_size,
                fileType: message.Message_fileId.File_type,
                originalName: message.Message_fileId.File_originalName,
                originalMessage: message.Message_content || message.content,
              }
            : {},
      });
    });

    // Add tasks
    filteredTaskData.forEach((task) => {
      // Task creation
      activities.push({
        id: `task-created-${task._id}`,
        type: "task_created",
        icon: "📝",
        title: "Created a task",
        content: task.Task_name,
        user: task.Task_createdBy?.User_name || "Unknown User",
        timestamp: task.Task_createdAt || task.createdAt,
        priority: 2,
        metadata: {
          status: task.Task_status,
          priority: task.Task_priority,
          progress: task.Task_progress || 0,
        },
      });

      // Task updates (if updated recently)
      if (task.Task_updatedAt && task.Task_updatedAt !== task.Task_createdAt) {
        // Try to determine who updated the task
        let updatedByUser = "System";

        // If task is assigned to someone and was recently updated, assume assigned user updated it
        if (task.Task_assignedTo && task.Task_assignedTo.length > 0) {
          const assignedUser = task.Task_assignedTo[0];
          updatedByUser =
            assignedUser?.User_name || assignedUser?.name || "Assigned User";
        } else if (task.Task_updatedBy?.User_name) {
          // If we have explicit update user info
          updatedByUser = task.Task_updatedBy.User_name;
        } else if (task.Task_createdBy?.User_name) {
          // Fallback to task creator
          updatedByUser = task.Task_createdBy.User_name;
        }

        activities.push({
          id: `task-updated-${task._id}`,
          type: "task_updated",
          icon: task.Task_status === "completed" ? "✅" : "📋",
          title:
            task.Task_status === "completed"
              ? "Completed a task"
              : "Updated a task",
          content: task.Task_name,
          user: updatedByUser,
          timestamp: task.Task_updatedAt,
          priority: task.Task_status === "completed" ? 3 : 2,
          metadata: {
            status: task.Task_status,
            priority: task.Task_priority,
            progress: task.Task_progress || 0,
            assignedTo:
              task.Task_assignedTo?.map((u) => u.User_name || u.name).join(
                ", "
              ) || "Unassigned",
          },
        });
      }
    });

    // Add video sessions
    filteredVideoData.forEach((session) => {
      // Get participant names
      const participantNames =
        session.participants?.map((p) => p.name).join(", ") ||
        "No participants";
      const participantCount =
        session.participantCount || session.participants?.length || 0;

      activities.push({
        id: session._id || `video-${session.VideoSession_startTime}`,
        type: "video_session",
        icon: "🎥",
        title: "Started a video session",
        content: `Video session with ${participantCount} participants: ${participantNames}`,
        user:
          session.host ||
          session.VideoSession_host?.User_name ||
          "Unknown Host",
        timestamp: session.VideoSession_startTime || session.startTime,
        priority: 3,
        metadata: {
          duration: session.duration,
          participants: participantCount,
          participantNames: participantNames,
          participantDetails: session.participants || [],
          endTime: session.VideoSession_endTime || session.endTime,
        },
      });

      // Add session end if available
      if (session.VideoSession_endTime || session.endTime) {
        activities.push({
          id: `video-end-${session._id || session.VideoSession_startTime}`,
          type: "video_ended",
          icon: "🎬",
          title: "Ended video session",
          content: `Session lasted ${
            session.duration || "unknown duration"
          } with ${participantCount} participants`,
          user:
            session.host ||
            session.VideoSession_host?.User_name ||
            "Unknown Host",
          timestamp: session.VideoSession_endTime || session.endTime,
          priority: 2,
          metadata: {
            duration: session.duration,
            participants: participantCount,
            participantNames: participantNames,
            participantDetails: session.participants || [],
          },
        });
      }
    });

    // Add group updates (if available)
    if (selectedGroup) {
      if (
        selectedGroup.Group_updatedAt &&
        selectedGroup.Group_updatedAt !== selectedGroup.Group_createdAt
      ) {
        activities.push({
          id: `group-updated-${selectedGroup._id}`,
          type: "group_updated",
          icon: "🏫",
          title: "Group was updated",
          content: selectedGroup.Group_name,
          user: "Admin",
          timestamp: selectedGroup.Group_updatedAt,
          priority: 2,
        });
      }
    }

    // Sort by timestamp (most recent first) and priority
    return activities
      .filter((activity) => activity.timestamp) // Only include activities with timestamps
      .sort((a, b) => {
        const timeA = new Date(a.timestamp);
        const timeB = new Date(b.timestamp);
        if (timeB - timeA === 0) {
          return b.priority - a.priority; // Higher priority first if same time
        }
        return timeB - timeA; // Most recent first
      })
      .slice(0, 15); // Limit to 15 most recent activities
  };

  const handleGroupClick = (groupId) => {
    console.log(`Selecting group: ${groupId}`);
    fetchGroupDetails(groupId, selectedPeriod);
  };

  const handleClearSelection = () => {
    setSelectedGroup(null);
    setMembers([]);
    setTaskData([]);
    setChatData([]);
    setVideoData([]);
    setError("");
  };

  // Enhanced multi-format export functions
  const downloadReport = async (format = "pdf", sectionType = "full") => {
    if (!selectedGroup && sectionType !== "full" && sectionType !== "groups") {
      alert("Please select a group first");
      return;
    }

    try {
      const baseFileName = selectedGroup
        ? `StudyHub_${selectedGroup.Group_name.replace(
            /[^a-zA-Z0-9]/g,
            "_"
          )}_${getSectionTitle(sectionType).replace(
            /[^a-zA-Z0-9]/g,
            "_"
          )}_${formatDate(new Date(), "yyyy-MM-dd")}`
        : `StudyHub_Platform_Report_${formatDate(new Date(), "yyyy-MM-dd")}`;

      switch (format) {
        case "pdf":
          await generatePDFReport(sectionType, baseFileName);
          break;
        case "excel":
          await generateExcelReport(sectionType, baseFileName);
          break;
        case "word":
          await generateWordReport(sectionType, baseFileName);
          break;
        default:
          alert("Unsupported format");
      }
    } catch (error) {
      console.error(`Error generating ${format} report:`, error);
      alert(`Error generating ${format} report. Please try again.`);
    }
  };

  const generatePDFReport = async (sectionType, fileName) => {
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;

    let currentY = margin;
    let pageNumber = 1;

    const addHeader = () => {
      pdf.setFillColor(102, 126, 234);
      pdf.rect(0, 0, pageWidth, 25, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(18);
      pdf.setFont("helvetica", "bold");
      pdf.text("StudyHub Report", margin, 15);
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      pdf.text(
        formatDate(new Date(), "MMM dd, yyyy"),
        pageWidth - margin - 30,
        15
      );
      currentY = 35;
    };

    const addFooter = () => {
      pdf.setTextColor(128, 128, 128);
      pdf.setFontSize(8);
      pdf.text(`Page ${pageNumber}`, pageWidth / 2 - 10, pageHeight - 10);
      pdf.text("Generated by StudyHub Analytics", margin, pageHeight - 10);
      pageNumber++;
    };

    addHeader();

    // Add title
    pdf.setTextColor(44, 62, 80);
    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    const title = selectedGroup
      ? `${selectedGroup.Group_name} - ${getSectionTitle(sectionType)}`
      : "Platform Overview Report";
    pdf.text(title, margin, currentY);
    currentY += 20;

    // Generate tables based on section type
    await generatePDFTables(pdf, sectionType, currentY);

    addFooter();
    pdf.save(`${fileName}.pdf`);
  };

  const generatePDFTables = async (pdf, sectionType, startY) => {
    let currentY = startY;

    // Helper function to add section headers
    const addSectionHeader = (title) => {
      // Check if we need a new page (more conservative spacing)
      if (currentY > pdf.internal.pageSize.getHeight() - 80) {
        pdf.addPage();
        currentY = 30;
      }

      // Add extra space before section (except for first section)
      if (currentY > 50) {
        currentY += 10;
      }

      pdf.setTextColor(44, 62, 80);
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text(title, 20, currentY);
      currentY += 12;

      // Add a subtle line under the section header
      pdf.setDrawColor(200, 200, 200);
      pdf.line(
        20,
        currentY - 2,
        pdf.internal.pageSize.getWidth() - 20,
        currentY - 2
      );
      currentY += 8;
    };

    // Helper function to add tables with proper spacing
    const addTable = (tableConfig) => {
      // Check if table will fit on current page (estimate 20px per row + header)
      const estimatedHeight = (tableConfig.body.length + 1) * 20 + 40;
      
      if (currentY + estimatedHeight > pdf.internal.pageSize.getHeight() - 40) {
        pdf.addPage();
        currentY = 30;
      }

      autoTable(pdf, {
        ...tableConfig,
        startY: currentY,
        theme: "striped",
        headStyles: { 
          fillColor: [102, 126, 234],
          textColor: [255, 255, 255],
          fontSize: 10,
          fontStyle: 'bold'
        },
        bodyStyles: {
          fontSize: 9,
          textColor: [44, 62, 80]
        },
        margin: { left: 20, right: 20 },
        tableLineColor: [200, 200, 200],
        tableLineWidth: 0.1,
      });
      
      currentY = pdf.lastAutoTable.finalY + 15;
    };

    if (sectionType === "full" || sectionType === "overview") {
      addSectionHeader("ACTIVITY OVERVIEW");

      const { filteredChatData, filteredTaskData, filteredVideoData } =
        getFilteredData();
      const overviewData = [
        ["Metric", "Count", "Period", "Status"],
        [
          "Messages",
          filteredChatData.length,
          `Last ${selectedPeriod.replace("d", " days")}`,
          "Active",
        ],
        [
          "Tasks",
          filteredTaskData.length,
          `Last ${selectedPeriod.replace("d", " days")}`,
          "Tracked",
        ],
        [
          "Video Sessions",
          filteredVideoData.length,
          `Last ${selectedPeriod.replace("d", " days")}`,
          "Recorded",
        ],
        ["Group Members", members.length, "Current", "Active"],
      ];

      addTable({
        head: [overviewData[0]],
        body: overviewData.slice(1),
      });
    }

    if (sectionType === "full" || sectionType === "tasks") {
      if (taskData.length > 0) {
        addSectionHeader("TASK PERFORMANCE");

        const taskTableData = taskData
          .slice(0, 20)
          .map((task) => [
            sanitizeText(task.Task_name || "Unnamed Task"),
            sanitizeText(task.Task_status || "Pending"),
            `${task.Task_progress || 0}%`,
            sanitizeText(task.Task_priority || "Medium"),
            formatDate(task.Task_dueDate, "MMM dd, yyyy") || "No due date",
            task.Task_assignedTo?.map((u) =>
              sanitizeText(u.User_name || u.name)
            ).join(", ") || "Unassigned",
          ]);

        addTable({
          head: [
            [
              "Task Name",
              "Status",
              "Progress",
              "Priority",
              "Due Date",
              "Assigned To",
            ],
          ],
          body: taskTableData,
          columnStyles: {
            0: { cellWidth: 40 },
            1: { cellWidth: 20 },
            2: { cellWidth: 15 },
            3: { cellWidth: 20 },
            4: { cellWidth: 25 },
            5: { cellWidth: 30 },
          },
        });
      }
    }

    if (sectionType === "full" || sectionType === "members") {
      if (members.length > 0) {
        addSectionHeader("GROUP MEMBERS");
        const memberTableData = members.map((member) => [
          sanitizeText(member.User_name || member.name || "Unknown"),
          sanitizeText(member.User_email || member.email || "No email"),
          member.isCreator ? "Creator" : member.isAdmin ? "Admin" : "Member",
          formatDate(
            member.createdAt || member.User_createdAt,
            "MMM dd, yyyy"
          ) || "Unknown",
        ]);

        addTable({
          head: [["Name", "Email", "Role", "Joined Date"]],
          body: memberTableData,
        });
      }
    }

    if (sectionType === "full" || sectionType === "activity") {
      const recentActivity = getRecentActivity().slice(0, 15);
      if (recentActivity.length > 0) {
        addSectionHeader("RECENT ACTIVITY");
        const activityTableData = recentActivity.map((activity) => [
          formatDate(activity.timestamp, "MMM dd, HH:mm") || "Unknown",
          activity.user || "Unknown User",
          activity.title || "No title",
          activity.type.replace(/_/g, " ").toUpperCase(),
          (activity.content || "").substring(0, 50) +
            (activity.content?.length > 50 ? "..." : ""),
        ]);

        autoTable(pdf, {
          head: [["Time", "User", "Action", "Type", "Details"]],
          body: activityTableData,
          startY: currentY,
          theme: "striped",
          headStyles: { fillColor: [102, 126, 234] },
          margin: { left: 20, right: 20 },
          columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 30 },
            2: { cellWidth: 35 },
            3: { cellWidth: 20 },
            4: { cellWidth: 40 },
          },
        });
      }
    }

    if (sectionType === "full" || sectionType === "groups") {
      if (groupData.length > 0) {
        addSectionHeader("GROUPS OVERVIEW");
        const groupTableData = groupData.map((group) => [
          group.Group_name || "Unnamed Group",
          group.Group_description || "No description",
          group.Group_memberCount || 0,
          formatDate(group.Group_createdAt, "MMM dd, yyyy") || "Unknown",
          formatDate(group.Group_updatedAt, "MMM dd, yyyy") || "Unknown",
          group.Group_updatedAt &&
          new Date(group.Group_updatedAt) > subDays(new Date(), 7)
            ? "Active"
            : "Inactive",
        ]);

        autoTable(pdf, {
          head: [
            [
              "Group Name",
              "Description",
              "Members",
              "Created",
              "Last Updated",
              "Status",
            ],
          ],
          body: groupTableData,
          startY: currentY,
          theme: "striped",
          headStyles: { fillColor: [102, 126, 234] },
          margin: { left: 20, right: 20 },
          columnStyles: {
            0: { cellWidth: 35 },
            1: { cellWidth: 45 },
            2: { cellWidth: 20 },
            3: { cellWidth: 25 },
            4: { cellWidth: 25 },
            5: { cellWidth: 20 },
          },
        });
        currentY = pdf.lastAutoTable.finalY + 20;
      }
    }

    // Add Engagement Metrics section
    if (sectionType === "full" || sectionType === "engagement") {
      const engagementMetrics = calculateEngagementMetrics();

      if (
        engagementMetrics.totalMessages > 0 ||
        engagementMetrics.totalVideoSessions > 0
      ) {
        addSectionHeader("ENGAGEMENT METRICS");
        const engagementData = [
          ["Engagement Metric", "Value", "Details"],
          [
            "Total Messages",
            engagementMetrics.totalMessages,
            `From ${engagementMetrics.uniqueSenders} unique users`,
          ],
          [
            "Messages per User",
            engagementMetrics.messagesPerUser,
            "Average messages per active user",
          ],
          [
            "Video Sessions",
            engagementMetrics.totalVideoSessions,
            "Total video meetings held",
          ],
          [
            "Avg Video Duration",
            `${engagementMetrics.avgVideoTime} min`,
            "Average session length",
          ],
          [
            "Active Users",
            engagementMetrics.uniqueSenders,
            "Users who sent messages",
          ],
        ];

        autoTable(pdf, {
          head: [engagementData[0]],
          body: engagementData.slice(1),
          startY: currentY,
          theme: "striped",
          headStyles: { fillColor: [102, 126, 234] },
          margin: { left: 20, right: 20 },
          columnStyles: {
            0: { cellWidth: 60 },
            1: { cellWidth: 30 },
            2: { cellWidth: 80 },
          },
        });
        currentY = pdf.lastAutoTable.finalY + 20;
      }
    }

    // Add Video Sessions section
    if (sectionType === "full" || sectionType === "videos") {
      const { filteredVideoData } = getFilteredData();

      if (filteredVideoData.length > 0) {
        addSectionHeader("VIDEO SESSIONS");
        const videoTableData = filteredVideoData
          .slice(0, 15)
          .map((session) => [
            session.host ||
              session.VideoSession_host?.User_name ||
              "Unknown Host",
            session.participantCount || session.participants?.length || 0,
            session.duration || "N/A",
            formatDate(
              session.VideoSession_startTime || session.startTime,
              "MMM dd, HH:mm"
            ) || "Unknown",
            formatDate(
              session.VideoSession_endTime || session.endTime,
              "MMM dd, HH:mm"
            ) || "Ongoing",
            (
              session.participants?.map((p) => p.name).join(", ") ||
              "No participants"
            ).substring(0, 40) +
              (session.participants?.map((p) => p.name).join(", ").length > 40
                ? "..."
                : ""),
          ]);

        autoTable(pdf, {
          head: [
            [
              "Host",
              "Participants",
              "Duration",
              "Start Time",
              "End Time",
              "Attendees",
            ],
          ],
          body: videoTableData,
          startY: currentY,
          theme: "striped",
          headStyles: { fillColor: [102, 126, 234] },
          margin: { left: 20, right: 20 },
          columnStyles: {
            0: { cellWidth: 30 },
            1: { cellWidth: 20 },
            2: { cellWidth: 25 },
            3: { cellWidth: 30 },
            4: { cellWidth: 30 },
            5: { cellWidth: 35 },
          },
        });
        currentY = pdf.lastAutoTable.finalY + 20;
      }
    }

    // Add Most Active Members section
    if (sectionType === "full" || sectionType === "engagement") {
      const mostActiveMembers = getMostActiveMembers();

      if (mostActiveMembers.length > 0) {
        addSectionHeader("MOST ACTIVE MEMBERS");
        const activeData = [
          ["Rank", "Member Name", "Messages Sent", "Activity Level"],
          ...mostActiveMembers.map((member, index) => [
            `#${index + 1}`,
            member.name,
            member.messageCount,
            member.messageCount > 50
              ? "Very Active"
              : member.messageCount > 20
              ? "Active"
              : member.messageCount > 10
              ? "Moderate"
              : "Low",
          ]),
        ];

        autoTable(pdf, {
          head: [activeData[0]],
          body: activeData.slice(1),
          startY: currentY,
          theme: "striped",
          headStyles: { fillColor: [102, 126, 234] },
          margin: { left: 20, right: 20 },
          columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 60 },
            2: { cellWidth: 30 },
            3: { cellWidth: 40 },
          },
        });
        currentY = pdf.lastAutoTable.finalY + 20;
      }
    }

    // Add Chat Messages section
    if (
      sectionType === "full" ||
      sectionType === "messages" ||
      sectionType === "chat"
    ) {
      const { filteredChatData } = getFilteredData();

      if (filteredChatData.length > 0) {
        addSectionHeader("CHAT MESSAGES");
        const chatTableData = filteredChatData.slice(0, 50).map((message) => {
          const isFileMessage =
            message.Message_type === "file" ||
            message.Message_type === "mixed" ||
            message.Message_fileId;

          let messageContent = cleanTextForExport(
            message.Message_content || message.content || "",
            80
          );

          if (isFileMessage) {
            const rawFileName =
              message.Message_fileId?.File_originalName ||
              extractFileNameFromContent(messageContent) ||
              "Unknown file";
            const fileName = sanitizeFileName(rawFileName);

            if (message.Message_type === "mixed" && messageContent) {
              messageContent = `[File] ${fileName} - "${messageContent}"`;
            } else {
              messageContent = `[File] ${fileName}`;
            }
          }

          return [
            formatDate(
              message.Message_timestamp ||
                message.createdAt ||
                message.Message_createdAt,
              "MMM dd, HH:mm"
            ) || "Unknown",
            sanitizeText(message.Message_sender?.User_name || "Unknown User"),
            isFileMessage ? "File" : "Text",
            messageContent,
            isFileMessage && message.Message_fileId
              ? formatFileSize(message.Message_fileId.File_size)
              : "-",
          ];
        });

        autoTable(pdf, {
          head: [["Time", "Sender", "Type", "Message/File", "Size"]],
          body: chatTableData,
          startY: currentY,
          theme: "striped",
          headStyles: { fillColor: [102, 126, 234] },
          margin: { left: 20, right: 20 },
          columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 35 },
            2: { cellWidth: 20 },
            3: { cellWidth: 80 },
            4: { cellWidth: 20 },
          },
        });
        currentY = pdf.lastAutoTable.finalY + 20;
      }
    }
  };

  const generateExcelReport = async (sectionType, fileName) => {
    try {
      // Use a simpler approach that doesn't trigger Buffer issues
      const workbook = XLSX.utils.book_new();

      // Overview Sheet
      if (sectionType === "full" || sectionType === "overview") {
        const { filteredChatData, filteredTaskData, filteredVideoData } =
          getFilteredData();
        const overviewData = [
          ["StudyHub Report - Overview"],
          ["Generated:", formatDate(new Date(), "MMM dd, yyyy 'at' HH:mm")],
          ["Group:", selectedGroup?.Group_name || "Platform Overview"],
          ["Period:", `Last ${selectedPeriod.replace("d", " days")}`],
          [],
          ["Metric", "Count", "Status"],
          ["Messages", filteredChatData.length, "Active"],
          ["Tasks", filteredTaskData.length, "Tracked"],
          ["Video Sessions", filteredVideoData.length, "Recorded"],
          ["Group Members", members.length, "Active"],
        ];

        const overviewSheet = XLSX.utils.aoa_to_sheet(overviewData);
        XLSX.utils.book_append_sheet(workbook, overviewSheet, "Overview");
      }

      // Tasks Sheet
      if (
        (sectionType === "full" || sectionType === "tasks") &&
        taskData.length > 0
      ) {
        const taskHeaders = [
          "Task Name",
          "Status",
          "Progress (%)",
          "Priority",
          "Due Date",
          "Assigned To",
          "Created Date",
        ];
        const taskRows = taskData.map((task) => [
          sanitizeText(task.Task_name || "Unnamed Task"),
          sanitizeText(task.Task_status || "Pending"),
          task.Task_progress || 0,
          sanitizeText(task.Task_priority || "Medium"),
          formatDate(task.Task_dueDate, "MMM dd, yyyy") || "No due date",
          task.Task_assignedTo?.map((u) =>
            sanitizeText(u.User_name || u.name)
          ).join(", ") || "Unassigned",
          formatDate(task.Task_createdAt, "MMM dd, yyyy") || "Unknown",
        ]);

        const taskData2D = [taskHeaders, ...taskRows];
        const taskSheet = XLSX.utils.aoa_to_sheet(taskData2D);
        XLSX.utils.book_append_sheet(workbook, taskSheet, "Tasks");
      }

      // Members Sheet
      if (
        (sectionType === "full" || sectionType === "members") &&
        members.length > 0
      ) {
        const memberHeaders = ["Name", "Email", "Role", "Joined Date"];
        const memberRows = members.map((member) => [
          sanitizeText(member.User_name || member.name || "Unknown"),
          sanitizeText(member.User_email || member.email || "No email"),
          member.isCreator ? "Creator" : member.isAdmin ? "Admin" : "Member",
          formatDate(
            member.createdAt || member.User_createdAt,
            "MMM dd, yyyy"
          ) || "Unknown",
        ]);

        const memberData2D = [memberHeaders, ...memberRows];
        const memberSheet = XLSX.utils.aoa_to_sheet(memberData2D);
        XLSX.utils.book_append_sheet(workbook, memberSheet, "Members");
      }

      // Activity Sheet
      if (sectionType === "full" || sectionType === "activity") {
        const recentActivity = getRecentActivity();
        if (recentActivity.length > 0) {
          const activityHeaders = [
            "Date/Time",
            "User",
            "Action",
            "Type",
            "Details",
          ];
          const activityRows = recentActivity.map((activity) => [
            formatDate(activity.timestamp, "MMM dd, yyyy HH:mm") || "Unknown",
            activity.user || "Unknown User",
            activity.title || "No title",
            activity.type.replace(/_/g, " ").toUpperCase(),
            activity.content || "",
          ]);

          const activityData2D = [activityHeaders, ...activityRows];
          const activitySheet = XLSX.utils.aoa_to_sheet(activityData2D);
          XLSX.utils.book_append_sheet(workbook, activitySheet, "Activity");
        }
      }

      // Video Sessions Sheet
      if (
        (sectionType === "full" || sectionType === "videos") &&
        videoData.length > 0
      ) {
        const videoHeaders = [
          "Host",
          "Participants Count",
          "Duration",
          "Start Time",
          "End Time",
          "Attendees",
        ];
        const videoRows = videoData.map((session) => [
          session.host || session.VideoSession_host?.User_name || "Unknown",
          session.participantCount || session.participants?.length || 0,
          session.duration || "N/A",
          formatDate(session.VideoSession_startTime, "MMM dd, yyyy HH:mm") ||
            "Unknown",
          formatDate(session.VideoSession_endTime, "MMM dd, yyyy HH:mm") ||
            "Ongoing",
          session.participants?.map((p) => p.name).join(", ") ||
            "No participants",
        ]);

        const videoData2D = [videoHeaders, ...videoRows];
        const videoSheet = XLSX.utils.aoa_to_sheet(videoData2D);
        XLSX.utils.book_append_sheet(workbook, videoSheet, "Video Sessions");
      }

      // Chat Messages Sheet
      if (
        (sectionType === "full" ||
          sectionType === "messages" ||
          sectionType === "chat") &&
        chatData.length > 0
      ) {
        const { filteredChatData } = getFilteredData();

        const chatHeaders = [
          "Date/Time",
          "Sender",
          "Message Type",
          "Content",
          "File Name",
          "File Size",
          "File Type",
        ];

        const chatRows = filteredChatData.map((message) => {
          const isFileMessage =
            message.Message_type === "file" ||
            message.Message_type === "mixed" ||
            message.Message_fileId;

          let messageContent = cleanTextForExport(
            message.Message_content || message.content || "",
            500
          );
          let fileName = "";
          let fileSize = "";
          let fileType = "";

          if (isFileMessage && message.Message_fileId) {
            const rawFileName =
              message.Message_fileId.File_originalName || "Unknown file";
            fileName = sanitizeFileName(rawFileName);
            fileSize = formatFileSize(message.Message_fileId.File_size) || "";
            fileType = sanitizeText(message.Message_fileId.File_type || "");
          } else if (isFileMessage) {
            const rawFileName =
              extractFileNameFromContent(messageContent) || "Unknown file";
            fileName = sanitizeFileName(rawFileName);
          }

          return [
            formatDate(
              message.Message_timestamp ||
                message.createdAt ||
                message.Message_createdAt,
              "MMM dd, yyyy HH:mm"
            ) || "Unknown",
            sanitizeText(message.Message_sender?.User_name || "Unknown User"),
            isFileMessage
              ? message.Message_type === "mixed"
                ? "Text + File"
                : "File"
              : "Text",
            messageContent || (isFileMessage ? `Shared file: ${fileName}` : ""),
            fileName,
            fileSize,
            fileType,
          ];
        });

        const chatData2D = [chatHeaders, ...chatRows];
        const chatSheet = XLSX.utils.aoa_to_sheet(chatData2D);
        XLSX.utils.book_append_sheet(workbook, chatSheet, "Chat Messages");
      }

      // Groups Sheet
      if (
        (sectionType === "full" || sectionType === "groups") &&
        groupData.length > 0
      ) {
        const groupHeaders = [
          "Group Name",
          "Description",
          "Members Count",
          "Created Date",
          "Last Updated",
          "Status",
        ];
        const groupRows = groupData.map((group) => [
          group.Group_name || "Unnamed Group",
          group.Group_description || "No description",
          group.Group_memberCount || 0,
          formatDate(group.Group_createdAt, "MMM dd, yyyy") || "Unknown",
          formatDate(group.Group_updatedAt, "MMM dd, yyyy") || "Unknown",
          group.Group_updatedAt &&
          new Date(group.Group_updatedAt) > subDays(new Date(), 7)
            ? "Active"
            : "Inactive",
        ]);

        const groupData2D = [groupHeaders, ...groupRows];
        const groupSheet = XLSX.utils.aoa_to_sheet(groupData2D);
        XLSX.utils.book_append_sheet(workbook, groupSheet, "My Groups");
      }

      // Use XLSX.writeFile which handles browser compatibility internally
      try {
        XLSX.writeFile(workbook, `${fileName}.xlsx`);
      } catch (writeFileError) {
        console.warn(
          "XLSX.writeFile failed, trying alternative approach:",
          writeFileError
        );

        // Fallback: Generate as CSV which is Excel-compatible
        const sheets = Object.keys(workbook.Sheets);
        const firstSheet = sheets[0];

        if (firstSheet && workbook.Sheets[firstSheet]) {
          const csvData = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheet]);
          const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `${fileName}.csv`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);

          alert(
            "Downloaded as CSV format (Excel-compatible). You can open this file in Excel."
          );
        } else {
          throw new Error("No data available to export");
        }
      }
    } catch (error) {
      console.error("Error generating Excel report:", error);
      alert("Error generating Excel report. Please try PDF format instead.");
    }
  };

  const generateWordReport = async (sectionType, fileName) => {
    try {
      const doc = new Document({
        sections: [
          {
            properties: {},
            children: [
              new Paragraph({
                text: "StudyHub Report",
                heading: HeadingLevel.TITLE,
                alignment: AlignmentType.CENTER,
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Generated: ${formatDate(
                      new Date(),
                      "MMM dd, yyyy 'at' HH:mm"
                    )}`,
                    break: 1,
                  }),
                  new TextRun({
                    text: `Group: ${
                      selectedGroup?.Group_name || "Platform Overview"
                    }`,
                    break: 1,
                  }),
                  new TextRun({
                    text: `Period: Last ${selectedPeriod.replace(
                      "d",
                      " days"
                    )}`,
                    break: 1,
                  }),
                ],
              }),
              ...(await generateWordContent(sectionType)),
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileName}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error generating Word report:", error);
      alert("Error generating Word report. Please try PDF format instead.");
    }
  };

  const generateWordContent = async (sectionType) => {
    const content = [];

    // Overview Section
    if (sectionType === "full" || sectionType === "overview") {
      const { filteredChatData, filteredTaskData, filteredVideoData } =
        getFilteredData();

      content.push(
        new Paragraph({
          text: "Activity Overview",
          heading: HeadingLevel.HEADING_1,
        })
      );

      const overviewTable = new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph("Metric")] }),
              new TableCell({ children: [new Paragraph("Count")] }),
              new TableCell({ children: [new Paragraph("Status")] }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph("Messages")] }),
              new TableCell({
                children: [new Paragraph(filteredChatData.length.toString())],
              }),
              new TableCell({ children: [new Paragraph("Active")] }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph("Tasks")] }),
              new TableCell({
                children: [new Paragraph(filteredTaskData.length.toString())],
              }),
              new TableCell({ children: [new Paragraph("Tracked")] }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph("Video Sessions")] }),
              new TableCell({
                children: [new Paragraph(filteredVideoData.length.toString())],
              }),
              new TableCell({ children: [new Paragraph("Recorded")] }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph("Group Members")] }),
              new TableCell({
                children: [new Paragraph(members.length.toString())],
              }),
              new TableCell({ children: [new Paragraph("Active")] }),
            ],
          }),
        ],
      });
      content.push(overviewTable);
    }

    // Tasks Section
    if (
      (sectionType === "full" || sectionType === "tasks") &&
      taskData.length > 0
    ) {
      content.push(
        new Paragraph({
          text: "Tasks",
          heading: HeadingLevel.HEADING_1,
        })
      );

      const taskRows = [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph("Task Name")] }),
            new TableCell({ children: [new Paragraph("Status")] }),
            new TableCell({ children: [new Paragraph("Progress")] }),
            new TableCell({ children: [new Paragraph("Priority")] }),
            new TableCell({ children: [new Paragraph("Due Date")] }),
          ],
        }),
      ];

      taskData.slice(0, 20).forEach((task) => {
        taskRows.push(
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph(task.Task_name || "Unnamed Task")],
              }),
              new TableCell({
                children: [new Paragraph(task.Task_status || "Pending")],
              }),
              new TableCell({
                children: [new Paragraph(`${task.Task_progress || 0}%`)],
              }),
              new TableCell({
                children: [new Paragraph(task.Task_priority || "Medium")],
              }),
              new TableCell({
                children: [
                  new Paragraph(
                    formatDate(task.Task_dueDate, "MMM dd, yyyy") ||
                      "No due date"
                  ),
                ],
              }),
            ],
          })
        );
      });

      const taskTable = new Table({ rows: taskRows });
      content.push(taskTable);
    }

    // Members Section
    if (
      (sectionType === "full" || sectionType === "members") &&
      members.length > 0
    ) {
      content.push(
        new Paragraph({
          text: "Group Members",
          heading: HeadingLevel.HEADING_1,
        })
      );

      const memberRows = [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph("Name")] }),
            new TableCell({ children: [new Paragraph("Email")] }),
            new TableCell({ children: [new Paragraph("Role")] }),
            new TableCell({ children: [new Paragraph("Joined Date")] }),
          ],
        }),
      ];

      members.forEach((member) => {
        memberRows.push(
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph(member.User_name || member.name || "Unknown"),
                ],
              }),
              new TableCell({
                children: [
                  new Paragraph(
                    member.User_email || member.email || "No email"
                  ),
                ],
              }),
              new TableCell({
                children: [
                  new Paragraph(
                    member.isCreator
                      ? "Creator"
                      : member.isAdmin
                      ? "Admin"
                      : "Member"
                  ),
                ],
              }),
              new TableCell({
                children: [
                  new Paragraph(
                    formatDate(
                      member.createdAt || member.User_createdAt,
                      "MMM dd, yyyy"
                    ) || "Unknown"
                  ),
                ],
              }),
            ],
          })
        );
      });

      const memberTable = new Table({ rows: memberRows });
      content.push(memberTable);
    }

    // Groups Section
    if (
      (sectionType === "full" || sectionType === "groups") &&
      groupData.length > 0
    ) {
      content.push(
        new Paragraph({
          text: "My Groups",
          heading: HeadingLevel.HEADING_1,
        })
      );

      const groupRows = [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph("Group Name")] }),
            new TableCell({ children: [new Paragraph("Description")] }),
            new TableCell({ children: [new Paragraph("Members")] }),
            new TableCell({ children: [new Paragraph("Created")] }),
            new TableCell({ children: [new Paragraph("Status")] }),
          ],
        }),
      ];

      groupData.forEach((group) => {
        groupRows.push(
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph(group.Group_name || "Unnamed Group")],
              }),
              new TableCell({
                children: [
                  new Paragraph(group.Group_description || "No description"),
                ],
              }),
              new TableCell({
                children: [
                  new Paragraph((group.Group_memberCount || 0).toString()),
                ],
              }),
              new TableCell({
                children: [
                  new Paragraph(
                    formatDate(group.Group_createdAt, "MMM dd, yyyy") ||
                      "Unknown"
                  ),
                ],
              }),
              new TableCell({
                children: [
                  new Paragraph(
                    group.Group_updatedAt &&
                    new Date(group.Group_updatedAt) > subDays(new Date(), 7)
                      ? "Active"
                      : "Inactive"
                  ),
                ],
              }),
            ],
          })
        );
      });

      const groupTable = new Table({ rows: groupRows });
      content.push(groupTable);
    }

    return content;
  };

  // Legacy function for backward compatibility
  const downloadSection = async (sectionType) => {
    await downloadReport("pdf", sectionType);
  };

  const getSectionTitle = (sectionType) => {
    const titles = {
      overview: "Activity Overview",
      tasks: "Task Performance",
      activity: "Recent Activity",
      engagement: "Engagement Metrics",
      videos: "Video Sessions",
      messages: "Chat Messages",
      chat: "Chat Messages",
      members: "Group Members",
      groups: "My Groups Overview",
    };
    return titles[sectionType] || "Section Report";
  };

  const generateSectionContent = async (sectionType, helpers) => {
    const { addSectionTitle, addText, addMetricsBox, cleanText } = helpers;
    const { filteredChatData, filteredTaskData, filteredVideoData } =
      getFilteredData();

    switch (sectionType) {
      case "overview":
        const fileMessageCount = filteredChatData.filter(
          (msg) =>
            msg.Message_type === "file" ||
            msg.Message_type === "mixed" ||
            msg.Message_fileId
        ).length;

        addSectionTitle("Activity Overview");
        addMetricsBox({
          Messages: filteredChatData.length,
          Tasks: filteredTaskData.length,
          "Video Sessions": filteredVideoData.length,
          "Files Shared": fileMessageCount,
        });
        addText(`Total Activities: ${getRecentActivity().length}`, 12, true);
        break;

      case "tasks":
        if (taskData.length > 0) {
          const taskMetrics = calculateTaskMetrics();
          addSectionTitle("Task Performance");
          addMetricsBox({
            Total: taskMetrics.total,
            Completed: taskMetrics.completed,
            "In Progress": taskMetrics.inProgress,
            Pending: taskMetrics.pending,
            Overdue: taskMetrics.overdue,
          });
          addText(`Completion Rate: ${taskMetrics.completionRate}%`, 12, true);
          addText(`Average Progress: ${taskMetrics.avgProgress}%`, 12, true);

          addText("Progress Distribution:", 11, true);
          addText(
            `• High Progress (75-100%): ${taskMetrics.highProgress} tasks`
          );
          addText(
            `• Medium Progress (25-74%): ${taskMetrics.mediumProgress} tasks`
          );
          addText(`• Low Progress (0-24%): ${taskMetrics.lowProgress} tasks`);

          addText("Recent Tasks:", 11, true);
          taskData.slice(0, 10).forEach((task) => {
            const progressText = task.Task_progress
              ? ` (${task.Task_progress}% complete)`
              : "";
            const assignedText =
              task.Task_assignedTo && task.Task_assignedTo.length > 0
                ? ` - Assigned to: ${task.Task_assignedTo.map(
                    (u) => u.User_name || u.name
                  ).join(", ")}`
                : "";
            addText(
              `• ${cleanText(task.Task_name)} - ${
                task.Task_status || "pending"
              }${progressText} (Due: ${
                formatDate(task.Task_dueDate, "MMM dd") || "N/A"
              })${assignedText}`
            );
          });
        }
        break;

      case "activity":
        const recentActivity = getRecentActivity();
        if (recentActivity.length > 0) {
          addSectionTitle("Recent Activity");
          addText(`Total Activities: ${recentActivity.length}`, 12, true);

          const messageCount = recentActivity.filter(
            (a) => a.type === "message"
          ).length;
          const fileMessageCount = recentActivity.filter(
            (a) => a.type === "file_message"
          ).length;
          const taskCount = recentActivity.filter((a) =>
            a.type.includes("task")
          ).length;
          const videoCount = recentActivity.filter((a) =>
            a.type.includes("video")
          ).length;

          addText(`Text Messages: ${messageCount}`);
          addText(`Files Shared in Chat: ${fileMessageCount}`);
          addText(`Task Activities: ${taskCount}`);
          addText(`Video Sessions: ${videoCount}`);

          addText("Activity Timeline:", 11, true);
          recentActivity.slice(0, 20).forEach((activity) => {
            const timeStr = formatDate(activity.timestamp, "MMM dd, HH:mm");
            const activityIcon =
              activity.type === "message"
                ? "MSG"
                : activity.type === "file_message"
                ? "FILE"
                : activity.type.includes("task")
                ? "TASK"
                : activity.type.includes("video")
                ? "VIDEO"
                : "ACT";

            addText(
              `• [${activityIcon}] ${timeStr} - ${cleanText(
                activity.user
              )}: ${cleanText(activity.title)}`
            );
            if (activity.content && activity.content !== activity.title) {
              addText(`  ${cleanText(activity.content)}`);
            }
          });
        }
        break;

      case "engagement":
        if (chatData.length > 0 || videoData.length > 0) {
          const engagement = calculateEngagementMetrics();
          addSectionTitle("Engagement Analytics");
          addMetricsBox({
            Messages: engagement.totalMessages,
            "Active Users": engagement.uniqueSenders,
            "Video Sessions": engagement.totalVideoSessions,
            "Avg Session": `${engagement.avgVideoTime}min`,
          });

          const activeMembers = getMostActiveMembers();
          if (activeMembers.length > 0) {
            addText("Most Active Members:", 11, true);
            activeMembers.forEach((member) => {
              addText(
                `• ${cleanText(member.name)}: ${member.messageCount} messages`
              );
            });
          }
        }
        break;

      case "videos":
        if (videoData.length > 0) {
          addSectionTitle("Video Sessions");
          addText(`Total Sessions: ${videoData.length}`, 12, true);

          videoData.forEach((session, index) => {
            addText(`Session ${index + 1}:`);
            addText(`  Host: ${cleanText(session.host) || "Unknown"}`);
            addText(`  Participants: ${session.participantCount || 0}`);

            if (session.participants && session.participants.length > 0) {
              const participantNames = session.participants
                .map((p) => cleanText(p.name))
                .join(", ");
              addText(`  Attendees: ${participantNames}`);
            }

            addText(`  Duration: ${cleanText(session.duration) || "N/A"}`);
            addText(
              `  Started: ${formatDate(
                session.VideoSession_startTime,
                "MMM dd, HH:mm"
              )}`
            );

            if (session.VideoSession_endTime) {
              addText(
                `  Ended: ${formatDate(
                  session.VideoSession_endTime,
                  "MMM dd, HH:mm"
                )}`
              );
            }
            addText("");
          });
        }
        break;

      case "members":
        if (members.length > 0) {
          addSectionTitle("Group Members");
          addText(`Total Members: ${members.length}`, 12, true);

          const creators = members.filter((m) => m.isCreator);
          const admins = members.filter((m) => m.isAdmin && !m.isCreator);
          const regularMembers = members.filter(
            (m) => !m.isAdmin && !m.isCreator
          );

          if (creators.length > 0) {
            addText("Creators:", 10, true);
            creators.forEach((member) =>
              addText(`• ${cleanText(member.User_name || member.name)}`)
            );
          }

          if (admins.length > 0) {
            addText("Admins:", 10, true);
            admins.forEach((member) =>
              addText(`• ${cleanText(member.User_name || member.name)}`)
            );
          }

          if (regularMembers.length > 0) {
            addText("Members:", 10, true);
            regularMembers.forEach((member) =>
              addText(`• ${cleanText(member.User_name || member.name)}`)
            );
          }

          // Add member activity if available
          const activeMembers = getMostActiveMembers();
          if (activeMembers.length > 0) {
            addText("Member Activity:", 10, true);
            activeMembers.forEach((member) => {
              addText(
                `• ${cleanText(member.name)}: ${member.messageCount} messages`
              );
            });
          }
        }
        break;

      default:
        addText("Section not found");
    }
  };

  const generatePDF = async () => {
    await downloadReport("pdf", "full");
  };

  // Utility functions for report generation
  const reportUtils = {
    generatePDF,
    generateSectionContent,
    downloadReport,
    downloadSection
  };

  // Log available report utilities for debugging
  console.log('Report utilities available:', Object.keys(reportUtils));

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="project-report">
      <div className="report-header">
        <h1>StudyHub Project Report</h1>
        {selectedGroup && (
          <div>
            <h2>Group: {selectedGroup.Group_name}</h2>
            <p>
              <strong>Description:</strong>{" "}
              {selectedGroup.Group_description || "No description available"}
            </p>
          </div>
        )}
        <div className="controls-container">
          <div className="filter-container">
            <label htmlFor="time-period">Select Time Period:</label>
            <select
              id="time-period"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
            >
              <option value="7d">Last 7 Days</option>
              <option value="14d">Last 14 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
            </select>
          </div>

          {selectedGroup && (
            <div className="auto-refresh-container">
              <label>
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                Auto-refresh (30s)
              </label>
            </div>
          )}

          <div className="action-buttons">
            <button
              className="refresh-button"
              onClick={() => {
                if (selectedGroup) {
                  const groupIdStr = typeof selectedGroup._id === 'object' ? String(selectedGroup._id) : selectedGroup._id;
                  fetchGroupDetails(groupIdStr, selectedPeriod);
                } else {
                  window.location.reload();
                }
              }}
              title="Refresh Data"
            >
              🔄 Refresh
            </button>

            <div className="download-dropdown">
              <div className="format-selector">
                <label htmlFor="export-format">Export Format:</label>
                <select id="export-format" defaultValue="pdf">
                  <option value="pdf">PDF</option>
                  <option value="excel">Excel</option>
                  <option value="word">Word</option>
                </select>
              </div>

              <button
                className="download-button main-download"
                onClick={() => {
                  const format = document.getElementById("export-format").value;
                  downloadReport(format, "full");
                }}
              >
                📄 Download Full Report
              </button>

              <div className="download-options">
                <div className="section-exports">
                  <h4>Export Sections:</h4>
                  <button
                    className="download-option"
                    onClick={() => {
                      const format =
                        document.getElementById("export-format").value;
                      downloadReport(format, "overview");
                    }}
                  >
                    📊 Activity Overview
                  </button>
                  <button
                    className="download-option"
                    onClick={() => {
                      const format =
                        document.getElementById("export-format").value;
                      downloadReport(format, "tasks");
                    }}
                  >
                    ✅ Task Performance
                  </button>
                  <button
                    className="download-option"
                    onClick={() => {
                      const format =
                        document.getElementById("export-format").value;
                      downloadReport(format, "activity");
                    }}
                  >
                    ⚡ Recent Activity
                  </button>
                  <button
                    className="download-option"
                    onClick={() => {
                      const format =
                        document.getElementById("export-format").value;
                      downloadReport(format, "engagement");
                    }}
                  >
                    💬 Engagement Metrics
                  </button>
                  <button
                    className="download-option"
                    onClick={() => {
                      const format =
                        document.getElementById("export-format").value;
                      downloadReport(format, "messages");
                    }}
                  >
                    💭 Chat Messages
                  </button>
                  <button
                    className="download-option"
                    onClick={() => {
                      const format =
                        document.getElementById("export-format").value;
                      downloadReport(format, "videos");
                    }}
                  >
                    🎥 Video Sessions
                  </button>
                  <button
                    className="download-option"
                    onClick={() => {
                      const format =
                        document.getElementById("export-format").value;
                      downloadReport(format, "members");
                    }}
                  >
                    👥 Group Members
                  </button>
                  {!selectedGroup && groupData.length > 0 && (
                    <button
                      className="download-option"
                      onClick={() => {
                        const format =
                          document.getElementById("export-format").value;
                        downloadReport(format, "groups");
                      }}
                    >
                      🏫 My Groups Overview
                    </button>
                  )}
                </div>

                <div className="quick-exports">
                  <h4>Quick Export All Formats:</h4>
                  <button
                    className="download-option multi-format"
                    onClick={() => {
                      downloadReport("pdf", "full");
                      setTimeout(() => downloadReport("excel", "full"), 1000);
                      setTimeout(() => downloadReport("word", "full"), 2000);
                    }}
                  >
                    📦 Export All Formats
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {selectedGroup && (
          <div className="last-updated">
            Last updated:{" "}
            {formatDate(lastUpdated, "MMM dd, yyyy 'at' HH:mm:ss")}
          </div>
        )}
      </div>

      <div id="report-content" className="report-content">
        {/* Project Overview - Only show when no group is selected */}
        {!selectedGroup && (
          <section className="report-section overview-section">
            <h2>📊 VStudy Project Overview</h2>
            <div className="metrics-grid">
              <div className="metric-card">
                <h3>Total Groups</h3>
                <div className="metric-value">
                  {loading
                    ? "..."
                    : analytics.totalGroups ?? groupData.length ?? 0}
                </div>
              </div>
              <div className="metric-card">
                <h3>Active Groups</h3>
                <div className="metric-value">
                  {loading ? "..." : analytics.activeGroups ?? 0}
                </div>
              </div>
              <div className="metric-card">
                <h3>Growth Rate</h3>
                <div className="metric-value">
                  {loading ? "..." : `${analytics.groupGrowth ?? 0}%`}
                </div>
              </div>
              <div className="metric-card">
                <h3>Your Role</h3>
                <div className="metric-value">
                  {loading
                    ? "..."
                    : userData?.User_role || userData?.role || "User"}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* User Activity Summary - Only show when no group is selected */}
        {userData && !selectedGroup && (
          <section className="report-section">
            <h2>👤 User Activity Summary</h2>
            <div className="user-summary">
              <p>
                <strong>Name:</strong>{" "}
                {userData.User_name || userData.name || "Not available"}
              </p>
              <p>
                <strong>Email:</strong>{" "}
                {userData.User_email || userData.email || "Not available"}
              </p>
              <p>
                <strong>Member Since:</strong>{" "}
                {formatDate(
                  userData.createdAt || userData.User_createdAt,
                  "MMM dd, yyyy"
                ) || "Not available"}
              </p>
              <p>
                <strong>Groups Joined:</strong> {groupData?.length || 0}
              </p>
            </div>
          </section>
        )}

        {/* Groups Overview - Only show when no group is selected */}
        {groupData.length > 0 && !selectedGroup && (
          <section className="report-section">
            <div className="section-header">
              <h2>🏫 Study Groups Overview</h2>
            </div>
            <p className="section-description">
              Click on a group to view detailed analytics and access advanced
              report generation
            </p>
            <div className="groups-grid">
              {groupData.map((group) => (
                <div
                  key={group._id}
                  className="group-card clickable"
                  onClick={() => handleGroupClick(group._id)}
                >
                  <h4>{group.Group_name}</h4>
                  <p>{group.Group_description || "No description available"}</p>
                  <div className="group-stats">
                    <span>👥 {group.Group_memberCount || 0} members</span>
                    <span>
                      📅 Created: {formatDate(group.Group_createdAt, "MMM dd")}
                    </span>
                  </div>
                  <div className="group-actions">
                    <span className="action-hint">
                      Click to view analytics & generate advanced reports
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Selected Group Analytics */}
        {selectedGroup && (
          <>
            <section className="report-section selected-group-header">
              <div className="group-header-content">
                <div className="group-info">
                  <h2>🎯 Group Analytics: {selectedGroup.Group_name}</h2>
                  <p>
                    <strong>Description:</strong>{" "}
                    {selectedGroup.Group_description ||
                      "No description available"}
                  </p>
                  <p>
                    <strong>Created:</strong>{" "}
                    {formatDate(selectedGroup.Group_createdAt, "MMM dd, yyyy")}
                  </p>
                </div>
                <button
                  className="back-to-overview-button"
                  onClick={handleClearSelection}
                  title="Back to Groups Overview"
                >
                  ← Back to Overview
                </button>
              </div>
            </section>

            {/* Task Performance */}
            {taskData.length > 0 &&
              (() => {
                const taskMetrics = calculateTaskMetrics();
                return (
                  <section className="report-section">
                    <div className="section-header">
                      <h2>✅ Task Performance (Last {selectedPeriod})</h2>
                      <button
                        className="section-download-btn"
                        onClick={() => downloadSection("tasks")}
                        title="Download Task Performance Report"
                      >
                        Download
                      </button>
                    </div>
                    <div className="metrics-grid">
                      <div className="metric-card">
                        <h4>Total Tasks</h4>
                        <div className="metric-value">{taskMetrics.total}</div>
                      </div>
                      <div className="metric-card success">
                        <h4>Completed</h4>
                        <div className="metric-value">
                          {taskMetrics.completed}
                        </div>
                      </div>
                      <div className="metric-card warning">
                        <h4>In Progress</h4>
                        <div className="metric-value">
                          {taskMetrics.inProgress}
                        </div>
                      </div>
                      <div className="metric-card info">
                        <h4>Pending</h4>
                        <div className="metric-value">
                          {taskMetrics.pending}
                        </div>
                      </div>
                      <div className="metric-card danger">
                        <h4>Overdue</h4>
                        <div className="metric-value">
                          {taskMetrics.overdue}
                        </div>
                      </div>
                      <div className="metric-card primary">
                        <h4>Avg Progress</h4>
                        <div className="metric-value">
                          {taskMetrics.avgProgress}%
                        </div>
                      </div>
                    </div>

                    {/* Progress Distribution */}
                    <div className="progress-distribution">
                      <h4>Progress Distribution</h4>
                      <div className="progress-bars">
                        <div className="progress-category">
                          <span>High Progress (75-100%)</span>
                          <div className="progress-bar">
                            <div
                              className="progress-fill high"
                              style={{
                                width: `${
                                  (taskMetrics.highProgress /
                                    taskMetrics.total) *
                                  100
                                }%`,
                              }}
                            ></div>
                          </div>
                          <span>{taskMetrics.highProgress} tasks</span>
                        </div>
                        <div className="progress-category">
                          <span>Medium Progress (25-74%)</span>
                          <div className="progress-bar">
                            <div
                              className="progress-fill medium"
                              style={{
                                width: `${
                                  (taskMetrics.mediumProgress /
                                    taskMetrics.total) *
                                  100
                                }%`,
                              }}
                            ></div>
                          </div>
                          <span>{taskMetrics.mediumProgress} tasks</span>
                        </div>
                        <div className="progress-category">
                          <span>Low Progress (0-24%)</span>
                          <div className="progress-bar">
                            <div
                              className="progress-fill low"
                              style={{
                                width: `${
                                  (taskMetrics.lowProgress /
                                    taskMetrics.total) *
                                  100
                                }%`,
                              }}
                            ></div>
                          </div>
                          <span>{taskMetrics.lowProgress} tasks</span>
                        </div>
                      </div>
                    </div>
                    <div className="completion-rate">
                      <h4>Completion Rate: {taskMetrics.completionRate}%</h4>
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ width: `${taskMetrics.completionRate}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="task-list">
                      <h4>Recent Tasks:</h4>
                      {taskData.slice(0, 8).map((task) => (
                        <div
                          key={task._id}
                          className={`task-item ${task.Task_status}`}
                        >
                          <div className="task-header">
                            <h5>{task.Task_name}</h5>
                            <span className="task-progress-badge">
                              {task.Task_progress || 0}%
                            </span>
                          </div>
                          {task.Task_description && (
                            <p className="task-description">
                              {task.Task_description}
                            </p>
                          )}
                          <div className="task-progress-bar">
                            <div
                              className="task-progress-fill"
                              style={{ width: `${task.Task_progress || 0}%` }}
                            ></div>
                          </div>
                          <div className="task-meta">
                            <span className="task-due">
                              📅 Due:{" "}
                              {formatDate(task.Task_dueDate, "MMM dd") ||
                                "No due date"}
                            </span>
                            <span
                              className={`task-priority priority-${task.Task_priority}`}
                            >
                              🔥 {task.Task_priority || "medium"}
                            </span>
                            <span
                              className={`task-status status-${task.Task_status}`}
                            >
                              ⚡ {task.Task_status || "pending"}
                            </span>
                            {task.Task_assignedTo &&
                              task.Task_assignedTo.length > 0 && (
                                <span className="task-assigned">
                                  👤 {task.Task_assignedTo.length} assigned
                                </span>
                              )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })()}

            {/* Chat Messages */}
            {chatData.length > 0 &&
              (() => {
                const chatMetrics = calculateChatMetrics();
                const { filteredChatData } = getFilteredData();

                return (
                  <section className="report-section">
                    <div className="section-header">
                      <h2>💭 Chat Messages (Last {selectedPeriod})</h2>
                      <button
                        className="section-download-btn"
                        onClick={() => downloadSection("messages")}
                        title="Download Chat Messages Report"
                      >
                        Download
                      </button>
                    </div>

                    <div className="metrics-grid">
                      <div className="metric-card">
                        <h4>Total Messages</h4>
                        <div className="metric-value">
                          {chatMetrics.totalMessages}
                        </div>
                      </div>
                      <div className="metric-card info">
                        <h4>Text Messages</h4>
                        <div className="metric-value">
                          {chatMetrics.textMessages}
                        </div>
                      </div>
                      <div className="metric-card warning">
                        <h4>File Messages</h4>
                        <div className="metric-value">
                          {chatMetrics.fileMessages}
                        </div>
                      </div>
                      <div className="metric-card success">
                        <h4>Active Users</h4>
                        <div className="metric-value">
                          {chatMetrics.uniqueSenders}
                        </div>
                      </div>
                      <div className="metric-card primary">
                        <h4>Avg/Day</h4>
                        <div className="metric-value">
                          {chatMetrics.avgMessagesPerDay}
                        </div>
                      </div>
                      <div className="metric-card danger">
                        <h4>Most Active</h4>
                        <div className="metric-value">
                          {chatMetrics.mostActiveHour}
                        </div>
                      </div>
                    </div>

                    {/* Message Type Distribution */}
                    <div className="progress-distribution">
                      <h4>Message Type Distribution</h4>
                      <div className="progress-bars">
                        <div className="progress-category">
                          <span>
                            Text Messages (
                            {Math.round(
                              (chatMetrics.textMessages /
                                chatMetrics.totalMessages) *
                                100
                            )}
                            %)
                          </span>
                          <div className="progress-bar">
                            <div
                              className="progress-fill high"
                              style={{
                                width: `${
                                  (chatMetrics.textMessages /
                                    chatMetrics.totalMessages) *
                                  100
                                }%`,
                              }}
                            ></div>
                          </div>
                          <span>{chatMetrics.textMessages} messages</span>
                        </div>
                        <div className="progress-category">
                          <span>
                            File Messages (
                            {Math.round(
                              (chatMetrics.fileMessages /
                                chatMetrics.totalMessages) *
                                100
                            )}
                            %)
                          </span>
                          <div className="progress-bar">
                            <div
                              className="progress-fill medium"
                              style={{
                                width: `${
                                  (chatMetrics.fileMessages /
                                    chatMetrics.totalMessages) *
                                  100
                                }%`,
                              }}
                            ></div>
                          </div>
                          <span>{chatMetrics.fileMessages} files</span>
                        </div>
                        {chatMetrics.mixedMessages > 0 && (
                          <div className="progress-category">
                            <span>
                              Mixed Messages (
                              {Math.round(
                                (chatMetrics.mixedMessages /
                                  chatMetrics.totalMessages) *
                                  100
                              )}
                              %)
                            </span>
                            <div className="progress-bar">
                              <div
                                className="progress-fill low"
                                style={{
                                  width: `${
                                    (chatMetrics.mixedMessages /
                                      chatMetrics.totalMessages) *
                                    100
                                  }%`,
                                }}
                              ></div>
                            </div>
                            <span>{chatMetrics.mixedMessages} mixed</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="completion-rate">
                      <h4>Messages per User: {chatMetrics.messagesPerUser}</h4>
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${Math.min(
                              (chatMetrics.messagesPerUser / 50) * 100,
                              100
                            )}%`,
                          }}
                        ></div>
                      </div>
                    </div>

                    <div className="task-list">
                      <h4>Recent Messages:</h4>
                      {filteredChatData.slice(0, 10).map((message, index) => {
                        const isFileMessage =
                          message.Message_type === "file" ||
                          message.Message_type === "mixed" ||
                          message.Message_fileId;

                        let messageContent = sanitizeText(
                          message.Message_content || message.content || ""
                        );
                        let fileName = "";

                        if (isFileMessage) {
                          fileName = sanitizeFileName(
                            message.Message_fileId?.File_originalName ||
                              extractFileNameFromContent(messageContent) ||
                              "Unknown file"
                          );

                          if (
                            message.Message_type === "mixed" &&
                            messageContent
                          ) {
                            messageContent = `${messageContent}`;
                          } else if (!messageContent) {
                            messageContent = `Shared file: ${fileName}`;
                          }
                        }

                        return (
                          <div
                            key={message._id || index}
                            className={`task-item ${
                              isFileMessage ? "file-message" : "text-message"
                            }`}
                          >
                            <div className="task-header">
                              <h5>
                                {isFileMessage ? "📎" : "💬"}{" "}
                                {sanitizeText(
                                  message.Message_sender?.User_name ||
                                    "Unknown User"
                                )}
                              </h5>
                              <span className="task-progress-badge">
                                {formatDate(
                                  message.Message_timestamp ||
                                    message.createdAt ||
                                    message.Message_createdAt,
                                  "MMM dd, HH:mm"
                                )}
                              </span>
                            </div>

                            <p className="task-description">
                              {messageContent.substring(0, 150)}
                              {messageContent.length > 150 ? "..." : ""}
                            </p>

                            {isFileMessage && fileName && (
                              <div className="task-meta">
                                <span className="task-due">
                                  📁 File: {fileName}
                                </span>
                                {message.Message_fileId?.File_size && (
                                  <span className="task-priority">
                                    📊{" "}
                                    {formatFileSize(
                                      message.Message_fileId.File_size
                                    )}
                                  </span>
                                )}
                                <span
                                  className={`task-status ${
                                    isFileMessage
                                      ? "status-file"
                                      : "status-text"
                                  }`}
                                >
                                  {message.Message_type === "mixed"
                                    ? "📝 Text + File"
                                    : isFileMessage
                                    ? "📎 File"
                                    : "💬 Text"}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })()}

            {/* Engagement Metrics */}
            {(chatData.length > 0 || videoData.length > 0) &&
              (() => {
                const engagement = calculateEngagementMetrics();
                const activeMembers = getMostActiveMembers();

                return (
                  <section className="report-section">
                    <div className="section-header">
                      <h2>💬 Engagement Analytics (Last {selectedPeriod})</h2>
                      <button
                        className="section-download-btn"
                        onClick={() => downloadSection("engagement")}
                        title="Download Engagement Report"
                      >
                        Download
                      </button>
                    </div>
                    <div className="metrics-grid">
                      <div className="metric-card">
                        <h4>Messages Sent</h4>
                        <div className="metric-value">
                          {engagement.totalMessages}
                        </div>
                      </div>
                      <div className="metric-card">
                        <h4>Active Members</h4>
                        <div className="metric-value">
                          {engagement.uniqueSenders}
                        </div>
                      </div>
                      <div className="metric-card">
                        <h4>Video Sessions</h4>
                        <div className="metric-value">
                          {engagement.totalVideoSessions}
                        </div>
                      </div>
                      <div className="metric-card">
                        <h4>Avg Session Time</h4>
                        <div className="metric-value">
                          {engagement.avgVideoTime}min
                        </div>
                      </div>
                    </div>

                    {activeMembers.length > 0 && (
                      <div className="active-members">
                        <h4>Most Active Members:</h4>
                        {activeMembers.map((member, index) => (
                          <div key={index} className="member-activity">
                            <span>{member.name}</span>
                            <span>{member.messageCount} messages</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })()}

            {/* Group Members */}
            {members.length > 0 && (
              <section className="report-section">
                <div className="section-header">
                  <h2>👥 Group Members ({members.length})</h2>
                  <button
                    className="section-download-btn"
                    onClick={() => downloadSection("members")}
                    title="Download Members Report"
                  >
                    Download
                  </button>
                </div>
                <div className="members-grid">
                  {members.map((member) => (
                    <div
                      key={member._id || member.userId}
                      className="member-card"
                    >
                      <h5>{member.User_name || member.name}</h5>
                      <p>{member.User_email || member.email}</p>
                      <span
                        className={`member-role ${
                          member.isAdmin
                            ? "admin"
                            : member.isCreator
                            ? "creator"
                            : "member"
                        }`}
                      >
                        {member.isCreator
                          ? "Creator"
                          : member.isAdmin
                          ? "Admin"
                          : "Member"}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Recent Activity - Comprehensive */}
            {(chatData.length > 0 ||
              taskData.length > 0 ||
              videoData.length > 0) && (
              <section className="report-section">
                <div className="section-header">
                  <h2>⚡ Recent Group Activity (Last {selectedPeriod})</h2>
                  <button
                    className="section-download-btn"
                    onClick={() => downloadSection("activity")}
                    title="Download Activity Report"
                  >
                    Download
                  </button>
                </div>

                {/* Activity Summary */}
                {(() => {
                  const recentActivity = getRecentActivity();

                  // Count activities by type
                  const messageActivities = recentActivity.filter(
                    (a) => a.type === "message"
                  ).length;
                  const fileMessageActivities = recentActivity.filter(
                    (a) => a.type === "file_message"
                  ).length;
                  const taskActivities = recentActivity.filter((a) =>
                    a.type.includes("task")
                  ).length;
                  const videoActivities = recentActivity.filter((a) =>
                    a.type.includes("video")
                  ).length;

                  return (
                    <div className="activity-summary">
                      <div className="activity-stat">
                        <div className="activity-stat-number">
                          {messageActivities}
                        </div>
                        <div className="activity-stat-label">Messages</div>
                      </div>
                      <div className="activity-stat">
                        <div className="activity-stat-number">
                          {taskActivities}
                        </div>
                        <div className="activity-stat-label">
                          Task Activities
                        </div>
                      </div>
                      <div className="activity-stat">
                        <div className="activity-stat-number">
                          {videoActivities}
                        </div>
                        <div className="activity-stat-label">
                          Video Activities
                        </div>
                      </div>
                      <div className="activity-stat">
                        <div className="activity-stat-number">
                          {fileMessageActivities}
                        </div>
                        <div className="activity-stat-label">Files Shared</div>
                      </div>
                      <div className="activity-stat">
                        <div className="activity-stat-number">
                          {recentActivity.length}
                        </div>
                        <div className="activity-stat-label">
                          Total Activities
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="activity-timeline">
                  {getRecentActivity().map((activity) => (
                    <div
                      key={activity.id}
                      className={`activity-item activity-${activity.type}`}
                    >
                      <div className="activity-icon">{activity.icon}</div>
                      <div className="activity-content">
                        <div className="activity-header">
                          <div className="activity-main">
                            <strong className="activity-user">
                              {activity.user}
                            </strong>
                            <span className="activity-title">
                              {activity.title}
                            </span>
                          </div>
                          <span className="activity-time">
                            {formatDate(activity.timestamp, "MMM dd, HH:mm")}
                          </span>
                        </div>
                        <p className="activity-description">
                          {activity.content}
                        </p>
                        {activity.metadata &&
                          Object.keys(activity.metadata).length > 0 && (
                            <div className="activity-metadata">
                              {activity.type.includes("task") && (
                                <>
                                  {activity.metadata.status && (
                                    <span
                                      className={`status-badge status-${activity.metadata.status}`}
                                    >
                                      {activity.metadata.status}
                                    </span>
                                  )}
                                  {activity.metadata.priority && (
                                    <span
                                      className={`priority-badge priority-${activity.metadata.priority}`}
                                    >
                                      {activity.metadata.priority} priority
                                    </span>
                                  )}
                                  {activity.metadata.progress !== undefined && (
                                    <span className="progress-badge">
                                      {activity.metadata.progress}% complete
                                    </span>
                                  )}
                                  {activity.metadata.assignedTo &&
                                    activity.type === "task_updated" && (
                                      <span className="assigned-badge">
                                        👤 {activity.metadata.assignedTo}
                                      </span>
                                    )}
                                </>
                              )}
                              {activity.type.includes("video") && (
                                <>
                                  {activity.metadata.participants && (
                                    <span className="participants-badge">
                                      👥 {activity.metadata.participants}{" "}
                                      participants
                                    </span>
                                  )}
                                  {activity.metadata.duration && (
                                    <span className="duration-badge">
                                      ⏱️ {activity.metadata.duration}
                                    </span>
                                  )}
                                  {activity.metadata.participantNames && (
                                    <span className="participant-names-badge">
                                      👤 {activity.metadata.participantNames}
                                    </span>
                                  )}
                                </>
                              )}
                              {(activity.type.includes("file") ||
                                activity.type === "file_message") && (
                                <>
                                  {activity.metadata.fileType && (
                                    <span className="file-type-badge">
                                      {activity.metadata.fileType.toUpperCase()}
                                    </span>
                                  )}
                                  {activity.metadata.fileSize && (
                                    <span className="file-size-badge">
                                      💾{" "}
                                      {formatFileSize(
                                        activity.metadata.fileSize
                                      )}
                                    </span>
                                  )}
                                  {activity.metadata.extension && (
                                    <span className="file-type-badge">
                                      {activity.metadata.extension}
                                    </span>
                                  )}
                                  {activity.metadata.size && (
                                    <span className="file-size-badge">
                                      💾{" "}
                                      {formatFileSize(activity.metadata.size)}
                                    </span>
                                  )}
                                  {activity.metadata.description && (
                                    <span className="file-desc-badge">
                                      📄 {activity.metadata.description}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                      </div>
                    </div>
                  ))}
                  {getRecentActivity().length === 0 && (
                    <div className="no-activity">
                      <p>No recent activity in this time period.</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Video Sessions Summary */}
            {videoData.length > 0 && (
              <section className="report-section">
                <div className="section-header">
                  <h2>🎥 Video Sessions Summary (Last {selectedPeriod})</h2>
                  <button
                    className="section-download-btn"
                    onClick={() => downloadSection("videos")}
                    title="Download Video Sessions Report"
                  >
                    Download
                  </button>
                </div>
                <div className="video-sessions">
                  {videoData.map((session, index) => (
                    <div key={session._id} className="session-card">
                      <h4>Session {index + 1}</h4>
                      <div className="session-details">
                        <p>
                          <strong>Host:</strong> {session.host || "Unknown"}
                        </p>
                        <p>
                          <strong>Participants:</strong>{" "}
                          {session.participantCount || 0}
                        </p>

                        {/* Show participant names if available */}
                        {session.participants &&
                          session.participants.length > 0 && (
                            <div className="session-participants">
                              <strong>Attendees:</strong>
                              <div className="participant-list">
                                {session.participants.map(
                                  (participant, idx) => (
                                    <span
                                      key={idx}
                                      className="participant-chip"
                                    >
                                      👤 {participant.name}
                                      {participant.joinedAt && (
                                        <small className="join-time">
                                          (joined{" "}
                                          {formatDate(
                                            participant.joinedAt,
                                            "HH:mm"
                                          )}
                                          )
                                        </small>
                                      )}
                                    </span>
                                  )
                                )}
                              </div>
                            </div>
                          )}

                        <p>
                          <strong>Duration:</strong> {session.duration || "N/A"}
                        </p>
                        <p>
                          <strong>Started:</strong>{" "}
                          {formatDate(
                            session.VideoSession_startTime,
                            "MMM dd, HH:mm"
                          )}
                        </p>
                        {session.VideoSession_endTime && (
                          <p>
                            <strong>Ended:</strong>{" "}
                            {formatDate(
                              session.VideoSession_endTime,
                              "MMM dd, HH:mm"
                            )}
                          </p>
                        )}
                        <p>
                          <strong>Status:</strong>{" "}
                          <span
                            className={`status-badge ${
                              session.VideoSession_endTime ? "ended" : "ongoing"
                            }`}
                          >
                            {session.VideoSession_endTime ? "Ended" : "Ongoing"}
                          </span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* Project Insights */}
        <section className="report-section">
          <h2>🔍 Project Insights</h2>
          <div className="insights">
            <div className="insight-card">
              <h4>📈 Platform Growth</h4>
              <p>
                Your VStudy platform has{" "}
                {analytics.totalGroups || groupData?.length || 0} study groups
                with {analytics.activeGroups || 0} currently active.
              </p>
            </div>
            <div className="insight-card">
              <h4>🎯 Engagement Level</h4>
              <p>
                {selectedGroup
                  ? `${selectedGroup.Group_name || "This group"} shows ${
                      (chatData?.length || 0) > 10
                        ? "high"
                        : (chatData?.length || 0) > 5
                        ? "moderate"
                        : "low"
                    } engagement with ${
                      chatData?.length || 0
                    } messages in the selected period.`
                  : "Select a group to see detailed engagement metrics."}
              </p>
            </div>
            <div className="insight-card">
              <h4>⚡ Activity Trends</h4>
              <p>
                {(videoData?.length || 0) > 0
                  ? `Video collaboration is active with ${
                      videoData?.length || 0
                    } sessions recorded.`
                  : "Consider encouraging more video collaboration sessions."}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ProjectReport;
