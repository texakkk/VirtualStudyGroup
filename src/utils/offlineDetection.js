// Offline detection and network status utilities

class OfflineDetector {
  constructor() {
    this.listeners = new Set();
    this.isOnline = navigator.onLine;
    this.connectionQuality = 'good';
    this.lastOnlineTime = Date.now();
    
    // Bind event handlers
    this.handleOnline = this.handleOnline.bind(this);
    this.handleOffline = this.handleOffline.bind(this);
    
    // Set up event listeners
    this.init();
  }

  init() {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    
    // Check connection quality periodically
    this.startConnectionQualityCheck();
  }

  handleOnline() {
    console.log('[OfflineDetector] Connection restored');
    this.isOnline = true;
    this.lastOnlineTime = Date.now();
    this.notifyListeners({ online: true, quality: this.connectionQuality });
    
    // Trigger background sync if available
    this.triggerBackgroundSync();
  }

  handleOffline() {
    console.log('[OfflineDetector] Connection lost');
    this.isOnline = false;
    this.connectionQuality = 'offline';
    this.notifyListeners({ online: false, quality: 'offline' });
  }

  // Check connection quality using Network Information API
  startConnectionQualityCheck() {
    if ('connection' in navigator) {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      
      if (connection) {
        this.updateConnectionQuality(connection);
        
        connection.addEventListener('change', () => {
          this.updateConnectionQuality(connection);
        });
      }
    }
    
    // Fallback: periodic ping check
    setInterval(() => {
      if (this.isOnline) {
        this.checkConnectionWithPing();
      }
    }, 30000); // Check every 30 seconds
  }

  updateConnectionQuality(connection) {
    const effectiveType = connection.effectiveType;
    
    switch (effectiveType) {
      case 'slow-2g':
      case '2g':
        this.connectionQuality = 'poor';
        break;
      case '3g':
        this.connectionQuality = 'moderate';
        break;
      case '4g':
        this.connectionQuality = 'good';
        break;
      default:
        this.connectionQuality = 'good';
    }
    
    console.log('[OfflineDetector] Connection quality:', this.connectionQuality);
    this.notifyListeners({ online: this.isOnline, quality: this.connectionQuality });
  }

  // Check connection with a lightweight ping
  async checkConnectionWithPing() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const startTime = Date.now();
      const response = await fetch('/favicon.ico', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;
      
      if (response.ok) {
        // Determine quality based on latency
        if (latency < 200) {
          this.connectionQuality = 'good';
        } else if (latency < 500) {
          this.connectionQuality = 'moderate';
        } else {
          this.connectionQuality = 'poor';
        }
        
        if (!this.isOnline) {
          this.isOnline = true;
          this.notifyListeners({ online: true, quality: this.connectionQuality });
        }
      }
    } catch (error) {
      if (this.isOnline) {
        console.log('[OfflineDetector] Ping failed, connection may be lost');
        this.isOnline = false;
        this.connectionQuality = 'offline';
        this.notifyListeners({ online: false, quality: 'offline' });
      }
    }
  }

  // Trigger background sync
  async triggerBackgroundSync() {
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('sync-offline-actions');
        console.log('[OfflineDetector] Background sync registered');
      } catch (error) {
        console.error('[OfflineDetector] Background sync registration failed:', error);
        // Fallback to immediate sync
        this.notifyListeners({ online: true, quality: this.connectionQuality, syncNow: true });
      }
    } else {
      // Fallback for browsers without background sync
      this.notifyListeners({ online: true, quality: this.connectionQuality, syncNow: true });
    }
  }

  // Subscribe to network status changes
  subscribe(callback) {
    this.listeners.add(callback);
    
    // Immediately notify with current status
    callback({ online: this.isOnline, quality: this.connectionQuality });
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }

  // Notify all listeners
  notifyListeners(status) {
    this.listeners.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('[OfflineDetector] Listener error:', error);
      }
    });
  }

  // Get current status
  getStatus() {
    return {
      online: this.isOnline,
      quality: this.connectionQuality,
      lastOnlineTime: this.lastOnlineTime
    };
  }

  // Clean up
  destroy() {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.listeners.clear();
  }
}

// Export singleton instance
const offlineDetector = new OfflineDetector();
export default offlineDetector;
