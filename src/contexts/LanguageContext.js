import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const LanguageContext = createContext();

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

// All supported languages — defined locally, no backend needed
const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'ar'];

const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

const LANGUAGE_METADATA = {
  en: { name: 'English',    nativeName: 'English',    flag: '🇬🇧' },
  es: { name: 'Spanish',    nativeName: 'Español',    flag: '🇪🇸' },
  fr: { name: 'French',     nativeName: 'Français',   flag: '🇫🇷' },
  de: { name: 'German',     nativeName: 'Deutsch',    flag: '🇩🇪' },
  it: { name: 'Italian',    nativeName: 'Italiano',   flag: '🇮🇹' },
  pt: { name: 'Portuguese', nativeName: 'Português',  flag: '🇵🇹' },
  zh: { name: 'Chinese',    nativeName: '中文',        flag: '🇨🇳' },
  ja: { name: 'Japanese',   nativeName: '日本語',      flag: '🇯🇵' },
  ko: { name: 'Korean',     nativeName: '한국어',      flag: '🇰🇷' },
  ar: { name: 'Arabic',     nativeName: 'العربية',    flag: '🇸🇦' },
  hi: { name: 'Hindi',      nativeName: 'हिन्दी',     flag: '🇮🇳' },
  ru: { name: 'Russian',    nativeName: 'Русский',    flag: '🇷🇺' },
};

// Locale string used for Intl APIs
const LOCALE_MAP = {
  en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE',
  it: 'it-IT', pt: 'pt-PT', zh: 'zh-CN', ja: 'ja-JP',
  ko: 'ko-KR', ar: 'ar-SA', hi: 'hi-IN', ru: 'ru-RU',
};

export const LanguageProvider = ({ children }) => {
  const { i18n } = useTranslation();
  const [currentLanguage, setCurrentLanguage] = useState(
    () => localStorage.getItem('i18nextLng')?.split('-')[0] || 'en'
  );
  const [isRTL, setIsRTL] = useState(() => RTL_LANGUAGES.includes(
    localStorage.getItem('i18nextLng')?.split('-')[0] || 'en'
  ));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sync document attributes whenever language changes
  useEffect(() => {
    const rtl = RTL_LANGUAGES.includes(currentLanguage);
    setIsRTL(rtl);
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    document.documentElement.lang = currentLanguage;
    if (rtl) {
      document.body.classList.add('rtl');
    } else {
      document.body.classList.remove('rtl');
    }
  }, [currentLanguage]);

  // Change language — loads static file via i18n HttpBackend, no backend call
  const changeLanguage = useCallback(async (languageCode) => {
    if (!languageCode || languageCode === currentLanguage) return;

    setLoading(true);
    setError(null);

    try {
      await i18n.changeLanguage(languageCode);
      setCurrentLanguage(languageCode);
      localStorage.setItem('i18nextLng', languageCode);
      return { success: true };
    } catch (err) {
      console.error('Failed to change language:', err);
      setError(err.message || 'Failed to change language');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [currentLanguage, i18n]);

  const getLanguageInfo = useCallback((languageCode) => {
    return LANGUAGE_METADATA[languageCode] || { name: languageCode, nativeName: languageCode, flag: '🌐' };
  }, []);

  const getAvailableLanguages = useCallback(() => {
    return SUPPORTED_LANGUAGES.map(code => ({ code, ...getLanguageInfo(code) }));
  }, [getLanguageInfo]);

  const translate = useCallback((key, options = {}) => {
    try { return i18n.t(key, options); }
    catch (err) { return key; }
  }, [i18n]);

  const formatDate = useCallback((date, options = {}) => {
    try {
      return new Intl.DateTimeFormat(LOCALE_MAP[currentLanguage] || 'en-US', options).format(new Date(date));
    } catch { return new Date(date).toLocaleDateString(); }
  }, [currentLanguage]);

  const formatNumber = useCallback((number, options = {}) => {
    try {
      return new Intl.NumberFormat(LOCALE_MAP[currentLanguage] || 'en-US', options).format(number);
    } catch { return String(number); }
  }, [currentLanguage]);

  const value = {
    currentLanguage,
    isRTL,
    loading,
    error,
    supportedLanguages: SUPPORTED_LANGUAGES,
    changeLanguage,
    getLanguageInfo,
    getAvailableLanguages,
    translate,
    formatDate,
    formatNumber,
    t: translate,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export default LanguageContext;
