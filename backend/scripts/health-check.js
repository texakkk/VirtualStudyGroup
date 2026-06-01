require('dotenv').config();
const mongoose = require('mongoose');

// Import all models to test them
const User = require('../models/User');
const Group = require('../models/Group');
const VideoSession = require('../models/VideoSession');
const MediaSession = require('../models/MediaSession');

async function healthCheck() {
    try {
        console.log('🏥 Starting health check...');

        // Connect to database
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Database connection successful');

        // Test basic queries
        console.log('🔍 Testing model queries...');

        const userCount = await User.countDocuments();
        console.log(`✅ Users collection: ${userCount} documents`);

        const groupCount = await Group.countDocuments();
        console.log(`✅ Groups collection: ${groupCount} documents`);

        const videoSessionCount = await VideoSession.countDocuments();
        console.log(`✅ VideoSessions collection: ${videoSessionCount} documents`);

        const mediaSessionCount = await MediaSession.countDocuments();
        console.log(`✅ MediaSessions collection: ${mediaSessionCount} documents`);

        // Test index status
        console.log('📊 Checking indexes...');
        const videoIndexes = await VideoSession.collection.getIndexes();
        console.log(`✅ VideoSession indexes: ${Object.keys(videoIndexes).length}`);

        const mediaIndexes = await MediaSession.collection.getIndexes();
        console.log(`✅ MediaSession indexes: ${Object.keys(mediaIndexes).length}`);

        console.log('🎉 Health check completed successfully!');

    } catch (error) {
        console.error('❌ Health check failed:', error.message);
        if (error.code === 11000) {
            console.error('🔍 This is a duplicate key error. Check for duplicate data or conflicting indexes.');
        }
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Database connection closed');
        process.exit(0);
    }
}

healthCheck();