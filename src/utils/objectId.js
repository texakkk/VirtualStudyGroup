/**
 * Utility function to ensure ObjectId is converted to string
 * @param {string|Object} id - The ObjectId that might be an object or string
 * @returns {string} - The ObjectId as a string
 */
export const ensureStringId = (id) => {
  if (!id) return id;

  const isValidObjectIdHex = (value) => typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value);
  
  // If it's already a string, return it
  if (typeof id === 'string') return isValidObjectIdHex(id) ? id : id;
  
  // If it's an object with _id property, use that
  if (typeof id === 'object' && id._id) {
    return ensureStringId(id._id);
  }
  
  // Check for MongoDB JSON format with $oid
  if (typeof id === 'object' && id.$oid) {
    return id.$oid;
  }
  
  // Check for id or str properties (some ObjectId serializations)
  if (typeof id === 'object' && id.id && typeof id.id === 'string') {
    return id.id;
  }
  
  if (typeof id === 'object' && id.str && typeof id.str === 'string') {
    return id.str;
  }
  
  // Direct Node Buffer-like shape: { type: 'Buffer', data: [...] }
  if (typeof id === 'object' && id.type === 'Buffer' && Array.isArray(id.data)) {
    const hexString = id.data.map((byte) => Number(byte).toString(16).padStart(2, '0')).join('');
    if (hexString.length === 24) return hexString;
  }

  // Extract byte arrays from mixed "buffer-like" shapes
  const extractByteArray = (value) => {
    if (!value) return null;
    if (Array.isArray(value)) return value;
    if (ArrayBuffer.isView(value)) return Array.from(value);
    if (typeof value === 'object') {
      // Shape: { type: 'Buffer', data: [...] }
      if (value.type === 'Buffer' && Array.isArray(value.data)) return value.data;
      // Shape: { data: [...] } or { data: Uint8Array }
      if (Array.isArray(value.data)) return value.data;
      if (ArrayBuffer.isView(value.data)) return Array.from(value.data);
      // Shape: {0: 12, 1: 34, ...}
      const numericEntries = Object.entries(value)
        .filter(([k, v]) => /^\d+$/.test(k) && Number.isFinite(Number(v)))
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([, v]) => Number(v));
      if (numericEntries.length >= 12) return numericEntries;
    }
    return null;
  };

  // Helper to convert a byte array to a MongoDB ObjectId hex string
  const bytesToHexObjectId = (bytes) => {
    if (!bytes) return null;
    const arr = Array.isArray(bytes)
      ? bytes
      : ArrayBuffer.isView(bytes)
        ? Array.from(bytes)
        : null;
    if (!arr) return null;
    // ObjectId is 12 bytes => 24 hex chars. Keep first 12 bytes if longer.
    const normalized = arr.slice(0, 12).map((byte) => Number(byte));
    if (normalized.length !== 12 || normalized.some((b) => !Number.isFinite(b))) return null;
    const hexString = normalized.map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return hexString.length === 24 ? hexString : null;
  };

  // If it's a MongoDB ObjectId with buffer property (BSON/ObjectId-like)
  if (typeof id === 'object' && id.buffer) {
    const bufferBytes = extractByteArray(id.buffer);
    const fromBuffer = bytesToHexObjectId(bufferBytes);
    if (fromBuffer) return fromBuffer;
  }
  
  // Check for BSON ObjectId with id property as Buffer
  if (typeof id === 'object' && id._bsontype === 'ObjectID' && id.id) {
    const objectIdBytes = extractByteArray(id.id);
    const fromObjectId = bytesToHexObjectId(objectIdBytes);
    if (fromObjectId) return fromObjectId;
  }
  
  // If it's an object with toString method that returns a valid ID
  if (typeof id === 'object' && typeof id.toString === 'function') {
    const stringified = id.toString();
    // Don't return "[object Object]" - this indicates the object doesn't have a proper toString
    if (stringified !== '[object Object]' && isValidObjectIdHex(stringified)) {
      return stringified;
    }
  }

  // Another common shape: { buffer: { ...12 bytes... } } where bytes are numeric-keyed.
  if (typeof id === 'object' && id.buffer && typeof id.buffer === 'object') {
    const bufferBytes = extractByteArray(id.buffer);
    const fromBuffer = bytesToHexObjectId(bufferBytes);
    if (fromBuffer) return fromBuffer;
  }
  
  // Last resort: try to convert to string, but log a warning
  console.warn('ensureStringId: Unable to properly convert ID to string:', id);
  // Never leak "[object Object]" into API paths
  return '';
};

/**
 * Utility function to ensure all ObjectIds in an object are converted to strings
 * @param {Object} obj - The object containing ObjectIds
 * @returns {Object} - The object with ObjectIds converted to strings
 */
export const ensureStringIds = (obj) => {
  if (!obj) return obj;
  
  const result = { ...obj };
  
  // Convert _id if it exists
  if (result._id) {
    result._id = ensureStringId(result._id);
  }
  
  // Convert common ObjectId fields
  const objectIdFields = [
    'Group_createdBy',
    'GroupMember_userId',
    'GroupMember_groupId',
    'Task_groupId',
    'Message_groupId',
    'Notification_groupId'
  ];
  
  objectIdFields.forEach(field => {
    if (result[field]) {
      if (typeof result[field] === 'object' && result[field]._id) {
        result[field] = {
          ...result[field],
          _id: ensureStringId(result[field]._id)
        };
      } else {
        result[field] = ensureStringId(result[field]);
      }
    }
  });
  
  return result;
};
