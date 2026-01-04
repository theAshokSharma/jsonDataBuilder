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
 * Creates multi-select dropdown
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
    enumValues.forEach((val, idx) => {
      html += `
        <div class="multi-select-option">
          <input type="checkbox" id="${pathStr}_${idx}" value="${val}" 
                 data-path="${pathStr}" data-dropdown="${dropdownId}"
                 class="multi-select-checkbox"
                 onchange="handleMultiSelectChange(event, '${pathStr}', '${dropdownId}')">
          <label for="${pathStr}_${idx}">${val}</label>
        </div>`;
    });
    
    if (hasNAOption) {
      html += `
        <div class="multi-select-option na-option">
          <input type="checkbox" id="${pathStr}_na" value="${naValue}" 
                 data-path="${pathStr}" data-dropdown="${dropdownId}"
                 class="na-checkbox"
                 onchange="handleNAChange('${pathStr}', '${dropdownId}')">
          <label for="${pathStr}_na">${naValue} (exclusive)</label>
        </div>`;
    }
  }
  
  html += '</div></div>';
  return html;
}

/**
 * Creates single-select dropdown
 */
function createSingleSelectDropdown(pathStr, enumValues, isDependent, depField, hasNAOption, naValue, isRequired) {
  let html = `<select name="${pathStr}" id="${pathStr}" data-path="${pathStr}" 
              ${isDependent ? `data-dependent="true" data-dep-field="${depField}"` : ''} 
              ${isRequired ? 'required' : ''}>
    <option value="">-- Select --</option>`;
  
  if (!isDependent) {
    html += enumValues.map(val => `<option value="${val}">${val}</option>`).join('');
    if (hasNAOption) {
      html += `<option value="${naValue}">${naValue}</option>`;
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
    enumValues.forEach((val, idx) => {
      html += `
        <div class="checkbox-option">
          <input type="checkbox" id="${pathStr}_cb_${idx}" value="${val}" 
                 data-path="${pathStr}" data-container="${containerId}"
                 class="checkbox-input"
                 onchange="handleCheckboxChange(event, '${pathStr}', '${containerId}')">
          <label for="${pathStr}_cb_${idx}">${val}</label>
        </div>`;
    });
    
    if (hasNAOption) {
      html += `
        <div class="checkbox-option na-option">
          <input type="checkbox" id="${pathStr}_cb_na" value="${naValue}" 
                 data-path="${pathStr}" data-container="${containerId}"
                 class="na-checkbox-input"
                 onchange="handleCheckboxNAChange('${pathStr}', '${containerId}')">
          <label for="${pathStr}_cb_na">${naValue} (exclusive)</label>
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
  let enumValues = expandRangeValues(rawValues);
  
  const containerId = 'radio_' + pathStr.replace(/\./g, '_');
  
  let html = `<div class="radio-container" id="${containerId}" data-path="${pathStr}" 
              ${isDependent ? `data-dependent="true" data-dep-field="${depField}"` : ''}>`;
  
  if (!isDependent) {
    enumValues.forEach((val, idx) => {
      html += `
        <div class="radio-option">
          <input type="radio" id="${pathStr}_rb_${idx}" name="${pathStr}" value="${val}" 
                 data-path="${pathStr}" class="radio-input"
                 onchange="handleRadioChange(event, '${pathStr}')">
          <label for="${pathStr}_rb_${idx}">${val}</label>
        </div>`;
    });
    
    if (hasNAOption) {
      html += `
        <div class="radio-option na-option">
          <input type="radio" id="${pathStr}_rb_na" name="${pathStr}" value="${naValue}" 
                 data-path="${pathStr}" class="radio-input"
                 onchange="handleRadioChange(event, '${pathStr}')">
          <label for="${pathStr}_rb_na">${naValue}</label>
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
      console.log(`✓ Checked NA for ${pathStr}`);
      return;
    }
    
    const matchingCheckbox = Array.from(allCheckboxes).find(cb => String(cb.value) === stringValue);
    if (matchingCheckbox) {
      matchingCheckbox.checked = true;
      console.log(`✓ Checked ${stringValue} for ${pathStr}`);
    } else {
      hasInvalidValues = true;
      invalidValues.push(stringValue);
      console.warn(`⚠ Checkbox not found for value: "${stringValue}" in ${pathStr}`);
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
    console.log(`✓ Set radio ${pathStr} = ${stringValue}`);
  } else {
    console.warn(`⚠ Radio button value "${stringValue}" not found for ${pathStr}`);
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
    populateSlider
  };
}

export {
    createInputControl,
    populateCheckboxList,
    populateRadioButton,
    populateSlider,
    createDefaultInput,
    expandRangeValues
}