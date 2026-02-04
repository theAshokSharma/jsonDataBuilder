// @ts-check
import {ashAlert, ashConfirm} from './utils.js'

/**
 * Extracts ALL referenced field keys from an options configuration object.
 * - Collects keys that represent actual questions/fields (those with a "values" property)
 * - Collects keys used as conditions in "conditional_rules"
 * - Collects all keys listed in "disable_fields" arrays
 *
 * Fully generic — no hardcoding of prefixes or structure.
 *
 * @param {Object} options - The loaded options.json content
 * @returns {Set<string>} Set of all unique field keys referenced
 */
function extractAllReferencedKeys(options) {
  const referencedKeys = new Set();

  // Helper: Recursively collect actual field keys (those with "values")
  function collectFieldKeys(obj) {
    if (!obj || typeof obj !== 'object') return;

    for (const key in obj) {
      // Skip keys starting with underscore (reserved for shared/internal data)
      if (key.startsWith('_')) continue;      
      
      const value = obj[key];

      // Only consider it a field if it has "values" (array or object)
      if (
        value &&
        typeof value === 'object' &&
        'values' in value &&
        Array.isArray(value.values)
      ) {
        referencedKeys.add(key);
      }

      // Recurse into any nested object (e.g. dependent_values, etc.)
      if (typeof value === 'object' && value !== null) {
        collectFieldKeys(value);
      }
    }
  }

  // Step 1: Collect all actual question/option field keys
  collectFieldKeys(options);

  // Step 2: Collect keys from conditional_rules (if present)
  if (options.conditional_rules && typeof options.conditional_rules === 'object') {
    for (const conditionKey in options.conditional_rules) {
      // The condition key itself is a field
      referencedKeys.add(conditionKey);

      const rules = options.conditional_rules[conditionKey];

      // Process each rule
      if (Array.isArray(rules)) {
        for (const rule of rules) {
          if (rule && typeof rule === 'object' && Array.isArray(rule.disable_fields)) {
            rule.disable_fields.forEach(field => {
              if (typeof field === 'string' && field.trim()) {
                referencedKeys.add(field.trim());
              }
            });
          }
        }
      }
    }
  }

  return referencedKeys;
}

function validateOptionsAgainstSchema(options, schema) {
  const allReferencedKeys = extractAllReferencedKeys(options);
  const validSchemaPaths = extractAllSchemaPaths(schema); // from previous improved version

  const missingKeys = [];

  for (const key of allReferencedKeys) {
    // Normalize key (in case of minor formatting differences)
    const normalized = key.trim();

    // Check if this key exists in schema paths
    const found = validSchemaPaths.has(normalized);
    // ||
    //               validSchemaPaths.has(`demographic.${normalized}`) || // fallback for short names
    //               validSchemaPaths.has(`lifestyle.${normalized}`) ||
    //               validSchemaPaths.has(`medical_history.${normalized}`);

    if (!found) {
      missingKeys.push(key);
    }
  }

  return {
    isValid: missingKeys.length === 0,
    missingKeys: missingKeys.sort()
  };
}

// Helper function
function extractAllSchemaPaths(schema) {
  const validPaths = new Set();

  function traverse(obj, path = '') {
    if (!obj || typeof obj !== 'object') return;

    if (obj.properties) {
      for (const [key, val] of Object.entries(obj.properties)) {
        const newPath = path ? `${path}.${key}` : key;
        validPaths.add(newPath);
        traverse(val, newPath);
      }
    }

    if (obj.$ref) {
      const refName = obj.$ref.replace('#/$defs/', '');
      if (schema.$defs?.[refName]) {
        traverse(schema.$defs[refName], path);
      }
    }

    if (obj.anyOf) {
      obj.anyOf.forEach(item => traverse(item, path));
    }
  }

  traverse(schema);

  if (schema.$defs) {
    Object.keys(schema.$defs).forEach(defName => {
      traverse(schema.$defs[defName], defName);
    });
  }

  return validPaths;
}

// NEW: Display validation results
function displayValidationResults(results) {
  if (results.isValid) {
    console.log('✓ options validation passed');
    return true;
  } else {
    console.error('✗ options validation failed');
    console.error('Errors:', results.errors);
    
    // Show errors to user
    const errorMsg = 'options file missing keys in schema:\n\n' + 
                     results.missingKeys.join('\n');
    if (ashConfirm(errorMsg)) return true;
    return false;
  }
}

function resolveRef(ref, schema) {
    if (!ref || !ref.startsWith('#/')) return null;
    
    const path = ref.substring(2).split('/');
    let result = rootSchema;
    
    for (const key of path) {
      if (key === 'definitions' && !result[key] && result.$defs) {
        result = result.$defs;
      } else if (key === '$defs' && !result[key] && result.definitions) {
        result = result.definitions;
      } else {
        result = result[key];
      }
      if (!result) return null;
    }
    
    return result;
  }
  
/**
 * Shows a dialog with scrollable list of validation errors (missing keys)
 * @param {Array} missingKeys - Array of missing key strings
 * @returns {Promise<boolean>} - true if user chooses to proceed, false if they cancel
 */
async function showValidationErrorsDialog(missingKeys) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.background = 'rgba(0,0,0,0.7)';
    modal.style.backdropFilter = 'blur(4px)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '20000';
    modal.style.fontFamily = 'inherit';

    const dialog = document.createElement('div');
    dialog.style.background = 'white';
    dialog.style.borderRadius = '12px';
    dialog.style.boxShadow = '0 10px 40px rgba(0,0,0,0.3)';
    dialog.style.width = '90%';
    dialog.style.maxWidth = '600px';
    dialog.style.maxHeight = '80vh';
    dialog.style.display = 'flex';
    dialog.style.flexDirection = 'column';
    dialog.style.overflow = 'hidden';

    // Header
    const header = document.createElement('div');
    header.style.padding = '24px 24px 16px';
    header.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%)';
    header.style.color = 'white';
    
    const title = document.createElement('h2');
    title.textContent = '⚠️ Validation Warnings';
    title.style.margin = '0 0 8px 0';
    title.style.fontSize = '22px';
    title.style.fontWeight = '600';
    
    const subtitle = document.createElement('p');
    subtitle.textContent = `${missingKeys.length} field(s) in options file not found in schema`;
    subtitle.style.margin = '0';
    subtitle.style.opacity = '0.9';
    subtitle.style.fontSize = '14px';
    
    header.appendChild(title);
    header.appendChild(subtitle);
    
    // Content with scrollable list
    const content = document.createElement('div');
    content.style.padding = '24px';
    content.style.flex = '1';
    content.style.overflowY = 'auto';
    content.style.maxHeight = 'calc(80vh - 200px)';
    
    const warningText = document.createElement('p');
    warningText.innerHTML = `
      The following keys in your options file don't match any fields in the schema:<br><br>
      <strong>Note:</strong> These fields will be ignored when loading options.
    `;
    warningText.style.margin = '0 0 16px 0';
    warningText.style.color = '#555';
    warningText.style.fontSize = '14px';
    warningText.style.lineHeight = '1.5';
    
    const listContainer = document.createElement('div');
    listContainer.style.background = '#f8f9fa';
    listContainer.style.borderRadius = '8px';
    listContainer.style.padding = '16px';
    listContainer.style.maxHeight = '300px';
    listContainer.style.overflowY = 'auto';
    listContainer.style.border = '1px solid #e9ecef';
    
    const keyList = document.createElement('ul');
    keyList.style.margin = '0';
    keyList.style.paddingLeft = '20px';
    keyList.style.listStyleType = 'none';
    
    missingKeys.forEach(key => {
      const listItem = document.createElement('li');
      listItem.textContent = key;
      listItem.style.marginBottom = '8px';
      listItem.style.padding = '8px 12px';
      listItem.style.background = 'white';
      listItem.style.borderRadius = '4px';
      listItem.style.borderLeft = '4px solid #ff6b6b';
      listItem.style.fontFamily = 'monospace';
      listItem.style.fontSize = '13px';
      listItem.style.color = '#495057';
      listItem.style.wordBreak = 'break-word';
      keyList.appendChild(listItem);
    });
    
    listContainer.appendChild(keyList);
    content.appendChild(warningText);
    content.appendChild(listContainer);
    
    // Footer with buttons
    const footer = document.createElement('div');
    footer.style.padding = '20px 24px';
    footer.style.background = '#f8f9fa';
    footer.style.borderTop = '1px solid #e9ecef';
    footer.style.display = 'flex';
    footer.style.justifyContent = 'flex-end';
    footer.style.gap = '12px';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.padding = '12px 24px';
    cancelBtn.style.background = '#6c757d';
    cancelBtn.style.color = 'white';
    cancelBtn.style.border = 'none';
    cancelBtn.style.borderRadius = '6px';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.style.fontWeight = '600';
    cancelBtn.style.fontSize = '14px';
    cancelBtn.style.transition = 'all 0.2s';
    cancelBtn.onmouseover = () => cancelBtn.style.background = '#5a6268';
    cancelBtn.onmouseout = () => cancelBtn.style.background = '#6c757d';
    cancelBtn.onclick = () => {
      resolve(false);
      document.body.removeChild(modal);
    };
    
    const proceedBtn = document.createElement('button');
    proceedBtn.textContent = 'Proceed Anyway';
    proceedBtn.style.padding = '12px 24px';
    proceedBtn.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
    proceedBtn.style.color = 'white';
    proceedBtn.style.border = 'none';
    proceedBtn.style.borderRadius = '6px';
    proceedBtn.style.cursor = 'pointer';
    proceedBtn.style.fontWeight = '600';
    proceedBtn.style.fontSize = '14px';
    proceedBtn.style.boxShadow = '0 4px 12px rgba(40, 167, 69, 0.3)';
    proceedBtn.style.transition = 'all 0.2s';
    proceedBtn.onmouseover = () => {
      proceedBtn.style.transform = 'translateY(-2px)';
      proceedBtn.style.boxShadow = '0 6px 16px rgba(40, 167, 69, 0.4)';
    };
    proceedBtn.onmouseout = () => {
      proceedBtn.style.transform = 'translateY(0)';
      proceedBtn.style.boxShadow = '0 4px 12px rgba(40, 167, 69, 0.3)';
    };
    proceedBtn.onclick = () => {
      resolve(true);
      document.body.removeChild(modal);
    };
    
    footer.appendChild(cancelBtn);
    footer.appendChild(proceedBtn);
    
    dialog.appendChild(header);
    dialog.appendChild(content);
    dialog.appendChild(footer);
    modal.appendChild(dialog);
    
    document.body.appendChild(modal);
    
    // Focus on cancel button for safety
    cancelBtn.focus();
    
    // Close on Escape key
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        resolve(false);
        document.body.removeChild(modal);
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    
    // Clean up event listener when modal closes
    modal.addEventListener('DOMNodeRemoved', () => {
      document.removeEventListener('keydown', handleKeyDown);
    });
  });
}

export { validateOptionsAgainstSchema, 
         showValidationErrorsDialog,
         resolveRef,
         displayValidationResults
};

// === END OF FILE ===