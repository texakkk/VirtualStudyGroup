import { useTranslation as useI18nTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * Custom hook that combines react-i18next's useTranslation with our LanguageContext
 * Provides translation function and language utilities
 */
export const useTranslation = (namespace = 'translation') => {
  const { t, i18n, ready } = useI18nTranslation(namespace);
  const {
    currentLanguage,
    isRTL,
    formatDate,
    formatNumber,
    changeLanguage,
    getLanguageInfo,
  } = useLanguage();

  return {
    // Translation function
    t,
    
    // i18n instance
    i18n,
    
    // Ready state
    ready,
    
    // Current language
    language: currentLanguage,
    
    // RTL status
    isRTL,
    
    // Formatting utilities
    formatDate,
    formatNumber,
    
    // Language change function
    changeLanguage,
    
    // Language info
    getLanguageInfo,
    
    // Helper to check if a key exists
    exists: (key) => {
      return i18n.exists(key);
    },
    
    // Helper to get translation with fallback
    tWithFallback: (key, fallback, options = {}) => {
      return i18n.exists(key) ? t(key, options) : fallback;
    },
    
    // Helper for pluralization
    tPlural: (key, count, options = {}) => {
      return t(key, { count, ...options });
    },
    
    // Helper for interpolation
    tInterpolate: (key, values, options = {}) => {
      return t(key, { ...values, ...options });
    },
  };
};

export default useTranslation;
