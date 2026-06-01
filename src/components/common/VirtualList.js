import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';

/**
 * VirtualList - A high-performance virtual scrolling component for large lists
 * Only renders visible items plus a buffer, dramatically improving performance
 * 
 * @param {Array} items - Array of items to render
 * @param {Function} renderItem - Function to render each item (item, index) => ReactNode
 * @param {Number} itemHeight - Height of each item in pixels
 * @param {Number} containerHeight - Height of the scrollable container
 * @param {Number} overscan - Number of items to render outside visible area (default: 3)
 */
const VirtualList = ({ 
  items = [], 
  renderItem, 
  itemHeight = 50, 
  containerHeight = 600,
  overscan = 3,
  className = '',
  emptyMessage = 'No items to display'
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef(null);

  // Calculate visible range
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );

  // Calculate total height and offset
  const totalHeight = items.length * itemHeight;
  const offsetY = startIndex * itemHeight;

  // Handle scroll event
  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
  }, []);

  // Get visible items
  const visibleItems = items.slice(startIndex, endIndex + 1);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`virtual-list-container ${className}`}
      style={{
        height: containerHeight,
        overflow: 'auto',
        position: 'relative',
      }}
    >
      {items.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
          {emptyMessage}
        </div>
      ) : (
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div
            style={{
              transform: `translateY(${offsetY}px)`,
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
            }}
          >
            {visibleItems.map((item, index) => (
              <div
                key={startIndex + index}
                style={{ height: itemHeight }}
              >
                {renderItem(item, startIndex + index)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

VirtualList.propTypes = {
  items: PropTypes.array.isRequired,
  renderItem: PropTypes.func.isRequired,
  itemHeight: PropTypes.number,
  containerHeight: PropTypes.number,
  overscan: PropTypes.number,
  className: PropTypes.string,
  emptyMessage: PropTypes.string,
};

export default VirtualList;
