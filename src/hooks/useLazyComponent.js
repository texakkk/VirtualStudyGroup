import { useState, useEffect } from 'react';

/**
 * useLazyComponent - Hook for dynamically loading components
 * Useful for conditional rendering of heavy components
 * 
 * @param {Function} importFunc - Dynamic import function
 * @param {Boolean} shouldLoad - Whether to load the component
 * @returns {Object} { Component, loading, error }
 */
const useLazyComponent = (importFunc, shouldLoad = true) => {
  const [Component, setComponent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (shouldLoad && !Component) {
      setLoading(true);
      importFunc()
        .then((module) => {
          setComponent(() => module.default);
          setLoading(false);
        })
        .catch((err) => {
          setError(err);
          setLoading(false);
          console.error('Error loading component:', err);
        });
    }
  }, [shouldLoad, importFunc, Component]);

  return { Component, loading, error };
};

export default useLazyComponent;
