const validator = require('validator');
const xss = require('xss');

/**
 * Input validation and sanitization middleware
 * Provides comprehensive input validation and XSS protection
 */

/**
 * Normalize ObjectId parameters that might be objects to strings
 * This handles cases where objects are incorrectly passed as route params
 * @param {string[]} paramNames - Array of parameter names to normalize
 * @returns {Function} Express middleware
 */
function normalizeObjectIdParams(paramNames = []) {
  return (req, res, next) => {
    if (!req.params) {
      return next();
    }

    console.log('normalizeObjectIdParams - Original params:', JSON.stringify(req.params));

    for (const paramName of paramNames) {
      let paramValue = req.params[paramName];
      
      if (!paramValue) {
        continue;
      }

      console.log(`normalizeObjectIdParams - Processing ${paramName}:`, paramValue, 'Type:', typeof paramValue);

      // Check if the string value is literally "[object Object]"
      if (paramValue === '[object Object]') {
        console.error(`${paramName} is literally the string "[object Object]" - this means an object was converted to string in the URL`);
        return res.status(400).json({ 
          success: false,
          message: `Invalid ${paramName} format. Received: ${paramValue}` 
        });
      }

      // If it's an object, try to convert to string
      if (typeof paramValue === 'object' && paramValue !== null) {
        if (paramValue._id) {
          req.params[paramName] = paramValue._id.toString();
        } else if (paramValue.toString && paramValue.toString() !== '[object Object]') {
          req.params[paramName] = paramValue.toString();
        } else {
          console.log(`Invalid ${paramName} format: received object without valid ID`, paramValue);
          return res.status(400).json({ 
            success: false,
            message: `Invalid ${paramName} format.` 
          });
        }
      } else if (typeof paramValue === 'string') {
        // Trim whitespace from string params
        req.params[paramName] = paramValue.trim();
      } else {
        // Convert other types to string
        req.params[paramName] = String(paramValue);
      }
    }

    console.log('normalizeObjectIdParams - Normalized params:', JSON.stringify(req.params));
    next();
  };
}

/**
 * Sanitize string input to prevent XSS attacks
 * @param {string} input - Input string to sanitize
 * @param {Object} options - XSS options
 * @returns {string} Sanitized string
 */
function sanitizeString(input, options = {}) {
  if (typeof input !== 'string') {
    return input;
  }
  
  const xssOptions = {
    whiteList: options.allowHtml ? {
      p: [], br: [], strong: [], em: [], u: [], 
      h1: [], h2: [], h3: [], h4: [], h5: [], h6: [],
      ul: [], ol: [], li: [], a: ['href', 'title'],
      img: ['src', 'alt', 'title'],
      code: [], pre: [], blockquote: []
    } : {},
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style']
  };
  
  return xss(input, xssOptions);
}

/**
 * Validate and sanitize email
 * @param {string} email - Email to validate
 * @returns {Object} Validation result
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { isValid: false, error: 'Email is required' };
  }
  
  const sanitized = validator.trim(email);
  
  if (!validator.isEmail(sanitized)) {
    return { isValid: false, error: 'Invalid email format' };
  }
  
  return { isValid: true, sanitized: validator.normalizeEmail(sanitized) };
}

/**
 * Validate and sanitize URL
 * @param {string} url - URL to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
function validateURL(url, options = {}) {
  if (!url || typeof url !== 'string') {
    return { isValid: false, error: 'URL is required' };
  }
  
  const sanitized = validator.trim(url);
  
  const urlOptions = {
    protocols: options.protocols || ['http', 'https'],
    require_protocol: options.requireProtocol !== false,
    require_valid_protocol: true,
    allow_underscores: false,
    allow_trailing_dot: false,
    allow_protocol_relative_urls: false
  };
  
  if (!validator.isURL(sanitized, urlOptions)) {
    return { isValid: false, error: 'Invalid URL format' };
  }
  
  return { isValid: true, sanitized };
}

/**
 * Validate MongoDB ObjectId
 * @param {string} id - ID to validate
 * @returns {Object} Validation result
 */
function validateObjectId(id) {
  if (!id || typeof id !== 'string') {
    return { isValid: false, error: 'ID is required' };
  }
  
  if (!validator.isMongoId(id)) {
    return { isValid: false, error: 'Invalid ID format' };
  }
  
  return { isValid: true, sanitized: id };
}

/**
 * Validate and sanitize text input
 * @param {string} text - Text to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
function validateText(text, options = {}) {
  if (options.required && (!text || typeof text !== 'string')) {
    return { isValid: false, error: options.fieldName ? `${options.fieldName} is required` : 'Text is required' };
  }
  
  if (!text) {
    return { isValid: true, sanitized: '' };
  }
  
  if (typeof text !== 'string') {
    return { isValid: false, error: 'Text must be a string' };
  }
  
  let sanitized = sanitizeString(text, { allowHtml: options.allowHtml });
  sanitized = validator.trim(sanitized);
  
  // Check length constraints
  if (options.minLength && sanitized.length < options.minLength) {
    return { 
      isValid: false, 
      error: `${options.fieldName || 'Text'} must be at least ${options.minLength} characters` 
    };
  }
  
  if (options.maxLength && sanitized.length > options.maxLength) {
    return { 
      isValid: false, 
      error: `${options.fieldName || 'Text'} must not exceed ${options.maxLength} characters` 
    };
  }
  
  // Check for SQL injection patterns
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
    /(--|\;|\/\*|\*\/)/g
  ];
  
  if (!options.allowSqlKeywords) {
    for (const pattern of sqlPatterns) {
      if (pattern.test(sanitized)) {
        return { isValid: false, error: 'Invalid characters detected' };
      }
    }
  }
  
  return { isValid: true, sanitized };
}

/**
 * Validate numeric input
 * @param {*} value - Value to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
function validateNumber(value, options = {}) {
  if (options.required && (value === undefined || value === null || value === '')) {
    return { isValid: false, error: `${options.fieldName || 'Number'} is required` };
  }
  
  if (value === undefined || value === null || value === '') {
    return { isValid: true, sanitized: options.default || null };
  }
  
  const num = Number(value);
  
  if (isNaN(num)) {
    return { isValid: false, error: `${options.fieldName || 'Value'} must be a number` };
  }
  
  if (options.integer && !Number.isInteger(num)) {
    return { isValid: false, error: `${options.fieldName || 'Value'} must be an integer` };
  }
  
  if (options.min !== undefined && num < options.min) {
    return { isValid: false, error: `${options.fieldName || 'Value'} must be at least ${options.min}` };
  }
  
  if (options.max !== undefined && num > options.max) {
    return { isValid: false, error: `${options.fieldName || 'Value'} must not exceed ${options.max}` };
  }
  
  return { isValid: true, sanitized: num };
}

/**
 * Validate boolean input
 * @param {*} value - Value to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
function validateBoolean(value, options = {}) {
  if (options.required && (value === undefined || value === null)) {
    return { isValid: false, error: `${options.fieldName || 'Boolean'} is required` };
  }
  
  if (value === undefined || value === null) {
    return { isValid: true, sanitized: options.default || false };
  }
  
  if (typeof value === 'boolean') {
    return { isValid: true, sanitized: value };
  }
  
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1') {
      return { isValid: true, sanitized: true };
    }
    if (lower === 'false' || lower === '0') {
      return { isValid: true, sanitized: false };
    }
  }
  
  if (typeof value === 'number') {
    return { isValid: true, sanitized: value !== 0 };
  }
  
  return { isValid: false, error: `${options.fieldName || 'Value'} must be a boolean` };
}

/**
 * Validate array input
 * @param {*} value - Value to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
function validateArray(value, options = {}) {
  if (options.required && (!value || !Array.isArray(value))) {
    return { isValid: false, error: `${options.fieldName || 'Array'} is required` };
  }
  
  if (!value) {
    return { isValid: true, sanitized: options.default || [] };
  }
  
  if (!Array.isArray(value)) {
    return { isValid: false, error: `${options.fieldName || 'Value'} must be an array` };
  }
  
  if (options.minLength && value.length < options.minLength) {
    return { 
      isValid: false, 
      error: `${options.fieldName || 'Array'} must have at least ${options.minLength} items` 
    };
  }
  
  if (options.maxLength && value.length > options.maxLength) {
    return { 
      isValid: false, 
      error: `${options.fieldName || 'Array'} must not exceed ${options.maxLength} items` 
    };
  }
  
  // Validate each item if validator provided
  if (options.itemValidator) {
    const sanitized = [];
    for (let i = 0; i < value.length; i++) {
      const result = options.itemValidator(value[i], i);
      if (!result.isValid) {
        return { 
          isValid: false, 
          error: `${options.fieldName || 'Array'} item ${i}: ${result.error}` 
        };
      }
      sanitized.push(result.sanitized);
    }
    return { isValid: true, sanitized };
  }
  
  return { isValid: true, sanitized: value };
}

/**
 * Middleware to validate request body fields
 * @param {Object} schema - Validation schema
 * @returns {Function} Express middleware
 */
function validateRequestBody(schema) {
  return (req, res, next) => {
    const errors = [];
    const sanitized = {};
    
    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];
      let result;
      
      switch (rules.type) {
        case 'email':
          result = validateEmail(value);
          break;
        case 'url':
          result = validateURL(value, rules);
          break;
        case 'objectId':
          result = validateObjectId(value);
          break;
        case 'text':
          result = validateText(value, { ...rules, fieldName: field });
          break;
        case 'number':
          result = validateNumber(value, { ...rules, fieldName: field });
          break;
        case 'boolean':
          result = validateBoolean(value, { ...rules, fieldName: field });
          break;
        case 'array':
          result = validateArray(value, { ...rules, fieldName: field });
          break;
        default:
          result = { isValid: true, sanitized: value };
      }
      
      if (!result.isValid) {
        errors.push({ field, error: result.error });
      } else {
        sanitized[field] = result.sanitized;
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }
    
    // Replace request body with sanitized values
    req.body = { ...req.body, ...sanitized };
    req.sanitizedBody = sanitized;
    
    next();
  };
}

/**
 * Middleware to validate query parameters
 * @param {Object} schema - Validation schema
 * @returns {Function} Express middleware
 */
function validateQueryParams(schema) {
  return (req, res, next) => {
    const errors = [];
    const sanitized = {};
    
    for (const [param, rules] of Object.entries(schema)) {
      const value = req.query[param];
      let result;
      
      switch (rules.type) {
        case 'text':
          result = validateText(value, { ...rules, fieldName: param });
          break;
        case 'number':
          result = validateNumber(value, { ...rules, fieldName: param });
          break;
        case 'boolean':
          result = validateBoolean(value, { ...rules, fieldName: param });
          break;
        case 'objectId':
          result = validateObjectId(value);
          break;
        default:
          result = { isValid: true, sanitized: value };
      }
      
      if (!result.isValid) {
        errors.push({ param, error: result.error });
      } else {
        sanitized[param] = result.sanitized;
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Query validation failed',
        details: errors
      });
    }
    
    // Replace query params with sanitized values
    req.query = { ...req.query, ...sanitized };
    req.sanitizedQuery = sanitized;
    
    next();
  };
}

/**
 * Middleware to sanitize all string inputs in request
 * @returns {Function} Express middleware
 */
function sanitizeAllInputs() {
  return (req, res, next) => {
    // Sanitize body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }
    
    // Sanitize query
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }
    
    // Sanitize params
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }
    
    next();
  };
}

/**
 * Recursively sanitize object properties
 * @param {Object} obj - Object to sanitize
 * @returns {Object} Sanitized object
 */
function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

module.exports = {
  normalizeObjectIdParams,
  sanitizeString,
  validateEmail,
  validateURL,
  validateObjectId,
  validateText,
  validateNumber,
  validateBoolean,
  validateArray,
  validateRequestBody,
  validateQueryParams,
  sanitizeAllInputs,
  sanitizeObject
};
