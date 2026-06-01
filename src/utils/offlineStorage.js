// IndexedDB wrapper for offline data storage
const DB_NAME = 'VStudyOfflineDB';
const DB_VERSION = 1;

// Object stores
const STORES = {
  NOTES: 'notes',
  MESSAGES: 'messages',
  FILES: 'files',
  SYNC_QUEUE: 'syncQueue',
  USER_DATA: 'userData'
};

class OfflineStorage {
  constructor() {
    this.db = null;
  }

  // Initialize the database
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB initialized successfully');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object stores if they don't exist
        if (!db.objectStoreNames.contains(STORES.NOTES)) {
          const notesStore = db.createObjectStore(STORES.NOTES, { keyPath: 'Note_id' });
          notesStore.createIndex('groupId', 'Note_groupId', { unique: false });
          notesStore.createIndex('updatedAt', 'Note_updatedAt', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.MESSAGES)) {
          const messagesStore = db.createObjectStore(STORES.MESSAGES, { keyPath: 'Message_id' });
          messagesStore.createIndex('groupId', 'Message_groupId', { unique: false });
          messagesStore.createIndex('timestamp', 'Message_timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.FILES)) {
          const filesStore = db.createObjectStore(STORES.FILES, { keyPath: 'File_id' });
          filesStore.createIndex('groupId', 'File_groupId', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
          const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
          syncStore.createIndex('type', 'type', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.USER_DATA)) {
          db.createObjectStore(STORES.USER_DATA, { keyPath: 'key' });
        }

        console.log('IndexedDB schema created/updated');
      };
    });
  }

  // Generic method to add/update data
  async put(storeName, data) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Generic method to get data by key
  async get(storeName, key) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Generic method to get all data from a store
  async getAll(storeName) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Get data by index
  async getByIndex(storeName, indexName, value) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Delete data by key
  async delete(storeName, key) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Clear all data from a store
  async clear(storeName) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Notes-specific methods
  async saveNote(note) {
    return this.put(STORES.NOTES, note);
  }

  async getNote(noteId) {
    return this.get(STORES.NOTES, noteId);
  }

  async getNotesByGroup(groupId) {
    return this.getByIndex(STORES.NOTES, 'groupId', groupId);
  }

  async deleteNote(noteId) {
    return this.delete(STORES.NOTES, noteId);
  }

  // Messages-specific methods
  async saveMessage(message) {
    return this.put(STORES.MESSAGES, message);
  }

  async getMessage(messageId) {
    return this.get(STORES.MESSAGES, messageId);
  }

  async getMessagesByGroup(groupId) {
    return this.getByIndex(STORES.MESSAGES, 'groupId', groupId);
  }

  // Files-specific methods
  async saveFile(file) {
    return this.put(STORES.FILES, file);
  }

  async getFile(fileId) {
    return this.get(STORES.FILES, fileId);
  }

  async getFilesByGroup(groupId) {
    return this.getByIndex(STORES.FILES, 'groupId', groupId);
  }

  // Sync queue methods
  async addToSyncQueue(action) {
    const queueItem = {
      ...action,
      timestamp: Date.now(),
      retries: 0
    };
    return this.put(STORES.SYNC_QUEUE, queueItem);
  }

  async getSyncQueue() {
    return this.getAll(STORES.SYNC_QUEUE);
  }

  async removeSyncQueueItem(id) {
    return this.delete(STORES.SYNC_QUEUE, id);
  }

  async clearSyncQueue() {
    return this.clear(STORES.SYNC_QUEUE);
  }

  // User data methods
  async saveUserData(key, value) {
    return this.put(STORES.USER_DATA, { key, value, updatedAt: Date.now() });
  }

  async getUserData(key) {
    const result = await this.get(STORES.USER_DATA, key);
    return result ? result.value : null;
  }
}

// Export singleton instance
const offlineStorage = new OfflineStorage();
export default offlineStorage;
export { STORES };
