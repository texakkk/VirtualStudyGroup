import React, { useState, useEffect, useCallback } from "react";
import { FaChevronDown, FaChevronRight, FaUserFriends } from "react-icons/fa";
import api from "../../api";
import { subscribeToGroupsUpdated } from "../../utils/groupEvents";
import "./GroupSidebar.css";

const GroupSidebar = ({ onGroupChange, currentGroup }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [groups, setGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastMessages, setLastMessages] = useState({});
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  const [currentUser] = useState(() => {
    const userData = localStorage.getItem("user");
    return userData ? JSON.parse(userData) : null;
  });

  // Fetch user groups
  const fetchUserGroups = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get("/group/user-groups");
      const groupsData = response.data.groups || [];
      setGroups(groupsData);

      if (groupsData.length > 0) {
        // Try to find the last active group from localStorage
        const lastActiveGroupId = localStorage.getItem("lastActiveGroup");
        const groupToSelect = lastActiveGroupId
          ? groupsData.find((g) => g._id === lastActiveGroupId) || groupsData[0]
          : groupsData[0];

        // Call onGroupChange with both groupId and groupData
        // Ensure groupId is a string
        const groupIdStr = typeof groupToSelect._id === 'object' ? groupToSelect._id.toString() : groupToSelect._id;
        onGroupChange(groupIdStr, {
          ...groupToSelect,
          _id: groupIdStr,
          isAdmin: groupToSelect.createdBy === currentUser?._id,
          memberCount: groupToSelect.members?.length || 0,
        });
      }
      return groupsData;
    } catch (error) {
      console.error("Error fetching groups:", error);
      setError("Failed to load groups. Please refresh the page.");
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [onGroupChange, currentUser?._id]);

  // Handle new message to update last message
  const handleNewMessage = useCallback((message) => {
    if (message && message.groupId) {
      setLastMessages((prev) => ({
        ...prev,
        [message.groupId]: {
          text: message.content || message.text || "📎 Attachment",
          sender: message.sender || message.userId,
          timestamp: message.timestamp || new Date().toISOString(),
        },
      }));
    }
  }, []);

  // Load groups when component mounts
  useEffect(() => {
    fetchUserGroups();
  }, [fetchUserGroups]);

  useEffect(() => {
    const unsubscribe = subscribeToGroupsUpdated(() => {
      fetchUserGroups();
    });
    return unsubscribe;
  }, [fetchUserGroups]);

  // Handle group selection
  const handleGroupSelect = (groupId) => {
    // Ensure groupId is a string
    const groupIdStr = typeof groupId === 'object' ? groupId.toString() : groupId;
    const selectedGroup = groups.find((g) => (typeof g._id === 'object' ? g._id.toString() : g._id) === groupIdStr);
    if (selectedGroup && onGroupChange) {
      onGroupChange(groupIdStr, {
        ...selectedGroup,
        _id: groupIdStr,
        isAdmin: selectedGroup.createdBy === currentUser?._id,
        memberCount: selectedGroup.members?.length || 0,
      });
    }
  };

  const filteredGroups = groups.filter((group) =>
    group.Group_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getInitials = (name) => {
    return name
      ? name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
      : "G";
  };

  const getRandomColor = (str) => {
    const colors = [
      "#4e73df",
      "#1cc88a",
      "#36b9cc",
      "#f6c23e",
      "#e74a3b",
      "#6610f2",
      "#fd7e14",
      "#20c9a6",
    ];
    const hash = str
      .split("")
      .reduce((acc, char) => char.charCodeAt(0) + acc, 0);
    return colors[hash % colors.length];
  };

  return (
    <aside 
      className={`group-sidebar ${isCollapsed ? "collapsed" : ""}`}
      role="complementary"
      aria-label="Groups sidebar"
    >
      <button
        className="sidebar-header"
        onClick={() => setIsCollapsed(!isCollapsed)}
        aria-expanded={!isCollapsed}
        aria-controls="groups-list"
        aria-label={isCollapsed ? "Expand groups sidebar" : "Collapse groups sidebar"}
      >
        <h3 className="sidebar-title" id="groups-heading">Your Groups</h3>
        <span className="collapse-icon" aria-hidden="true">
          {isCollapsed ? <FaChevronRight /> : <FaChevronDown />}
        </span>
      </button>

      {!isCollapsed && (
        <>
          <div className="search-container" role="search">
            <label htmlFor="group-search" className="sr-only">Search groups</label>
            <input
              id="group-search"
              type="text"
              placeholder="Search groups..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
              aria-label="Search groups"
              aria-describedby="group-count"
            />
          </div>

          <div id="group-count" className="group-count" role="status" aria-live="polite">
            {filteredGroups.length}{" "}
            {filteredGroups.length === 1 ? "Group" : "Groups"}
          </div>

          {isLoading ? (
            <div className="loading-container" role="status" aria-live="polite">
              <div className="spinner" aria-hidden="true"></div>
              <p>Loading groups...</p>
            </div>
          ) : error ? (
            <div className="error-container" role="alert">
              <p>{error}</p>
              <button 
                onClick={fetchUserGroups} 
                className="retry-button"
                aria-label="Retry loading groups"
              >
                Retry
              </button>
            </div>
          ) : groups.length === 0 ? (
            <div className="no-groups-container" role="status">
              <FaUserFriends size={48} aria-hidden="true" />
              <h3>No Groups Found</h3>
              <p>You're not a member of any groups yet.</p>
            </div>
          ) : (
            <ul 
              id="groups-list"
              className="group-list"
              role="listbox"
              aria-labelledby="groups-heading"
              aria-activedescendant={currentGroup ? `group-${currentGroup}` : undefined}
            >
              {filteredGroups.length > 0 ? (
                filteredGroups.map((group) => {
                  const groupId = typeof group._id === 'object' ? group._id.toString() : group._id;
                  return (
                    <li
                      key={group._id}
                      id={`group-${groupId}`}
                      className={`group-item ${
                        currentGroup === groupId ? "active" : ""
                      }`}
                      onClick={() => handleGroupSelect(groupId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleGroupSelect(groupId);
                        }
                      }}
                      role="option"
                      aria-selected={currentGroup === groupId}
                      tabIndex={currentGroup === groupId ? 0 : -1}
                      aria-label={`${group.Group_name}${group.isAdmin ? ', Admin' : ''}, ${group.members?.length || 0} members`}
                    >
                      <div
                        className="group-avatar"
                        style={{ backgroundColor: getRandomColor(groupId) }}
                        aria-hidden="true"
                      >
                        {getInitials(group.Group_name)}
                      </div>
                      <div className="group-details">
                        <div className="group-name">
                          {group.Group_name}
                          {group.isAdmin && (
                            <span className="admin-badge" aria-label="Administrator">Admin</span>
                          )}
                        </div>
                        {group.lastMessage && (
                          <div className="last-message" aria-label="Last message">
                            {currentUser?._id &&
                            group.lastMessage.sender === currentUser._id
                              ? "You: "
                              : ""}
                            {group.lastMessage.text &&
                            group.lastMessage.text.length > 25
                              ? group.lastMessage.text.substring(0, 25) + "..."
                              : group.lastMessage.text || "New message"}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })
              ) : (
                <div className="no-groups" role="status">
                  {searchTerm
                    ? "No matching groups found"
                    : "No groups available"}
                </div>
              )}
            </ul>
          )}
        </>
      )}
    </aside>
  );
};

export default GroupSidebar;
