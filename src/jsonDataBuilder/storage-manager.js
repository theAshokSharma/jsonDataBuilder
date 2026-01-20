// storage-manager.js - Local storage management for file persistence

/**
 * Storage keys
 */
const STORAGE_KEYS = {
  LAST_SCHEMA_NAME: 'jsonDataBuilder_lastSchemaName',
  LAST_OPTIONS_NAME: 'jsonDataBuilder_lastOptionsName',
  LAST_SCHEMA_DATA: 'jsonDataBuilder_lastSchemaData',
  LAST_OPTIONS_DATA: 'jsonDataBuilder_lastOptionsData'
};

/**
 * Saves the last used schema file information
 * @param {string} filename - Schema filename
 * @param {Object} schemaData - Schema JSON data
 */
export function saveLastSchemaFile(filename, schemaData) {
  try {
    localStorage.setItem(STORAGE_KEYS.LAST_SCHEMA_NAME, filename);
    localStorage.setItem(STORAGE_KEYS.LAST_SCHEMA_DATA, JSON.stringify(schemaData));
    console.log('✅ Saved last schema file:', filename);
  } catch (error) {
    console.error('Error saving schema to localStorage:', error);
  }
}

/**
 * Saves the last used options file information
 * @param {string} filename - Options filename
 * @param {Object} optionsData - Options JSON data
 */
export function saveLastOptionsFile(filename, optionsData) {
  try {
    localStorage.setItem(STORAGE_KEYS.LAST_OPTIONS_NAME, filename);
    localStorage.setItem(STORAGE_KEYS.LAST_OPTIONS_DATA, JSON.stringify(optionsData));
    console.log('✅ Saved last options file:', filename);
  } catch (error) {
    console.error('Error saving options to localStorage:', error);
  }
}

/**
 * Retrieves the last used schema file
 * @returns {Object|null} - { filename: string, data: Object } or null
 */
export function getLastSchemaFile() {
  try {
    const filename = localStorage.getItem(STORAGE_KEYS.LAST_SCHEMA_NAME);
    const dataStr = localStorage.getItem(STORAGE_KEYS.LAST_SCHEMA_DATA);
    
    if (!filename || !dataStr) {
      return null;
    }
    
    return {
      filename,
      data: JSON.parse(dataStr)
    };
  } catch (error) {
    console.error('Error loading last schema:', error);
    return null;
  }
}

/**
 * Retrieves the last used options file
 * @returns {Object|null} - { filename: string, data: Object } or null
 */
export function getLastOptionsFile() {
  try {
    const filename = localStorage.getItem(STORAGE_KEYS.LAST_OPTIONS_NAME);
    const dataStr = localStorage.getItem(STORAGE_KEYS.LAST_OPTIONS_DATA);
    
    if (!filename || !dataStr) {
      return null;
    }
    
    return {
      filename,
      data: JSON.parse(dataStr)
    };
  } catch (error) {
    console.error('Error loading last options:', error);
    return null;
  }
}

/**
 * Clears all stored file data
 */
export function clearStoredFiles() {
  try {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    console.log('🗑️ Cleared all stored files');
  } catch (error) {
    console.error('Error clearing storage:', error);
  }
}


/**
 * Clears the last used options file from localStorage
 * Call this when loading a schema without options
 */
export function clearLastOptionsFile() {
  try {
    localStorage.removeItem(STORAGE_KEYS.LAST_OPTIONS_NAME);
    localStorage.removeItem(STORAGE_KEYS.LAST_OPTIONS_DATA);
    console.log('🗑️ Cleared last options file from storage');
  } catch (error) {
    console.error('Error clearing options from localStorage:', error);
  }
}

/**
 * Derives options filename from schema filename
 * Example: "test-schema.json" -> "test-options.json"
 * @param {string} schemaFilename - Schema filename
 * @returns {string} - Derived options filename
 */
export function deriveOptionsFilename(schemaFilename) {
  // Remove .json extension if present
  let baseName = schemaFilename.replace(/\.json$/i, '');
  
  // Replace 'schema' with 'options' (case insensitive)
  baseName = baseName.replace(/schema/i, 'options');
  
  // Add .json extension back
  return baseName + '.json';
}

/**
 * Creates a File object from stored data for backwards compatibility
 * @param {string} filename - Filename
 * @param {Object} data - JSON data
 * @returns {File} - File object
 */
export function createFileFromData(filename, data) {
  const jsonString = JSON.stringify(data);
  const blob = new Blob([jsonString], { type: 'application/json' });
  return new File([blob], filename, { type: 'application/json' });
}

/**
 * Validates if options filename matches schema filename
 * @param {string} schemaFilename - Schema filename
 * @param {string} optionsFilename - Options filename
 * @returns {boolean} - True if they match
 */
export function validateOptionsMatchesSchema(schemaFilename, optionsFilename) {
  const expectedOptionsName = deriveOptionsFilename(schemaFilename);
  return optionsFilename === expectedOptionsName;
}

/**
 * Clears options file from storage if it doesn't match current schema
 * @param {string} schemaFilename - Current schema filename
 */
export function clearMismatchedOptions(schemaFilename) {
  try {
    const lastOptions = getLastOptionsFile();
    if (lastOptions) {
      const expectedOptionsName = deriveOptionsFilename(schemaFilename);
      if (lastOptions.filename !== expectedOptionsName) {
        console.log('🗑️ Clearing mismatched options file from storage');
        console.log('   Schema:', schemaFilename);
        console.log('   Stored options:', lastOptions.filename);
        console.log('   Expected:', expectedOptionsName);
        
        localStorage.removeItem(STORAGE_KEYS.LAST_OPTIONS_NAME);
        localStorage.removeItem(STORAGE_KEYS.LAST_OPTIONS_DATA);
      }
    }
  } catch (error) {
    console.error('Error clearing mismatched options:', error);
  }
}