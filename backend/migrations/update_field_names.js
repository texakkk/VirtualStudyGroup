const mongoose = require('mongoose');
require('dotenv').config();

// Models need to be registered with the new schemas
require('../models/User');
require('../models/Group');
require('../models/GroupMember');
require('../models/Task');

async function runMigration() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;

    // 1. Update Task collection - Rename Task_group to Task_groupId
    console.log('Updating Task collection...');
    await db.collection('tasks').updateMany(
      { Task_group: { $exists: true } },
      [
        {
          $set: {
            Task_groupId: '$Task_group'
          }
        },
        { $unset: 'Task_group' }
      ],
      { multi: true }
    );

    // 2. Update GroupMember collection - Rename GroupMember_user to GroupMember_userId
    console.log('Updating GroupMember collection...');
    await db.collection('groupmembers').updateMany(
      { GroupMember_user: { $exists: true } },
      [
        {
          $set: {
            GroupMember_userId: '$GroupMember_user'
          }
        },
        { $unset: 'GroupMember_user' }
      ],
      { multi: true }
    );

    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
