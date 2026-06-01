import React, { useState, useEffect } from 'react';
import api from '../../api';
import './GroupSettings.css';

const defaultSettings = {
  GroupSettings_permissions: {
    inviteMembers: 'admin',
    createTasks: 'member',
    shareFiles: 'member',
    moderateContent: 'admin',
    createSubGroups: 'admin',
    manageCalendar: 'moderator',
    accessAnalytics: 'admin'
  },
  GroupSettings_features: {
    aiAssistant: true,
    videoSessions: true,
    fileSharing: true,
    whiteboard: true,
    notes: true,
    calendar: true,
    analytics: true,
    subGroups: true
  },
  GroupSettings_schedule: {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    regularMeetings: []
  },
  GroupSettings_moderation: {
    autoModeration: false,
    bannedWords: [],
    reportThreshold: 3,
    requireApproval: {
      newMembers: false,
      fileUploads: false,
      posts: false
    }
  },
  GroupSettings_privacy: {
    visibility: 'private',
    allowSearch: true,
    showMemberList: true,
    allowGuestAccess: false
  }
};

const normalizeSettings = (incoming = {}) => ({
  ...defaultSettings,
  ...incoming,
  GroupSettings_permissions: {
    ...defaultSettings.GroupSettings_permissions,
    ...(incoming.GroupSettings_permissions || {})
  },
  GroupSettings_features: {
    ...defaultSettings.GroupSettings_features,
    ...(incoming.GroupSettings_features || {})
  },
  GroupSettings_schedule: {
    ...defaultSettings.GroupSettings_schedule,
    ...(incoming.GroupSettings_schedule || {})
  },
  GroupSettings_moderation: {
    ...defaultSettings.GroupSettings_moderation,
    ...(incoming.GroupSettings_moderation || {}),
    requireApproval: {
      ...defaultSettings.GroupSettings_moderation.requireApproval,
      ...(incoming.GroupSettings_moderation?.requireApproval || {})
    }
  },
  GroupSettings_privacy: {
    ...defaultSettings.GroupSettings_privacy,
    ...(incoming.GroupSettings_privacy || {})
  }
});

const GroupSettings = ({ groupId, onClose }) => {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [activeTab, setActiveTab] = useState('permissions');
  const [subGroups, setSubGroups] = useState([]);
  const [newSubGroup, setNewSubGroup] = useState({
    name: '',
    description: '',
    type: 'channel',
    isPrivate: false
  });
  const [roles, setRoles] = useState([]);
  const [newRole, setNewRole] = useState({
    name: '',
    permissions: {
      inviteMembers: false,
      createTasks: false,
      shareFiles: false,
      moderateContent: false,
      manageEvents: false,
      editNotes: false
    }
  });

  useEffect(() => {
    if (groupId) {
      fetchGroupSettings();
      fetchSubGroups();
      fetchRoles();
    }
  }, [groupId]);

  const fetchGroupSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get(`/group/${groupId}/settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setSettings(normalizeSettings(response.data.settings));
      }
    } catch (error) {
      setNotification({
        message: error.response?.data?.message || 'Failed to load settings',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSubGroups = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get(`/group/${groupId}/subgroups`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setSubGroups(response.data.subGroups);
      }
    } catch (error) {
      console.error('Failed to load sub-groups:', error);
    }
  };

  const fetchRoles = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get(`/group/${groupId}/roles`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setRoles(response.data.roles || []);
      }
    } catch (error) {
      console.error('Failed to load roles:', error);
      // Roles might not be implemented yet, so don't show error
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const response = await api.put(`/group/${groupId}/settings`, {
        permissions: settings.GroupSettings_permissions,
        features: settings.GroupSettings_features,
        schedule: settings.GroupSettings_schedule,
        moderation: settings.GroupSettings_moderation,
        privacy: settings.GroupSettings_privacy
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setSettings(normalizeSettings(response.data.settings));
        setNotification({ message: 'Settings saved successfully', type: 'success' });
      }
    } catch (error) {
      setNotification({
        message: error.response?.data?.message || 'Failed to save settings',
        type: 'error'
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePermissionChange = (permission, value) => {
    setSettings({
      ...settings,
      GroupSettings_permissions: {
        ...settings.GroupSettings_permissions,
        [permission]: value
      }
    });
  };

  const handleFeatureToggle = (feature) => {
    setSettings({
      ...settings,
      GroupSettings_features: {
        ...settings.GroupSettings_features,
        [feature]: !settings.GroupSettings_features[feature]
      }
    });
  };

  const handleCreateSubGroup = async (e) => {
    e.preventDefault();
    if (!newSubGroup.name.trim()) {
      setNotification({ message: 'Sub-group name is required', type: 'error' });
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await api.post(`/group/${groupId}/subgroups`, newSubGroup, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setSubGroups([...subGroups, response.data.subGroup]);
        setNewSubGroup({ name: '', description: '', type: 'channel', isPrivate: false });
        setNotification({ message: 'Sub-group created successfully', type: 'success' });
      }
    } catch (error) {
      setNotification({
        message: error.response?.data?.message || 'Failed to create sub-group',
        type: 'error'
      });
    }
  };

  const handleDeleteSubGroup = async (subGroupId) => {
    if (!window.confirm('Are you sure you want to delete this sub-group?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await api.delete(`/group/${groupId}/subgroups/${subGroupId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSubGroups(subGroups.filter(sg => sg._id !== subGroupId));
      setNotification({ message: 'Sub-group deleted successfully', type: 'success' });
    } catch (error) {
      setNotification({
        message: error.response?.data?.message || 'Failed to delete sub-group',
        type: 'error'
      });
    }
  };

  const handleCreateRole = async (e) => {
    e.preventDefault();
    if (!newRole.name.trim()) {
      setNotification({ message: 'Role name is required', type: 'error' });
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await api.post(`/group/${groupId}/roles`, newRole, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setRoles([...roles, response.data.role]);
        setNewRole({
          name: '',
          permissions: {
            inviteMembers: false,
            createTasks: false,
            shareFiles: false,
            moderateContent: false,
            manageEvents: false,
            editNotes: false
          }
        });
        setNotification({ message: 'Role created successfully', type: 'success' });
      }
    } catch (error) {
      setNotification({
        message: error.response?.data?.message || 'Failed to create role',
        type: 'error'
      });
    }
  };

  const handleDeleteRole = async (roleId) => {
    if (!window.confirm('Are you sure you want to delete this role? Members with this role will be set to default member role.')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await api.delete(`/group/${groupId}/roles/${roleId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setRoles(roles.filter(r => r._id !== roleId));
      setNotification({ message: 'Role deleted successfully', type: 'success' });
    } catch (error) {
      setNotification({
        message: error.response?.data?.message || 'Failed to delete role',
        type: 'error'
      });
    }
  };

  if (loading) {
    return <div className="settings-loading">Loading settings...</div>;
  }

  if (!settings) {
    return <div className="settings-error">Failed to load settings</div>;
  }

  return (
    <div className="group-settings-modal">
      <div className="settings-header">
        <h2>Group Settings</h2>
        <button className="close-button" onClick={onClose}>×</button>
      </div>

      {notification.message && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}

      <div className="settings-tabs">
        <button
          className={activeTab === 'permissions' ? 'active' : ''}
          onClick={() => setActiveTab('permissions')}
        >
          Permissions & Roles
        </button>
        <button
          className={activeTab === 'features' ? 'active' : ''}
          onClick={() => setActiveTab('features')}
        >
          Features
        </button>
        <button
          className={activeTab === 'roles' ? 'active' : ''}
          onClick={() => setActiveTab('roles')}
        >
          Custom Roles
        </button>
        <button
          className={activeTab === 'subgroups' ? 'active' : ''}
          onClick={() => setActiveTab('subgroups')}
        >
          Sub-groups & Channels
        </button>
      </div>

      <div className="settings-content">
        {activeTab === 'permissions' && (
          <div className="permissions-section">
            <h3>Permission Management</h3>
            <p className="section-description">
              Control who can perform specific actions in this group
            </p>

            <div className="permission-grid">
              {Object.entries(settings.GroupSettings_permissions).map(([key, value]) => (
                <div key={key} className="permission-item">
                  <label>
                    {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                  </label>
                  <select
                    value={value}
                    onChange={(e) => handlePermissionChange(key, e.target.value)}
                  >
                    <option value="admin">Admin Only</option>
                    <option value="moderator">Moderator & Above</option>
                    <option value="member">All Members</option>
                    {key === 'inviteMembers' && <option value="anyone">Anyone</option>}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'features' && (
          <div className="features-section">
            <h3>Feature Toggles</h3>
            <p className="section-description">
              Enable or disable specific features for this group
            </p>

            <div className="feature-grid">
              {Object.entries(settings.GroupSettings_features).map(([key, value]) => (
                <div key={key} className="feature-item">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={() => handleFeatureToggle(key)}
                    />
                    <span className="toggle-slider"></span>
                    <span className="feature-name">
                      {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'roles' && (
          <div className="roles-section">
            <h3>Custom Roles Management</h3>
            <p className="section-description">
              Create custom roles with specific permissions for better group organization
            </p>

            <div className="create-role-form">
              <h4>Create New Role</h4>
              <form onSubmit={handleCreateRole}>
                <input
                  type="text"
                  placeholder="Role name (e.g., Moderator, Contributor)"
                  value={newRole.name}
                  onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                  className="role-input"
                />
                
                <div className="role-permissions">
                  <h5>Role Permissions</h5>
                  <div className="permission-checkboxes">
                    {Object.keys(newRole.permissions).map((permission) => (
                      <label key={permission} className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={newRole.permissions[permission]}
                          onChange={(e) => setNewRole({
                            ...newRole,
                            permissions: {
                              ...newRole.permissions,
                              [permission]: e.target.checked
                            }
                          })}
                        />
                        {permission.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                      </label>
                    ))}
                  </div>
                </div>

                <button type="submit" className="create-role-button">
                  Create Role
                </button>
              </form>
            </div>

            <div className="roles-list">
              <h4>Existing Roles</h4>
              {roles.length === 0 ? (
                <p className="no-roles">No custom roles created yet</p>
              ) : (
                <div className="roles-grid">
                  {roles.map((role) => (
                    <div key={role._id} className="role-card">
                      <div className="role-header">
                        <h5>{role.name}</h5>
                        <span className="role-badge">{role.memberCount || 0} members</span>
                      </div>
                      <div className="role-permissions-display">
                        <strong>Permissions:</strong>
                        <ul>
                          {Object.entries(role.permissions || {})
                            .filter(([_, value]) => value)
                            .map(([key]) => (
                              <li key={key}>
                                {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                              </li>
                            ))}
                        </ul>
                      </div>
                      <button
                        className="delete-role-button"
                        onClick={() => handleDeleteRole(role._id)}
                      >
                        Delete Role
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'subgroups' && (
          <div className="subgroups-section">
            <h3>Sub-groups & Channels</h3>
            <p className="section-description">
              Organize your group with sub-groups and channels for specific topics
            </p>

            <div className="create-subgroup-form">
              <h4>Create New Sub-group</h4>
              <form onSubmit={handleCreateSubGroup}>
                <input
                  type="text"
                  placeholder="Sub-group name"
                  value={newSubGroup.name}
                  onChange={(e) => setNewSubGroup({ ...newSubGroup, name: e.target.value })}
                  className="subgroup-input"
                />
                <textarea
                  placeholder="Description (optional)"
                  value={newSubGroup.description}
                  onChange={(e) => setNewSubGroup({ ...newSubGroup, description: e.target.value })}
                  className="subgroup-textarea"
                />
                <div className="subgroup-options">
                  <select
                    value={newSubGroup.type}
                    onChange={(e) => setNewSubGroup({ ...newSubGroup, type: e.target.value })}
                    className="subgroup-select"
                  >
                    <option value="channel">Channel</option>
                    <option value="project">Project</option>
                    <option value="study-session">Study Session</option>
                    <option value="discussion">Discussion</option>
                    <option value="announcement">Announcement</option>
                  </select>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={newSubGroup.isPrivate}
                      onChange={(e) => setNewSubGroup({ ...newSubGroup, isPrivate: e.target.checked })}
                    />
                    Private
                  </label>
                </div>
                <button type="submit" className="create-subgroup-button">
                  Create Sub-group
                </button>
              </form>
            </div>

            <div className="subgroups-list">
              <h4>Existing Sub-groups</h4>
              {subGroups.length === 0 ? (
                <p className="no-subgroups">No sub-groups created yet</p>
              ) : (
                <div className="subgroups-grid">
                  {subGroups.map((subGroup) => (
                    <div key={subGroup._id} className="subgroup-card">
                      <div className="subgroup-header">
                        <h5>{subGroup.SubGroup_name}</h5>
                        <span className={`subgroup-type ${subGroup.SubGroup_type}`}>
                          {subGroup.SubGroup_type}
                        </span>
                      </div>
                      {subGroup.SubGroup_description && (
                        <p className="subgroup-description">{subGroup.SubGroup_description}</p>
                      )}
                      <div className="subgroup-stats">
                        <span>{subGroup.SubGroup_members?.length || 0} members</span>
                        <span>{subGroup.SubGroup_statistics?.totalMessages || 0} messages</span>
                      </div>
                      <button
                        className="delete-subgroup-button"
                        onClick={() => handleDeleteSubGroup(subGroup._id)}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="settings-footer">
        <button className="cancel-button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="save-button"
          onClick={handleSaveSettings}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};

export default GroupSettings;
