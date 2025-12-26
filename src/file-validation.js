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
    const found = validSchemaPaths.has(normalized) ||
                  validSchemaPaths.has(`demographic.${normalized}`) || // fallback for short names
                  validSchemaPaths.has(`lifestyle.${normalized}`) ||
                  validSchemaPaths.has(`medical_history.${normalized}`);

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
  let result = schema;
  
  for (const key of path) {
    if (key === 'definitions' && !result[key] && result.$defs) {
      result = result.$defs;
    } else {
      result = result[key];
    }
    if (!result) return null;
  }
  return result;
}

export { validateOptionsAgainstSchema, 
         displayValidationResults,
         resolveRef
};
