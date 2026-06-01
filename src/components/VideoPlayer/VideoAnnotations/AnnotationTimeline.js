import React, { useMemo } from 'react';
import {
  Box,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Note,
  Highlight,
  HelpOutline,
} from '@mui/icons-material';
import './AnnotationTimeline.css';

const AnnotationTimeline = ({
  annotations = [],
  duration,
  currentTime,
  onSeek,
}) => {
  // Group annotations by timestamp for better visualization
  const annotationMarkers = useMemo(() => {
    if (!duration || duration === 0) return [];

    return annotations.map((annotation) => {
      const position = (annotation.VideoAnnotation_timestamp / duration) * 100;
      return {
        ...annotation,
        position: Math.min(Math.max(position, 0), 100),
      };
    });
  }, [annotations, duration]);

  // Get icon for annotation type
  const getAnnotationIcon = (type) => {
    switch (type) {
      case 'note':
        return <Note sx={{ fontSize: 12 }} />;
      case 'highlight':
        return <Highlight sx={{ fontSize: 12 }} />;
      case 'question':
        return <HelpOutline sx={{ fontSize: 12 }} />;
      default:
        return <Note sx={{ fontSize: 12 }} />;
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

  // Format time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMarkerClick = (timestamp) => {
    if (onSeek) {
      onSeek(timestamp);
    }
  };

  return (
    <Box className="annotation-timeline" sx={{ position: 'relative', width: '100%', height: 24, mt: 1 }}>
      {/* Timeline track */}
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: 0,
          right: 0,
          height: 4,
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          borderRadius: 2,
          transform: 'translateY(-50%)',
        }}
      />

      {/* Annotation markers */}
      {annotationMarkers.map((annotation, index) => (
        <Tooltip
          key={annotation._id || index}
          title={
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block' }}>
                {annotation.VideoAnnotation_type.toUpperCase()} - {formatTime(annotation.VideoAnnotation_timestamp)}
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {annotation.VideoAnnotation_content.length > 100
                  ? `${annotation.VideoAnnotation_content.substring(0, 100)}...`
                  : annotation.VideoAnnotation_content}
              </Typography>
              <Typography variant="caption" sx={{ mt: 0.5, display: 'block', opacity: 0.8 }}>
                by {annotation.VideoAnnotation_userId?.User_name || 'Unknown'}
              </Typography>
            </Box>
          }
          placement="top"
          arrow
        >
          <Box
            className="annotation-timeline-marker"
            onClick={() => handleMarkerClick(annotation.VideoAnnotation_timestamp)}
            sx={{
              position: 'absolute',
              left: `${annotation.position}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 20,
              height: 20,
              borderRadius: '50%',
              backgroundColor: getAnnotationColor(annotation.VideoAnnotation_type),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              cursor: 'pointer',
              transition: 'all 0.2s',
              border: '2px solid white',
              boxShadow: 1,
              zIndex: 5,
              '&:hover': {
                transform: 'translate(-50%, -50%) scale(1.3)',
                zIndex: 10,
                boxShadow: 3,
              },
            }}
          >
            {getAnnotationIcon(annotation.VideoAnnotation_type)}
          </Box>
        </Tooltip>
      ))}

      {/* Current time indicator */}
      {duration > 0 && (
        <Box
          sx={{
            position: 'absolute',
            left: `${(currentTime / duration) * 100}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 2,
            height: 24,
            backgroundColor: 'primary.main',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />
      )}
    </Box>
  );
};

export default AnnotationTimeline;
