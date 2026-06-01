import i18n from '../i18n/config';

/**
 * Translation Manager
 * Loads translations from static public/locales files — no backend calls.
 */
class TranslationManager {
  constructor() {
    this.loadedLanguages = new Set(['en']); // English is preloaded by i18n config
    this.loadingPromises = new Map();
  }

  /**
   * Load translations for a specific language.
   * Falls back to the static /locales/{lang}/translation.json file.
   */
  async loadLanguage(language) {
    if (this.loadedLanguages.has(language)) return true;
    if (this.loadingPromises.has(language)) return this.loadingPromises.get(language);

    const promise = this._loadFromStaticFile(language);
    this.loadingPromises.set(language, promise);

    try {
      const success = await promise;
      if (success) this.loadedLanguages.add(language);
      return success;
    } finally {
      this.loadingPromises.delete(language);
    }
  }

  async _loadFromStaticFile(language) {
    try {
      const response = await fetch(`/locales/${language}/translation.json`);
      if (!response.ok) return false;
      const translations = await response.json();
      i18n.addResourceBundle(language, 'translation', translations, true, true);
      console.log(`Loaded translations for language: ${language}`);
      return true;
    } catch (error) {
      console.error(`Failed to load translations for ${language}:`, error);
      return false;
    }
  }

  async preloadLanguages(languages) {
    const results = await Promise.allSettled(languages.map(l => this.loadLanguage(l)));
    return results.map((r, i) => ({ language: languages[i], success: r.status === 'fulfilled' && r.value }));
  }

  isLanguageLoaded(language) { return this.loadedLanguages.has(language); }
  getLoadedLanguages() { return Array.from(this.loadedLanguages); }

  clearCache() {
    this.loadedLanguages.clear();
    this.loadedLanguages.add('en');
    this.loadingPromises.clear();
  }

  addTranslations(language, translations, deep = true) {
    i18n.addResourceBundle(language, 'translation', translations, deep, true);
    this.loadedLanguages.add(language);
  }

  getTranslation(key, language, options = {}) { return i18n.t(key, { lng: language, ...options }); }
  hasTranslation(key, language = null) { return language ? i18n.exists(key, { lng: language }) : i18n.exists(key); }
  getAllTranslations(language) { return i18n.getResourceBundle(language, 'translation') || {}; }

  async reloadLanguage(language) {
    this.loadedLanguages.delete(language);
    return this.loadLanguage(language);
  }
}

const translationManager = new TranslationManager();
export default translationManager;
