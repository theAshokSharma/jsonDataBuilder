// data-builder.js - JSON data builder
// @ts-check

import { state, updateState } from './state.js';
import { showConfigModal, loadDataFromFile, resolveReferences } from './file-operations.js';
import { saveJsonWithDialog, exportJsonToClipboard, addTooltip, ashAlert, ashConfirm, escapeHtml } from './utils.js';
import { renderForm, renderAllTabs, updateFileStatusDisplay } from './form-renderer.js';
import { updateMultiSelectDisplay} from './input-control.js'
import { validateAndShowSummary, clearAllValidationErrors } from './input-validation.js';
import { getLastSchemaFile, getLastOptionsFile, createFileFromData } from './storage-manager.js';

// Initialize on page load
console.log('JSON Data Builder Loaded - Version 3.10`');


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
        'There are fields with validation errors. Saving will export the form with these values.\n\n' +
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
        'Exporting will copy the form with these values.\n\n' +
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

/**
 * Collects all form data with intelligent type conversion
 * Handles all input types: text, number, select, checkbox, radio, multi-select, etc.
 * Converts values to correct types based on JSON schema
 * @returns {Object} - Collected form data as JavaScript object
 */
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
          setNestedValue(data, path, convertToSchemaType(path, naCheckbox.value, true));
        } else if (checkboxes.length > 0) {
          const values = Array.from(checkboxes).map(cb => convertToSchemaType(path, cb.value, true));
          setNestedValue(data, path, values);
        } else {
          setNestedValue(data, path, []);
        }
        processedPaths.add(path);
      }
    }
    else if (input.classList && input.classList.contains('na-checkbox')) {
      const naCheckbox = document.getElementById(path + '_na');
      if (naCheckbox && naCheckbox.checked) {
        setNestedValue(data, path, convertToSchemaType(path, naCheckbox.value, true));
        processedPaths.add(path);
      }
    }
    else if (input.classList && input.classList.contains('multi-select-checkbox')) {
      if (!processedPaths.has(path)) {
        const naCheckbox = document.getElementById(path + '_na');
        if (naCheckbox && naCheckbox.checked) {
          setNestedValue(data, path, convertToSchemaType(path, naCheckbox.value, true));
        } else {
          const checkboxes = document.querySelectorAll(`[data-path="${path}"].multi-select-checkbox:checked`);
          if (checkboxes.length > 0) {
            const values = Array.from(checkboxes).map(cb => convertToSchemaType(path, cb.value, true));
            setNestedValue(data, path, values);
          } else {
            setNestedValue(data, path, []);
          }
        }
        processedPaths.add(path);
      }
    }
    else if (input.classList && input.classList.contains('radio-input')) {
      if (!processedPaths.has(path)) {
        const selectedRadio = document.querySelector(`[data-path="${path}"].radio-input:checked`);
        const naRadio = document.querySelector(`[data-path="${path}"].na-radio-input:checked`);
        
        if (naRadio) {
          setNestedValue(data, path, convertToSchemaType(path, naRadio.value, false));
        } else if (selectedRadio) {
          setNestedValue(data, path, convertToSchemaType(path, selectedRadio.value, false));
        } else {
          setNestedValue(data, path, null);
        }
        processedPaths.add(path);
      }
    }
    else if (input.type === 'range') {
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
      // ✅ FIXED: Convert SELECT values based on schema type
      const convertedValue = convertToSchemaType(path, input.value, false);
      setNestedValue(data, path, convertedValue);
      processedPaths.add(path);
    }
  });
  
  // ✅ NEW: Handle polymorphic array items (nested structures)
  collectPolymorphicArrayData(data);
  
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
async function showViewModal() {
  try {
        renderAllTabs(); // Ensure all tabs are rendered before collecting data
        
        // Clear previous validation errors
        clearAllValidationErrors();
        
        // Collect data
        const data = collectFormData();
        
        console.log('📊 Collected data for view:', data);
        
        // NEW: Validate against schema
        const isValid = await validateAndShowSummary(data, state.currentSchema);
        
        // Check for invalid fields from data loading (separate from validation)
        const invalidFields = document.querySelectorAll('.invalid-data');
        if (invalidFields.length > 0) {
          const confirmView = await ashConfirm(
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
        
        // Show the modal
        const viewModal = document.getElementById('view-modal');
        const viewContent = document.getElementById('view-data-content');    
        
        // Format the data as HTML with orange properties and blue values
        viewContent.innerHTML = formatJsonToHtml(data);
        viewModal.style.display = 'flex';

        // Close button handler
        document.getElementById('closeViewBtn').onclick = () => {
        viewModal.style.display = 'none';
        // clearAllValidationErrors();
      };

      // Close on outside click
      viewModal.onclick = (e) => {
        if (e.target === viewModal) {
          viewModal.style.display = 'none';
          clearAllValidationErrors();
        }
      };
      
      console.log('✅ View modal displayed successfully');
    
  } catch (error) {
    console.error('Error viewing data:', error);
    await ashAlert('Error viewing data: ' + error.message);
  }
}

/**
 * Enhanced JSON to HTML formatter with proper color coding
 * - Properties: Orange
 * - Values (strings, numbers, booleans): Light Blue
 * - Structural characters ({}, [], :, ,): White
 * 
 * @param {*} obj - The JSON object/array/value to format
 * @param {number} indent - Current indentation level
 * @returns {string} HTML formatted string
 */
function formatJsonToHtml(obj, indent = 0) {
    let html = '';
    const indentStr = '  '.repeat(indent);
    
    // Handle null
    if (obj === null) {
        return `<span class="json-value">null</span>`;
    }
    
    // Handle arrays
    if (Array.isArray(obj)) {
        if (obj.length === 0) {
            return `<span class="json-bracket">[]</span>`;
        }
        
        html += `<span class="json-bracket">[</span>\n`;
        
        for (let i = 0; i < obj.length; i++) {
            html += indentStr + '  ';
            
            const item = obj[i];
            
            // Check if item is object or array (needs recursion)
            if (typeof item === 'object' && item !== null) {
                html += formatJsonToHtml(item, indent + 1);
            } else if (typeof item === 'string') {
                html += `<span class="json-value">"${escapeHtml(item)}"</span>`;
            } else if (typeof item === 'number' || typeof item === 'boolean') {
                html += `<span class="json-value">${item}</span>`;
            } else {
                html += `<span class="json-value">null</span>`;
            }
            
            if (i < obj.length - 1) {
                html += `<span class="json-comma">,</span>`;
            }
            html += '\n';
        }
        
        html += indentStr + `<span class="json-bracket">]</span>`;
        return html;
    }
    
    // Handle objects
    if (typeof obj === 'object') {
        const keys = Object.keys(obj);
        
        if (keys.length === 0) {
            return `<span class="json-bracket">{}</span>`;
        }
        
        html += `<span class="json-bracket">{</span>\n`;
        
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const value = obj[key];
            
            html += indentStr + '  ';
            html += `<span class="json-property">"${escapeHtml(key)}"</span>`;
            html += `<span class="json-colon">: </span>`;
            
            // Handle different value types
            if (value === null) {
                html += `<span class="json-value">null</span>`;
            } else if (Array.isArray(value)) {
                html += formatJsonToHtml(value, indent + 1);
            } else if (typeof value === 'object') {
                html += formatJsonToHtml(value, indent + 1);
            } else if (typeof value === 'string') {
                html += `<span class="json-value">"${escapeHtml(value)}"</span>`;
            } else if (typeof value === 'number' || typeof value === 'boolean') {
                html += `<span class="json-value">${value}</span>`;
            } else {
                html += `<span class="json-value">"${escapeHtml(String(value))}"</span>`;
            }
            
            if (i < keys.length - 1) {
                html += `<span class="json-comma">,</span>`;
            }
            html += '\n';
        }
        
        html += indentStr + `<span class="json-bracket">}</span>`;
        return html;
    }
    
    // Handle primitive values (shouldn't normally reach here in recursive calls)
    if (typeof obj === 'string') {
        return `<span class="json-value">"${escapeHtml(obj)}"</span>`;
    }
    if (typeof obj === 'number' || typeof obj === 'boolean') {
        return `<span class="json-value">${obj}</span>`;
    }
    
    return `<span class="json-value">null</span>`;
}

/**
 * ✅ NEW: Collects data from polymorphic array items
 * Handles deeply nested structures like ANY_OF > ALL_OF > atomic rules
 */
function collectPolymorphicArrayData(data) {
  console.log('🔍 Collecting polymorphic array data...');
  
  // Find all array containers
  const arrayContainers = document.querySelectorAll('.array-container');
  
  arrayContainers.forEach(container => {
    const arrayPath = container.dataset.path;
    if (!arrayPath) return;
    
    console.log(`  📋 Processing array: ${arrayPath}`);
    
    // Find all array items in this container
    const arrayItems = container.querySelectorAll('.array-item');
    
    if (arrayItems.length === 0) {
      console.log(`    ℹ️ No items in array`);
      return;
    }
    
    const itemsData = [];
    
    arrayItems.forEach((itemElement, itemIndex) => {
      console.log(`    📦 Processing item ${itemIndex}`);
      
      // Check if this item has a type selector (polymorphic)
      const typeSelector = itemElement.querySelector('.array-item-type-selector');
      
      if (typeSelector && typeSelector.value) {
        console.log(`      🎯 Polymorphic item with type: ${typeSelector.value}`);
        
        // Get the dynamic content area
        const dynamicContent = itemElement.querySelector('.array-item-dynamic-content');
        
        if (dynamicContent) {
          const itemData = collectDynamicContent(dynamicContent, itemIndex);
          
          if (itemData && Object.keys(itemData).length > 0) {
            itemsData.push(itemData);
            console.log(`      ✅ Collected data:`, itemData);
          }
        }
      } else {
        // Non-polymorphic item - collect normally
        const itemData = {};
        const itemInputs = itemElement.querySelectorAll('[data-path]');
        
        itemInputs.forEach(input => {
          const path = input.dataset.path;
          if (path && path.startsWith(`${arrayPath}.${itemIndex}.`)) {
            const fieldKey = path.substring(`${arrayPath}.${itemIndex}.`.length);
            
            let value = input.value;
            if (input.type === 'number') {
              value = value ? Number(value) : null;
            } else if (input.type === 'checkbox') {
              value = input.checked;
            }
            
            itemData[fieldKey] = value;
          }
        });
        
        if (Object.keys(itemData).length > 0) {
          itemsData.push(itemData);
        }
      }
    });
    
    // Set the array data
    if (itemsData.length > 0) {
      setNestedValue(data, arrayPath, itemsData);
      console.log(`  ✅ Set array data for ${arrayPath}:`, itemsData);
    }
  });
}

/**
 * ✅ NEW: Collects data from dynamic polymorphic content
 * Handles nested polymorphic structures (e.g., groupRule with ALL_OF/ANY_OF)
 */
function collectDynamicContent(contentElement, itemIndex) {
  console.log(`        🔍 Collecting dynamic content for item ${itemIndex}`);
  
  const itemData = {};
  
  // Check for nested polymorphic selector (e.g., ALL_OF vs ANY_OF choice)
  const nestedSelector = contentElement.querySelector('.nested-polymorphic-selector');
  
  if (nestedSelector && nestedSelector.value !== '') {
    console.log(`          🎯 Found nested selector with value: ${nestedSelector.value}`);
    
    // Get the selected option's text (e.g., "ALL_OF" or "ANY_OF")
    const selectedOption = nestedSelector.options[nestedSelector.selectedIndex];
    const groupType = selectedOption.textContent.trim();
    
    console.log(`          📌 Group type: ${groupType}`);
    
    // Find the nested content area
    const nestedContent = contentElement.querySelector('.nested-polymorphic-content');
    
    if (nestedContent) {
      // Find the array container inside nested content
      const nestedArrayContainer = nestedContent.querySelector('.array-container');
      
      if (nestedArrayContainer) {
        const nestedItems = nestedArrayContainer.querySelectorAll('.array-item');
        const nestedItemsData = [];
        
        console.log(`          📦 Found ${nestedItems.length} nested items`);
        
        nestedItems.forEach((nestedItem, nestedIndex) => {
          console.log(`            🔸 Processing nested item ${nestedIndex}`);
          
          const nestedItemData = {};
          const nestedInputs = nestedItem.querySelectorAll('[data-path]');
          
          nestedInputs.forEach(input => {
            const path = input.dataset.path;
            
            // Extract the field name (last part of path)
            const pathParts = path.split('.');
            const fieldKey = pathParts[pathParts.length - 1];
            
            let value = input.value;
            
            if (input.type === 'number') {
              value = value ? Number(value) : null;
            } else if (input.type === 'checkbox') {
              value = input.checked;
            } else if (input.tagName === 'SELECT') {
              value = input.value;
            }
            
            if (value !== null && value !== '') {
              nestedItemData[fieldKey] = value;
            }
          });
          
          if (Object.keys(nestedItemData).length > 0) {
            nestedItemsData.push(nestedItemData);
            console.log(`            ✅ Nested item data:`, nestedItemData);
          }
        });
        
        if (nestedItemsData.length > 0) {
          itemData[groupType] = nestedItemsData;
          console.log(`          ✅ Set ${groupType} data:`, nestedItemsData);
        }
      }
    }
  } else {
    // No nested selector - collect inputs directly (atomic rule case)
    console.log(`          📝 Collecting atomic rule data`);
    
    const inputs = contentElement.querySelectorAll('[data-path]');
    
    inputs.forEach(input => {
      const path = input.dataset.path;
      
      // Extract field name from path
      const pathParts = path.split('.');
      const fieldKey = pathParts[pathParts.length - 1];
      
      let value = input.value;
      
      if (input.type === 'number') {
        value = value ? Number(value) : null;
      } else if (input.type === 'checkbox') {
        value = input.checked;
      } else if (input.tagName === 'SELECT') {
        value = input.value;
      }
      
      if (value !== null && value !== '') {
        itemData[fieldKey] = value;
        console.log(`          ✅ Field: ${fieldKey} = ${value}`);
      }
    });
  }
  
  return itemData;
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


/*** Helper Functions */

/**
 * ✅ MAIN FUNCTION: Gets schema for any field path
 * Replace getFieldSchemaForPath in data-builder.js with this
 */
function getFieldSchemaForPath(fieldPath) {
  if (!state.currentSchema) {
    console.warn('❌ No schema available');
    return null;
  }
  
  if (!fieldPath || typeof fieldPath !== 'string') {
    console.warn('❌ Invalid field path');
    return null;
  }
  
  console.log(`\n🔍 getFieldSchemaForPath: "${fieldPath}"`);
  
  // Split path and remove array indices for schema navigation
  const keys = fieldPath.split('.');
  const schemaKeys = keys.filter(k => isNaN(parseInt(k)));
  
  console.log('  Keys:', keys);
  console.log('  Schema keys (no indices):', schemaKeys);
  
  // Find starting point
  let current = findStartingPoint();
  if (!current) {
    console.warn('  ❌ No starting point found');
    return null;
  }
  
  console.log('  ✅ Starting point found');
  
  // Navigate through schema keys only
  for (let i = 0; i < schemaKeys.length; i++) {
    const key = schemaKeys[i];
    console.log(`  📍 [${i}] Navigating: "${key}"`);
    
    if (!current || typeof current !== 'object') {
      console.warn(`    ❌ Current is not navigable`);
      return null;
    }
    
    // Get property
    let prop = current[key];
    
    if (!prop) {
      console.warn(`    ❌ Property "${key}" not found`);
      console.log(`    Available:`, Object.keys(current));
      return null;
    }
    
    console.log(`    ✅ Found property "${key}"`);
    
    // Resolve $ref
    if (prop.$ref) {
      console.log(`    🔗 Resolving $ref: ${prop.$ref}`);
      prop = resolveRef(prop.$ref);
      
      if (!prop) {
        console.warn(`    ❌ Failed to resolve $ref`);
        return null;
      }
      console.log(`    ✅ Resolved`);
    }
    
    // Last key? Return the schema
    if (i === schemaKeys.length - 1) {
      console.log(`  ✅ FOUND SCHEMA for "${fieldPath}"`);
      console.log(`    Type: ${prop.type}`);
      return prop;
    }
    
    // Continue navigation
    current = getNextLevel(prop, keys, schemaKeys[i]);
    
    if (!current) {
      console.warn(`    ❌ Cannot navigate deeper from "${key}"`);
      return null;
    }
  }
  
  console.warn(`  ❌ Reached end without finding schema`);
  return null;
}

/**
 * ✅ Finds the starting point for navigation
 * Handles all schema types
 */
function findStartingPoint() {
  console.log('  🔎 Finding starting point...');
  
  // Case 1: Standard schema with properties
  if (state.currentSchema.properties) {
    console.log('    ➡️ Standard schema (has properties)');
    return state.currentSchema.properties;
  }
  
  // Case 2: Polymorphic schema (oneOf/anyOf at root)
  if (state.currentSchema.oneOf || state.currentSchema.anyOf) {
    console.log('    ➡️ Polymorphic schema (oneOf/anyOf)');
    
    // Try selected type
    if (state.selectedPolymorphicType?.option) {
      let selected = state.selectedPolymorphicType.option;
      
      if (selected.$ref) {
        selected = resolveRef(selected.$ref);
      }
      
      if (selected?.properties) {
        console.log('    ✅ Using selected type');
        return selected.properties;
      }
    }
    
    // Fallback: First option
    const options = state.currentSchema.oneOf || state.currentSchema.anyOf;
    if (options?.[0]) {
      let first = options[0];
      
      if (first.$ref) {
        first = resolveRef(first.$ref);
      }
      
      if (first?.properties) {
        console.log('    ⚠️ Using first option (fallback)');
        return first.properties;
      }
    }
  }
  
  // Case 3: Non-standard $Defs.properties
  if (state.currentSchema.$Defs?.properties) {
    console.log('    ➡️ Non-standard ($Defs.properties)');
    return state.currentSchema.$Defs.properties;
  }
  
  console.warn('    ❌ No starting point found');
  return null;
}

/**
 * ✅ Gets next level for navigation
 * Handles objects, arrays, and polymorphic items
 */
function getNextLevel(prop, allKeys, currentKey) {
  console.log(`    🔽 Getting next level from "${currentKey}"`);
  console.log(`      Type: ${prop.type}`);
  
  // Object with properties
  if (prop.type === 'object' && prop.properties) {
    console.log(`      ✅ Object → properties`);
    return prop.properties;
  }
  
  // Array
  if (prop.type === 'array' && prop.items) {
    console.log(`      📦 Array → items`);
    let items = prop.items;
    
    // Resolve $ref in items
    if (items.$ref) {
      console.log(`        🔗 Items has $ref: ${items.$ref}`);
      items = resolveRef(items.$ref);
      
      if (!items) {
        console.warn(`        ❌ Failed to resolve items $ref`);
        return null;
      }
    }
    
    // Handle polymorphic items (oneOf/anyOf)
    if (items.oneOf || items.anyOf) {
      console.log(`        🎯 Polymorphic array items`);
      
      // Find array index in path
      const currentKeyIndex = allKeys.indexOf(currentKey);
      const nextKey = allKeys[currentKeyIndex + 1];
      
      if (nextKey && !isNaN(parseInt(nextKey))) {
        console.log(`        📊 Array index in path: ${nextKey}`);
        
        // Try to get selected option from DOM
        const selected = getSelectedArrayItemOption(currentKey, parseInt(nextKey));
        
        if (selected) {
          console.log(`        ✅ Using selected option`);
          items = selected;
        } else {
          // Fallback: First option
          const options = items.oneOf || items.anyOf;
          let first = options[0];
          
          if (first.$ref) {
            first = resolveRef(first.$ref);
          }
          
          console.log(`        ⚠️ Using first option (no selection)`);
          items = first;
        }
      }
    }
    
    if (items.properties) {
      console.log(`      ✅ Array items → properties`);
      return items.properties;
    }
    
    // Items might be oneOf/anyOf without properties yet
    if (items.oneOf || items.anyOf) {
      console.log(`      ⚠️ Items still polymorphic, needs selection`);
      return null;
    }
  }
  
  console.warn(`      ❌ Cannot get next level (type: ${prop.type})`);
  return null;
}

/**
 * ✅ Resolves $ref with recursion support
 */
function resolveRef(ref) {
  if (!ref || typeof ref !== 'string') {
    return null;
  }
  
  console.log(`      🔗 resolveRef: ${ref}`);
  
  // Recursive reference to root
  if (ref === '#') {
    console.log(`        🔄 Recursive reference to root`);
    
    // Return the selected polymorphic option if available
    if (state.selectedPolymorphicType?.option) {
      let selected = state.selectedPolymorphicType.option;
      
      if (selected.$ref && selected.$ref !== '#') {
        selected = resolveRef(selected.$ref);
      }
      
      if (selected) {
        console.log(`        ✅ Returning selected type`);
        return selected;
      }
    }
    
    // Return root schema
    console.log(`        ✅ Returning root schema`);
    return state.currentSchema;
  }
  
  // Regular reference
  if (!ref.startsWith('#/')) {
    console.warn(`        ❌ Invalid ref format: ${ref}`);
    return null;
  }
  
  const path = ref.substring(2).split('/');
  let result = state.currentSchema;
  
  for (const key of path) {
    // Handle both $defs and definitions
    if (key === 'definitions' && !result[key] && result.$defs) {
      result = result.$defs;
    } else if (key === '$defs' && !result[key] && result.definitions) {
      result = result.definitions;
    } else {
      result = result[key];
    }
    
    if (!result) {
      console.warn(`        ❌ Path segment not found: ${key}`);
      return null;
    }
  }
  
  console.log(`        ✅ Resolved to: ${result.title || result.type || 'object'}`);
  return result;
}

/**
 * ✅ Gets selected option for array item from DOM
 */
function getSelectedArrayItemOption(arrayFieldKey, index) {
  // Build selector ID
  const escapedKey = arrayFieldKey.replace(/\./g, '_');
  const selectorId = `array-type-${escapedKey}-${index}`;
  
  console.log(`        🔍 Looking for selector: ${selectorId}`);
  
  const selector = document.getElementById(selectorId);
  
  if (!selector) {
    console.log(`        ⚠️ Selector not found`);
    return null;
  }
  
  const selectedIndex = parseInt(selector.value);
  
  if (isNaN(selectedIndex) || selectedIndex < 0) {
    console.log(`        ⚠️ No valid selection (value: ${selector.value})`);
    return null;
  }
  
  console.log(`        ✅ Selected index: ${selectedIndex}`);
  
  // Get options from root schema
  const options = state.currentSchema.oneOf || state.currentSchema.anyOf;
  
  if (!options || selectedIndex >= options.length) {
    console.warn(`        ❌ Invalid option index: ${selectedIndex}`);
    return null;
  }
  
  let option = options[selectedIndex];
  
  if (option.$ref) {
    option = resolveRef(option.$ref);
  }
  
  return option;
}

/**
 * ✅ ENHANCED: convertToSchemaType with better error handling
 * Replace convertToSchemaType in data-builder.js with this
 */
function convertToSchemaType(fieldPath, value, isArray) {
  // Handle empty/null
  if (value === null || value === undefined || value === '') {
    return null;
  }
  
  console.log(`\n🔄 convertToSchemaType: "${fieldPath}" = "${value}"`);
  
  // Get schema
  const fieldSchema = getFieldSchemaForPath(fieldPath);
  
  if (!fieldSchema) {
    console.warn(`  ⚠️ No schema found, returning string`);
    return String(value);
  }
  
  console.log(`  Schema type: ${fieldSchema.type}`);
  
  // Determine target type
  let targetType = fieldSchema.type;
  
  // For array items, use items type
  if (targetType === 'array' && isArray && fieldSchema.items) {
    targetType = fieldSchema.items.type;
    console.log(`  Array item type: ${targetType}`);
  }
  
  // Check custom options
  const customConfig = state.customOptions?.[fieldPath];
  const responseType = customConfig?.response_type;
  
  if (responseType === 'multi-select') {
    console.log(`  Multi-select → string`);
    return String(value);
  }
  
  // Convert based on type
  console.log(`  Converting to: ${targetType}`);
  
  switch (targetType) {
    case 'number':
    case 'integer':
      const num = Number(value);
      const result = !isNaN(num) ? num : value;
      console.log(`  Result: ${result} (${typeof result})`);
      return result;
      
    case 'boolean':
      const bool = value === 'true' || value === true;
      console.log(`  Result: ${bool}`);
      return bool;
      
    case 'string':
    default:
      console.log(`  Result: "${value}" (string)`);
      return String(value);
  }
}

/**
 * ✅ HELPER: Enhanced resolveRefInCollect
 * Replace resolveRefInCollect in data-builder.js with this
 */
function resolveRefInCollect(ref) {
  return resolveRef(ref);
}


// ============================================================
// EXPORT
// ============================================================
export {
  collectFormData,
  setNestedValue,
  showAboutModal,
  showViewModal,
  getFieldSchemaForPath,
  resolveRefInCollect
};

//==== END OF FILE ====//