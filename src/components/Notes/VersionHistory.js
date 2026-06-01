import React, { useState, useMemo, useEffect, useCallback, useContext } from 'react';
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Divider,
  Alert,
  Tooltip,
  Grid,
  CircularProgress,
} from '@mui/material';
import {
  Restore as RestoreIcon,
  Visibility as ViewIcon,
  Compare as CompareIcon,
  Schedule as TimeIcon,
  Person as PersonIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { notesApi, transformNoteData, transformVersionData } from '../../services/notesApi';
import AuthContext from '../../contexts/AuthContext';
import { ensureStringId } from '../../utils/objectId';

const VersionItem = styled(ListItem, {
  shouldForwardProp: (prop) => prop !== 'isSelected',
})(({ theme, isSelected }) => ({
  border: `1px solid ${isSelected ? theme.palette.primary.main : theme.palette.divider}`,
  borderRadius: theme.shape.borderRadius,
  marginBottom: theme.spacing(1),
  backgroundColor: isSelected ? theme.palette.primary.light + '20' : theme.palette.background.paper,
  cursor: 'pointer',
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
}));

const DiffContainer = styled(Box)(({ theme }) => ({
  fontFamily: 'monospace',
  fontSize: '0.875rem',
  '& .diff-added': {
    backgroundColor: theme.palette.success.light + '40',
    color: theme.palette.success.dark,
    padding: '2px 4px',
    borderRadius: '2px',
  },
  '& .diff-removed': {
    backgroundColor: theme.palette.error.light + '40',
    color: theme.palette.error.dark,
    padding: '2px 4px',
    borderRadius: '2px',
    textDecoration: 'line-through',
  },
  '& .diff-unchanged': {
    color: theme.palette.text.primary,
  },
}));

const UNKNOWN_AUTHOR = 'Unknown';

const getUserId = (user) => {
  if (!user) return '';
  const rawId = typeof user === 'string'
    ? user
    : user._id || user.id || user.User_id || user.userId || null;
  return ensureStringId(rawId) || '';
};

const isObjectIdString = (value) => (
  typeof value === 'string' && /^[a-f\d]{24}$/i.test(value)
);

const isUsableDisplayText = (value) => (
  typeof value === 'string' &&
  value.trim() &&
  !isObjectIdString(value.trim()) &&
  value !== UNKNOWN_AUTHOR &&
  value !== '[object Object]' &&
  value !== '[Circular Reference]'
);

const getUserDisplayName = (user) => {
  if (!user || user === UNKNOWN_AUTHOR) return '';

  if (typeof user === 'string') {
    return isUsableDisplayText(user) ? user.trim() : '';
  }

  const displayFields = [
    user.User_name,
    user.name,
    user.username,
    user.displayName,
    user.User_email,
    user.email,
  ];

  return displayFields.find(isUsableDisplayText)?.trim() || '';
};

const getVersionNumber = (version) => {
  const rawVersion = version?.version ?? version?.NoteVersion_version ?? version?.Note_version;
  const versionNumber = Number(rawVersion);
  return Number.isInteger(versionNumber) && versionNumber >= 1 ? versionNumber : null;
};

const VersionHistory = ({
  noteId,
  currentVersion,
  onRestoreVersion,
  onViewVersion,
}) => {
  const { currentUser } = useContext(AuthContext);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedVersions, setSelectedVersions] = useState([]);
  const [viewDialog, setViewDialog] = useState({ open: false, version: null });
  const [compareDialog, setCompareDialog] = useState({ open: false, versions: [] });
  const [restoreDialog, setRestoreDialog] = useState({ open: false, version: null });

  const getVersionAuthorName = useCallback((version, transformedVersion) => {
    const currentUserId = getUserId(currentUser);
    const candidateUsers = [
      transformedVersion?.createdBy,
      version?.NoteVersion_createdBy,
      version?.createdBy,
      version?.NoteVersion_updatedBy,
      version?.updatedBy,
      currentVersion?.createdBy,
    ];

    const matchingUser = candidateUsers.find((candidate) => (
      currentUserId && getUserId(candidate) === currentUserId
    ));

    return (
      getUserDisplayName(matchingUser) ||
      candidateUsers.map(getUserDisplayName).find(Boolean) ||
      getUserDisplayName(currentUser) ||
      UNKNOWN_AUTHOR
    );
  }, [currentUser, currentVersion]);

  // Load version history when component mounts or noteId changes
  const loadVersionHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await notesApi.getVersionHistory(noteId, {
        page: 1,
        limit: 50,
      });
      
      if (result.success) {
        const transformedVersions = result.data.map((version, index) => {
          const transformedVersion = transformVersionData(version);
          const versionIdentity = (
            transformedVersion?.id ||
            transformedVersion?._id ||
            transformedVersion?.version ||
            version?.id ||
            version?._id ||
            version?.version ||
            `${transformedVersion?.title || version?.title || 'untitled'}-${transformedVersion?.createdAt || version?.createdAt || 'unknown'}-${index}`
          );

          return {
            ...transformedVersion,
            _historyKey: String(versionIdentity),
            version: getVersionNumber(transformedVersion) ?? getVersionNumber(version),
            title: transformedVersion?.title || currentVersion?.title || '',
            content: transformedVersion?.content || currentVersion?.content || '',
            createdAt: transformedVersion?.createdAt || currentVersion?.updatedAt || currentVersion?.createdAt || null,
            createdBy: getVersionAuthorName(version, transformedVersion),
          };
        });
        setVersions(transformedVersions);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to load version history');
      console.error('Error loading version history:', err);
    } finally {
      setLoading(false);
    }
  }, [noteId, currentVersion, getVersionAuthorName]);

  useEffect(() => {
    if (noteId) {
      loadVersionHistory();
    }
  }, [noteId, loadVersionHistory]);

  // Sort versions by date (newest first)
  const sortedVersions = useMemo(() => {
    return [...versions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [versions]);

  const getVersionIdentity = (version) => (
    version?._historyKey ||
    version?.id ||
    version?._id ||
    version?.version ||
    `${version?.title || 'untitled'}-${version?.createdAt || 'unknown'}`
  );

  const handleVersionSelect = (version) => {
    const versionId = getVersionIdentity(version);

    if (selectedVersions.length === 0) {
      setSelectedVersions([version]);
    } else if (selectedVersions.length === 1) {
      if (getVersionIdentity(selectedVersions[0]) === versionId) {
        setSelectedVersions([]);
      } else {
        setSelectedVersions([selectedVersions[0], version]);
      }
    } else {
      setSelectedVersions([version]);
    }
  };

  const handleViewVersion = (version) => {
    onViewVersion?.(version);
    setViewDialog({ open: true, version });
  };

  const handleCompareVersions = () => {
    if (selectedVersions.length === 2) {
      setCompareDialog({ open: true, versions: selectedVersions });
    }
  };

  const handleRestoreVersion = (version) => {
    setRestoreDialog({ open: true, version });
  };

  const confirmRestore = async () => {
    if (restoreDialog.version) {
      try {
        const versionNumber = getVersionNumber(restoreDialog.version);
        if (!versionNumber) {
          setError('Cannot restore this version because its version number is missing.');
          setRestoreDialog({ open: false, version: null });
          return;
        }

        const result = await notesApi.rollbackToVersion(noteId, versionNumber);
        if (result.success && onRestoreVersion) {
          onRestoreVersion(transformNoteData(result.data), restoreDialog.version);
          // Reload version history to show the new version created by rollback
          loadVersionHistory();
        } else {
          setError(result.error || 'Failed to restore version');
        }
      } catch (err) {
        setError('Failed to restore version');
        console.error('Error restoring version:', err);
      }
    }
    setRestoreDialog({ open: false, version: null });
  };

  const generateDiff = (oldContent, newContent) => {
    // Simple diff implementation - in a real app, use a library like diff
    const oldWords = (oldContent || '').replace(/<[^>]*>/g, '').split(/\s+/);
    const newWords = (newContent || '').replace(/<[^>]*>/g, '').split(/\s+/);
    
    const diff = [];
    let oldIndex = 0;
    let newIndex = 0;

    while (oldIndex < oldWords.length || newIndex < newWords.length) {
      if (oldIndex >= oldWords.length) {
        // Only new words left
        diff.push({ type: 'added', text: newWords[newIndex] });
        newIndex++;
      } else if (newIndex >= newWords.length) {
        // Only old words left
        diff.push({ type: 'removed', text: oldWords[oldIndex] });
        oldIndex++;
      } else if (oldWords[oldIndex] === newWords[newIndex]) {
        // Words match
        diff.push({ type: 'unchanged', text: oldWords[oldIndex] });
        oldIndex++;
        newIndex++;
      } else {
        // Words differ - simple heuristic
        diff.push({ type: 'removed', text: oldWords[oldIndex] });
        diff.push({ type: 'added', text: newWords[newIndex] });
        oldIndex++;
        newIndex++;
      }
    }

    return diff;
  };

  const renderDiff = (diff) => {
    return diff.map((item, index) => (
      <span key={index} className={`diff-${item.type}`}>
        {item.text}{' '}
      </span>
    ));
  };

  const formatVersionDate = (dateString) => {
    if (!dateString) {
      return {
        relative: 'Unknown date',
        absolute: 'Unknown date',
      };
    }

    const date = parseISO(dateString);
    if (isNaN(date.getTime())) {
      return {
        relative: 'Unknown date',
        absolute: 'Unknown date',
      };
    }

    return {
      relative: formatDistanceToNow(date, { addSuffix: true }),
      absolute: format(date, 'PPpp'),
    };
  };

  const getVersionLabel = (version, index) => {
    const versionNumber = getVersionNumber(version);
    if (versionNumber && versionNumber === getVersionNumber(currentVersion)) {
      return 'Current';
    }
    if (index === 0) {
      return 'Latest';
    }
    return versionNumber ? `Version ${versionNumber}` : `Version ${versions.length - index}`;
  };

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
      </Alert>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" p={4}>
        <CircularProgress />
        <Typography variant="body2" sx={{ ml: 2 }}>
          Loading version history...
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Paper sx={{ p: 2 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">
            Version History ({versions.length} versions)
          </Typography>
          <Box display="flex" gap={1}>
            {selectedVersions.length === 2 && (
              <Button
                variant="outlined"
                startIcon={<CompareIcon />}
                onClick={handleCompareVersions}
                size="small"
              >
                Compare Selected
              </Button>
            )}
            {selectedVersions.length > 0 && (
              <Button
                variant="text"
                onClick={() => setSelectedVersions([])}
                size="small"
              >
                Clear Selection
              </Button>
            )}
          </Box>
        </Box>

        {selectedVersions.length > 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {selectedVersions.length === 1 
              ? 'Select another version to compare, or click the same version to deselect.'
              : 'Two versions selected. Click "Compare Selected" to see differences.'
            }
          </Alert>
        )}

        <List>
          {sortedVersions.map((version, index) => {
            const versionId = getVersionIdentity(version);
            const isSelected = selectedVersions.some(v => getVersionIdentity(v) === versionId);
            const versionNumber = getVersionNumber(version);
            const isCurrent = versionNumber && versionNumber === getVersionNumber(currentVersion);
            const dateInfo = formatVersionDate(version.createdAt);

            return (
              <VersionItem
                key={versionId}
                isSelected={isSelected}
                onClick={() => handleVersionSelect(version)}
              >
                <ListItemText
                  disableTypography
                  primary={
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography variant="body1">
                        {version.title || 'Untitled'}
                      </Typography>
                      <Chip
                        size="small"
                        label={getVersionLabel(version, index)}
                        color={isCurrent ? 'primary' : 'default'}
                        variant={isCurrent ? 'filled' : 'outlined'}
                      />
                    </Box>
                  }
                  secondary={
                    <Box>
                      <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                        <TimeIcon fontSize="small" />
                        <Typography variant="caption">
                          {dateInfo.relative}
                        </Typography>
                        <PersonIcon fontSize="small" sx={{ ml: 1 }} />
                        <Typography variant="caption">
                          {version.createdBy || 'Unknown'}
                        </Typography>
                      </Box>
                      {version.changes && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {version.changes}
                        </Typography>
                      )}
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <Box display="flex" alignItems="center">
                    <Tooltip title="View this version">
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewVersion(version);
                        }}
                        size="small"
                      >
                        <ViewIcon />
                      </IconButton>
                    </Tooltip>
                    {!isCurrent && versionNumber && (
                      <Tooltip title="Restore this version">
                        <IconButton
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRestoreVersion(version);
                          }}
                          size="small"
                        >
                          <RestoreIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </ListItemSecondaryAction>
              </VersionItem>
            );
          })}
        </List>

        {versions.length === 0 && (
          <Box textAlign="center" py={4}>
            <Typography variant="body2" color="text.secondary">
              No version history available
            </Typography>
          </Box>
        )}
      </Paper>

      {/* View Version Dialog */}
      <Dialog
        open={viewDialog.open}
        onClose={() => setViewDialog({ open: false, version: null })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">
              View Version: {viewDialog.version?.title || 'Untitled'}
            </Typography>
            <IconButton
              onClick={() => setViewDialog({ open: false, version: null })}
              size="small"
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {viewDialog.version && (
            <Box>
              <Typography variant="caption" color="text.secondary" paragraph>
                Created {formatVersionDate(viewDialog.version.createdAt).absolute} by {viewDialog.version.createdBy || 'Unknown'}
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Box
                dangerouslySetInnerHTML={{ __html: viewDialog.version.content }}
                sx={{
                  '& img': { maxWidth: '100%', height: 'auto' },
                  '& p': { mb: 1 },
                  '& h1, & h2, & h3': { mt: 2, mb: 1 },
                }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialog({ open: false, version: null })}>
            Close
          </Button>
          {viewDialog.version && getVersionNumber(viewDialog.version) && getVersionNumber(viewDialog.version) !== getVersionNumber(currentVersion) && (
            <Button
              onClick={() => {
                handleRestoreVersion(viewDialog.version);
                setViewDialog({ open: false, version: null });
              }}
              variant="contained"
            >
              Restore This Version
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Compare Versions Dialog */}
      <Dialog
        open={compareDialog.open}
        onClose={() => setCompareDialog({ open: false, versions: [] })}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          Compare Versions
        </DialogTitle>
        <DialogContent dividers>
          {compareDialog.versions.length === 2 && (
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <Typography variant="h6" gutterBottom>
                  {compareDialog.versions[0].title || 'Untitled'}
                </Typography>
                <Typography variant="caption" color="text.secondary" paragraph>
                  {formatVersionDate(compareDialog.versions[0].createdAt).absolute}
                </Typography>
                <Box
                  dangerouslySetInnerHTML={{ __html: compareDialog.versions[0].content }}
                  sx={{
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    p: 2,
                    maxHeight: '400px',
                    overflow: 'auto',
                  }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography variant="h6" gutterBottom>
                  {compareDialog.versions[1].title || 'Untitled'}
                </Typography>
                <Typography variant="caption" color="text.secondary" paragraph>
                  {formatVersionDate(compareDialog.versions[1].createdAt).absolute}
                </Typography>
                <Box
                  dangerouslySetInnerHTML={{ __html: compareDialog.versions[1].content }}
                  sx={{
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    p: 2,
                    maxHeight: '400px',
                    overflow: 'auto',
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Divider sx={{ my: 2 }} />
                <Typography variant="h6" gutterBottom>
                  Differences
                </Typography>
                <DiffContainer
                  sx={{
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    p: 2,
                    maxHeight: '200px',
                    overflow: 'auto',
                  }}
                >
                  {renderDiff(generateDiff(
                    compareDialog.versions[0].content,
                    compareDialog.versions[1].content
                  ))}
                </DiffContainer>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompareDialog({ open: false, versions: [] })}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <Dialog
        open={restoreDialog.open}
        onClose={() => setRestoreDialog({ open: false, version: null })}
      >
        <DialogTitle>Restore Version</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to restore to this version? This will create a new version 
            with the content from "{restoreDialog.version?.title || 'Untitled'}" 
            created {restoreDialog.version && formatVersionDate(restoreDialog.version.createdAt).relative}.
          </Typography>
          <Alert severity="info" sx={{ mt: 2 }}>
            Your current version will be preserved in the version history.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestoreDialog({ open: false, version: null })}>
            Cancel
          </Button>
          <Button onClick={confirmRestore} variant="contained">
            Restore Version
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default VersionHistory;
