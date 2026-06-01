import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  FaPaperPlane,
  FaSmile,
  FaPaperclip,
  FaReply,
  FaTrash,
  FaUsers,
  FaEdit,
} from "react-icons/fa";
import { BsCheck2All } from "react-icons/bs";
import io from "socket.io-client";
import EmojiPicker from "emoji-picker-react";
import api from "../../api";
import { useNotification } from "../../contexts/NotificationContext";
import { useToast } from "../../contexts/ToastContext";
import { ensureStringId } from "../../utils/objectId";
import { subscribeToGroupsUpdated } from "../../utils/groupEvents";
import MessageFilters from "../../components/messaging/MessageFilters";
import MultiGroupMessaging from "../../components/messaging/MultiGroupMessaging";
import GroupReplyModal from "../../components/messaging/GroupReplyModal";
import "./Chat.css";
import "../../components/messaging/MessageActions.css";

const Chat = ({ groupId, onTyping, socket }) => {
  const [parsedUser, setParsedUser] = useState({});
  const [userName, setUserName] = useState("");
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const emojiButtonRef = useRef(null);
  const [typingStatus, setTypingStatus] = useState("");
  const [messageReaders, setMessageReaders] = useState([]);
  const [showReadersModal, setShowReadersModal] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const [filteredMessages, setFilteredMessages] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [messageTypeFilter, setMessageTypeFilter] = useState(null);
  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({
    x: 0,
    y: 0,
  });
  const [emojiPickerPosition, setEmojiPickerPosition] = useState({
    left: 16,
    bottom: 96,
  });

  // Multi-group messaging state
  const [showMultiGroupModal, setShowMultiGroupModal] = useState(false);
  const [userGroups, setUserGroups] = useState([]);
  const [showGroupReplyModal, setShowGroupReplyModal] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState(null);
  const [currentGroupInfo, setCurrentGroupInfo] = useState(null);
  const [groupUserNames, setGroupUserNames] = useState({});

  // Edit message state
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingContent, setEditingContent] = useState("");

  // Get notification context to update notification counts
  const { notifications, markAsRead } = useNotification();

  // Get toast context for notifications
  const { showSuccess, showWarning, showError } = useToast();

  const getCurrentUserSender = useCallback(() => ({
    _id: parsedUser._id,
    User_name: parsedUser.User_name || parsedUser.name || userName || "You",
  }), [parsedUser._id, parsedUser.User_name, parsedUser.name, userName]);

  const getSenderId = useCallback((message) => {
    const sender = message?.Message_sender || message?.sender;
    const senderId = typeof sender === "string" ? sender : sender?._id || sender;
    return ensureStringId(senderId);
  }, []);

  const getSenderName = useCallback((message, isMyMessage) => {
    if (isMyMessage) return "You";

    const sender = message?.Message_sender || message?.sender;
    const senderId = getSenderId(message);
    if (sender && typeof sender === "object") {
      return (
        sender.User_name ||
        sender.name ||
        message?.senderName ||
        message?.Message_senderName ||
        groupUserNames[senderId] ||
        sender.User_email ||
        sender.email ||
        "Unknown User"
      );
    }

    return (
      message?.senderName ||
      message?.Message_senderName ||
      groupUserNames[senderId] ||
      "Unknown User"
    );
  }, [getSenderId, groupUserNames]);

  const fetchGroupUserNames = useCallback(async () => {
    if (!groupId) return;

    try {
      const groupIdStr = ensureStringId(groupId);
      const response = await api.get(`/auth/group-users/${groupIdStr}`);
      const namesById = {};

      (response.data.users || []).forEach((user) => {
        const userId = ensureStringId(user._id || user.User_id);
        if (userId) {
          namesById[userId] =
            user.User_name || user.name || user.User_email || user.email;
        }
      });

      setGroupUserNames(namesById);
    } catch (error) {
      console.error("Error fetching group user names:", error);
      setGroupUserNames({});
    }
  }, [groupId]);

  // Fetch user's groups for multi-group messaging
  const fetchUserGroups = useCallback(async () => {
    try {
      const response = await api.get("/group/user-groups");
      const groupsData = response.data.groups?.map((group) => ({
        _id: group._id,
        Group_name: group.Group_name,
        Group_description: group.Group_description,
        memberCount: group.memberCount || 0,
      })) || [];
      setUserGroups(groupsData);
    } catch (error) {
      console.error("Error fetching user groups:", error);
      setUserGroups([]);
    }
  }, []);

  // Fetch current group info
  const fetchCurrentGroupInfo = useCallback(async () => {
    if (!groupId) return;

    try {
      // Ensure groupId is a string
      const groupIdStr = ensureStringId(groupId);
      const response = await api.get(`/group/${groupIdStr}`);
      setCurrentGroupInfo(response.data.group);
    } catch (error) {
      console.error("Error fetching group info:", error);
    }
  }, [groupId]);

  // Handle multi-group message sent
  const handleMultiGroupMessageSent = useCallback((message, successfulGroups, failedGroups) => {
    console.log("Multi-group message sent:", { message, successfulGroups, failedGroups });

    // Show success notification
    if (successfulGroups.length > 0) {
      showSuccess(message);
    }

    if (failedGroups.length > 0) {
      showWarning(`Failed to send to ${failedGroups.length} groups: ${failedGroups.join(', ')}`);
    }
  }, [showSuccess, showWarning]);

  // Fetch messages for the group - moved up to be available for other functions
  const fetchGroupMessages = useCallback(async () => {
    if (!groupId) return;

    try {
      setIsLoading(true);
      // Ensure groupId is a string
      const groupIdStr = ensureStringId(groupId);
      const response = await api.get(`/message/group/${groupIdStr}`);

      if (!response.data.messages || !Array.isArray(response.data.messages)) {
        console.error(
          "Invalid response format - messages not found or not an array:",
          response.data
        );
        setMessages([]);
        return;
      }

      // Transform messages to match frontend expected format with new message types and file handling
      const formattedMessages = response.data.messages.map((msg) => {
        const senderId = getSenderId(msg);
        const isCurrentUserSender =
          senderId && senderId === ensureStringId(parsedUser._id);
        const normalizedSender =
          msg.Message_sender && typeof msg.Message_sender === "object"
            ? msg.Message_sender
            : isCurrentUserSender
              ? getCurrentUserSender()
              : msg.Message_sender;

        return {
          ...msg,
          Message_sender: normalizedSender,
          sender: normalizedSender,
          content: msg.Message_content,
          createdAt: msg.Message_createdAt,
          messageType: msg.Message_type || "text",
          // File handling - use new File model structure
          fileId: msg.Message_fileId?._id,
          fileUrl: msg.Message_fileId?.File_url || msg.Message_fileUrl,
          fileType: msg.Message_fileId?.File_type || msg.Message_fileType,
          fileName:
            msg.Message_fileId?.File_originalName || msg.Message_fileName,
          fileSize: msg.Message_fileId?.File_size,
          fileSizeFormatted: msg.Message_fileId?.File_sizeFormatted,
          // Reply handling
          replyTo: msg.Message_replyTo,
          emojiReactions: msg.Message_emojiReactions || [],
          // Read receipt fields
          isReadByUser: msg.isReadByUser || false,
          readAt: msg.readAt || null,
          Message_readCount: msg.Message_readCount || 0,
        };
      });

      setMessages(formattedMessages);
    } catch (error) {
      console.error("Error fetching group messages:", error);
      console.error("Error details:", error.response?.data || error.message);
      // Show user-friendly error message
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, [groupId, parsedUser._id, getCurrentUserSender, getSenderId]); // Removed markMessagesAsRead from dependencies to prevent infinite loop

  // Handle group reply sent
  const handleGroupReplySent = useCallback((message, groupInfo) => {
    console.log("Group reply sent:", { message, groupInfo });

    showSuccess(`Reply sent to ${groupInfo.Group_name}`);

    // If the reply was sent to the current group, refresh messages
    if (groupInfo._id === groupId) {
      fetchGroupMessages();
    }
  }, [groupId, showSuccess, fetchGroupMessages]);

  // Open multi-group messaging modal
  const openMultiGroupModal = useCallback(() => {
    setShowMultiGroupModal(true);
  }, []);

  // Open group reply modal
  const openGroupReplyModal = useCallback((message) => {
    setReplyToMessage(message);
    setShowGroupReplyModal(true);
  }, []);

  // Load user information from localStorage
  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
    console.log("Debug - Loading user from localStorage:", storedUser);
    if (storedUser && (storedUser._id || storedUser.User_id)) {
      // Normalize the user object to have consistent _id field
      const normalizedUser = {
        ...storedUser,
        _id: storedUser._id || storedUser.User_id,
        name: storedUser.name || storedUser.User_name,
      };
      setParsedUser(normalizedUser);
      setUserName(normalizedUser.name);
    } else {
      console.warn("No valid user found in localStorage");
    }
  }, []);

  // Mark messages as read for the current user
  const markMessagesAsRead = useCallback(async () => {
    if (!groupId || !parsedUser._id) {
      console.log("Cannot mark messages as read - missing groupId or userId:", {
        groupId,
        userId: parsedUser._id,
      });
      return;
    }

    try {
      console.log("Attempting to mark messages as read for:", {
        groupId,
        userId: parsedUser._id,
      });

      // Get unread message IDs from current messages
      const unreadMessageIds = messages
        .filter(
          (msg) =>
            !msg.isReadByUser &&
            msg.Message_sender?._id !== parsedUser._id &&
            (typeof msg.Message_sender === "string"
              ? msg.Message_sender !== parsedUser._id
              : true)
        )
        .map((msg) => msg._id);

      if (unreadMessageIds.length === 0) {
        console.log("No unread messages to mark as read");
        return;
      }

      // Use socket to mark messages as read for real-time updates
      if (socketRef.current) {
        socketRef.current.emit("markMessagesRead", {
          messageIds: unreadMessageIds,
          groupId: groupId,
        });
      }

      // Also call the API endpoint as backup
      // Ensure groupId is a string
      const groupIdStr = ensureStringId(groupId);
      const response = await api.post(`/message/mark-read/${groupIdStr}`);
      console.log("Mark as read response:", response.data);

      // Update local state to mark messages as read
      setMessages((prevMessages) =>
        prevMessages.map((msg) => ({
          ...msg,
          isReadByUser:
            msg.Message_sender?._id === parsedUser._id ||
            (typeof msg.Message_sender === "string" &&
              msg.Message_sender === parsedUser._id) ||
            msg.isReadByUser ||
            unreadMessageIds.includes(msg._id),
          readAt: unreadMessageIds.includes(msg._id) ? new Date() : msg.readAt,
        }))
      );

      // Also mark related message notifications as read in the notification system
      if (response.data.modifiedCount > 0) {
        console.log("Marking related message notifications as read...");

        // Find message notifications for this group that are unread
        const messageNotifications = notifications.filter(
          (notif) =>
            notif.Notification_type === "message" &&
            notif.Notification_groupId?._id === groupId &&
            !notif.Notification_read
        );

        console.log(
          `Found ${messageNotifications.length} unread message notifications for this group`
        );

        // Mark each message notification as read
        for (const notification of messageNotifications) {
          try {
            await markAsRead(notification._id);
            console.log(`Marked notification ${notification._id} as read`);
          } catch (notifError) {
            console.error(
              `Error marking notification ${notification._id} as read:`,
              notifError
            );
          }
        }
      }
    } catch (error) {
      console.error("Error marking messages as read:", error);
    }
  }, [groupId, parsedUser._id, messages, notifications, markAsRead]);

  // Use the passed socket or create a new one
  useEffect(() => {
    if (socket) {
      socketRef.current = socket;
    } else {
      // Connect to chat namespace with authentication
      const token = localStorage.getItem("token");
      socketRef.current = io.connect("http://localhost:5001/chat", {
        auth: {
          token: token,
        },
        transports: ["websocket", "polling"],
        timeout: 20000,
      });
      return () => {
        socketRef.current.disconnect();
      };
    }

    // Join the group room when socket is ready and we have a groupId
    if (socketRef.current && groupId) {
      console.log("Joining group room:", groupId);
      socketRef.current.emit("joinGroup", groupId);
    }
  }, [socket, groupId]);

  // Handle incoming socket messages and read receipt events
  useEffect(() => {
    if (!socketRef.current) return;

    const handleNewMessage = (message) => {
      console.log("Received socket message:", message);
      console.log("Current groupId:", groupId);
      console.log("Message groupId:", message.Message_groupId);
      console.log("Is multi-group message:", message.isMultiGroup);

      if (ensureStringId(message.Message_groupId) === ensureStringId(groupId)) {
        // Check if message already exists to prevent duplicates
        setMessages((prevMessages) => {
          const messageExists = prevMessages.some(
            (msg) => msg._id === message._id
          );
          if (messageExists) {
            console.log(
              "Message already exists, skipping duplicate:",
              message._id
            );
            return prevMessages;
          }

          // Transform the message to match our frontend format with new message types
          const messageSender =
            message.Message_sender && typeof message.Message_sender === "object"
              ? message.Message_sender
              : {
                  _id: message.Message_sender || message.senderId,
                  User_name:
                    message.senderName ||
                    message.Message_senderName ||
                    message.sender?.User_name ||
                    message.sender?.name,
                };
          const formattedMessage = {
            ...message,
            Message_content: message.Message_content || message.content || "",
            Message_sender: messageSender,
            sender: messageSender,
            content: message.Message_content,
            createdAt: message.Message_createdAt,
            messageType: message.Message_type || message.messageType || "text",
            // Handle file information from new structure
            fileId: message.Message_fileId?._id || message.fileId,
            fileUrl: message.Message_fileId?.File_url || message.fileUrl,
            fileType: message.Message_fileId?.File_type || message.fileType,
            fileName:
              message.Message_fileId?.File_originalName || message.fileName,
            fileSize: message.Message_fileId?.File_size || message.fileSize,
            fileSizeFormatted: message.Message_fileId?.File_sizeFormatted,
            emojiReactions: message.Message_emojiReactions || [],
            isReadByUser: false, // New messages are unread by default
          };

          const hasSenderName =
            formattedMessage.Message_sender?.User_name ||
            formattedMessage.Message_sender?.name ||
            formattedMessage.senderName ||
            formattedMessage.Message_senderName;
          if (!hasSenderName) {
            setTimeout(() => {
              fetchGroupMessages();
            }, 300);
          }

          return [...prevMessages, formattedMessage];
        });

        // Mark the new message as read after a short delay (if user is viewing the chat)
        if (document.visibilityState === "visible") {
          setTimeout(() => {
            markMessagesAsRead();
          }, 500);
        }
      } else if (message.isMultiGroup) {
        console.log("Multi-group message received but not for current group");
        // If it's a multi-group message but not for the current group, 
        // we might want to show a notification or update other UI elements
      }
    };

    // Handle read receipt updates
    const handleMessageReadUpdate = (data) => {
      const { messageId, userId, userName, readAt } = data;
      console.log(`Message ${messageId} read by ${userName} (User ID: ${userId}) at ${readAt}`);

      // Update message read count in UI if needed
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg._id === messageId
            ? { 
                ...msg, 
                Message_readCount: (msg.Message_readCount || 0) + 1,
                lastReadAt: readAt,
                lastReadBy: userId
              }
            : msg
        )
      );
    };

    // Handle multiple messages read update
    const handleMessagesReadUpdate = (data) => {
      const { messageIds, userId, userName, readCount } = data;
      console.log(`${readCount} messages read by ${userName} (User ID: ${userId})`);

      // Update read counts for multiple messages
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          messageIds.includes(msg._id)
            ? { 
                ...msg, 
                Message_readCount: (msg.Message_readCount || 0) + 1,
                lastReadBy: userId
              }
            : msg
        )
      );
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          messageIds.includes(msg._id)
            ? { ...msg, Message_readCount: (msg.Message_readCount || 0) + 1 }
            : msg
        )
      );
    };

    // Handle confirmation that messages were marked as read
    const handleMessagesMarkedRead = (data) => {
      if (data.success) {
        console.log(`Successfully marked ${data.readCount} messages as read`);
      }
    };

    // Handle read status updates
    const handleReadStatusUpdate = (data) => {
      const { readStatus } = data;
      setMessages((prevMessages) =>
        prevMessages.map((msg) => ({
          ...msg,
          isReadByUser: !!readStatus[msg._id],
          readAt: readStatus[msg._id] || msg.readAt,
        }))
      );
    };

    // Handle message readers response
    const handleMessageReadersUpdate = (data) => {
      const { messageId, readers } = data;
      setMessageReaders(readers);
      setSelectedMessageId(messageId);
      setShowReadersModal(true);
    };

    // Handle message edit updates
    const handleMessageEdited = (data) => {
      const { messageId, newContent, editedBy } = data;
      console.log(`Message ${messageId} edited by ${editedBy}`);

      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg._id === messageId
            ? {
              ...msg,
              Message_content: newContent,
              Message_isEdited: true,
              Message_editedAt: new Date(),
            }
            : msg
        )
      );
    };

    // Handle socket errors
    const handleSocketError = (error) => {
      console.error("Socket error:", error);
    };

    // Register event listeners
    socketRef.current.on("receiveMessage", handleNewMessage);
    socketRef.current.on("messageReadUpdate", handleMessageReadUpdate);
    socketRef.current.on("messagesReadUpdate", handleMessagesReadUpdate);
    socketRef.current.on("messagesMarkedRead", handleMessagesMarkedRead);
    socketRef.current.on("readStatusUpdate", handleReadStatusUpdate);
    socketRef.current.on("messageReadersUpdate", handleMessageReadersUpdate);
    socketRef.current.on("messageEdited", handleMessageEdited);
    socketRef.current.on("error", handleSocketError);

    return () => {
      socketRef.current.off("receiveMessage", handleNewMessage);
      socketRef.current.off("messageReadUpdate", handleMessageReadUpdate);
      socketRef.current.off("messagesReadUpdate", handleMessagesReadUpdate);
      socketRef.current.off("messagesMarkedRead", handleMessagesMarkedRead);
      socketRef.current.off("readStatusUpdate", handleReadStatusUpdate);
      socketRef.current.off("messageReadersUpdate", handleMessageReadersUpdate);
      socketRef.current.off("messageEdited", handleMessageEdited);
      socketRef.current.off("error", handleSocketError);
    };
  }, [groupId, markMessagesAsRead, fetchGroupMessages]);

  // Handle typing status updates
  useEffect(() => {
    if (!socketRef.current) return;

    const handleTyping = (data) => {
      if (data.groupId === groupId) {
        setTypingStatus(`${data.user} is typing...`);
        setTimeout(() => {
          setTypingStatus("");
        }, 2000);
      }
    };

    socketRef.current.on("typing", handleTyping);
    return () => {
      socketRef.current.off("typing", handleTyping);
    };
  }, [groupId]);

  // Filter messages based on search term and message type
  useEffect(() => {
    let filtered = messages;

    // Apply search filter
    if (searchTerm.trim()) {
      filtered = filtered.filter(
        (message) =>
          message.Message_content?.toLowerCase().includes(
            searchTerm.toLowerCase()
          ) ||
          message.fileName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          message.Message_fileName?.toLowerCase().includes(
            searchTerm.toLowerCase()
          )
      );
    }

    // Apply message type filter
    if (messageTypeFilter) {
      filtered = filtered.filter(
        (message) =>
          message.messageType === messageTypeFilter ||
          message.Message_type === messageTypeFilter
      );
    }

    setFilteredMessages(filtered);
  }, [messages, searchTerm, messageTypeFilter]);

  // Handle search
  const handleSearch = useCallback((term) => {
    setSearchTerm(term);
  }, []);

  // Handle message type filter
  const handleFilterByType = useCallback((type) => {
    setMessageTypeFilter(type);
  }, []);

  // Handle message hover
  const handleMessageHover = useCallback((messageId, isHovering) => {
    setHoveredMessageId(isHovering ? messageId : null);
  }, []);

  // Handle message selection
  const handleSelectMessage = useCallback(
    (messageId) => {
      setSelectedMessageId(selectedMessageId === messageId ? null : messageId);
    },
    [selectedMessageId]
  );

  // Handle getting message readers
  const handleGetMessageReaders = useCallback((messageId) => {
    if (socketRef.current && messageId) {
      socketRef.current.emit("getMessageReaders", {
        messageId: messageId,
        limit: 20,
      });
    }
  }, []);

  // Handle reply to message
  const handleReplyToMessage = useCallback((message) => {
    setReplyingTo(message);
    // Don't modify the message input, just set the reply indicator
  }, []);

  // Delete message
  const handleDeleteMessage = useCallback(async (messageId) => {
    if (!window.confirm("Are you sure you want to delete this message?")) {
      return;
    }

    try {
      await api.delete(`/message/${messageId}`);
      setMessages((prevMessages) =>
        prevMessages.filter((msg) => msg._id !== messageId)
      );
    } catch (error) {
      console.error("Error deleting message:", error);
      alert("Failed to delete message. Please try again.");
    }
  }, []);

  // Edit message handlers
  const handleEditMessage = useCallback((message) => {
    setEditingMessageId(message._id);
    setEditingContent(message.Message_content || "");
  }, []);

  const handleSaveEdit = useCallback(async (messageId) => {
    if (!editingContent.trim()) {
      showError("Message content cannot be empty");
      return;
    }

    try {
      const response = await api.put(`/message/${messageId}`, {
        Message_content: editingContent.trim(),
      });

      // Check if the update was successful
      if (response.status !== 200) {
        throw new Error('Failed to update message');
      }

      // Update the message in local state
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg._id === messageId
            ? {
              ...msg,
              Message_content: editingContent.trim(),
              Message_isEdited: true,
              Message_editedAt: new Date(),
            }
            : msg
        )
      );

      // Emit socket event to notify other users
      if (socketRef.current) {
        socketRef.current.emit("messageEdited", {
          messageId,
          newContent: editingContent.trim(),
          groupId,
        });
      }

      setEditingMessageId(null);
      setEditingContent("");
      showSuccess("Message updated successfully");
    } catch (error) {
      console.error("Error editing message:", error);
      showError("Failed to update message. Please try again.");
    }
  }, [editingContent, groupId, showSuccess, showError]);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditingContent("");
  }, []);

  // Handle context menu
  const handleContextMenu = useCallback((e, messageId) => {
    e.preventDefault();
    setSelectedMessageId(messageId);
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  }, []);

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setShowContextMenu(false);
  }, []);

  // Handle context menu actions
  const handleContextMenuAction = useCallback(
    (action, messageId) => {
      const message = messages.find((msg) => msg._id === messageId);
      if (!message) return;

      switch (action) {
        case "reply":
          handleReplyToMessage(message);
          break;
        case "groupReply":
          openGroupReplyModal(message);
          break;
        case "edit":
          handleEditMessage(message);
          break;
        case "delete":
          handleDeleteMessage(messageId);
          break;
        case "copy":
          if (message.Message_content) {
            navigator.clipboard.writeText(message.Message_content);
          }
          break;
        case "forward":
          // TODO: Implement forward functionality
          console.log("Forward message:", messageId);
          break;
        case "info":
          handleGetMessageReaders(messageId);
          break;
        default:
          break;
      }
      closeContextMenu();
    },
    [
      messages,
      handleReplyToMessage,
      openGroupReplyModal,
      handleEditMessage,
      handleDeleteMessage,
      handleGetMessageReaders,
      closeContextMenu,
    ]
  );

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (showContextMenu) {
        closeContextMenu();
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [showContextMenu, closeContextMenu]);

  useEffect(() => {
    if (groupId) {
      fetchGroupUserNames();
      fetchGroupMessages();
      fetchCurrentGroupInfo();
    }
  }, [groupId, fetchCurrentGroupInfo, fetchGroupMessages, fetchGroupUserNames]);

  // Fetch user groups on component mount
  useEffect(() => {
    fetchUserGroups();
  }, [fetchUserGroups]);

  useEffect(() => {
    const unsubscribe = subscribeToGroupsUpdated(() => {
      fetchUserGroups();
    });
    return unsubscribe;
  }, [fetchUserGroups]);

  // Separate effect to mark messages as read after they're loaded
  useEffect(() => {
    if (messages.length > 0 && groupId && parsedUser._id) {
      const timer = setTimeout(() => {
        markMessagesAsRead();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [messages.length, groupId, parsedUser._id, markMessagesAsRead]); // Only depend on length, not the messages array itself

  // Handle visibility change to mark messages as read when user returns to chat
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && groupId && parsedUser._id) {
        // Mark messages as read when user returns to the chat
        setTimeout(() => {
          markMessagesAsRead();
        }, 500);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Also mark messages as read when the component mounts and is visible
    if (document.visibilityState === "visible" && groupId && parsedUser._id) {
      setTimeout(() => {
        markMessagesAsRead();
      }, 1500);
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [groupId, parsedUser._id, markMessagesAsRead]);

  // Scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Listen for multi-group message events (fallback mechanism)
  useEffect(() => {
    const handleMultiGroupMessage = (event) => {
      const { groupIds, results } = event.detail;
      if (groupIds.includes(groupId)) {
        console.log("Multi-group message detected for current group, refreshing...");
        console.log("Message send results:", results);
        fetchGroupMessages();
      }
    };

    window.addEventListener('multiGroupMessageSent', handleMultiGroupMessage);
    return () => {
      window.removeEventListener('multiGroupMessageSent', handleMultiGroupMessage);
    };
  }, [groupId, fetchGroupMessages]);

  const handleMessageChange = (e) => {
    setNewMessage(e.target.value);
    onTyping(groupId, userName);
  };

  // Emoji selection handler
  const handleShowEmojiPicker = () => {
    setShowEmojiPicker((prev) => !prev);
  };

  useEffect(() => {
    if (!showEmojiPicker) return;

    const updateEmojiPickerPosition = () => {
      const buttonRect = emojiButtonRef.current?.getBoundingClientRect();
      if (!buttonRect) return;

      const pickerWidth = Math.min(320, window.innerWidth - 32);
      const left = Math.min(
        Math.max(16, buttonRect.left),
        window.innerWidth - pickerWidth - 16
      );
      const bottom = Math.max(16, window.innerHeight - buttonRect.top + 10);

      setEmojiPickerPosition({ left, bottom });
    };

    updateEmojiPickerPosition();
    window.addEventListener("resize", updateEmojiPickerPosition);
    window.addEventListener("scroll", updateEmojiPickerPosition, true);

    return () => {
      window.removeEventListener("resize", updateEmojiPickerPosition);
      window.removeEventListener("scroll", updateEmojiPickerPosition, true);
    };
  }, [showEmojiPicker]);

  const handleEmojiClick = (emojiData) => {
    setNewMessage((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  const handleEmojiReaction = async (messageId, emoji) => {
    try {
      const message = messages.find((msg) => msg._id === messageId);
      if (!message) return;

      const existingReaction = message.Message_emojiReactions?.find(
        (r) => r.emoji === emoji
      );

      // Check if user already reacted to this emoji
      const userHasReacted = existingReaction?.users?.some(
        (user) => user._id === parsedUser._id || user === parsedUser._id
      );

      if (userHasReacted) {
        // Remove reaction
        await api.delete(`/message/${messageId}/reactions`, {
          data: { emoji },
        });
      } else {
        // Add or update reaction
        await api.post(`/message/${messageId}/reactions`, { emoji });
      }

      // Optimistically update the UI
      setMessages((prevMessages) =>
        prevMessages.map((msg) => {
          if (msg._id !== messageId) return msg;

          const updatedMsg = { ...msg };
          updatedMsg.Message_emojiReactions =
            updatedMsg.Message_emojiReactions || [];

          if (userHasReacted) {
            // Remove user's reaction
            updatedMsg.Message_emojiReactions =
              updatedMsg.Message_emojiReactions.map((reaction) => {
                if (reaction.emoji === emoji) {
                  const updatedReaction = { ...reaction };
                  updatedReaction.users = updatedReaction.users.filter(
                    (user) => (user._id || user) !== parsedUser._id
                  );
                  updatedReaction.count = Math.max(
                    0,
                    updatedReaction.count - 1
                  );
                  return updatedReaction;
                }
                return reaction;
              }).filter((reaction) => reaction.count > 0);
          } else {
            // Add user's reaction
            const reactionIndex = updatedMsg.Message_emojiReactions.findIndex(
              (r) => r.emoji === emoji
            );

            if (reactionIndex >= 0) {
              // Update existing reaction
              updatedMsg.Message_emojiReactions[reactionIndex] = {
                ...updatedMsg.Message_emojiReactions[reactionIndex],
                users: [
                  ...(updatedMsg.Message_emojiReactions[reactionIndex].users ||
                    []),
                  parsedUser._id,
                ],
                count:
                  (updatedMsg.Message_emojiReactions[reactionIndex].count ||
                    0) + 1,
              };
            } else {
              // Add new reaction
              updatedMsg.Message_emojiReactions.push({
                emoji,
                users: [parsedUser._id],
                count: 1,
              });
            }
          }

          return updatedMsg;
        })
      );

      // Still fetch fresh data to ensure consistency
      fetchGroupMessages();
    } catch (error) {
      console.error("Error updating reaction:", error);
      // Revert optimistic update on error
      fetchGroupMessages();
    }
  };

  // File selection handler
  const handleFileChange = (e) => setFile(e.target.files[0]);

  const handleChooseFile = () => fileInputRef.current?.click();

  // Cancel reply
  const cancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const sendMessage = async () => {
    if (!newMessage.trim() && !file) return;

    // Debug logging
    console.log("Debug - sendMessage called:", {
      parsedUser: parsedUser,
      groupId: groupId,
      newMessage: newMessage,
      file: file,
    });

    if (!parsedUser?._id || !groupId) {
      console.error("Error: Missing user ID or groupId", {
        parsedUser: parsedUser,
        groupId: groupId,
      });
      alert("Unable to send message. Please refresh the page and try again.");
      return;
    }

    try {
      let savedMessage;
      const timestamp = new Date().toISOString();

      // Handle file upload (with optional text content for mixed messages)
      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("groupId", groupId);
        formData.append("timestamp", timestamp);
        if (newMessage.trim()) {
          formData.append("content", newMessage.trim()); // Add text content for mixed messages
        }
        if (replyingTo) {
          formData.append("replyTo", replyingTo._id);
        }

        // Upload file to server
        const uploadResponse = await api.post("/message/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        savedMessage = uploadResponse.data;
      } else {
        // Send text message
        const messageData = {
          Message_groupId: groupId,
          Message_content: newMessage,
          Message_timestamp: timestamp,
          Message_replyTo: replyingTo?._id || null,
        };

        const response = await api.post("/message", messageData);
        savedMessage = response.data;
      }

      // Transform the saved message to match our frontend format with new message types
      const formattedMessage = {
        ...savedMessage,
        Message_content: savedMessage.Message_content || newMessage.trim(),
        Message_createdAt: savedMessage.Message_createdAt || new Date(),
        Message_sender:
          savedMessage.Message_sender && typeof savedMessage.Message_sender === "object"
            ? savedMessage.Message_sender
            : getCurrentUserSender(),
        sender:
          savedMessage.Message_sender && typeof savedMessage.Message_sender === "object"
            ? savedMessage.Message_sender
            : getCurrentUserSender(),
        content: savedMessage.Message_content || newMessage.trim(),
        createdAt: savedMessage.Message_createdAt || new Date(),
        messageType: savedMessage.Message_type || "text",
        // Handle file information from new File model structure
        fileId: savedMessage.Message_fileId?._id,
        fileUrl: savedMessage.Message_fileId?.File_url,
        fileType: savedMessage.Message_fileId?.File_type,
        fileName: savedMessage.Message_fileId?.File_originalName,
        fileSize: savedMessage.Message_fileId?.File_size,
        fileSizeFormatted: savedMessage.Message_fileId?.File_sizeFormatted,
        emojiReactions: savedMessage.Message_emojiReactions || [],
      };

      // Emit message to other clients via socket
      const socketData = {
        ...formattedMessage,
        groupId,
        Message_groupId: groupId, // Use Message_groupId to match handleNewMessage expectation
        Message_type: savedMessage.Message_type,
        Message_fileId: savedMessage.Message_fileId,
        isReply: !!replyingTo,
        replyToId: replyingTo?._id || null,
      };

      console.log("Emitting sendMessage via socket:", socketData);
      socketRef.current.emit("sendMessage", socketData);

      // Update local message state (sender won't receive via socket now)
      setMessages((prevMessages) => [...prevMessages, formattedMessage]);

      // Clear input fields
      setNewMessage("");
      setFile(null);
      setReplyingTo(null);
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Failed to send message. Please try again.");
    }
  };

  // JSX Rendering Section
  // Helper function to check if current user reacted with an emoji
  const hasUserReacted = (reaction) => {
    return reaction.users?.some(
      (user) => (user._id || user) === parsedUser._id
    );
  };

  return (
    <div className="chat-page">
      {/* Message Readers Modal */}
      {showReadersModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowReadersModal(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Read by</h3>
              <button
                className="modal-close-btn"
                onClick={() => setShowReadersModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {messageReaders.length > 0 ? (
                <div className="readers-list">
                  {messageReaders.map((reader, index) => (
                    <div key={index} className="reader-item">
                      <div className="reader-avatar">
                        {reader.userName?.charAt(0).toUpperCase() || "U"}
                      </div>
                      <div className="reader-info">
                        <span className="reader-name">
                          {reader.userName || "Unknown User"}
                        </span>
                        <span className="reader-time">
                          {new Date(reader.readAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-readers">No one has read this message yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {showContextMenu && selectedMessageId && (
        <div
          className="context-menu"
          style={{
            position: "fixed",
            left: contextMenuPosition.x,
            top: contextMenuPosition.y,
            zIndex: 1000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="context-menu-item"
            onClick={() => handleContextMenuAction("reply", selectedMessageId)}
          >
            <FaReply /> Reply
          </button>

          <button
            className="context-menu-item"
            onClick={() => handleContextMenuAction("groupReply", selectedMessageId)}
          >
            <FaUsers /> Reply to Group
          </button>

          {messages.find((msg) => msg._id === selectedMessageId)
            ?.Message_content && (
              <button
                className="context-menu-item"
                onClick={() => handleContextMenuAction("copy", selectedMessageId)}
              >
                📋 Copy Text
              </button>
            )}

          <button
            className="context-menu-item"
            onClick={() =>
              handleContextMenuAction("forward", selectedMessageId)
            }
          >
            ↗️ Forward
          </button>

          {messages.find((msg) => msg._id === selectedMessageId)?.Message_sender
            ?._id === parsedUser._id && (
              <>
                {messages.find((msg) => msg._id === selectedMessageId)?.Message_content && (
                  <button
                    className="context-menu-item"
                    onClick={() =>
                      handleContextMenuAction("edit", selectedMessageId)
                    }
                  >
                    <FaEdit /> Edit
                  </button>
                )}
                <button
                  className="context-menu-item"
                  onClick={() =>
                    handleContextMenuAction("info", selectedMessageId)
                  }
                >
                  ℹ️ Message Info
                </button>
                <button
                  className="context-menu-item delete-item"
                  onClick={() =>
                    handleContextMenuAction("delete", selectedMessageId)
                  }
                >
                  <FaTrash /> Delete
                </button>
              </>
            )}
        </div>
      )}

      <div className="chat-container">
        {/* Typing indicator */}
        {typingStatus && (
          <div className="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
            <span style={{ marginLeft: "8px" }}>{typingStatus}</span>
          </div>
        )}
        {/* Message Filters */}
        <MessageFilters
          onSearch={handleSearch}
          onFilterByType={handleFilterByType}
          currentFilter={messageTypeFilter}
          groupId={groupId}
        />

        <div className="chat-messages">
          {isLoading ? (
            <p>Loading messages...</p>
          ) : filteredMessages.length === 0 && messages.length > 0 ? (
            <div className="no-messages-found">
              <p>No messages found matching your criteria.</p>
              <button
                onClick={() => {
                  setSearchTerm("");
                  setMessageTypeFilter(null);
                }}
                className="clear-filters-btn"
              >
                Clear filters
              </button>
            </div>
          ) : (
            filteredMessages.map((message) => {
              const isMyMessage =
                getSenderId(message) === ensureStringId(parsedUser._id);
              const senderName = getSenderName(message, isMyMessage);
              const senderInitial = senderName.charAt(0).toUpperCase();
              const messageTime = new Date(
                message.Message_createdAt || message.createdAt
              );

              return (
                <div
                  key={message._id}
                  className={`message ${isMyMessage ? "my-message" : "other-message"
                    } ${selectedMessageId === message._id ? "selected" : ""} ${hoveredMessageId === message._id ? "hovered" : ""
                    }`}
                  onMouseEnter={() => handleMessageHover(message._id, true)}
                  onMouseLeave={() => handleMessageHover(message._id, false)}
                  onClick={() => handleSelectMessage(message._id)}
                  onContextMenu={(e) => handleContextMenu(e, message._id)}
                >
                  <div className="message-info">
                    <div className="message-sender-info">
                      <span className="message-sender-avatar">
                        {senderInitial}
                      </span>
                      <div>
                        <span className="message-sender-name">
                          {senderName}
                        </span>
                        <span className="message-timestamp">
                          {messageTime.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                    <div
                      className={`chat-message-actions ${hoveredMessageId === message._id ||
                        selectedMessageId === message._id
                        ? "visible"
                        : ""
                        }`}
                    >
                      <button
                        className="chat-action-button reply-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReplyToMessage(message);
                        }}
                        title="Reply to message"
                      >
                        <FaReply />
                      </button>

                      {isMyMessage && message.Message_content && (
                        <button
                          className="chat-action-button edit-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditMessage(message);
                          }}
                          title="Edit message"
                        >
                          <FaEdit />
                        </button>
                      )}

                      {isMyMessage && (
                        <button
                          className="chat-action-button delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMessage(message._id);
                          }}
                          title="Delete message"
                        >
                          <FaTrash />
                        </button>
                      )}

                      {isMyMessage && (
                        <button
                          className="chat-action-button read-status-btn"
                          title={`Read by ${message.Message_readCount || 0
                            } people`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGetMessageReaders(message._id);
                          }}
                          disabled={
                            !message.Message_readCount ||
                            message.Message_readCount === 0
                          }
                        >
                          <BsCheck2All
                            className={
                              message.Message_readCount > 0 ? "read" : "sent"
                            }
                          />
                          {message.Message_readCount > 0 && (
                            <span className="read-count">
                              {message.Message_readCount}
                            </span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="message-bubble">
                    {message.Message_replyTo && (
                      <div className="reply-preview">
                        <div className="reply-header">
                          Replying to{" "}
                          {getSenderName(message.Message_replyTo, false)}
                          :
                        </div>
                        <div className="reply-content">
                          {message.Message_replyTo.Message_fileId ? (
                            <span className="reply-file">
                              📎{" "}
                              {
                                message.Message_replyTo.Message_fileId
                                  .File_originalName
                              }
                            </span>
                          ) : (
                            message.Message_replyTo.Message_content?.substring(
                              0,
                              50
                            ) +
                            (message.Message_replyTo.Message_content?.length >
                              50
                              ? "..."
                              : "")
                          )}
                        </div>
                      </div>
                    )}

                    {/* Message Type Badge */}
                    {message.messageType && message.messageType !== "text" && (
                      <div
                        className={`message-type-badge ${message.messageType}`}
                      >
                        {message.messageType === "file" && "📎"}
                        {message.messageType === "mixed" && "📎💬"}
                        {message.messageType === "reply" && "↩️"}
                        <span>{message.messageType}</span>
                      </div>
                    )}

                    <div className="message-content">
                      {/* File Content */}
                      {(message.fileUrl || message.Message_fileUrl) && (
                        <div className="file-attachment">
                          {message.fileType === "image" ||
                            message.Message_fileType === "image" ? (
                            <div className="image-preview">
                              <img
                                src={message.fileUrl || message.Message_fileUrl}
                                alt={
                                  message.fileName ||
                                  message.Message_fileName ||
                                  "Image"
                                }
                                className="message-image"
                                onClick={() =>
                                  window.open(
                                    message.fileUrl || message.Message_fileUrl,
                                    "_blank"
                                  )
                                }
                              />
                            </div>
                          ) : (
                            <a
                              href={message.fileUrl || message.Message_fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="file-message"
                            >
                              <div className="file-icon">
                                {message.fileType === "video" ||
                                  message.Message_fileType === "video"
                                  ? "🎥"
                                  : message.fileType === "audio" ||
                                    message.Message_fileType === "audio"
                                    ? "🎵"
                                    : message.fileType === "document" ||
                                      message.Message_fileType === "document"
                                      ? "📄"
                                      : "📎"}
                              </div>
                              <div className="file-info">
                                <div className="file-name">
                                  {message.fileName ||
                                    message.Message_fileName ||
                                    "Download file"}
                                </div>
                                {(message.fileSizeFormatted ||
                                  message.fileSize) && (
                                    <div className="file-size">
                                      {message.fileSizeFormatted ||
                                        `${Math.round(
                                          message.fileSize / 1024
                                        )} KB`}
                                    </div>
                                  )}
                              </div>
                            </a>
                          )}
                        </div>
                      )}

                      {/* Text Content */}
                      {message.Message_content && (
                        <div className="text-content">
                          {editingMessageId === message._id ? (
                            <div className="edit-message-container">
                              <textarea
                                value={editingContent}
                                onChange={(e) => setEditingContent(e.target.value)}
                                className="edit-message-input"
                                rows="3"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && e.ctrlKey) {
                                    handleSaveEdit(message._id);
                                  } else if (e.key === "Escape") {
                                    handleCancelEdit();
                                  }
                                }}
                              />
                              <div className="edit-message-actions">
                                <button
                                  className="save-edit-btn"
                                  onClick={() => handleSaveEdit(message._id)}
                                  disabled={!editingContent.trim()}
                                >
                                  Save
                                </button>
                                <button
                                  className="cancel-edit-btn"
                                  onClick={handleCancelEdit}
                                >
                                  Cancel
                                </button>
                              </div>
                              <div className="edit-hint">
                                Press Ctrl+Enter to save, Esc to cancel
                              </div>
                            </div>
                          ) : (
                            <div className="message-text">
                              {message.Message_content}
                              {message.Message_isEdited && (
                                <span className="edited-indicator" title={`Edited ${message.Message_editedAt ? new Date(message.Message_editedAt).toLocaleString() : ''}`}>
                                  (edited)
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="emoji-reactions">
                      {message.Message_emojiReactions?.map((reaction, idx) => {
                        const isUserReacted = hasUserReacted(reaction);
                        return (
                          <button
                            key={`${reaction.emoji}-${idx}`}
                            className={`emoji-button ${isUserReacted ? "reacted" : ""
                              }`}
                            onClick={() =>
                              handleEmojiReaction(message._id, reaction.emoji)
                            }
                            title={`${reaction.count} ${reaction.count === 1 ? "reaction" : "reactions"
                              }`}
                          >
                            {reaction.emoji}{" "}
                            {reaction.count > 1 ? reaction.count : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <footer className="chat-input">
          {/* Reply indicator */}
          {replyingTo && (
            <div className="reply-indicator">
              <div className="reply-content">
                <span>
                  Replying to {getSenderName(replyingTo, false)}:{" "}
                </span>
                <span className="reply-text">
                  {replyingTo.Message_content?.substring(0, 50)}
                  {replyingTo.Message_content?.length > 50 ? "..." : ""}
                </span>
              </div>
              <button
                className="cancel-reply-btn"
                onClick={cancelReply}
                title="Cancel reply"
              >
                ×
              </button>
            </div>
          )}
          {/* File preview */}
          {file && (
            <div className="file-preview">
              <div className="file-preview-info">
                <span>
                  {file.type.startsWith("image/")
                    ? "🖼️"
                    : file.type.startsWith("video/")
                      ? "🎥"
                      : file.type.startsWith("audio/")
                        ? "🎵"
                        : file.type.includes("pdf") ||
                          file.type.includes("document")
                          ? "📄"
                          : "📎"}
                </span>
                <span>{file.name}</span>
                <span className="file-size">
                  ({Math.round(file.size / 1024)} KB)
                </span>
              </div>
              <button
                className="file-preview-remove"
                onClick={() => setFile(null)}
                title="Remove file"
              >
                ×
              </button>
            </div>
          )}
          {/* Chat Input Container */}
          <div className="chat-input-container">
            <div className="chat-input-actions">
              <button
                ref={emojiButtonRef}
                className="emoji-button"
                onClick={handleShowEmojiPicker}
                type="button"
                title="Add emoji"
              >
                <FaSmile />
              </button>

              <button
                className="file-upload-button"
                onClick={handleChooseFile}
                type="button"
                title="Attach file"
              >
                <FaPaperclip />
              </button>

              <button
                className="multi-group-button"
                onClick={openMultiGroupModal}
                type="button"
                title="Send to multiple groups"
              >
                <FaUsers />
              </button>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
            </div>

            {showEmojiPicker && createPortal(
              <div
                className="emoji-picker-container"
                style={{
                  left: `${emojiPickerPosition.left}px`,
                  bottom: `${emojiPickerPosition.bottom}px`,
                }}
              >
                <EmojiPicker
                  onEmojiClick={handleEmojiClick}
                  width="100%"
                  height={320}
                />
              </div>,
              document.body
            )}

            <textarea
              rows="2"
              value={newMessage}
              onChange={handleMessageChange}
              placeholder={
                replyingTo ? "Reply to message..." : "Type a message..."
              }
            />

            <button
              onClick={sendMessage}
              className="send-button"
              disabled={!newMessage.trim() && !file}
              title="Send message"
            >
              <FaPaperPlane />
            </button>
          </div>
        </footer>
      </div>

      {/* Multi-Group Messaging Modal */}
      <MultiGroupMessaging
        isOpen={showMultiGroupModal}
        onClose={() => setShowMultiGroupModal(false)}
        userGroups={userGroups}
        socket={socketRef.current}
        onMessageSent={handleMultiGroupMessageSent}
      />

      {/* Group Reply Modal */}
      <GroupReplyModal
        isOpen={showGroupReplyModal}
        onClose={() => setShowGroupReplyModal(false)}
        originalMessage={replyToMessage}
        groupInfo={currentGroupInfo}
        socket={socketRef.current}
        onReplySent={handleGroupReplySent}
      />
    </div>
  );
};

export default Chat;
