// input-control.js - New Input Control Functions
// Import this file in your HTML: <script src="input-control.js"></script>

import { state, updateState, getState } from './state.js';

// ==================== INPUT CONTROL FACTORY ====================
/**
 * Factory function to create appropriate input control based on input_control property
 * @param {string} key - Field key
 * @param {Object} prop - Property schema
 * @param {string} pathStr - Field path
 * @param {Object} choiceConfig - Custom options configuration
 * @param {boolean} isRequired - Whether field is required
 * @param {boolean} isDependent - Whether field has dependent values
 * @param {string} depField - Dependency field name
 * @returns {string} HTML string for the input control
 */
function createInputControl(key, prop, pathStr, choiceConfig, isRequired, isDependent, depField) {
  const inputControl = choiceConfig?.input_control || 'text';
  const naValue = choiceConfig?.na || null;
  const hasNAOption = naValue !== null;
  
  console.log(`Creating input control: ${inputControl} for ${pathStr}`);
  
  switch (inputControl) {
    case 'drop-down':
      return createDropdownControl(pathStr, choiceConfig, isRequired, isDependent, depField, hasNAOption, naValue);
    
    case 'check-box':
      return createCheckboxControl(pathStr, choiceConfig, isRequired, isDependent, depField, hasNAOption, naValue);
    
    case 'radio-button':
      return createRadioButtonControl(pathStr, choiceConfig, isRequired, isDependent, depField, hasNAOption, naValue);
    
    case 'date-time-picker':
      return createDateTimePickerControl(pathStr, prop, isRequired);
    
    case 'slider':
      return createSliderControl(pathStr, choiceConfig, isRequired);
    
    default:
      console.warn(`Unknown input_control: ${inputControl}, falling back to default`);
      return createDefaultInput(pathStr, prop, isRequired);
  }
}

// ==================== DROP-DOWN CONTROL ====================
/**
 * Creates dropdown control (refactored from existing logic)
 */
function createDropdownControl(pathStr, choiceConfig, isRequired, isDependent, depField, hasNAOption, naValue) {
  const responseType = choiceConfig?.response_type || 'single-select';
  let rawValues = isDependent ? [] : (choiceConfig?.values || []);
  let enumValues = expandRangeValues(rawValues);
  
  const exclusiveValues = choiceConfig?.exclusive_values || [];

  updateState({
    exclusiveOptionsMap: {
      ...state.exclusiveOptionsMap,
      [pathStr]: exclusiveValues
    }
  });
  
  if (responseType === 'multi-select') {
    return createMultiSelectDropdown(pathStr, enumValues, isDependent, depField, hasNAOption, naValue);
  } else {
    return createSingleSelectDropdown(pathStr, enumValues, isDependent, depField, hasNAOption, naValue, isRequired);
  }
}

/**
 * UPDATED: createMultiSelectDropdown with value/label support
 * Displays labels but stores values
 */
function createMultiSelectDropdown(pathStr, enumValues, isDependent, depField, hasNAOption, naValue) {
  const dropdownId = 'multiselect_' + pathStr.replace(/\./g, '_');
  let html = `
    <div class="multi-select-container" id="${dropdownId}" ${isDependent ? `data-dependent="true" data-dep-field="${depField}"` : ''}>
      <div class="multi-select-trigger" onclick="toggleMultiSelectDropdown('${dropdownId}')" tabindex="0">
        <div class="multi-select-selected" id="${dropdownId}_selected">
          <span class="multi-select-placeholder">-- Select --</span>
        </div>
      </div>
      <div class="multi-select-dropdown" id="${dropdownId}_dropdown">
  `;
  
  if (!isDependent) {
    enumValues.forEach((item, idx) => {
      // item is now {value, label}
      const value = item.value;
      const label = item.label;
      
      html += `
        <div class="multi-select-option">
          <input type="checkbox" id="${pathStr}_${idx}" value="${value}" 
                 data-path="${pathStr}" data-dropdown="${dropdownId}"
                 data-label="${label}"
                 class="multi-select-checkbox"
                 onchange="handleMultiSelectChange(event, '${pathStr}', '${dropdownId}')">
          <label for="${pathStr}_${idx}">${label}</label>
        </div>`;
    });
    
    if (hasNAOption) {
      // naValue can be string or {value, label} object
      const naVal = typeof naValue === 'object' ? naValue.value : naValue;
      const naLabel = typeof naValue === 'object' ? naValue.label : naValue;
      
      html += `
        <div class="multi-select-option na-option">
          <input type="checkbox" id="${pathStr}_na" value="${naVal}" 
                 data-path="${pathStr}" data-dropdown="${dropdownId}"
                 data-label="${naLabel}"
                 class="na-checkbox"
                 onchange="handleNAChange('${pathStr}', '${dropdownId}')">
          <label for="${pathStr}_na">${naLabel} (exclusive)</label>
        </div>`;
    }
  }
  
  html += '</div></div>';
  return html;
}

/**
 * UPDATED: createSingleSelectDropdown with value/label support
 */
function createSingleSelectDropdown(pathStr, enumValues, isDependent, depField, hasNAOption, naValue, isRequired) {
  let html = `<select name="${pathStr}" id="${pathStr}" data-path="${pathStr}" 
              ${isDependent ? `data-dependent="true" data-dep-field="${depField}"` : ''} 
              ${isRequired ? 'required' : ''}>
    <option value="">-- Select --</option>`;
  
  if (!isDependent) {
    // enumValues is now array of {value, label} objects
    html += enumValues.map(item => 
      `<option value="${item.value}">${item.label}</option>`
    ).join('');
    
    if (hasNAOption) {
      const naVal = typeof naValue === 'object' ? naValue.value : naValue;
      const naLabel = typeof naValue === 'object' ? naValue.label : naValue;
      html += `<option value="${naVal}">${naLabel}</option>`;
    }
  }
  
  html += '</select>';
  return html;
}

// ==================== CHECKBOX CONTROL ====================
/**
 * Creates checkbox list control
 * NOTE: response_type is IGNORED for checkbox control
 */
function createCheckboxControl(pathStr, choiceConfig, isRequired, isDependent, depField, hasNAOption, naValue) {
  let rawValues = isDependent ? [] : (choiceConfig?.values || []);
  let enumValues = expandRangeValues(rawValues); // Returns [{value, label}, ...]
  
  const exclusiveValues = choiceConfig?.exclusive_values || [];
  // Store exclusive values (these are actual values, not labels)
  updateState({
    exclusiveOptionsMap: {
      ...state.exclusiveOptionsMap,
      [pathStr]: exclusiveValues
    }
  });
  
  const containerId = 'checkbox_' + pathStr.replace(/\./g, '_');
  
  let html = `<div class="checkbox-container" id="${containerId}" data-path="${pathStr}" 
              ${isDependent ? `data-dependent="true" data-dep-field="${depField}"` : ''}>`;
  
  if (!isDependent) {
    enumValues.forEach((item, idx) => {
      html += `
        <div class="checkbox-option">
          <input type="checkbox" id="${pathStr}_cb_${idx}" value="${item.value}" 
                 data-path="${pathStr}" data-container="${containerId}"
                 data-label="${item.label}"
                 class="checkbox-input"
                 onchange="handleCheckboxChange(event, '${pathStr}', '${containerId}')">
          <label for="${pathStr}_cb_${idx}">${item.label}</label>
        </div>`;
    });
    
    if (hasNAOption) {
      const naVal = typeof naValue === 'object' ? naValue.value : naValue;
      const naLabel = typeof naValue === 'object' ? naValue.label : naValue;
      
      html += `
        <div class="checkbox-option na-option">
          <input type="checkbox" id="${pathStr}_cb_na" value="${naVal}" 
                 data-path="${pathStr}" data-container="${containerId}"
                 data-label="${naLabel}"
                 class="na-checkbox-input"
                 onchange="handleCheckboxNAChange('${pathStr}', '${containerId}')">
          <label for="${pathStr}_cb_na">${naLabel} (exclusive)</label>
        </div>`;
    }
  }
  
  html += '</div>';
  return html;
}

// ==================== RADIO BUTTON CONTROL ====================
/**
 * Creates radio button control
 * NOTE: response_type is IGNORED for radio-button control
 */
function createRadioButtonControl(pathStr, choiceConfig, isRequired, isDependent, depField, hasNAOption, naValue) {
  let rawValues = isDependent ? [] : (choiceConfig?.values || []);
  let enumValues = expandRangeValues(rawValues); // Returns [{value, label}, ...]
  
  const containerId = 'radio_' + pathStr.replace(/\./g, '_');
  
  let html = `<div class="radio-container" id="${containerId}" data-path="${pathStr}" 
              ${isDependent ? `data-dependent="true" data-dep-field="${depField}"` : ''}>`;
  
  if (!isDependent) {
    enumValues.forEach((item, idx) => {
      html += `
        <div class="radio-option">
          <input type="radio" id="${pathStr}_rb_${idx}" name="${pathStr}" value="${item.value}" 
                 data-path="${pathStr}" 
                 data-label="${item.label}"
                 class="radio-input"
                 onchange="handleRadioChange(event, '${pathStr}')">
          <label for="${pathStr}_rb_${idx}">${item.label}</label>
        </div>`;
    });
    
    if (hasNAOption) {
      const naVal = typeof naValue === 'object' ? naValue.value : naValue;
      const naLabel = typeof naValue === 'object' ? naValue.label : naValue;
      
      html += `
        <div class="radio-option na-option">
          <input type="radio" id="${pathStr}_rb_na" name="${pathStr}" value="${naVal}" 
                 data-path="${pathStr}" 
                 data-label="${naLabel}"
                 class="radio-input"
                 onchange="handleRadioChange(event, '${pathStr}')">
          <label for="${pathStr}_rb_na">${naLabel}</label>
        </div>`;
    }
  }
  
  html += '</div>';
  return html;
}

// ==================== DATE-TIME PICKER CONTROL ====================
/**
 * Creates date/time picker control
 * NOTE: response_type is IGNORED for date-time-picker control
 */
function createDateTimePickerControl(pathStr, prop, isRequired) {
  const format = prop?.format || 'date';
  let inputType = 'date';
  
  if (format === 'date-time' || format === 'datetime') {
    inputType = 'datetime-local';
  } else if (format === 'time') {
    inputType = 'time';
  }
  
  return `<input type="${inputType}" name="${pathStr}" id="${pathStr}" data-path="${pathStr}" 
          class="datetime-input" ${isRequired ? 'required' : ''}>`;
}

// ==================== SLIDER CONTROL ====================
/**
 * Creates slider (range) control
 * NOTE: response_type is IGNORED for slider control
 */
function createSliderControl(pathStr, choiceConfig, isRequired) {
  let rawValues = choiceConfig?.values || [];
  let enumValues = expandRangeValues(rawValues);
  
  let min = 0, max = 100, step = 1;
  
  if (enumValues.length > 0) {
    const numericValues = enumValues.map(v => Number(v)).filter(v => !isNaN(v));
    if (numericValues.length > 0) {
      min = Math.min(...numericValues);
      max = Math.max(...numericValues);
      if (numericValues.length > 1) {
        const sortedValues = numericValues.sort((a, b) => a - b);
        step = sortedValues[1] - sortedValues[0] || 1;
      }
    }
  }
  
  const sliderId = 'slider_' + pathStr.replace(/\./g, '_');
  
  return `
    <div class="slider-container" id="${sliderId}">
      <input type="range" name="${pathStr}" id="${pathStr}" data-path="${pathStr}" 
             class="slider-input" min="${min}" max="${max}" step="${step}" value="${min}"
             oninput="updateSliderValue('${pathStr}', '${sliderId}')"
             ${isRequired ? 'required' : ''}>
      <div class="slider-value-display">
        <span id="${sliderId}_value">${min}</span>
      </div>
    </div>`;
}

// ==================== DEFAULT INPUT ====================
/**
 * Creates default input based on schema type (fallback)
 */
function createDefaultInput(pathStr, prop, isRequired) {
  const type = prop.type;
  
  switch (type) {
    case 'string':
      if (prop.format === 'date') {
        return `<input type="date" name="${pathStr}" id="${pathStr}" data-path="${pathStr}" ${isRequired ? 'required' : ''}>`;
      } else if (prop.format === 'email') {
        return `<input type="email" name="${pathStr}" id="${pathStr}" data-path="${pathStr}" ${isRequired ? 'required' : ''}>`;
      } else if (prop.maxLength && prop.maxLength > 100) {
        return `<textarea name="${pathStr}" id="${pathStr}" data-path="${pathStr}" ${isRequired ? 'required' : ''}></textarea>`;
      } else {
        return `<input type="text" name="${pathStr}" id="${pathStr}" data-path="${pathStr}" ${isRequired ? 'required' : ''}>`;
      }
    
    case 'integer':
    case 'number':
      return `<input type="number" name="${pathStr}" id="${pathStr}" data-path="${pathStr}"
        ${prop.minimum !== undefined ? `min="${prop.minimum}"` : ''}
        ${prop.maximum !== undefined ? `max="${prop.maximum}"` : ''}
        ${isRequired ? 'required' : ''}>`;
    
    case 'boolean':
      return `<input type="checkbox" name="${pathStr}" id="${pathStr}" data-path="${pathStr}">`;
    
    case 'array':
      return `<textarea name="${pathStr}" id="${pathStr}" data-path="${pathStr}" placeholder="Enter comma-separated values"></textarea>`;
    
    default:
      return `<input type="text" name="${pathStr}" id="${pathStr}" data-path="${pathStr}" ${isRequired ? 'required' : ''}>`;
  }
}

// ==================== EVENT HANDLERS ====================

/**
 * Handle checkbox change with exclusive options support
 */
window.handleCheckboxChange = function(event, path, containerId) {
  const changedCheckbox = event.target;
  const isChecked = changedCheckbox.checked;
  const changedValue = changedCheckbox.value;
  
  const exclusiveOptions = state.exclusiveOptionsMap[path] || [];
  
  if (exclusiveOptions.includes(changedValue) && isChecked) {
    const allCheckboxes = document.querySelectorAll(`[data-path="${path}"].checkbox-input, #${path}_cb_na`);
    allCheckboxes.forEach(cb => {
      if (cb !== changedCheckbox) cb.checked = false;
    });
  } else if (isChecked) {
    const allCheckboxes = document.querySelectorAll(`[data-path="${path}"].checkbox-input`);
    allCheckboxes.forEach(cb => {
      if (exclusiveOptions.includes(cb.value)) cb.checked = false;
    });
  }
};

/**
 * Handle checkbox N/A change
 */
window.handleCheckboxNAChange = function(path, containerId) {
  const naCheckbox = document.getElementById(path + '_cb_na');
  if (naCheckbox && naCheckbox.checked) {
    const checkboxes = document.querySelectorAll(`[data-path="${path}"].checkbox-input`);
    checkboxes.forEach(cb => cb.checked = false);
  }
};

/**
 * Handle radio button change
 */
window.handleRadioChange = function(event, path) {
  if (typeof collectFormData === 'function') {
    formData = collectFormData();
  }
};

/**
 * Update slider value display
 */
window.updateSliderValue = function(path, sliderId) {
  const slider = document.getElementById(path);
  const valueDisplay = document.getElementById(sliderId + '_value');
  if (slider && valueDisplay) {
    valueDisplay.textContent = slider.value;
  }
};

// ==================== DATA POPULATION HELPER ====================

/**
 * Populate checkbox list with values
 * UPDATED: populateCheckboxList to match by value
 */
function populateCheckboxList(pathStr, values) {
  const escapedPath = pathStr.replace(/\./g, '_');
  const container = document.getElementById(`checkbox_${escapedPath}`);
  
  if (!container) {
    console.warn(`Checkbox container not found for ${pathStr}`);
    return;
  }
  
  const allCheckboxes = container.querySelectorAll('[data-path]');
  const naCheckbox = document.getElementById(`${pathStr}_cb_na`);
  
  // Uncheck all
  allCheckboxes.forEach(cb => cb.checked = false);
  if (naCheckbox) naCheckbox.checked = false;
  
  const valuesToCheck = Array.isArray(values) ? values : [values];
  let hasInvalidValues = false;
  const invalidValues = [];
  
  valuesToCheck.forEach(val => {
    const stringValue = String(val);
    
    // Check NA by value
    if (naCheckbox && naCheckbox.value === stringValue) {
      naCheckbox.checked = true;
      console.log(`✓ Checked NA for ${pathStr} (label: ${naCheckbox.dataset.label || stringValue})`);
      return;
    }
    
    // Find checkbox by value (not label)
    const matchingCheckbox = Array.from(allCheckboxes).find(cb => String(cb.value) === stringValue);
    if (matchingCheckbox) {
      matchingCheckbox.checked = true;
      console.log(`✓ Checked ${stringValue} for ${pathStr} (label: ${matchingCheckbox.dataset.label || stringValue})`);
    } else {
      hasInvalidValues = true;
      invalidValues.push(stringValue);
      console.warn(`⚠ Checkbox not found for value: "${stringValue}" in ${pathStr}`);
      console.log('Available values:', 
        Array.from(allCheckboxes).map(cb => `${cb.value} (${cb.dataset.label || cb.value})`)
      );
    }
  });
  
  if (hasInvalidValues) {
    container.classList.add('invalid-data');
    container.dataset.invalidValues = JSON.stringify(invalidValues);
    if (typeof addInvalidMultiSelectWarning === 'function') {
      addInvalidMultiSelectWarning(container, invalidValues, pathStr);
    }
  } else {
    container.classList.remove('invalid-data');
    if (typeof removeInvalidWarning === 'function') {
      removeInvalidWarning(container);
    }
  }
}

/**
 * Populate radio button with value
 * UPDATED: populateRadioButton to match by value
 * When loading data, we receive values, need to find matching radio by value
 */
function populateRadioButton(pathStr, value) {
  const escapedPath = pathStr.replace(/\./g, '_');
  const radioContainer = document.getElementById(`radio_${escapedPath}`);
  
  if (!radioContainer) {
    console.warn(`Radio container not found for ${pathStr}`);
    return;
  }
  
  const stringValue = String(value);
  // Find radio button by value (not by label)
  const radioButton = radioContainer.querySelector(`input[type="radio"][value="${stringValue}"]`);
  
  if (radioButton) {
    radioButton.checked = true;
    radioButton.dispatchEvent(new Event('change', { bubbles: true }));
    console.log(`✓ Set radio ${pathStr} = ${stringValue} (label: ${radioButton.dataset.label || stringValue})`);
  } else {
    console.warn(`⚠ Radio button value "${stringValue}" not found for ${pathStr}`);
    console.log('Available values:', 
      Array.from(radioContainer.querySelectorAll('input[type="radio"]'))
        .map(rb => `${rb.value} (${rb.dataset.label || rb.value})`)
    );
  }
}

/**
 * Populate slider with value
 */
function populateSlider(pathStr, value) {
  const input = document.querySelector(`input[type="range"][data-path="${pathStr}"]`);
  
  if (!input) {
    console.warn(`Slider not found for ${pathStr}`);
    return;
  }
  
  input.value = value;
  const sliderId = input.closest('.slider-container')?.id;
  if (sliderId) {
    updateSliderValue(pathStr, sliderId);
  }
  input.dispatchEvent(new Event('change', { bubbles: true }));
  console.log(`✓ Set slider ${pathStr} = ${value}`);
}

/**
 * Enhanced expandRangeValues to support value/label pairs
 * 
 * Supports three formats:
 * 1. Legacy string array: ["Option1", "Option2"]
 * 2. Value/label objects: [{value: "opt1", label: "Option 1"}, {value: "opt2", label: "Option 2"}]
 * 3. Value-only objects: [{value: "opt1"}, {value: "opt2"}] - uses value as label
 * 4. Range notation: ["1-50"] expands to [{value: "1", label: "1"}, ..., {value: "50", label: "50"}]
 * 
 * @param {Array} rawValues - Array of strings or objects
 * @returns {Array} Array of {value, label} objects
 */
function expandRangeValues(rawValues) {
  const expanded = [];
  
  rawValues.forEach(val => {
    // Case 1: Already an object with value/label
    if (typeof val === 'object' && val !== null && 'value' in val) {
      expanded.push({
        value: String(val.value),
        label: val.label || String(val.value) // Use value as label if label missing
      });
    }
    // Case 2: String with range notation (e.g., "1-50")
    else if (typeof val === 'string' && val.includes('-')) {
      const rangeMatch = val.match(/^(\d+)-(\d+)$/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1]);
        const end = parseInt(rangeMatch[2]);
        if (start <= end) {
          for (let i = start; i <= end; i++) {
            const strValue = String(i);
            expanded.push({
              value: strValue,
              label: strValue
            });
          }
        } else {
          // Invalid range, treat as regular string
          expanded.push({
            value: val,
            label: val
          });
        }
      } else {
        // Has dash but not a valid range (e.g., "opt-1")
        expanded.push({
          value: val,
          label: val
        });
      }
    }
    // Case 3: Simple string (legacy format)
    else {
      const strValue = String(val);
      expanded.push({
        value: strValue,
        label: strValue
      });
    }
  });
  
  return expanded;
}

/**
 * Update options for single-select dropdown
 * UPDATED: updateSelectOptions with value/label support
 * Used when dependent field values change
 */
function updateSelectOptions(selectElement, enumValues, naValue, hasNAOption, pathStr) {
  selectElement.innerHTML = '<option value="">-- Select --</option>';
  
  // enumValues is now array of {value, label} objects
  enumValues.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.value;
    opt.textContent = item.label;
    selectElement.appendChild(opt);
  });
  
  if (hasNAOption) {
    const opt = document.createElement('option');
    const naVal = typeof naValue === 'object' ? naValue.value : naValue;
    const naLabel = typeof naValue === 'object' ? naValue.label : naValue;
    opt.value = naVal;
    opt.textContent = naLabel;
    selectElement.appendChild(opt);
  }
}


/**
 * Update options for multi-select dropdown
* UPDATED: updateMultiSelectOptions with value/label support
 */
function updateMultiSelectOptions(container, enumValues, naValue, hasNAOption, pathStr) {
  const dropdown = container.querySelector('.multi-select-dropdown');
  if (!dropdown) return;
  
  dropdown.innerHTML = '';
  
  // enumValues is now array of {value, label} objects
  enumValues.forEach((item, idx) => {
    const optionDiv = document.createElement('div');
    optionDiv.className = 'multi-select-option';
    optionDiv.innerHTML = `
      <input type="checkbox" 
             id="${pathStr}_${idx}" 
             value="${item.value}" 
             data-path="${pathStr}"
             data-dropdown="${container.id}"
             data-label="${item.label}"
             class="multi-select-checkbox"
             onchange="handleMultiSelectChange(event, '${pathStr}', '${container.id}')">
      <label for="${pathStr}_${idx}">${item.label}</label>
    `;
    dropdown.appendChild(optionDiv);
  });
  
  if (hasNAOption) {
    const naDiv = document.createElement('div');
    naDiv.className = 'multi-select-option na-option';
    const naVal = typeof naValue === 'object' ? naValue.value : naValue;
    const naLabel = typeof naValue === 'object' ? naValue.label : naValue;
    
    naDiv.innerHTML = `
      <input type="checkbox" 
             id="${pathStr}_na" 
             value="${naVal}" 
             data-path="${pathStr}"
             data-dropdown="${container.id}"
             data-label="${naLabel}"
             class="na-checkbox"
             onchange="handleNAChange('${pathStr}', '${container.id}')">
      <label for="${pathStr}_na">${naLabel} (exclusive)</label>
    `;
    dropdown.appendChild(naDiv);
  }
  
  updateMultiSelectDisplay(container.id, pathStr);
}


/**
 * Update options for checkbox list
 * UPDATED: updateCheckboxOptions with value/label support
 */
function updateCheckboxOptions(container, enumValues, naValue, hasNAOption, pathStr) {
  container.innerHTML = '';
  const containerId = container.id;
  
  // enumValues is now array of {value, label} objects
  enumValues.forEach((item, idx) => {
    const optionDiv = document.createElement('div');
    optionDiv.className = 'checkbox-option';
    optionDiv.innerHTML = `
      <input type="checkbox" 
             id="${pathStr}_cb_${idx}" 
             value="${item.value}" 
             data-path="${pathStr}"
             data-container="${containerId}"
             data-label="${item.label}"
             class="checkbox-input"
             onchange="handleCheckboxChange(event, '${pathStr}', '${containerId}')">
      <label for="${pathStr}_cb_${idx}">${item.label}</label>
    `;
    container.appendChild(optionDiv);
  });
  
  if (hasNAOption) {
    const naDiv = document.createElement('div');
    naDiv.className = 'checkbox-option na-option';
    const naVal = typeof naValue === 'object' ? naValue.value : naValue;
    const naLabel = typeof naValue === 'object' ? naValue.label : naValue;
    
    naDiv.innerHTML = `
      <input type="checkbox" 
             id="${pathStr}_cb_na" 
             value="${naVal}" 
             data-path="${pathStr}"
             data-container="${containerId}"
             data-label="${naLabel}"
             class="na-checkbox-input"
             onchange="handleCheckboxNAChange('${pathStr}', '${containerId}')">
      <label for="${pathStr}_cb_na">${naLabel} (exclusive)</label>
    `;
    container.appendChild(naDiv);
  }
}

/**
 * Update options for radio button list
 * UPDATED: updateRadioOptions with value/label support
 */
function updateRadioOptions(container, enumValues, naValue, hasNAOption, pathStr) {
  container.innerHTML = '';
  
  // enumValues is now array of {value, label} objects
  enumValues.forEach((item, idx) => {
    const optionDiv = document.createElement('div');
    optionDiv.className = 'radio-option';
    optionDiv.innerHTML = `
      <input type="radio" 
             id="${pathStr}_rb_${idx}" 
             name="${pathStr}" 
             value="${item.value}" 
             data-path="${pathStr}"
             data-label="${item.label}"
             class="radio-input"
             onchange="handleRadioChange(event, '${pathStr}')">
      <label for="${pathStr}_rb_${idx}">${item.label}</label>
    `;
    container.appendChild(optionDiv);
  });
  
  if (hasNAOption) {
    const naDiv = document.createElement('div');
    naDiv.className = 'radio-option na-option';
    const naVal = typeof naValue === 'object' ? naValue.value : naValue;
    const naLabel = typeof naValue === 'object' ? naValue.label : naValue;
    
    naDiv.innerHTML = `
      <input type="radio" 
             id="${pathStr}_rb_na" 
             name="${pathStr}" 
             value="${naVal}" 
             data-path="${pathStr}"
             data-label="${naLabel}"
             class="radio-input"
             onchange="handleRadioChange(event, '${pathStr}')">
      <label for="${pathStr}_rb_na">${naLabel}</label>
    `;
    container.appendChild(naDiv);
  }
}

/**
 * Update multi-select display
* Reads labels from data-label attributes
 */
function updateMultiSelectDisplay(dropdownId, path) {
  const selectedContainer = document.getElementById(dropdownId + '_selected');
  if (!selectedContainer) return;
  
  const naCheckbox = document.getElementById(path + '_na');
  const selectedCheckboxes = document.querySelectorAll(`[data-path="${path}"].multi-select-checkbox:checked`);
  
  selectedContainer.innerHTML = '';
  
  if (naCheckbox && naCheckbox.checked) {
    const tag = document.createElement('span');
    tag.className = 'multi-select-tag';
    // Display label, not value
    tag.textContent = naCheckbox.dataset.label || naCheckbox.value;
    selectedContainer.appendChild(tag);
  } else if (selectedCheckboxes.length > 0) {
    selectedCheckboxes.forEach(cb => {
      const tag = document.createElement('span');
      tag.className = 'multi-select-tag';
      // Display label, not value
      tag.textContent = cb.dataset.label || cb.value;
      selectedContainer.appendChild(tag);
    });
  } else {
    const placeholder = document.createElement('span');
    placeholder.className = 'multi-select-placeholder';
    placeholder.textContent = '-- Select --';
    selectedContainer.appendChild(placeholder);
  }
}

// ==================== EXPORT FOR MODULE USAGE (OPTIONAL) ====================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createInputControl,
    createDropdownControl,
    createCheckboxControl,
    createRadioButtonControl,
    createDateTimePickerControl,
    createSliderControl,
    populateCheckboxList,
    populateRadioButton,
    populateSlider,
    expandRangeValues,
    updateSelectOptions,
    updateMultiSelectOptions,
    updateCheckboxOptions,
    updateRadioOptions ,
    updateMultiSelectDisplay  
  };
}

export {
    createInputControl,
    populateCheckboxList,
    populateRadioButton,
    populateSlider,
    createDefaultInput,
    expandRangeValues,
    updateSelectOptions,
    updateMultiSelectOptions,
    updateCheckboxOptions,
    updateRadioOptions,
    updateMultiSelectDisplay
}