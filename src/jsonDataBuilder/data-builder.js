// data-builder.js - JSON data builder
import { state, updateState } from './state.js';
import { showConfigModal, loadDataFromFile, resolveReferences } from './file-operations.js';
import { saveJsonWithDialog, exportJsonToClipboard, addTooltip, ashAlert, ashConfirm } from './utils.js';
import { renderForm, renderAllTabs, updateFileStatusDisplay } from './form-renderer.js';
import { updateMultiSelectDisplay} from './input-control.js'
import { validateAndShowSummary, clearAllValidationErrors } from './input-validation.js';
import { getLastSchemaFile, getLastOptionsFile, createFileFromData } from './storage-manager.js';

// Initialize on page load
console.log('JSON Data Builder Loaded - Version 3.0`');


// Button event listeners
const configBtn = document.getElementById('configBtn');
configBtn.addEventListener('click', showConfigModal);
state.configTooltip = addTooltip(configBtn, 'Configure the data builder.');

const loadDataBtn = document.getElementById('loadDataBtn');
loadDataBtn.addEventListener('click', loadDataFromFile);
state.dataTooltip = addTooltip(loadDataBtn, 'Load data file in JSON format.');

const aboutBtn = document.getElementById('aboutBtn');
aboutBtn.addEventListener('click', showAboutModal);
addTooltip(aboutBtn, 'Learn more about this application.');

const viewBtn = document.getElementById('viewBtn');
viewBtn.addEventListener('click', showViewModal);
addTooltip(viewBtn, 'View current form data.');

const hamburgerBtn = document.getElementById('hamburgerBtn');
const headerNav = document.querySelector('.header-nav');


// UPDATED: Save button with validation
document.getElementById('saveBtn').addEventListener('click', async () => {
  try {
    renderAllTabs(); // Ensure all tabs are rendered before collecting data
    
    // Clear previous validation errors
    clearAllValidationErrors();
    
    // Collect data
    const data = collectFormData();
    
    // NEW: Validate against schema
    const isValid = await validateAndShowSummary(data, state.currentSchema);
    
    if (!isValid) {
      const confirmSave = await ashConfirm(
        '⚠️ Warning: Form contains validation errors.\n\n' +
        'Fields with errors are highlighted. Saving will export the form with these values.\n\n' +
        'Do you want to save anyway?'
      );
      
      if (!confirmSave) {
        return;
      }
    }
    
    // Check for invalid fields from data loading (separate from validation)
    const invalidFields = document.querySelectorAll('.invalid-data');
    if (invalidFields.length > 0) {
      const confirmSave = await ashConfirm(
        `⚠️ Warning: ${invalidFields.length} field(s) contain invalid values from loaded data.\n\n` +
        `These fields are highlighted. Saving will export with empty values for these fields.\n\n` +
        `Do you want to save anyway?`
      );
      
      if (!confirmSave) {
        invalidFields[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        invalidFields[0].focus();
        return;
      }
    }
    
    await saveJsonWithDialog(data, state.dataFilename, state.dataFilePath);
    console.log('✅ Data saved successfully');
    
  } catch (error) {
    console.error('Error saving data:', error);
    await ashAlert('Error saving data: ' + error.message);
  }
});

// UPDATED: Copy to Clipboard button with validation
document.getElementById('exportBtn').addEventListener('click', async () => {
  try {
    renderAllTabs(); // Ensure all tabs are rendered before collecting data
    
    // Clear previous validation errors
    clearAllValidationErrors();
    
    // Collect data
    const data = collectFormData();
    
    // NEW: Validate against schema
    const isValid = await validateAndShowSummary(data, state.currentSchema);
    
    if (!isValid) {
      const confirmExport = await ashConfirm(
        '⚠️ Warning: Form contains validation errors.\n\n' +
        'Fields with errors are highlighted. Exporting will copy the form with these values.\n\n' +
        'Do you want to export anyway?'
      );
      
      if (!confirmExport) {
        return;
      }
    }
    
    // Check for invalid fields from data loading (separate from validation)
    const invalidFields = document.querySelectorAll('.invalid-data');
    if (invalidFields.length > 0) {
      const confirmExport = await ashConfirm(
        `⚠️ Warning: ${invalidFields.length} field(s) contain invalid values from loaded data.\n\n` +
        `These fields are highlighted. Exporting will copy with empty values for these fields.\n\n` +
        `Do you want to export anyway?`
      );
      
      if (!confirmExport) {
        invalidFields[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        invalidFields[0].focus();
        return;
      }
    }
    
    exportJsonToClipboard(data);
    console.log('✅ Data exported successfully');
    
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

document.addEventListener('click', function(event) {
  if (!event.target.closest('.multi-select-container')) {
    document.querySelectorAll('.multi-select-dropdown').forEach(dd => {
      dd.classList.remove('open');
    });
  }
});

function collectFormData() {
  const data = {};
  const inputs = document.querySelectorAll('[data-path]');
  const processedPaths = new Set();
  
  inputs.forEach(input => {
    const path = input.dataset.path;
    if (!path || processedPaths.has(path)) return;
  
      // Handle checkbox lists that use checkbox_ container pattern
    if (input.classList && input.classList.contains('checkbox-input')) {
      if (!processedPaths.has(path)) {
        const checkboxes = document.querySelectorAll(`[data-path="${path}"].checkbox-input:checked`);
        const naCheckbox = document.querySelector(`[data-path="${path}"].na-checkbox-input:checked`);
        
        if (naCheckbox) {
          // If N/A is checked, use its value
          setNestedValue(data, path, naCheckbox.value);
        } else if (checkboxes.length > 0) {
          // Collect checked checkbox values
          setNestedValue(data, path, Array.from(checkboxes).map(cb => cb.value));
        } else {
          // No checkboxes checked
          setNestedValue(data, path, []);
        }
        processedPaths.add(path);
      }
    }
    else if (input.classList && input.classList.contains('na-checkbox')) {
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
    // ===== RADIO BUTTON HANDLING (NEW - WAS MISSING) =====
    else if (input.classList && input.classList.contains('radio-input')) {
      if (!processedPaths.has(path)) {
        const selectedRadio = document.querySelector(`[data-path="${path}"].radio-input:checked`);
        const naRadio = document.querySelector(`[data-path="${path}"].na-radio-input:checked`);
        
        if (naRadio) {
          // If N/A is checked, use its value
          setNestedValue(data, path, naRadio.value);
        } else if (selectedRadio) {
          // Use the selected radio button value
          setNestedValue(data, path, selectedRadio.value);
        } else {
          // No radio selected
          setNestedValue(data, path, null);
        }
        processedPaths.add(path);
      }
    }
    // ===== SLIDER/RANGE HANDLING (NEW - WAS MISSING) =====
    else if (input.type === 'range') {
      // Get the slider value
      const sliderValue = input.value ? Number(input.value) : null;
      setNestedValue(data, path, sliderValue);
      processedPaths.add(path);
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

// ==================== VIEW DATA MODAL =======================
function showViewModal() {
  try {
    renderAllTabs(); // Ensure all tabs are rendered before collecting data
    
    // Clear previous validation errors
    clearAllValidationErrors();
    
    // Collect data
    const data = collectFormData();
    
    // NEW: Validate against schema
    const isValid = validateAndShowSummary(data, state.currentSchema);
    
    if (!isValid) {
      const confirmView = ashConfirm(
        '⚠️ Warning: Form contains validation errors.\n\n' +
        'Fields with errors are highlighted. \n\n' +
        'Do you want to view it anyway?'
      );
      
      if (!confirmView) {
        return;
      }
    }
    
    // Check for invalid fields from data loading (separate from validation)
    const invalidFields = document.querySelectorAll('.invalid-data');
    if (invalidFields.length > 0) {
      const confirmView = ashConfirm(
        `⚠️ Warning: ${invalidFields.length} field(s) contain invalid values from loaded data.\n\n` +
        `These fields are highlighted. \n\n` +
        `Do you want to view anyway?`
      );
      
      if (!confirmView) {
        invalidFields[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        invalidFields[0].focus();
        return;
      }
    }
       // new process
    const viewModal = document.getElementById('view-modal');
    const viewContent = document.getElementById('view-data-content');    
      // Format the data as HTML with orange properties and blue values
    viewContent.innerHTML = formatDataAsHTML(data);
    viewModal.style.display = 'flex';

    // Close button handler
    document.getElementById('closeViewBtn').onclick = () => {
      viewModal.style.display = 'none';
    };

    // Close on outside click
    viewModal.onclick = (e) => {
      if (e.target === viewModal) {
        viewModal.style.display = 'none';
      }
    };
  } catch (error) {
    console.error('Error viewing data:', error);
    ashAlert('Error viewing data: ' + error.message);
  }
}

function formatDataAsHTML(data) {
  // Use JSON.stringify with 2-space indentation, just like exportJsonToClipboard
  const jsonString = JSON.stringify(data, null, 2);
  
  // Apply color coding: properties in orange, values in blue
  let coloredJson = jsonString.replace(
    /"([^"]+)":\s*("(?:[^"\\]|\\.)*"|[^,\n}\]]+)/g,
    (match, property, value) => {
      let coloredProperty = `<span style="color:#fa8136;font-weight: 600;">"${property}"</span>`;
      const coloredValue = `<span style="color:#51acf6;font-weight: 500;">${value}</span>`;
      return `${coloredProperty}: ${coloredValue}`;
    }
  );

    // Color curly braces 51acf6
  coloredJson = coloredJson.replace(/{/g, '<span style="color:#51acf6;font-weight: 500;">{</span>');
  coloredJson = coloredJson.replace(/}/g, '<span style="color:#51acf6;font-weight: 500;">}</span>');

  // Color square brackets blue
  coloredJson = coloredJson.replace(/\[/g, '<span style="color:#2196F3;font-weight: 500;">[</span>');
  coloredJson = coloredJson.replace(/]/g, '<span style="color:#2196F3;font-weight: 500;">]</span>');

  // Preserve formatting by replacing spaces and newlines
  return coloredJson;
    // .replace(/ /g, '&nbsp;')
    // .replace(/\n/g, '<br>');
}

// NEW: Auto-load last used files on startup
window.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Checking for last used files...');
  
  const lastSchema = getLastSchemaFile();
  const lastOptions = getLastOptionsFile();
  
  if (lastSchema) {
    console.log('📂 Auto-loading last schema:', lastSchema.filename);
    
    try {
      // Create virtual file objects
      const schemaFile = createFileFromData(lastSchema.filename, lastSchema.data);
      updateState({ 
        selectedSchemaFile: schemaFile,
        currentSchema: lastSchema.data,
        definitions: lastSchema.data.definitions || lastSchema.data.$defs || {}
      });
      
      // Load options if available
      if (lastOptions) {
        console.log('📂 Auto-loading last options:', lastOptions.filename);
        const optionsFile = createFileFromData(lastOptions.filename, lastOptions.data);
        updateState({ selectedOptionsFile: optionsFile });
        
        const resolvedOptions = resolveReferences(lastOptions.data, lastOptions.data);
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
                na: config.na
              });
            }
          }
        });
      }
      
      // CRITICAL: Update file status display BEFORE rendering form
      updateFileStatusDisplay();
      
      // Render the form
      renderForm(state.currentSchema);
      
      console.log('✅ Auto-loaded last used files successfully');
      
      // Update UI indicators
      document.getElementById('configBtn').textContent = '⚙️ Config (files loaded)';
      document.getElementById('configBtn').style.backgroundColor = '#e8f5e9';
      
    } catch (error) {
      console.error('❌ Error auto-loading files:', error);
      console.log('ℹ️ User will need to manually select files');
    }
  } else {
    console.log('ℹ️ No last used files found - showing config on first use');
    // ADDED: Show file status even when empty
    updateFileStatusDisplay();
  }
});

export {
  collectFormData,
  setNestedValue,
  showAboutModal,
  showViewModal
};

//==== END OF FILE ====//