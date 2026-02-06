// input-validation.js - Input validation against JSON schema
// FIXED: Tab-aware validation that works with existing tab switching
// @ts-check
import { state } from './state.js';
import { resolveRef } from './file-validation.js';
import { ashAlert, ashAlertScrollable, ashConfirm, escapeHtml } from './utils.js';

console.log('📋 Input Validation Module Loaded - Version 3.10 (TAB-AWARE FIXED)');

/**
 * Validates a single field value against its schema definition
 * @param {*} value - The value to validate
 * @param {Object} schema - The schema definition for this field
 * @param {string} fieldPath - The dot-notation path to the field
 * @returns {Object} - { isValid: boolean, errors: string[] }
 */
export function validateFieldValue(value, schema, fieldPath) {
  const errors = [];
  
  console.log(`🔎 Validating field: ${fieldPath}`, { value, schemaType: schema.type });
  
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
      
      // ✅ Check custom options FIRST (they override schema.enum)
      let customOptionsChecked = false;
      if (state.customOptions && state.customOptions[fieldPath]) {
        const customConfig = state.customOptions[fieldPath];
        
        if (customConfig.values && Array.isArray(customConfig.values)) {
          customOptionsChecked = true;
          
          // Extract values from value/label pairs or simple values
          const allowedValues = customConfig.values.map(v => 
            typeof v === 'object' && v.value !== undefined ? String(v.value) : String(v)
          );
          
          // Add N/A option if present
          if (customConfig.na) {
            const naValue = typeof customConfig.na === 'object' ? String(customConfig.na.value) : String(customConfig.na);
            allowedValues.push(naValue);
          }
          
          // Validate
          if (!allowedValues.includes(String(value))) {
            errors.push(`Must be one of the allowed values`);
          }
        }
      }
      
      // Enum validation (only if no custom options were checked)
      if (!customOptionsChecked && schema.enum && !schema.enum.includes(value)) {
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
      
      // ✅ Check array items against custom options if they exist
      if (state.customOptions && state.customOptions[fieldPath]) {
        const customConfig = state.customOptions[fieldPath];
        
        if (customConfig.values && Array.isArray(customConfig.values)) {
          // Extract allowed values from value/label pairs or simple values
          const allowedValues = customConfig.values.map(v => 
            typeof v === 'object' && v.value !== undefined ? String(v.value) : String(v)
          );
          
          // Check if N/A is allowed
          if (customConfig.na) {
            const naValue = typeof customConfig.na === 'object' ? String(customConfig.na.value) : String(customConfig.na);
            allowedValues.push(naValue);
          }
          
          // Validate each item in the array
          const invalidItems = [];
          value.forEach((item, index) => {
            if (!allowedValues.includes(String(item))) {
              invalidItems.push(`"${item}"`);
            }
          });
          
          if (invalidItems.length > 0) {
            errors.push(`Invalid values: ${invalidItems.join(', ')}`);
          }
        }
      }
      
      // Validate each item if items schema is defined (for arrays of objects)
      if (schema.items && value.length > 0 && schema.items.type === 'object') {
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
 * 🔧 FIXED: Groups errors by tab based on field path
 * @param {Object} errors - All validation errors
 * @returns {Object} - { tabKey: { fieldPath: errors }, ... }
 */
function groupErrorsByTab(errors) {
  const errorsByTab = {};
  
  // Check if we have a tab-based form
  const hasTabs = state.currentSchema && 
                  state.currentSchema.properties && 
                  Object.keys(state.tabContents || {}).length > 0;
  
  if (!hasTabs) {
    // Single-form layout - all errors in one group
    errorsByTab['_single'] = errors;
    return errorsByTab;
  }
  
  // Tab-based layout - group by top-level property (tab key)
  Object.entries(errors).forEach(([fieldPath, errorMessages]) => {
    // Extract tab key (first part of path)
    const tabKey = fieldPath.split('.')[0];
    
    if (!errorsByTab[tabKey]) {
      errorsByTab[tabKey] = {};
    }
    
    errorsByTab[tabKey][fieldPath] = errorMessages;
  });
  
  console.log('📊 Errors grouped by tab:', Object.keys(errorsByTab).map(tab => 
    `${tab} (${Object.keys(errorsByTab[tab]).length} errors)`
  ).join(', '));
  
  return errorsByTab;
}

/**
 * 🔧 FIXED: Displays validation errors with tab-aware summaries
 * Uses MutationObserver to update summary when tabs change
 * @param {Object} errors - Object with field paths as keys and error arrays as values
 */
export function displayValidationErrors(errors) {
  // Clear existing validation messages and summaries
  document.querySelectorAll('.validation-error-message').forEach(el => el.remove());
  document.querySelectorAll('.validation-error').forEach(el => el.classList.remove('validation-error'));
  document.querySelectorAll('.invalid-fields-summary').forEach(el => el.remove());

  // Group errors by tab
  const errorsByTab = groupErrorsByTab(errors);
  
  // Store errors globally for tab switching
  window._validationErrorsByTab = errorsByTab;
  
  // 🆕 Create summary for current/active tab only
  updateValidationSummaryForCurrentTab();

  // Display individual field errors (all tabs - they'll only show when tab is active)
  Object.entries(errors).forEach(([fieldPath, errorMessages]) => {
    const input = findInputElement(fieldPath);
    if (!input) {
      console.warn(`Cannot display validation error: input not found for ${fieldPath}`);
      return; // Error still shows in summary
    }

    // Add error class
    input.classList.add('validation-error');

    // Create error message element
    const errorDiv = document.createElement('div');
    errorDiv.className = 'validation-error-message';
    errorDiv.dataset.fieldPath = fieldPath; // Store for tab-specific clearing
    errorDiv.innerHTML = `
      <span class="error-icon">❌</span>
      <span class="error-text">${errorMessages.join(', ')}</span>
    `;

    // Insert error message after the input (or its container for complex inputs)
    const insertAfter = input.classList.contains('multi-select-container') ||
                       input.classList.contains('checkbox-container') ||
                       input.classList.contains('radio-container') ||
                       input.classList.contains('slider-container')
                       ? input : input;
    
    insertAfter.parentNode.insertBefore(errorDiv, insertAfter.nextSibling);
  });
  
  // 🔧 FIXED: Use MutationObserver to detect tab changes instead of replacing listeners
  setupTabChangeObserver();
}

/**
 * 🆕 NEW: Sets up MutationObserver to watch for tab changes
 * This observes the 'active' class changes on tab-content elements
 */
function setupTabChangeObserver() {
  // Disconnect existing observer if any
  if (window._tabChangeObserver) {
    window._tabChangeObserver.disconnect();
  }
  
  const tabContentsContainer = document.getElementById('tab-contents');
  if (!tabContentsContainer) {
    console.log('No tab-contents container found, skipping observer setup');
    return;
  }
  
  // Create observer to watch for class changes on tab-content elements
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const target = mutation.target;
        if (target.classList.contains('tab-content') && target.classList.contains('active')) {
          // Tab became active, update summary
          console.log('🔄 Tab became active, updating validation summary');
          setTimeout(() => updateValidationSummaryForCurrentTab(), 50);
        }
      }
    });
  });
  
  // Observe all tab-content elements
  const tabContents = tabContentsContainer.querySelectorAll('.tab-content');
  tabContents.forEach(tabContent => {
    observer.observe(tabContent, {
      attributes: true,
      attributeFilter: ['class']
    });
  });
  
  // Store observer globally so we can disconnect it later
  window._tabChangeObserver = observer;
  
  console.log('✅ Tab change observer set up');
}

/**
 * 🆕 NEW: Updates validation summary for the currently active tab
 */
function updateValidationSummaryForCurrentTab() {
  if (!window._validationErrorsByTab) {
    return;
  }
  
  const errorsByTab = window._validationErrorsByTab;
  const currentTab = state.currentTab || '_single';
  const currentTabErrors = errorsByTab[currentTab] || {};
  
  console.log(`📋 Updating summary for tab: ${currentTab}, errors: ${Object.keys(currentTabErrors).length}`);
  
  // Remove old summary
  document.querySelectorAll('.invalid-fields-summary').forEach(el => el.remove());
  
  // Show summary for this tab's errors
  if (Object.keys(currentTabErrors).length > 0) {
    createValidationSummary(currentTabErrors, currentTab);
  }
}

/**
 * 🔧 FIXED: Creates a tab-specific validation summary
 * @param {Object} errors - Validation errors object for current tab
 * @param {string} tabKey - The key of the current tab ('_single' for non-tabbed forms)
 */
function createValidationSummary(errors, tabKey) {
  const summary = document.createElement('div');
  summary.className = 'invalid-fields-summary';
  summary.dataset.tabKey = tabKey; // Store tab key for clearing
  
  const errorCount = Object.keys(errors).length;
  const tabName = tabKey === '_single' ? 'Form' : 
                  (state.currentSchema?.properties?.[tabKey]?.title || tabKey);
  
  summary.innerHTML = `
    <strong>
      <span style="font-size: 20px;">⚠️</span>
      Validation Errors in "${tabName}" (${errorCount})
      <button class="close-summary" onclick="clearValidationSummary('${tabKey}')">×</button>
    </strong>
    <ul>
      ${Object.entries(errors).slice(0, 10).map(([field, errs]) => `
        <li>
          <strong>${escapeHtml(field)}</strong>: ${errs.map(e => escapeHtml(e)).join(', ')}
          <button onclick="scrollToField('${escapeHtml(field)}')" style="margin-left: 10px; font-size: 11px; padding: 2px 8px;">
            Go to field
          </button>
        </li>
      `).join('')}
      ${Object.keys(errors).length > 10 ? `<li><em>... and ${Object.keys(errors).length - 10} more errors</em></li>` : ''}
    </ul>
    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #f5c6cb;">
      <button onclick="clearValidationSummary('${tabKey}')" class="btn-secondary" style="padding: 8px 16px; font-size: 13px;">
        🗑️ Clear Errors in This Tab
      </button>
    </div>
  `;

  // Insert at top of current visible form content area
  const formContent = tabKey === '_single' 
    ? (document.querySelector('.single-form-container') || document.getElementById('tab-contents'))
    : document.getElementById(`content-${tabKey}`);
  
  if (formContent) {
    formContent.insertBefore(summary, formContent.firstChild);
    console.log(`✅ Created validation summary for ${tabKey}`);
  } else {
    console.warn(`⚠️ Could not find form content for tab: ${tabKey}`);
  }
}

/**
 * 🔧 FIXED: Clears validation errors for a specific tab only
 * @param {string} tabKey - The tab key to clear errors for ('_single' for non-tabbed)
 */
window.clearValidationSummary = function(tabKey) {
  console.log(`🧹 Clearing validation errors for tab: ${tabKey}`);
  
  // Remove summary for this tab
  const summary = document.querySelector(`.invalid-fields-summary[data-tab-key="${tabKey}"]`);
  if (summary) {
    summary.remove();
  }
  
  // Get all field paths for this tab
  const tabPrefix = tabKey === '_single' ? '' : `${tabKey}.`;
  
  // ✅ FIXED: Remove ALL validation-error-message elements for this tab's fields
  // This includes the individual error messages under each field
  document.querySelectorAll('.validation-error-message').forEach(el => {
    const fieldPath = el.dataset.fieldPath;
    if (fieldPath && (tabKey === '_single' || fieldPath.startsWith(tabPrefix))) {
      el.remove();
    }
  });
  
  // ✅ FIXED: Remove validation error class from this tab's inputs
  document.querySelectorAll('.validation-error').forEach(el => {
    const fieldPath = el.dataset.path || 
                     el.querySelector('[data-path]')?.dataset.path;
    
    if (fieldPath && (tabKey === '_single' || fieldPath.startsWith(tabPrefix))) {
      el.classList.remove('validation-error');
    }
  });
  
  // ✅ ADDITIONAL: Clear any inline error messages that don't have dataset.fieldPath
  // (fallback for error messages that might be attached differently)
  const tabContentArea = tabKey === '_single' 
    ? document.getElementById('tab-contents')
    : document.getElementById(`content-${tabKey}`);
  
  if (tabContentArea) {
    // Remove all validation-error-message elements in this tab's content area
    tabContentArea.querySelectorAll('.validation-error-message').forEach(el => el.remove());
    
    // Remove validation-error class from all inputs in this tab
    tabContentArea.querySelectorAll('.validation-error').forEach(el => {
      el.classList.remove('validation-error');
    });
  }
  
  // Remove this tab from the global errors object
  if (window._validationErrorsByTab && window._validationErrorsByTab[tabKey]) {
    delete window._validationErrorsByTab[tabKey];
    
    // If no more errors, disconnect observer
    if (Object.keys(window._validationErrorsByTab).length === 0) {
      if (window._tabChangeObserver) {
        window._tabChangeObserver.disconnect();
        window._tabChangeObserver = null;
      }
      window._validationErrorsByTab = null;
    }
  }
  
  console.log(`✅ Cleared validation errors for tab: ${tabKey}`);
};

/**
 * 🆕 NEW: Global function to scroll to a field
 */
window.scrollToField = function(fieldPath) {
  const element = findInputElement(fieldPath);
  if (element) {
    // Check if field is in a different tab
    const fieldTabKey = fieldPath.split('.')[0];
    const currentTab = state.currentTab;
    
    // If field is in a different tab, switch to that tab first
    if (currentTab && fieldTabKey !== currentTab && state.tabContents[fieldTabKey]) {
      console.log(`🔄 Switching to tab "${fieldTabKey}" to show field`);
      const tabButton = document.getElementById(`tab-${fieldTabKey}`);
      if (tabButton) {
        tabButton.click();
        // Wait for tab to render
        setTimeout(() => {
          scrollAndHighlightField(fieldPath);
        }, 300);
        return;
      }
    }
    
    // Field is in current view, scroll immediately
    scrollAndHighlightField(fieldPath);
  } else {
    console.warn(`Cannot scroll to field: ${fieldPath} - element not found`);
    alert(`Field "${fieldPath}" not found. It may not be rendered yet.`);
  }
};

/**
 * 🆕 NEW: Helper function to scroll and highlight a field
 * @param {string} fieldPath - The field path to scroll to
 */
function scrollAndHighlightField(fieldPath) {
  const element = findInputElement(fieldPath);
  if (!element) return;
  
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  
  // Wait for scroll, then focus
  setTimeout(() => {
    element.focus();
    
    // Flash the element to highlight it
    element.style.transition = 'all 0.3s';
    element.style.boxShadow = '0 0 0 4px rgba(255, 68, 68, 0.5)';
    setTimeout(() => {
      element.style.boxShadow = '';
    }, 1000);
  }, 500);
}

/**
 * ✅ ENHANCED: Finds input element by field path with improved logic
 * @param {string} fieldPath - Dot-notation path to field
 * @returns {HTMLElement|null} - Input element or null
 */
function findInputElement(fieldPath) {
  const escapedPath = fieldPath.replace(/\./g, '_');
  
  // Strategy 1: Try form-group container (most reliable for error display)
  let formGroup = document.querySelector(`[data-field-path="${fieldPath}"]`);
  if (formGroup) {
    // Return the first input-like element inside
    const input = formGroup.querySelector('input, select, textarea, .multi-select-container, .checkbox-container, .radio-container, .slider-container');
    if (input) {
      return input;
    }
  }

  // Strategy 2: Try direct input elements by data-path
  let input = document.querySelector(`input[data-path="${fieldPath}"], select[data-path="${fieldPath}"], textarea[data-path="${fieldPath}"]`);
  if (input) {
    return input;
  }

  // Strategy 3: Try complex containers by ID
  input = document.getElementById(`multiselect_${escapedPath}`);
  if (input) return input;

  input = document.getElementById(`checkbox_${escapedPath}`);
  if (input) return input;

  input = document.getElementById(`radio_${escapedPath}`);
  if (input) return input;

  input = document.getElementById(`slider_${escapedPath}`);
  if (input) return input;

  // Strategy 4: Try finding by partial path match (for nested fields)
  const allInputs = document.querySelectorAll('[data-path], [data-field-path]');
  for (const elem of allInputs) {
    const dataPath = elem.dataset.path || elem.dataset.fieldPath;
    if (dataPath && dataPath.endsWith(fieldPath)) {
      return elem;
    }
  }

  return null;
}

/**
 * Attaches real-time validation to form inputs
 * @param {Object} schema - The JSON schema
 */
export function attachRealtimeValidation(schema) {
  console.log('🔗 Attaching real-time validation listeners...');
  
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
    errorDiv.dataset.fieldPath = fieldPath;
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
 * 🔧 UPDATED: Validates all form data and shows summary using SCROLLABLE ALERT
 * @param {Object} data - Form data to validate
 * @param {Object} schema - JSON schema
 * @returns {boolean} - True if valid
 */
export async function validateAndShowSummary(data, schema) {
  console.log('🔍 Validating form data...');
  
  const validation = validateFormData(data, schema);
  
  if (!validation.isValid) {
    displayValidationErrors(validation.errors);
    
    // Group errors by tab for the alert message
    const errorsByTab = groupErrorsByTab(validation.errors);
    const totalErrorCount = Object.keys(validation.errors).length;
    
    let summaryText = `Found ${totalErrorCount} validation error(s)`;
    
    // Show breakdown by tab if applicable
    if (Object.keys(errorsByTab).length > 1) {
      summaryText += ' across multiple tabs:\n\n';
      Object.entries(errorsByTab).forEach(([tabKey, tabErrors]) => {
        const tabName = tabKey === '_single' ? 'Form' : 
                       (state.currentSchema?.properties?.[tabKey]?.title || tabKey);
        summaryText += `📑 ${tabName}: ${Object.keys(tabErrors).length} error(s)\n`;
      });
    }
    
    summaryText += '\n\nShowing errors for the current tab.\n';
    summaryText += 'Switch tabs to see errors in other sections.\n';
    summaryText += '\nClick "Go to field" buttons to jump to specific errors.\n';
    summaryText += 'Use "Clear Errors" to dismiss validation messages.';
    
    // Use scrollable alert with custom title
    await ashAlertScrollable(summaryText, '⚠️ Validation Errors');
    
    // Scroll to first error in current tab
    const currentTab = state.currentTab || '_single';
    const currentTabErrors = errorsByTab[currentTab] || {};
    const firstErrorField = Object.keys(currentTabErrors)[0];
    
    if (firstErrorField) {
      const firstInput = findInputElement(firstErrorField);
      if (firstInput) {
        firstInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstInput.focus();
      }
    }
    
    console.log(`❌ Validation failed: ${totalErrorCount} errors across ${Object.keys(errorsByTab).length} section(s)`);
  } else {
    console.log('✅ Validation passed');
  }
  
  return validation.isValid;
}

/**
 * Clears all validation errors from the form (all tabs)
 */
export function clearAllValidationErrors() {
  document.querySelectorAll('.validation-error-message').forEach(el => el.remove());
  document.querySelectorAll('.validation-error').forEach(el => el.classList.remove('validation-error'));
  document.querySelectorAll('.invalid-fields-summary').forEach(el => el.remove());
  
  // Disconnect observer and clear global state
  if (window._tabChangeObserver) {
    window._tabChangeObserver.disconnect();
    window._tabChangeObserver = null;
  }
  window._validationErrorsByTab = null;
  
  console.log('🧹 Cleared all validation errors from all tabs');
}

//==== END OF FILE ====//