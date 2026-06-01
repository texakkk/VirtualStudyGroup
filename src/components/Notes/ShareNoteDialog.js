import React, { useContext, useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Avatar,
  Chip,
  FormControl,
  Select,
  MenuItem,
  Alert,
  Divider,
  InputAdornment,
  CircularProgress,
  Autocomplete,
} from '@mui/material';
import {
  Close as CloseIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Link as LinkIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';
import { ensureStringId } from '../../utils/objectId';
import AuthContext from '../../contexts/AuthContext';

const PermissionChip = styled(Chip, {
  shouldForwardProp: (prop) => prop !== 'permissionType',
})(({ theme, permissionType }) => ({
  backgroundColor: 
    permissionType === 'admin' ? theme.palette.error.light :
    permissionType === 'write' ? theme.palette.warning.light :
    theme.palette.success.light,
  color: theme.palette.getContrastText(
    permissionType === 'admin' ? theme.palette.error.light :
    permissionType === 'write' ? theme.palette.warning.light :
    theme.palette.success.light
  ),
}));

const normalizePermissionList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return Object.values(value).filter(Boolean);
  return [];
};

const getNoteId = (note) => {
  const noteId = ensureStringId(note?._id || note?.id);
  return typeof noteId === 'string' && /^[a-f\d]{24}$/i.test(noteId) ? noteId : '';
};

const getUserId = (user) => {
  const userId = ensureStringId(
    user?._id ||
    user?.id ||
    user?.User_id ||
    user?.UserId ||
    user?.userId ||
    user?.GroupMember_userId?._id ||
    user?.GroupMember_userId?.id ||
    user?.GroupMember_userId ||
    user?.user?._id ||
    user?.user?.id
  );
  return typeof userId === 'string' && /^[a-f\d]{24}$/i.test(userId) ? userId : '';
};

const getDisplayUser = (user) => {
  if (!user || typeof user === 'string') return {};
  return user.GroupMember_userId || user.user || user;
};

const getAccessUser = (user, permission) => {
  if (typeof user === 'string') {
    return { _id: user, permission };
  }

  return { ...getDisplayUser(user), permission };
};

const getUserName = (user, fallback = 'Unknown User') => {
  const displayUser = getDisplayUser(user);
  return (
    displayUser.User_name ||
    displayUser.name ||
    displayUser.username ||
    displayUser.displayName ||
    displayUser.User_email ||
    displayUser.email ||
    fallback
  );
};

const getUserEmail = (user) => {
  const displayUser = getDisplayUser(user);
  return displayUser.User_email || displayUser.email || '';
};

const getUserInitial = (user) => getUserName(user, 'U')[0].toUpperCase();

const isSameUser = (firstUser, secondUser) => {
  const firstUserId = getUserId(firstUser);
  const secondUserId = getUserId(secondUser);
  if (firstUserId && secondUserId) {
    return firstUserId === secondUserId;
  }

  const firstEmail = getUserEmail(firstUser).toLowerCase();
  const secondEmail = getUserEmail(secondUser).toLowerCase();
  return Boolean(firstEmail && secondEmail && firstEmail === secondEmail);
};

const ShareNoteDialog = ({
  open,
  onClose,
  note,
  onShare,
  onRemovePermission,
  groupMembers = [],
  loading = false,
}) => {
  const { currentUser } = useContext(AuthContext);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [permissionType, setPermissionType] = useState('read');
  const [shareLink, setShareLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [error, setError] = useState(null);

  // Generate shareable link when note is loaded
  useEffect(() => {
    if (note && open) {
      const baseUrl = window.location.origin;
      const link = `${baseUrl}/dashboard/notes/${getNoteId(note)}`;
      setShareLink(link);
    }
  }, [note, open]);

  const ownerUser = React.useMemo(() => (
    isSameUser(note?.createdBy, currentUser) ? currentUser : note?.createdBy
  ), [note, currentUser]);

  // Get list of users who already have access
  const usersWithAccess = React.useMemo(() => {
    if (!note) return [];
    
    const users = [];
    const permissions = note.permissions || {};
    
    // Add users with read permission
    normalizePermissionList(permissions.read).forEach(user => {
      if (!isSameUser(user, ownerUser)) {
        users.push(getAccessUser(user, 'read'));
      }
    });
    
    // Add users with write permission
    normalizePermissionList(permissions.write).forEach(user => {
      if (!isSameUser(user, ownerUser)) {
        users.push(getAccessUser(user, 'write'));
      }
    });
    
    // Add users with admin permission
    normalizePermissionList(permissions.admin).forEach(user => {
      if (!isSameUser(user, ownerUser)) {
        users.push(getAccessUser(user, 'admin'));
      }
    });
    
    return users;
  }, [note, ownerUser]);

  // Filter available users (exclude those who already have access)
  const availableUsers = React.useMemo(() => {
    const usersWithAccessIds = usersWithAccess.map(getUserId).filter(Boolean);
    return groupMembers.filter(member => 
      !usersWithAccessIds.includes(getUserId(member)) &&
      !isSameUser(member, ownerUser)
    );
  }, [groupMembers, usersWithAccess, ownerUser]);

  const handleShare = async () => {
    if (selectedUsers.length === 0) {
      setError('Please select at least one user to share with');
      return;
    }

    try {
      setError(null);
      const userIds = selectedUsers.map(getUserId).filter(Boolean);
      const noteId = getNoteId(note);

      if (!noteId) {
        setError('This note cannot be shared until it has a valid note ID.');
        return;
      }

      if (userIds.length !== selectedUsers.length) {
        setError('One or more selected users has an invalid user ID.');
        return;
      }
      
      if (onShare) {
        await onShare(noteId, userIds, permissionType);
      }
      
      // Reset form
      setSelectedUsers([]);
      setPermissionType('read');
    } catch (err) {
      setError('Failed to share note. Please try again.');
      console.error('Error sharing note:', err);
    }
  };

  const handleRemoveAccess = async (userId, permission) => {
    try {
      setError(null);
      const noteId = getNoteId(note);
      if (!noteId) {
        setError('This note cannot be updated until it has a valid note ID.');
        return;
      }

      if (!userId) {
        setError('This access entry is missing a valid user ID.');
        return;
      }

      if (isSameUser({ _id: userId }, ownerUser)) {
        setError('Owner access cannot be removed.');
        return;
      }

      if (onRemovePermission) {
        await onRemovePermission(noteId, userId, permission);
      }
    } catch (err) {
      setError('Failed to remove access. Please try again.');
      console.error('Error removing access:', err);
    }
  };

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareLink);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = shareLink;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      setError('Could not copy the link. Please copy it manually.');
    }
  };

  const getPermissionLabel = (permission) => {
    switch (permission) {
      case 'admin':
        return 'Admin';
      case 'write':
        return 'Can Edit';
      case 'read':
        return 'Can View';
      default:
        return permission;
    }
  };

  const getPermissionDescription = (permission) => {
    switch (permission) {
      case 'admin':
        return 'Can view, edit, and manage permissions';
      case 'write':
        return 'Can view and edit the note';
      case 'read':
        return 'Can only view the note';
      default:
        return '';
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">
            Share Note
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Note Info */}
        <Box mb={3}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Sharing: {note?.title || 'Untitled Note'}
          </Typography>
        </Box>

        {/* Share with Users */}
        <Box mb={3}>
          <Typography variant="subtitle1" gutterBottom>
            Add People
          </Typography>
          
          <Box display="flex" gap={1} mb={2}>
            <Autocomplete
              multiple
              options={availableUsers}
              getOptionLabel={(option) => getUserName(option)}
              getOptionKey={(option) => getUserId(option) || getUserEmail(option) || getUserName(option)}
              value={selectedUsers}
              onChange={(event, newValue) => setSelectedUsers(newValue)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Search users..."
                  size="small"
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <>
                        <InputAdornment position="start">
                          <SearchIcon />
                        </InputAdornment>
                        {params.InputProps.startAdornment}
                      </>
                    ),
                  }}
                />
              )}
              renderOption={(props, option) => {
                const { key, ...optionProps } = props;
                return (
                <li key={key} {...optionProps}>
                  <Avatar sx={{ mr: 1, width: 32, height: 32 }}>
                    {getUserInitial(option)}
                  </Avatar>
                  <Box>
                    <Typography variant="body2">
                      {getUserName(option)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {getUserEmail(option)}
                    </Typography>
                  </Box>
                </li>
                );
              }}
              sx={{ flexGrow: 1 }}
              loading={loading}
            />
            
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select
                value={permissionType}
                onChange={(e) => setPermissionType(e.target.value)}
              >
                <MenuItem value="read">Can View</MenuItem>
                <MenuItem value="write">Can Edit</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Button
            variant="contained"
            onClick={handleShare}
            disabled={selectedUsers.length === 0 || loading}
            fullWidth
          >
            {loading ? <CircularProgress size={24} /> : 'Share'}
          </Button>

          <Typography variant="caption" color="text.secondary" display="block" mt={1}>
            {getPermissionDescription(permissionType)}
          </Typography>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* People with Access */}
        <Box mb={3}>
          <Typography variant="subtitle1" gutterBottom>
            People with Access ({usersWithAccess.length + 1})
          </Typography>

          <List>
            {/* Note Creator */}
            <ListItem>
              <Avatar sx={{ mr: 2 }}>
                {getUserInitial(ownerUser)}
              </Avatar>
              <ListItemText
                primary={getUserName(ownerUser, 'Unknown')}
                secondary="Owner"
              />
              <ListItemSecondaryAction>
                <Chip label="Owner" size="small" color="primary" />
              </ListItemSecondaryAction>
            </ListItem>

            {/* Users with Access */}
            {usersWithAccess.map((user) => (
              <ListItem key={`${getUserId(user) || getUserEmail(user) || getUserName(user)}-${user.permission}`}>
                <Avatar sx={{ mr: 2 }}>
                  {getUserInitial(user)}
                </Avatar>
                <ListItemText
                  primary={getUserName(user)}
                  secondary={getUserEmail(user)}
                />
                <ListItemSecondaryAction>
                  <Box display="flex" alignItems="center" gap={1}>
                    <PermissionChip
                      label={getPermissionLabel(user.permission)}
                      size="small"
                      permissionType={user.permission}
                    />
                    <IconButton
                      edge="end"
                      onClick={() => handleRemoveAccess(getUserId(user), user.permission)}
                      size="small"
                      disabled={loading || !getUserId(user)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </ListItemSecondaryAction>
              </ListItem>
            ))}

            {usersWithAccess.length === 0 && (
              <ListItem>
                <ListItemText
                  secondary="No one else has access to this note"
                />
              </ListItem>
            )}
          </List>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Share Link */}
        <Box>
          <Typography variant="subtitle1" gutterBottom>
            Share Link
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            People with permission can use this link to open the note directly.
          </Typography>
          
          <Box display="flex" gap={1}>
            <TextField
              value={shareLink}
              size="small"
              fullWidth
              InputProps={{
                readOnly: true,
                startAdornment: (
                  <InputAdornment position="start">
                    <LinkIcon />
                  </InputAdornment>
                ),
              }}
            />
            <Button
              variant="outlined"
              onClick={handleCopyLink}
              startIcon={<CopyIcon />}
            >
              {linkCopied ? 'Copied!' : 'Copy'}
            </Button>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ShareNoteDialog;
