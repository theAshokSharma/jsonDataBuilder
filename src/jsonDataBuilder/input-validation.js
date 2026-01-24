// input-validation.js - Input validation against JSON schema
// Integrates with existing data-builder modular architecture

import { state } from './state.js';
import { resolveRef } from './file-validation.js';
import { ashAlert, ashConfirm } from './utils.js';

console.log('📋 Input Validation Module Loaded - Version 3.5');

/**
 * Validates a single field value against its schema definition
 * @param {*} value - The value to validate
 * @param {Object} schema - The schema definition for this field
 * @param {string} fieldPath - The dot-notation path to the field
 * @returns {Object} - { isValid: boolean, errors: string[] }
 */
export function validateFieldValue(value, schema, fieldPath) {
  const errors = [];
  
  // Handle null/undefined/empty values
  if (value === null || value === undefined || value === '') {
    // Note: Required validation is handled separately at form level
    return { isValid: true, errors };
  }

  // Resolve $ref if present
  if (schema.$ref) {
    schema = resolveRef(schema.$ref, state.currentSchema);
    if (!schema) {
      errors.push(`Could not resolve schema reference`);
      return { isValid: false, errors };
    }
  }

  const type = schema.type;

  // Type validation
  switch (type) {
    case 'string':
      if (typeof value !== 'string') {
        errors.push(`Expected string, got ${typeof value}`);
        break;
      }
      
      // String length validation
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push(`Must be at least ${schema.minLength} characters`);
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        errors.push(`Must be at most ${schema.maxLength} characters`);
      }
      
      // Pattern validation
      if (schema.pattern) {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(value)) {
          errors.push(`Does not match required pattern`);
        }
      }
      
      // Format validation
      if (schema.format) {
        const formatError = validateFormat(value, schema.format);
        if (formatError) {
          errors.push(formatError);
        }
      }
      
      // Enum validation
      if (schema.enum && !schema.enum.includes(value)) {
        errors.push(`Must be one of: ${schema.enum.join(', ')}`);
      }
      break;

    case 'number':
    case 'integer':
      const numValue = typeof value === 'string' ? parseFloat(value) : value;
      
      if (isNaN(numValue)) {
        errors.push(`Expected ${type}, got invalid number`);
        break;
      }
      
      if (type === 'integer' && !Number.isInteger(numValue)) {
        errors.push(`Must be a whole number`);
      }
      
      // Range validation
      if (schema.minimum !== undefined && numValue < schema.minimum) {
        errors.push(`Must be at least ${schema.minimum}`);
      }
      if (schema.maximum !== undefined && numValue > schema.maximum) {
        errors.push(`Must be at most ${schema.maximum}`);
      }
      if (schema.exclusiveMinimum !== undefined && numValue <= schema.exclusiveMinimum) {
        errors.push(`Must be greater than ${schema.exclusiveMinimum}`);
      }
      if (schema.exclusiveMaximum !== undefined && numValue >= schema.exclusiveMaximum) {
        errors.push(`Must be less than ${schema.exclusiveMaximum}`);
      }
      
      // Multiple of validation
      if (schema.multipleOf !== undefined && numValue % schema.multipleOf !== 0) {
        errors.push(`Must be a multiple of ${schema.multipleOf}`);
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        errors.push(`Expected boolean, got ${typeof value}`);
      }
      break;

    case 'array':
      if (!Array.isArray(value)) {
        errors.push(`Expected array, got ${typeof value}`);
        break;
      }
      
      // Array length validation
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        errors.push(`Must have at least ${schema.minItems} items`);
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        errors.push(`Must have at most ${schema.maxItems} items`);
      }
      
      // Unique items validation
      if (schema.uniqueItems && !areItemsUnique(value)) {
        errors.push(`All items must be unique`);
      }
      
      // Validate each item if items schema is defined
      if (schema.items && value.length > 0) {
        value.forEach((item, index) => {
          const itemValidation = validateFieldValue(item, schema.items, `${fieldPath}[${index}]`);
          if (!itemValidation.isValid) {
            errors.push(`Item ${index}: ${itemValidation.errors.join(', ')}`);
          }
        });
      }
      break;

    case 'object':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        errors.push(`Expected object, got ${typeof value}`);
        break;
      }
      
      // Validate required properties
      if (schema.required) {
        schema.required.forEach(requiredProp => {
          if (!(requiredProp in value)) {
            errors.push(`Missing required property: ${requiredProp}`);
          }
        });
      }
      
      // Validate each property
      if (schema.properties) {
        Object.entries(value).forEach(([key, val]) => {
          if (schema.properties[key]) {
            const propValidation = validateFieldValue(val, schema.properties[key], `${fieldPath}.${key}`);
            if (!propValidation.isValid) {
              errors.push(`Property ${key}: ${propValidation.errors.join(', ')}`);
            }
          } else if (schema.additionalProperties === false) {
            errors.push(`Property ${key} is not allowed`);
          }
        });
      }
      break;

    default:
      // No specific validation for unknown types
      break;
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validates format-specific string values
 * @param {string} value - The string value to validate
 * @param {string} format - The format type (email, date, uri, etc.)
 * @returns {string|null} - Error message or null if valid
 */
function validateFormat(value, format) {
  switch (format) {
    case 'email':
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return 'Invalid email format';
      }
      break;

    case 'date':
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(value)) {
        return 'Invalid date format (expected YYYY-MM-DD)';
      }
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        return 'Invalid date value';
      }
      break;

    case 'date-time':
    case 'datetime':
      const dateTime = new Date(value);
      if (isNaN(dateTime.getTime())) {
        return 'Invalid date-time format';
      }
      break;

    case 'uri':
    case 'url':
      try {
        new URL(value);
      } catch (e) {
        return 'Invalid URL format';
      }
      break;

    case 'uuid':
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(value)) {
        return 'Invalid UUID format';
      }
      break;

    case 'ipv4':
      const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipv4Regex.test(value)) {
        return 'Invalid IPv4 format';
      }
      const parts = value.split('.');
      if (parts.some(part => parseInt(part) > 255)) {
        return 'Invalid IPv4 address';
      }
      break;

    case 'ipv6':
      // Simplified IPv6 validation
      const ipv6Regex = /^([0-9a-f]{0,4}:){7}[0-9a-f]{0,4}$/i;
      if (!ipv6Regex.test(value)) {
        return 'Invalid IPv6 format';
      }
      break;

    default:
      // Unknown format, no validation
      break;
  }

  return null;
}

/**
 * Checks if array items are unique
 * @param {Array} arr - Array to check
 * @returns {boolean} - True if all items are unique
 */
function areItemsUnique(arr) {
  const seen = new Set();
  for (const item of arr) {
    const key = typeof item === 'object' ? JSON.stringify(item) : item;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
  }
  return true;
}

/**
 * Validates an entire form data object against the schema
 * @param {Object} data - The form data to validate
 * @param {Object} schema - The JSON schema
 * @returns {Object} - { isValid: boolean, errors: Object, warnings: Object }
 */
export function validateFormData(data, schema) {
  const errors = {};
  const warnings = {};
  let isValid = true;

  function validateObject(obj, schemaObj, path = '') {
    if (!schemaObj.properties) return;

    // Check required fields
    if (schemaObj.required) {
      schemaObj.required.forEach(requiredField => {
        const fieldPath = path ? `${path}.${requiredField}` : requiredField;
        const value = obj[requiredField];
        
        if (value === null || value === undefined || value === '') {
          errors[fieldPath] = ['This field is required'];
          isValid = false;
        }
      });
    }

    // Validate each property
    Object.entries(schemaObj.properties).forEach(([key, propSchema]) => {
      const fieldPath = path ? `${path}.${key}` : key;
      const value = obj[key];

      // Skip if value doesn't exist and field is not required
      if ((value === null || value === undefined || value === '') && 
          (!schemaObj.required || !schemaObj.required.includes(key))) {
        return;
      }

      const validation = validateFieldValue(value, propSchema, fieldPath);
      if (!validation.isValid) {
        errors[fieldPath] = validation.errors;
        isValid = false;
      }

      // Recursively validate nested objects
      if (propSchema.type === 'object' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
        validateObject(value, propSchema, fieldPath);
      }
    });
  }

  validateObject(data, schema);

  return { isValid, errors, warnings };
}

/**
 * Displays validation errors in the UI
 * @param {Object} errors - Object with field paths as keys and error arrays as values
 */
export function displayValidationErrors(errors) {
  // Clear existing validation messages
  document.querySelectorAll('.validation-error-message').forEach(el => el.remove());
  document.querySelectorAll('.validation-error').forEach(el => el.classList.remove('validation-error'));

  Object.entries(errors).forEach(([fieldPath, errorMessages]) => {
    const input = findInputElement(fieldPath);
    if (!input) {
      console.warn(`Cannot display validation error: input not found for ${fieldPath}`);
      return;
    }

    // Add error class
    input.classList.add('validation-error');

    // Create error message element
    const errorDiv = document.createElement('div');
    errorDiv.className = 'validation-error-message';
    errorDiv.innerHTML = `
      <span class="error-icon">❌</span>
      <span class="error-text">${errorMessages.join(', ')}</span>
    `;

    // Insert error message after the input
    input.parentNode.insertBefore(errorDiv, input.nextSibling);
  });
}

/**
 * Finds input element by field path (handles all input types)
 * @param {string} fieldPath - Dot-notation path to field
 * @returns {HTMLElement|null} - Input element or null
 */
function findInputElement(fieldPath) {
  // Try direct selectors first
  let input = document.querySelector(`[data-path="${fieldPath}"]`);
  if (input) return input;

  // Try multi-select container
  const escapedPath = fieldPath.replace(/\./g, '_');
  input = document.getElementById(`multiselect_${escapedPath}`);
  if (input) return input;

  // Try checkbox container
  input = document.getElementById(`checkbox_${escapedPath}`);
  if (input) return input;

  // Try radio container
  input = document.getElementById(`radio_${escapedPath}`);
  if (input) return input;

  // Try slider container
  input = document.getElementById(`slider_${escapedPath}`);
  if (input) return input;

  return null;
}

/**
 * Attaches real-time validation to form inputs
 * @param {Object} schema - The JSON schema
 */
export function attachRealtimeValidation(schema) {
  console.log('🔍 Attaching real-time validation listeners...');
  
  const inputs = document.querySelectorAll('input[data-path], select[data-path], textarea[data-path]');
  let attachedCount = 0;
  
  inputs.forEach(input => {
    const fieldPath = input.dataset.path;
    if (!fieldPath) return;

    // Skip if already has validation listener
    if (input.dataset.validationListenerAttached === 'true') return;

    // Get schema for this field
    const fieldSchema = getFieldSchema(fieldPath, schema);
    if (!fieldSchema) {
      console.warn(`No schema found for ${fieldPath}`);
      return;
    }

    // Skip if field has dropdown control (already validated elsewhere)
    if (input.tagName === 'SELECT' && state.customOptions[fieldPath]) {
      return;
    }

    // Skip multi-select, checkbox, radio (these have their own validation)
    if (input.classList.contains('multi-select-checkbox') ||
        input.classList.contains('checkbox-input') ||
        input.classList.contains('radio-input') ||
        input.classList.contains('na-checkbox')) {
      return;
    }

    // Attach validation on blur
    input.addEventListener('blur', () => {
      validateAndDisplayFieldError(input, fieldSchema, fieldPath);
    });

    // Clear error on input
    input.addEventListener('input', () => {
      clearFieldError(input);
    });

    input.dataset.validationListenerAttached = 'true';
    attachedCount++;
  });
  
  console.log(`✅ Attached validation to ${attachedCount} input fields`);
}

/**
 * Gets the schema for a specific field path
 * @param {string} fieldPath - Dot-notation path to the field
 * @param {Object} schema - The JSON schema
 * @returns {Object|null} - Field schema or null
 */
function getFieldSchema(fieldPath, schema) {
  const keys = fieldPath.split('.');
  let current = schema.properties;
  let currentSchema = schema;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    
    if (!current || !current[key]) return null;

    const prop = current[key];

    // Resolve $ref
    if (prop.$ref) {
      const resolved = resolveRef(prop.$ref, schema);
      if (!resolved) return null;
      
      if (i === keys.length - 1) {
        return resolved;
      }
      current = resolved.properties;
      currentSchema = resolved;
    } else {
      if (i === keys.length - 1) {
        return prop;
      }
      current = prop.properties;
      currentSchema = prop;
    }
  }

  return null;
}

/**
 * Validates a single field and displays error
 * @param {HTMLElement} input - The input element
 * @param {Object} fieldSchema - The schema for this field
 * @param {string} fieldPath - The field path
 */
function validateAndDisplayFieldError(input, fieldSchema, fieldPath) {
  let value = input.value;

  // Convert value based on input type
  if (input.type === 'number' || input.type === 'range') {
    value = value ? parseFloat(value) : null;
  } else if (input.type === 'checkbox') {
    value = input.checked;
  }

  const validation = validateFieldValue(value, fieldSchema, fieldPath);

  if (!validation.isValid) {
    input.classList.add('validation-error');
    
    // Create error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'validation-error-message';
    errorDiv.innerHTML = `
      <span class="error-icon">❌</span>
      <span class="error-text">${validation.errors.join(', ')}</span>
    `;

    // Remove existing error message
    const existingError = input.parentNode.querySelector('.validation-error-message');
    if (existingError) {
      existingError.remove();
    }

    input.parentNode.insertBefore(errorDiv, input.nextSibling);
  }
}

/**
 * Clears validation error for a field
 * @param {HTMLElement} input - The input element
 */
function clearFieldError(input) {
  input.classList.remove('validation-error');
  const errorMessage = input.parentNode.querySelector('.validation-error-message');
  if (errorMessage) {
    errorMessage.remove();
  }
}

/**
 * Validates all form data and shows summary
 * @param {Object} data - Form data to validate
 * @param {Object} schema - JSON schema
 * @returns {boolean} - True if valid
 */
export async function validateAndShowSummary(data, schema) {
  console.log('🔍 Validating form data...');
  
  const validation = validateFormData(data, schema);
  
  if (!validation.isValid) {
    displayValidationErrors(validation.errors);
    
    // Show summary
    const errorCount = Object.keys(validation.errors).length;
    let summaryText = `⚠️ Found ${errorCount} validation error(s):\n\n`;
    
    const errorEntries = Object.entries(validation.errors).slice(0, 10); // Limit to first 10
    errorEntries.forEach(([field, errors]) => {
      summaryText += `• ${field}:\n  ${errors.join(', ')}\n\n`;
    });
    
    if (Object.keys(validation.errors).length > 10) {
      summaryText += `\n... and ${Object.keys(validation.errors).length - 10} more errors`;
    }
    
    await ashAlert(summaryText);
    
    // Scroll to first error
    const firstErrorField = Object.keys(validation.errors)[0];
    const firstInput = findInputElement(firstErrorField);
    if (firstInput) {
      firstInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstInput.focus();
    }
    
    console.log(`❌ Validation failed: ${errorCount} errors`);
  } else {
    console.log('✅ Validation passed');
  }
  
  return validation.isValid;
}

/**
 * Clears all validation errors from the form
 */
export function clearAllValidationErrors() {
  document.querySelectorAll('.validation-error-message').forEach(el => el.remove());
  document.querySelectorAll('.validation-error').forEach(el => el.classList.remove('validation-error'));
  console.log('🧹 Cleared all validation errors');
}

//==== END OF FILE ====//