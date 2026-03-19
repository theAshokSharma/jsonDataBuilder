// file-operations.js - File loading and saving operations
// Import necessary modules
// @ts-check
import { state, updateState } from './state.js';
import { validateOptionsAgainstSchema, showValidationErrorsDialog, displayValidationResults } from './file-validation.js';
import { ashAlert, ashConfirm} from './utils.js'
import { renderForm, renderAllTabs, updateFileStatusDisplay } from './form-renderer.js';
import { revalidateAndSetInvalid, getFieldValue, updateFieldOptions } from './conditional-rules.js'
import { populateFormWithData } from './form-population.js'
import { 
  saveLastSchemaFile, 
  saveLastOptionsFile, 
  getLastSchemaFile, 
  getLastOptionsFile,
  deriveOptionsFilename,
  createFileFromData,
  clearMismatchedOptions,
  clearLastOptionsFile 
} from './storage-manager.js';

   import {
     getAllSchemas,
     saveToRegistry,
     loadSchemaEntry,
     removeFromRegistry,
     selectSchemaDirectory,
     getDirectoryName,
     isFileSystemAccessSupported
   } from './schema-registry.js';

   import {
     showConfigModal,           // ← the enhanced version
     initSchemaPickerBanner
   } from './showConfigModal-enhanced.js';


function loadSchemaFromFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const schemaFilename = file.name.endsWith('.json') ? file.name : `${file.name}.json`;

    try {
      const text = await file.text();
      const schema = JSON.parse(text);

      updateState({
        currentSchema: schema
      });

      updateState({
        definitions: schema.definitions || schema.$defs || {}
      });
      renderForm(schema);
      console.log('✓ Schema loaded successfully');

      document.getElementById('loadSchemaBtn').style.color = '#000000ff';
      document.getElementById('loadSchemaBtn').style.backgroundColor = '#99ff00ff';

    } catch (error) {
      ashAlert('Invalid JSON schema file: ' + error.message);
      console.error('Schema load error:', error);
    }
  };
  
  input.click();
}

function loadOptionsFromFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const optionsFilename = file.name.endsWith('.json') ? file.name : `${file.name}.json`;

    try {
      const text = await file.text();
      const options = JSON.parse(text);

      
      const resolvedOptions = resolveReferences(options, options);
      // Validate options file ie the corect file for the loaded schema
      if (state.currentSchema) {
        const validationResults = validateOptionsAgainstSchema(resolvedOptions, state.currentSchema);
        
        if (!displayValidationResults(validationResults)) {
          // Validation failed - ask user if they want to proceed anyway
          const proceed = ashConfirm('Validation errors found. Load options anyway?');
          if (!proceed) {
            console.log('User cancelled options loading due to validation errors');
            return;
          }
        }
      } else {
        console.warn('No schema loaded - skipping validation');
      }        

      updateState({
        customOptions: resolvedOptions,
        conditionalRules: resolvedOptions.conditional_rules || {},
        triggersToAffected: {}
      });

      Object.entries(state.customOptions).forEach(([field, config]) => {
        if (config.dependent_values) {
          const depField = Object.keys(config.dependent_values)[0];
          if (depField) {
            state.triggersToAffected[depField] = state.triggersToAffected[depField] || [];
            state.triggersToAffected[depField].push({
              affected: field,
              optionsMap: config.dependent_values[depField],
              defaultValues: config.values || [],
              responseType: config.response_type,
              inputControl: config.input_control || 'drop-down',
              disable_values: config.disable_values || []
            });
          }
        }
      });

      if (state.currentSchema) {
        renderForm(state.currentSchema);
      }

      document.getElementById('loadOptionsBtn').style.color = '#000000ff';
      document.getElementById('loadOptionsBtn').style.backgroundColor = '#99ff00ff';

      // state.optionsTooltip.innerText = optionsFilename + ' loaded.'
          
      console.log('✓ Options loaded with', Object.keys(state.customOptions).length, 'entries');
    } catch (error) {
        ashAlert('Invalid JSON options file: ' + error.message);
        console.error('Options load error:', error);
    }
  };
  
  input.click();
}

function loadDataFromFile() {
  if (!state.currentSchema) {
    ashAlert('Please load a schema first');
    return;
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';

  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // New: Store filename and path (path is limited in browsers)
    updateState({
      dataFilename: file.name.endsWith('.json') ? file.name : `${file.name}.json`,
      dataFilePath: file.webkitRelativePath
    });
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      console.log('Loading data:', data);
      
      // CRITICAL FIX: Render all tabs before populating data
      renderAllTabs();
      
      // Give DOM time to render
      setTimeout(() => {
        window.isPopulating = true;
        populateFormWithData(data);
        window.isPopulating = false;
        
        // New: Recover any invalid dependent fields after population
        document.querySelectorAll('[data-dependent="true"].invalid-data').forEach(el => {
          const pathStr = el.dataset.path || el.querySelector('input[data-path]')?.dataset.path;
          if (pathStr) {
            const depField = el.dataset.depField;
            const currentDepValue = getFieldValue(depField);
            const triggerRules = state.triggersToAffected[depField] || [];
            const rule = triggerRules.find(r => r.affected === pathStr);
            if (rule) {
              updateFieldOptions(pathStr, currentDepValue, el, rule);
              revalidateAndSetInvalid(el, pathStr);
            }
          }
        });

        document.getElementById('loadDataBtn').style.color = '#000000ff';
        document.getElementById('loadDataBtn').style.backgroundColor = '#99ff00ff';
        document.getElementById('loadDataBtn').textContent = 'File loaded';           
        state.dataTooltip.innerText = state.dataFilename + ' loaded.'

        // Update file status display
        updateFileStatusDisplay();

        console.log('✓ Data loaded successfully');
      }, 100);
    } catch (error) {
      ashAlert('Invalid JSON data file: ' + error.message);
      console.error('Data load error:', error);
    }
  };

  input.click();
}


// Resolve JSON references in option file
function resolveReferences(obj, root) {
  if (typeof obj !== 'object' || obj === null) {
    // Resolve ##listName string references (e.g. in dependent_values values)
    if (typeof obj === 'string' && obj.startsWith('##')) {
      const listName = obj.slice(2);
      const resolved = root?._lists?.[listName];
      if (resolved === undefined) {
        console.warn(`⚠️ resolveReferences: ##${listName} not found in _lists`);
        return obj;
      }
      return resolved;
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => resolveReferences(item, root));
  }
  
  if ('$ref' in obj) {
    const refPath = obj.$ref.replace(/^#\//, '').split('/');
    let refValue = root;
    for (const key of refPath) {
      refValue = refValue[key];
    }
    // Recursively resolve all remaining sibling keys (e.g. dependent_values with ## refs)
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === '$ref') continue;
      result[key] = resolveReferences(value, root);
    }
    result.values = refValue;
    return result;
  }
  
  const resolved = {};
  for (const [key, value] of Object.entries(obj)) {
    resolved[key] = resolveReferences(value, root);
  }
  return resolved;
}


// Helper function
/**
 * NEW: Auto-detects and loads matching options file based on schema filename
 * @param {File} schemaFile - Selected schema file
 */
async function autoLoadMatchingOptionsFile(schemaFile) {
  const expectedOptionsName = deriveOptionsFilename(schemaFile.name);
  
  console.log(`🔍 Looking for matching options file: ${expectedOptionsName}`);
  
  // Show searching status
  const optionsFileName = document.getElementById('optionsFileName');
  const optionsFileInput = document.getElementById('optionsFileInput');
  optionsFileName.textContent = `🔍 Searching for ${expectedOptionsName}...`;
  optionsFileName.style.color = '#6c757d';
  
  try {
    // Check if we have it in last used files
    const lastOptions = getLastOptionsFile();
    if (lastOptions && lastOptions.filename === expectedOptionsName) {
      console.log('✅ Found matching options in storage');
      const optionsFile = createFileFromData(lastOptions.filename, lastOptions.data);
      updateState({ selectedOptionsFile: optionsFile });
      optionsFileName.textContent = `⚙️ ${expectedOptionsName} (auto-detected)`;
      optionsFileName.style.color = '#28a745';
      return;
    }
    
    // FIXED: No matching file found - clear old options
    console.log('⚠️ No matching options file found - clearing old selection');
    updateState({ selectedOptionsFile: null });
    optionsFileInput.value = ''; // Clear file input
    optionsFileName.textContent = `ℹ️ ${expectedOptionsName} not found - please select manually (optional)`;
    optionsFileName.style.color = '#6c757d';
    
  } catch (error) {
    console.error('Error auto-loading options:', error);
    // FIXED: On error, also clear old options
    updateState({ selectedOptionsFile: null });
    optionsFileInput.value = '';
    optionsFileName.textContent = `⚠️ Could not auto-load options file`;
    optionsFileName.style.color = '#dc3545';
  }
}

/**
 * NEW: Processes and validates options file
 * Extracted from confirmBtn handler for reusability
 * @param {Object} schema - Current schema
 */
async function processOptionsFile(schema) {
  const validationStatus = document.getElementById('validationStatus');
  const optionsFileName = document.getElementById('optionsFileName');
  const optionsFileInput = document.getElementById('optionsFileInput');
  
  try {
    const optionsText = await state.selectedOptionsFile.text();
    const options = JSON.parse(optionsText);
    
    const resolvedOptions = resolveReferences(options, options);

    // Validate options against schema
    const validationResults = validateOptionsAgainstSchema(resolvedOptions, schema);
    
    updateState({
      optionsFileStatus: validationResults.isValid ? 'loaded' : 'loaded-warning'
    });

    if (!validationResults.isValid) {
      const shouldProceed = await showValidationErrorsDialog(validationResults.missingKeys);
      
      if (!shouldProceed) {
        // ENHANCED: User rejected - clear ALL options state
        updateState({
          selectedOptionsFile: null,
          customOptions: {},
          conditionalRules: {},
          triggersToAffected: {},
          pendingDependentInits: {},
          exclusiveOptionsMap: {}
        });
        
        // Clear UI elements
        optionsFileName.textContent = '';
        optionsFileInput.value = '';
        
        validationStatus.className = 'validation-status validation-warning';
        validationStatus.innerHTML = `
          <div class="status-icon">⚠️</div>
          <div class="status-text">Options file rejected. Select a new file or continue without options.</div>
        `;
        
        return; // Exit early
      }
    }
    
    // Load options (user accepted or validation passed)
    updateState({
      customOptions: resolvedOptions,
      conditionalRules: resolvedOptions.conditional_rules || {},
      triggersToAffected: {}
    });

    // Build triggers map
    Object.entries(state.customOptions).forEach(([field, config]) => {
      if (config.dependent_values) {
        const depField = Object.keys(config.dependent_values)[0];
        if (depField) {
          state.triggersToAffected[depField] = state.triggersToAffected[depField] || [];
          state.triggersToAffected[depField].push({
            affected: field,
            optionsMap: config.dependent_values[depField],
            defaultValues: config.values || [],
            responseType: config.response_type,
            inputControl: config.input_control || 'drop-down',
            disable_values: config.disable_values || []
          });
        }
      }
    });
    
    // NEW: Save options to localStorage
    saveLastOptionsFile(state.selectedOptionsFile.name, resolvedOptions);
    
    // Update status
    if (validationResults.isValid) {
      validationStatus.className = 'validation-status validation-success';
      validationStatus.innerHTML = `
        <div class="status-icon">✅</div>
        <div class="status-text">Validation successful!</div>
      `;
    } else {
      validationStatus.className = 'validation-status validation-warning';
      validationStatus.innerHTML = `
        <div class="status-icon">⚠️</div>
        <div class="status-text">Loaded with ${validationResults.missingKeys.length} validation warning(s)</div>
      `;
    }
    
  } catch (error) {
    // FIXED: On error, clear options state
    updateState({ 
      selectedOptionsFile: null,
      customOptions: {},
      conditionalRules: {},
      triggersToAffected: {}
    });
    optionsFileName.textContent = '';
    optionsFileInput.value = '';
    
    throw new Error(`Options processing failed: ${error.message}`);
  }
}

export {
  loadSchemaFromFile,
  loadOptionsFromFile,
  loadDataFromFile,
  showConfigModal,
  resolveReferences
};

// ==== END OF FILE ====/