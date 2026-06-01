const express = require('express');
const mongoose = require('mongoose');
const YouTubeVideo = require('../models/YouTube');
const youtubeService = require('../services/youtubeService');
const { authenticateUser } = require('../middleware/authMiddleware');
const GroupMember = require('../models/GroupMember');

const router = express.Router();

/**
 * @route   POST /api/youtube/videos
 * @desc    Add a new YouTube video with automatic metadata fetching
 * @access  Private
 */
router.post('/videos', authenticateUser, async (req, res) => {
  const { groupId, videoUrl, description } = req.body;

  if (!groupId || !videoUrl) {
    return res.status(400).json({ 
      success: false,
      message: 'Group ID and video URL are required' 
    });
  }

  // Validate groupId format
  const trimmedGroupId = typeof groupId === 'string' ? groupId.trim() : groupId;
  if (!mongoose.Types.ObjectId.isValid(trimmedGroupId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid group ID format'
    });
  }

  try {
    // Verify user is a member of the group
    const groupMember = await GroupMember.findOne({
      GroupMember_groupId: trimmedGroupId,
      GroupMember_userId: req.user._id
    });

    if (!groupMember) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this group'
      });
    }

    // Validate YouTube URL
    if (!youtubeService.isValidYouTubeUrl(videoUrl)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid YouTube URL format'
      });
    }

    // Get video information from YouTube API
    const videoInfo = await youtubeService.getVideoInfoFromUrl(videoUrl);

    const newVideo = new YouTubeVideo({
      groupId: trimmedGroupId,
      sharedBy: req.user._id,
      videoTitle: videoInfo.title,
      videoUrl,
      description: description || videoInfo.description,
      thumbnail: videoInfo.thumbnail.maxres || videoInfo.thumbnail.high,
      videoId: videoInfo.videoId,
      duration: videoInfo.duration
    });

    const savedVideo = await newVideo.save();
    
    // Populate the response
    await savedVideo.populate('sharedBy', 'User_name User_email');

    res.status(201).json({
      success: true,
      message: 'Video added successfully',
      video: {
        _id: savedVideo._id,
        videoTitle: savedVideo.videoTitle,
        videoUrl: savedVideo.videoUrl,
        videoId: savedVideo.videoId,
        description: savedVideo.description,
        thumbnail: savedVideo.thumbnail,
        duration: savedVideo.duration,
        embedUrl: savedVideo.embedUrl,
        sharedBy: {
          _id: savedVideo.sharedBy._id,
          name: savedVideo.sharedBy.User_name
        },
        sharedAt: savedVideo.sharedAt,
        apiInfo: videoInfo.fallback ? null : {
          channelTitle: videoInfo.channelTitle,
          viewCount: videoInfo.viewCount,
          likeCount: videoInfo.likeCount,
          publishedAt: videoInfo.publishedAt
        }
      }
    });
  } catch (error) {
    console.error('Add video error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to add video', 
      error: error.message 
    });
  }
});

/**
 * @route   GET /api/youtube/videos/:groupId
 * @desc    Get all videos for a specific group
 * @access  Private
 */
router.get('/videos/:groupId', authenticateUser, async (req, res) => {
  const { groupId } = req.params;
  const { limit = 50, page = 1 } = req.query;

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({ 
      success: false,
      message: 'Invalid group ID' 
    });
  }

  try {
    // Verify user is a member of the group
    const groupMember = await GroupMember.findOne({
      GroupMember_groupId: groupId,
      GroupMember_userId: req.user._id
    });

    if (!groupMember) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this group'
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const videos = await YouTubeVideo.find({ groupId })
      .populate('sharedBy', 'User_name User_email')
      .sort({ sharedAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await YouTubeVideo.countDocuments({ groupId });

    const formattedVideos = videos.map(video => ({
      _id: video._id,
      videoTitle: video.videoTitle,
      videoUrl: video.videoUrl,
      videoId: video.videoId,
      description: video.description,
      thumbnail: video.thumbnail,
      duration: video.duration,
      embedUrl: video.embedUrl,
      sharedBy: {
        _id: video.sharedBy._id,
        name: video.sharedBy.User_name
      },
      sharedAt: video.sharedAt
    }));

    res.status(200).json({
      success: true,
      videos: formattedVideos,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Fetch videos error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch videos', 
      error: error.message 
    });
  }
});

/**
 * @route   PUT /videos/:id
 * @desc    Update a specific video
 * @access  Public
 */
router.put('/videos/:id', async (req, res) => {
  const { id } = req.params;
  const { videoTitle, videoUrl, description, thumbnail } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }

  try {
    const updatedVideo = await YouTubeVideo.findByIdAndUpdate(
      id,
      { videoTitle, videoUrl, description, thumbnail },
      { returnDocument: 'after', runValidators: true }
    );

    if (!updatedVideo) {
      return res.status(404).json({ error: 'Video not found' });
    }

    res.json(updatedVideo);
  } catch (error) {
    res.status(500).json({ error: 'Error updating video', details: error.message });
  }
});

/**
 * @route   DELETE /videos/:id
 * @desc    Delete a specific video
 * @access  Public
 */
router.delete('/videos/:id', async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }

  try {
    const deletedVideo = await YouTubeVideo.findByIdAndDelete(id);

    if (!deletedVideo) {
      return res.status(404).json({ error: 'Video not found' });
    }

    res.json({ message: 'Video successfully deleted', deletedVideo });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting video', details: error.message });
  }
});

/**
 * @route   POST /api/youtube/validate-media-url
 * @desc    Validate and get metadata for media session URLs
 * @access  Private
 */
router.post('/validate-media-url', authenticateUser, async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      message: 'URL is required'
    });
  }

  try {
    const validation = await youtubeService.validateMediaSessionUrl(url);

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.error || 'Invalid media URL'
      });
    }

    res.status(200).json({
      success: true,
      message: 'URL validated successfully',
      media: validation
    });
  } catch (error) {
    console.error('URL validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate URL',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/youtube/video-info/:videoId
 * @desc    Get detailed YouTube video information
 * @access  Private
 */
router.get('/video-info/:videoId', authenticateUser, async (req, res) => {
  const { videoId } = req.params;

  if (!videoId) {
    return res.status(400).json({
      success: false,
      message: 'Video ID is required'
    });
  }

  try {
    const videoInfo = await youtubeService.getVideoInfo(videoId);

    res.status(200).json({
      success: true,
      video: videoInfo
    });
  } catch (error) {
    console.error('Get video info error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get video information',
      error: error.message
    });
  }
});

module.exports = router;
