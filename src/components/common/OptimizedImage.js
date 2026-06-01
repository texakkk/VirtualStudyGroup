import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import './OptimizedImage.css';

/**
 * OptimizedImage - Progressive image loading with lazy loading and blur-up effect
 * Features:
 * - Lazy loading (only loads when in viewport)
 * - Progressive loading with blur-up effect
 * - Responsive image sizing
 * - Error handling with fallback
 */
const OptimizedImage = ({
  src,
  alt,
  width,
  height,
  className = '',
  placeholderSrc = null,
  fallbackSrc = '/placeholder.png',
  onLoad,
  onError,
  style = {},
  loading = 'lazy',
  ...props
}) => {
  const [imageSrc, setImageSrc] = useState(placeholderSrc || null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const imgRef = useRef(null);
  const observerRef = useRef(null);

  useEffect(() => {
    // Intersection Observer for lazy loading
    if (loading === 'lazy' && imgRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              loadImage();
              if (observerRef.current && imgRef.current) {
                observerRef.current.unobserve(imgRef.current);
              }
            }
          });
        },
        {
          rootMargin: '50px', // Start loading 50px before entering viewport
        }
      );

      observerRef.current.observe(imgRef.current);

      return () => {
        if (observerRef.current && imgRef.current) {
          observerRef.current.unobserve(imgRef.current);
        }
      };
    } else {
      // Load immediately if not lazy
      loadImage();
    }
  }, [src, loading]);

  const loadImage = () => {
    const img = new Image();
    img.src = src;
    
    img.onload = () => {
      setImageSrc(src);
      setImageLoaded(true);
      setImageError(false);
      if (onLoad) onLoad();
    };

    img.onerror = () => {
      setImageSrc(fallbackSrc);
      setImageError(true);
      if (onError) onError();
    };
  };

  return (
    <div
      className={`optimized-image-wrapper ${className}`}
      style={{
        width: width || '100%',
        height: height || 'auto',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {!imageLoaded && !imageError && (
        <div className="optimized-image-skeleton" />
      )}
      <img
        ref={imgRef}
        src={imageSrc || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}
        alt={alt}
        className={`optimized-image ${imageLoaded ? 'loaded' : ''} ${imageError ? 'error' : ''}`}
        width={width}
        height={height}
        loading={loading}
        {...props}
      />
    </div>
  );
};

OptimizedImage.propTypes = {
  src: PropTypes.string.isRequired,
  alt: PropTypes.string.isRequired,
  width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  className: PropTypes.string,
  placeholderSrc: PropTypes.string,
  fallbackSrc: PropTypes.string,
  onLoad: PropTypes.func,
  onError: PropTypes.func,
  style: PropTypes.object,
  loading: PropTypes.oneOf(['lazy', 'eager']),
};

export default OptimizedImage;
