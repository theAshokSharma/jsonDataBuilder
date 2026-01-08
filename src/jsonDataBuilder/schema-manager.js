// schema-manager: manage schema validation and structure analysis

import {resolveRef} from './file-validation.js'

/**
 * Normalizes schema structure to handle variations
 * Some schemas have properties nested in unusual locations
 * 
 * @param {Object} schema - Original JSON schema
 * @returns {Object} Normalized schema with properties at root level
 */
function normalizeSchema(schema) {
  // Standard case: properties already at root
  if (schema.properties) {
    return schema;
  }
  
  // Case 1: Properties nested in $Defs (rule_schema.json pattern)
  // Structure: { "$Defs": { "properties": {...}, "required": [...] } }
  if (schema.$Defs && typeof schema.$Defs === 'object') {
    if (schema.$Defs.properties) {
      console.log('⚠️  Non-standard schema detected: properties nested in $Defs');
      console.log('   Normalizing to standard structure...');
      
      return {
        ...schema,
        type: 'object',
        properties: schema.$Defs.properties,
        required: schema.$Defs.required || [],
        title: schema.title || schema.$Defs.title || 'Form',
        description: schema.description || schema.$Defs.description,
        // Keep original $Defs for reference resolution if needed
        $defs: schema.$defs || schema.definitions || {}
      };
    }
  }
  
  // Case 2: Properties nested in definitions (rare)
  if (schema.definitions && typeof schema.definitions === 'object') {
    for (const [key, def] of Object.entries(schema.definitions)) {
      if (def.properties && !schema.properties) {
        console.log('⚠️  Properties found in definitions, promoting to root');
        return {
          ...schema,
          type: 'object',
          properties: def.properties,
          required: def.required || [],
          title: schema.title || def.title || 'Form'
        };
      }
    }
  }
  
  // Case 3: Properties nested in $defs (standard location, but no root properties)
  if (schema.$defs && typeof schema.$defs === 'object') {
    // Check if there's a single definition that should be the main form
    const defKeys = Object.keys(schema.$defs);
    if (defKeys.length === 1 && schema.$defs[defKeys[0]].properties) {
      console.log('⚠️  Single definition in $defs, using as main form');
      const mainDef = schema.$defs[defKeys[0]];
      return {
        ...schema,
        type: 'object',
        properties: mainDef.properties,
        required: mainDef.required || [],
        title: schema.title || mainDef.title || 'Form'
      };
    }
  }
  
  // No normalization needed/possible
  return schema;
}

/**
 * Enhanced shouldUseTabNavigation with better primitive detection
* Determines if schema should use tab-based navigation
 * Improved logic: Tabs are for top-level properties that reference complex definitions
 * @param {Object} schema - JSON schema (should be normalized first)
 * @returns {boolean} True if tabs should be used
 */
function shouldUseTabNavigation(schema) {
  if (!schema || !schema.properties) {
    return false;
  }
  
  const properties = schema.properties;
  const propertyKeys = Object.keys(properties);
  const propertyCount = propertyKeys.length;
  
  // // Rule 1: Must have at least 2 top-level properties for tabs to make sense
  // if (propertyCount < 2) {
  //   return false;
  // }
  
  // Rule 2: Analyze property types
  let complexRefCount = 0;      // $refs to complex objects
  let inlineObjectCount = 0;    // Inline object definitions
  let primitiveCount = 0;       // Primitives (string, number, boolean, etc.)
  let arrayCount = 0;           // Arrays
  let polymorphicCount = 0;     // oneOf/anyOf/allOf
  let totalNestedFieldCount = 0;
  
  for (const [key, prop] of Object.entries(properties)) {
    // Check for polymorphic types (oneOf/anyOf/allOf)
    if (prop.oneOf || prop.anyOf || prop.allOf) {
      polymorphicCount++;
      primitiveCount++; // Treat as primitive for tab decision
      continue;
    }
    
    // Check if this property is a $ref to a definition
    if (prop.$ref) {
      const resolved = resolveRef(prop.$ref, schema);
      
      if (resolved && resolved.type === 'object' && resolved.properties) {
        // This is a reference to a complex object definition
        complexRefCount++;
        totalNestedFieldCount += Object.keys(resolved.properties).length;
      } else {
        // Reference to primitive or simple type
        primitiveCount++;
      }
    } else if (prop.type === 'object' && prop.properties) {
      // Direct inline object definition
      inlineObjectCount++;
      totalNestedFieldCount += Object.keys(prop.properties).length;
    } else if (prop.type === 'array') {
      arrayCount++;
      // Check if array of objects
      if (prop.items && (prop.items.type === 'object' || prop.items.$ref)) {
        // Array of complex items, might warrant tabs
        inlineObjectCount += 0.5; // Partial weight
      } else {
        primitiveCount++;
      }
    } else if (prop.type) {
      // Simple primitive type (string, number, integer, boolean)
      primitiveCount++;
    } else {
      // No type specified, assume primitive
      primitiveCount++;
    }
  }
  
  console.log('📊 Tab Navigation Analysis:', {
    propertyCount,
    complexRefCount,
    inlineObjectCount,
    primitiveCount,
    polymorphicCount,
    arrayCount,
    totalNestedFieldCount
  });
  
  // Rule 3: PRIMARY RULE - All primitives = NO TABS
  // This catches rule_schema.json pattern: variable, operator, value (all primitives/polymorphic)
  if (primitiveCount === propertyCount) {
    console.log('✅ All properties are primitives → NO TABS (single-form-flat)');
    return false;
  }
  
  // Rule 4: Mostly primitives with few complex = NO TABS
  if (primitiveCount >= propertyCount * 0.8) {
    console.log('✅ Mostly primitives (≥80%) → NO TABS');
    return false;
  }
  
  // Rule 5: Multiple complex references = TABS
  // This is the pattern: properties → $ref → $defs/ComplexObject
  if (complexRefCount >= 2) {
    console.log('✅ Multiple complex refs (≥2) → TABS');
    return true;
  }
  
  // Rule 6: Multiple inline complex objects = TABS
  if (inlineObjectCount >= 2) {
    console.log('✅ Multiple inline objects (≥2) → TABS');
    return true;
  }
  
  // Rule 7: Mixed case - many properties with some complex
  if (propertyCount >= 6 && (complexRefCount + inlineObjectCount) >= 1) {
    console.log('✅ Many properties with complexity → TABS');
    return true;
  }
  
  // Rule 8: High nested field count suggests well-structured sections
  if ((complexRefCount + inlineObjectCount) >= 2 && totalNestedFieldCount >= 15) {
    console.log('✅ High nested field count → TABS');
    return true;
  }
  
  // Default: Don't use tabs
  console.log('✅ Default decision → NO TABS');
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
 * Enhanced determineRenderingStrategy with improved tab detection and normalization
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
  // This handles rule_data_schema.json pattern
  if ((schema.oneOf || schema.anyOf) && propCount === 0) {
    console.log('🎯 Strategy: polymorphic-selector (oneOf/anyOf at root)');
    return 'polymorphic-selector';
  }
  
  // Strategy 2: Check for tab-appropriate structure
  // This is the primary check for test-schema.json pattern
  const useTabs = shouldUseTabNavigation(schema);
  if (useTabs) {
    console.log('🎯 Strategy: multi-section-tabs');
    return 'multi-section-tabs';
  }
  
  // Strategy 3: Polymorphic with properties (rare case)
  if ((schema.oneOf || schema.anyOf) && propCount > 0) {
    console.log('🎯 Strategy: polymorphic-selector (oneOf/anyOf with properties)');
    return 'polymorphic-selector';
  }
  
  // Strategy 4: Recursive/dynamic (self-referencing schemas)
  if (patterns.hasRecursion) {
    console.log('🎯 Strategy: dynamic-recursive');
    return 'dynamic-recursive';
  }
  
  // Strategy 5: Single form with nested objects
  if (depth.hasNestedObjects && propCount <= 10) {
    console.log('🎯 Strategy: single-form-nested');
    return 'single-form-nested';
  }
  
  // Strategy 6: Simple flat form (primitives only)
  if (!depth.hasNestedObjects || propCount <= 20) {
    console.log('🎯 Strategy: single-form-flat');
    return 'single-form-flat';
  }
  
  // Default: Single form with collapsible sections
  console.log('🎯 Strategy: single-form-collapsible (default)');
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

export { analyzeSchemaStructure,
         detectSchemaPattern,
         normalizeSchema
        };
