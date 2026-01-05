// form-population.js - Functions for populating form fields with data
import { state } from './state.js';
import { populateCheckboxList,
         populateRadioButton,
         populateSlider,
         updateMultiSelectDisplay} from './input-control.js'
import { resolveRef} from './file-validation.js'
import { applyConditionalRules } from './conditional-rules.js';


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

export {
  populateFormWithData,
  populateSingleField,
  addInvalidDataWarning,
  removeInvalidWarning
};

// ==== END OF PROGRAM ====/