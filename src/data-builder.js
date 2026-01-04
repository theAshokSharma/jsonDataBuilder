// data-builder.js - JSON data builder
import { state, updateState, getState } from './state.js';

import {saveJsonWithDialog, exportJsonToClipboard, addTooltip, ashAlert, ashConfirm} from './utils.js'
import {validateOptionsAgainstSchema, showValidationErrorsDialog, resolveRef} from './file-validation.js'
import {analyzeSchemaStructure, normalizeSchema, detectSchemaPattern} from './schema-manager.js'
import {createInputControl, createDefaultInput, populateCheckboxList, populateRadioButton, populateSlider} from './input-control.js'

let selectedOptionsFile = null;

// Initialize on page load
console.log('JSON Data Builder Loaded - Version 2.5');


// Configuration state



// Button event listeners
const configBtn = document.getElementById('configBtn');
configBtn.addEventListener('click', showConfigModal);
const configTooltip = addTooltip(configBtn, 'Configure the data builder.');

const loadDataBtn = document.getElementById('loadDataBtn');
loadDataBtn.addEventListener('click', loadDataFromFile);
const dataTooltip = addTooltip(loadDataBtn, 'Load data file in JSON format.');

const aboutBtn = document.getElementById('aboutBtn');
aboutBtn.addEventListener('click', showAboutModal);
addTooltip(aboutBtn, 'Learn more about this application.');

const hamburgerBtn = document.getElementById('hamburgerBtn');
const headerNav = document.querySelector('.header-nav');


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
    await saveJsonWithDialog(data, state.dataFilename, state.dataFilePath);    
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
  updateState({
    selectedSchemaFile: null,
    selectedOptionsFile: null
  });
  
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
      updateState({
        selectedSchemaFile: e.target.files[0]
      });
      schemaFileName.textContent = `📋 ${state.selectedSchemaFile.name}`;
      updateValidationStatus();
    }
  };
  
  optionsFileInput.onchange = (e) => {
    if (e.target.files[0]) {
      updateState({
        selectedOptionsFile: e.target.files[0]
      });
      optionsFileName.textContent = `⚙️ ${state.selectedOptionsFile.name}`;
      updateValidationStatus();
    }
  };
  
  // Confirm button handler
  confirmBtn.onclick = async () => {
    if (!state.selectedSchemaFile) {
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
      const schemaText = await state.selectedSchemaFile.text();
      const schema = JSON.parse(schemaText);

      updateState({
        currentSchema: schema
      });

      updateState({
        definitions: schema.definitions || schema.$defs || {}
      });

      // Load options if provided
      if (state.selectedOptionsFile) {
        const optionsText = await state.selectedOptionsFile.text();
        const options = JSON.parse(optionsText);
        
        // Validate options against schema
        const validationResults = validateOptionsAgainstSchema(options, state.currentSchema);
        
        if (!validationResults.isValid) {
          // Show validation errors in a custom dialog with scrollable list
          const shouldProceed = await showValidationErrorsDialog(validationResults.missingKeys);
          
          if (!shouldProceed) {
            // User chose to cancel - clear options selection
            updateState({
              selectedOptionsFile: null
            });
            document.getElementById('optionsFileName').textContent = '';
            document.getElementById('optionsFileInput').value = '';
            
            // Reset validation status
            validationStatus.className = 'validation-status validation-warning';
            validationStatus.innerHTML = `
              <div class="status-icon">⚠️</div>
              <div class="status-text">Options file rejected. Select a new file or continue without options.</div>
            `;
            
            // Clear options data
            updateState({
              customOptions: {},
              conditionalRules: {},
              triggersToAffected: {}
            });

            return; // Stay on config page
          }
          
          // User chose to proceed despite validation errors
          updateState({
            customOptions: options,
            conditionalRules: options.conditional_rules || {},
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
          updateState({
            customOptions: options,
            conditionalRules: options.conditional_rules || {},
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
        // No options file 
        updateState({
          customOptions: {},
          conditionalRules: {},
          triggersToAffected: {}
        });

        validationStatus.className = 'validation-status validation-success';
        validationStatus.innerHTML = `
          <div class="status-icon">✅</div>
          <div class="status-text">Schema loaded successfully (no options file)</div>
        `;
      }
      
      // Hide modal and render form
      setTimeout(() => {
        configModal.style.display = 'none';
        renderForm(state.currentSchema);
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
  
  if (state.selectedSchemaFile) {
    confirmBtn.disabled = false;
    validationStatus.className = 'validation-status validation-success';
    validationStatus.innerHTML = `
      <div class="status-icon">✅</div>
      <div class="status-text">Ready to load ${state.selectedOptionsFile ? 'both files' : 'schema file'}</div>
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
x
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
      if (state.currentSchema) {
        const validationResults = validateOptionsAgainstSchema(options, state.currentSchema);
        
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
        customOptions: options,
        conditionalRules: options.conditional_rules || {},
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
              na: config.na
            });
          }
        }
      });

      if (state.currentSchema) {
        renderForm(state.currentSchema);
      }

      document.getElementById('loadOptionsBtn').style.color = '#000000ff';
      document.getElementById('loadOptionsBtn').style.backgroundColor = '#99ff00ff';

      optionsTooltip.innerText = optionsFilename + ' loaded.'
          
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
      dataFilePath: file.webkitRelativePath || file.name
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
        loadDataBtn.textContent = 'File loaded';           
        dataTooltip.innerText = state.dataFilename + ' loaded.'

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


function getFieldTypeFromSchema(fieldPath) {
  const keys = fieldPath.split('.');
  let current = state.currentSchema.properties;
  
  for (let i = 0; i < keys.length; i++) {
    if (!current || !current[keys[i]]) return 'string';
    
    const prop = current[keys[i]];
    
    if (prop.$ref) {
      const resolved = resolveRef(prop.$ref, state.currentSchema);
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
/**
 * Enhanced renderForm with schema normalization
 * 
 * @param {Object} schema - JSON schema (potentially non-standard)
 */
function renderForm(schema) {
  console.log('📋 Original schema structure:', {
    hasProperties: !!schema.properties,
    hasOneOf: !!schema.oneOf,
    hasAnyOf: !!schema.anyOf,
    has$Defs: !!schema.$Defs,
    has$defs: !!schema.$defs,
    hasDefinitions: !!schema.definitions
  });
  
  // Step 1: Normalize schema structure
  const normalizedSchema = normalizeSchema(schema);
  updateState({
    currentSchema: normalizedSchema
  });
  
  console.log('📋 Normalized schema structure:', {
    hasProperties: !!normalizedSchema.properties,
    propertyCount: normalizedSchema.properties ? Object.keys(normalizedSchema.properties).length : 0,
    propertyKeys: normalizedSchema.properties ? Object.keys(normalizedSchema.properties) : []
  });
  
  // Step 2: Analyze normalized schema
  const analysis = analyzeSchemaStructure(normalizedSchema);
  const patterns = detectSchemaPattern(normalizedSchema);
  
  console.log('🔍 Schema Analysis:', analysis);
  console.log('🔍 Detected Patterns:', patterns);
  
  // Step 3: Hide config modal
  document.getElementById('config-modal').style.display = 'none';
  
  // Step 4: Show form UI
  document.getElementById('configBtn').textContent = '⚙️ Config';
  document.getElementById('saveBtn').style.display = 'inline-block';
  document.getElementById('loadDataBtn').style.display = 'inline-block';
  document.getElementById('exportBtn').style.display = 'inline-block';
  
  // Step 5: Route to appropriate renderer
  switch(analysis.renderingStrategy) {
    case 'multi-section-tabs':
      console.log('🎨 Rendering: Multi-section with tabs');
      renderMultiSectionForm(normalizedSchema, analysis);
      break;
      
    case 'polymorphic-selector':
      console.log('🎨 Rendering: Polymorphic form with type selector');
      renderPolymorphicForm(normalizedSchema, analysis);
      break;
      
    case 'dynamic-recursive':
      console.log('🎨 Rendering: Recursive/dynamic form');
      renderRecursiveForm(normalizedSchema, analysis);
      break;
      
    case 'single-form-nested':
      console.log('🎨 Rendering: Single form with nested objects');
      renderSingleForm(normalizedSchema, analysis);
      break;
      
    case 'single-form-flat':
      console.log('🎨 Rendering: Single flat form');
      renderSingleForm(normalizedSchema, analysis);
      break;
      
    case 'single-form-collapsible':
      console.log('🎨 Rendering: Single form with collapsible sections');
      renderSingleForm(normalizedSchema, analysis);
      break;
      
    default:
      console.log('🎨 Rendering: Default single form');
      renderSingleForm(normalizedSchema, analysis);
  }
  
  // Step 6: Attach event listeners
  setTimeout(() => attachEventListeners(), 100);
}

/**
 * Renders polymorphic forms (oneOf/anyOf at root)
 * Generic for any schema with type selection
 * Enhanced: Renders polymorphic forms with better initial state
 */
function renderPolymorphicForm(schema, analysis) {
  const tabsContainer = document.getElementById('tabs-container');
  const tabContentsContainer = document.getElementById('tab-contents');
  
  // Hide tabs, show single container
  document.getElementById('form-tabs').style.display = 'none';
  tabContentsContainer.innerHTML = '';
  
  const container = document.createElement('div');
  container.className = 'single-form-container';
  
  // Add title
  const title = document.createElement('h2');
  title.textContent = schema.title || 'Form';
  container.appendChild(title);
  
  // Add description if present
  if (schema.description) {
    const desc = document.createElement('p');
    desc.className = 'form-description';
    desc.textContent = schema.description;
    container.appendChild(desc);
  }
  
  // Create type selector
  const typeSelector = createPolymorphicTypeSelector(schema);
  container.appendChild(typeSelector);
  
  // Create dynamic content area
  const dynamicContent = document.createElement('div');
  dynamicContent.id = 'polymorphic-content';
  dynamicContent.className = 'polymorphic-content';
  container.appendChild(dynamicContent);
  
  tabContentsContainer.appendChild(container);
  tabsContainer.style.display = 'block';
  
  // Don't auto-render anything - let user select
  console.log('✅ Polymorphic form ready, awaiting user selection');
}

/**
 * Creates type selector for polymorphic schemas
 * Enhanced: Creates type selector for polymorphic schemas with better titles
 */
function createPolymorphicTypeSelector(schema) {
  const formGroup = document.createElement('div');
  formGroup.className = 'form-group';
  
  const label = document.createElement('label');
  label.className = 'required';
  label.textContent = 'Type';
  
  const select = document.createElement('select');
  select.id = 'polymorphic-type-selector';
  select.className = 'polymorphic-type-selector';
  
  const options = schema.oneOf || schema.anyOf || [];
  const keyword = schema.oneOf ? 'oneOf' : 'anyOf';
  
  // Add default option
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '-- Select Type --';
  select.appendChild(defaultOpt);
  
  options.forEach((option, index) => {
    const opt = document.createElement('option');
    opt.value = index;
    
    // Try to get a meaningful title
    let title = option.title;
    
    // If no title, try to resolve $ref and get its title
    if (!title && option.$ref) {
      const resolved = resolveRef(option.$ref, schema);
      if (resolved) {
        title = resolved.title;
      }
      
      // If still no title, extract from $ref path
      if (!title) {
        title = option.$ref.split('/').pop();
      }
    }
    
    opt.textContent = title || `Option ${index + 1}`;
    select.appendChild(opt);
  });
  
  select.addEventListener('change', (e) => {
    const selectedIndex = parseInt(e.target.value);
    const contentArea = document.getElementById('polymorphic-content');
    contentArea.innerHTML = '';
    
    if (selectedIndex >= 0 && selectedIndex < options.length) {
      const selectedOption = options[selectedIndex];
      renderPolymorphicOption(selectedOption, contentArea, [], 0);
    }
  });
  
  formGroup.appendChild(label);
  formGroup.appendChild(select);
  
  return formGroup;
}

/**
 * Enhanced: Renders selected polymorphic option with support for nested oneOf/anyOf
 * 
 * @param {Object} optionSchema - The selected schema option
 * @param {HTMLElement} container - Container to render into
 * @param {Array} path - Current path in data structure
 * @param {number} level - Nesting level (for recursive rendering)
 */
function renderPolymorphicOption(optionSchema, container, path, level = 0) {
  // Resolve reference if needed
  if (optionSchema.$ref) {
    optionSchema = resolveRef(optionSchema.$ref, state.currentSchema);
  }
  
  if (!optionSchema) {
    console.error('Could not resolve schema reference');
    return;
  }
  
  console.log(`🎨 Rendering polymorphic option at level ${level}:`, {
    hasProperties: !!optionSchema.properties,
    hasOneOf: !!optionSchema.oneOf,
    hasAnyOf: !!optionSchema.anyOf,
    type: optionSchema.type,
    title: optionSchema.title
  });
  
  // Case 1: Nested polymorphic structure (oneOf/anyOf within the option)
  if (optionSchema.oneOf || optionSchema.anyOf) {
    console.log('📍 Nested polymorphic structure detected, creating sub-selector');
    renderNestedPolymorphic(optionSchema, container, path, level);
    return;
  }
  
  // Case 2: Standard object with properties
  if (optionSchema.properties) {
    console.log('📍 Rendering properties for option');
    for (const [key, prop] of Object.entries(optionSchema.properties)) {
      const isRequired = optionSchema.required?.includes(key) || false;
      const fieldHtml = createField(key, prop, isRequired, [...path, key]);
      const div = document.createElement('div');
      div.innerHTML = fieldHtml;
      container.appendChild(div.firstElementChild);
    }
    return;
  }
  
  // Case 3: Simple type (string, number, etc.)
  if (optionSchema.type && optionSchema.type !== 'object') {
    console.log('📍 Simple type option');
    const fieldHtml = createField('value', optionSchema, false, [...path, 'value']);
    const div = document.createElement('div');
    div.innerHTML = fieldHtml;
    container.appendChild(div.firstElementChild);
    return;
  }
  
  console.warn('⚠️  Unknown schema structure:', optionSchema);
}


/**
 * NEW: Handles nested polymorphic structures (oneOf/anyOf within oneOf/anyOf)
 * This is specifically for groupRule pattern in rule_data_schema.json
 * 
 * @param {Object} schema - Schema with nested oneOf/anyOf
 * @param {HTMLElement} container - Container to render into
 * @param {Array} path - Current path in data structure
 * @param {number} level - Nesting level
 */
function renderNestedPolymorphic(schema, container, path, level) {
  const options = schema.oneOf || schema.anyOf || [];
  const keyword = schema.oneOf ? 'oneOf' : 'anyOf';
  
  if (options.length === 0) {
    console.warn('⚠️  No options in nested polymorphic structure');
    return;
  }
  
  // Create a form group for the nested selector
  const formGroup = document.createElement('div');
  formGroup.className = 'form-group nested-polymorphic-group';
  formGroup.style.marginLeft = `${level * 20}px`; // Indent based on nesting level
  
  // Add label
  const label = document.createElement('label');
  label.className = 'required';
  label.textContent = schema.title || 'Select Type';
  formGroup.appendChild(label);
  
  // Create selector dropdown
  const select = document.createElement('select');
  select.className = 'nested-polymorphic-selector';
  select.id = `nested-polymorphic-${level}-${path.join('_')}`;
  select.dataset.level = level;
  select.dataset.path = path.join('.');
  
  // Add default option
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '-- Select --';
  select.appendChild(defaultOpt);
  
  // Add options from oneOf/anyOf
  options.forEach((option, index) => {
    const opt = document.createElement('option');
    opt.value = index;
    
    // Get title from option or from its properties
    let optionTitle = option.title;
    if (!optionTitle && option.properties) {
      // Use the property key as title (e.g., "ALL_OF", "ANY_OF")
      const propKeys = Object.keys(option.properties);
      if (propKeys.length > 0) {
        optionTitle = propKeys[0];
      }
    }
    if (!optionTitle && option.$ref) {
      // Extract title from $ref
      optionTitle = option.$ref.split('/').pop();
    }
    
    opt.textContent = optionTitle || `Option ${index + 1}`;
    select.appendChild(opt);
  });
  
  formGroup.appendChild(select);
  
  // Create dynamic content area for selected option
  const dynamicContent = document.createElement('div');
  dynamicContent.id = `nested-content-${level}-${path.join('_')}`;
  dynamicContent.className = 'nested-polymorphic-content';
  dynamicContent.style.marginTop = '15px';
  formGroup.appendChild(dynamicContent);
  
  container.appendChild(formGroup);
  
  // Add change event listener
  select.addEventListener('change', (e) => {
    const selectedIndex = parseInt(e.target.value);
    dynamicContent.innerHTML = '';
    
    if (selectedIndex >= 0 && selectedIndex < options.length) {
      const selectedOption = options[selectedIndex];
      
      // Resolve reference if needed
      let resolvedOption = selectedOption;
      if (selectedOption.$ref) {
        resolvedOption = resolveRef(selectedOption.$ref, state.currentSchema);
      }
      
      console.log(`🔄 Nested option selected at level ${level}:`, {
        index: selectedIndex,
        title: resolvedOption.title,
        hasProperties: !!resolvedOption.properties
      });
      
      // Render the selected option (could be recursive!)
      renderPolymorphicOption(resolvedOption, dynamicContent, path, level + 1);
    }
  });
  
  // Auto-select first option if there's only one
  if (options.length === 1) {
    select.value = '0';
    select.dispatchEvent(new Event('change'));
  }
}


/**
 * Renders recursive schemas (like rule_data_schema.json)
 * Handles self-referencing structures generically
 */
function renderRecursiveForm(schema, analysis) {
  // Use polymorphic renderer if root has oneOf/anyOf
  if (schema.oneOf || schema.anyOf) {
    renderPolymorphicForm(schema, analysis);
  } else {
    // Treat as single form with special array handling
    renderSingleForm(schema, analysis);
  }
}

/**
 * Renders single-container forms (no tabs)
 * Generic for flat or lightly nested schemas
 */
function renderSingleForm(schema, analysis) {
  const tabsContainer = document.getElementById('tabs-container');
  const tabContentsContainer = document.getElementById('tab-contents');
  
  // Hide tabs
  document.getElementById('form-tabs').style.display = 'none';
  tabContentsContainer.innerHTML = '';
  
  const container = document.createElement('div');
  container.className = 'single-form-container';
  
  // Add title
  const title = document.createElement('h2');
  title.textContent = schema.title || 'Form';
  container.appendChild(title);
  
  // Render all properties
  const properties = schema.properties || {};
  const required = schema.required || [];
  
  for (const [key, prop] of Object.entries(properties)) {
    const isRequired = required.includes(key);
    const fieldHtml = createField(key, prop, isRequired, [key]);
    const div = document.createElement('div');
    div.innerHTML = fieldHtml;
    container.appendChild(div.firstElementChild);
  }
  
  tabContentsContainer.appendChild(container);
  tabsContainer.style.display = 'block';
}

/**
 * Existing multi-section renderer (keep as is)
 * Used for complex nested schemas like test-schema.json
 */
function renderMultiSectionForm(schema, analysis) {
  // Existing implementation from current code
  const properties = schema.properties || {};
  const required = schema.required || [];
  
  createTabs(properties);
  
  for (const [key, prop] of Object.entries(properties)) {
    const isRequired = required.includes(key);
    const tabContent = createTabContent(key, prop, isRequired, [key]);
    updateState({
      tabContents: {
        ...state.tabContents,
        [key]: tabContent
      }
    });

  }
  
  document.getElementById('tabs-container').style.display = 'block';
  
  if (Object.keys(properties).length > 0) {
    const firstTab = Object.keys(properties)[0];
    switchTab(firstTab);
  }
}

function createTabs(properties) {
  const tabsContainer = document.getElementById('form-tabs');
  const tabContentsContainer = document.getElementById('tab-contents');
  
  tabsContainer.innerHTML = '';
  tabContentsContainer.innerHTML = '';
  
  updateState({
    tabContents: {}
  });
  
  Object.keys(properties).forEach((key) => {
    const prop = properties[key];
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

function createTabContent(key, prop, isRequired, path) {
  return createField(key, prop, isRequired, path);
}

function switchTab(tabKey) {
  if (state.currentTab) {
    const prevTabButton = document.getElementById(`tab-${state.currentTab}`);
    const prevTabContent = document.getElementById(`content-${state.currentTab}`);
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
      div.innerHTML = state.tabContents[tabKey];
      newTabContent.appendChild(div.firstElementChild);
      
      setTimeout(() => attachEventListeners(), 100);
    }

    updateState({
      currentTab: tabKey
    });
  }
}

function renderAllTabs() {
  console.log('Rendering all tabs for data loading...');
  
  // Get all tab keys
  const tabKeys = Object.keys(state.tabContents);
  
  // Render each tab's content if not already rendered
  tabKeys.forEach(tabKey => {
    const tabContent = document.getElementById(`content-${tabKey}`);
    
    if (tabContent && tabContent.children.length <= 1) {
      // Tab content hasn't been rendered yet
      const div = document.createElement('div');
      div.innerHTML = state.tabContents[tabKey];
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
    prop = resolveRef(prop.$ref, state.currentSchema);
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

  const choiceConfig = state.customOptions[key] || state.customOptions[pathStr];
  
  let inputHtml = '';
  let isDependent = false;
  let depField = null;

  if (choiceConfig && typeof choiceConfig === 'object' && !Array.isArray(choiceConfig)) {
    isDependent = !!choiceConfig.dependent_values;
    if (isDependent) {
      depField = Object.keys(choiceConfig.dependent_values)[0];
    }
    inputHtml = createInputControl(key, prop, pathStr, choiceConfig, isRequired, isDependent, depField);
    
  } else if (Array.isArray(choiceConfig)) {
    const legacyConfig = {
      values: choiceConfig,
      input_control: 'drop-down',
      response_type: type === 'array' ? 'multi-select' : 'single-select'
    };
    inputHtml = createInputControl(key, prop, pathStr, legacyConfig, isRequired, false, null);
    
  } else if (prop.enum && prop.enum.length > 0) {
    const enumConfig = {
      values: prop.enum,
      input_control: 'drop-down',
      response_type: type === 'array' ? 'multi-select' : 'single-select'
    };
    inputHtml = createInputControl(key, prop, pathStr, enumConfig, isRequired, false, null);
    
  } else {
    inputHtml = createDefaultInput(pathStr, prop, isRequired);
  }

  return `
    <div class="form-group" data-field-path="${pathStr}">
      <label class="${isRequired ? 'required' : ''}">${title}</label>
      ${description ? `<div class="description">${description}</div>` : ''}
      ${inputHtml}
    </div>`;
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

/**
 * Enhanced: Creates array field with support for recursive references
 * 
 * @param {string} key - Field key
 * @param {Object} prop - Property schema
 * @param {boolean} isRequired - Whether field is required
 * @param {Array} path - Path in data structure
 * @returns {string} HTML string for array field
 */
function createArrayOfObjects(key, prop, isRequired, path) {
  const title = prop.title || key;
  const description = prop.description || '';
  const pathStr = path.join('.');
  
  // Check if array items are recursive (self-referencing)
  const itemSchema = prop.items;
  const isRecursive = itemSchema?.$ref && 
                     (itemSchema.$ref === '#' || itemSchema.$ref.startsWith('#/'));
  
  // FIXED: Always apply proper escaping for HTML attributes
  let itemSchemaData;
  if (isRecursive) {
    // For recursive refs, store a marker
    const markerObj = { __recursive: true, ref: itemSchema.$ref };
    itemSchemaData = JSON.stringify(markerObj).replace(/"/g, '&quot;');
  } else {
    // For non-recursive, store the actual schema
    itemSchemaData = JSON.stringify(itemSchema).replace(/"/g, '&quot;');
  }
  
  console.log('🔧 Creating array field:', {
    path: pathStr,
    isRecursive,
    ref: itemSchema?.$ref,
    escapedData: itemSchemaData.substring(0, 100) // Log first 100 chars
  });
  
  return `
    <div class="form-group" data-field-path="${pathStr}">
      <label class="${isRequired ? 'required' : ''}">${title}</label>
      ${description ? `<div class="description">${description}</div>` : ''}
      <div class="array-container ${isRecursive ? 'recursive-array' : ''}" 
           id="array_${pathStr.replace(/\./g, '_')}" 
           data-path="${pathStr}"
           ${isRecursive ? `data-recursive="true" data-ref="${itemSchema.$ref}"` : ''}
           data-item-schema="${itemSchemaData}">
        <div class="array-controls">
          <button type="button" class="add-array-item-btn" onclick="addArrayItem('${pathStr}')">Add Item</button>
        </div>
      </div>
    </div>
  `;
}


/**
 * NEW: Resolves recursive references safely
 * For "#" reference, returns the top-level polymorphic options
 * 
 * @param {string} ref - Reference string (e.g., "#")
 * @param {string} arrayPath - Current array path for context
 * @returns {Object} Resolved schema (safe for rendering)
 */
function resolveRecursiveReference(ref, arrayPath) {
  console.log('🔄 Resolving recursive reference:', ref, 'for path:', arrayPath);
  
  if (ref === '#') {
    // Reference to root schema
    console.log('📍 Root reference detected');
    
    // For rule_data_schema, root has oneOf with atomicRule and groupRule
    if (state.currentSchema.oneOf || state.currentSchema.anyOf) {
      console.log('✅ Root has polymorphic structure (oneOf/anyOf)');
      return {
        __polymorphic: true,
        oneOf: state.currentSchema.oneOf,
        anyOf: state.currentSchema.anyOf,
        title: 'Rule',
        type: 'object'
      };
    }
    
    // Fallback: return root properties if available
    if (state.currentSchema.properties) {
      console.log('✅ Using root properties as schema');
      return {
        type: 'object',
        properties: state.currentSchema.properties,
        required: state.currentSchema.required || []
      };
    }
    
    console.warn('⚠️  Root schema has neither oneOf/anyOf nor properties');
    return null;
  }
  
  // For other references, try normal resolution
  console.log('🔗 Attempting normal $ref resolution for:', ref);
  const resolved = resolveRef(ref, state.currentSchema);
  
  if (!resolved) {
    console.error('❌ Could not resolve reference:', ref);
    return null;
  }
  
  console.log('✅ Resolved reference:', resolved);
  return resolved;
}


/**
 * NEW: Creates complex array item (object, polymorphic, nested)
 * 
 * @param {string} arrayPath - Path to array
 * @param {Object} itemSchema - Schema for array item
 * @param {number} index - Item index
 * @param {HTMLElement} container - Array container element
 */
function createComplexArrayItem(arrayPath, itemSchema, index, container) {
  console.log('🎨 Creating complex array item:', { arrayPath, index });
  
  const itemDiv = document.createElement('div');
  itemDiv.className = 'array-item';
  itemDiv.dataset.index = index;
  itemDiv.dataset.arrayPath = arrayPath;
  
  // Create header with remove button
  const headerDiv = document.createElement('div');
  headerDiv.className = 'array-item-header';
  headerDiv.innerHTML = `
    <span class="array-item-title">Item ${index + 1}</span>
    <button type="button" class="remove-item-btn" onclick="removeArrayItem(this)">Remove</button>
  `;
  itemDiv.appendChild(headerDiv);
  
  // Create content area
  const contentDiv = document.createElement('div');
  contentDiv.className = 'array-item-content';
  contentDiv.id = `array-item-content-${arrayPath.replace(/\./g, '_')}-${index}`;
  
  // Handle different schema types
  if (itemSchema.__polymorphic || itemSchema.oneOf || itemSchema.anyOf) {
    // Polymorphic item - create type selector
    console.log('🎨 Creating polymorphic array item');
    renderPolymorphicArrayItem(itemSchema, contentDiv, arrayPath, index);
  } else if (itemSchema.properties) {
    // Object with properties
    console.log('🎨 Creating object array item with properties:', Object.keys(itemSchema.properties));
    const properties = itemSchema.properties || {};
    const required = itemSchema.required || [];
    
    for (const [subKey, subProp] of Object.entries(properties)) {
      const isSubRequired = required.includes(subKey);
      const fieldPath = [arrayPath, index, subKey];
      const fieldHtml = createField(subKey, subProp, isSubRequired, fieldPath);
      const div = document.createElement('div');
      div.innerHTML = fieldHtml;
      contentDiv.appendChild(div.firstElementChild);
    }
  } else {
    console.warn('⚠️  Unknown complex item schema:', itemSchema);
    contentDiv.innerHTML = '<p style="color: orange;">⚠️ Unknown schema structure</p>';
  }
  
  itemDiv.appendChild(contentDiv);
  
  // Insert before controls
  const controls = container.querySelector('.array-controls');
  if (controls) {
    container.insertBefore(itemDiv, controls);
    console.log('✅ Array item inserted before controls');
  } else {
    container.appendChild(itemDiv);
    console.log('⚠️  No controls found, appended to container');
  }
}


// ==================== GLOBAL WINDOW FUNCTIONS ====================

window.toggleNested = function(header) {
  header.classList.toggle('collapsed');
  header.nextElementSibling.nextElementSibling.classList.toggle('collapsed');
};


/**
 * Enhanced: Adds item to array with recursive reference support
 * Now reads schema from data attribute instead of parameter
 * 
 * @param {string} arrayPath - Path to the array field
 */
window.addArrayItem = function(arrayPath) {
  console.log('➕ Adding array item to:', arrayPath);
  
  // FIXED: Handle path with dots - need to escape for ID selector
  const escapedPath = arrayPath.replace(/\./g, '_');
  const container = document.getElementById('array_' + escapedPath);
  
  if (!container) {
    console.error('❌ Array container not found. Tried:', 'array_' + escapedPath);
    console.log('Available containers:', 
      Array.from(document.querySelectorAll('.array-container')).map(el => el.id)
    );
    return;
  }
  
  console.log('✅ Found container:', container.id);
  console.log('📦 Container datasets:', container.dataset);
  
  // Get item schema from data attribute
  const itemSchemaData = container.dataset.itemSchema;
  if (!itemSchemaData) {
    console.error('❌ No item schema found in dataset');
    console.log('Available dataset keys:', Object.keys(container.dataset));
    return;
  }
  
  console.log('📄 Raw schema data (first 200 chars):', itemSchemaData.substring(0, 200));
  
  // FIXED: Properly unescape HTML entities before parsing
  let itemSchema;
  try {
    // Convert HTML entities back to quotes
    const unescaped = itemSchemaData.replace(/&quot;/g, '"')
                                    .replace(/&apos;/g, "'")
                                    .replace(/&lt;/g, '<')
                                    .replace(/&gt;/g, '>')
                                    .replace(/&amp;/g, '&');
    
    console.log('📄 Unescaped data:', unescaped.substring(0, 200));
    
    itemSchema = JSON.parse(unescaped);
    console.log('✅ Parsed item schema:', itemSchema);
  } catch (e) {
    console.error('❌ Failed to parse item schema:', e);
    console.error('Raw data:', itemSchemaData);
    console.error('Attempted to parse:', itemSchemaData.replace(/&quot;/g, '"'));
    alert('Error: Unable to parse array item schema. Check console for details.');
    return;
  }
  
  // Check if this is a recursive reference
  if (itemSchema.__recursive) {
    console.log('🔄 Handling recursive reference:', itemSchema.ref);
    itemSchema = resolveRecursiveReference(itemSchema.ref, arrayPath);
    
    if (!itemSchema) {
      console.error('❌ Failed to resolve recursive reference:', itemSchema.ref);
      return;
    }
    console.log('✅ Resolved recursive schema:', itemSchema);
  }
  
  // Handle $ref if present (non-recursive case)
  if (itemSchema.$ref && !itemSchema.__recursive) {
    console.log('🔗 Resolving $ref:', itemSchema.$ref);
    const resolved = resolveRef(itemSchema.$ref, state.currentSchema);
    if (resolved) {
      itemSchema = resolved;
      console.log('✅ Resolved $ref:', itemSchema);
    } else {
      console.error('❌ Could not resolve $ref:', itemSchema.$ref);
      return;
    }
  }
  
  const items = container.querySelectorAll('.array-item');
  const index = items.length;
  
  console.log('📦 Creating array item at index:', index);
  console.log('📋 Item schema type:', itemSchema.type, 'Has oneOf:', !!itemSchema.oneOf);
  
  // Determine if this is a simple type or complex object
  if (itemSchema.type === 'object' || itemSchema.properties || itemSchema.oneOf || 
      itemSchema.anyOf || itemSchema.__polymorphic) {
    createComplexArrayItem(arrayPath, itemSchema, index, container);
  } else {
    createSimpleArrayItem(arrayPath, itemSchema, index, container);
  }
  
  console.log('✅ Array item created successfully');
  
  // Reattach event listeners
  setTimeout(() => attachEventListeners(), 100);
};



/**
 * NEW: Creates simple array item (string, number, etc.)
 * 
 * @param {string} arrayPath - Path to array
 * @param {Object} itemSchema - Schema for array item
 * @param {number} index - Item index
 * @param {HTMLElement} container - Array container element
 */
function createSimpleArrayItem(arrayPath, itemSchema, index, container) {
  const itemDiv = document.createElement('div');
  itemDiv.className = 'array-item array-item-simple';
  itemDiv.dataset.index = index;
  
  const itemPath = `${arrayPath}.${index}`;
  const inputType = getInputTypeFromSchema(itemSchema);
  
  itemDiv.innerHTML = `
    <div class="array-item-simple-content">
      <input type="${inputType}" 
             name="${itemPath}" 
             data-path="${itemPath}"
             placeholder="Item ${index + 1}"
             class="array-item-input">
      <button type="button" class="remove-item-btn" onclick="removeArrayItem(this)">×</button>
    </div>
  `;
  
  // Insert before controls
  const controls = container.querySelector('.array-controls');
  container.insertBefore(itemDiv, controls);
}

/**
 * NEW: Renders polymorphic item in array (with type selector)
 * 
 * @param {Object} schema - Schema with oneOf/anyOf
 * @param {HTMLElement} container - Container to render into
 * @param {string} arrayPath - Path to array
 * @param {number} index - Item index
 */
function renderPolymorphicArrayItem(schema, container, arrayPath, index) {
  console.log('🎨 Rendering polymorphic array item:', { arrayPath, index });
  
  const options = schema.oneOf || schema.anyOf || [];
  
  if (options.length === 0) {
    console.error('❌ No options in polymorphic array item');
    container.innerHTML = '<p style="color: red;">❌ No type options available</p>';
    return;
  }
  
  console.log('📋 Available options:', options.length);
  
  // Create type selector
  const selectorGroup = document.createElement('div');
  selectorGroup.className = 'form-group';
  
  const label = document.createElement('label');
  label.className = 'required';
  label.textContent = 'Type';
  selectorGroup.appendChild(label);
  
  const select = document.createElement('select');
  select.className = 'array-item-type-selector';
  const selectId = `array-type-${arrayPath.replace(/\./g, '_')}-${index}`;
  select.id = selectId;
  select.dataset.arrayPath = arrayPath;
  select.dataset.index = index;
  
  console.log('📋 Creating selector with ID:', selectId);
  
  // Default option
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '-- Select Type --';
  select.appendChild(defaultOpt);
  
  // Add options
  options.forEach((option, optIndex) => {
    const opt = document.createElement('option');
    opt.value = optIndex;
    
    // Get title
    let title = option.title;
    if (!title && option.$ref) {
      const resolved = resolveRef(option.$ref, statecurrentSchema);
      title = resolved?.title || option.$ref.split('/').pop();
    }
    
    opt.textContent = title || `Option ${optIndex + 1}`;
    console.log(`  Option ${optIndex}: ${opt.textContent}`);
    select.appendChild(opt);
  });
  
  selectorGroup.appendChild(select);
  container.appendChild(selectorGroup);
  
  // Create dynamic content area
  const dynamicContent = document.createElement('div');
  dynamicContent.className = 'array-item-dynamic-content';
  dynamicContent.id = `array-item-dynamic-${arrayPath.replace(/\./g, '_')}-${index}`;
  container.appendChild(dynamicContent);
  
  console.log('✅ Polymorphic selector created, attaching change handler');
  
  // Add change handler
  select.addEventListener('change', (e) => {
    const selectedIndex = parseInt(e.target.value);
    console.log('🔄 Array item type changed to index:', selectedIndex);
    
    dynamicContent.innerHTML = '';
    
    if (selectedIndex >= 0 && selectedIndex < options.length) {
      let selectedOption = options[selectedIndex];
      
      console.log('📋 Selected option:', selectedOption);
      
      // Resolve reference
      if (selectedOption.$ref) {
        console.log('🔗 Resolving $ref:', selectedOption.$ref);
        selectedOption = resolveRef(selectedOption.$ref, state.currentSchema);
        console.log('✅ Resolved to:', selectedOption);
      }
      
      if (!selectedOption) {
        console.error('❌ Failed to resolve option');
        dynamicContent.innerHTML = '<p style="color: red;">❌ Failed to load option</p>';
        return;
      }
      
      console.log('🎨 Rendering selected option:', selectedOption.title || 'Untitled');
      
      // Render the option
      const itemPath = [arrayPath, index];
      renderPolymorphicOption(selectedOption, dynamicContent, itemPath, 0);
      
      console.log('✅ Option rendered successfully');
    }
  });
  
  console.log('✅ Polymorphic array item setup complete');
}


/**
 * Helper: Gets input type from schema
 */
function getInputTypeFromSchema(schema) {
  if (schema.type === 'number' || schema.type === 'integer') {
    return 'number';
  }
  if (schema.type === 'boolean') {
    return 'checkbox';
  }
  if (schema.format === 'date') {
    return 'date';
  }
  if (schema.format === 'email') {
    return 'email';
  }
  return 'text';
}


/**
 * Enhanced: Remove array item (already exists but ensure it updates indices)
 */
window.removeArrayItem = function(btn) {
  console.log('🗑️  Removing array item');
  
  const item = btn.closest('.array-item');
  if (!item) {
    console.error('❌ Could not find array item to remove');
    return;
  }
  
  const container = item.closest('.array-container');
  const arrayPath = container?.dataset.path;
  
  console.log('🗑️  Removing item from:', arrayPath);
  
  item.remove();
  
  // Update remaining item numbers and paths
  const items = container.querySelectorAll('.array-item');
  console.log(`📊 Remaining items: ${items.length}`);
  
  items.forEach((item, idx) => {
    item.dataset.index = idx;
    const title = item.querySelector('.array-item-title');
    if (title) {
      title.textContent = `Item ${idx + 1}`;
    }
    
    // Update data-path attributes for simple items
    const input = item.querySelector('.array-item-input');
    if (input && arrayPath) {
      const newPath = `${arrayPath}.${idx}`;
      input.dataset.path = newPath;
      input.name = newPath;
    }
  });
  
  console.log('✅ Array item removed and indices updated');
};

window.handleMultiSelectChange = function(event, path, dropdownId) {
  const changedCheckbox = event.target;
  const isChecked = changedCheckbox.checked;
  const changedValue = changedCheckbox.value;
  
  // Updated: Use dynamic exclusive options from map
  const exclusiveOptions = state.exclusiveOptionsMap[path] || [];
  
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
  if (!state.conditionalRules || Object.keys(state.conditionalRules).length === 0) {
    return;
  }

  console.log('Applying conditional rules...');

  for (const [triggerField, conditions] of Object.entries(state.conditionalRules)) {
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
  // Select dropdown
  let input = document.querySelector(`select[data-path="${fieldPath}"]`);
  if (input) return input.value;
  
  // Text/email
  input = document.querySelector(`input[type="text"][data-path="${fieldPath}"], input[type="email"][data-path="${fieldPath}"]`);
  if (input) return input.value;
  
  // Number/slider
  input = document.querySelector(`input[type="number"][data-path="${fieldPath}"], input[type="range"][data-path="${fieldPath}"]`);
  if (input) return input.value ? Number(input.value) : null;
  
  // Date/datetime/time
  input = document.querySelector(`input[type="date"][data-path="${fieldPath}"], input[type="datetime-local"][data-path="${fieldPath}"], input[type="time"][data-path="${fieldPath}"]`);
  if (input) return input.value;
  
  // Radio buttons (NEW)
  input = document.querySelector(`input[type="radio"][data-path="${fieldPath}"]:checked`);
  if (input) return input.value;
  
  // Boolean checkbox
  input = document.querySelector(`input[type="checkbox"][data-path="${fieldPath}"]:not(.multi-select-checkbox):not(.na-checkbox):not(.checkbox-input):not(.na-checkbox-input)`);
  if (input) return input.checked;
  
  // Checkbox list (NEW)
  const checkboxInputs = document.querySelectorAll(`[data-path="${fieldPath}"].checkbox-input:checked`);
  if (checkboxInputs.length > 0) {
    return Array.from(checkboxInputs).map(cb => cb.value);
  }
  
  // Checkbox N/A (NEW)
  const checkboxNA = document.getElementById(fieldPath + '_cb_na');
  if (checkboxNA && checkboxNA.checked) {
    return checkboxNA.value;
  }
  
  // Multi-select dropdown N/A
  const naCheckbox = document.getElementById(fieldPath + '_na');
  if (naCheckbox && naCheckbox.checked) {
    return naCheckbox.value;
  }
  
  // Multi-select dropdown
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

        updateState({
          formData: collectFormData()
        });
        setTimeout(() => applyConditionalRules(), 100);
        
        // New: Handle dependency updates on change
        const changedPath = e.target.dataset.path;
        if (changedPath && state.triggersToAffected[changedPath]) {
          const newValue = getFieldValue(changedPath);
          state.triggersToAffected[changedPath].forEach(rule => {
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
  
  // ===== NEW: Check for checkbox container =====
  const checkboxContainer = document.getElementById(`checkbox_${escapedPath}`);
  if (checkboxContainer) {
    console.log(`Populating checkbox list for ${pathStr}`);
    populateCheckboxList(pathStr, value);
    return;
  }
  
  // ===== NEW: Check for radio container =====
  const radioContainer = document.getElementById(`radio_${escapedPath}`);
  if (radioContainer) {
    console.log(`Populating radio buttons for ${pathStr}`);
    populateRadioButton(pathStr, value);
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
  
  // ===== NEW: Try slider =====
  input = document.querySelector(`input[type="range"][data-path="${pathStr}"]`);
  if (input) {
    populateSlider(pathStr, value);
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
  input = document.querySelector(`input[type="checkbox"][data-path="${pathStr}"]:not(.multi-select-checkbox):not(.na-checkbox):not(.checkbox-input):not(.na-checkbox-input)`);
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
  let currentProp = state.currentSchema.properties;
  
  for (let i = 0; i < keys.length; i++) {
    if (currentProp[keys[i]]) {
      if (currentProp[keys[i]].$ref) {
        currentProp = resolveRef(currentProp[keys[i]].$ref, state.currentSchema);
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
