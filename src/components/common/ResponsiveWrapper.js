/**
 * ResponsiveWrapper Component
 * Task 19.1: Wrapper component for mobile-responsive layouts
 * 
 * Provides responsive container with mobile-optimized layouts
 */

import React from 'react';
import { Box } from '@mui/material';
import { useResponsive } from '../../hooks/useResponsive';
import '../styles/responsive.css';

/**
 * Responsive container component
 */
export const ResponsiveContainer = ({ 
  children, 
  maxWidth = 'xl',
  disableGutters = false,
  sx = {},
  ...props 
}) => {
  const { isMobile, isTablet } = useResponsive();

  const maxWidthMap = {
    xs: '444px',
    sm: '600px',
    md: '900px',
    lg: '1200px',
    xl: '1536px',
  };

  return (
    <Box
      className="container-responsive"
      sx={{
        maxWidth: maxWidthMap[maxWidth] || maxWidthMap.xl,
        px: disableGutters ? 0 : isMobile ? 2 : isTablet ? 3 : 4,
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  );
};

/**
 * Responsive grid component
 */
export const ResponsiveGrid = ({ 
  children, 
  columns = { mobile: 1, tablet: 2, desktop: 3 },
  gap = { mobile: 1, tablet: 2, desktop: 3 },
  sx = {},
  ...props 
}) => {
  const { isMobile, isTablet, isDesktop } = useResponsive();

  const getColumns = () => {
    if (isMobile) return columns.mobile || 1;
    if (isTablet) return columns.tablet || 2;
    if (isDesktop) return columns.desktop || 3;
    return 1;
  };

  const getGap = () => {
    if (isMobile) return gap.mobile || 1;
    if (isTablet) return gap.tablet || 2;
    if (isDesktop) return gap.desktop || 3;
    return 1;
  };

  return (
    <Box
      className="grid-responsive"
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${getColumns()}, 1fr)`,
        gap: getGap(),
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  );
};

/**
 * Responsive stack component (vertical or horizontal based on screen size)
 */
export const ResponsiveStack = ({ 
  children, 
  direction = { mobile: 'column', tablet: 'row', desktop: 'row' },
  spacing = { mobile: 1, tablet: 2, desktop: 2 },
  sx = {},
  ...props 
}) => {
  const { isMobile, isTablet, isDesktop } = useResponsive();

  const getDirection = () => {
    if (isMobile) return direction.mobile || 'column';
    if (isTablet) return direction.tablet || 'row';
    if (isDesktop) return direction.desktop || 'row';
    return 'column';
  };

  const getSpacing = () => {
    if (isMobile) return spacing.mobile || 1;
    if (isTablet) return spacing.tablet || 2;
    if (isDesktop) return spacing.desktop || 2;
    return 1;
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: getDirection(),
        gap: getSpacing(),
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  );
};

/**
 * Mobile-optimized card component
 */
export const ResponsiveCard = ({ 
  children, 
  elevation = 1,
  sx = {},
  ...props 
}) => {
  const { isMobile } = useResponsive();

  return (
    <Box
      sx={{
        backgroundColor: 'background.paper',
        borderRadius: isMobile ? 2 : 3,
        padding: isMobile ? 2 : 3,
        boxShadow: elevation > 0 ? `0 ${elevation}px ${elevation * 2}px rgba(0,0,0,0.1)` : 'none',
        border: '1px solid',
        borderColor: 'divider',
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  );
};

/**
 * Touch-friendly button wrapper
 */
export const TouchButton = ({ 
  children, 
  comfortable = false,
  sx = {},
  ...props 
}) => {
  const { isMobile } = useResponsive();

  return (
    <Box
      component="button"
      className={comfortable ? 'touch-target-comfortable' : 'touch-target'}
      sx={{
        minHeight: comfortable ? '48px' : '44px',
        minWidth: comfortable ? '48px' : '44px',
        padding: isMobile ? '12px' : '8px',
        cursor: 'pointer',
        border: 'none',
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  );
};

/**
 * Responsive modal/dialog wrapper
 */
export const ResponsiveModal = ({ 
  children, 
  open,
  onClose,
  fullScreenOnMobile = true,
  sx = {},
  ...props 
}) => {
  const { isMobile } = useResponsive();

  return (
    <Box
      className="modal-responsive"
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1300,
        display: open ? 'flex' : 'none',
        alignItems: isMobile && fullScreenOnMobile ? 'stretch' : 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        ...sx,
      }}
      onClick={onClose}
      {...props}
    >
      <Box
        onClick={(e) => e.stopPropagation()}
        sx={{
          backgroundColor: 'background.paper',
          borderRadius: isMobile && fullScreenOnMobile ? 0 : 2,
          width: isMobile && fullScreenOnMobile ? '100%' : 'auto',
          height: isMobile && fullScreenOnMobile ? '100%' : 'auto',
          maxWidth: isMobile && fullScreenOnMobile ? '100%' : '600px',
          maxHeight: isMobile && fullScreenOnMobile ? '100%' : '90vh',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

/**
 * Responsive show/hide component
 */
export const ShowOn = ({ 
  mobile = false,
  tablet = false,
  desktop = false,
  children 
}) => {
  const { isMobile, isTablet, isDesktop } = useResponsive();

  const shouldShow = (
    (mobile && isMobile) ||
    (tablet && isTablet) ||
    (desktop && isDesktop)
  );

  if (!shouldShow) return null;

  return <>{children}</>;
};

/**
 * Responsive hide component
 */
export const HideOn = ({ 
  mobile = false,
  tablet = false,
  desktop = false,
  children 
}) => {
  const { isMobile, isTablet, isDesktop } = useResponsive();

  const shouldHide = (
    (mobile && isMobile) ||
    (tablet && isTablet) ||
    (desktop && isDesktop)
  );

  if (shouldHide) return null;

  return <>{children}</>;
};

/**
 * Responsive text component with adaptive sizing
 */
export const ResponsiveText = ({ 
  children,
  variant = 'body1',
  mobileVariant,
  tabletVariant,
  sx = {},
  ...props
}) => {
  const { isMobile, isTablet } = useResponsive();

  const getVariant = () => {
    if (isMobile && mobileVariant) return mobileVariant;
    if (isTablet && tabletVariant) return tabletVariant;
    return variant;
  };

  const fontSizeMap = {
    h1: { mobile: '2rem', tablet: '2.5rem', desktop: '3rem' },
    h2: { mobile: '1.75rem', tablet: '2rem', desktop: '2.5rem' },
    h3: { mobile: '1.5rem', tablet: '1.75rem', desktop: '2rem' },
    h4: { mobile: '1.25rem', tablet: '1.5rem', desktop: '1.75rem' },
    h5: { mobile: '1.125rem', tablet: '1.25rem', desktop: '1.5rem' },
    h6: { mobile: '1rem', tablet: '1.125rem', desktop: '1.25rem' },
    body1: { mobile: '0.875rem', tablet: '1rem', desktop: '1rem' },
    body2: { mobile: '0.8125rem', tablet: '0.875rem', desktop: '0.875rem' },
    caption: { mobile: '0.75rem', tablet: '0.75rem', desktop: '0.75rem' },
  };

  const currentVariant = getVariant();
  const fontSize = fontSizeMap[currentVariant];

  return (
    <Box
      component="span"
      sx={{
        fontSize: isMobile ? fontSize?.mobile : isTablet ? fontSize?.tablet : fontSize?.desktop,
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  );
};

/**
 * Swipeable container component
 */
export const SwipeableContainer = ({ 
  children,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  threshold = 50,
  sx = {},
  ...props
}) => {
  const [touchStart, setTouchStart] = React.useState(null);
  const [touchEnd, setTouchEnd] = React.useState(null);

  const minSwipeDistance = threshold;

  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    });
  };

  const onTouchMove = (e) => {
    setTouchEnd({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    });
  };

  const onTouchEndHandler = () => {
    if (!touchStart || !touchEnd) return;

    const distanceX = touchStart.x - touchEnd.x;
    const distanceY = touchStart.y - touchEnd.y;
    const isHorizontalSwipe = Math.abs(distanceX) > Math.abs(distanceY);

    if (isHorizontalSwipe) {
      if (distanceX > minSwipeDistance && onSwipeLeft) {
        onSwipeLeft();
      } else if (distanceX < -minSwipeDistance && onSwipeRight) {
        onSwipeRight();
      }
    } else {
      if (distanceY > minSwipeDistance && onSwipeUp) {
        onSwipeUp();
      } else if (distanceY < -minSwipeDistance && onSwipeDown) {
        onSwipeDown();
      }
    }
  };

  return (
    <Box
      className="swipeable"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEndHandler}
      sx={{
        touchAction: 'pan-y',
        userSelect: 'none',
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  );
};

export default ResponsiveWrapper;
