const axios = require('axios');

class YouTubeService {
  constructor() {
    // YouTube API key should be set in environment variables
    this.apiKey = process.env.YOUTUBE_API_KEY;
    this.baseUrl = 'https://www.googleapis.com/youtube/v3';
  }

  /**
   * Extract YouTube video ID from various YouTube URL formats
   * @param {string} url - YouTube URL
   * @returns {string|null} - Video ID or null if invalid
   */
  extractVideoId(url) {
    if (!url) return null;
    
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/v\/([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return null;
  }

  /**
   * Validate if a URL is a valid YouTube URL
   * @param {string} url - URL to validate
   * @returns {boolean} - True if valid YouTube URL
   */
  isValidYouTubeUrl(url) {
    return this.extractVideoId(url) !== null;
  }

  /**
   * Get video information from YouTube API
   * @param {string} videoId - YouTube video ID
   * @returns {Promise<Object>} - Video information
   */
  async getVideoInfo(videoId) {
    if (!this.apiKey) {
      console.warn('YouTube API key not configured. Using fallback method.');
      return this.getVideoInfoFallback(videoId);
    }

    try {
      const response = await axios.get(`${this.baseUrl}/videos`, {
        params: {
          part: 'snippet,contentDetails,statistics',
          id: videoId,
          key: this.apiKey
        },
        timeout: 10000 // 10 second timeout
      });

      if (response.data.items && response.data.items.length > 0) {
        const video = response.data.items[0];
        const snippet = video.snippet;
        const contentDetails = video.contentDetails;
        const statistics = video.statistics;

        return {
          success: true,
          videoId,
          title: snippet.title,
          description: snippet.description,
          thumbnail: {
            default: snippet.thumbnails.default?.url,
            medium: snippet.thumbnails.medium?.url,
            high: snippet.thumbnails.high?.url,
            standard: snippet.thumbnails.standard?.url,
            maxres: snippet.thumbnails.maxres?.url
          },
          channelTitle: snippet.channelTitle,
          publishedAt: snippet.publishedAt,
          duration: this.parseDuration(contentDetails.duration),
          viewCount: parseInt(statistics.viewCount) || 0,
          likeCount: parseInt(statistics.likeCount) || 0,
          tags: snippet.tags || [],
          categoryId: snippet.categoryId,
          embedUrl: `https://www.youtube.com/embed/${videoId}`,
          watchUrl: `https://www.youtube.com/watch?v=${videoId}`
        };
      } else {
        throw new Error('Video not found');
      }
    } catch (error) {
      console.error('YouTube API error:', error.message);
      
      // Fallback to basic info if API fails
      return this.getVideoInfoFallback(videoId);
    }
  }

  /**
   * Fallback method to get basic video info without API
   * @param {string} videoId - YouTube video ID
   * @returns {Object} - Basic video information
   */
  getVideoInfoFallback(videoId) {
    return {
      success: true,
      videoId,
      title: `YouTube Video ${videoId}`,
      description: 'Video information unavailable (API not configured)',
      thumbnail: {
        default: `https://img.youtube.com/vi/${videoId}/default.jpg`,
        medium: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        high: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        standard: `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
        maxres: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      },
      channelTitle: 'Unknown Channel',
      publishedAt: null,
      duration: null,
      viewCount: 0,
      likeCount: 0,
      tags: [],
      categoryId: null,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
      fallback: true
    };
  }

  /**
   * Parse YouTube duration format (PT4M13S) to seconds
   * @param {string} duration - YouTube duration string
   * @returns {number} - Duration in seconds
   */
  parseDuration(duration) {
    if (!duration) return 0;
    
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Format duration in seconds to human readable format
   * @param {number} seconds - Duration in seconds
   * @returns {string} - Formatted duration (e.g., "4:13", "1:04:13")
   */
  formatDuration(seconds) {
    if (!seconds || seconds < 0) return '0:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Get video info from URL
   * @param {string} url - YouTube URL
   * @returns {Promise<Object>} - Video information
   */
  async getVideoInfoFromUrl(url) {
    const videoId = this.extractVideoId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    return await this.getVideoInfo(videoId);
  }

  /**
   * Search YouTube videos (requires API key)
   * @param {string} query - Search query
   * @param {number} maxResults - Maximum number of results (default: 10)
   * @returns {Promise<Object>} - Search results
   */
  async searchVideos(query, maxResults = 10) {
    if (!this.apiKey) {
      throw new Error('YouTube API key required for search functionality');
    }

    try {
      const response = await axios.get(`${this.baseUrl}/search`, {
        params: {
          part: 'snippet',
          q: query,
          type: 'video',
          maxResults,
          key: this.apiKey
        },
        timeout: 10000
      });

      const videos = response.data.items.map(item => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails.medium?.url,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
        embedUrl: `https://www.youtube.com/embed/${item.id.videoId}`,
        watchUrl: `https://www.youtube.com/watch?v=${item.id.videoId}`
      }));

      return {
        success: true,
        query,
        videos,
        totalResults: response.data.pageInfo.totalResults
      };
    } catch (error) {
      console.error('YouTube search error:', error.message);
      throw new Error('Failed to search YouTube videos');
    }
  }

  /**
   * Generate embed HTML for a YouTube video
   * @param {string} videoId - YouTube video ID
   * @param {Object} options - Embed options
   * @returns {string} - HTML embed code
   */
  generateEmbedHtml(videoId, options = {}) {
    const {
      width = 560,
      height = 315,
      autoplay = 0,
      controls = 1,
      start = 0,
      end = null,
      loop = 0,
      mute = 0
    } = options;

    let embedUrl = `https://www.youtube.com/embed/${videoId}?`;
    const params = new URLSearchParams({
      autoplay: autoplay.toString(),
      controls: controls.toString(),
      start: start.toString(),
      loop: loop.toString(),
      mute: mute.toString()
    });

    if (end) {
      params.append('end', end.toString());
    }

    embedUrl += params.toString();

    return `<iframe width="${width}" height="${height}" src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  }

  /**
   * Generate synchronized embed URL for media sessions
   * @param {string} videoId - YouTube video ID
   * @param {Object} options - Sync options
   * @returns {string} - Synchronized embed URL
   */
  generateSyncEmbedUrl(videoId, options = {}) {
    const {
      enablejsapi = 1,
      origin = 'http://localhost:3000',
      controls = 1,
      disablekb = 1, // Disable keyboard controls for sync
      fs = 0, // Disable fullscreen for better sync control
      modestbranding = 1,
      rel = 0
    } = options;

    const params = new URLSearchParams({
      enablejsapi: enablejsapi.toString(),
      origin,
      controls: controls.toString(),
      disablekb: disablekb.toString(),
      fs: fs.toString(),
      modestbranding: modestbranding.toString(),
      rel: rel.toString()
    });

    return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
  }

  /**
   * Validate media session URL and extract metadata
   * @param {string} url - Media URL
   * @returns {Promise<Object>} - Media metadata
   */
  async validateMediaSessionUrl(url) {
    try {
      // Check if it's a YouTube URL
      if (this.isValidYouTubeUrl(url)) {
        const videoInfo = await this.getVideoInfoFromUrl(url);
        return {
          isValid: true,
          type: 'youtube',
          videoId: videoInfo.videoId,
          title: videoInfo.title,
          thumbnail: videoInfo.thumbnail.maxres || videoInfo.thumbnail.high,
          duration: videoInfo.duration,
          embedUrl: this.generateSyncEmbedUrl(videoInfo.videoId),
          metadata: videoInfo
        };
      }

      // Check for other video formats
      const videoExtensions = /\.(mp4|webm|ogg|avi|mov|wmv|flv|mkv)$/i;
      const audioExtensions = /\.(mp3|wav|ogg|m4a|aac|flac)$/i;

      if (videoExtensions.test(url)) {
        return {
          isValid: true,
          type: 'video',
          title: this.extractFilenameFromUrl(url),
          url: url,
          embedUrl: url
        };
      }

      if (audioExtensions.test(url)) {
        return {
          isValid: true,
          type: 'audio',
          title: this.extractFilenameFromUrl(url),
          url: url,
          embedUrl: url
        };
      }

      // Check for Vimeo URLs
      const vimeoPattern = /(?:vimeo\.com\/)(\d+)/;
      const vimeoMatch = url.match(vimeoPattern);
      if (vimeoMatch) {
        return {
          isValid: true,
          type: 'vimeo',
          videoId: vimeoMatch[1],
          title: `Vimeo Video ${vimeoMatch[1]}`,
          embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`
        };
      }

      return {
        isValid: false,
        error: 'Unsupported media format'
      };

    } catch (error) {
      return {
        isValid: false,
        error: error.message
      };
    }
  }

  /**
   * Extract filename from URL
   * @param {string} url - File URL
   * @returns {string} - Filename
   */
  extractFilenameFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop();
      return filename || 'Media File';
    } catch (error) {
      return 'Media File';
    }
  }

  /**
   * Validate and normalize YouTube URL
   * @param {string} url - YouTube URL
   * @returns {Object} - Normalized URL info
   */
  normalizeUrl(url) {
    const videoId = this.extractVideoId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    return {
      videoId,
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    };
  }
}

module.exports = new YouTubeService();