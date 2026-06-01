import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

// Module-level flag — survives HMR re-execution because the i18n singleton persists
// as long as the page isn't fully reloaded.
let _initStarted = false;

if (!_initStarted) {
  _initStarted = true;

  i18n
    .use(HttpBackend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      fallbackLng: 'en',
      debug: process.env.NODE_ENV === 'development',

      supportedLngs: ['en', 'es', 'fr', 'ar'],

      detection: {
        order: ['localStorage', 'navigator', 'htmlTag'],
        caches: ['localStorage'],
        lookupLocalStorage: 'i18nextLng',
      },

      // Load translations from static public/locales files — no backend call needed
      backend: {
        loadPath: '/locales/{{lng}}/translation.json',
      },

      interpolation: {
        escapeValue: false,
      },

      react: {
        useSuspense: true,
        bindI18n: 'languageChanged loaded',
        bindI18nStore: 'added removed',
        transEmptyNodeValue: '',
        transSupportBasicHtmlNodes: true,
        transKeepBasicHtmlNodesFor: ['br', 'strong', 'i', 'p'],
      },

      ns: ['translation'],
      defaultNS: 'translation',
      load: 'languageOnly',
      preload: ['en'],
      keySeparator: '.',
      nsSeparator: ':',
      pluralSeparator: '_',
      contextSeparator: '_',
      saveMissing: false,
      missingKeyHandler: (lng, ns, key) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`Missing translation key: ${key} for language: ${lng}`);
        }
      },
    });
}

export default i18n;
