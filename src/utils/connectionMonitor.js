/**
 * Connection Monitor Utility
 * Monitors backend connectivity and handles reconnection
 */

import { getApiBaseUrl } from '../config/apiConfig';

class ConnectionMonitor {
  constructor() {
    this.isOnline = true;
    this.checkInterval = null;
    this.listeners = [];
    this.healthCheckUrl = `${getApiBaseUrl()}/health`;
  }

  /**
   * Start monitoring connection
   */
  start(intervalMs = 30000) {
    // Check immediately
    this.checkConnection();

    // Then check periodically
    this.checkInterval = setInterval(() => {
      this.checkConnection();
    }, intervalMs);

    // Listen to browser online/offline events
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }

  /**
   * Check backend connection
   */
  async checkConnection() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(this.healthCheckUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache'
        }
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.mongodb === 'connected') {
          this.setOnline(true);
        } else {
          this.setOnline(false);
        }
      } else {
        this.setOnline(false);
      }
    } catch (error) {
      console.error('Connection check failed:', error.message);
      this.setOnline(false);
    }
  }

  /**
   * Handle browser online event
   */
  handleOnline = () => {
    console.log('Browser is online');
    this.checkConnection();
  };

  /**
   * Handle browser offline event
   */
  handleOffline = () => {
    console.log('Browser is offline');
    this.setOnline(false);
  };

  /**
   * Update online status
   */
  setOnline(status) {
    if (this.isOnline !== status) {
      this.isOnline = status;
      this.notifyListeners(status);
    }
  }

  /**
   * Add status change listener
   */
  addListener(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Notify all listeners
   */
  notifyListeners(status) {
    this.listeners.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('Error in connection listener:', error);
      }
    });
  }

  /**
   * Get current status
   */
  getStatus() {
    return this.isOnline;
  }
}

// Export singleton instance
export default new ConnectionMonitor();
