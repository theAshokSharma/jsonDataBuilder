// data-builder.js - JSON data builder
// import 
// import { saveFile } from './utils.js'; 
import {saveJsonWithDialog, exportJsonToClipboard, addTooltip, ashAlert, ashConfirm} from './utils.js'
import {validateOptionsAgainstSchema, showValidationErrorsDialog, resolveRef} from './file-validation.js'

// Global variables
let currentSchema = null;
let formData = {};
let definitions = {};
let customOptions = {};
let conditionalRules = {};
let triggersToAffected = {}; // New: Map of trigger fields to affected dependent fields
let exclusiveOptionsMap = {};   // list all exclusive values for multi-select options
let currentTab = null;
let tabContents = {};
let dataFilename = null;  // stores data file and name and path
let dataFilePath = '';


// Initialize on page load
console.log('JSON Data Builder Loaded - Version 2.0');


// Configuration state
let selectedSchemaFile = null;
let selectedOptionsFile = null;


// Button event listeners
const configBtn = document.getElementById('configBtn');
configBtn.addEventListener('click', showConfigModal);
const configTooltip = addTooltip(configBtn, 'Configure the data builder.');

const loadDataBtn = document.getElementById('loadDataBtn');
loadDataBtn.addEventListener('click', loadDataFromFile);
const dataTooltip = addTooltip(loadDataBtn, 'Load data file in JSON format.');

document.getElementById('saveBtn').addEventListener('click', async () => {
  try {
    renderAllTabs();    // ensure all tabs are rendered before collecting data
    // Check for invalid fields before saving
    const invalidFields = document.querySelectorAll('.invalid-data');
    if (invalidFields.length > 0) {
      const confirmSave = ashConfirm(
        `⚠️ Warning: ${invalidFields.length} field(s) contain invalid values.\n\n` +
        `These fields are highlighted in red. Saving now will export the form with empty values for these fields.\n\n` +
        `Do you want to save anyway?`
      );
      
      if (!confirmSave) {
        // Scroll to first invalid field
        invalidFields[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        invalidFields[0].focus();
        return;
      }
    }
    
    const data = collectFormData();
    // saveJsonToFile(data);
    await saveJsonWithDialog(data, dataFilename, dataFilePath);    
  } catch (error) {
    console.error('Error saving data:', error);
    await ashAlert('Error saving data: ' + error.message);
  }
});

document.getElementById('exportBtn').addEventListener('click', () => {
  try {
    renderAllTabs();  // ensure all tabs are rendered before collecting data
    // Check for invalid fields before exporting
    const invalidFields = document.querySelectorAll('.invalid-data');
    if (invalidFields.length > 0) {
      const confirmExport = ashConfirm(
        `⚠️ Warning: ${invalidFields.length} field(s) contain invalid values.\n\n` +
        `These fields are highlighted in red. Exporting now will copy the form with empty values for these fields.\n\n` +
        `Do you want to export anyway?`
      );
      
      if (!confirmExport) {
        // Scroll to first invalid field
        invalidFields[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        invalidFields[0].focus();
        return;
      }
    }
    
    const data = collectFormData();
    exportJsonToClipboard(data);
  } catch (error) {
    console.error('Error exporting data:', error);
    ashAlert('Error exporting data: ' + error.message);
  }
});

document.getElementById('appIcon').addEventListener('click', () => {
  showAboutModal();
});

const aboutBtn = document.getElementById('aboutBtn');
aboutBtn.addEventListener('click', showAboutModal);
addTooltip(aboutBtn, 'Learn more about this application.');

const hamburgerBtn = document.getElementById('hamburgerBtn');
const headerNav = document.querySelector('.header-nav');

hamburgerBtn.addEventListener('click', () => {
  headerNav.classList.toggle('active');
  hamburgerBtn.classList.toggle('active');
  hamburgerBtn.setAttribute('aria-expanded', headerNav.classList.contains('active'));
});

// Close menu when clicking outside
document.addEventListener('click', (e) => {
  if (!headerNav.contains(e.target) && !hamburgerBtn.contains(e.target) && headerNav.classList.contains('active')) {
    headerNav.classList.remove('active');
    hamburgerBtn.classList.remove('active');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
  }
});

// Add sticky header scroll behavior
window.addEventListener('scroll', () => {
  const header = document.querySelector('.header');
  try {
    if (window.scrollY > 0) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  } catch (error) {
    console.error('Scroll event error:', error);
    // Optional: Show user-friendly message if needed
    // ashAlert('An error occurred while handling scroll. Please refresh the page.');
  }
});

// ==================== CONFIGURATION MODAL =======================
function showConfigModal() {
  const configModal = document.getElementById('config-modal');
  configModal.style.display = 'flex';
  
  // Reset state
  selectedSchemaFile = null;
  selectedOptionsFile = null;
  
  const schemaFileInput = document.getElementById('schemaFileInput');
  const optionsFileInput = document.getElementById('optionsFileInput');
  const schemaFileName = document.getElementById('schemaFileName');
  const optionsFileName = document.getElementById('optionsFileName');
  const validationStatus = document.getElementById('validationStatus');
  const confirmBtn = document.getElementById('confirmConfigBtn');
  
  // Reset UI
  schemaFileName.textContent = '';
  optionsFileName.textContent = '';
  validationStatus.className = 'validation-status';
  validationStatus.innerHTML = `
    <div class="status-icon">⏳</div>
    <div class="status-text">Awaiting files...</div>
  `;
  confirmBtn.disabled = true;
  
  // File input change handlers
  schemaFileInput.onchange = (e) => {
    if (e.target.files[0]) {
      selectedSchemaFile = e.target.files[0];
      schemaFileName.textContent = `📋 ${selectedSchemaFile.name}`;
      updateValidationStatus();
    }
  };
  
  optionsFileInput.onchange = (e) => {
    if (e.target.files[0]) {
      selectedOptionsFile = e.target.files[0];
      optionsFileName.textContent = `⚙️ ${selectedOptionsFile.name}`;
      updateValidationStatus();
    }
  };
  
  // Confirm button handler
  confirmBtn.onclick = async () => {
    if (!selectedSchemaFile) {
      await ashAlert('Please select a schema file.');
      return;
    }
    
  // Reset Load Data button to original state when confirming new configuration
  const loadDataBtn = document.getElementById('loadDataBtn');
  if (loadDataBtn) {
    loadDataBtn.textContent = 'Load Data';
    loadDataBtn.style.color = '';
    loadDataBtn.style.backgroundColor = '';
    dataTooltip.innerText = 'Load data file in JSON format.';
  }
      
    // Show loading state
    validationStatus.className = 'validation-status';
    validationStatus.innerHTML = `
      <div class="status-icon">⏳</div>
      <div class="status-text">Loading and validating files...</div>
    `;
    
    try {
      // Load schema
      const schemaText = await selectedSchemaFile.text();
      const schema = JSON.parse(schemaText);
      currentSchema = schema;
      definitions = schema.definitions || schema.$defs || {};
      
      // Load options if provided
      if (selectedOptionsFile) {
        const optionsText = await selectedOptionsFile.text();
        const options = JSON.parse(optionsText);
        
        // Validate options against schema
        const validationResults = validateOptionsAgainstSchema(options, currentSchema);
        
        if (!validationResults.isValid) {
          // Show validation errors in a custom dialog with scrollable list
          const shouldProceed = await showValidationErrorsDialog(validationResults.missingKeys);
          
          if (!shouldProceed) {
            // User chose to cancel - clear options selection
            selectedOptionsFile = null;
            document.getElementById('optionsFileName').textContent = '';
            document.getElementById('optionsFileInput').value = '';
            
            // Reset validation status
            validationStatus.className = 'validation-status validation-warning';
            validationStatus.innerHTML = `
              <div class="status-icon">⚠️</div>
              <div class="status-text">Options file rejected. Select a new file or continue without options.</div>
            `;
            
            // Clear options data
            customOptions = {};
            conditionalRules = {};
            triggersToAffected = {};
            
            return; // Stay on config page
          }
          
          // User chose to proceed despite validation errors
          customOptions = options;
          conditionalRules = options.conditional_rules || {};
          
          // Build triggersToAffected map for dependencies
          triggersToAffected = {};
          Object.entries(customOptions).forEach(([field, config]) => {
            if (config.dependent_values) {
              const depField = Object.keys(config.dependent_values)[0];
              if (depField) {
                triggersToAffected[depField] = triggersToAffected[depField] || [];
                triggersToAffected[depField].push({
                  affected: field,
                  optionsMap: config.dependent_values[depField],
                  defaultValues: config.values || [],
                  responseType: config.response_type,
                  na: config.na
                });
              }
            }
          });
          
          validationStatus.className = 'validation-status validation-warning';
          validationStatus.innerHTML = `
            <div class="status-icon">⚠️</div>
            <div class="status-text">Loaded with ${validationResults.missingKeys.length} validation warning(s)</div>
          `;
        } else {
          // Validation successful
          customOptions = options;
          conditionalRules = options.conditional_rules || {};
          
          // Build triggersToAffected map for dependencies
          triggersToAffected = {};
          Object.entries(customOptions).forEach(([field, config]) => {
            if (config.dependent_values) {
              const depField = Object.keys(config.dependent_values)[0];
              if (depField) {
                triggersToAffected[depField] = triggersToAffected[depField] || [];
                triggersToAffected[depField].push({
                  affected: field,
                  optionsMap: config.dependent_values[depField],
                  defaultValues: config.values || [],
                  responseType: config.response_type,
                  na: config.na
                });
              }
            }
          });
          
          validationStatus.className = 'validation-status validation-success';
          validationStatus.innerHTML = `
            <div class="status-icon">✅</div>
            <div class="status-text">Validation successful!</div>
          `;
        }
      } else {
        // No options file selected
        customOptions = {};
        conditionalRules = {};
        triggersToAffected = {};

        validationStatus.className = 'validation-status validation-success';
        validationStatus.innerHTML = `
          <div class="status-icon">✅</div>
          <div class="status-text">Schema loaded successfully (no options file)</div>
        `;
      }
      
      // Hide modal and render form
      setTimeout(() => {
        configModal.style.display = 'none';
        renderForm(schema);
        console.log('✓ Configuration loaded successfully');
      }, 500);
      
    } catch (error) {
      validationStatus.className = 'validation-status validation-error';
      validationStatus.innerHTML = `
        <div class="status-icon">❌</div>
        <div class="status-text">Error: ${error.message}</div>
      `;
      await ashAlert('Error loading files: ' + error.message);
      console.error('Config load error:', error);
    }
  };  
  
  // Cancel button handler
  document.getElementById('cancelConfigBtn').onclick = () => {
    configModal.style.display = 'none';
  };
  
  // Close modal when clicking outside
  configModal.onclick = (e) => {
    if (e.target === configModal) {
      configModal.style.display = 'none';
    }
  };
}


function updateValidationStatus() {
  const confirmBtn = document.getElementById('confirmConfigBtn');
  const validationStatus = document.getElementById('validationStatus');
  
  if (selectedSchemaFile) {
    confirmBtn.disabled = false;
    validationStatus.className = 'validation-status validation-success';
    validationStatus.innerHTML = `
      <div class="status-icon">✅</div>
      <div class="status-text">Ready to load ${selectedOptionsFile ? 'both files' : 'schema file'}</div>
    `;
  } else {
    confirmBtn.disabled = true;
    validationStatus.className = 'validation-status';
    validationStatus.innerHTML = `
      <div class="status-icon">⏳</div>
      <div class="status-text">Awaiting files...</div>
    `;
  }
}

// ==================== FILE LOADING FUNCTIONS ====================

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

      // const ajv = new Ajv({ allErrors: true });  // Initialize AJV with allErrors for detailed messages
      // if (!ajv.validateSchema(schema)) {
      //   const errorMessage = 'Invalid JSON Schema structure:\n' + 
      //     ajv.errors.map(err => `- ${err.instancePath} ${err.message}`).join('\n');
      //   ashAlert(errorMessage);
      //   console.error('Schema validation errors:', ajv.errors);
      //   return;  // Return to the same page without loading
      // }      
      currentSchema = schema;
      definitions = schema.definitions || schema.$defs || {};
      renderForm(schema);
      console.log('✓ Schema loaded successfully');

      document.getElementById('loadSchemaBtn').style.color = '#000000ff';
      document.getElementById('loadSchemaBtn').style.backgroundColor = '#99ff00ff';

      schemaTooltip.innerText = schemaFilename + ' loaded.'

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

      // Validate options file ie the corect file for the loaded schema
      if (currentSchema) {
        const validationResults = validateOptionsAgainstSchema(options, currentSchema);
        
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

      customOptions = options;
      conditionalRules = options.conditional_rules || {};
      
      // New: Build triggersToAffected map for dependencies
      triggersToAffected = {};
      Object.entries(customOptions).forEach(([field, config]) => {
        if (config.dependent_values) {
          const depField = Object.keys(config.dependent_values)[0];
          if (depField) {
            triggersToAffected[depField] = triggersToAffected[depField] || [];
            triggersToAffected[depField].push({
              affected: field,
              optionsMap: config.dependent_values[depField],
              defaultValues: config.values || [],
              responseType: config.response_type,
              na: config.na
            });
          }
        }
      });
      
      if (currentSchema) {
        renderForm(currentSchema);
      }

      document.getElementById('loadOptionsBtn').style.color = '#000000ff';
      document.getElementById('loadOptionsBtn').style.backgroundColor = '#99ff00ff';

      optionsTooltip.innerText = optionsFilename + ' loaded.'
          
      console.log('✓ Options loaded with', Object.keys(customOptions).length, 'entries');
    } catch (error) {
        ashAlert('Invalid JSON options file: ' + error.message);
        console.error('Options load error:', error);
    }
  };
  
  input.click();
}

function loadDataFromFile() {
  if (!currentSchema) {
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
    const dataFilename = file.name.endsWith('.json') ? file.name : `${file.name}.json`;

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
            const triggerRules = triggersToAffected[depField] || [];
            const rule = triggerRules.find(r => r.affected === pathStr);
            if (rule) {
              updateFieldOptions(pathStr, currentDepValue, el, rule);
              revalidateAndSetInvalid(el, pathStr);
            }
          }
        });

        document.getElementById('loadDataBtn').style.color = '#000000ff';
        document.getElementById('loadDataBtn').style.backgroundColor = '#99ff00ff';
        loadDataBtn.textContent = 'File loaded';           
        dataTooltip.innerText = dataFilename + ' loaded.'

        console.log('✓ Data loaded successfully');
      }, 100);
    } catch (error) {
      ashAlert('Invalid JSON data file: ' + error.message);
      console.error('Data load error:', error);
    }
  };

  input.click();
}

// ==================== UTILITY FUNCTIONS ====================

// function resolveRef(ref) {
//   if (!ref || !ref.startsWith('#/')) return null;
//   const path = ref.substring(2).split('/');
//   let result = currentSchema;
  
//   for (const key of path) {
//     if (key === 'definitions' && !result[key] && result.$defs) {
//       result = result.$defs;
//     } else {
//       result = result[key];
//     }
//     if (!result) return null;
//   }
//   return result;
// }

function expandRangeValues(rawValues) {
  const expanded = [];
  
  rawValues.forEach(val => {
    if (typeof val === 'string' && val.includes('-')) {
      const rangeMatch = val.match(/^(\d+)-(\d+)$/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1]);
        const end = parseInt(rangeMatch[2]);
        if (start <= end) {
          for (let i = start; i <= end; i++) {
            expanded.push(String(i));
          }
        } else {
          expanded.push(val);
        }
      } else {
        expanded.push(val);
      }
    } else {
      expanded.push(val);
    }
  });
  
  return expanded;
}

function getFieldTypeFromSchema(fieldPath) {
  const keys = fieldPath.split('.');
  let current = currentSchema.properties;
  
  for (let i = 0; i < keys.length; i++) {
    if (!current || !current[keys[i]]) return 'string';
    
    const prop = current[keys[i]];
    
    if (prop.$ref) {
      const resolved = resolveRef(prop.$ref, currentSchema);
      if (i === keys.length - 1) {
        return resolved.type || 'string';
      }
      current = resolved.properties;
    } else if (i === keys.length - 1) {
      return prop.type || 'string';
    } else {
      current = prop.properties;
    }
  }
  
  return 'string';
}

function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const nextKey = keys[i + 1];
    
    if (!isNaN(nextKey)) {
      if (!current[key]) current[key] = [];
      if (!current[key][nextKey]) current[key][nextKey] = {};
      current = current[key][nextKey];
      i++;
    } else {
      if (!current[key]) current[key] = {};
      current = current[key];
    }
  }
  
  current[keys[keys.length - 1]] = value;
}

// New: Update options for a dependent field
function updateFieldOptions(pathStr, depValue, element, rule) {
  const rawValues = rule.optionsMap[depValue] || rule.defaultValues;
  const enumValues = expandRangeValues(rawValues);
  const naValue = rule.na || null;
  const hasNAOption = naValue !== null;
  const responseType = rule.responseType;

  if (responseType === 'single-select') {
    element.innerHTML = '<option value="">-- Select --</option>';
    enumValues.forEach(val => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      element.appendChild(opt);
    });
    if (hasNAOption) {
      const opt = document.createElement('option');
      opt.value = naValue;
      opt.textContent = naValue;
      element.appendChild(opt);
    }
  } else if (responseType === 'multi-select') {
    const dropdown = element.querySelector('.multi-select-dropdown');
    if (!dropdown) return;
    dropdown.innerHTML = '';
    enumValues.forEach((val, idx) => {
      const optionDiv = document.createElement('div');
      optionDiv.className = 'multi-select-option';
      optionDiv.innerHTML = `
        <input type="checkbox" 
               id="${pathStr}_${idx}" 
               value="${val}" 
               data-path="${pathStr}"
               data-dropdown="${element.id}"
               class="multi-select-checkbox"
               onchange="handleMultiSelectChange(event, '${pathStr}', '${element.id}')">
        <label for="${pathStr}_${idx}">${val}</label>
      `;
      dropdown.appendChild(optionDiv);
    });
    if (hasNAOption) {
      const naDiv = document.createElement('div');
      naDiv.className = 'multi-select-option na-option';
      naDiv.innerHTML = `
        <input type="checkbox" 
               id="${pathStr}_na" 
               value="${naValue}" 
               data-path="${pathStr}"
               data-dropdown="${element.id}"
               class="na-checkbox"
               onchange="handleNAChange('${pathStr}', '${element.id}')">
        <label for="${pathStr}_na">${naValue} (exclusive)</label>
      `;
      dropdown.appendChild(naDiv);
    }
  }

  if (responseType === 'multi-select') {
    updateMultiSelectDisplay(element.id, pathStr);
  }
}

// New: Reset a field's value to initial (empty)
function resetFieldValue(pathStr) {
  const el = document.querySelector(`select[data-path="${pathStr}"][data-dependent="true"]`) ||
    document.querySelector(`.multi-select-container[data-dependent="true"][id^="multiselect_${pathStr.replace(/\./g, '_')}"]`);
  if (!el) return;

  if (el.tagName === 'SELECT') {
    el.value = '';
  } else {
    const checkboxes = el.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);
    updateMultiSelectDisplay(el.id, pathStr);
  }
}

// New: Revalidate and set previously invalid values now that options may be available
function revalidateAndSetInvalid(el, pathStr) {
  if (el.classList.contains('invalid-data')) {
    if (el.tagName === 'SELECT') {
      const invalidValue = el.dataset.invalidValue;
      if (invalidValue) {
        const optionExistsNow = Array.from(el.options).some(opt => opt.value === invalidValue);
        if (optionExistsNow) {
          el.value = invalidValue;
          el.classList.remove('invalid-data');
          delete el.dataset.invalidValue;
          removeInvalidWarning(el);
          console.log(`✓ Recovered invalid value for ${pathStr}: ${invalidValue}`);
        }
      }
    } else { // multi-select
      const invalidValues = JSON.parse(el.dataset.invalidValues || '[]');
      if (invalidValues.length > 0) {
        let stillInvalid = [];
        invalidValues.forEach(val => {
          const matchingCb = Array.from(el.querySelectorAll('.multi-select-checkbox')).find(cb => cb.value === val);
          if (matchingCb) {
            matchingCb.checked = true;
          } else {
            stillInvalid.push(val);
          }
        });
        if (stillInvalid.length === 0) {
          el.classList.remove('invalid-data');
          delete el.dataset.invalidValues;
          removeInvalidWarning(el);
          updateMultiSelectDisplay(el.id, pathStr);
          console.log(`✓ Recovered invalid values for ${pathStr}`);
        } else {
          el.dataset.invalidValues = JSON.stringify(stillInvalid);
          addInvalidMultiSelectWarning(el, stillInvalid, pathStr);
        }
      }
    }
  }
}

// ==================== FORM RENDERING ====================

function renderForm(schema) {
  const configBtn = document.getElementById('configBtn');
  const tabsContainer = document.getElementById('tabs-container');
  
  // Hide config modal if visible
  document.getElementById('config-modal').style.display = 'none';

  // Show form and action buttons
  configBtn.textContent = '⚙️ Configure';

  document.getElementById('saveBtn').style.display = 'inline-block';
  document.getElementById('loadDataBtn').style.display = 'inline-block';    
  document.getElementById('exportBtn').style.display = 'inline-block';
  
  // Get tab properties using the new helper function
  const tabProperties = getTabProperties();
  const required = schema.required || [];
  
  createTabs(tabProperties);
  
  for (const [key, prop] of Object.entries(tabProperties)) {
    const isRequired = required.includes(key);
    const tabContent = createTabContent(key, prop, isRequired, [key]);
    tabContents[key] = tabContent;
  }
  
  tabsContainer.style.display = 'block';
  
  if (Object.keys(tabProperties).length > 0) {
    const firstTab = Object.keys(tabProperties)[0];
    switchTab(firstTab);
  }
  
  attachEventListeners();
}

function createTabs(properties) {
  const tabsContainer = document.getElementById('form-tabs');
  const tabContentsContainer = document.getElementById('tab-contents');
  
  tabsContainer.innerHTML = '';
  tabContentsContainer.innerHTML = '';
  tabContents = {};
  
  // Determine what to use for tabs
  const tabProperties = getTabProperties();
  
  Object.keys(tabProperties).forEach((key) => {
    const prop = tabProperties[key];
    const title = prop.title || key;
    
    const tabButton = document.createElement('button');
    tabButton.className = 'tab';
    tabButton.id = `tab-${key}`;
    tabButton.textContent = title;
    tabButton.addEventListener('click', () => switchTab(key));
    
    const tabContent = document.createElement('div');
    tabContent.className = 'tab-content';
    tabContent.id = `content-${key}`;
    
    const titleElement = document.createElement('h2');
    titleElement.textContent = title;
    tabContent.appendChild(titleElement);
    
    tabsContainer.appendChild(tabButton);
    tabContentsContainer.appendChild(tabContent);
  });
}

// Helper function to determine where tab properties are located
function getTabProperties() {
  // Check if schema has top-level properties
  if (currentSchema && currentSchema.properties) {
    return currentSchema.properties;
  }
  
  // Check if schema has definitions/defs that should be used as tabs
  if (currentSchema && (currentSchema.$defs || currentSchema.definitions)) {
    return currentSchema.$defs || currentSchema.definitions;
  }
  
  // If schema has oneOf/anyOf/allOf at top level, use $defs as tabs
  if (currentSchema && (currentSchema.oneOf || currentSchema.anyOf || currentSchema.allOf)) {
    if (currentSchema.$defs) {
      return currentSchema.$defs;
    } else if (currentSchema.definitions) {
      return currentSchema.definitions;
    }
  }
  
  return {};
}

function createTabContent(key, prop, isRequired, path) {
  // For definitions that are objects, create their fields
  if (prop.type === 'object' && prop.properties) {
    return createNestedObject(key, prop, isRequired, path);
  }
  
  // For definitions with oneOf/anyOf/allOf, handle them appropriately
  if (prop.oneOf || prop.anyOf || prop.allOf) {
    return createChoiceField(key, prop, isRequired, path);
  }

  return createField(key, prop, isRequired, path);
}

/*** new function createChoiceField */
function createChoiceField(key, prop, isRequired, path) {
  const title = prop.title || key;
  const description = prop.description || '';
  const pathStr = path.join('.');
  
  let content = '';
  
  // Handle oneOf/anyOf/allOf by creating a selection mechanism
  if (prop.oneOf) {
    content = `<div class="choice-field">
      <select class="choice-selector" data-path="${pathStr}" onchange="handleChoiceChange(this, '${pathStr}')">
        <option value="">-- Select Option --</option>
        ${prop.oneOf.map((item, index) => 
          `<option value="${index}">${item.title || `Option ${index + 1}`}</option>`
        ).join('')}
      </select>
      <div class="choice-content" id="choice-content-${pathStr.replace(/\./g, '_')}"></div>
    </div>`;
  }
  
  return `
    <div class="form-group" data-field-path="${pathStr}">
      <label class="${isRequired ? 'required' : ''}">${title}</label>
      ${description ? `<div class="description">${description}</div>` : ''}
      ${content}
    </div>
  `;
}

window.handleChoiceChange = function(select, pathStr) {
  const choiceIndex = select.value;
  const choiceContent = document.getElementById(`choice-content-${pathStr.replace(/\./g, '_')}`);
  
  if (choiceIndex === '') {
    choiceContent.innerHTML = '';
    return;
  }
  
  const prop = getPropByPath(pathStr);
  if (!prop || !prop.oneOf) return;
  
  const selectedSchema = prop.oneOf[choiceIndex];
  choiceContent.innerHTML = '';
  
  // Render the selected schema
  if (selectedSchema.type === 'object' && selectedSchema.properties) {
    const fieldsHtml = Object.entries(selectedSchema.properties).map(([key, subProp]) => {
      const isSubRequired = (selectedSchema.required || []).includes(key);
      return createField(key, subProp, isSubRequired, [...pathStr.split('.'), key]);
    }).join('');
    
    const div = document.createElement('div');
    div.className = 'choice-selected-content';
    div.innerHTML = fieldsHtml;
    choiceContent.appendChild(div);
    
    // Attach event listeners to the new content
    setTimeout(() => attachEventListeners(), 100);
  }
};

// Helper function to get property by path
function getPropByPath(pathStr) {
  const keys = pathStr.split('.');
  let current = currentSchema;
  
  for (const key of keys) {
    if (current && current[key]) {
      current = current[key];
    } else if (current && (current.properties || current.$defs || current.definitions)) {
      current = (current.properties || current.$defs || current.definitions)[key];
    } else {
      return null;
    }
  }
  
  return current;
}

function switchTab(tabKey) {
  if (currentTab) {
    const prevTabButton = document.getElementById(`tab-${currentTab}`);
    const prevTabContent = document.getElementById(`content-${currentTab}`);
    if (prevTabButton) prevTabButton.classList.remove('active');
    if (prevTabContent) prevTabContent.classList.remove('active');
  }
  
  const newTabButton = document.getElementById(`tab-${tabKey}`);
  const newTabContent = document.getElementById(`content-${tabKey}`);
  
  if (newTabButton && newTabContent) {
    newTabButton.classList.add('active');
    newTabContent.classList.add('active');
    
    if (newTabContent.children.length <= 1) {
      const div = document.createElement('div');
      div.innerHTML = tabContents[tabKey];
      newTabContent.appendChild(div.firstElementChild);
      
      setTimeout(() => attachEventListeners(), 100);
    }
    
    currentTab = tabKey;
  }
}

function renderAllTabs() {
  console.log('Rendering all tabs for data loading...');
  
  // Get all tab keys
  const tabKeys = Object.keys(tabContents);
  
  // Render each tab's content if not already rendered
  tabKeys.forEach(tabKey => {
    const tabContent = document.getElementById(`content-${tabKey}`);
    
    if (tabContent && tabContent.children.length <= 1) {
      // Tab content hasn't been rendered yet
      const div = document.createElement('div');
      div.innerHTML = tabContents[tabKey];
      tabContent.appendChild(div.firstElementChild);
      console.log(`✓ Rendered tab: ${tabKey}`);
    }
  });
  
  // Attach event listeners to all newly rendered elements
  attachEventListeners();
  
  console.log('✓ All tabs rendered');
}

function createField(key, prop, isRequired, path) {
  if (prop.$ref) {
    prop = resolveRef(prop.$ref, currentSchema);
    if (!prop) return '';
  }

  const type = prop.type;
  const title = prop.title || key;
  const description = prop.description || '';
  const pathStr = path.join('.');
  
  if (type === 'object' && prop.properties) {
    return createNestedObject(key, prop, isRequired, path);
  }
  
  if (type === 'array') {
    const items = prop.items;
    if (items && (items.type === 'object' || items.$ref)) {
      return createArrayOfObjects(key, prop, isRequired, path);
    }
  }

  let enumValues = [];
  let responseType = null;
  let hasNAOption = false;
  let naValue = null;
  let isDependent = false;
  let depField = null;
  
  const choiceConfig = customOptions[key] || customOptions[pathStr];
  
  if (choiceConfig && typeof choiceConfig === 'object' && !Array.isArray(choiceConfig)) {
    responseType = choiceConfig.response_type || (type === 'array' ? 'multi-select' : 'single-select');
    naValue = choiceConfig.na || null;
    hasNAOption = naValue !== null;
    isDependent = !!choiceConfig.dependent_values;
    let rawValues;
    if (isDependent) {
      depField = Object.keys(choiceConfig.dependent_values)[0];
      rawValues = []; // Empty initially for dependent fields
    } else {
      rawValues = choiceConfig.values || [];
    }
    enumValues = expandRangeValues(rawValues);

    // New: Add dynamic exclusive values
    const exclusiveValues = choiceConfig.exclusive_values || [];
    exclusiveOptionsMap[pathStr] = exclusiveValues;
  } else if (Array.isArray(choiceConfig)) {
    enumValues = choiceConfig;
    responseType = type === 'array' ? 'multi-select' : 'single-select';
  } else {
    enumValues = prop.enum || [];
    responseType = type === 'array' ? 'multi-select' : 'single-select';
  }
  
  let inputHtml = '';

  if (enumValues.length > 0 || isDependent) {
    if (responseType === 'multi-select') {
      const dropdownId = 'multiselect_' + pathStr.replace(/\./g, '_');
      inputHtml = `
        <div class="multi-select-container" id="${dropdownId}" ${isDependent ? `data-dependent="true" data-dep-field="${depField}"` : ''}>
          <div class="multi-select-trigger" onclick="toggleMultiSelectDropdown('${dropdownId}')" tabindex="0">
            <div class="multi-select-selected" id="${dropdownId}_selected">
              <span class="multi-select-placeholder">-- Select --</span>
            </div>
          </div>
          <div class="multi-select-dropdown" id="${dropdownId}_dropdown">
      `;
      
      if (!isDependent) {
        enumValues.forEach((val, idx) => {
          inputHtml += `
            <div class="multi-select-option">
              <input type="checkbox" 
                     id="${pathStr}_${idx}" 
                     value="${val}" 
                     data-path="${pathStr}"
                     data-dropdown="${dropdownId}"
                     class="multi-select-checkbox"
                     onchange="handleMultiSelectChange(event, '${pathStr}', '${dropdownId}')">
              <label for="${pathStr}_${idx}">${val}</label>
            </div>
          `;
        });
        
        if (hasNAOption) {
          inputHtml += `
            <div class="multi-select-option na-option">
              <input type="checkbox" 
                     id="${pathStr}_na" 
                     value="${naValue}" 
                     data-path="${pathStr}"
                     data-dropdown="${dropdownId}"
                     class="na-checkbox"
                     onchange="handleNAChange('${pathStr}', '${dropdownId}')">
              <label for="${pathStr}_na">${naValue} (exclusive)</label>
            </div>
          `;
        }
      }
      
      inputHtml += `
          </div>
        </div>
      `;
    } else if (responseType === 'single-select') {
      inputHtml = `<select name="${pathStr}" id="${pathStr}" data-path="${pathStr}" ${isDependent ? `data-dependent="true" data-dep-field="${depField}"` : ''}>
        <option value="">-- Select --</option>
      `;
      
      if (!isDependent) {
        inputHtml += `${enumValues.map(val => `<option value="${val}">${val}</option>`).join('')}`;
        if (hasNAOption) {
          inputHtml += `<option value="${naValue}">${naValue}</option>`;
        }
      }
      
      inputHtml += `</select>`;
    }
  } else {
    switch (type) {
      case 'string':
        if (prop.format === 'date') {
          inputHtml = `<input type="date" name="${pathStr}" id="${pathStr}" data-path="${pathStr}" ${isRequired ? 'required' : ''}>`;
        } else if (prop.format === 'email') {
          inputHtml = `<input type="email" name="${pathStr}" id="${pathStr}" data-path="${pathStr}" ${isRequired ? 'required' : ''}>`;
        } else if (prop.maxLength && prop.maxLength > 100) {
          inputHtml = `<textarea name="${pathStr}" id="${pathStr}" data-path="${pathStr}" ${isRequired ? 'required' : ''}></textarea>`;
        } else {
          inputHtml = `<input type="text" name="${pathStr}" id="${pathStr}" data-path="${pathStr}" ${isRequired ? 'required' : ''}>`;
        }
        break;
      case 'integer':
      case 'number':
        inputHtml = `<input type="number" name="${pathStr}" id="${pathStr}" data-path="${pathStr}"
          ${prop.minimum !== undefined ? `min="${prop.minimum}"` : ''}
          ${prop.maximum !== undefined ? `max="${prop.maximum}"` : ''}
          ${isRequired ? 'required' : ''}>`;
        break;
      case 'boolean':
        inputHtml = `<input type="checkbox" name="${pathStr}" id="${pathStr}" data-path="${pathStr}">`;
        break;
      case 'array':
        inputHtml = `<textarea name="${pathStr}" id="${pathStr}" data-path="${pathStr}" placeholder="Enter comma-separated values"></textarea>`;
        break;
      default:
        inputHtml = `<input type="text" name="${pathStr}" id="${pathStr}" data-path="${pathStr}" ${isRequired ? 'required' : ''}>`;
    }
  }

  return `
    <div class="form-group" data-field-path="${pathStr}">
      <label class="${isRequired ? 'required' : ''}">${title}</label>
      ${description ? `<div class="description">${description}</div>` : ''}
      ${inputHtml}
    </div>
  `;
}

function createNestedObject(key, prop, isRequired, path) {
  const title = prop.title || key;
  const description = prop.description || '';
  const pathStr = path.join('.');
  const properties = prop.properties || {};
  const required = prop.required || [];
  
  let fieldsHtml = '';
  for (const [subKey, subProp] of Object.entries(properties)) {
    const isSubRequired = required.includes(subKey);
    fieldsHtml += createField(subKey, subProp, isSubRequired, [...path, subKey]);
  }

  return `
    <div class="form-group" data-field-path="${pathStr}">
      <div class="nested-object">
        <div class="nested-object-header" onclick="toggleNested(this)">
          <span>${title}</span>
          ${isRequired ? '<span style="color: var(--vscode-errorForeground)">*</span>' : ''}
        </div>
        ${description ? `<div class="description">${description}</div>` : ''}
        <div class="nested-object-content">
          ${fieldsHtml}
        </div>
      </div>
    </div>
  `;
}

function createArrayOfObjects(key, prop, isRequired, path) {
  const title = prop.title || key;
  const description = prop.description || '';
  const pathStr = path.join('.');
  
  return `
    <div class="form-group" data-field-path="${pathStr}">
      <label class="${isRequired ? 'required' : ''}">${title}</label>
      ${description ? `<div class="description">${description}</div>` : ''}
      <div class="array-container" id="array_${pathStr}" data-path="${pathStr}">
        <div class="array-controls">
          <button onclick="addArrayItem('${pathStr}', ${JSON.stringify(prop.items).replace(/"/g, '&quot;')})">Add Item</button>
        </div>
      </div>
    </div>
  `;
}

// ==================== GLOBAL WINDOW FUNCTIONS ====================

window.toggleNested = function(header) {
  header.classList.toggle('collapsed');
  header.nextElementSibling.nextElementSibling.classList.toggle('collapsed');
};

window.addArrayItem = function(arrayPath, itemSchema) {
  itemSchema = typeof itemSchema === 'string' ? JSON.parse(itemSchema.replace(/&quot;/g, '"')) : itemSchema;
  
  if (itemSchema.$ref) {
    itemSchema = resolveRef(itemSchema.$ref, currentSchema);
  }
  
  const container = document.getElementById('array_' + arrayPath);
  const items = container.querySelectorAll('.array-item');
  const index = items.length;
  
  const properties = itemSchema.properties || {};
  const required = itemSchema.required || {};
  
  let fieldsHtml = '';
  for (const [subKey, subProp] of Object.entries(properties)) {
    const isSubRequired = required.includes(subKey);
    fieldsHtml += createField(subKey, subProp, isSubRequired, [...arrayPath.split('.'), index, subKey]);
  }
  
  const itemDiv = document.createElement('div');
  itemDiv.className = 'array-item';
  itemDiv.innerHTML = `
    <div class="array-item-header">
      <span class="array-item-title">Item ${index + 1}</span>
      <button class="remove-item-btn" onclick="removeArrayItem(this)">Remove</button>
    </div>
    ${fieldsHtml}
  `;
  
  container.insertBefore(itemDiv, container.querySelector('.array-controls'));
  attachEventListeners();
};

window.removeArrayItem = function(btn) {
  const item = btn.closest('.array-item');
  item.remove();
  const container = item.parentElement;
  const items = container.querySelectorAll('.array-item');
  items.forEach((item, idx) => {
    item.querySelector('.array-item-title').textContent = 'Item ' + (idx + 1);
  });
};

window.handleMultiSelectChange = function(event, path, dropdownId) {
  const changedCheckbox = event.target;
  const isChecked = changedCheckbox.checked;
  const changedValue = changedCheckbox.value;
  
  // Updated: Use dynamic exclusive options from map
  const exclusiveOptions = exclusiveOptionsMap[path] || [];
  
  if (exclusiveOptions.includes(changedValue) && isChecked) {
    const allCheckboxes = document.querySelectorAll(`[data-path="${path}"].multi-select-checkbox, #${path}_na`);
    allCheckboxes.forEach(cb => {
      if (cb !== changedCheckbox) {
        cb.checked = false;
      }
    });
  } else if (changedCheckbox.checked) {
    const allCheckboxes = document.querySelectorAll(`[data-path="${path}"].multi-select-checkbox, #${path}_na`);

    allCheckboxes.forEach(cb => {
      if (exclusiveOptions.includes(cb.value)) {
        cb.checked = false;
      }
    });
  }
  
  updateMultiSelectDisplay(dropdownId, path);
};

window.handleNAChange = function(path, dropdownId) {
  const naCheckbox = document.getElementById(path + '_na');
  if (naCheckbox && naCheckbox.checked) {
    const multiSelectCheckboxes = document.querySelectorAll(`[data-path="${path}"].multi-select-checkbox`);
    multiSelectCheckboxes.forEach(cb => cb.checked = false);
  }
  updateMultiSelectDisplay(dropdownId, path);
};

window.toggleMultiSelectDropdown = function(dropdownId) {
  const dropdown = document.getElementById(dropdownId + '_dropdown');
  if (dropdown) {
    const isOpen = dropdown.classList.contains('open');
    
    document.querySelectorAll('.multi-select-dropdown').forEach(dd => {
      dd.classList.remove('open');
    });
    
    if (!isOpen) {
      dropdown.classList.add('open');
    }
  }
};

function updateMultiSelectDisplay(dropdownId, path) {
  const selectedContainer = document.getElementById(dropdownId + '_selected');
  if (!selectedContainer) return;
  
  const naCheckbox = document.getElementById(path + '_na');
  const selectedCheckboxes = document.querySelectorAll(`[data-path="${path}"].multi-select-checkbox:checked`);
  
  selectedContainer.innerHTML = '';
  
  if (naCheckbox && naCheckbox.checked) {
    const tag = document.createElement('span');
    tag.className = 'multi-select-tag';
    tag.textContent = naCheckbox.value;
    selectedContainer.appendChild(tag);
  } else if (selectedCheckboxes.length > 0) {
    selectedCheckboxes.forEach(cb => {
      const tag = document.createElement('span');
      tag.className = 'multi-select-tag';
      tag.textContent = cb.value;
      selectedContainer.appendChild(tag);
    });
  } else {
    const placeholder = document.createElement('span');
    placeholder.className = 'multi-select-placeholder';
    placeholder.textContent = '-- Select --';
    selectedContainer.appendChild(placeholder);
  }
}

document.addEventListener('click', function(event) {
  if (!event.target.closest('.multi-select-container')) {
    document.querySelectorAll('.multi-select-dropdown').forEach(dd => {
      dd.classList.remove('open');
    });
  }
});

// ==================== CONDITIONAL RULES ====================

function applyConditionalRules() {
  if (!conditionalRules || Object.keys(conditionalRules).length === 0) {
    return;
  }

  console.log('Applying conditional rules...');

  for (const [triggerField, conditions] of Object.entries(conditionalRules)) {
    conditions.forEach(condition => {
      const triggerValue = condition.value;
      const affectedFields = condition.disable_fields || [];
      
      const currentValue = getFieldValue(triggerField);
      const conditionMet = String(currentValue).trim() === String(triggerValue).trim();
      
      console.log('Rule:', {
        triggerField,
        currentValue,
        triggerValue,
        conditionMet,
        affectedFields
      });

      affectedFields.forEach(fieldKey => {
        const fieldGroup = document.querySelector(`[data-field-path="${fieldKey}"]`);
        if (!fieldGroup) {
          console.log('Field group not found:', fieldKey);            
          return;
        }
        
        if (conditionMet) {
          console.log('Disabling field:', fieldKey);            
          fieldGroup.classList.add('disabled');
          
          if (!fieldGroup.querySelector('.disabled-indicator')) {
            const indicator = document.createElement('div');
            indicator.className = 'disabled-indicator';
            indicator.textContent = `Auto-disabled (based on ${triggerField})`;
            fieldGroup.appendChild(indicator);
          }
          
          setDisabledFieldValue(fieldKey, fieldGroup);
        } else {
          console.log('Enabling field:', fieldKey);              
          fieldGroup.classList.remove('disabled');
          
          const indicator = fieldGroup.querySelector('.disabled-indicator');
          if (indicator) {
            indicator.remove();
          }
        }
      });
    });
  }
}

function getFieldValue(fieldPath) {
  let input = document.querySelector(`select[data-path="${fieldPath}"]`);
  if (input) {
    return input.value;
  }
  
  input = document.querySelector(`input[type="text"][data-path="${fieldPath}"], input[type="email"][data-path="${fieldPath}"]`);
  if (input) {
    return input.value;
  }
  
  input = document.querySelector(`input[type="number"][data-path="${fieldPath}"]`);
  if (input) {
    return input.value ? Number(input.value) : null;
  }
  
  input = document.querySelector(`input[type="checkbox"][data-path="${fieldPath}"]:not(.multi-select-checkbox):not(.na-checkbox)`);
  if (input) {
    return input.checked;
  }
  
  const naCheckbox = document.getElementById(fieldPath + '_na');
  if (naCheckbox && naCheckbox.checked) {
    return naCheckbox.value;
  }
  
  const multiCheckboxes = document.querySelectorAll(`[data-path="${fieldPath}"].multi-select-checkbox:checked`);
  if (multiCheckboxes.length > 0) {
    return Array.from(multiCheckboxes).map(cb => cb.value);
  }

  return null;
}

function setDisabledFieldValue(fieldPath, fieldGroup) {
  const fieldType = getFieldTypeFromSchema(fieldPath);
  let defaultValue;
  
  if (fieldType === 'integer' || fieldType === 'number') {
    defaultValue = -9999;
  } else if (fieldType === 'date') {
    defaultValue = '1900-01-01';
  } else {
    defaultValue = 'N/A';
  }
  
  const selectInput = fieldGroup.querySelector(`select[data-path="${fieldPath}"]`);
  if (selectInput) {
    let naOption = Array.from(selectInput.options).find(opt => opt.value === defaultValue);
    if (!naOption && defaultValue === 'N/A') {
      naOption = document.createElement('option');
      naOption.value = 'N/A';
      naOption.textContent = 'N/A';
      selectInput.appendChild(naOption);
    }
    selectInput.value = defaultValue;
    return;
  }
  
  const textInput = fieldGroup.querySelector(`input[type="text"][data-path="${fieldPath}"], input[type="email"][data-path="${fieldPath}"]`);
  if (textInput) {
    textInput.value = defaultValue;
    return;
  }
  
  const numberInput = fieldGroup.querySelector(`input[type="number"][data-path="${fieldPath}"]`);
  if (numberInput) {
    numberInput.value = defaultValue;
    return;
  }
  
  const dateInput = fieldGroup.querySelector(`input[type="date"][data-path="${fieldPath}"]`);
  if (dateInput) {
    dateInput.value = defaultValue;
    return;
  }
  
  const multiSelectContainer = fieldGroup.querySelector('.multi-select-container');
  if (multiSelectContainer) {
    const dropdownId = multiSelectContainer.id;
    
    const allCheckboxes = document.querySelectorAll(`[data-path="${fieldPath}"].multi-select-checkbox`);
    allCheckboxes.forEach(cb => cb.checked = false);
    
    const naCheckbox = document.getElementById(fieldPath + '_na');
    if (naCheckbox) {
      naCheckbox.checked = true;
    }
    
    updateMultiSelectDisplay(dropdownId, fieldPath);
    return;
  }
}

// ==================== EVENT LISTENERS ====================

function attachEventListeners() {
  const inputs = document.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    if (!input.dataset.listenerAttached) {
      input.addEventListener('change', (e) => {
        console.log('Field changed:', input.dataset.path || input.name, 'Value:', input.value);
        formData = collectFormData();
        setTimeout(() => applyConditionalRules(), 100);
        
        // New: Handle dependency updates on change
        const changedPath = e.target.dataset.path;
        if (changedPath && triggersToAffected[changedPath]) {
          const newValue = getFieldValue(changedPath);
          triggersToAffected[changedPath].forEach(rule => {
            const affected = rule.affected;
            const affectedEl = document.querySelector(`select[data-path="${affected}"][data-dependent="true"]`) ||
              document.querySelector(`.multi-select-container[data-dependent="true"][id^="multiselect_${affected.replace(/\./g, '_')}"]`);
            if (affectedEl) {
              if (!window.isPopulating) {
                resetFieldValue(affected);
              }
              updateFieldOptions(affected, newValue, affectedEl, rule);
            }
          });
        }
      });
      input.dataset.listenerAttached = 'true';
    }
  });
  
  document.querySelectorAll('.multi-select-container').forEach(container => {
    const dropdownId = container.id;
    const firstCheckbox = container.querySelector('[data-path]');
    if (firstCheckbox) {
      const path = firstCheckbox.dataset.path;
      updateMultiSelectDisplay(dropdownId, path);
    }
  });
  
  setTimeout(() => applyConditionalRules(), 200);
}

// ==================== DATA COLLECTION ====================

function collectFormData() {
  const data = {};
  const inputs = document.querySelectorAll('[data-path]');
  const processedPaths = new Set();
  
  inputs.forEach(input => {
    const path = input.dataset.path;
    if (!path || processedPaths.has(path)) return;
    
    if (input.classList && input.classList.contains('na-checkbox')) {
      const naCheckbox = document.getElementById(path + '_na');
      if (naCheckbox && naCheckbox.checked) {
        setNestedValue(data, path, naCheckbox.value);
        processedPaths.add(path);
      }
    }
    else if (input.classList && input.classList.contains('multi-select-checkbox')) {
      if (!processedPaths.has(path)) {
        const naCheckbox = document.getElementById(path + '_na');
        if (naCheckbox && naCheckbox.checked) {
          setNestedValue(data, path, naCheckbox.value);
        } else {
          const checkboxes = document.querySelectorAll(`[data-path="${path}"].multi-select-checkbox:checked`);
          if (checkboxes.length > 0) {
            setNestedValue(data, path, Array.from(checkboxes).map(cb => cb.value));
          } else {
            setNestedValue(data, path, []);
          }
        }
        processedPaths.add(path);
      }
    }
    else if (input.type === 'checkbox' && !input.classList.contains('na-checkbox') && !input.classList.contains('multi-select-checkbox')) {
      setNestedValue(data, path, input.checked);
      processedPaths.add(path);
    }
    else if (input.type === 'number') {
      setNestedValue(data, path, input.value ? Number(input.value) : null);
      processedPaths.add(path);
    }
    else if (input.type === 'date'){
      setNestedValue(data, path, input.value || null);
      processedPaths.add(path);
    }
    else if (input.tagName === 'TEXTAREA' && input.placeholder.includes('comma-separated')) {
      const value = input.value.trim() ? input.value.split(',').map(v => v.trim()).filter(v => v) : [];
      setNestedValue(data, path, value);
      processedPaths.add(path);
    }
    else if (input.tagName === 'SELECT' || (input.tagName === 'INPUT' && input.type === 'text') || (input.tagName === 'INPUT' && input.type === 'email') || input.tagName === 'TEXTAREA') {
      setNestedValue(data, path, input.value);
      processedPaths.add(path);
    }
  });
  
  return data;
}

// ==================== DATA POPULATION ====================
function populateFormWithData(data) {
  console.log('=== Starting data population ===');
  populateFields(data, []);
  
  setTimeout(() => {
    applyConditionalRules();
    showInvalidFieldsSummary();
    console.log('✓ Form populated and rules applied');
  }, 300);
}

function showInvalidFieldsSummary() {
  const invalidFields = document.querySelectorAll('.invalid-data');
  if (invalidFields.length === 0) {
    console.log('No invalid fields found');
    return;
  }
  
  let summary = `Found ${invalidFields.length} invalid field(s):\n\n`;
  
  invalidFields.forEach(field => {
    const path = field.dataset.path || 'Unknown path';
    const invalidValue = field.dataset.invalidValue || field.dataset.invalidValues || 'Unknown value';
    summary += `- Field: ${path}\n  Invalid: ${invalidValue}\n\n`;
  });
  
  alert(summary);
  console.log(summary);
}


function populateFields(data, parentPath) {
  for (const [key, value] of Object.entries(data)) {
    const currentPath = [...parentPath, key];
    const pathStr = currentPath.join('.');
    
    console.log(`Processing field: ${pathStr}`, value);
    
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      populateFields(value, currentPath);
    } else if (Array.isArray(value)) {
      if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
        populateArrayOfObjects(pathStr, value);
      } else {
        populateArrayField(pathStr, value);
      }
    } else {
      populateSingleField(pathStr, value);
    }
  }
}

function populateSingleField(pathStr, value) {
  if (value === null || value === undefined) {
    console.log(`Skipping null/undefined for ${pathStr}`);
    return;
  }

  console.log(`Populating single field: ${pathStr} = ${value}`);
  
  // Check if this is actually a multi-select field
  const escapedPath = pathStr.replace(/\./g, '_');
  const multiSelectContainer = document.getElementById(`multiselect_${escapedPath}`);
  
  if (multiSelectContainer) {
    console.log(`Redirecting ${pathStr} to multi-select handler`);
    populateArrayField(pathStr, value);
    return;
  }
  
  // Try select dropdown
  let input = document.querySelector(`select[data-path="${pathStr}"]`);
  if (input) {
    const stringValue = String(value);
    const optionExists = Array.from(input.options).some(option => option.value === stringValue);
    if (optionExists) {
      input.value = stringValue;
      input.classList.remove('invalid-data');
      input.dispatchEvent(new Event('change', { bubbles: true }));
      console.log(`✓ Set select ${pathStr} = ${stringValue}`);
    } else {
      console.warn(`⚠ Value "${stringValue}" not in dropdown for ${pathStr}`);
      console.log('Available options:', Array.from(input.options).map(o => o.value));
      
      // Mark as invalid and store the original value
      input.classList.add('invalid-data');
      input.dataset.invalidValue = stringValue;
      input.value = '';
      
      // Add warning message
      addInvalidDataWarning(input, stringValue, pathStr);
      
      // Add event listener to enforce selection
      enforceValidSelection(input, pathStr);
    }
    return;
  }
  
  // Try text/email input
  input = document.querySelector(`input[type="text"][data-path="${pathStr}"], input[type="email"][data-path="${pathStr}"]`);
  if (input) {
    input.value = String(value);
    input.classList.remove('invalid-data');
    input.dispatchEvent(new Event('change', { bubbles: true }));
    console.log(`✓ Set text ${pathStr} = ${value}`);
    return;
  }
  
  // Try number input
  input = document.querySelector(`input[type="number"][data-path="${pathStr}"]`);
  if (input) {
    input.value = value;
    input.classList.remove('invalid-data');
    input.dispatchEvent(new Event('change', { bubbles: true }));
    console.log(`✓ Set number ${pathStr} = ${value}`);
    return;
  }
  
  // Try date input
  input = document.querySelector(`input[type="date"][data-path="${pathStr}"]`);
  if (input) {
    input.value = value;
    input.classList.remove('invalid-data');
    input.dispatchEvent(new Event('change', { bubbles: true }));
    console.log(`✓ Set date ${pathStr} = ${value}`);
    return;
  }
  
  // Try boolean checkbox
  input = document.querySelector(`input[type="checkbox"][data-path="${pathStr}"]:not(.multi-select-checkbox):not(.na-checkbox)`);
  if (input) {
    input.checked = value === true;
    input.classList.remove('invalid-data');
    input.dispatchEvent(new Event('change', { bubbles: true }));
    console.log(`✓ Set checkbox ${pathStr} = ${value}`);
    return;
  }
  
  // Try textarea
  input = document.querySelector(`textarea[data-path="${pathStr}"]`);
  if (input) {
    if (Array.isArray(value)) {
      input.value = value.join(', ');
    } else {
      input.value = String(value);
    }
    input.classList.remove('invalid-data');
    input.dispatchEvent(new Event('change', { bubbles: true }));
    console.log(`✓ Set textarea ${pathStr} = ${value}`);
    return;
  }
  
  console.warn(`⚠ Could not find input for: ${pathStr}`);
}

function populateArrayField(pathStr, values) {
  console.log(`Populating array field: ${pathStr}`, values);
  
  // Find the multi-select container
  const escapedPath = pathStr.replace(/\./g, '_');
  let container = document.getElementById(`multiselect_${escapedPath}`);
  
  if (!container) {
    const allContainers = document.querySelectorAll('.multi-select-container');
    for (const cont of allContainers) {
      const firstCheckbox = cont.querySelector('[data-path]');
      if (firstCheckbox && firstCheckbox.dataset.path === pathStr) {
        container = cont;
        break;
      }
    }
  }
  
  if (container) {
    const allCheckboxes = document.querySelectorAll(`[data-path="${pathStr}"].multi-select-checkbox`);
    const naCheckbox = document.getElementById(pathStr + '_na');
    
    if (allCheckboxes.length === 0 && !naCheckbox) {
      console.warn(`No checkboxes found for ${pathStr}`);
      return;
    }
    
    // Uncheck all first
    allCheckboxes.forEach(cb => cb.checked = false);
    if (naCheckbox) naCheckbox.checked = false;
    
    // Handle different value types
    const valuesToCheck = Array.isArray(values) ? values : [values];
    const exclusiveOptions = ['None of the listed options', 'Unknown/Unsure', 'N/A'];
    
    console.log(`Values to check for ${pathStr}:`, valuesToCheck);
    
    let hasInvalidValues = false;
    const invalidValues = [];
    
    valuesToCheck.forEach(val => {
      const stringValue = String(val);
      
      // Check if it's the N/A checkbox
      if (naCheckbox && naCheckbox.value === stringValue) {
        naCheckbox.checked = true;
        console.log(`✓ Checked NA for ${pathStr}`);
        return;
      }
      
      // Find and check the matching checkbox
      const matchingCheckbox = Array.from(allCheckboxes).find(cb => String(cb.value) === stringValue);
      if (matchingCheckbox) {
        matchingCheckbox.checked = true;
        console.log(`✓ Checked ${stringValue} for ${pathStr}`);
      } else {
        hasInvalidValues = true;
        invalidValues.push(stringValue);
        console.warn(`⚠ Checkbox not found for value: "${stringValue}" in ${pathStr}`);
        console.log('Available checkbox values:', Array.from(allCheckboxes).map(cb => cb.value));
      }
    });
    
    // Mark as invalid if any values don't match
    if (hasInvalidValues) {
      container.classList.add('invalid-data');
      container.dataset.invalidValues = JSON.stringify(invalidValues);
      addInvalidMultiSelectWarning(container, invalidValues, pathStr);
      enforceValidMultiSelection(container, pathStr);
    } else {
      container.classList.remove('invalid-data');
      removeInvalidWarning(container);
    }
    
    // Update display
    const dropdownId = container.id;
    updateMultiSelectDisplay(dropdownId, pathStr);
    console.log(`✓ Updated display for ${pathStr}`);
    
  } else {
    // console.warn(`⚠ No multi-select container found for ${pathStr}`);
    
    // // Fallback to regular select
    // const selectInput = document.querySelector(`select[data-path="${pathStr}"]`);
    // if (selectInput) {
    //   const valueToSet = Array.isArray(values) ? values[0] : values;
    //   selectInput.value = String(valueToSet);
    //   selectInput.dispatchEvent(new Event('change', { bubbles: true }));
    //   console.log(`✓ Set select (fallback) ${pathStr} = ${valueToSet}`);
    // }
    console.warn(`⚠ No multi-select container found for ${pathStr}`);
    
    // Fallback to regular select, with added validity check
    const selectInput = document.querySelector(`select[data-path="${pathStr}"]`);
    if (selectInput) {
        // For single-select, take the first value if array; warn if multiple values
        let valueToSet = Array.isArray(values) ? values[0] : values;
        if (Array.isArray(values) && values.length > 1) {
          console.warn(`⚠ Multiple values provided for single-select field ${pathStr}; using first value only`);
        }
        
        const stringValue = String(valueToSet);
        const optionExists = Array.from(selectInput.options).some(option => option.value === stringValue);
      
        if (optionExists) {
          selectInput.value = stringValue;
          selectInput.classList.remove('invalid-data');
          selectInput.dispatchEvent(new Event('change', { bubbles: true }));
          console.log(`✓ Set select (fallback) ${pathStr} = ${stringValue}`);
        } else {
          console.warn(`⚠ Value "${stringValue}" not in dropdown for ${pathStr}`);
          console.log('Available options:', Array.from(selectInput.options).map(o => o.value));
        
          // Mark as invalid and store the original value
          selectInput.classList.add('invalid-data');
          selectInput.dataset.invalidValue = stringValue;
          selectInput.value = '';
          
          // Add warning message
          addInvalidDataWarning(selectInput, stringValue, pathStr);
          
          // Enforce valid selection
          enforceValidSelection(selectInput, pathStr);
        }
      }
    }
}

function populateArrayOfObjects(pathStr, items) {
  console.log(`Populating array of objects: ${pathStr}`, items);
  
  const container = document.getElementById('array_' + pathStr);
  if (!container) {
    console.warn(`Array container not found for ${pathStr}`);
    return;
  }
  
  // Clear existing items
  const existingItems = container.querySelectorAll('.array-item');
  existingItems.forEach(item => item.remove());
  
  // Get schema for items
  const keys = pathStr.split('.');
  let currentProp = currentSchema.properties;
  
  for (let i = 0; i < keys.length; i++) {
    if (currentProp[keys[i]]) {
      if (currentProp[keys[i]].$ref) {
        currentProp = resolveRef(currentProp[keys[i]].$ref, currentSchema);
        if (i < keys.length - 1) {
          currentProp = currentProp.properties;
        }
      } else if (i === keys.length - 1) {
        currentProp = currentProp[keys[i]];
      } else {
        currentProp = currentProp[keys[i]].properties;
      }
    }
  }
  
  const itemSchema = currentProp.items;
  
  // Add and populate items
  items.forEach((itemData, index) => {
    window.addArrayItem(pathStr, itemSchema);
    
    setTimeout(() => {
      for (const [subKey, subValue] of Object.entries(itemData)) {
        const itemPath = `${pathStr}.${index}.${subKey}`;
        populateSingleField(itemPath, subValue);
      }
    }, 50 * (index + 1));
  });
  
  console.log(`✓ Populated array ${pathStr} with ${items.length} items`);
}

// ==================== INVALID DATA HANDLING ====================

function addInvalidDataWarning(input, invalidValue, fieldPath) {
  // Remove existing warning if any
  removeInvalidWarning(input);
  
  const formGroup = input.closest('.form-group');
  if (!formGroup) return;
  
  const warning = document.createElement('div');
  warning.className = 'invalid-data-warning';
  warning.innerHTML = `
    <span class="warning-icon">⚠️</span>
    <span class="warning-text">
      Invalid value from data file: <strong>"${invalidValue}"</strong>
      <br>Please select a valid option from the dropdown.
    </span>
  `;
  
  // Insert after the input
  input.parentNode.insertBefore(warning, input.nextSibling);
}

function addInvalidMultiSelectWarning(container, invalidValues, fieldPath) {
  // Remove existing warning if any
  removeInvalidWarning(container);
  
  const formGroup = container.closest('.form-group');
  if (!formGroup) return;
  
  const warning = document.createElement('div');
  warning.className = 'invalid-data-warning';
  warning.innerHTML = `
    <span class="warning-icon">⚠️</span>
    <span class="warning-text">
      Invalid value(s) from data file: <strong>${invalidValues.map(v => `"${v}"`).join(', ')}</strong>
      <br>Please select valid options from the list.
    </span>
  `;
  
  // Insert after the container
  container.parentNode.insertBefore(warning, container.nextSibling);
}

function removeInvalidWarning(element) {
  const formGroup = element.closest('.form-group');
  if (!formGroup) return;
  
  const existingWarning = formGroup.querySelector('.invalid-data-warning');
  if (existingWarning) {
    existingWarning.remove();
  }
}

function enforceValidSelection(selectElement, fieldPath) {
  // Remove any existing listener
  const existingListener = selectElement.dataset.validationListener;
  if (existingListener) return;
  
  const validator = (e) => {
    if (selectElement.value === '') {
      e.preventDefault();
      selectElement.focus();
      
      // Show a more prominent warning
      const formGroup = selectElement.closest('.form-group');
      if (formGroup && !formGroup.querySelector('.selection-required-message')) {
        const message = document.createElement('div');
        message.className = 'selection-required-message';
        message.textContent = '⚠️ Please select a valid value';
        selectElement.parentNode.insertBefore(message, selectElement.nextSibling);
        
        setTimeout(() => message.remove(), 3000);
      }
    } else {
      // Valid selection made, remove invalid state
      selectElement.classList.remove('invalid-data');
      delete selectElement.dataset.invalidValue;
      removeInvalidWarning(selectElement);
      
      // Remove this validator
      selectElement.removeEventListener('blur', validator);
      delete selectElement.dataset.validationListener;
    }
  };
  
  selectElement.addEventListener('blur', validator);
  selectElement.dataset.validationListener = 'true';
  
  // Also validate on change
  selectElement.addEventListener('change', () => {
    if (selectElement.value !== '') {
      selectElement.classList.remove('invalid-data');
      delete selectElement.dataset.invalidValue;
      removeInvalidWarning(selectElement);
      selectElement.removeEventListener('blur', validator);
      delete selectElement.dataset.validationListener;
    }
  }, { once: true });
}

function enforceValidMultiSelection(container, fieldPath) {
  // Remove any existing listener
  const existingListener = container.dataset.validationListener;
  if (existingListener) return;
  
  const trigger = container.querySelector('.multi-select-trigger');
  if (!trigger) return;
  
  const validator = (e) => {
    const allCheckboxes = container.querySelectorAll('.multi-select-checkbox');
    const checkedCheckboxes = container.querySelectorAll('.multi-select-checkbox:checked');
    const naCheckbox = container.querySelector('.na-checkbox');
    
    const hasValidSelection = checkedCheckboxes.length > 0 || (naCheckbox && naCheckbox.checked);
    
    if (!hasValidSelection) {
      e.preventDefault();
      trigger.focus();
      
      // Show a more prominent warning
      const formGroup = container.closest('.form-group');
      if (formGroup && !formGroup.querySelector('.selection-required-message')) {
        const message = document.createElement('div');
        message.className = 'selection-required-message';
        message.textContent = '⚠️ Please select at least one valid option';
        container.parentNode.insertBefore(message, container.nextSibling);
        
        setTimeout(() => message.remove(), 3000);
      }
    } else {
      // Valid selection made, remove invalid state
      container.classList.remove('invalid-data');
      delete container.dataset.invalidValues;
      removeInvalidWarning(container);
      
      // Remove this validator
      trigger.removeEventListener('blur', validator);
      delete container.dataset.validationListener;
    }
  };
  
  trigger.addEventListener('blur', validator);
  container.dataset.validationListener = 'true';
  
  // Also validate on checkbox change
  const checkboxes = container.querySelectorAll('.multi-select-checkbox, .na-checkbox');
  checkboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      const checkedBoxes = container.querySelectorAll('.multi-select-checkbox:checked, .na-checkbox:checked');
      if (checkedBoxes.length > 0) {
        container.classList.remove('invalid-data');
        delete container.dataset.invalidValues;
        removeInvalidWarning(container);
        trigger.removeEventListener('blur', validator);
        delete container.dataset.validationListener;
      }
    }, { once: true });
  });
}

// ==================== ABOUT MODAL =======================
function showAboutModal() {
  const aboutModal = document.getElementById('about-modal');
  aboutModal.style.display = 'flex';

  // Close button handler
  document.getElementById('closeAboutBtn').onclick = () => {
    aboutModal.style.display = 'none';
  };

  // Optional: Close on outside click
  aboutModal.onclick = (e) => {
    if (e.target === aboutModal) {
      aboutModal.style.display = 'none';
    }
  };
}