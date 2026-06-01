import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  FaCommentAlt,
  FaVideo,
  FaUsers,
  FaUserCircle,
  FaChevronLeft,
  FaChevronRight,
  FaSearch,
} from "react-icons/fa";
import { BsThreeDotsVertical } from "react-icons/bs";
import io from "socket.io-client";
import Chat from "./Chat";
import api from "../../api";
import { useVideoChat } from "../../contexts/VideoChatContext";
import { subscribeToGroupsUpdated } from "../../utils/groupEvents";
import "./GroupChatPage.css";

const GroupChatPage = () => {
  // Core chat/video state
  const [currentGroup, setCurrentGroup] = useState(null);
  const [isVideoChat, setIsVideoChat] = useState(false);
  const [currentGroupDetails, setCurrentGroupDetails] = useState(null);
  const { videoChatState, startVideoChat, openVideoChatPanel } = useVideoChat();

  // Chat-specific state
  const [typingStatus, setTypingStatus] = useState("");
  const [showMembers, setShowMembers] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [presenceTick, setPresenceTick] = useState(0);

  // Integrated sidebar state
  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const socketRef = useRef(null);

  // Fetch group members (only for chat functionality)
  const fetchGroupMembers = useCallback(async (groupId) => {
    if (!groupId) return [];

    setMembersLoading(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      // Ensure groupId is a string
      const groupIdStr = typeof groupId === 'object' ? groupId.toString() : groupId;
      const response = await api.get(`/auth/group-users/${groupIdStr}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const membersData =
        response.data.users?.map((user) => ({
          _id: user._id,
          name: user.User_name || user.name,
          email: user.User_email || user.email,
          isAdmin: user.isAdmin,
          isCreator:
            response.data.group?.createdBy?.toString() === user._id.toString(),
          lastActive: user.lastActive,
        })) || [];

      setMembers(membersData);
      return membersData;
    } catch (error) {
      console.error("Error fetching group members:", error);
      return [];
    } finally {
      setMembersLoading(false);
    }
  }, []);

  // Handle group selection from sidebar
  const handleGroupChange = useCallback(async (groupId, groupData) => {
    setCurrentGroup(groupId);
    setCurrentGroupDetails(groupData);
    setIsVideoChat(false);
    setShowMembers(false);

    // Fetch members for the selected group
    await fetchGroupMembers(groupId);

    // Save last active group to localStorage
    localStorage.setItem("lastActiveGroup", groupId);
  }, [fetchGroupMembers]);

  // Fetch user's groups
  const fetchGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      console.log("Fetching groups..."); // Debug log

      const response = await api.get("/group/user-groups");

      console.log("Groups response:", response.data); // Debug log

      const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

      const groupsData =
        response.data.groups?.map((group) => ({
          _id: group._id,
          Group_name: group.Group_name,
          Group_description: group.Group_description,
          memberCount: group.members?.length || 0,
          lastMessage: group.lastMessage,
          isAdmin: group.createdBy === currentUser?._id,
          createdAt: group.createdAt,
          members: group.members || [],
        })) || [];

      console.log("Processed groups data:", groupsData); // Debug log
      setGroups(groupsData);

      // Auto-select last active group or first group
      const lastActiveGroup = localStorage.getItem("lastActiveGroup");
      if (
        lastActiveGroup &&
        groupsData.find((g) => g._id === lastActiveGroup)
      ) {
        const groupData = groupsData.find((g) => g._id === lastActiveGroup);
        handleGroupChange(lastActiveGroup, groupData);
      } else if (groupsData.length > 0) {
        handleGroupChange(groupsData[0]._id, groupsData[0]);
      }
    } catch (error) {
      console.error("Error fetching groups:", error);
      setGroups([]);
    } finally {
      setGroupsLoading(false);
    }
  }, [handleGroupChange]);

  // Initialize socket connection
  useEffect(() => {
    const token = localStorage.getItem("token");

    socketRef.current = io("http://localhost:5001/chat", {
      auth: {
        token: token,
      },
    });

    // Add connection event handlers for debugging
    socketRef.current.on("connect", () => {
      console.log("GroupChatPage socket connected:", socketRef.current.id);
    });

    socketRef.current.on("connect_error", (error) => {
      console.error("GroupChatPage socket connection error:", error);
    });

    socketRef.current.on("disconnect", (reason) => {
      console.log("GroupChatPage socket disconnected:", reason);
    });

    const handleIncomingTyping = (data) => {
      if (data.groupId === currentGroup) {
        setTypingStatus(`${data.user} is typing...`);
        const timer = setTimeout(() => setTypingStatus(""), 2000);
        return () => clearTimeout(timer);
      }
    };

    const handleActiveUsers = (data) => {
      if (data.groupId !== currentGroup) return;
      setOnlineUsers(new Set((data.activeUsers || []).map(String)));
    };

    const handleUserOnline = (userId) => {
      setOnlineUsers((prev) => new Set([...prev, userId?.toString()]));
    };

    const handleUserOffline = ({ userId, lastActive }) => {
      setOnlineUsers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });

      if (lastActive) {
        setMembers((prevMembers) =>
          prevMembers.map((member) =>
            member._id?.toString() === userId?.toString()
              ? { ...member, lastActive }
              : member
          )
        );
      }
    };

    socketRef.current.on("activeUsers", handleActiveUsers);
    socketRef.current.on("typing", handleIncomingTyping);
    socketRef.current.on("userOnline", handleUserOnline);
    socketRef.current.on("userOffline", handleUserOffline);

    // Cleanup function
    return () => {
      if (socketRef.current) {
        socketRef.current.off("activeUsers", handleActiveUsers);
        socketRef.current.off("typing", handleIncomingTyping);
        socketRef.current.off("userOnline", handleUserOnline);
        socketRef.current.off("userOffline", handleUserOffline);
        socketRef.current.disconnect();
      }
    };
  }, [currentGroup]);

  useEffect(() => {
    const timer = setInterval(() => {
      setPresenceTick((tick) => tick + 1);
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  // Handle typing events
  const handleTyping = useCallback(() => {
    if (currentGroup && socketRef.current) {
      const userName =
        JSON.parse(localStorage.getItem("user") || "{}")?.User_name ||
        "Someone";
      socketRef.current.emit("typing", {
        groupId: currentGroup,
        user: userName,
      });
    }
  }, [currentGroup]);

  // Toggle member list visibility
  const toggleMemberList = () => {
    setShowMembers((prev) => !prev);
    setShowMenu(false); // Close menu when opening members
  };

  const toggleMenu = () => {
    setShowMenu((prev) => !prev);
  };

  const closeMenu = () => {
    setShowMenu(false);
  };

  const openPersistentVideoCall = () => {
    if (!currentGroup) return;

    const activeCallGroupId = videoChatState.activeCall?.groupId;
    if (activeCallGroupId === currentGroup) {
      openVideoChatPanel();
    } else {
      startVideoChat({
        groupId: currentGroup,
        groupName: currentGroupDetails?.Group_name,
      });
    }
    setIsVideoChat(false);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showMenu && !event.target.closest(".gcp-dropdown")) {
        closeMenu();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showMenu]);

  // Format last seen time
  const formatLastSeen = (lastSeenTime) => {
    void presenceTick;
    if (!lastSeenTime) return "Never";

    const now = new Date();
    const lastSeen = new Date(lastSeenTime);
    const diffInMinutes = Math.floor((now - lastSeen) / (1000 * 60));

    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return lastSeen.toLocaleDateString();
  };

  // Initialize groups on component mount
  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    const unsubscribe = subscribeToGroupsUpdated(() => {
      fetchGroups();
    });
    return unsubscribe;
  }, [fetchGroups]);

  // Filter groups based on search term
  const filteredGroups = groups.filter((group) =>
    group.Group_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Generate avatar color based on group name
  const getAvatarColor = (groupName) => {
    const colors = [
      "#0f172a",
      "#1e293b",
      "#334155",
      "#475569",
      "#64748b",
      "#3f3f46",
    ];
    const index = groupName.charCodeAt(0) % colors.length;
    return colors[index];
  };

  // Get group initials for avatar
  const getGroupInitials = (groupName) => {
    return groupName
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Toggle sidebar collapse
  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  return (
    <div className="group-chat-page">
      <div
        className={`group-sidebar-container ${
          sidebarCollapsed ? "collapsed" : ""
        }`}
      >
        {/* Integrated Sidebar Header */}
        <div className="gcp-sidebar-header" onClick={toggleSidebar}>
          <h1 className="gcp-sidebar-title">Study Groups</h1>
          <div className="gcp-collapse-icon">
            {sidebarCollapsed ? <FaChevronRight /> : <FaChevronLeft />}
          </div>
        </div>

        {/* Search Container */}
        {!sidebarCollapsed && (
          <div className="gcp-search-container">
            <div style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="Search groups..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="gcp-search-input"
              />
              <FaSearch
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#94a3b8",
                  fontSize: "0.875rem",
                }}
              />
            </div>
          </div>
        )}

        {/* Groups List */}
        <div className="gcp-group-list">
          {groupsLoading ? (
            <div className="gcp-no-groups">Loading groups...</div>
          ) : filteredGroups.length === 0 ? (
            <div className="gcp-no-groups">
              {searchTerm ? "No groups found" : "No groups available"}
            </div>
          ) : (
            filteredGroups.map((group) => {
              const isActiveGroup = currentGroup === group._id;
              const memberCount =
                isActiveGroup && members.length > 0
                  ? members.length
                  : group.memberCount || 0;
              const onlineCount = isActiveGroup ? onlineUsers.size : null;

              return (
                <div
                  key={group._id}
                  className={`gcp-group-item ${
                    isActiveGroup ? "active" : ""
                  }`}
                  onClick={() => handleGroupChange(group._id, group)}
                >
                  <div
                    className="gcp-group-avatar"
                    style={{ backgroundColor: getAvatarColor(group.Group_name) }}
                  >
                    {getGroupInitials(group.Group_name)}
                  </div>

                  {!sidebarCollapsed && (
                    <div className="gcp-group-details">
                      <div className="gcp-group-name">{group.Group_name}</div>
                      <div className="gcp-group-meta">
                        <span className="gcp-member-count-badge">
                          <FaUsers size={10} />
                          {memberCount}
                        </span>
                        {onlineCount !== null && (
                          <span className="gcp-online-indicator">
                            {onlineCount} online
                          </span>
                        )}
                      </div>
                      {group.lastMessage && (
                        <div className="gcp-last-message">
                          {group.lastMessage.length > 30
                            ? `${group.lastMessage.substring(0, 30)}...`
                            : group.lastMessage}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div
        className={`gcp-main-container ${
          showMembers ? "gcp-members-visible" : ""
        }`}
      >
        {currentGroup ? (
          <>
            <div className="gcp-header">
              {isVideoChat ? (
                // Minimal header for video chat - only group name, toggle, and 3-dot menu
                <div className="gcp-video-header">
                  <h2>{currentGroupDetails?.Group_name || "Video Chat"}</h2>
                  <div className="gcp-header-actions">
                    <button
                      className="gcp-header-btn"
                      onClick={() => setIsVideoChat(false)}
                      title="Switch to Chat"
                    >
                      <FaCommentAlt />
                    </button>
                    <div className="gcp-dropdown">
                      <button
                        className={`gcp-header-btn ${showMenu ? "active" : ""}`}
                        onClick={toggleMenu}
                        title="More options"
                      >
                        <BsThreeDotsVertical />
                      </button>
                      {showMenu && (
                        <div className="gcp-dropdown-menu">
                          <button
                            className="gcp-dropdown-item"
                            onClick={closeMenu}
                          >
                            Video Settings
                          </button>
                          <button
                            className="gcp-dropdown-item"
                            onClick={closeMenu}
                          >
                            End Call
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                // Full header for regular chat - group name, members, status, typing, toggle, 3-dot menu
                <>
                  <div className="gcp-header-content">
                    <h2>{currentGroupDetails?.Group_name || "Chat"}</h2>
                    <div className="gcp-header-status">
                      {typingStatus || (
                        <>
                          <span
                            className="gcp-member-count"
                            onClick={toggleMemberList}
                          >
                            {members.length} member
                            {members.length !== 1 ? "s" : ""}
                          </span>
                          <span className="gcp-divider">•</span>
                          <span className="gcp-active-status">
                            {onlineUsers.size > 1
                              ? `${onlineUsers.size - 1} online`
                              : "No one else is online"}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="gcp-header-actions">
                    <button
                      className={`gcp-header-btn ${
                        showMembers ? "active" : ""
                      }`}
                      onClick={toggleMemberList}
                      title={showMembers ? "Hide Members" : "Show Members"}
                    >
                      <FaUsers />
                    </button>
                    <button
                      className={`gcp-header-btn ${
                        videoChatState.activeCall?.groupId === currentGroup
                          ? "active"
                          : ""
                      }`}
                      onClick={openPersistentVideoCall}
                      title={
                        videoChatState.activeCall?.groupId === currentGroup
                          ? "Open Video Call"
                          : "Start Video Call"
                      }
                    >
                      <FaVideo />
                    </button>
                    <div className="gcp-dropdown">
                      <button
                        className={`gcp-header-btn ${showMenu ? "active" : ""}`}
                        onClick={toggleMenu}
                        title="More options"
                      >
                        <BsThreeDotsVertical />
                      </button>
                      {showMenu && (
                        <div className="gcp-dropdown-menu">
                          <button
                            className="gcp-dropdown-item"
                            onClick={closeMenu}
                          >
                            Search Messages
                          </button>
                          <button
                            className="gcp-dropdown-item"
                            onClick={closeMenu}
                          >
                            Mute Notifications
                          </button>
                          <button
                            className="gcp-dropdown-item"
                            onClick={closeMenu}
                          >
                            Clear Chat History
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Conditional rendering of chat or video chat */}
            <div className="gcp-chat-content">
              <Chat
                groupId={currentGroup}
                socket={socketRef.current}
                groupName={currentGroupDetails?.Group_name}
                onTyping={handleTyping}
              />
            </div>
          </>
        ) : (
          <div className="gcp-no-group-selected">
            <h3>Select a group to start chatting</h3>
            <p>Choose a group from the sidebar to begin your conversation.</p>
          </div>
        )}
      </div>

      {/* Member list sidebar - only show in chat mode */}
      {!isVideoChat && (
        <div className={`gcp-member-list ${showMembers ? "gcp-show" : ""}`}>
          <div className="gcp-member-list-header">
            <h3>
              Group Members ({Array.isArray(members) ? members.length : 0})
            </h3>
            <button onClick={toggleMemberList} className="gcp-close-members">
              ×
            </button>
          </div>
          <div className="gcp-members-scrollable">
            {membersLoading ? (
              <div className="gcp-loading-message">Loading members...</div>
            ) : !Array.isArray(members) || members.length === 0 ? (
              <div className="gcp-no-members">No members found</div>
            ) : (
              members.map((member) => {
                if (!member || !member._id) return null;

                const memberId = member._id.toString();
                const isOnline = onlineUsers.has(memberId);
                const status = isOnline
                  ? "Online"
                  : member.lastActive
                  ? `Last seen ${formatLastSeen(member.lastActive)}`
                  : "Offline";

                return (
                  <div key={memberId} className="gcp-member-item">
                    <div className="gcp-member-avatar">
                      <FaUserCircle size={36} />
                      {isOnline && <span className="gcp-online-status"></span>}
                    </div>
                    <div className="gcp-member-info">
                      <div className="gcp-member-name">
                        {member.name || member.email || "Unknown User"}
                      </div>
                      <div className="gcp-member-status">{status}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupChatPage;
