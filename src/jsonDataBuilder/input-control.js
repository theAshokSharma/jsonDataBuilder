// input-control.js - New Input Control Functions
// Import this file in your HTML: <script src="input-control.js"></script>
// @ts-check
import { state, updateState, getState } from './state.js';
import { attachEventListeners } from './conditional-rules.js';
import { collectFormData } from './data-builder.js';
import {addInvalidMultiSelectWarning, removeInvalidWarning} from './form-population.js';

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
 * FIXED: Creates checkbox list control with proper HTML structure
 * NOTE: response_type is IGNORED for checkbox control
 */
function createCheckboxControl(pathStr, choiceConfig, isRequired, isDependent, depField, hasNAOption, naValue) {
  let rawValues = isDependent ? [] : (choiceConfig?.values || []);
  let enumValues = expandRangeValues(rawValues);
  
  const exclusiveValues = choiceConfig?.exclusive_values || [];
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
        <label class="checkbox-option" for="${pathStr}_cb_${idx}">
          <input type="checkbox" id="${pathStr}_cb_${idx}" value="${item.value}" 
                 data-path="${pathStr}" data-container="${containerId}"
                 data-label="${item.label}"
                 class="checkbox-input"
                 onchange="handleCheckboxChange(event, '${pathStr}', '${containerId}')">
          <span>${item.label}</span>
        </label>`;
    });
    
    if (hasNAOption) {
      const naVal = typeof naValue === 'object' ? naValue.value : naValue;
      const naLabel = typeof naValue === 'object' ? naValue.label : naValue;
      
      html += `
        <label class="checkbox-option na-option" for="${pathStr}_cb_na">
          <input type="checkbox" id="${pathStr}_cb_na" value="${naVal}" 
                 data-path="${pathStr}" data-container="${containerId}"
                 data-label="${naLabel}"
                 class="na-checkbox-input"
                 onchange="handleCheckboxNAChange('${pathStr}', '${containerId}')">
          <span>${naLabel} (exclusive)</span>
        </label>`;
    }
  }
  
  html += '</div>';
  return html;
}

// ==================== RADIO BUTTON CONTROL ====================
/**
 * FIXED: Creates radio button control with proper HTML structure
 * NOTE: response_type is IGNORED for radio-button control
 */
function createRadioButtonControl(pathStr, choiceConfig, isRequired, isDependent, depField, hasNAOption, naValue) {
  let rawValues = isDependent ? [] : (choiceConfig?.values || []);
  let enumValues = expandRangeValues(rawValues);
  
  const containerId = 'radio_' + pathStr.replace(/\./g, '_');
  
  let html = `<div class="radio-container" id="${containerId}" data-path="${pathStr}" 
              ${isDependent ? `data-dependent="true" data-dep-field="${depField}"` : ''}>`;
  
  if (!isDependent) {
    enumValues.forEach((item, idx) => {
      html += `
        <label class="radio-option" for="${pathStr}_rb_${idx}">
          <input type="radio" id="${pathStr}_rb_${idx}" name="${pathStr}" value="${item.value}" 
                 data-path="${pathStr}" 
                 data-label="${item.label}"
                 class="radio-input"
                 onchange="handleRadioChange(event, '${pathStr}')">
          <span>${item.label}</span>
        </label>`;
    });
    
    if (hasNAOption) {
      const naVal = typeof naValue === 'object' ? naValue.value : naValue;
      const naLabel = typeof naValue === 'object' ? naValue.label : naValue;
      
      html += `
        <label class="radio-option na-option" for="${pathStr}_rb_na">
          <input type="radio" id="${pathStr}_rb_na" name="${pathStr}" value="${naVal}" 
                 data-path="${pathStr}" 
                 data-label="${naLabel}"
                 class="radio-input"
                 onchange="handleRadioChange(event, '${pathStr}')">
          <span>${naLabel}</span>
        </label>`;
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
    const numericValues = enumValues.map(v => Number(v.value)).filter(v => !isNaN(v));
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
    updateState({
      formData: collectFormData()
    });
  }
};


/**
 * Update slider value display (FIXED: Added proper function declaration)
 */
function updateSliderValue(path, sliderId) {
  const slider = document.getElementById(path);
  const valueDisplay = document.getElementById(sliderId + '_value');
  if (slider && valueDisplay) {
    valueDisplay.textContent = slider.value;
  }
}

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
  
  allCheckboxes.forEach(cb => cb.checked = false);
  if (naCheckbox) naCheckbox.checked = false;
  
  const valuesToCheck = Array.isArray(values) ? values : [values];
  let hasInvalidValues = false;
  const invalidValues = [];
  
  valuesToCheck.forEach(val => {
    const stringValue = String(val);
    
    if (naCheckbox && naCheckbox.value === stringValue) {
      naCheckbox.checked = true;
      console.log(`✓ Checked NA for ${pathStr} (label: ${naCheckbox.dataset.label || stringValue})`);
      return;
    }
    
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
 */
function populateRadioButton(pathStr, value) {
  const escapedPath = pathStr.replace(/\./g, '_');
  const radioContainer = document.getElementById(`radio_${escapedPath}`);
  
  if (!radioContainer) {
    console.warn(`Radio container not found for ${pathStr}`);
    return;
  }
  
  const stringValue = String(value);
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
 */
function expandRangeValues(rawValues) {
  const expanded = [];
  
  rawValues.forEach(val => {
    if (typeof val === 'object' && val !== null && 'value' in val) {
      expanded.push({
        value: String(val.value),
        label: val.label || String(val.value)
      });
    }
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
          expanded.push({
            value: val,
            label: val
          });
        }
      } else {
        expanded.push({
          value: val,
          label: val
        });
      }
    }
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
 */
function updateSelectOptions(selectElement, enumValues, naValue, hasNAOption, pathStr) {
  selectElement.innerHTML = '<option value="">-- Select --</option>';
  
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
 */
function updateMultiSelectOptions(container, enumValues, naValue, hasNAOption, pathStr) {
  const dropdown = container.querySelector('.multi-select-dropdown');
  if (!dropdown) return;
  
  dropdown.innerHTML = '';
  
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
 * FIXED: Update options for checkbox list
 */
function updateCheckboxOptions(container, enumValues, naValue, hasNAOption, pathStr) {
  container.innerHTML = '';
  const containerId = container.id;
  
  enumValues.forEach((item, idx) => {
    const label = document.createElement('label');
    label.className = 'checkbox-option';
    label.htmlFor = `${pathStr}_cb_${idx}`;
    label.innerHTML = `
      <input type="checkbox" 
             id="${pathStr}_cb_${idx}" 
             value="${item.value}" 
             data-path="${pathStr}"
             data-container="${containerId}"
             data-label="${item.label}"
             class="checkbox-input"
             onchange="handleCheckboxChange(event, '${pathStr}', '${containerId}')">
      <span>${item.label}</span>
    `;
    container.appendChild(label);
  });
  
  if (hasNAOption) {
    const naVal = typeof naValue === 'object' ? naValue.value : naValue;
    const naLabel = typeof naValue === 'object' ? naValue.label : naValue;
    
    const label = document.createElement('label');
    label.className = 'checkbox-option na-option';
    label.htmlFor = `${pathStr}_cb_na`;
    label.innerHTML = `
      <input type="checkbox" 
             id="${pathStr}_cb_na" 
             value="${naVal}" 
             data-path="${pathStr}"
             data-container="${containerId}"
             data-label="${naLabel}"
             class="na-checkbox-input"
             onchange="handleCheckboxNAChange('${pathStr}', '${containerId}')">
      <span>${naLabel} (exclusive)</span>
    `;
    container.appendChild(label);
  }
}

/**
 * FIXED: Update options for radio button list
 */
function updateRadioOptions(container, enumValues, naValue, hasNAOption, pathStr) {
  container.innerHTML = '';
  
  enumValues.forEach((item, idx) => {
    const label = document.createElement('label');
    label.className = 'radio-option';
    label.htmlFor = `${pathStr}_rb_${idx}`;
    label.innerHTML = `
      <input type="radio" 
             id="${pathStr}_rb_${idx}" 
             name="${pathStr}" 
             value="${item.value}" 
             data-path="${pathStr}"
             data-label="${item.label}"
             class="radio-input"
             onchange="handleRadioChange(event, '${pathStr}')">
      <span>${item.label}</span>
    `;
    container.appendChild(label);
  });
  
  if (hasNAOption) {
    const naVal = typeof naValue === 'object' ? naValue.value : naValue;
    const naLabel = typeof naValue === 'object' ? naValue.label : naValue;
    
    const label = document.createElement('label');
    label.className = 'radio-option na-option';
    label.htmlFor = `${pathStr}_rb_na`;
    label.innerHTML = `
      <input type="radio" 
             id="${pathStr}_rb_na" 
             name="${pathStr}" 
             value="${naVal}" 
             data-path="${pathStr}"
             data-label="${naLabel}"
             class="radio-input"
             onchange="handleRadioChange(event, '${pathStr}')">
      <span>${naLabel}</span>
    `;
    container.appendChild(label);
  }
}

/**
 * Update multi-select display
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
    tag.textContent = naCheckbox.dataset.label || naCheckbox.value;
    selectedContainer.appendChild(tag);
  } else if (selectedCheckboxes.length > 0) {
    selectedCheckboxes.forEach(cb => {
      const tag = document.createElement('span');
      tag.className = 'multi-select-tag';
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

// New Helper Function
/**
 * ✅ NEW: Detects the current control type of an element
 * 
 * @param {HTMLElement} element - The control element
 * @returns {string} Control type identifier
 */
function detectCurrentControlType(element) {
  if (element.tagName === 'SELECT') {
    return 'drop-down';
  } else if (element.classList.contains('multi-select-container')) {
    return 'drop-down'; // Multi-select dropdown
  } else if (element.classList.contains('checkbox-container')) {
    return 'check-box';
  } else if (element.classList.contains('radio-container')) {
    return 'radio-button';
  } else if (element.classList.contains('slider-container')) {
    return 'slider';
  } else if (element.classList.contains('datetime-input')) {
    return 'date-time-picker';
  }
  
  return 'text'; // Default fallback
}

/**
 * ✅ NEW: Rebuilds a control with a different input type
 * 
 * @param {string} pathStr - Field path
 * @param {HTMLElement} oldElement - Current element to replace
 * @param {string} inputControl - New input control type
 * @param {string} responseType - Response type (single-select/multi-select)
 * @param {Array} enumValues - Values as [{value, label}, ...]
 * @param {*} naValue - N/A value if applicable
 * @param {boolean} hasNAOption - Whether N/A option exists
 * @returns {HTMLElement|null} New element or null if failed
 */
function rebuildControlWithType(pathStr, oldElement, inputControl, responseType, enumValues, naValue, hasNAOption) {
  console.log(`  🔨 Rebuilding control for ${pathStr}:`, {
    oldType: detectCurrentControlType(oldElement),
    newType: inputControl,
    responseType
  });
  
  // Find the parent form-group
  const formGroup = oldElement.closest('.form-group');
  if (!formGroup) {
    console.error(`  ❌ Cannot find form-group for ${pathStr}`);
    return null;
  }
  
  // Store current value before rebuilding
  const currentValue = getCurrentControlValue(oldElement, pathStr);
  console.log(`  💾 Stored current value:`, currentValue);
  
  // Create new control HTML
  const newControlHTML = createControlHTML(pathStr, inputControl, responseType, enumValues, naValue, hasNAOption);
  
  // Replace old element
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = newControlHTML;
  const newElement = tempDiv.firstElementChild;
  
  oldElement.parentNode.replaceChild(newElement, oldElement);
  console.log(`  ✅ Element replaced in DOM`);
  
  // Restore value if possible
  setTimeout(() => {
    restoreControlValue(newElement, pathStr, currentValue, inputControl);
    
    // Reattach event listeners
    attachEventListeners();
  }, 50);
  
  // Return reference to new element
  if (inputControl === 'drop-down') {
    if (responseType === 'multi-select') {
      return document.getElementById(`multiselect_${pathStr.replace(/\./g, '_')}`);
    } else {
      return document.querySelector(`select[data-path="${pathStr}"]`);
    }
  } else if (inputControl === 'check-box') {
    return document.getElementById(`checkbox_${pathStr.replace(/\./g, '_')}`);
  } else if (inputControl === 'radio-button') {
    return document.getElementById(`radio_${pathStr.replace(/\./g, '_')}`);
  } else if (inputControl === 'slider') {
    return document.getElementById(`slider_${pathStr.replace(/\./g, '_')}`);
  }
  
  return newElement;
}

/**
 * ✅ NEW: Creates HTML for a control with given specifications
 * 
 * @param {string} pathStr - Field path
 * @param {string} inputControl - Control type
 * @param {string} responseType - Response type
 * @param {Array} enumValues - Values as [{value, label}, ...]
 * @param {*} naValue - N/A value
 * @param {boolean} hasNAOption - Has N/A option
 * @returns {string} HTML string
 */
function createControlHTML(pathStr, inputControl, responseType, enumValues, naValue, hasNAOption) {
  const escapedPath = pathStr.replace(/\./g, '_');
  
  switch (inputControl) {
    case 'drop-down':
      if (responseType === 'multi-select') {
        return createMultiSelectHTML(pathStr, escapedPath, enumValues, naValue, hasNAOption);
      } else {
        return createSingleSelectHTML(pathStr, enumValues, naValue, hasNAOption);
      }
    
    case 'check-box':
      return createCheckboxHTML(pathStr, escapedPath, enumValues, naValue, hasNAOption);
    
    case 'radio-button':
      return createRadioHTML(pathStr, escapedPath, enumValues, naValue, hasNAOption);
    
    case 'slider':
      return createSliderHTML(pathStr, escapedPath, enumValues);
    
    default:
      console.warn(`Unknown input control: ${inputControl}, using text input`);
      return `<input type="text" data-path="${pathStr}" id="${pathStr}" class="text-input">`;
  }
}

/**
 * ✅ NEW: Get current value from any control type
 */
function getCurrentControlValue(element, pathStr) {
  if (element.tagName === 'SELECT') {
    return element.value;
  } else if (element.classList.contains('multi-select-container')) {
    const checked = element.querySelectorAll('.multi-select-checkbox:checked');
    return Array.from(checked).map(cb => cb.value);
  } else if (element.classList.contains('checkbox-container')) {
    const checked = element.querySelectorAll('.checkbox-input:checked');
    return Array.from(checked).map(cb => cb.value);
  } else if (element.classList.contains('radio-container')) {
    const selected = element.querySelector('.radio-input:checked');
    return selected ? selected.value : null;
  } else if (element.classList.contains('slider-container')) {
    const input = element.querySelector('input[type="range"]');
    return input ? input.value : null;
  }
  
  return null;
}

/**
 * ✅ NEW: Restore value to a control after rebuilding
 */
function restoreControlValue(element, pathStr, value, inputControl) {
  if (!value) return;
  
  console.log(`  🔄 Restoring value to ${inputControl}:`, value);
  
  if (inputControl === 'drop-down') {
    if (Array.isArray(value)) {
      // Multi-select
      value.forEach(val => {
        const cb = element.querySelector(`input[value="${val}"]`);
        if (cb) cb.checked = true;
      });
      
      const dropdownId = element.id;
      if (dropdownId) {
        updateMultiSelectDisplay(dropdownId, pathStr);
      }
    } else {
      // Single select
      const select = element.tagName === 'SELECT' ? element : element.querySelector('select');
      if (select) select.value = value;
    }
  } else if (inputControl === 'check-box') {
    const valuesToCheck = Array.isArray(value) ? value : [value];
    valuesToCheck.forEach(val => {
      const cb = element.querySelector(`input[value="${val}"]`);
      if (cb) cb.checked = true;
    });
  } else if (inputControl === 'radio-button') {
    const radio = element.querySelector(`input[value="${value}"]`);
    if (radio) radio.checked = true;
  } else if (inputControl === 'slider') {
    const input = element.querySelector('input[type="range"]');
    if (input) {
      input.value = value;
      const sliderId = element.id;
      if (sliderId) {
        updateSliderValue(pathStr, sliderId);
      }
    }
  }
  
  console.log(`  ✅ Value restored`);
}

/**
 * ✅ NEW: Helper functions to create HTML for each control type
 */
function createMultiSelectHTML(pathStr, escapedPath, enumValues, naValue, hasNAOption) {
  const dropdownId = `multiselect_${escapedPath}`;
  
  let html = `
    <div class="multi-select-container" id="${dropdownId}" data-dependent="true">
      <div class="multi-select-trigger" onclick="toggleMultiSelectDropdown('${dropdownId}')" tabindex="0">
        <div class="multi-select-selected" id="${dropdownId}_selected">
          <span class="multi-select-placeholder">-- Select --</span>
        </div>
      </div>
      <div class="multi-select-dropdown" id="${dropdownId}_dropdown">`;
  
  enumValues.forEach((item, idx) => {
    html += `
      <div class="multi-select-option">
        <input type="checkbox" id="${pathStr}_${idx}" value="${item.value}" 
               data-path="${pathStr}" data-dropdown="${dropdownId}"
               data-label="${item.label}"
               class="multi-select-checkbox"
               onchange="handleMultiSelectChange(event, '${pathStr}', '${dropdownId}')">
        <label for="${pathStr}_${idx}">${item.label}</label>
      </div>`;
  });
  
  if (hasNAOption) {
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
  
  html += `</div></div>`;
  return html;
}

function createSingleSelectHTML(pathStr, enumValues, naValue, hasNAOption) {
  let html = `<select data-path="${pathStr}" id="${pathStr}" data-dependent="true">
    <option value="">-- Select --</option>`;
  
  enumValues.forEach(item => {
    html += `<option value="${item.value}">${item.label}</option>`;
  });
  
  if (hasNAOption) {
    const naVal = typeof naValue === 'object' ? naValue.value : naValue;
    const naLabel = typeof naValue === 'object' ? naValue.label : naValue;
    html += `<option value="${naVal}">${naLabel}</option>`;
  }
  
  html += `</select>`;
  return html;
}

function createCheckboxHTML(pathStr, escapedPath, enumValues, naValue, hasNAOption) {
  const containerId = `checkbox_${escapedPath}`;
  
  let html = `<div class="checkbox-container" id="${containerId}" data-path="${pathStr}" data-dependent="true">`;
  
  enumValues.forEach((item, idx) => {
    html += `
      <label class="checkbox-option" for="${pathStr}_cb_${idx}">
        <input type="checkbox" id="${pathStr}_cb_${idx}" value="${item.value}" 
               data-path="${pathStr}" data-container="${containerId}"
               data-label="${item.label}"
               class="checkbox-input"
               onchange="handleCheckboxChange(event, '${pathStr}', '${containerId}')">
        <span>${item.label}</span>
      </label>`;
  });
  
  if (hasNAOption) {
    const naVal = typeof naValue === 'object' ? naValue.value : naValue;
    const naLabel = typeof naValue === 'object' ? naValue.label : naValue;
    
    html += `
      <label class="checkbox-option na-option" for="${pathStr}_cb_na">
        <input type="checkbox" id="${pathStr}_cb_na" value="${naVal}" 
               data-path="${pathStr}" data-container="${containerId}"
               data-label="${naLabel}"
               class="na-checkbox-input"
               onchange="handleCheckboxNAChange('${pathStr}', '${containerId}')">
        <span>${naLabel} (exclusive)</span>
      </label>`;
  }
  
  html += `</div>`;
  return html;
}

function createRadioHTML(pathStr, escapedPath, enumValues, naValue, hasNAOption) {
  const containerId = `radio_${escapedPath}`;
  
  let html = `<div class="radio-container" id="${containerId}" data-path="${pathStr}" data-dependent="true">`;
  
  enumValues.forEach((item, idx) => {
    html += `
      <label class="radio-option" for="${pathStr}_rb_${idx}">
        <input type="radio" id="${pathStr}_rb_${idx}" name="${pathStr}" value="${item.value}" 
               data-path="${pathStr}" 
               data-label="${item.label}"
               class="radio-input"
               onchange="handleRadioChange(event, '${pathStr}')">
        <span>${item.label}</span>
      </label>`;
  });
  
  if (hasNAOption) {
    const naVal = typeof naValue === 'object' ? naValue.value : naValue;
    const naLabel = typeof naValue === 'object' ? naValue.label : naValue;
    
    html += `
      <label class="radio-option na-option" for="${pathStr}_rb_na">
        <input type="radio" id="${pathStr}_rb_na" name="${pathStr}" value="${naVal}" 
               data-path="${pathStr}" 
               data-label="${naLabel}"
               class="radio-input"
               onchange="handleRadioChange(event, '${pathStr}')">
        <span>${naLabel}</span>
      </label>`;
  }
  
  html += `</div>`;
  return html;
}

function createSliderHTML(pathStr, escapedPath, enumValues) {
  let min = 0, max = 100, step = 1;
  
  if (enumValues.length > 0) {
    const numericValues = enumValues.map(v => Number(v.value)).filter(v => !isNaN(v));
    if (numericValues.length > 0) {
      min = Math.min(...numericValues);
      max = Math.max(...numericValues);
      if (numericValues.length > 1) {
        const sortedValues = numericValues.sort((a, b) => a - b);
        step = sortedValues[1] - sortedValues[0] || 1;
      }
    }
  }
  
  const sliderId = `slider_${escapedPath}`;
  
  return `
    <div class="slider-container" id="${sliderId}" data-dependent="true">
      <input type="range" name="${pathStr}" id="${pathStr}" data-path="${pathStr}" 
             class="slider-input" min="${min}" max="${max}" step="${step}" value="${min}"
             oninput="updateSliderValue('${pathStr}', '${sliderId}')">
      <div class="slider-value-display">
        <span id="${sliderId}_value">${min}</span>
      </div>
    </div>`;
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
    updateRadioOptions,
    updateSliderValue,
    updateMultiSelectDisplay,
    detectCurrentControlType,      // ✅ NEW
    rebuildControlWithType,        // ✅ NEW
    getCurrentControlValue,        // ✅ NEW
    restoreControlValue            // ✅ NEW    
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
    updateMultiSelectDisplay,
    detectCurrentControlType,      // ✅ NEW
    rebuildControlWithType,        // ✅ NEW
    getCurrentControlValue,        // ✅ NEW
    restoreControlValue            // ✅ NEW    
};

// ==== END OF FILE ====/
