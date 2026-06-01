import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * useVirtualScroll - Hook for implementing virtual scrolling
 * @param {Array} items - Array of items to virtualize
 * @param {Number} itemHeight - Height of each item
 * @param {Number} containerHeight - Height of container
 * @param {Number} overscan - Number of items to render outside viewport
 * @returns {Object} Virtual scroll state and helpers
 */
const useVirtualScroll = ({
  items = [],
  itemHeight = 50,
  containerHeight = 600,
  overscan = 3,
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef(null);

  // Calculate visible range
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );

  // Calculate dimensions
  const totalHeight = items.length * itemHeight;
  const offsetY = startIndex * itemHeight;
  const visibleItems = items.slice(startIndex, endIndex + 1);

  // Handle scroll
  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
  }, []);

  // Scroll to specific index
  const scrollToIndex = useCallback((index) => {
    if (containerRef.current) {
      const scrollTop = index * itemHeight;
      containerRef.current.scrollTop = scrollTop;
      setScrollTop(scrollTop);
    }
  }, [itemHeight]);

  return {
    containerRef,
    handleScroll,
    scrollToIndex,
    visibleItems,
    startIndex,
    endIndex,
    totalHeight,
    offsetY,
    scrollTop,
  };
};

export default useVirtualScroll;
