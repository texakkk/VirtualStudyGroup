import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { ensureStringId, ensureStringIds } from '../../utils/objectId';
import { emitGroupsUpdated } from '../../utils/groupEvents';
import GroupSettings from './GroupSettings';
import GroupCalendar from './GroupCalendar';
import ModerationDashboard from './ModerationDashboard';
import './GroupManagement.css';

const GroupManagement = ({ onGroupChange = () => {} }) => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [invitationLink, setInvitationLink] = useState('');
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [activeGroup, setActiveGroup] = useState(null);
  const [activeGroupDetails, setActiveGroupDetails] = useState(null);
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState(null);
  const [groupStats, setGroupStats] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupDescription, setEditGroupDescription] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showModeration, setShowModeration] = useState(false);
  
  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('No token found');
        
        const res = await api.get('/group/user-groups', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        
        if (!res.data?.success) {
          throw new Error(res.data?.message || 'Failed to fetch groups');
        }

        // Map the response to match our state structure and ensure all IDs are strings
        const groupsData = res.data.groups.map(group => {
          const processedGroup = ensureStringIds({
            _id: group._id,
            Group_name: group.Group_name,
            Group_description: group.Group_description,
            isCreatedByUser: group.isCreatedByUser,
            userRole: group.userRole,
            memberCount: group.memberCount || 0,
            adminCount: group.adminCount || 0,
            joinedAt: group.joinedAt
          });
          
          // Double-check that _id is a valid string
          if (!processedGroup._id || typeof processedGroup._id !== 'string' || processedGroup._id === '[object Object]') {
            console.error('Invalid group ID detected:', group);
            return null;
          }
          
          return processedGroup;
        }).filter(Boolean); // Remove any null entries
        

        
        setGroups(groupsData);
      } catch (err) {

        setNotification({ message: err.message || 'Failed to load groups', type: 'error' });
      }
    };
    fetchGroups();
  }, []);

  const fetchGroupMembers = async (groupId) => {
    setMembersLoading(true);
    setMembersError(null);

    try {
      // Ensure groupId is a string
      const groupIdStr = ensureStringId(groupId);
      
      // Validate that we have a proper ID (not "[object Object]")
      if (!groupIdStr || groupIdStr === '[object Object]' || groupIdStr === 'undefined' || groupIdStr === 'null') {
        throw new Error(`Invalid group ID: ${groupIdStr}. Please refresh and try again.`);
      }

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No token found');
      }

      try {
        const res = await api.get(`/auth/group-users/${groupIdStr}`, {
          headers: { Authorization: `Bearer ${token}` },
        });


        
        // The backend returns users and group data
        const membersData = res.data.users?.map(user => ({
          _id: user._id,
          name: user.User_name,
          email: user.User_email,
          role: user.isAdmin ? 'admin' : 'member',
          isCreator: res.data.group?.createdBy?.toString() === user._id.toString(),
          joinedAt: user.joinedAt,
          lastActive: user.lastActive
        })) || [];


        
        // Update the active group details with isCreatedByUser flag
        const currentGroup = groups.find(g => g._id === groupId);
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const currentUserId = storedUser._id || storedUser.User_id;
        
        const groupDetails = {
          ...res.data.group,
          isCreatedByUser: currentGroup?.isCreatedByUser || res.data.group?.Group_createdBy?.toString() === currentUserId,
          userRole: currentGroup?.userRole || 'member'
        };
        

        
        setActiveGroupDetails(groupDetails);
        
        setMembersLoading(false);
        return membersData;
      } catch (apiError) {
        throw apiError;
      }
    } catch (err) {
      setMembersLoading(false);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to load members';
      setMembersError(errorMessage);
      console.error('Error fetching group members:', err);
      throw err;
    }
  };

  const fetchGroupStats = async (groupId) => {
    try {
      // Ensure groupId is a string
      const groupIdStr = ensureStringId(groupId);
      
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No token found');
      }

      const response = await api.get(`/group/${groupIdStr}/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setGroupStats(response.data.stats);
      }
    } catch (error) {
      // Don't show error notification for stats, it's not critical
    }
  };

  const handleGroupClick = async (groupId) => {
    // Ensure groupId is a string
    const groupIdStr = ensureStringId(groupId);
    
    // Validate that we have a proper ID
    if (!groupIdStr || groupIdStr === '[object Object]' || groupIdStr === 'undefined' || groupIdStr === 'null') {
      console.error('Invalid group ID received:', groupId);
      setNotification({ 
        message: 'Invalid group ID. Please refresh the page and try again.', 
        type: 'error' 
      });
      return;
    }
    
    // Don't do anything if clicking the same group
    if (activeGroup === groupIdStr) return;
    
    // Store the clicked group ID to check later if it's still active
    const clickedGroupId = groupIdStr;
    
    try {
      // Reset states when switching groups
      setActiveGroup(clickedGroupId);
      setMembers([]);
      setGroupStats(null);
      setInvitationLink('');
      setNotification({ message: '', type: '' });
      
      // Notify parent component about the group change
      onGroupChange(clickedGroupId);
      
      // Fetch both members and stats in parallel
      const [membersData] = await Promise.all([
        fetchGroupMembers(clickedGroupId),
        fetchGroupStats(clickedGroupId)
      ]);
      
      // Only update if we're still on the same group (user didn't click away)
      setActiveGroupDetails(prev => ({
        ...prev,
        _id: clickedGroupId
      }));
      setMembers(membersData || []);
      
    } catch (err) {
      console.error('Error loading group:', err);
      setNotification({ 
        message: err.response?.data?.message || err.message || 'Failed to load group', 
        type: 'error' 
      });
    }
  };

  const handleRemoveMember = async (memberId, memberName) => {
    // Add confirmation dialog
    if (!window.confirm(`Are you sure you want to remove ${memberName} from this group?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No token found');
      }

      await api.delete(`/group/members/${activeGroup}/${memberId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Refresh the members list
      const updatedMembers = members.filter(member => member._id !== memberId);
      setMembers(updatedMembers);
      setNotification({ message: 'Member removed successfully', type: 'success' });
    } catch (error) {
      setNotification({ message: error.response?.data?.message || 'Failed to remove member', type: 'error' });
    }
  };

  const handleRoleChange = async (memberId, memberName, newRole) => {
    const actionLabels = {
      admin: 'promote to admin',
      moderator: 'make moderator',
      member: 'set as member'
    };
    const confirmText = newRole === 'admin'
      ? `${memberName} will be able to manage group members, invite new members, and perform admin actions. Continue?`
      : newRole === 'moderator'
        ? `${memberName} will be able to help moderate content and manage calendar items where group settings allow it. Continue?`
        : `${memberName} will lose elevated privileges and become a regular member. Continue?`;
    const actionText = actionLabels[newRole] || 'change role';
    
    if (!window.confirm(`${actionText.charAt(0).toUpperCase() + actionText.slice(1)} ${memberName}?\n\n${confirmText}`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No token found');
      }

      const response = await api.patch(`/group/members/${activeGroup}/${memberId}/role`, 
        { role: newRole },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        // Update the member's role in the local state
        const updatedMembers = members.map(member => 
          member._id === memberId 
            ? { ...member, role: newRole }
            : member
        );
        setMembers(updatedMembers);
        setNotification({ 
          message: `${memberName} role updated to ${newRole}`, 
          type: 'success' 
        });
      }
    } catch (error) {
      setNotification({ 
        message: error.response?.data?.message || 'Failed to change member role', 
        type: 'error' 
      });
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim() || !groupDescription.trim()) {
      setNotification({ message: 'Name and description cannot be empty', type: 'error' });
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await api.post(
        '/group/create',
        { Group_name: groupName, Group_description: groupDescription },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.data?.success) {
        throw new Error(res.data?.message || 'Failed to create group');
      }

      const newGroup = {
        _id: res.data.group._id,
        Group_name: res.data.group.Group_name,
        Group_description: res.data.group.Group_description,
        isCreatedByUser: true,
        userRole: 'admin',
        memberCount: 1, // The creator is the first member
        adminCount: 1, // The creator is also an admin
        joinedAt: new Date().toISOString()
      };

      // Update the groups list with the new group
      setGroups((prevGroups) => [...prevGroups, newGroup]);
      emitGroupsUpdated();
      
      // Set the newly created group as active
      setActiveGroup(newGroup._id);
      onGroupChange(newGroup._id);
      
      // Clear the form
      setGroupName('');
      setGroupDescription('');
      
      // Show success message
      setNotification({ message: 'Group created successfully', type: 'success' });
      
      // Fetch the group details to populate members and stats
      try {
        const [membersData] = await Promise.all([
          fetchGroupMembers(newGroup._id),
          fetchGroupStats(newGroup._id)
        ]);
        
        setMembers(membersData || []);
      } catch (fetchError) {
        console.error('Error fetching group details:', fetchError);
      }
    } catch (err) {
      setNotification({ message: err.message || 'Failed to create group', type: 'error' });
    }
  };

  const generateInvitationLink = async (groupId) => {
    try {
      // Ensure groupId is a string
      const groupIdStr = typeof groupId === 'object' ? groupId.toString() : groupId;
      const res = await api.get(`/group/invite/${groupIdStr}`);
      const invitationToken = res.data.invitationToken;
  
      if (invitationToken) {
        const link = `${window.location.origin}/join-group/${invitationToken}`;
        setInvitationLink(link);
        await navigator.clipboard.writeText(link);
        setNotification({ message: 'Invite link copied to clipboard!', type: 'success' });
      } else {
        setNotification({ message: 'Failed to generate invite link', type: 'error' });
      }
    } catch (error) {
      console.error('Error generating invitation link:', error);
      setNotification({ 
        message: error.message || 'Error generating invitation link', 
        type: 'error' 
      });
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotification({ message: 'Link copied to clipboard!', type: 'success' });
    } catch (err) {
      console.error('Failed to copy:', err);
      setNotification({ message: 'Failed to copy link', type: 'error' });
    }
  };

  const handleViewInsights = (groupId) => {
    const groupIdStr = ensureStringId(groupId);

    if (!groupIdStr || groupIdStr === '[object Object]' || groupIdStr === 'undefined' || groupIdStr === 'null') {
      setNotification({
        message: 'Invalid group ID. Please refresh the page and try again.',
        type: 'error'
      });
      return;
    }

    navigate(`/dashboard/group-insights/${groupIdStr}`);
  };

  const handleDeleteGroup = async (groupId) => {
    // Ensure groupId is a string
    const groupIdStr = typeof groupId === 'object' ? groupId.toString() : groupId;
    const groupToDelete = groups.find(g => g._id === groupIdStr);
    if (!groupToDelete) return;

    const confirmMessage = `Are you sure you want to delete "${groupToDelete.Group_name}"?\n\nThis will permanently delete:\n- All group members\n- All messages and files\n- All tasks and video sessions\n- All related data\n\nThis action cannot be undone.`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await api.delete(`/group/${groupIdStr}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Remove from groups list
      setGroups((prevGroups) => prevGroups.filter((group) => group._id !== groupIdStr));
      
      // Clear active group if it was the deleted one
      if (activeGroup === groupIdStr) {
        setActiveGroup(null);
        setActiveGroupDetails(null);
        setMembers([]);
        setGroupStats(null);
        onGroupChange(null);
      }
      emitGroupsUpdated();
      
      setNotification({ message: 'Group and all associated data deleted successfully', type: 'success' });
    } catch (err) {
      // If backend says "not found", treat as already deleted and clean stale UI state
      if (err?.response?.status === 404) {
        setGroups((prevGroups) => prevGroups.filter((group) => group._id !== groupIdStr));

        if (activeGroup === groupIdStr) {
          setActiveGroup(null);
          setActiveGroupDetails(null);
          setMembers([]);
          setGroupStats(null);
          onGroupChange(null);
        }

        emitGroupsUpdated();
        setNotification({ message: 'Group was already deleted. List has been refreshed.', type: 'success' });
        return;
      }

      setNotification({ 
        message: err.response?.data?.message || 'Failed to delete group', 
        type: 'error' 
      });
    }
  };

  const handleEditGroup = (group) => {
    setEditingGroup(group._id);
    setEditGroupName(group.Group_name);
    setEditGroupDescription(group.Group_description);
  };

  const handleCancelEdit = () => {
    setEditingGroup(null);
    setEditGroupName('');
    setEditGroupDescription('');
  };

  const handleSaveEdit = async (groupId) => {
    // Ensure groupId is a string
    const groupIdStr = typeof groupId === 'object' ? groupId.toString() : groupId;
    
    if (!editGroupName.trim()) {
      setNotification({ message: 'Group name cannot be empty', type: 'error' });
      return;
    }

    // Check if the new name conflicts with existing groups (excluding current group)
    const nameConflict = groups.some(group => 
      group._id !== groupIdStr && 
      group.Group_name.toLowerCase() === editGroupName.trim().toLowerCase()
    );

    if (nameConflict) {
      setNotification({ message: 'A group with this name already exists', type: 'error' });
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await api.put(`/group/${groupIdStr}`, {
        Group_name: editGroupName.trim(),
        Group_description: editGroupDescription.trim()
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        // Update the group in the local state
        setGroups((prevGroups) => prevGroups.map(group => 
          group._id === groupIdStr 
            ? { 
                ...group, 
                Group_name: editGroupName.trim(),
                Group_description: editGroupDescription.trim()
              }
            : group
        ));
        emitGroupsUpdated();

        // Update active group details if this is the active group
        if (activeGroup === groupIdStr) {
          setActiveGroupDetails(prev => ({
            ...prev,
            Group_name: editGroupName.trim(),
            Group_description: editGroupDescription.trim()
          }));
        }

        setEditingGroup(null);
        setEditGroupName('');
        setEditGroupDescription('');
        setNotification({ message: 'Group updated successfully', type: 'success' });
      }
    } catch (err) {
      setNotification({ 
        message: err.response?.data?.message || 'Failed to update group', 
        type: 'error' 
      });
    }
  };

  // Note: activeGroupDetails is set in fetchGroupMembers to include proper admin permissions

  return (
    <div className="content-box">
      <h1 className="page-title">Group Management</h1>
      {notification.message && <div className={`notification ${notification.type}`}>{notification.message}</div>}

      <div className="group-creation">
        <h3>Create a New Group</h3>
        <input
          type="text"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="Enter group name"
          className="group-input"
        />
        <textarea
          value={groupDescription}
          onChange={(e) => setGroupDescription(e.target.value)}
          placeholder="Enter group description"
          className="group-description-input"
        ></textarea>
        <button onClick={handleCreateGroup} className="create-group-button">Create Group</button>
      </div>

      <div className="group-list-container">
        <h3>Your Groups</h3>
        <div className="groups-grid">
          {groups.map((group) => (
            <div key={group._id} className="group-card" onClick={() => editingGroup !== group._id ? handleGroupClick(group._id) : null}>
              {editingGroup === group._id ? (
                // Edit mode
                <div className="group-edit-form" onClick={(e) => e.stopPropagation()}>
                  <div className="group-header">
                    <input
                      type="text"
                      value={editGroupName}
                      onChange={(e) => setEditGroupName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveEdit(group._id);
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          handleCancelEdit();
                        }
                      }}
                      className="edit-group-name-input"
                      placeholder="Group name"
                      autoFocus
                    />
                    <div className="group-role-badge">
                      <span className={`role-badge ${group.userRole}`}>
                        {group.userRole.toUpperCase()}
                      </span>
                      {group.isCreatedByUser && (
                        <span className="creator-badge">CREATOR</span>
                      )}
                    </div>
                  </div>
                  <textarea
                    value={editGroupDescription}
                    onChange={(e) => setEditGroupDescription(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.ctrlKey) {
                        e.preventDefault();
                        handleSaveEdit(group._id);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        handleCancelEdit();
                      }
                    }}
                    className="edit-group-description-input"
                    placeholder="Group description"
                    rows="3"
                  />
                  
                  <div className="edit-actions">
                    <button 
                      onClick={() => handleSaveEdit(group._id)}
                      className="save-edit-button"
                    >
                      Save
                    </button>
                    <button 
                      onClick={handleCancelEdit}
                      className="cancel-edit-button"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="edit-help-text">
                    <small>Press Enter to save, Escape to cancel. Use Ctrl+Enter in description to save.</small>
                  </div>
                </div>
              ) : (
                // View mode
                <>
                  <div className="group-header">
                    <h4>{group.Group_name}</h4>
                    <div className="group-role-badge">
                      <span className={`role-badge ${group.userRole}`}>
                        {group.userRole.toUpperCase()}
                      </span>
                      {group.isCreatedByUser && (
                        <span className="creator-badge">CREATOR</span>
                      )}
                    </div>
                  </div>
                  <p className="group-description">{group.Group_description}</p>
                  
                  <div className="group-meta">
                    {group.joinedAt && (
                      <p className="joined-date">
                        Joined: {new Date(group.joinedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  <div className="group-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleViewInsights(group._id)}
            className="insights-button"
                    >
                      Insights
                    </button>
                    <button 
                      onClick={() => setShowCalendar(group._id)} 
                      className="calendar-button"
                    >
                      Calendar
                    </button>
                    {(group.isCreatedByUser || group.userRole === 'admin') && (
                      <>
                      <button 
                        onClick={() => generateInvitationLink(group._id)} 
                        className="invite-link-button"
                      >
                        Invite Link
                      </button>
                      <button 
                        onClick={() => setShowSettings(group._id)} 
                        className="settings-button"
                      >
                        Settings
                      </button>
                      {(group.isCreatedByUser || group.userRole === 'admin') && (
                        <button 
                          onClick={() => handleEditGroup(group)} 
                          className="edit-group-button"
                        >
                          Edit
                        </button>
                      )}
                      {group.isCreatedByUser && (
                        <button 
                          onClick={() => handleDeleteGroup(group._id)} 
                          className="delete-group-button"
                        >
                          Delete
                        </button>
                      )}
                      </>
                    )}
                    {(group.isCreatedByUser || group.userRole === 'admin' || group.userRole === 'moderator') && (
                      <button 
                        onClick={() => setShowModeration(group._id)} 
                        className="moderation-button"
                      >
                        Moderation
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {invitationLink && (
        <div className="invitation-link-container">
          <h4>Share this link to invite others:</h4>
          <div className="invitation-link-display">
            <input 
              type="text" 
              value={invitationLink} 
              readOnly 
              className="invitation-link-input" 
              onClick={(e) => e.target.select()}
            />
            <button 
              className="copy-button"
              onClick={() => copyToClipboard(invitationLink)}
              title="Copy to clipboard"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {activeGroup && groupStats && (
        <div className="group-overview">
          <div className="group-overview-header">
            <h3>
              {groups.find(g => g._id === activeGroup)?.Group_name || 'Group'} Overview
            </h3>
            <button
              className="overview-insights-button"
              onClick={() => handleViewInsights(activeGroup)}
            >
              View Full Insights
            </button>
          </div>
          <div className="stats-grid">
            <div className="stat-card">
              <h4>Members</h4>
              <div className="stat-number">{groupStats.members.total}</div>
              <div className="stat-details">
                <span>{groupStats.members.admins} admins</span>
                <span>{groupStats.members.regularMembers} members</span>
              </div>
            </div>
            <div className="stat-card">
              <h4>Recent Activity</h4>
              <div className="stat-number">{groupStats.members.recentJoins}</div>
              <div className="stat-details">
                <span>new members this week</span>
              </div>
            </div>
            {groupStats.tasks.total > 0 && (
              <div className="stat-card">
                <h4>Tasks</h4>
                <div className="stat-number">{groupStats.tasks.total}</div>
                <div className="stat-details">
                  <span>{groupStats.tasks.completed} completed</span>
                  <span>{groupStats.tasks.pending} pending</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}



      {activeGroup && (
        <div className="members-list">
          <div className="members-list-header">
            <h3>
              {groups.find(g => g._id === activeGroup)?.Group_name || 'Group'} Members
            </h3>
          </div>

          {membersLoading ? (
            <div className="loading">Loading members...</div>
          ) : membersError ? (
            <div className="error">{membersError}</div>
          ) : members.length === 0 ? (
            <div className="no-members">No members in this group</div>
          ) : (
            <div className="members-grid">
              {members.map((member) => (
                <div key={member._id} className="member-card">
                  <div className="member-info">
                    <h4>{member.name}</h4>
                    <p className="member-email">{member.email}</p>
                    <div className="member-role">
                      <span className={`role-badge ${member.role}`}>
                        {member.role.toUpperCase()}
                      </span>
                      {member.isCreator && (
                        <span className="creator-badge">CREATOR</span>
                      )}
                    </div>
                    {member.joinedAt && (
                      <p className="member-joined">
                        Joined: {new Date(member.joinedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  
                  {/* Admin controls - show based on user permissions */}
                  {(() => {
                    const currentGroup = groups.find(g => g._id === activeGroup);
                    const isUserAdmin = activeGroupDetails?.userRole === 'admin' || currentGroup?.userRole === 'admin';
                    const isUserCreator = activeGroupDetails?.isCreatedByUser || currentGroup?.isCreatedByUser;
                    
                    return (isUserAdmin || isUserCreator) && !member.isCreator;
                  })() && (
                    <div className="member-actions">
                      {/* Role management - only creators can promote/demote */}
                      {(() => {
                        const currentGroup = groups.find(g => g._id === activeGroup);
                        const isUserCreator = activeGroupDetails?.isCreatedByUser || currentGroup?.isCreatedByUser;
                        return isUserCreator;
                      })() && (
                        <div className="role-controls">
                          <select
                            className="role-select"
                            value={member.role}
                            onChange={(e) => {
                              if (e.target.value !== member.role) {
                                handleRoleChange(member._id, member.name, e.target.value);
                              }
                            }}
                            title="Change member role"
                          >
                            <option value="member">Member</option>
                            <option value="moderator">Moderator</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>
                      )}
                      
                      {/* Remove member - both creators and admins can do this, but not for themselves */}
                      {member._id !== JSON.parse(localStorage.getItem('user') || '{}')._id && (
                        <button 
                          className="remove-member-button"
                          onClick={() => handleRemoveMember(member._id, member.name)}
                          title="Remove from Group"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                  
                  {/* Show permissions info for current user */}
                  {member._id === JSON.parse(localStorage.getItem('user') || '{}')._id && (
                    <div className="current-user-badge">
                      <span>You</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showSettings && (
        <GroupSettings
          groupId={showSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showCalendar && (
        <GroupCalendar
          groupId={showCalendar}
          onClose={() => setShowCalendar(false)}
        />
      )}

      {showModeration && (
        <ModerationDashboard
          groupId={showModeration}
          onClose={() => setShowModeration(false)}
        />
      )}
    </div>
  );
};

export default GroupManagement;
