// schema-manager: manage schema validation and structure analysis

import {resolveRef} from './file-validation.js'



/**
 * Determines if schema should use tab-based navigation
 * Improved logic: Tabs are for top-level properties that reference complex definitions
 * 
 * @param {Object} schema - JSON schema
 * @returns {boolean} True if tabs should be used
 */
function shouldUseTabNavigation(schema) {
  if (!schema || !schema.properties) {
    return false;
  }
  
  const properties = schema.properties;
  const propertyKeys = Object.keys(properties);
  const propertyCount = propertyKeys.length;
  
  // Rule 1: Must have at least 2 top-level properties for tabs to make sense
//   if (propertyCount < 2) {
//     return false;
//   }
  
  // Rule 2: Check if top-level properties are references to complex definitions
  // This is the KEY pattern for test-schema.json
  let complexRefCount = 0;
  let primitiveCount = 0;
  let totalNestedFieldCount = 0;
  
  for (const [key, prop] of Object.entries(properties)) {
    // Check if this property is a $ref to a definition
    if (prop.$ref) {
      const resolved = resolveRef(prop.$ref, schema);
      
      if (resolved && resolved.type === 'object' && resolved.properties) {
        // This is a reference to a complex object definition
        complexRefCount++;
        totalNestedFieldCount += Object.keys(resolved.properties).length;
      } else if (resolved) {
        // Reference to something else (primitive, array, etc.)
        primitiveCount++;
      }
    } else if (prop.type === 'object' && prop.properties) {
      // Direct inline object definition (also counts as complex)
      complexRefCount++;
      totalNestedFieldCount += Object.keys(prop.properties).length;
    } else {
      // Primitive type at top level
      primitiveCount++;
    }
  }
  
  // Rule 3: PRIMARY RULE - Multiple complex references = Tab pattern
  // This is the pattern: properties → $ref → $defs/ComplexObject
  if (complexRefCount >= 2) {
    return true;
  }
  
  // Rule 4: Mixed case - If we have many properties and some are complex, use tabs
  if (propertyCount >= 6 && complexRefCount >= 1) {
    return true;
  }
  
  // Rule 5: Many primitive properties at top level = tabs for organization
  if (propertyCount >= 10 && primitiveCount >= 8) {
    return true;
  }
  
  // Rule 6: High nested field count suggests well-structured sections
  if (complexRefCount >= 2 && totalNestedFieldCount >= 15) {
    return true;
  }
  
  // Default: Don't use tabs
  return false;
}


/**
 * Detects generic schema patterns without specific assumptions
 * @param {Object} schema - JSON schema
 * @returns {Object} Pattern detection results
 */
function detectSchemaPattern(schema) {
  return {
    // Polymorphic patterns (at any level)
    hasOneOf: containsKeyword(schema, 'oneOf'),
    hasAnyOf: containsKeyword(schema, 'anyOf'),
    hasAllOf: containsKeyword(schema, 'allOf'),
    
    // Structural patterns
    hasRecursion: detectRecursiveReferences(schema),
    hasRefs: containsKeyword(schema, '$ref'),
    
    // Array patterns
    hasArrays: containsArrayTypes(schema),
    hasArrayOfObjects: containsArrayOfObjects(schema),
    
    // Nesting patterns
    nestingLevel: calculateMaxNesting(schema),
    hasDeepNesting: calculateMaxNesting(schema) > 2
  };
}

/**
 * Recursively analyzes schema depth and nesting
 * @param {Object} schema - JSON schema or sub-schema
 * @param {Set} visited - Track visited refs to avoid infinite loops
 * @returns {Object} Depth analysis
 */
function analyzeSchemaDepth(schema, visited = new Set()) {
  if (!schema || typeof schema !== 'object') {
    return { maxDepth: 0, hasNestedObjects: false };
  }
  
  let maxDepth = 0;
  let hasNestedObjects = false;
  
  // Handle $ref
  if (schema.$ref) {
    if (visited.has(schema.$ref)) {
      return { maxDepth: 0, hasNestedObjects: false, isRecursive: true };
    }
    visited.add(schema.$ref);
    const resolved = resolveRef(schema.$ref, schema);
    if (resolved) {
      return analyzeSchemaDepth(resolved, visited);
    }
  }
  
  // Analyze properties
  if (schema.properties) {
    hasNestedObjects = true;
    for (const [key, prop] of Object.entries(schema.properties)) {
      const propAnalysis = analyzeSchemaDepth(prop, new Set(visited));
      maxDepth = Math.max(maxDepth, propAnalysis.maxDepth + 1);
      hasNestedObjects = hasNestedObjects || propAnalysis.hasNestedObjects;
    }
  }
  
  // Analyze oneOf/anyOf/allOf
  for (const keyword of ['oneOf', 'anyOf', 'allOf']) {
    if (schema[keyword] && Array.isArray(schema[keyword])) {
      schema[keyword].forEach(subSchema => {
        const subAnalysis = analyzeSchemaDepth(subSchema, new Set(visited));
        maxDepth = Math.max(maxDepth, subAnalysis.maxDepth);
        hasNestedObjects = hasNestedObjects || subAnalysis.hasNestedObjects;
      });
    }
  }
  
  // Analyze array items
  if (schema.type === 'array' && schema.items) {
    const itemAnalysis = analyzeSchemaDepth(schema.items, new Set(visited));
    maxDepth = Math.max(maxDepth, itemAnalysis.maxDepth);
    hasNestedObjects = hasNestedObjects || itemAnalysis.hasNestedObjects;
  }
  
  return { maxDepth, hasNestedObjects };
}


/**
 * Detects if schema has recursive references (self-referencing)
 * @param {Object} schema - JSON schema
 * @param {string} schemaPath - Current path in schema
 * @param {Map} visited - Track visited paths
 * @returns {boolean} True if recursive references found
 */
function detectRecursiveReferences(schema, schemaPath = '#', visited = new Map()) {
  if (!schema || typeof schema !== 'object') return false;
  
  // Check if we've visited this exact schema object
  if (visited.has(schema)) return true;
  visited.set(schema, schemaPath);
  
  // Check $ref for self-reference
  if (schema.$ref) {
    // Check if ref points to parent or ancestor
    if (schema.$ref === '#' || schema.$ref.startsWith('#/')) {
      const refPath = schema.$ref.substring(2);
      // If ref points to current path or parent, it's recursive
      if (schemaPath.includes(refPath) || refPath.includes(schemaPath.split('/').slice(0, -1).join('/'))) {
        return true;
      }
    }
  }
  
  // Recursively check nested structures
  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (detectRecursiveReferences(prop, `${schemaPath}/properties/${key}`, new Map(visited))) {
        return true;
      }
    }
  }
  
  // Check oneOf/anyOf/allOf
  for (const keyword of ['oneOf', 'anyOf', 'allOf']) {
    if (Array.isArray(schema[keyword])) {
      for (let i = 0; i < schema[keyword].length; i++) {
        if (detectRecursiveReferences(schema[keyword][i], `${schemaPath}/${keyword}/${i}`, new Map(visited))) {
          return true;
        }
      }
    }
  }
  
  // Check array items
  if (schema.items) {
    if (detectRecursiveReferences(schema.items, `${schemaPath}/items`, new Map(visited))) {
      return true;
    }
  }
  
  return false;
}


// Schema helper functions
/**
 * Checks if schema contains a specific keyword anywhere in structure
 */
function containsKeyword(schema, keyword, visited = new Set()) {
  if (!schema || typeof schema !== 'object') return false;
  if (visited.has(schema)) return false;
  visited.add(schema);
  
  if (keyword in schema) return true;
  
  for (const value of Object.values(schema)) {
    if (typeof value === 'object' && value !== null) {
      if (containsKeyword(value, keyword, visited)) return true;
    }
  }
  
  return false;
}

/**
 * Checks if schema contains array types
 */
function containsArrayTypes(schema) {
  return containsTypePattern(schema, 'array');
}

/**
 * Checks if schema contains arrays of objects
 */
function containsArrayOfObjects(schema, visited = new Set()) {
  if (!schema || typeof schema !== 'object') return false;
  if (visited.has(schema)) return false;
  visited.add(schema);
  
  if (schema.type === 'array' && schema.items) {
    const items = schema.items;
    if (items.type === 'object' || items.$ref) return true;
  }
  
  for (const value of Object.values(schema)) {
    if (typeof value === 'object' && value !== null) {
      if (containsArrayOfObjects(value, visited)) return true;
    }
  }
  
  return false;
}

/**
 * Generic type pattern checker
 */
function containsTypePattern(schema, typeName, visited = new Set()) {
  if (!schema || typeof schema !== 'object') return false;
  if (visited.has(schema)) return false;
  visited.add(schema);
  
  if (schema.type === typeName) return true;
  
  for (const value of Object.values(schema)) {
    if (typeof value === 'object' && value !== null) {
      if (containsTypePattern(value, typeName, visited)) return true;
    }
  }
  
  return false;
}

/**
 * Calculates maximum nesting level
 */
function calculateMaxNesting(schema, currentLevel = 0, visited = new Set()) {
  if (!schema || typeof schema !== 'object') return currentLevel;
  if (visited.has(schema)) return currentLevel;
  visited.add(schema);
  
  let maxLevel = currentLevel;
  
  if (schema.properties) {
    for (const prop of Object.values(schema.properties)) {
      const propLevel = calculateMaxNesting(prop, currentLevel + 1, new Set(visited));
      maxLevel = Math.max(maxLevel, propLevel);
    }
  }
  
  return maxLevel;
}

/**
 * Checks if polymorphic patterns exist at root or immediate properties
 */
function hasPolymorphicPatterns(schema) {
  if (schema.oneOf || schema.anyOf) return true;
  
  if (schema.properties) {
    for (const prop of Object.values(schema.properties)) {
      if (prop.oneOf || prop.anyOf) return true;
    }
  }
  
  return false;
}

//=====================


/**
 * Enhanced determineRenderingStrategy with improved tab detection
 * 
 * @param {Object} schema - JSON schema
 * @param {Object} depth - Depth analysis result
 * @param {Object} complexity - Complexity analysis result
 * @returns {string} Rendering strategy name
 */
function determineRenderingStrategy(schema, depth, complexity) {
  const patterns = detectSchemaPattern(schema);
  const properties = schema.properties || {};
  const propCount = Object.keys(properties).length;
  
  // Strategy 1: Polymorphic root (oneOf/anyOf at root level, no properties)
  // This handles rule_schema.json and rule_data_schema.json
  if ((schema.oneOf || schema.anyOf) && propCount === 0) {
    return 'polymorphic-selector';
  }
  
  // Strategy 2: Check for tab-appropriate structure FIRST
  // This is the primary check for test-schema.json pattern
  const useTabs = shouldUseTabNavigation(schema);
  if (useTabs) {
    return 'multi-section-tabs';
  }
  
  // Strategy 3: Polymorphic with properties (rare case)
  if ((schema.oneOf || schema.anyOf) && propCount > 0) {
    return 'polymorphic-selector';
  }
  
  // Strategy 4: Recursive/dynamic (self-referencing schemas)
  if (patterns.hasRecursion) {
    return 'dynamic-recursive';
  }
  
  // Strategy 5: Single form with nested objects (some complexity but no tabs needed)
  if (depth.hasNestedObjects && propCount <= 10) {
    return 'single-form-nested';
  }
  
  // Strategy 6: Simple flat form
  if (!depth.hasNestedObjects && propCount <= 20) {
    return 'single-form-flat';
  }
  
  // Default: Single form with collapsible sections
  return 'single-form-collapsible';
}

/**
 * Enhanced analyzeSchemaStructure to better detect tab patterns
 * 
 * @param {Object} schema - JSON schema to analyze
 * @returns {Object} Analysis result with detected patterns
 */
function analyzeSchemaStructure(schema) {
  const properties = schema.properties || {};
  const topLevelKeys = Object.keys(properties);
  
  // Analyze depth and complexity
  const depth = analyzeSchemaDepth(schema);
  const complexity = analyzePropertyComplexity(properties, schema);
  
  // NEW: Analyze top-level property structure
  const topLevelAnalysis = analyzeTopLevelProperties(schema);
  
  return {
    // Generic metrics
    propertyCount: topLevelKeys.length,
    maxDepth: depth.maxDepth,
    hasNestedObjects: depth.hasNestedObjects,
    
    // NEW: Top-level structure analysis
    topLevelStructure: topLevelAnalysis,
    
    // Structural patterns
    hasPolymorphicRoots: hasPolymorphicPatterns(schema),
    hasRecursiveRefs: detectRecursiveReferences(schema),
    
    // Rendering hints
    requiresTabNavigation: shouldUseTabNavigation(schema),
    requiresTypeSelector: (schema.oneOf || schema.anyOf) && topLevelKeys.length === 0,
    
    // Metadata
    topLevelKeys: topLevelKeys,
    complexityScore: complexity.score,
    renderingStrategy: determineRenderingStrategy(schema, depth, complexity)
  };
}

/**
 * NEW: Analyzes the structure of top-level properties
 * Determines if they follow the "properties → $ref → $defs" pattern
 * 
 * @param {Object} schema - JSON schema
 * @returns {Object} Top-level structure analysis
 */
function analyzeTopLevelProperties(schema) {
  if (!schema.properties) {
    return {
      hasProperties: false,
      complexRefCount: 0,
      inlineObjectCount: 0,
      primitiveCount: 0,
      arrayCount: 0,
      isTabPattern: false
    };
  }
  
  const properties = schema.properties;
  let complexRefCount = 0;      // Properties that are $ref to complex objects
  let inlineObjectCount = 0;    // Properties that are inline object definitions
  let primitiveCount = 0;       // Properties that are primitives (string, number, etc.)
  let arrayCount = 0;           // Properties that are arrays
  let refToDefCount = 0;        // References specifically to $defs
  
  for (const [key, prop] of Object.entries(properties)) {
    if (prop.$ref) {
      // Check if this is a reference to $defs (the tab pattern)
      if (prop.$ref.startsWith('#/$defs/') || prop.$ref.startsWith('#/definitions/')) {
        refToDefCount++;
        
        const resolved = resolveRef(prop.$ref, schema);
        if (resolved && resolved.type === 'object' && resolved.properties) {
          complexRefCount++;
        }
      } else {
        // Other kind of reference
        const resolved = resolveRef(prop.$ref, schema);
        if (resolved && resolved.type === 'object' && resolved.properties) {
          complexRefCount++;
        }
      }
    } else if (prop.type === 'object' && prop.properties) {
      inlineObjectCount++;
    } else if (prop.type === 'array') {
      arrayCount++;
    } else {
      primitiveCount++;
    }
  }
  
  // The "tab pattern" is: multiple top-level properties that reference $defs objects
  const isTabPattern = refToDefCount >= 2 || 
                       (complexRefCount + inlineObjectCount) >= 2;
  
  return {
    hasProperties: true,
    complexRefCount,
    inlineObjectCount,
    primitiveCount,
    arrayCount,
    refToDefCount,
    isTabPattern,
    totalProperties: Object.keys(properties).length
  };
}

/**
 * Enhanced analyzePropertyComplexity to consider references
 * 
 * @param {Object} properties - Schema properties
 * @returns {Object} Complexity metrics
 */
function analyzePropertyComplexity(properties, schema) {
  let objectCount = 0;
  let primitiveCount = 0;
  let arrayCount = 0;
  let refCount = 0;
  let refToComplexObjectCount = 0;
  
  for (const [key, prop] of Object.entries(properties)) {
    if (prop.$ref) {
      refCount++;
      const resolved = resolveRef(prop.$ref, schema);
      if (resolved) {
        if (resolved.type === 'object' && resolved.properties) {
          objectCount++;
          refToComplexObjectCount++;
        } else if (resolved.type === 'array') {
          arrayCount++;
        } else {
          primitiveCount++;
        }
      }
    } else if (prop.type === 'object') {
      objectCount++;
      if (prop.properties) {
        // Inline complex object
        refToComplexObjectCount++;
      }
    } else if (prop.type === 'array') {
      arrayCount++;
    } else {
      primitiveCount++;
    }
  }
  
  // Enhanced complexity score
  // Give more weight to references to complex objects (the tab pattern)
  const score = (refToComplexObjectCount * 4) + 
                (objectCount * 3) + 
                (arrayCount * 2) + 
                primitiveCount + 
                (refCount * 1.5);
  
  return {
    objectCount,
    primitiveCount,
    arrayCount,
    refCount,
    refToComplexObjectCount,
    score,
    isComplex: refToComplexObjectCount >= 2 || score > 15
  };
}


//======================
export { analyzeSchemaStructure, 
         detectSchemaPattern
        };
