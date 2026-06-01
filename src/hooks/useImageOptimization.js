import { useState, useEffect, useRef } from 'react';
import { getLoadingStrategy } from '../utils/performanceOptimizations';

/**
 * useImageOptimization - Hook for optimized image loading
 * @param {String} src - Image source URL
 * @param {Object} options - Configuration options
 * @returns {Object} Image state and handlers
 */
const useImageOptimization = (src, options = {}) => {
  const {
    lazy = true,
    placeholder = null,
    fallback = '/placeholder.png',
    onLoad: onLoadCallback,
    onError: onErrorCallback,
  } = options;

  const [imageSrc, setImageSrc] = useState(placeholder);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const [isInView, setIsInView] = useState(!lazy);
  const imgRef = useRef(null);
  const observerRef = useRef(null);

  // Get adaptive loading strategy
  const loadingStrategy = getLoadingStrategy();

  useEffect(() => {
    if (!lazy) {
      loadImage();
      return;
    }

    // Set up Intersection Observer for lazy loading
    if (imgRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setIsInView(true);
              if (observerRef.current && imgRef.current) {
                observerRef.current.unobserve(imgRef.current);
              }
            }
          });
        },
        {
          rootMargin: loadingStrategy.lazyLoadThreshold,
        }
      );

      observerRef.current.observe(imgRef.current);
    }

    return () => {
      if (observerRef.current && imgRef.current) {
        observerRef.current.unobserve(imgRef.current);
      }
    };
  }, [lazy, loadingStrategy.lazyLoadThreshold]);

  useEffect(() => {
    if (isInView && !isLoaded && !isError) {
      loadImage();
    }
  }, [isInView, src]);

  const loadImage = () => {
    const img = new Image();
    
    // Add quality parameter based on network conditions
    let optimizedSrc = src;
    if (loadingStrategy.imageQuality === 'low') {
      optimizedSrc = `${src}${src.includes('?') ? '&' : '?'}quality=low`;
    } else if (loadingStrategy.imageQuality === 'medium') {
      optimizedSrc = `${src}${src.includes('?') ? '&' : '?'}quality=medium`;
    }

    img.src = optimizedSrc;

    img.onload = () => {
      setImageSrc(optimizedSrc);
      setIsLoaded(true);
      setIsError(false);
      if (onLoadCallback) onLoadCallback();
    };

    img.onerror = () => {
      setImageSrc(fallback);
      setIsError(true);
      if (onErrorCallback) onErrorCallback();
    };
  };

  const retry = () => {
    setIsError(false);
    setIsLoaded(false);
    loadImage();
  };

  return {
    imgRef,
    imageSrc,
    isLoaded,
    isError,
    isInView,
    retry,
    loadingStrategy,
  };
};

export default useImageOptimization;
