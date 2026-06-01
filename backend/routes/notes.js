const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Note = require('../models/Note');
const NoteVersion = require('../models/NoteVersion');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const { authenticateUser } = require('../middleware/authMiddleware');
const documentConversionService = require('../services/documentConversionService');
const cacheService = require('../services/cacheService');
const multer = require('multer');
const path = require('path');

const parseVersionParam = (version) => {
  const parsedVersion = Number(version);
  return Number.isInteger(parsedVersion) && parsedVersion >= 1 ? parsedVersion : null;
};

const getUserIdString = (userId) => {
  if (!userId) return '';
  if (userId._id && userId._id !== userId) return getUserIdString(userId._id);
  if (typeof userId.toString === 'function') {
    const stringified = userId.toString();
    return stringified === '[object Object]' ? '' : stringified;
  }
  return String(userId);
};

const invalidateDashboardSummaryForUsers = async (...userIds) => {
  const uniqueUserIds = [...new Set(userIds.map(getUserIdString).filter(Boolean))];

  await Promise.all(uniqueUserIds.map((userId) => (
    cacheService.invalidateQueryPattern(`dashboard:summary:${userId}:*`)
  )));
};

const serializeNoteForUser = (note, userId) => {
  if (!note) return note;

  const noteObject = typeof note.toObject === 'function' ? note.toObject() : note;

  return {
    ...noteObject,
    canEdit: typeof note.hasWritePermission === 'function'
      ? note.hasWritePermission(userId)
      : false,
    canRead: typeof note.hasReadPermission === 'function'
      ? note.hasReadPermission(userId) || note.Note_isPublic
      : Boolean(note.Note_isPublic),
  };
};

// Configure multer for document uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../temp/uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt', '.rtf'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${fileExtension} is not supported for conversion`), false);
    }
  }
});

// Create a new note
router.post('/', authenticateUser, async (req, res) => {
  try {
    const { Note_title, Note_content, Note_format, Note_groupId, Note_tags, Note_isPublic } = req.body;
    const userId = req.user._id;

    // Validate required fields
    if (!Note_title || !Note_content || !Note_groupId) {
      return res.status(400).json({
        success: false,
        message: 'Title, content, and group ID are required'
      });
    }

    // Validate groupId format
    const trimmedGroupId = typeof Note_groupId === 'string' ? Note_groupId.trim() : Note_groupId;
    if (!mongoose.Types.ObjectId.isValid(trimmedGroupId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID format'
      });
    }

    // Check if user is a member of the group
    const membership = await GroupMember.findOne({
      GroupMember_groupId: trimmedGroupId,
      GroupMember_userId: userId
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: 'You must be a member of the group to create notes'
      });
    }

    // Create the note
    const note = new Note({
      Note_title: Note_title.trim(),
      Note_content,
      Note_format: Note_format || 'richtext',
      Note_groupId: trimmedGroupId,
      Note_createdBy: userId,
      Note_tags: Note_tags || [],
      Note_isPublic: Note_isPublic || false,
      Note_permissions: {
        read: [],
        write: [],
        admin: []
      }
    });

    await note.save();

    // Create initial version
    await NoteVersion.createFromNote(note, userId, 'Initial version', 'created');

    // Populate the response
    const populatedNote = await Note.findById(note._id)
      .populate('Note_createdBy', 'User_name User_email')
      .populate('Note_groupId', 'Group_name');

    await invalidateDashboardSummaryForUsers(userId);

    res.status(201).json({
      success: true,
      message: 'Note created successfully',
      note: serializeNoteForUser(populatedNote, userId)
    });
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create note',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get notes for a group
router.get('/group/:groupId', authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { page = 1, limit = 10, search, tags, format } = req.query;
    const userId = req.user._id;

    // Check if user is a member of the group
    const membership = await GroupMember.findOne({
      GroupMember_groupId: groupId,
      GroupMember_userId: userId
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: 'You must be a member of the group to view notes'
      });
    }

    // Build query
    const query = { Note_groupId: groupId };

    // Add search filter
    if (search) {
      query.$text = { $search: search };
    }

    // Add tags filter
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : tags.split(',');
      query.Note_tags = { $in: tagArray };
    }

    // Add format filter
    if (format) {
      query.Note_format = format;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get notes with permission filtering
    const notes = await Note.find(query)
      .populate('Note_createdBy', 'User_name User_email')
      .populate('Note_collaborators', 'User_name User_email')
      .populate('Note_permissions.read', 'User_name User_email')
      .populate('Note_permissions.write', 'User_name User_email')
      .populate('Note_permissions.admin', 'User_name User_email')
      .sort({ Note_updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Filter notes based on permissions
    const accessibleNotes = notes.filter(note => 
      note.hasReadPermission(userId) || note.Note_isPublic
    );

    // Get total count for pagination
    const totalNotes = await Note.countDocuments(query);

    res.status(200).json({
      success: true,
      notes: accessibleNotes.map(note => serializeNoteForUser(note, userId)),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalNotes / parseInt(limit)),
        totalNotes,
        hasNextPage: skip + accessibleNotes.length < totalNotes,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching group notes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get supported conversion formats (MUST be before /:noteId to avoid route conflict)
router.get('/conversion/formats', authenticateUser, async (req, res) => {
  try {
    const formats = documentConversionService.getSupportedFormats();
    
    res.status(200).json({
      success: true,
      formats
    });
  } catch (error) {
    console.error('Error getting supported formats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get supported formats',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Convert document to note (MUST be before /:noteId to avoid route conflict)
router.post('/convert', authenticateUser, upload.single('document'), async (req, res) => {
  try {
    const { Note_title, Note_groupId, Note_tags, Note_isPublic } = req.body;
    const userId = req.user._id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Document file is required'
      });
    }

    if (!Note_groupId) {
      return res.status(400).json({
        success: false,
        message: 'Group ID is required'
      });
    }

    // Validate groupId format
    const trimmedGroupId = typeof Note_groupId === 'string' ? Note_groupId.trim() : Note_groupId;
    if (!mongoose.Types.ObjectId.isValid(trimmedGroupId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID format'
      });
    }

    // Check if user is a member of the group
    const membership = await GroupMember.findOne({
      GroupMember_groupId: trimmedGroupId,
      GroupMember_userId: userId
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: 'You must be a member of the group to create notes'
      });
    }

    // Convert document to note
    const noteData = {
      Note_title,
      Note_groupId: trimmedGroupId,
      Note_tags: Note_tags ? JSON.parse(Note_tags) : [],
      Note_isPublic: Note_isPublic === 'true'
    };

    const conversionResult = await documentConversionService.convertDocumentToNote(
      req.file.path,
      noteData,
      userId
    );

    if (!conversionResult.success) {
      return res.status(500).json({
        success: false,
        message: conversionResult.error
      });
    }

    // Populate the response
    const populatedNote = await Note.findById(conversionResult.note._id)
      .populate('Note_createdBy', 'User_name User_email')
      .populate('Note_groupId', 'Group_name');

    await invalidateDashboardSummaryForUsers(userId);

    res.status(201).json({
      success: true,
      message: 'Document converted to note successfully',
      note: serializeNoteForUser(populatedNote, userId),
      conversionMetadata: conversionResult.conversionMetadata
    });

  } catch (error) {
    console.error('Error converting document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to convert document',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get a specific note by ID (MUST be after all fixed-path GET routes)
router.get('/:noteId', authenticateUser, async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.user._id;

    const note = await Note.findById(noteId)
      .populate('Note_createdBy', 'User_name User_email')
      .populate('Note_collaborators', 'User_name User_email')
      .populate('Note_groupId', 'Group_name')
      .populate('Note_permissions.read', 'User_name User_email')
      .populate('Note_permissions.write', 'User_name User_email')
      .populate('Note_permissions.admin', 'User_name User_email');

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    // Check if user has read permission
    if (!note.hasReadPermission(userId) && !note.Note_isPublic) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this note'
      });
    }

    res.status(200).json({
      success: true,
      note: serializeNoteForUser(note, userId)
    });
  } catch (error) {
    console.error('Error fetching note:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch note',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update a note
router.put('/:noteId', authenticateUser, async (req, res) => {
  try {
    const { noteId } = req.params;
    const { Note_title, Note_content, Note_tags, Note_isPublic, changes } = req.body;
    const userId = req.user._id;

    if (!noteId || noteId === 'undefined' || !mongoose.Types.ObjectId.isValid(noteId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid note ID'
      });
    }

    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    // Check if user has write permission
    if (!note.hasWritePermission(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to edit this note'
      });
    }

    // Store original content for version tracking
    const originalContent = note.Note_content;
    const originalTitle = note.Note_title;

    // Update note fields
    if (Note_title !== undefined) note.Note_title = Note_title.trim();
    if (Note_content !== undefined) note.Note_content = Note_content;
    if (Note_tags !== undefined) note.Note_tags = Note_tags;
    if (Note_isPublic !== undefined) note.Note_isPublic = Note_isPublic;

    await note.save();

    // Create version if content or title changed
    if (Note_content !== originalContent || Note_title !== originalTitle) {
      const changeDescription = changes || 'Updated note content';
      const changeType = Note_title !== originalTitle ? 'title_updated' : 'content_updated';
      await NoteVersion.createFromNote(note, userId, changeDescription, changeType);
    }

    // Populate and return updated note
    const updatedNote = await Note.findById(noteId)
      .populate('Note_createdBy', 'User_name User_email')
      .populate('Note_collaborators', 'User_name User_email')
      .populate('Note_groupId', 'Group_name');

    await invalidateDashboardSummaryForUsers(userId, note.Note_createdBy);

    res.status(200).json({
      success: true,
      message: 'Note updated successfully',
      note: serializeNoteForUser(updatedNote, userId)
    });
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update note',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete a note
router.delete('/:noteId', authenticateUser, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { noteId } = req.params;
    const userId = req.user._id;

    const note = await Note.findById(noteId).session(session);
    if (!note) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }
    const noteCreatorId = note.Note_createdBy;

    // Check if user has admin permission or is the creator
    if (!note.hasAdminPermission(userId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this note'
      });
    }

    // Delete all versions of the note
    await NoteVersion.deleteMany({ NoteVersion_noteId: noteId }).session(session);

    // Delete the note
    await Note.findByIdAndDelete(noteId).session(session);

    await session.commitTransaction();
    session.endSession();

    await invalidateDashboardSummaryForUsers(userId, noteCreatorId);

    res.status(200).json({
      success: true,
      message: 'Note deleted successfully'
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error deleting note:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete note',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Share note with users (manage permissions)
router.post('/:noteId/share', authenticateUser, async (req, res) => {
  try {
    const { noteId } = req.params;
    const { userIds, permissionType = 'read' } = req.body;
    const userId = req.user._id;

    if (!noteId || noteId === 'undefined' || !mongoose.Types.ObjectId.isValid(noteId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid note ID'
      });
    }

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'User IDs array is required'
      });
    }

    const invalidUserIds = userIds.filter(targetUserId => (
      !targetUserId || !mongoose.Types.ObjectId.isValid(targetUserId)
    ));

    if (invalidUserIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'All user IDs must be valid'
      });
    }

    if (!['read', 'write', 'admin'].includes(permissionType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid permission type. Must be read, write, or admin'
      });
    }

    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    // Check if user has admin permission
    if (!note.hasAdminPermission(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to share this note'
      });
    }

    // Add permissions for each user
    for (const targetUserId of userIds) {
      await note.addPermission(targetUserId, permissionType);
    }

    // Create version for permission change
    await NoteVersion.createFromNote(
      note, 
      userId, 
      `Shared with ${userIds.length} user(s) with ${permissionType} permission`, 
      'permissions_updated'
    );

    const updatedNote = await Note.findById(noteId)
      .populate('Note_createdBy', 'User_name User_email')
      .populate('Note_groupId', 'Group_name')
      .populate('Note_collaborators', 'User_name User_email')
      .populate('Note_permissions.read', 'User_name User_email')
      .populate('Note_permissions.write', 'User_name User_email')
      .populate('Note_permissions.admin', 'User_name User_email');

    await invalidateDashboardSummaryForUsers(userId, note.Note_createdBy, ...userIds);

    res.status(200).json({
      success: true,
      message: 'Note shared successfully',
      note: serializeNoteForUser(updatedNote, userId)
    });
  } catch (error) {
    console.error('Error sharing note:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to share note',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Remove user permissions from note
router.delete('/:noteId/share/:targetUserId', authenticateUser, async (req, res) => {
  try {
    const { noteId, targetUserId } = req.params;
    const permissionType = req.query.permissionType || req.body?.permissionType;
    const userId = req.user._id;

    if (!noteId || noteId === 'undefined' || !mongoose.Types.ObjectId.isValid(noteId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid note ID'
      });
    }

    if (!targetUserId || targetUserId === 'undefined' || !mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid target user ID'
      });
    }

    if (!permissionType || !['read', 'write', 'admin'].includes(permissionType)) {
      return res.status(400).json({
        success: false,
        message: 'Valid permission type is required (read, write, or admin)'
      });
    }

    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    // Check if user has admin permission
    if (!note.hasAdminPermission(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to modify note permissions'
      });
    }

    // Cannot remove permissions from the creator
    if (note.Note_createdBy.toString() === targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove permissions from note creator'
      });
    }

    await note.removePermission(targetUserId, permissionType);

    // Create version for permission change
    await NoteVersion.createFromNote(
      note, 
      userId, 
      `Removed ${permissionType} permission from user`, 
      'permissions_updated'
    );

    const updatedNote = await Note.findById(noteId)
      .populate('Note_createdBy', 'User_name User_email')
      .populate('Note_groupId', 'Group_name')
      .populate('Note_collaborators', 'User_name User_email')
      .populate('Note_permissions.read', 'User_name User_email')
      .populate('Note_permissions.write', 'User_name User_email')
      .populate('Note_permissions.admin', 'User_name User_email');

    await invalidateDashboardSummaryForUsers(userId, note.Note_createdBy, targetUserId);

    res.status(200).json({
      success: true,
      message: 'Permission removed successfully',
      note: serializeNoteForUser(updatedNote, userId)
    });
  } catch (error) {
    console.error('Error removing permission:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove permission',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get note version history
router.get('/:noteId/versions', authenticateUser, async (req, res) => {
  try {
    const { noteId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const userId = req.user._id;

    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    // Check if user has read permission
    if (!note.hasReadPermission(userId) && !note.Note_isPublic) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this note\'s history'
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const versions = await NoteVersion.getVersionHistory(noteId, parseInt(limit), skip);
    const totalVersions = await NoteVersion.countDocuments({ NoteVersion_noteId: noteId });

    res.status(200).json({
      success: true,
      versions,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalVersions / parseInt(limit)),
        totalVersions,
        hasNextPage: skip + versions.length < totalVersions,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching version history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch version history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get specific version of a note
router.get('/:noteId/versions/:version', authenticateUser, async (req, res) => {
  try {
    const { noteId, version } = req.params;
    const userId = req.user._id;
    const versionNumber = parseVersionParam(version);

    if (!versionNumber) {
      return res.status(400).json({
        success: false,
        message: 'Invalid version number'
      });
    }

    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    // Check if user has read permission
    if (!note.hasReadPermission(userId) && !note.Note_isPublic) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this note version'
      });
    }

    const noteVersion = await NoteVersion.getVersion(noteId, versionNumber);
    if (!noteVersion) {
      return res.status(404).json({
        success: false,
        message: 'Version not found'
      });
    }

    res.status(200).json({
      success: true,
      version: noteVersion
    });
  } catch (error) {
    console.error('Error fetching note version:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch note version',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Rollback note to a specific version
router.post('/:noteId/rollback/:version', authenticateUser, async (req, res) => {
  try {
    const { noteId, version } = req.params;
    const userId = req.user._id;
    const versionNumber = parseVersionParam(version);

    if (!versionNumber) {
      return res.status(400).json({
        success: false,
        message: 'Invalid version number'
      });
    }

    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    // Check if user has write permission
    if (!note.hasWritePermission(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to rollback this note'
      });
    }

    const targetVersion = await NoteVersion.getVersion(noteId, versionNumber);
    if (!targetVersion) {
      return res.status(404).json({
        success: false,
        message: 'Target version not found'
      });
    }

    // Update note with version content
    note.Note_content = targetVersion.NoteVersion_content;
    note.Note_title = targetVersion.NoteVersion_title;
    await note.save();

    // Create new version for rollback
    await NoteVersion.createFromNote(
      note, 
      userId, 
      `Rolled back to version ${versionNumber}`, 
      'content_updated'
    );

    const updatedNote = await Note.findById(noteId)
      .populate('Note_createdBy', 'User_name User_email')
      .populate('Note_collaborators', 'User_name User_email')
      .populate('Note_groupId', 'Group_name');

    await invalidateDashboardSummaryForUsers(userId, note.Note_createdBy);

    res.status(200).json({
      success: true,
      message: 'Note rolled back successfully',
      note: serializeNoteForUser(updatedNote, userId)
    });
  } catch (error) {
    console.error('Error rolling back note:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to rollback note',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Add/remove collaborators
router.post('/:noteId/collaborators', authenticateUser, async (req, res) => {
  try {
    const { noteId } = req.params;
    const { userIds, action = 'add' } = req.body;
    const userId = req.user._id;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'User IDs array is required'
      });
    }

    if (!['add', 'remove'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action must be either "add" or "remove"'
      });
    }

    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    // Check if user has admin permission
    if (!note.hasAdminPermission(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage collaborators'
      });
    }

    // Add or remove collaborators
    for (const targetUserId of userIds) {
      if (action === 'add') {
        await note.addCollaborator(targetUserId);
      } else {
        await note.removeCollaborator(targetUserId);
      }
    }

    // Create version for collaborator change
    await NoteVersion.createFromNote(
      note, 
      userId, 
      `${action === 'add' ? 'Added' : 'Removed'} ${userIds.length} collaborator(s)`, 
      'collaborators_updated'
    );

    const updatedNote = await Note.findById(noteId)
      .populate('Note_collaborators', 'User_name User_email');

    res.status(200).json({
      success: true,
      message: `Collaborators ${action === 'add' ? 'added' : 'removed'} successfully`,
      note: serializeNoteForUser(updatedNote, userId)
    });
  } catch (error) {
    console.error('Error managing collaborators:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to manage collaborators',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Export note to document format
router.get('/:noteId/export/:format', authenticateUser, async (req, res) => {
  try {
    const { noteId, format } = req.params;
    const { title, author } = req.query;
    const userId = req.user._id;

    if (!noteId || noteId === 'undefined' || !mongoose.Types.ObjectId.isValid(noteId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid note ID'
      });
    }

    // Validate format
    const supportedFormats = ['pdf', 'docx', 'txt'];
    if (!supportedFormats.includes(format.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Unsupported export format. Supported formats: ${supportedFormats.join(', ')}`
      });
    }

    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    // Check if user has read permission
    if (!note.hasReadPermission(userId) && !note.Note_isPublic) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to export this note'
      });
    }

    // Export note to document
    const exportOptions = {};
    if (title) exportOptions.title = title;
    if (author) exportOptions.author = author;

    const exportResult = await documentConversionService.exportNoteToDocument(
      noteId,
      format,
      exportOptions
    );

    if (!exportResult.success) {
      return res.status(500).json({
        success: false,
        message: exportResult.error
      });
    }

    // Send file as download
    const fs = require('fs');
    if (fs.existsSync(exportResult.filePath)) {
      res.setHeader('Content-Disposition', `attachment; filename="${exportResult.fileName}"`);
      res.setHeader('Content-Type', getContentType(format));
      
      const fileStream = fs.createReadStream(exportResult.filePath);
      fileStream.pipe(res);

      // Clean up file after sending
      fileStream.on('end', () => {
        fs.unlink(exportResult.filePath, (err) => {
          if (err) console.error('Error cleaning up export file:', err);
        });
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Export file not found'
      });
    }

  } catch (error) {
    console.error('Error exporting note:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export note',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Helper function to get content type for file downloads
function getContentType(format) {
  const contentTypes = {
    'pdf': 'application/pdf',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'txt': 'text/plain'
  };
  return contentTypes[format.toLowerCase()] || 'application/octet-stream';
}

module.exports = router;
