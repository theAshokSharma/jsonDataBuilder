// file-operations.js - File loading and saving operations

// Import necessary modules
import { state, updateState } from './state.js';
import { validateOptionsAgainstSchema, showValidationErrorsDialog } from './file-validation.js';
import { ashAlert, ashConfirm} from './utils.js'
import { renderForm, renderAllTabs } from './form-renderer.js';
import { revalidateAndSetInvalid } from './conditional-rules.js'
import { populateFormWithData } from './form-population.js'

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
        state.dataTooltip.innerText = state.dataFilename + ' loaded.'

        console.log('✓ Data loaded successfully');
      }, 100);
    } catch (error) {
      ashAlert('Invalid JSON data file: ' + error.message);
      console.error('Data load error:', error);
    }
  };

  input.click();
}

function showConfigModal() {
  const configModal = document.getElementById('config-modal');
  configModal.style.display = 'flex';
  const currentSchemafile = state.selectedSchemaFile;
  const currentOptionsFile = state.selectedOptionsFile;

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
  
  if (currentSchemafile){
    schemaFileName.textContent = `📋 ${currentSchemafile.name}`;
  }
  if (currentOptionsFile){
    optionsFileName.textContent = `⚙️ ${currentOptionsFile.name}`;
  }

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
    state.dataTooltip.innerText = 'Load data file in JSON format.';
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
              triggersToAffected: {},
              pendingDependentInits: {},
              exclusiveOptionsMap: {}
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

export {
  loadSchemaFromFile,
  loadOptionsFromFile,
  loadDataFromFile,
  showConfigModal,
  updateValidationStatus
};

// ==== END OF FILE ====/