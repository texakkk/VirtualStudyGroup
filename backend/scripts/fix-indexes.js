require('dotenv').config();
const mongoose = require('mongoose');

// Import models to ensure indexes are defined
const VideoSession = require('../models/VideoSession');
const MediaSession = require('../models/MediaSession');
const Group = require('../models/Group');
const User = require('../models/User');

async function fixIndexes() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Drop and recreate problematic indexes
    console.log('🔧 Fixing VideoSession indexes...');
    try {
      await VideoSession.collection.dropIndex('unique_active_video_session_per_group');
      console.log('✅ Dropped old VideoSession index');
    } catch (error) {
      console.log('ℹ️ VideoSession index not found (this is normal)');
    }

    console.log('🔧 Fixing MediaSession indexes...');
    try {
      await MediaSession.collection.dropIndex('unique_active_media_session_per_group');
      console.log('✅ Dropped old MediaSession index');
    } catch (error) {
      console.log('ℹ️ MediaSession index not found (this is normal)');
    }

    // Recreate indexes by calling ensureIndexes
    console.log('🔧 Recreating VideoSession indexes...');
    await VideoSession.ensureIndexes();
    console.log('✅ VideoSession indexes recreated');

    console.log('🔧 Recreating MediaSession indexes...');
    await MediaSession.ensureIndexes();
    console.log('✅ MediaSession indexes recreated');

    console.log('🔧 Ensuring other model indexes...');
    await Group.ensureIndexes();
    await User.ensureIndexes();
    console.log('✅ All indexes verified');

    console.log('🎉 Index fix completed successfully!');
    
  } catch (error) {
    console.error('❌ Error fixing indexes:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
}

// Run the fix
fixIndexes();