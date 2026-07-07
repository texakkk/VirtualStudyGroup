const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const User = require('../models/User');
const { sendPasswordResetEmail } = require('../utils/emailService');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const router = express.Router();
require('dotenv').config();
const { authenticateUser } = require('../middleware/authMiddleware'); // Import middleware
const cacheService = require('../services/cacheService');
const { invalidateCache } = require('../middleware/cacheMiddleware');

// Import rate limiters
const { 
  authLimiter, 
  registrationLimiter, 
  passwordResetLimiter 
} = require('../middleware/rateLimitMiddleware');

// Import input validation
const { validateRequestBody, normalizeObjectIdParams } = require('../middleware/inputValidationMiddleware');

const multer = require('multer');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/')); 
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'profile-' + uniqueSuffix + ext);
  },
});
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};
  
const upload = multer({ storage: storage, fileFilter: fileFilter, limits: { fileSize: 1024 * 1024 * 5 } });
const fs = require('fs');
const uploadsDir = path.join(__dirname, '../uploads/');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}


// @route POST /api/auth/register
// @desc Register a new user
router.post('/register', 
  registrationLimiter,
  validateRequestBody({
    User_name: { type: 'text', required: true, minLength: 2, maxLength: 50 },
    User_email: { type: 'email', required: true },
    User_password: { type: 'text', required: true, minLength: 8, maxLength: 100 }
  }),
  async (req, res) => {
  const { User_name, User_email, User_password } = req.body;

  try {
    const existingUser = await User.findOne({ User_email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const newUser = new User({ User_name, User_email, User_password });
    await newUser.save();

    // Create access token (1 hour) and refresh token (7 days)
    const payload = { 
      user: { 
        _id: newUser._id,
        tokenVersion: newUser.User_tokenVersion || 0
      } 
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    // Cache refresh token
    await cacheService.cacheSession(`refresh:${refreshToken}`, { userId: newUser._id }, 7 * 24 * 60 * 60);

    const userResponse = {
      User_id: newUser._id,
      User_name: newUser.User_name,
      User_email: newUser.User_email,
      User_profilePicture: newUser.User_profilePicture,
    };

    res.status(201).json({ message: 'User registered successfully!', user: userResponse, token, refreshToken });
  } catch (error) {
    console.error('Registration error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/login', 
  authLimiter,
  validateRequestBody({
    User_email: { type: 'email', required: true },
    User_password: { type: 'text', required: true }
  }),
  async (req, res) => {
  console.log('Login request received:', { body: req.body });
  
  const { User_email, User_password } = req.body;

  // Validate request body
  if (!User_email || !User_password) {
    console.log('Missing required fields:', { User_email: !!User_email, User_password: !!User_password });
    return res.status(400).json({ 
      success: false,
      message: 'Email and password are required',
      receivedFields: Object.keys(req.body).filter(key => req.body[key] !== undefined)
    });
  }

  try {
    const user = await User.findOne({ User_email }).select('+User_password');
    if (!user) {
      console.log('User not found with email:', User_email);
      return res.status(400).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }

    console.log('User found, comparing passwords...');
    // Use the instance method for password comparison
    const isMatch = await user.correctPassword(User_password, user.User_password);
    if (!isMatch) {
      console.log('Password does not match');
      return res.status(400).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }

    // Create access token (1 hour) and refresh token (7 days)
    const payload = { 
      user: { 
        _id: user._id,
        tokenVersion: user.User_tokenVersion || 0
      } 
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    // Cache refresh token
    await cacheService.cacheSession(`refresh:${refreshToken}`, { userId: user._id }, 7 * 24 * 60 * 60);

    // Prepare user response without sensitive data
    const userResponse = {
      User_id: user._id,
      User_name: user.User_name,
      User_email: user.User_email,
      User_profilePicture: user.User_profilePicture,
    };

    console.log('Login successful, tokens generated');
    res.json({ message: 'Login successful', user: userResponse, token, refreshToken });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route POST /api/auth/logout
// @desc Logout user and invalidate session
// @access Private
router.post('/logout', authenticateUser, async (req, res) => {
  try {
    const token = req.header('Authorization')?.split(' ')[1];
    const refreshToken = req.body.refreshToken;
    
    if (token) {
      // Invalidate session cache
      await cacheService.invalidateSession(token);
      
      // Invalidate user-specific caches
      await invalidateCache(`user:${req.user._id}:*`);
    }

    if (refreshToken) {
      // Invalidate refresh token
      await cacheService.invalidateSession(`refresh:${refreshToken}`);
    }
    
    res.json({ 
      success: true, 
      message: 'Logged out successfully' 
    });
  } catch (error) {
    console.error('Logout error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during logout' 
    });
  }
});

// @route POST /api/auth/refresh
// @desc Refresh access token using refresh token
// @access Public
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ 
        success: false, 
        message: 'Refresh token required' 
      });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch (error) {
      console.error('Refresh token verification failed:', error);
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid or expired refresh token' 
      });
    }

    // Check if refresh token exists in cache
    const cachedRefreshToken = await cacheService.getSession(`refresh:${refreshToken}`);
    if (!cachedRefreshToken) {
      return res.status(401).json({ 
        success: false, 
        message: 'Refresh token has been revoked' 
      });
    }

    // Get user from database
    const user = await User.findById(decoded.user._id).select('+User_tokenVersion');
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Check token version
    if (decoded.user.tokenVersion !== user.User_tokenVersion) {
      return res.status(401).json({ 
        success: false, 
        message: 'Session expired. Please log in again.' 
      });
    }

    // Generate new access token
    const payload = { 
      user: { 
        _id: user._id,
        tokenVersion: user.User_tokenVersion || 0
      } 
    };
    const newToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.json({ 
      success: true, 
      token: newToken,
      message: 'Token refreshed successfully' 
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during token refresh' 
    });
  }
});

router.post('/forgot-password', 
  passwordResetLimiter,
  validateRequestBody({
    User_email: { type: 'email', required: true }
  }),
  async (req, res) => {
  const { User_email } = req.body;

  try {
    const user = await User.findOne({ User_email });
    if (!user) {
      return res.status(404).json({ message: 'User not found with this email.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.User_resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.User_resetPasswordExpire = Date.now() + 3600000; // Token valid for 1 hour

    await user.save();

    const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${clientUrl.replace(/\/$/, '')}/reset-password/${resetToken}`;

    try {
      await sendPasswordResetEmail({
        to: user.User_email,
        resetUrl,
      });
    } catch (emailError) {
      console.error('Password reset email failed:', emailError.message);
      return res.status(502).json({
        message: 'We couldn’t send the reset email right now. Please try again shortly.'
      });
    }

    res.status(200).json({ message: 'Email sent. Please check your inbox.' });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Server error, please try again later.' });
  }
});

// @route PUT /api/auth/reset-password/:token
// @desc Reset the user's password using the reset token
router.put('/reset-password/:token',
  validateRequestBody({
    User_password: { type: 'text', required: true, minLength: 8, maxLength: 100 }
  }),
  async (req, res) => {
  const { User_password } = req.body;
  const resetToken = req.params.token;

  try {
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    const user = await User.findOne({
      User_resetPasswordToken: hashedToken,
      User_resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) return res.status(400).json({ message: 'Invalid or expired reset token' });

    user.User_password = User_password;
    user.User_resetPasswordToken = undefined;
    user.User_resetPasswordExpire = undefined;

    await user.save();

    res.status(200).json({ message: 'Password has been reset successfully!' });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Server error, please try again later.' });
  }
});

// @route GET /api/auth/profile
// @desc Get the authenticated user's profile
// @access Private (Protected route)
router.get('/profile', authenticateUser, async (req, res) => {
  try {
    // Verify if req.user exists and has an _id field
    console.log('Authenticated user ID:', req.user._id);  // For debugging

    const user = await User.findById(req.user._id).select('-User_password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Create a response object with the full URL for the profile picture
    const userResponse = user.toObject();
    
    // If there's a profile picture, include the full URL in the response
    if (user.User_profilePicture) {
      const baseUrl = process.env.REACT_APP_API_URL ? 
        process.env.REACT_APP_API_URL.replace('/api', '') : 
        'http://localhost:5001';
      userResponse.User_profilePicture = `${baseUrl}${user.User_profilePicture}`;
    }

    res.json(userResponse);
  } catch (err) {
    console.error('Error retrieving profile:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Use the upload middleware for profile update
router.put('/profile', authenticateUser, upload.single('User_profilePicture'), async (req, res) => {
  // Handle profile update logic here
  try {
    const { User_name, User_email, User_location, User_bio } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId).select('-User_password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Update user profile
   user.User_name = User_name || user.User_name;
   user.User_email = User_email || user.User_email;
   user.User_location = User_location || user.User_location;
   user.User_bio = User_bio || user.User_bio;


    if (req.file) {
      const filename = req.file.filename;
      user.User_profilePicture = `/uploads/${filename}`;  // Store relative path in database
    }

    await user.save();
    
    // Invalidate user cache after profile update
    await cacheService.invalidateUser(userId);
    await invalidateCache(`user:${userId}:*`);
    
    // Create a response object with the full URL for the profile picture
    const userResponse = user.toObject();
    userResponse.User_password = undefined;
    
    // If there's a profile picture, include the full URL in the response
    if (user.User_profilePicture) {
      const baseUrl = process.env.REACT_APP_API_URL ? 
        process.env.REACT_APP_API_URL.replace('/api', '') : 
        'http://localhost:5001';
      userResponse.User_profilePicture = `${baseUrl}${user.User_profilePicture}`;
    }
    
    res.status(200).json(userResponse);  // Send the updated user back with full URLs
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/group-users/:groupId', authenticateUser, normalizeObjectIdParams(['groupId']), async (req, res) => {
  try {
    const { groupId } = req.params;

    // Validate groupId format (already normalized by middleware)
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      console.log('Invalid group ID format:', groupId);
      return res.status(400).json({ message: 'Invalid group ID format.' });
    }

    console.log('Group-users endpoint - Group ID received:', groupId, 'Type:', typeof groupId);

    // Find the group and populate 'members.userId' to fetch user details (name, email)
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: 'Group not found.' });
    }
    const members = await GroupMember.find({ 
      GroupMember_groupId: groupId 
    }).populate('GroupMember_userId', 'User_name User_email')
      .sort({ GroupMember_role: -1, GroupMember_joinedAt: 1 }); // Sort by role (admins first), then join date

    // Extract only user details from populated members
    const users = members.map(member => ({
      _id: member.GroupMember_userId._id.toString(),
      User_name: member.GroupMember_userId.User_name,
      User_email: member.GroupMember_userId.User_email,
      isAdmin: member.GroupMember_role === 'admin',
      isCreator: group.Group_createdBy?.toString() === member.GroupMember_userId._id.toString(),
      joinedAt: member.GroupMember_joinedAt,
      lastActive: member.GroupMember_lastActive
    }));


    // Respond with the list of users
    res.status(200).json({ 
      users,
      group: {
      _id: group._id,
      name: group.Group_name,
      createdBy: group.Group_createdBy,
      Group_createdAt: group.Group_createdAt,
      Group_updatedAt: group.Group_updatedAt,
      }
 });
  } catch (error) {
    console.error('Error fetching group users:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


// Debug route to list uploaded files
router.get('/debug/files', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const uploadsPath = path.join(__dirname, '../uploads');
  
  fs.readdir(uploadsPath, (err, files) => {
    if (err) {
      console.error('Error reading uploads directory:', err);
      return res.status(500).json({ error: 'Error reading uploads directory' });
    }
    
    // Get file stats for each file
    const fileList = files.map(file => {
      const filePath = path.join(uploadsPath, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
        modified: stats.mtime,
        url: `/uploads/${file}`
      };
    });
    
    res.json({ files: fileList });
  });
});

module.exports = router;
// Search users
router.get('/users/search', authenticateUser, async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    const currentUserId = req.user._id;

    if (!q || q.trim().length === 0) {
      return res.json({ users: [] });
    }

    // Get groups where current user is a member
    const userGroups = await GroupMember.find({ 
      GroupMember_userId: currentUserId 
    }).select('GroupMember_groupId');
    
    const groupIds = userGroups.map(member => member.GroupMember_groupId);

    // Find users who are in the same groups as current user
    const groupMembers = await GroupMember.find({
      GroupMember_groupId: { $in: groupIds },
      GroupMember_userId: { $ne: currentUserId } // Exclude current user
    }).select('GroupMember_userId');

    const userIds = [...new Set(groupMembers.map(member => member.GroupMember_userId))];

    // Search users by name or email
    const users = await User.find({
      _id: { $in: userIds },
      $or: [
        { User_name: { $regex: q, $options: 'i' } },
        { User_email: { $regex: q, $options: 'i' } }
      ]
    })
    .limit(parseInt(limit))
    .select('User_name User_email User_profilePicture User_role User_createdAt')
    .sort({ User_name: 1 });

    res.json({ 
      success: true, 
      users: users,
      total: users.length
    });
  } catch (error) {
    console.error('User search error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error searching users', 
      error: error.message 
    });
  }
});
