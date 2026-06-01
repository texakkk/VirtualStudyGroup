const User = require('../models/User');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');

/**
 * Location Service
 * Handles location-based features including tracking, privacy, and group discovery
 */

class LocationService {
  /**
   * Update user location
   */
  async updateUserLocation(userId, { latitude, longitude, locationString, privacy }) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Update coordinates (GeoJSON format: [longitude, latitude])
      if (latitude !== undefined && longitude !== undefined) {
        user.User_coordinates = {
          type: 'Point',
          coordinates: [parseFloat(longitude), parseFloat(latitude)]
        };
      }

      // Update location string (city, country, etc.)
      if (locationString !== undefined) {
        user.User_location = locationString;
      }

      // Update privacy setting
      if (privacy !== undefined) {
        user.User_locationPrivacy = privacy;
      }

      await user.save();

      return {
        success: true,
        location: {
          coordinates: user.User_coordinates.coordinates,
          locationString: user.User_location,
          privacy: user.User_locationPrivacy
        }
      };
    } catch (error) {
      console.error('Error updating user location:', error);
      throw error;
    }
  }

  /**
   * Get nearby users
   * @param {String} userId - Current user ID
   * @param {Number} maxDistance - Maximum distance in meters (default: 10km)
   * @param {Number} limit - Maximum number of results
   */
  async getNearbyUsers(userId, maxDistance = 10000, limit = 20) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.User_coordinates || !user.User_coordinates.coordinates) {
        throw new Error('User location not set');
      }

      const [longitude, latitude] = user.User_coordinates.coordinates;

      // Find nearby users with public location
      const nearbyUsers = await User.find({
        _id: { $ne: userId }, // Exclude current user
        User_locationPrivacy: 'public',
        User_coordinates: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [longitude, latitude]
            },
            $maxDistance: maxDistance
          }
        }
      })
      .select('User_name User_email User_profilePicture User_location User_coordinates')
      .limit(limit)
      .lean();

      // Calculate distances
      const usersWithDistance = nearbyUsers.map(nearbyUser => {
        const distance = this.calculateDistance(
          latitude,
          longitude,
          nearbyUser.User_coordinates.coordinates[1],
          nearbyUser.User_coordinates.coordinates[0]
        );

        return {
          ...nearbyUser,
          distance: Math.round(distance), // Distance in meters
          distanceFormatted: this.formatDistance(distance)
        };
      });

      return {
        success: true,
        users: usersWithDistance,
        count: usersWithDistance.length
      };
    } catch (error) {
      console.error('Error finding nearby users:', error);
      throw error;
    }
  }

  /**
   * Find nearby study groups
   * Uses group creator's location or average of member locations
   */
  async findNearbyGroups(userId, maxDistance = 10000, limit = 20) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.User_coordinates || !user.User_coordinates.coordinates) {
        throw new Error('User location not set');
      }

      const [longitude, latitude] = user.User_coordinates.coordinates;

      // Find groups where creator has public location nearby
      const nearbyCreators = await User.find({
        User_locationPrivacy: 'public',
        User_coordinates: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [longitude, latitude]
            },
            $maxDistance: maxDistance
          }
        }
      })
      .select('_id User_coordinates')
      .limit(100)
      .lean();

      const creatorIds = nearbyCreators.map(u => u._id);

      // Find groups created by nearby users
      const groups = await Group.find({
        Group_createdBy: { $in: creatorIds }
      })
      .populate('Group_createdBy', 'User_name User_profilePicture User_location User_coordinates')
      .lean();

      // Calculate distances and filter
      const groupsWithDistance = groups
        .map(group => {
          const creatorCoords = group.Group_createdBy.User_coordinates?.coordinates;
          if (!creatorCoords) return null;

          const distance = this.calculateDistance(
            latitude,
            longitude,
            creatorCoords[1],
            creatorCoords[0]
          );

          return {
            ...group,
            distance: Math.round(distance),
            distanceFormatted: this.formatDistance(distance)
          };
        })
        .filter(g => g !== null)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit);

      return {
        success: true,
        groups: groupsWithDistance,
        count: groupsWithDistance.length
      };
    } catch (error) {
      console.error('Error finding nearby groups:', error);
      throw error;
    }
  }

  /**
   * Get proximity-based study group suggestions
   * Suggests groups based on location and user interests
   */
  async getSuggestedGroups(userId, maxDistance = 10000, limit = 10) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Get user's current groups
      const userGroupMemberships = await GroupMember.find({
        GroupMember_userId: userId
      }).select('GroupMember_groupId');

      const userGroupIds = userGroupMemberships.map(m => m.GroupMember_groupId.toString());

      // Find nearby groups
      const nearbyResult = await this.findNearbyGroups(userId, maxDistance, limit * 2);
      
      // Filter out groups user is already in
      const suggestions = nearbyResult.groups
        .filter(group => !userGroupIds.includes(group._id.toString()))
        .slice(0, limit);

      // Get member counts for each group
      const groupsWithStats = await Promise.all(
        suggestions.map(async (group) => {
          const memberCount = await GroupMember.countDocuments({
            GroupMember_groupId: group._id
          });

          return {
            ...group,
            memberCount,
            reason: `${group.distanceFormatted} away`
          };
        })
      );

      return {
        success: true,
        suggestions: groupsWithStats,
        count: groupsWithStats.length
      };
    } catch (error) {
      console.error('Error getting group suggestions:', error);
      throw error;
    }
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * Returns distance in meters
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  /**
   * Format distance for display
   */
  formatDistance(meters) {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    } else {
      return `${(meters / 1000).toFixed(1)}km`;
    }
  }

  /**
   * Check if user can see another user's location
   */
  async canSeeLocation(viewerId, targetUserId) {
    try {
      const targetUser = await User.findById(targetUserId);
      if (!targetUser) return false;

      // Public locations are visible to everyone
      if (targetUser.User_locationPrivacy === 'public') {
        return true;
      }

      // Private locations are not visible
      if (targetUser.User_locationPrivacy === 'private') {
        return false;
      }

      // Friends privacy - check if users share a group
      if (targetUser.User_locationPrivacy === 'friends') {
        const sharedGroups = await this.getSharedGroups(viewerId, targetUserId);
        return sharedGroups.length > 0;
      }

      return false;
    } catch (error) {
      console.error('Error checking location visibility:', error);
      return false;
    }
  }

  /**
   * Get groups shared between two users
   */
  async getSharedGroups(userId1, userId2) {
    try {
      const user1Groups = await GroupMember.find({
        GroupMember_userId: userId1
      }).select('GroupMember_groupId');

      const user2Groups = await GroupMember.find({
        GroupMember_userId: userId2
      }).select('GroupMember_groupId');

      const user1GroupIds = user1Groups.map(g => g.GroupMember_groupId.toString());
      const user2GroupIds = user2Groups.map(g => g.GroupMember_groupId.toString());

      const sharedGroupIds = user1GroupIds.filter(id => user2GroupIds.includes(id));

      return sharedGroupIds;
    } catch (error) {
      console.error('Error getting shared groups:', error);
      return [];
    }
  }
}

module.exports = new LocationService();
