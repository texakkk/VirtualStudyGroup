import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, IconButton, Tooltip, ToggleButtonGroup, ToggleButton, Snackbar, Alert } from '@mui/material';
import {
  Note,
  Highlight,
  HelpOutline,
  List as ListIcon,
  Timeline as TimelineIcon,
} from '@mui/icons-material';
import { io } from 'socket.io-client';
import api from '../../../api';
import { getSocketUrl } from '../../../config/socketConfig';
import AnnotationOverlay from './AnnotationOverlay';
import AnnotationCreationTools from './AnnotationCreationTools';
import AnnotationTimeline from './AnnotationTimeline';
import AnnotationManagement from './AnnotationManagement';
import './VideoAnnotations.css';

const VideoAnnotations = ({
  sessionId,
  currentTime,
  duration,
  onSeek,
  videoWidth,
  videoHeight,
}) => {
  const normalizeId = (id) => {
    if (!id) return '';
    if (typeof id === 'string') return id;
    if (typeof id === 'object') {
      if (typeof id._id === 'string') return id._id;
      if (typeof id.$oid === 'string') return id.$oid;
      if (typeof id.toString === 'function') {
        const value = id.toString();
        return value === '[object Object]' ? '' : value;
      }
    }
    return String(id);
  };
  const normalizedSessionId = normalizeId(sessionId);

  const [annotations, setAnnotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCreatingAnnotation, setIsCreatingAnnotation] = useState(false);
  const [creationMode, setCreationMode] = useState('note');
  const [showCreationDialog, setShowCreationDialog] = useState(false);
  const [creationPosition, setCreationPosition] = useState(null);
  const [creationTimestamp, setCreationTimestamp] = useState(0);
  const [showManagement, setShowManagement] = useState(false);
  const [showTimeline, setShowTimeline] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const socketRef = useRef(null);
  const currentUserId = localStorage.getItem('userId');

  // Show snackbar
  const showSnackbarMessage = useCallback((message, severity = 'success') => {
    setSnackbar({ open: true, message, severity });
  }, []);

  // Load annotations
  const loadAnnotations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      if (!normalizedSessionId) {
        setAnnotations([]);
        return;
      }
      const response = await api.get(`/video-annotations/session/${normalizedSessionId}`);
      if (response.data.success) {
        setAnnotations(response.data.annotations || []);
      }
    } catch (err) {
      console.error('Failed to load annotations:', err);
      setError('Failed to load annotations');
      showSnackbarMessage('Failed to load annotations', 'error');
    } finally {
      setLoading(false);
    }
  }, [normalizedSessionId, showSnackbarMessage]);

  // Socket event handlers
  const handleAnnotationCreated = useCallback((data) => {
    console.log('Annotation created:', data);
    setAnnotations((prev) => [...prev, data.annotation]);
    showSnackbarMessage('Annotation created', 'success');
  }, [showSnackbarMessage]);

  const handleAnnotationUpdated = useCallback((data) => {
    console.log('Annotation updated:', data);
    setAnnotations((prev) =>
      prev.map((ann) => (ann._id === data.annotation._id ? data.annotation : ann))
    );
    showSnackbarMessage('Annotation updated', 'info');
  }, [showSnackbarMessage]);

  const handleAnnotationDeleted = useCallback((data) => {
    console.log('Annotation deleted:', data);
    setAnnotations((prev) => prev.filter((ann) => ann._id !== data.annotationId));
    showSnackbarMessage('Annotation deleted', 'info');
  }, [showSnackbarMessage]);

  const handleAnnotationReplied = useCallback((data) => {
    console.log('Annotation reply:', data);
    setAnnotations((prev) =>
      prev.map((ann) =>
        ann._id === data.annotationId
          ? { ...ann, VideoAnnotation_replies: [...(ann.VideoAnnotation_replies || []), data.reply] }
          : ann
      )
    );
    showSnackbarMessage('Reply added', 'success');
  }, [showSnackbarMessage]);

  const handleAnnotationResolved = useCallback((data) => {
    console.log('Annotation resolved:', data);
    setAnnotations((prev) =>
      prev.map((ann) =>
        ann._id === data.annotationId
          ? { ...ann, VideoAnnotation_isResolved: data.isResolved }
          : ann
      )
    );
    showSnackbarMessage(
      data.isResolved ? 'Annotation resolved' : 'Annotation unresolved',
      'info'
    );
  }, [showSnackbarMessage]);

  // Initialize socket connection for real-time updates
  useEffect(() => {
    const token = localStorage.getItem('token');

    socketRef.current = io(getSocketUrl('media-sessions'), {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current.on('connect', () => {
      console.log('Connected to media sessions socket for annotations');
    });

    socketRef.current.on('annotationCreated', handleAnnotationCreated);
    socketRef.current.on('annotationUpdated', handleAnnotationUpdated);
    socketRef.current.on('annotationDeleted', handleAnnotationDeleted);
    socketRef.current.on('annotationReply', handleAnnotationReplied);
    socketRef.current.on('annotationResolved', handleAnnotationResolved);

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [handleAnnotationCreated, handleAnnotationUpdated, handleAnnotationDeleted, handleAnnotationReplied, handleAnnotationResolved]);

  // Load annotations on mount
  useEffect(() => {
    if (normalizedSessionId) {
      loadAnnotations();
    }
  }, [normalizedSessionId, loadAnnotations]);

  // Handle annotation creation
  const handleStartCreation = (mode) => {
    setCreationMode(mode);
    setIsCreatingAnnotation(true);
  };

  const handleCreateAnnotation = (data) => {
    setCreationPosition(data.position);
    setCreationTimestamp(data.timestamp);
    setShowCreationDialog(true);
    setIsCreatingAnnotation(false);
  };

  const handleSubmitAnnotation = async (annotationData) => {
    try {
      const response = await api.post('/video-annotations', {
        sessionId: normalizedSessionId,
        timestamp: annotationData.timestamp,
        type: annotationData.type,
        content: annotationData.content,
        position: annotationData.position,
      });

      if (response.data.success) {
        // Socket will handle adding to list via real-time event
        setShowCreationDialog(false);
        setCreationPosition(null);
        setCreationTimestamp(0);
        showSnackbarMessage('Annotation created successfully', 'success');
      }
    } catch (err) {
      console.error('Failed to create annotation:', err);
      showSnackbarMessage(
        err.response?.data?.message || 'Failed to create annotation',
        'error'
      );
      throw err;
    }
  };

  // Handle annotation click
  const handleAnnotationClick = () => {
    setShowManagement(true);
  };

  // Handle annotation edit
  const handleEditAnnotation = async (annotationId, content) => {
    try {
      const response = await api.put(`/video-annotations/${annotationId}`, {
        content,
      });

      if (response.data.success) {
        // Socket will handle update via real-time event
        showSnackbarMessage('Annotation updated successfully', 'success');
      }
    } catch (err) {
      console.error('Failed to edit annotation:', err);
      showSnackbarMessage(
        err.response?.data?.message || 'Failed to edit annotation',
        'error'
      );
      throw err;
    }
  };

  // Handle annotation delete
  const handleDeleteAnnotation = async (annotationId) => {
    try {
      const response = await api.delete(`/video-annotations/${annotationId}`);

      if (response.data.success) {
        // Socket will handle removal via real-time event
        showSnackbarMessage('Annotation deleted successfully', 'success');
      }
    } catch (err) {
      console.error('Failed to delete annotation:', err);
      showSnackbarMessage(
        err.response?.data?.message || 'Failed to delete annotation',
        'error'
      );
      throw err;
    }
  };

  // Handle annotation reply
  const handleReplyAnnotation = async (annotationId, content) => {
    try {
      const response = await api.post(`/video-annotations/${annotationId}/reply`, {
        content,
      });

      if (response.data.success) {
        // Socket will handle update via real-time event
        showSnackbarMessage('Reply added successfully', 'success');
      }
    } catch (err) {
      console.error('Failed to add reply:', err);
      showSnackbarMessage(
        err.response?.data?.message || 'Failed to add reply',
        'error'
      );
      throw err;
    }
  };

  // Handle annotation resolve
  const handleResolveAnnotation = async (annotationId) => {
    try {
      const response = await api.post(`/video-annotations/${annotationId}/resolve`);

      if (response.data.success) {
        // Socket will handle update via real-time event
        showSnackbarMessage('Annotation status updated', 'success');
      }
    } catch (err) {
      console.error('Failed to toggle resolve:', err);
      showSnackbarMessage(
        err.response?.data?.message || 'Failed to update annotation',
        'error'
      );
      throw err;
    }
  };

  return (
    <Box className="video-annotations-container">
      {/* Loading State */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
          <Alert severity="info">Loading annotations...</Alert>
        </Box>
      )}

      {/* Error State */}
      {error && (
        <Box sx={{ p: 1 }}>
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        </Box>
      )}

      {/* Annotation Controls */}
      <Box className="annotation-controls" sx={{ display: 'flex', gap: 1, mb: 1 }}>
        <ToggleButtonGroup size="small" exclusive>
          <ToggleButton
            value="note"
            selected={isCreatingAnnotation && creationMode === 'note'}
            onClick={() => handleStartCreation('note')}
          >
            <Tooltip title="Add Note">
              <Note fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton
            value="highlight"
            selected={isCreatingAnnotation && creationMode === 'highlight'}
            onClick={() => handleStartCreation('highlight')}
          >
            <Tooltip title="Add Highlight">
              <Highlight fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton
            value="question"
            selected={isCreatingAnnotation && creationMode === 'question'}
            onClick={() => handleStartCreation('question')}
          >
            <Tooltip title="Add Question">
              <HelpOutline fontSize="small" />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ flexGrow: 1 }} />

        <Tooltip title="Toggle Timeline">
          <IconButton
            size="small"
            color={showTimeline ? 'primary' : 'default'}
            onClick={() => setShowTimeline(!showTimeline)}
          >
            <TimelineIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip title="Manage Annotations">
          <IconButton
            size="small"
            color={showManagement ? 'primary' : 'default'}
            onClick={() => setShowManagement(!showManagement)}
          >
            <ListIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Annotation Timeline */}
      {showTimeline && (
        <AnnotationTimeline
          annotations={annotations}
          duration={duration}
          currentTime={currentTime}
          onSeek={onSeek}
        />
      )}

      {/* Annotation Overlay */}
      <AnnotationOverlay
        annotations={annotations}
        currentTime={currentTime}
        onAnnotationClick={handleAnnotationClick}
        onCreateAnnotation={handleCreateAnnotation}
        isCreatingAnnotation={isCreatingAnnotation}
        creationMode={creationMode}
        videoWidth={videoWidth}
        videoHeight={videoHeight}
      />

      {/* Annotation Creation Dialog */}
      <AnnotationCreationTools
        isOpen={showCreationDialog}
        onClose={() => {
          setShowCreationDialog(false);
          setCreationPosition(null);
          setCreationTimestamp(0);
        }}
        onSubmit={handleSubmitAnnotation}
        initialType={creationMode}
        initialPosition={creationPosition}
        initialTimestamp={creationTimestamp}
      />

      {/* Annotation Management Panel */}
      <AnnotationManagement
        annotations={annotations}
        currentUserId={currentUserId}
        onEdit={handleEditAnnotation}
        onDelete={handleDeleteAnnotation}
        onReply={handleReplyAnnotation}
        onResolve={handleResolveAnnotation}
        onSeek={onSeek}
        isOpen={showManagement}
        onClose={() => setShowManagement(false)}
      />

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default VideoAnnotations;
