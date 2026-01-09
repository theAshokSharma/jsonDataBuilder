// Note: This function uses resolveRef() from data-builder.js
// If using standalone, you'll need to import or copy that function
//import { resolveRef } from "./file-validation";


/**
 * Extracts all non-object properties from a JSON schema with their full paths
 * Uses existing resolveRef() helper from data-builder.js (from file-validation.js)
 * @param {Object} schema - JSON schema object
 * @returns {Array<string>} Array of property paths (e.g., "demographic.mbr_first_name")
 */
function extractNonObjectProperties(schema) {
  const properties = [];
  
  /**
   * Recursively traverses schema properties
   * @param {Object} props - Properties object from schema
   * @param {Array<string>} currentPath - Current path array
   * @param {Object} rootSchema - Root schema for resolving references
   */
  function traverse(props, currentPath, rootSchema) {
    if (!props || typeof props !== 'object') return;
    
    for (const [key, value] of Object.entries(props)) {
      const newPath = [...currentPath, key];
      const pathString = newPath.join('.');
      
      // Resolve $ref if present - using existing resolveRef from data-builder.js
      let propSchema = value;
      if (value.$ref) {
        // Use the existing resolveRef function from file-validation.js/data-builder.js
        propSchema = typeof resolveRef !== 'undefined' 
          ? resolveRef(value.$ref, rootSchema)
          : resolveRefLocal(value.$ref, rootSchema);
          
        if (!propSchema) {
          console.warn(`Could not resolve reference: ${value.$ref}`);
          continue;
        }
      }
      
      // Handle anyOf/oneOf with type checking
      if (propSchema.anyOf || propSchema.oneOf) {
        const options = propSchema.anyOf || propSchema.oneOf;
        
        // Check if any option is a non-object type or array
        const hasNonObjectType = options.some(opt => {
          if (opt.type && opt.type !== 'object') return true;
          if (opt.type === 'array') return true;
          return false;
        });
        
        if (hasNonObjectType) {
          properties.push(pathString);
          continue;
        }
      }
      
      // Check property type
      if (propSchema.type) {
        if (propSchema.type === 'object' && propSchema.properties) {
          // Recursively traverse nested object properties
          traverse(propSchema.properties, newPath, rootSchema);
        } else {
          // Non-object type (string, number, integer, boolean, array, etc.)
          properties.push(pathString);
        }
      } else if (propSchema.properties) {
        // No explicit type but has properties - treat as object
        traverse(propSchema.properties, newPath, rootSchema);
      } else {
        // No type specified and no properties - likely a non-object field
        properties.push(pathString);
      }
    }
  }
  
  // Fallback resolveRef if the global one isn't available
  function resolveRefLocal(ref, rootSchema) {
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
  
  // Start traversal from root properties
  if (schema.properties) {
    traverse(schema.properties, [], schema);
  }
  
  return properties;
}

/**
 * Pretty prints the extracted properties
 * @param {Array<string>} properties - Array of property paths
 * @returns {string} Formatted string
 */
function formatProperties(properties) {
  return properties.map((prop, index) => `${index + 1}. ${prop}`).join('\n');
}

// Example usage with the provided schemas
const ckscoreSchema = {
  "$defs": {
    "Demographic": {
      "properties": {
        "mbr_first_name": { "title": "First Name", "type": "string" },
        "mbr_gender_at_birth": { "title": "Your Gender At Birth", "type": "string" },
        "mbr_ethnicity": { "title": "Ethnicity", "type": "string" },
        "mbr_address": {
          "$ref": "#/$defs/MemberAddress"
        },
        "mbr_country_lived_in": {
          "anyOf": [
            { "type": "string" },
            { "items": { "type": "string" }, "type": "array" }
          ],
          "title": "Countries lived in"
        }
      },
      "type": "object"
    },
    "MemberAddress": {
      "properties": {
        "mbr_country": { "title": "Country", "type": "string" },
        "mbr_state": { "title": "State", "type": "string" }
      },
      "type": "object"
    },
    "CarcinogenExposure": {
      "properties": {
        "mbr_occupation": {
          "anyOf": [
            { "type": "string" },
            { "items": { "type": "string" }, "type": "array" }
          ],
          "title": "Occupation"
        },
        "mbr_expose_env": {
          "anyOf": [
            { "type": "string" },
            { "items": { "type": "string" }, "type": "array" }
          ],
          "title": "Environmental exposure"
        }
      },
      "type": "object"
    }
  },
  "properties": {
    "demographic": { "$ref": "#/$defs/Demographic" },
    "carcinogen_exposure": { "$ref": "#/$defs/CarcinogenExposure" }
  },
  "type": "object"
};

// Test the function
console.log("=== Extracted Properties ===\n");
const extractedProps = extractNonObjectProperties(ckscoreSchema);
console.log(formatProperties(extractedProps));
console.log(`\nTotal: ${extractedProps.length} properties`);

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extractNonObjectProperties, formatProperties };
}