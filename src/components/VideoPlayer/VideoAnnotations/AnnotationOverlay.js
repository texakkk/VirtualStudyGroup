import React, { useState, useCallback, useRef } from 'react';
import {
  Box,
  IconButton,
  Tooltip,
  Typography,
  Chip,
} from '@mui/material';
import {
  Note,
  Highlight,
  HelpOutline,
  CheckCircle,
} from '@mui/icons-material';
import './AnnotationOverlay.css';

const AnnotationOverlay = ({
  annotations = [],
  currentTime,
  onAnnotationClick,
  onCreateAnnotation,
  isCreatingAnnotation,
  creationMode,
  videoWidth,
  videoHeight,
}) => {
  const [hoveredAnnotation, setHoveredAnnotation] = useState(null);
  const overlayRef = useRef(null);

  // Filter annotations visible at current time (within 5 seconds)
  const visibleAnnotations = annotations.filter(
    (ann) => Math.abs(ann.VideoAnnotation_timestamp - currentTime) <= 5
  );

  // Handle click on video to create annotation
  const handleOverlayClick = useCallback(
    (e) => {
      if (!isCreatingAnnotation || !overlayRef.current) return;

      const rect = overlayRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      onCreateAnnotation({
        position: { x, y },
        timestamp: currentTime,
      });
    },
    [isCreatingAnnotation, currentTime, onCreateAnnotation]
  );

  // Get icon for annotation type
  const getAnnotationIcon = (type) => {
    switch (type) {
      case 'note':
        return <Note fontSize="small" />;
      case 'highlight':
        return <Highlight fontSize="small" />;
      case 'question':
        return <HelpOutline fontSize="small" />;
      default:
        return <Note fontSize="small" />;
    }
  };

  // Get color for annotation type
  const getAnnotationColor = (type) => {
    switch (type) {
      case 'note':
        return '#2196f3';
      case 'highlight':
        return '#ff9800';
      case 'question':
        return '#f44336';
      default:
        return '#2196f3';
    }
  };

  return (
    <Box
      ref={overlayRef}
      className={`annotation-overlay ${isCreatingAnnotation ? 'creating' : ''}`}
      onClick={handleOverlayClick}
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: isCreatingAnnotation ? 'auto' : 'none',
        cursor: isCreatingAnnotation ? 'crosshair' : 'default',
        zIndex: 10,
      }}
    >
      {visibleAnnotations.map((annotation) => {
        const position = annotation.VideoAnnotation_position || { x: 50, y: 50 };
        const isHovered = hoveredAnnotation === annotation._id;

        return (
          <Box
            key={annotation._id}
            className="annotation-marker"
            sx={{
              position: 'absolute',
              left: `${position.x}%`,
              top: `${position.y}%`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'auto',
              zIndex: isHovered ? 20 : 15,
            }}
            onMouseEnter={() => setHoveredAnnotation(annotation._id)}
            onMouseLeave={() => setHoveredAnnotation(null)}
          >
            <Tooltip
              title={
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                    {annotation.VideoAnnotation_type.toUpperCase()}
                  </Typography>
                  <Typography variant="body2">
                    {annotation.VideoAnnotation_content}
                  </Typography>
                  <Typography variant="caption" sx={{ mt: 0.5, display: 'block' }}>
                    by {annotation.VideoAnnotation_userId?.User_name || 'Unknown'}
                  </Typography>
                </Box>
              }
              placement="top"
              arrow
            >
              <IconButton
                size="small"
                onClick={() => onAnnotationClick(annotation)}
                sx={{
                  backgroundColor: getAnnotationColor(annotation.VideoAnnotation_type),
                  color: 'white',
                  width: isHovered ? 40 : 32,
                  height: isHovered ? 40 : 32,
                  transition: 'all 0.2s',
                  '&:hover': {
                    backgroundColor: getAnnotationColor(annotation.VideoAnnotation_type),
                    opacity: 0.9,
                    transform: 'scale(1.1)',
                  },
                  boxShadow: isHovered ? 3 : 1,
                }}
              >
                {getAnnotationIcon(annotation.VideoAnnotation_type)}
                {annotation.VideoAnnotation_isResolved && (
                  <CheckCircle
                    sx={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      fontSize: 16,
                      color: '#4caf50',
                      backgroundColor: 'white',
                      borderRadius: '50%',
                    }}
                  />
                )}
              </IconButton>
            </Tooltip>

            {/* Pulse animation for new annotations */}
            {Date.now() - new Date(annotation.VideoAnnotation_createdAt).getTime() < 5000 && (
              <Box
                className="annotation-pulse"
                sx={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  border: `2px solid ${getAnnotationColor(annotation.VideoAnnotation_type)}`,
                  animation: 'pulse 2s infinite',
                }}
              />
            )}
          </Box>
        );
      })}

      {/* Creation mode indicator */}
      {isCreatingAnnotation && (
        <Box
          sx={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
          }}
        >
          <Chip
            label={`Click to add ${creationMode} annotation`}
            color="primary"
            sx={{
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              fontWeight: 'bold',
            }}
          />
        </Box>
      )}
    </Box>
  );
};

export default AnnotationOverlay;
