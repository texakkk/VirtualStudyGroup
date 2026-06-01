const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/authMiddleware');
const Note = require('../models/Note');
const DocumentCollaboration = require('../models/DocumentCollaboration');

// Get collaboration status for a document
router.get('/:documentId/status', authenticateUser, async (req, res) => {
  try {
    const { documentId } = req.params;
    const userId = req.user._id;

    // Check if user has read permission for the document
    const note = await Note.findById(documentId);
    if (!note) {
      return res.status(404).json({ message: 'Document not found' });
    }

    if (!note.hasReadPermission(userId)) {
      return res.status(403).json({ message: 'No permission to access this document' });
    }

    // Get collaboration session
    const collaboration = await DocumentCollaboration.findOne({ DocCollab_documentId: documentId })
      .populate('DocCollab_activeUsers.userId', 'User_name User_email');

    if (!collaboration) {
      return res.json({
        documentId,
        isActive: false,
        activeUsers: [],
        version: 1,
        lastModified: note.Note_updatedAt
      });
    }

    // Filter out inactive users (last activity > 5 minutes ago)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const activeUsers = collaboration.DocCollab_activeUsers
      .filter(user => user.lastActivity > fiveMinutesAgo)
      .map(user => ({
        userId: user.userId._id,
        userName: user.userId.User_name,
        cursor: user.cursor,
        selection: user.selection,
        lastActivity: user.lastActivity
      }));

    res.json({
      documentId,
      isActive: activeUsers.length > 0,
      activeUsers,
      version: collaboration.DocCollab_version,
      lastModified: collaboration.DocCollab_lastModified
    });
  } catch (error) {
    console.error('Error getting collaboration status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get document collaboration history
router.get('/:documentId/history', authenticateUser, async (req, res) => {
  try {
    const { documentId } = req.params;
    const { fromVersion, limit = 50, page = 1 } = req.query;
    const userId = req.user._id;

    // Check if user has read permission for the document
    const note = await Note.findById(documentId);
    if (!note) {
      return res.status(404).json({ message: 'Document not found' });
    }

    if (!note.hasReadPermission(userId)) {
      return res.status(403).json({ message: 'No permission to access this document' });
    }

    // Get collaboration session
    const collaboration = await DocumentCollaboration.findOne({ DocCollab_documentId: documentId })
      .populate('DocCollab_changes.userId', 'User_name User_email');

    if (!collaboration) {
      return res.json({
        documentId,
        changes: [],
        currentVersion: 1,
        totalChanges: 0,
        page: parseInt(page),
        limit: parseInt(limit)
      });
    }

    // Filter changes based on version if specified
    let changes = collaboration.DocCollab_changes;
    if (fromVersion) {
      changes = changes.filter((change, index) => index >= parseInt(fromVersion) - 1);
    }

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedChanges = changes.slice(startIndex, endIndex);

    const formattedChanges = paginatedChanges.map(change => ({
      userId: change.userId._id,
      userName: change.userId.User_name,
      operation: change.operation,
      position: change.position,
      length: change.length,
      content: change.content,
      attributes: change.attributes,
      timestamp: change.timestamp,
      changeId: change.changeId
    }));

    res.json({
      documentId,
      changes: formattedChanges,
      currentVersion: collaboration.DocCollab_version,
      totalChanges: changes.length,
      page: parseInt(page),
      limit: parseInt(limit),
      hasMore: endIndex < changes.length
    });
  } catch (error) {
    console.error('Error getting collaboration history:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Force sync document content (admin only)
router.post('/:documentId/sync', authenticateUser, async (req, res) => {
  try {
    const { documentId } = req.params;
    const userId = req.user._id;

    // Check if user has admin permission for the document
    const note = await Note.findById(documentId);
    if (!note) {
      return res.status(404).json({ message: 'Document not found' });
    }

    if (!note.hasAdminPermission(userId)) {
      return res.status(403).json({ message: 'Admin permission required' });
    }

    // Get collaboration session
    const collaboration = await DocumentCollaboration.findOne({ DocCollab_documentId: documentId });
    
    if (!collaboration) {
      return res.json({ message: 'No active collaboration session' });
    }

    // Get the document collaboration namespace
    const documentCollabNamespace = req.app.get('documentCollabNamespace');
    
    if (documentCollabNamespace) {
      // Broadcast sync event to all users in the document
      documentCollabNamespace.to(documentId).emit('documentSync', {
        documentId,
        content: note.Note_content,
        version: collaboration.DocCollab_version,
        timestamp: new Date()
      });
    }

    res.json({ 
      message: 'Document sync initiated',
      version: collaboration.DocCollab_version
    });
  } catch (error) {
    console.error('Error syncing document:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Clean up inactive collaboration sessions
router.post('/cleanup', authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // This endpoint could be restricted to admin users only
    // For now, any authenticated user can trigger cleanup
    
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    // Find collaboration sessions with no recent activity
    const inactiveSessions = await DocumentCollaboration.find({
      'DocCollab_activeUsers.lastActivity': { $lt: oneHourAgo }
    });

    let cleanedCount = 0;
    
    for (const session of inactiveSessions) {
      // Remove inactive users
      const activeUsers = session.DocCollab_activeUsers.filter(
        user => user.lastActivity > oneHourAgo
      );
      
      if (activeUsers.length === 0) {
        // If no active users, clean up old changes but keep the session
        await session.cleanupOldChanges();
        session.DocCollab_activeUsers = [];
        await session.save();
        cleanedCount++;
      } else {
        // Update with only active users
        session.DocCollab_activeUsers = activeUsers;
        await session.save();
      }
    }

    res.json({ 
      message: `Cleaned up ${cleanedCount} inactive collaboration sessions`,
      cleanedSessions: cleanedCount
    });
  } catch (error) {
    console.error('Error cleaning up collaboration sessions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;