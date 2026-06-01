import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api";
import { ensureStringId } from "../../utils/objectId";
import { subscribeToGroupsUpdated } from "../../utils/groupEvents";
import "./TaskManager.css";

const TaskManager = () => {
  const { groupId: Task_groupId } = useParams();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("medium");
  const [assignedTo, setAssignedTo] = useState("");
  const [commentInputs, setCommentInputs] = useState({});
  const [editTaskId, setEditTaskId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isGroupAdmin, setIsGroupAdmin] = useState(false);
  const [adminStatusLoading, setAdminStatusLoading] = useState(true);
  const [activeGroup, setActiveGroup] = useState(ensureStringId(Task_groupId) || null);

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await api.get("/auth/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });
        // Normalize _id to a plain string so all comparisons work reliably
        const userData = res.data;
        if (userData && userData._id) {
          userData._id = userData._id.toString();
        }
        setUser(userData);
      } catch (err) {
        console.error("Error fetching user profile:", err);
      }
    };

    fetchUserProfile();
  }, []);

  // Task assignment functionality has been removed as per requirements

  const fetchGroups = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await api.get("/group/user-groups", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const fetchedGroups = res.data.groups || [];
      setGroups(fetchedGroups);

      const routeGroupId = Task_groupId ? ensureStringId(Task_groupId) : null;
      const routeGroupExists = routeGroupId
        ? fetchedGroups.some((g) => ensureStringId(g._id) === routeGroupId)
        : false;

      const initialGroupId = routeGroupExists
        ? routeGroupId
        : fetchedGroups.length > 0
        ? ensureStringId(fetchedGroups[0]._id)
        : null;

      if (initialGroupId) {
        setActiveGroup(initialGroupId);
        const activeGroupData = fetchedGroups.find(
          (g) => ensureStringId(g._id) === initialGroupId
        );
        if (activeGroupData) {
          setIsGroupAdmin(activeGroupData.userRole === "admin");
        }
      }
    } catch (err) {
      setError("Failed to fetch groups");
      console.error("Error fetching groups:", err);
    } finally {
      setAdminStatusLoading(false);
    }
  }, [Task_groupId]);

  // Fetch groups on mount
  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    const unsubscribe = subscribeToGroupsUpdated(() => {
      fetchGroups();
    });
    return unsubscribe;
  }, [fetchGroups]);

  // Fetch users for the active group
  useEffect(() => {
    const fetchUsers = async () => {
      if (!activeGroup) return;
      try {
        const token = localStorage.getItem("token");
        const res = await api.get(`/auth/group-users/${ensureStringId(activeGroup)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        // Ensure _id is always a plain string so <option value> renders correctly
        const normalizedUsers = (res.data.users || []).map((u) => ({
          ...u,
          _id: u._id ? u._id.toString() : u._id,
        }));
        setUsers(normalizedUsers);
      } catch (err) {
        console.error("Error fetching group users:", err);
      }
    };
    fetchUsers();
  }, [activeGroup]);

  // Function to fetch tasks for the active group
  const fetchTasks = useCallback(async () => {
    if (!activeGroup) {
      setTasks([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("No authentication token found");
      }

      // Fetch tasks for the active group
      const response = await api.get(`/task/group/${activeGroup}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      // Process the tasks data - handle both array and object with tasks property
      const tasksData = Array.isArray(response.data)
        ? response.data
        : response.data?.tasks;

      if (tasksData && Array.isArray(tasksData)) {
        const tasksWithProcessedData = tasksData.map((task, taskIndex) => {
          // Ensure _id is converted to string - handle various ObjectId formats
          let taskId;
          if (task._id) {
            if (typeof task._id === 'string') {
              taskId = task._id;
            } else if (typeof task._id === 'object') {
              // Try various ways to extract the string value from ObjectId
              taskId = task._id.toString?.() || 
                       task._id.$oid || 
                       task._id.id || 
                       task._id.str ||
                       JSON.stringify(task._id).replace(/[^a-f0-9]/gi, '').substring(0, 24);
            } else {
              taskId = String(task._id);
            }
          }
          
          // Fallback if we still don't have a valid ID
          if (!taskId || taskId === '[object Object]' || taskId.length !== 24) {
            console.error('Could not extract task ID from:', task);
            taskId = `task-fallback-${taskIndex}`;
          }
          
          // Process comments
          const processedComments = (task.Task_comments || []).map((comment, commentIdx) => {
            // Ensure comment _id is a string
            let commentId;
            if (comment._id) {
              if (typeof comment._id === 'string') {
                commentId = comment._id;
              } else if (typeof comment._id === 'object') {
                commentId = comment._id.toString?.() || 
                           comment._id.$oid || 
                           comment._id.id || 
                           String(comment._id);
              } else {
                commentId = String(comment._id);
              }
            }
            if (!commentId || commentId === '[object Object]') {
              commentId = `comment-${taskId}-${commentIdx}`;
            }
            
            // Ensure user _id is a string
            let userId;
            if (comment.Comment_user?._id) {
              const userIdRaw = comment.Comment_user._id;
              if (typeof userIdRaw === 'string') {
                userId = userIdRaw;
              } else if (typeof userIdRaw === 'object') {
                userId = userIdRaw.toString?.() || 
                        userIdRaw.$oid || 
                        userIdRaw.id || 
                        String(userIdRaw);
              } else {
                userId = String(userIdRaw);
              }
            }
            
            return {
            _id: commentId,
            Comment_text: comment.Comment_text,
            Comment_user: {
              User_name: comment.Comment_user?.User_name || "Unknown User",
              User_email: comment.Comment_user?.User_email || "",
              _id: userId,
            },
            Comment_createdAt: comment.Comment_date || comment.Comment_createdAt || new Date().toISOString(),
          };
          });

          // Process assigned users
          const assignedUsers = (task.Task_assignedTo || []).map((u, idx) => {
            let assignedUserId;
            if (typeof u === 'string') {
              assignedUserId = u;
            } else if (u && typeof u === 'object') {
              if (typeof u._id === 'string') {
                assignedUserId = u._id;
              } else if (u._id && typeof u._id === 'object') {
                assignedUserId = u._id.toString?.() || 
                                u._id.$oid || 
                                u._id.id || 
                                String(u._id);
              } else {
                assignedUserId = String(u._id || `user-${idx}`);
              }
            } else {
              assignedUserId = `user-${idx}`;
            }
            
            if (assignedUserId === '[object Object]') {
              assignedUserId = `user-${idx}`;
            }
            
            return {
              _id: assignedUserId,
              User_name: (typeof u === 'object' ? u.User_name : null) || "Unknown User",
              User_email: (typeof u === 'object' ? u.User_email : null) || "",
            };
          });

          // Return processed task
          return {
            _id: taskId,
            Task_name: (task.Task_name && task.Task_name.trim()) ? task.Task_name.trim() : "Untitled Task",
            Task_description: task.Task_description || "",
            Task_dueDate: task.Task_dueDate || null,
            Task_priority: ["low", "medium", "high"].includes(task.Task_priority?.toLowerCase())
              ? task.Task_priority.toLowerCase()
              : "medium",
            Task_status: ["pending", "in-progress", "completed"].includes(task.Task_status?.toLowerCase())
              ? task.Task_status.toLowerCase()
              : "pending",
            Task_progress: task.Task_progress || 0,
            Task_groupId: task.Task_groupId,
            Task_createdBy: task.Task_createdBy,
            Task_createdAt: task.Task_createdAt,
            Task_updatedAt: task.Task_updatedAt,
            Task_comments: processedComments,
            Task_assignedTo: assignedUsers,
          };
        });

        setTasks(tasksWithProcessedData);
      } else {
        console.warn("Unexpected response format:", response.data);
        setTasks([]);
      }

      // Check if the current user is an admin in this group
      // (admin status is already set from the groups list in the fetchGroups effect)
    } catch (err) {
      console.error("Error fetching tasks:", {
        error: err,
        response: err.response?.data,
        status: err.response?.status,
      });

      setError(
        err.response?.data?.message ||
          "Failed to fetch tasks. Please try again."
      );
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [activeGroup]);

  // Fetch tasks when activeGroup or fetchTasks changes
  useEffect(() => {
    if (user && activeGroup) {
      fetchTasks();
    }
  }, [activeGroup, user, fetchTasks]);

  const handleGroupChange = (e) => {
    const selectedId = ensureStringId(e.target.value);
    setActiveGroup(selectedId);
    setError("");

    // Update admin status immediately from the already-loaded groups data
    const selectedGroup = groups.find(
      (g) => ensureStringId(g._id) === selectedId
    );
    if (selectedGroup) {
      setIsGroupAdmin(selectedGroup.userRole === "admin");
      setAdminStatusLoading(false);
    }
  };

  // Handle task deletion
  const handleDelete = async (taskId) => {
    if (!taskId) {
      console.error("Cannot delete task: taskId is null or undefined");
      alert("Cannot delete task: task ID is missing");
      return;
    }
    
    if (taskId === "undefined" || taskId === "null") {
      console.error("Cannot delete task: taskId is string 'undefined' or 'null'");
      alert("Cannot delete task: invalid task ID");
      return;
    }

    if (!window.confirm("Are you sure you want to delete this task?")) {
      return;
    }

    try {
      
      // Optimistically remove the task from the UI
      setTasks((prevTasks) => prevTasks.filter((task) => task._id !== taskId));

      const token = localStorage.getItem("token");
      const res = await api.delete(`/task/${taskId}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status === 200 || res.data?.message?.includes("deleted successfully")) {
        // Show success message
        alert("Task deleted successfully!");
        setError("");
      } else {
        throw new Error(res.data?.message || "Failed to delete task");
      }
    } catch (err) {
      // Revert optimistic update on error
      await fetchTasks();

      const errorMessage =
        err.response?.data?.message || err.message || "Failed to delete task";
      setError(errorMessage);
      console.error("Error deleting task:", {
        error: err,
        response: err.response?.data,
      });

      // Show error alert
      alert(`Error: ${errorMessage}`);
    }
  };

  // Handle progress update
  const handleProgressUpdate = async (taskId, newProgress) => {
    try {
      // Optimistically update the UI
      setTasks((prevTasks) =>
        prevTasks.map((t) =>
          t._id === taskId
            ? {
                ...t,
                _id: t._id?.toString(),
                Task_progress: newProgress,
                Task_status:
                  newProgress === 100
                    ? "completed"
                    : newProgress > 0
                    ? "in-progress"
                    : "pending",
                Task_updatedAt: new Date().toISOString(),
              }
            : t
        )
      );

      const token = localStorage.getItem("token");
      const res = await api.put(
        `/task/${taskId}`,
        { Task_progress: newProgress },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      // Success - no need to refetch since we already updated optimistically
      if (res.status === 200) {
        return;
      }

      throw new Error(res.data?.message || "Failed to update task progress");
    } catch (err) {
      const errorMessage =
        err.response?.data?.message ||
        err.message ||
        "Failed to update task progress";
      setError(errorMessage);

      // Revert optimistic update on error by refetching tasks
      try {
        await fetchTasks();
      } catch (fetchError) {
        console.error("Error refetching tasks:", fetchError);
      }
    }
  };

  // Handle task completion toggle - only allow assigned user to toggle
  const handleToggleCompletion = async (task) => {
    // Check if current user is one of the assigned users (Task_assignedTo is an array)
    const currentUserId = user?._id?.toString();
    const isAssignedUser = Array.isArray(task.Task_assignedTo)
      ? task.Task_assignedTo.some(
          (assignedUser) =>
            (typeof assignedUser === "object"
              ? assignedUser._id
              : assignedUser
            ).toString() === currentUserId
        )
      : task.Task_assignedTo?._id?.toString() === currentUserId ||
        task.Task_assignedTo?.toString() === currentUserId;

    if (!isAssignedUser && !isGroupAdmin) {
      alert("Only assigned users or group admins can toggle this task.");
      return;
    }

    // Check if trying to mark as completed but progress is not 100%
    if (task.Task_status !== "completed" && (task.Task_progress || 0) < 100) {
      alert(
        "Task must be 100% complete before marking as completed. Please update the progress first."
      );
      return;
    }

    try {
      // Optimistically update the UI
      setTasks((prevTasks) =>
        prevTasks.map((t) =>
          t._id === task._id
            ? {
                ...t,
                _id: t._id?.toString(),
                Task_status:
                  t.Task_status === "completed" ? "pending" : "completed",
                Task_updatedAt: new Date().toISOString(),
              }
            : t
        )
      );

      const token = localStorage.getItem("token");
      const res = await api.put(
        `/task/toggle/${task._id}`,
        {},
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          validateStatus: (status) => status < 500,
        }
      );

      if (!res.data?.success) {
        // If API call fails, revert the optimistic update
        await fetchTasks();
        throw new Error(res.data?.message || "Failed to update task status");
      }

      // Show success message
      const newStatus =
        task.Task_status === "completed"
          ? "marked as pending"
          : "marked as completed";
      alert(`Task ${newStatus} successfully!`);
    } catch (err) {
      const errorMessage =
        err.response?.data?.message ||
        err.message ||
        "Failed to update task status";
      setError(errorMessage);
      console.error("Error toggling task status:", {
        error: err,
        response: err.response?.data,
      });
      alert(`Error: ${errorMessage}`);
    }
  };

  // Handle task form submission (create/update)
  const handleTaskSubmit = async (e) => {
    e.preventDefault();

    if (!title || !title.trim()) {
      setError("Task title is required and cannot be empty");
      alert("Task title is required and cannot be empty");
      return;
    }

    if (!activeGroup) {
      setError("Please select a group");
      alert("Please select a group");
      return;
    }

    if (!dueDate) {
      setError("Due date is required");
      alert("Due date is required");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("No authentication token found");
      }

      // Prepare task data according to backend schema
      const taskData = {
        Task_name: title.trim(),
        Task_description: description ? description.trim() : "",
        Task_dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        Task_priority: priority || "medium",
        Task_groupId: activeGroup,
        Task_status: "pending",
        Task_progress: 0,
      };

      // Handle task assignment - backend expects an array of ObjectId strings
      if (assignedTo) {
        taskData.Task_assignedTo = [ensureStringId(assignedTo)];
      }

      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };

      let response;
      if (editTaskId) {
        // Update existing task
        response = await api.put(`/task/${editTaskId}`, taskData, { headers });
      } else {
        // Create new task
        response = await api.post("/task", taskData, {
          headers,
          validateStatus: (status) => status < 500,
        });
      }

      if (response.data && (response.data.success || response.data.task)) {
        // Refresh the tasks list
        await fetchTasks();
        // Reset the form
        resetForm();
        setEditTaskId(null);
        setError("");

        // Show success message
        if (!editTaskId) {
          alert("Task created successfully!");
        } else {
          alert("Task updated successfully!");
        }
      } else {
        throw new Error(response.data?.message || "Failed to save task");
      }
    } catch (err) {
      console.error("Error saving task:", {
        error: err,
        response: err.response?.data,
        status: err.response?.status,
        config: err.config,
      });

      let errorMessage = "Failed to save task";
      const serverMessage =
        err.response?.data?.message || err.response?.data?.error;

      if (serverMessage) {
        errorMessage = serverMessage;

        // Add validation errors if they exist
        if (err.response?.data?.errors) {
          const errorDetails = Object.values(err.response.data.errors)
            .map((e) => e.message || e)
            .join("\n");
          errorMessage += `\n\n${errorDetails}`;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      alert(`Error: ${errorMessage}`);

      // If this is a 401 Unauthorized error, redirect to login
      if (err.response?.status === 401) {
        // Handle unauthorized error (e.g., redirect to login)
        console.error("Authentication required, redirecting to login...");
        // You might want to add your auth redirect logic here
      }
    }
  };

  const handleEdit = (task) => {
    if (!task) {
      console.error("Cannot edit task: task object is null or undefined");
      alert("Cannot edit task: task data is missing");
      return;
    }
    
    if (!task._id) {
      console.error("Cannot edit task: task._id is missing", task);
      alert("Cannot edit task: task ID is missing");
      return;
    }
    
    setTitle(task.Task_name || "");
    setDescription(task.Task_description || "");
    setDueDate(
      task.Task_dueDate
        ? new Date(task.Task_dueDate).toISOString().split("T")[0]
        : ""
    );
    setPriority(task.Task_priority || "medium");
    // Normalize the assigned user _id to a plain string so it matches <option value>
    const firstAssignedUser =
      Array.isArray(task.Task_assignedTo) && task.Task_assignedTo.length > 0
        ? (task.Task_assignedTo[0]._id || task.Task_assignedTo[0]).toString()
        : "";
    setAssignedTo(firstAssignedUser);
    setEditTaskId(task._id);
    
    // Scroll to form
    setTimeout(() => {
      const formElement = document.getElementById("task-form");
      if (formElement) {
        formElement.scrollIntoView({ behavior: "smooth", block: "start" });
        // Focus on title input
        const titleInput = document.getElementById("task-title");
        if (titleInput) {
          titleInput.focus();
        }
      }
    }, 100);
  };

  const handleAddComment = async (taskId) => {
    const commentText = commentInputs[taskId];
    if (!commentText?.trim()) return;

    try {
      const token = localStorage.getItem("token");
      const res = await api.post(
        `/task/comment/${taskId}`,
        { comment: commentText },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (res.data.success && res.data.comment) {
        // Update the tasks state with the new comment
        setTasks((prevTasks) =>
          prevTasks.map((task) =>
            task._id === taskId
              ? {
                  ...task,
                  Task_comments: [
                    ...(task.Task_comments || []),
                    {
                      _id: res.data.comment._id,
                      Comment_text: res.data.comment.Comment_text,
                      Comment_date: res.data.comment.Comment_date,
                      Comment_createdAt:
                        res.data.comment.Comment_createdAt ||
                        res.data.comment.Comment_date ||
                        new Date().toISOString(),
                      Comment_user: {
                        _id: res.data.comment.Comment_user?._id || user?._id,
                        User_name:
                          res.data.comment.Comment_user.User_name ||
                          user?.User_name ||
                          "You",
                        User_email:
                          res.data.comment.Comment_user.User_email ||
                          user?.User_email ||
                          "",
                      },
                    },
                  ],
                }
              : task
          )
        );

        // Clear the comment input
        setCommentInputs((prev) => ({ ...prev, [taskId]: "" }));
        setError("");
      } else {
        throw new Error(res.data.message || "Failed to add comment");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add comment");
      console.error("Error adding comment:", err);
    }
  };

  // Helper functions - moved before early return to avoid hoisting issues
  const resetForm = () => {
    setTitle("");
    setDescription("");
    setDueDate("");
    setPriority("medium");
    setAssignedTo("");
  };

  const handleCancelEdit = () => {
    resetForm();
    setEditTaskId(null);
  };

  // Format date for display (date only)
  const formatDate = (dateString) => {
    try {
      if (!dateString) return "No due date";
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "Invalid date";

      const options = {
        year: "numeric",
        month: "short",
        day: "numeric",
      };
      return date.toLocaleDateString(undefined, options);
    } catch (error) {
      console.error("Error formatting date:", error);
      return "Invalid date";
    }
  };

  // Format date and time for comments
  const formatCommentDate = (dateString) => {
    try {
      if (!dateString) return "";
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "";

      const options = {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      };
      return date.toLocaleString(undefined, options);
    } catch (error) {
      console.error("Error formatting comment date:", error);
      return "";
    }
  };

  // Get user name by ID
  const getUserName = (userId) => {
    if (!userId) return "Unassigned";
    const foundUser = users.find((u) => u._id === userId);
    return foundUser ? foundUser.User_name : "Unknown User";
  };

  // Format assigned user information
  const formatAssignedUser = (assignedUser) => {
    if (!assignedUser) return "Unassigned";
    if (typeof assignedUser === "string") return "Loading..."; // In case user data is still loading
    return assignedUser.User_name || "Unassigned";
  };

  // Get current group details
  const currentGroup = groups.find((group) => ensureStringId(group._id) === activeGroup);

  const openSmartPrioritization = () => {
    navigate(activeGroup ? `/dashboard/smart-prioritization/${activeGroup}` : "/dashboard/smart-prioritization");
  };

  if (!user) {
    return <p>Loading user data...</p>; // Show loader while user data is being fetched
  }

  const handleDeleteComment = async (taskId, commentId) => {
    if (!window.confirm("Are you sure you want to delete this comment?")) {
      return; // User cancelled the deletion
    }

    try {
      // Optimistically remove the comment from the UI
      setTasks((prevTasks) =>
        prevTasks.map((task) =>
          task._id === taskId
            ? {
                ...task,
                Task_comments: task.Task_comments.filter(
                  (comment) => comment._id !== commentId
                ),
              }
            : task
        )
      );

      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("Authentication required");
      }

      // Make the API call
      const res = await api.delete(`/task/comment/${taskId}/${commentId}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.data?.success) {
        // If API call fails, revert the optimistic update
        await fetchTasks();
        throw new Error(res.data?.message || "Failed to delete comment");
      }

      // Show success message
      alert("Comment deleted successfully!");
      setError("");
    } catch (err) {
      // Revert optimistic update on error by refetching tasks
      await fetchTasks();

      const errorMessage =
        err.response?.data?.message ||
        err.message ||
        "Failed to delete comment";
      setError(errorMessage);
      console.error("Error deleting comment:", {
        error: err,
        response: err.response?.data,
        taskId,
        commentId,
        errorMessage,
      });

      // Show error message
      alert(`Error: ${errorMessage}`);
    }
  };

  return (
    <div className="task-manager">
      <div className="task-manager-header">
        <h1>Task Manager</h1>

        <div className="group-selector">
          <select
            id="group-select"
            value={activeGroup || ""}
            onChange={handleGroupChange}
            disabled={loading}
            className="group-select-dropdown"
          >
            <option value="">-- Select a group --</option>
            {groups.map((group) => (
              <option key={group._id} value={group._id}>
                {group.Group_name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="smart-priority-link"
          onClick={openSmartPrioritization}
          disabled={!activeGroup}
        >
          <i className="fas fa-brain"></i>
          Smart Prioritization
        </button>

        {currentGroup && (
          <div className="group-info">
            <div className="group-name">
              <i className="fas fa-users"></i>
              <span>{currentGroup.Group_name}</span>
            </div>
            <div className="group-meta">
              <span className="task-count">
                <i className="fas fa-tasks"></i>
                {tasks.length} tasks
              </span>
            </div>
          </div>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading || adminStatusLoading ? (
        <p>Loading...</p>
      ) : activeGroup ? (
        <>
          {/* Task Form - Only visible for admins */}
          {isGroupAdmin === true && (
            <div className="task-form-container">
              <form
                onSubmit={handleTaskSubmit}
                className="task-form"
                id="task-form"
              >
                <h2>{editTaskId ? "Edit Task" : "Add New Task"}</h2>

                <div className="form-group">
                  <label htmlFor="task-title">Title *</label>
                  <input
                    id="task-title"
                    type="text"
                    placeholder="Enter task title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="task-description">Description</label>
                  <textarea
                    id="task-description"
                    placeholder="Enter task description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows="3"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="task-due-date">Due Date *</label>
                    <input
                      id="task-due-date"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="task-priority">Priority *</label>
                    <select
                      id="task-priority"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      required
                    >
                      <option value="low">Low Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="high">High Priority</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="task-assignee">Assign To</label>
                  <select
                    id="task-assignee"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className="form-control"
                  >
                    <option value="">Select a user...</option>
                    {users.map((member) => (
                      <option key={member._id} value={member._id}>
                        {member.User_name} ({member.User_email})
                      </option>
                    ))}
                  </select>
                </div>



                <div className="form-actions">
                  <button type="submit" className="btn-primary">
                    {editTaskId ? "Update Task" : "Add Task"}
                  </button>
                  {editTaskId && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* Message for non-admins */}
          {isGroupAdmin === false && (
            <div className="admin-only-message">
              <p>
                <i className="fas fa-info-circle"></i> Only group admins can
                create and manage tasks.
              </p>
            </div>
          )}

          <div className="task-list-container">
            <h2>Tasks</h2>

            {loading ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Loading tasks...</p>
              </div>
            ) : tasks.length === 0 ? (
              <div className="empty-state">
                <p>No tasks found. Create one to get started!</p>
              </div>
            ) : (
              <div className="task-list">
                {tasks.map((task, taskIndex) => {
                  return (
                  <div
                    key={task._id || `task-${taskIndex}`}
                    className={`task-item ${
                      task.Task_status === "completed" ? "completed" : ""
                    } priority-${
                      task.Task_priority?.toLowerCase() || "medium"
                    }`}
                  >
                    <div className="task-header">
                      <label className="checkbox-container">
                        <input
                          type="checkbox"
                          checked={task.Task_status === "completed"}
                          onChange={() => handleToggleCompletion(task)}
                          disabled={
                            (!isGroupAdmin &&
                              !(
                                Array.isArray(task.Task_assignedTo) &&
                                task.Task_assignedTo.some(
                                  (assignedUser) =>
                                    (typeof assignedUser === "object"
                                      ? assignedUser._id
                                      : assignedUser
                                    ).toString() === user?._id?.toString()
                                )
                              )) ||
                            (task.Task_status !== "completed" &&
                              (task.Task_progress || 0) < 100)
                          }
                          aria-label={
                            task.Task_status === "completed"
                              ? "Mark as incomplete"
                              : "Mark as complete"
                          }
                          title={
                            !isGroupAdmin &&
                            !(
                              Array.isArray(task.Task_assignedTo) &&
                              task.Task_assignedTo.some(
                                (assignedUser) =>
                                  (typeof assignedUser === "object"
                                    ? assignedUser._id
                                    : assignedUser
                                  ).toString() === user?._id?.toString()
                              )
                            )
                              ? "Only assigned members or group admins can toggle completion"
                              : task.Task_status !== "completed" &&
                                (task.Task_progress || 0) < 100
                              ? "Task must be 100% complete before marking as completed"
                              : ""
                          }
                        />
                        <span className="checkmark"></span>
                      </label>
                      <div className="task-content">
                        <div className="task-main">
                          <div className="task-header-row">
                            <h3 className="task-title">
                              {task.Task_name || "Untitled Task"}
                            </h3>
                          </div>

                          {task.Task_description && (
                            <div className="task-description">
                              <p>{task.Task_description}</p>
                            </div>
                          )}
                        </div>

                        <div className="task-meta">
                          <div className="meta-item due-date">
                            <i className="fas fa-calendar"></i>
                            <span>Due: {formatDate(task.Task_dueDate)}</span>
                          </div>
                          <div className="meta-item priority">
                            <i className="fas fa-flag"></i>
                            <span>Priority: {task.Task_priority ? task.Task_priority.charAt(0).toUpperCase() + task.Task_priority.slice(1) : "Medium"}</span>
                          </div>
                          <div className="meta-item status">
                            <i className="fas fa-info-circle"></i>
                            <span>Status: {task.Task_status ? task.Task_status.charAt(0).toUpperCase() + task.Task_status.slice(1) : "Pending"}</span>
                          </div>
                          <div className="meta-item progress">
                            <i className="fas fa-chart-line"></i>
                            <span>Progress: {task.Task_progress || 0}%</span>
                            <div className="task-progress-bar">
                              <div
                                className="task-progress-fill"
                                style={{ width: `${task.Task_progress || 0}%` }}
                              ></div>
                            </div>
                          </div>
                          <div className="meta-item assigned-to">
                            <i className="fas fa-user"></i>
                            <div className="assigned-user-info">
                              <div>
                                <strong>Assigned to: </strong>
                                {Array.isArray(task.Task_assignedTo) &&
                                task.Task_assignedTo.length > 0 ? (
                                  <div className="assigned-users-list">
                                    {task.Task_assignedTo.map(
                                      (assignedUser, index) => {
                                        // Extract a unique key for each assigned user
                                        let userKey;
                                        if (typeof assignedUser === 'object' && assignedUser !== null) {
                                          if (assignedUser._id) {
                                            userKey = String(assignedUser._id);
                                          } else {
                                            userKey = `assigned-user-${task._id}-${index}`;
                                          }
                                        } else if (typeof assignedUser === 'string') {
                                          userKey = assignedUser;
                                        } else {
                                          userKey = `assigned-user-${task._id}-${index}`;
                                        }
                                        
                                        return (
                                        <div
                                          key={userKey}
                                          className="assigned-user"
                                        >
                                          <span className="assigned-user-name">
                                            {formatAssignedUser(assignedUser)}
                                          </span>
                                          {assignedUser && typeof assignedUser === 'object' && assignedUser.User_email && (
                                            <div className="assigned-email">
                                              {assignedUser.User_email}
                                            </div>
                                          )}
                                        </div>
                                        );
                                      }
                                    )}
                                  </div>
                                ) : (
                                  <span className="unassigned">
                                    {getUserName(null)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Comments Section */}
                    <div className="task-comments">
                      <h4>Comments</h4>
                      <div className="comment-list">
                        {task.Task_comments?.length > 0 ? (
                          task.Task_comments.map((comment, commentIndex) => (
                            <div key={comment._id ? comment._id.toString() : `comment-${task._id}-${commentIndex}`} className="comment-item">
                              <div className="comment-header">
                                <span className="comment-author">
                                  {comment.Comment_user?.User_name ||
                                    "Unknown User"}
                                </span>
                                <span className="comment-date">
                                  {formatCommentDate(comment.Comment_createdAt)}
                                </span>
                                {(isGroupAdmin ||
                                  comment.Comment_user?._id === user?._id) && (
                                  <button
                                    className="btn-delete-comment"
                                    onClick={() =>
                                      handleDeleteComment(task._id, comment._id)
                                    }
                                    title="Delete comment"
                                  >
                                    <i className="icon-trash"></i>
                                  </button>
                                )}
                              </div>
                              <div className="comment-content">
                                <p>{comment.Comment_text}</p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="no-comments">No comments yet</p>
                        )}
                      </div>

                      {/* Add Comment */}
                      <div className="add-comment">
                        <textarea
                          placeholder="Add a comment..."
                          value={commentInputs[task._id] || ""}
                          onChange={(e) =>
                            setCommentInputs((prev) => ({
                              ...prev,
                              [task._id]: e.target.value,
                            }))
                          }
                          rows="2"
                        />
                        <button
                          className="btn-add-comment"
                          onClick={() => handleAddComment(task._id)}
                          disabled={!commentInputs[task._id]?.trim()}
                        >
                          Add Comment
                        </button>
                      </div>
                    </div>

                    {/* Progress Update Controls - Only for assigned users on created tasks */}
                    {Array.isArray(task.Task_assignedTo) &&
                      task.Task_assignedTo.some(
                        (assignedUser) =>
                          (typeof assignedUser === "object"
                            ? assignedUser._id
                            : assignedUser
                          ).toString() === user?._id?.toString()
                      ) &&
                      task._id && (
                        <div className="progress-update-section">
                          <label htmlFor={`progress-${task._id}`}>
                            Update Progress:
                          </label>
                          <div className="progress-controls">
                            <input
                              id={`progress-${task._id}`}
                              type="range"
                              min="0"
                              max="100"
                              step="5"
                              value={task.Task_progress || 0}
                              onChange={(e) =>
                                handleProgressUpdate(
                                  task._id,
                                  parseInt(e.target.value)
                                )
                              }
                              className="progress-update-slider"
                            />
                            <span className="progress-percentage">
                              {task.Task_progress || 0}%
                            </span>
                          </div>
                        </div>
                      )}

                    {/* Task Actions - Only visible for admins */}
                    {isGroupAdmin === true && (
                      <div className="task-actions">
                        {/* Edit Button - Only Admin */}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleEdit(task);
                          }}
                          className="btn-edit"
                          title="Edit Task"
                          type="button"
                        >
                          <i className="icon-edit"></i> Edit
                        </button>

                        {/* Delete Button - Only Admin */}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDelete(task._id);
                          }}
                          className="btn-delete"
                          title="Delete Task"
                          type="button"
                        >
                          <i className="icon-trash"></i> Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="no-group-selected">
          <p>Please select a group to view or create tasks</p>
        </div>
      )}
    </div>
  );
};

export default TaskManager;
