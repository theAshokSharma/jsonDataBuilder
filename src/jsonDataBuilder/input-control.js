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
  const disableValues = choiceConfig?.disable_values || [];
  
  console.log(`Creating input control: ${inputControl} for ${pathStr}`);
  
  switch (inputControl) {
    case 'drop-down':
      return createDropdownControl(pathStr, choiceConfig, isRequired, isDependent, depField, disableValues);
    
    case 'check-box':
      return createCheckboxControl(pathStr, choiceConfig, isRequired, isDependent, depField, disableValues);
    
    case 'radio-button':
      return createRadioButtonControl(pathStr, choiceConfig, isRequired, isDependent, depField, disableValues);
    
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
 * resolveExclusiveValues
 *
 * Resolves exclusive_values entries against the actual options list so that
 * the stored set always contains value-codes (e.g. "CK9908"), never raw
 * label strings (e.g. "N/A") or stale codes that no longer appear in the list.
 *
 * Background: before the value/label refactor, option lists were plain strings
 * ("N/A", "Unknown/Unsure") and exclusive_values matched those strings
 * directly.  After the refactor, option items became {value, label} objects
 * and the DOM <input value="…"> carries the CK code, not the label.
 * exclusive_values in the JSON were never updated, so label-based entries
 * stopped matching and exclusive behaviour silently broke.
 *
 * Resolution order for each entry in exclusiveValues:
 *   1. {value, label} object  → use .value directly (future-proof format)
 *   2. Plain string that is a known value-code in enumValues → keep as-is
 *   3. Plain string that matches a known label in enumValues → swap for its value-code
 *   4. No match found → keep as-is and warn (may belong to a dependent list
 *      populated later; the handler will simply never match it)
 *
 * @param {Array} exclusiveValues  - Raw exclusive_values from config
 * @param {Array} enumValues       - Expanded options [{value, label}, ...]
 * @returns {string[]} Resolved array of value-code strings
 */
function resolveExclusiveValues(exclusiveValues, enumValues) {
  if (!exclusiveValues || exclusiveValues.length === 0) return [];

  // Build lookup maps from the current options list
  const valueSet    = new Set(enumValues.map(item => String(item.value)));
  const labelToValue = new Map(enumValues.map(item => [String(item.label), String(item.value)]));

  return exclusiveValues.map(ev => {
    // 1. Object format {value, label} — introduced alongside the options refactor
    if (typeof ev === 'object' && ev !== null && 'value' in ev) {
      return String(ev.value);
    }
    const str = String(ev);
    // 2. Already a known value-code
    if (valueSet.has(str)) return str;
    // 3. Matches a label — resolve to its value-code
    if (labelToValue.has(str)) {
      const resolved = labelToValue.get(str);
      console.warn(
        `exclusive_values: "${str}" matched by label → resolved to value "${resolved}". ` +
        `Update the JSON to use "${resolved}" directly.`
      );
      return resolved;
    }
    // 4. Unknown — may be valid for a dependent list populated later; keep and warn
    console.warn(
      `exclusive_values: "${str}" not found as a value or label in the current options list. ` +
      `It will be kept as-is but may never match.`
    );
    return str;
  });
}

/**
 * Creates dropdown control (refactored from existing logic)
 */
function createDropdownControl(pathStr, choiceConfig, isRequired, isDependent, depField, disableValues) {
  const responseType = choiceConfig?.response_type || 'single-select';
  let rawValues = isDependent ? [] : (choiceConfig?.values || []);
  let enumValues = expandRangeValues(rawValues);
  
  const exclusiveValues = resolveExclusiveValues(
    choiceConfig?.exclusive_values || [],
    enumValues
  );

  updateState({
    exclusiveOptionsMap: {
      ...state.exclusiveOptionsMap,
      [pathStr]: exclusiveValues
    },
    disableOptionsMap: {
      ...state.disableOptionsMap,
      [pathStr]: disableValues
    }
  });
  
  if (responseType === 'multi-select') {
    return createMultiSelectDropdown(pathStr, enumValues, isDependent, depField, disableValues);
  } else {
    return createSingleSelectDropdown(pathStr, enumValues, isDependent, depField, disableValues, isRequired);
  }
}

/**
 * UPDATED: createMultiSelectDropdown with value/label support
 * Displays labels but stores values
 */
function createMultiSelectDropdown(pathStr, enumValues, isDependent, depField, disableValues) {
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
    const disabledValuesSet = new Set(
      (disableValues || []).map(e => normalizeDisabledOption(e).value)
    );
    
    enumValues.forEach((item, idx) => {
      const value = item.value;
      const label = item.label;
      if (disabledValuesSet.has(String(value))) {
        // This value is in disable_values — render it as disabled in-place.
        const doId = `${pathStr}_do_${String(value).toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        html += `
          <div class="multi-select-option">
            <input type="checkbox" id="${doId}" value="${value}"
                   data-path="${pathStr}" data-dropdown="${dropdownId}"
                   data-label="${label}"
                   class="multi-select-checkbox"
                   data-disable-option="true"
                   disabled
                   onchange="handleMultiSelectChange(event, '${pathStr}', '${dropdownId}')">
            <label for="${doId}" class="disable-option">${label}</label>
          </div>`;
      } else {
        html += `
          <div class="multi-select-option">
            <input type="checkbox" id="${pathStr}_${idx}" value="${value}" 
                   data-path="${pathStr}" data-dropdown="${dropdownId}"
                   data-label="${label}"
                   class="multi-select-checkbox"
                   onchange="handleMultiSelectChange(event, '${pathStr}', '${dropdownId}')">
            <label for="${pathStr}_${idx}">${label}</label>
          </div>`;
      }
    });
    
    // Add disable_values values that are NOT already in enumValues.
    filterNewDisabledOptions(disableValues, enumValues).forEach(entry => {
      const doVal   = normalizeDisabledOption(entry).value;
      const doLabel = normalizeDisabledOption(entry).label;
      const doId    = `${pathStr}_do_${doVal.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      html += `
        <div class="multi-select-option">
          <input type="checkbox" id="${doId}" value="${doVal}"
                 data-path="${pathStr}" data-dropdown="${dropdownId}"
                 data-label="${doLabel}"
                 class="multi-select-checkbox"
                 data-disable-option="true"
                 disabled
                 onchange="handleMultiSelectChange(event, '${pathStr}', '${dropdownId}')">
          <label for="${doId}" class="disable-option">${doLabel}</label>
        </div>`;
    });
  }
  
  html += '</div></div>';
  return html;
}

/**
 * UPDATED: createSingleSelectDropdown with value/label support
 */
function createSingleSelectDropdown(pathStr, enumValues, isDependent, depField, disableValues, isRequired) {
  let html = `<select name="${pathStr}" id="${pathStr}" data-path="${pathStr}" 
              ${isDependent ? `data-dependent="true" data-dep-field="${depField}"` : ''} 
              ${isRequired ? 'required' : ''}>
    <option value="">-- Select --</option>`;
  
  if (!isDependent) {
    const disabledValuesSet = new Set(
      (disableValues || []).map(e => normalizeDisabledOption(e).value)
    );
    
    html += enumValues.map(item => {
      if (disabledValuesSet.has(String(item.value))) {
        return `<option value="${item.value}" disabled class="disable-option" data-disable-option="true">${item.label}</option>`;
      }
      return `<option value="${item.value}">${item.label}</option>`;
    }).join('');
    
    // Add disable_values values that are NOT already in enumValues.
    filterNewDisabledOptions(disableValues, enumValues).forEach(entry => {
      const doVal   = normalizeDisabledOption(entry).value;
      const doLabel = normalizeDisabledOption(entry).label;
      html += `<option value="${doVal}" disabled class="disable-option" data-disable-option="true">${doLabel}</option>`;
    });
  }
  
  html += '</select>';
  return html;
}

// ==================== CHECKBOX CONTROL ====================
/**
 * FIXED: Creates checkbox list control with proper HTML structure
 * NOTE: response_type is IGNORED for checkbox control
 */
function createCheckboxControl(pathStr, choiceConfig, isRequired, isDependent, depField, disableValues) {
  let rawValues = isDependent ? [] : (choiceConfig?.values || []);
  let enumValues = expandRangeValues(rawValues);
  
  const exclusiveValues = resolveExclusiveValues(
    choiceConfig?.exclusive_values || [],
    enumValues
  );
  updateState({
    exclusiveOptionsMap: {
      ...state.exclusiveOptionsMap,
      [pathStr]: exclusiveValues
    },
    disableOptionsMap: {
      ...state.disableOptionsMap,
      [pathStr]: disableValues
    }
  });
  
  const containerId = 'checkbox_' + pathStr.replace(/\./g, '_');
  
  let html = `<div class="checkbox-container" id="${containerId}" data-path="${pathStr}" 
              ${isDependent ? `data-dependent="true" data-dep-field="${depField}"` : ''}>`;
  
  if (!isDependent) {
    const disabledValuesSet = new Set(
      (disableValues || []).map(e => normalizeDisabledOption(e).value)
    );
    
    enumValues.forEach((item, idx) => {
      if (disabledValuesSet.has(String(item.value))) {
        const doId = `${pathStr}_do_${String(item.value).toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        html += `
          <label class="checkbox-option disable-option" for="${doId}">
            <input type="checkbox" id="${doId}" value="${item.value}" 
                   data-path="${pathStr}" data-container="${containerId}"
                   data-label="${item.label}"
                   class="checkbox-input"
                   data-disable-option="true"
                   disabled
                   onchange="handleCheckboxChange(event, '${pathStr}', '${containerId}')">
            <span>${item.label}</span>
          </label>`;
      } else {
        html += `
          <label class="checkbox-option" for="${pathStr}_cb_${idx}">
            <input type="checkbox" id="${pathStr}_cb_${idx}" value="${item.value}" 
                   data-path="${pathStr}" data-container="${containerId}"
                   data-label="${item.label}"
                   class="checkbox-input"
                   onchange="handleCheckboxChange(event, '${pathStr}', '${containerId}')">
            <span>${item.label}</span>
          </label>`;
      }
    });
    
    // Add disable_values values that are NOT already in enumValues.
    filterNewDisabledOptions(disableValues, enumValues).forEach(entry => {
      const doVal   = normalizeDisabledOption(entry).value;
      const doLabel = normalizeDisabledOption(entry).label;
      const doId    = `${pathStr}_do_${doVal.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      html += `
        <label class="checkbox-option disable-option" for="${doId}">
          <input type="checkbox" id="${doId}" value="${doVal}" 
                 data-path="${pathStr}" data-container="${containerId}"
                 data-label="${doLabel}"
                 class="checkbox-input"
                 data-disable-option="true"
                 disabled
                 onchange="handleCheckboxChange(event, '${pathStr}', '${containerId}')">
          <span>${doLabel}</span>
        </label>`;
    });
  }
  
  html += '</div>';
  return html;
}

// ==================== RADIO BUTTON CONTROL ====================
/**
 * FIXED: Creates radio button control with proper HTML structure
 * NOTE: response_type is IGNORED for radio-button control
 */
function createRadioButtonControl(pathStr, choiceConfig, isRequired, isDependent, depField, disableValues) {
  let rawValues = isDependent ? [] : (choiceConfig?.values || []);
  let enumValues = expandRangeValues(rawValues);
  
  updateState({
    disableOptionsMap: {
      ...state.disableOptionsMap,
      [pathStr]: disableValues
    }
  });
  
  const containerId = 'radio_' + pathStr.replace(/\./g, '_');
  
  let html = `<div class="radio-container" id="${containerId}" data-path="${pathStr}" 
              ${isDependent ? `data-dependent="true" data-dep-field="${depField}"` : ''}>`;
  
  if (!isDependent) {
    const disabledValuesSet = new Set(
      (disableValues || []).map(e => normalizeDisabledOption(e).value)
    );
    
    enumValues.forEach((item, idx) => {
      if (disabledValuesSet.has(String(item.value))) {
        const doId = `${pathStr}_do_${String(item.value).toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        html += `
          <label class="radio-option disable-option" for="${doId}">
            <input type="radio" id="${doId}" name="${pathStr}" value="${item.value}" 
                   data-path="${pathStr}" 
                   data-label="${item.label}"
                   class="radio-input"
                   data-disable-option="true"
                   disabled
                   onchange="handleRadioChange(event, '${pathStr}')">
            <span>${item.label}</span>
          </label>`;
      } else {
        html += `
          <label class="radio-option" for="${pathStr}_rb_${idx}">
            <input type="radio" id="${pathStr}_rb_${idx}" name="${pathStr}" value="${item.value}" 
                   data-path="${pathStr}" 
                   data-label="${item.label}"
                   class="radio-input"
                   onchange="handleRadioChange(event, '${pathStr}')">
            <span>${item.label}</span>
          </label>`;
      }
    });
    
    // Add disable_values values that are NOT already in enumValues.
    filterNewDisabledOptions(disableValues, enumValues).forEach(entry => {
      const doVal   = normalizeDisabledOption(entry).value;
      const doLabel = normalizeDisabledOption(entry).label;
      const doId    = `${pathStr}_do_${doVal.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      html += `
        <label class="radio-option disable-option" for="${doId}">
          <input type="radio" id="${doId}" name="${pathStr}" value="${doVal}" 
                 data-path="${pathStr}" 
                 data-label="${doLabel}"
                 class="radio-input"
                 data-disable-option="true"
                 disabled
                 onchange="handleRadioChange(event, '${pathStr}')">
          <span>${doLabel}</span>
        </label>`;
    });
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
    const allCheckboxes = document.querySelectorAll(`[data-path="${path}"].checkbox-input`);
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
  
  allCheckboxes.forEach(cb => cb.checked = false);
  
  const valuesToCheck = Array.isArray(values) ? values : [values];
  let hasInvalidValues = false;
  const invalidValues = [];
  
  valuesToCheck.forEach(val => {
    const stringValue = String(val);
    
    const matchingCheckbox = Array.from(allCheckboxes).find(cb => String(cb.value) === stringValue);
    if (matchingCheckbox) {
      if (matchingCheckbox.dataset.disableOption && matchingCheckbox.disabled) {
        // Stored value is a disabled_option loaded into an enabled field.
        // Enable it temporarily so it shows as checked; re-disable after user unchecks.
        enableDisabledOptionForUncheck(matchingCheckbox, 'check-box', pathStr);
      } else {
        matchingCheckbox.checked = true;
      }
      console.log(`✓ Checked "${stringValue}" for ${pathStr} (label: ${matchingCheckbox.dataset.label || stringValue})`);
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
    if (radioButton.dataset.disableOption && radioButton.disabled) {
      // Stored value is a disabled_option loaded into an enabled field.
      // Enable temporarily for display; re-disable after user picks a real value.
      // No change event — this is a stored value, not a real user selection.
      enableDisabledOptionForUncheck(radioButton, 'radio-button', pathStr);
    } else {
      radioButton.checked = true;
      radioButton.dispatchEvent(new Event('change', { bubbles: true }));
    }
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

// ==================== DISABLED OPTIONS HELPERS ====================

/**
 * normalizeDisabledOption
 *
 * Normalises a disable_values entry to a {value, label} object.
 * An entry can be a plain string or a {value, label} object.
 *
 * @param {string|Object} entry
 * @returns {{ value: string, label: string }}
 */
function normalizeDisabledOption(entry) {
  if (typeof entry === 'object' && entry !== null && 'value' in entry) {
    return { value: String(entry.value), label: entry.label || String(entry.value) };
  }
  return { value: String(entry), label: String(entry) };
}

/**
 * filterNewDisabledOptions
 *
 * Returns only the disable_values entries whose value is NOT already present
 * in enumValues. Prevents duplicate entries when a schema author accidentally
 * lists a value in both "values" and "disable_values".
 *
 * @param {Array} disableValues - Raw disable_values from schema
 * @param {Array} enumValues      - Already-expanded regular options [{value, label}]
 * @returns {Array} Filtered disable_values entries
 */
function filterNewDisabledOptions(disableValues, enumValues) {
  const existingValues = new Set((enumValues || []).map(item => String(item.value)));
  return (disableValues || []).filter(entry => {
    const val = normalizeDisabledOption(entry).value;
    if (existingValues.has(val)) {
      console.warn(`disable_values: "${val}" already exists in values — skipping duplicate.`);
      return false;
    }
    return true;
  });
}

/**
 * enableDisabledOptionForUncheck
 *
 * Called when a populate function loads a disable_values value into an
 * ENABLED field. Temporarily enables the input so the stored value is
 * visible and checked. Attaches a one-time listener on the container so
 * that as soon as the user UNchecks it (or selects a different radio), the
 * input is re-disabled — making it impossible to re-select.
 *
 * Behaviour by control type:
 *   checkbox / multi-select : user can uncheck the option; on uncheck it
 *                             is re-disabled so it cannot be re-checked.
 *   radio-button            : user clicks another radio — the disabled radio
 *                             does NOT auto-uncheck (not part of browser's
 *                             mutual-exclusion group while disabled), so the
 *                             listener explicitly unchecks + re-disables it.
 *
 * @param {HTMLInputElement} input       - The disabled_option <input> element.
 * @param {string}           controlType - 'check-box' | 'multi-select' | 'radio-button'
 * @param {string}           pathStr     - data-path of the field (for display refresh).
 */
function enableDisabledOptionForUncheck(input, controlType, pathStr) {
  input.disabled = false;
  input.checked  = true;
  console.log(`⚠️ disabled_option "${input.value}" loaded into enabled ${controlType} "${pathStr}" — unlocked for display.`);

  const container = input.closest(
    '.multi-select-container, .checkbox-container, .radio-container'
  );
  if (!container) return;

  function onInteraction(e) {
    const changed = e.target;

    if (controlType === 'radio-button') {
      // Any radio change in the group (other than this input itself) means
      // the user has moved on. Re-lock the disabled option.
      if (changed === input) return; // User somehow clicked the same radio — ignore.
      if (changed.name !== input.name) return; // Different radio group — ignore.
      input.checked  = false;
      input.disabled = true;
      container.removeEventListener('change', onInteraction);
      console.log(`✓ Radio changed for "${pathStr}" — disabled_option "${input.value}" re-locked.`);
    } else {
      // checkbox / multi-select: re-lock when the user UNchecks this exact input.
      if (changed !== input) return;
      if (input.checked) return; // User checked something else — not our event.
      input.disabled = true;
      container.removeEventListener('change', onInteraction);
      if (controlType === 'multi-select') {
        updateMultiSelectDisplay(container.id, pathStr);
      }
      console.log(`✓ Unchecked disabled_option "${input.value}" for "${pathStr}" — re-locked.`);
    }
  }

  container.addEventListener('change', onInteraction);
}

/**
 * populateSingleSelect
 *
 * Populates a single-select <select> from loaded data.
 * disable_values values are always present in the DOM with `disabled` attribute.
 * JS can set select.value to a disabled <option> — it shows the stored value and
 * the user cannot re-select it via the dropdown once they pick something else.
 *
 * form-population.js should call this instead of setting select.value directly.
 *
 * @param {string}        pathStr - data-path of the field
 * @param {string|number} value   - The value to display
 */
function populateSingleSelect(pathStr, value) {
  const select = document.querySelector(`select[data-path="${pathStr}"]`);
  if (!select) {
    console.warn(`Select not found for ${pathStr}`);
    return;
  }

  const stringValue = String(value);
  const matchingOption = Array.from(select.options).find(o => o.value === stringValue);

  if (matchingOption) {
    // Works for both regular and disable_values — browser allows JS to set disabled <option>.
    select.value = stringValue;
    console.log(`✓ Set select ${pathStr} = "${stringValue}"${matchingOption.dataset.disableOption ? ' (disabled option — loaded from data)' : ''}`);
  } else {
    console.warn(`⚠ Value "${stringValue}" not found in options for ${pathStr}`);
  }
}

/**
 * populateMultiSelectDropdown
 *
 * Populates a multi-select dropdown container from loaded data.
 * Parallel to populateCheckboxList but for the multi-select control type.
 * When a disable_values value is found in the loaded data, routes through
 * enableDisabledOptionForUncheck so the user can uncheck it but not re-check it.
 *
 * form-population.js should call this for multi-select dropdowns.
 *
 * @param {string}          pathStr - data-path of the field
 * @param {string|string[]} values  - Value(s) to select
 */
function populateMultiSelectDropdown(pathStr, values) {
  const escapedPath   = pathStr.replace(/\./g, '_');
  const container     = document.getElementById(`multiselect_${escapedPath}`);

  if (!container) {
    console.warn(`Multi-select container not found for ${pathStr}`);
    return;
  }

  const dropdownId    = container.id;
  const allCheckboxes = container.querySelectorAll(`[data-path="${pathStr}"].multi-select-checkbox`);

  // Reset everything to a clean slate first.
  allCheckboxes.forEach(cb => cb.checked = false);

  const valuesToCheck = Array.isArray(values) ? values : [values];

  valuesToCheck.forEach(val => {
    const stringValue = String(val);
    const match = Array.from(allCheckboxes).find(cb => String(cb.value) === stringValue);
    if (match) {
      if (match.dataset.disableOption && match.disabled) {
        // disable_values value loaded into an enabled field — temporarily unlock.
        enableDisabledOptionForUncheck(match, 'multi-select', pathStr);
      } else {
        match.checked = true;
      }
      console.log(`✓ Checked "${stringValue}" for ${pathStr}${match.dataset.disableOption ? ' (disabled option)' : ''}`);
    } else {
      console.warn(`⚠ Option not found for value: "${stringValue}" in ${pathStr}`);
    }
  });

  updateMultiSelectDisplay(dropdownId, pathStr);
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
function updateSelectOptions(selectElement, enumValues, pathStr, disableValues) {
  selectElement.innerHTML = '<option value="">-- Select --</option>';
  
  enumValues.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.value;
    opt.textContent = item.label;
    selectElement.appendChild(opt);
  });
  
  // disable_values are always rendered but user cannot select them.
  filterNewDisabledOptions(disableValues, enumValues).forEach(entry => {
    const doVal   = normalizeDisabledOption(entry).value;
    const doLabel = normalizeDisabledOption(entry).label;
    const opt = document.createElement('option');
    opt.value = doVal;
    opt.textContent = doLabel;
    opt.disabled = true;
    opt.className = 'disable-option';
    opt.dataset.disableOption = 'true';
    selectElement.appendChild(opt);
  });
}

/**
 * Update options for multi-select dropdown
 */
function updateMultiSelectOptions(container, enumValues, pathStr, disableValues) {
  const dropdown = container.querySelector('.multi-select-dropdown');
  if (!dropdown) return;
  
  dropdown.innerHTML = '';
  
  const disabledValuesSet = new Set(
    (disableValues || []).map(e => normalizeDisabledOption(e).value)
  );
  
  enumValues.forEach((item, idx) => {
    const optionDiv = document.createElement('div');
    optionDiv.className = 'multi-select-option';
    if (disabledValuesSet.has(String(item.value))) {
      const doId = `${pathStr}_do_${String(item.value).toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      optionDiv.innerHTML = `
        <input type="checkbox" 
               id="${doId}" 
               value="${item.value}" 
               data-path="${pathStr}"
               data-dropdown="${container.id}"
               data-label="${item.label}"
               class="multi-select-checkbox"
               data-disable-option="true"
               disabled
               onchange="handleMultiSelectChange(event, '${pathStr}', '${container.id}')">
        <label for="${doId}" class="disable-option">${item.label}</label>
      `;
    } else {
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
    }
    dropdown.appendChild(optionDiv);
  });
  
  // Add disable_values values that are NOT already in enumValues.
  filterNewDisabledOptions(disableValues, enumValues).forEach(entry => {
    const doVal   = normalizeDisabledOption(entry).value;
    const doLabel = normalizeDisabledOption(entry).label;
    const doId    = `${pathStr}_do_${doVal.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const doDiv = document.createElement('div');
    doDiv.className = 'multi-select-option';
    doDiv.innerHTML = `
      <input type="checkbox" 
             id="${doId}" 
             value="${doVal}" 
             data-path="${pathStr}"
             data-dropdown="${container.id}"
             data-label="${doLabel}"
             class="multi-select-checkbox"
             data-disable-option="true"
             disabled
             onchange="handleMultiSelectChange(event, '${pathStr}', '${container.id}')">
      <label for="${doId}" class="disable-option">${doLabel}</label>
    `;
    dropdown.appendChild(doDiv);
  });
  
  updateMultiSelectDisplay(container.id, pathStr);
}

/**
 * FIXED: Update options for checkbox list
 */
function updateCheckboxOptions(container, enumValues, pathStr, disableValues) {
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
  
  filterNewDisabledOptions(disableValues, enumValues).forEach(entry => {
    const doVal   = normalizeDisabledOption(entry).value;
    const doLabel = normalizeDisabledOption(entry).label;
    const doId    = `${pathStr}_do_${doVal.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const label = document.createElement('label');
    label.className = 'checkbox-option disable-option';
    label.htmlFor = doId;
    label.innerHTML = `
      <input type="checkbox" 
             id="${doId}" 
             value="${doVal}" 
             data-path="${pathStr}"
             data-container="${containerId}"
             data-label="${doLabel}"
             class="checkbox-input"
             data-disable-option="true"
             disabled
             onchange="handleCheckboxChange(event, '${pathStr}', '${containerId}')">
      <span>${doLabel}</span>
    `;
    container.appendChild(label);
  });
}

/**
 * FIXED: Update options for radio button list
 */
function updateRadioOptions(container, enumValues, pathStr, disableValues) {
  container.innerHTML = '';
  
  const disabledValuesSet = new Set(
    (disableValues || []).map(e => normalizeDisabledOption(e).value)
  );
  
  enumValues.forEach((item, idx) => {
    const label = document.createElement('label');
    if (disabledValuesSet.has(String(item.value))) {
      const doId = `${pathStr}_do_${String(item.value).toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      label.className = 'radio-option disable-option';
      label.htmlFor = doId;
      label.innerHTML = `
        <input type="radio" 
               id="${doId}" 
               name="${pathStr}" 
               value="${item.value}" 
               data-path="${pathStr}"
               data-label="${item.label}"
               class="radio-input"
               data-disable-option="true"
               disabled
               onchange="handleRadioChange(event, '${pathStr}')">
        <span>${item.label}</span>
      `;
    } else {
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
    }
    container.appendChild(label);
  });
  
  // Add disable_values values that are NOT already in enumValues.
  filterNewDisabledOptions(disableValues, enumValues).forEach(entry => {
    const doVal   = normalizeDisabledOption(entry).value;
    const doLabel = normalizeDisabledOption(entry).label;
    const doId    = `${pathStr}_do_${doVal.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const label = document.createElement('label');
    label.className = 'radio-option disable-option';
    label.htmlFor = doId;
    label.innerHTML = `
      <input type="radio" 
             id="${doId}" 
             name="${pathStr}" 
             value="${doVal}" 
             data-path="${pathStr}"
             data-label="${doLabel}"
             class="radio-input"
             data-disable-option="true"
             disabled
             onchange="handleRadioChange(event, '${pathStr}')">
      <span>${doLabel}</span>
    `;
    container.appendChild(label);
  });
}

/**
 * Update multi-select display
 */
function updateMultiSelectDisplay(dropdownId, path) {
  const selectedContainer = document.getElementById(dropdownId + '_selected');
  if (!selectedContainer) return;
  
  // All checked checkboxes — including disable_values ones (same class) — are shown.
  const selectedCheckboxes = document.querySelectorAll(`[data-path="${path}"].multi-select-checkbox:checked`);
  
  selectedContainer.innerHTML = '';
  
  if (selectedCheckboxes.length > 0) {
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
 * @param {Array} disableValues - Values that are always present but not selectable by user
 * @returns {HTMLElement|null} New element or null if failed
 */
function rebuildControlWithType(pathStr, oldElement, inputControl, responseType, enumValues, disableValues) {
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
  
  // Create new control HTML — disableValues comes from the function parameter.
  const newControlHTML = createControlHTML(pathStr, inputControl, responseType, enumValues, disableValues);
  
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
 * @param {Array} disableValues - Values always in DOM but not selectable
 * @returns {string} HTML string
 */
function createControlHTML(pathStr, inputControl, responseType, enumValues, disableValues) {
  const escapedPath = pathStr.replace(/\./g, '_');
  
  switch (inputControl) {
    case 'drop-down':
      if (responseType === 'multi-select') {
        return createMultiSelectHTML(pathStr, escapedPath, enumValues, disableValues);
      } else {
        return createSingleSelectHTML(pathStr, enumValues, disableValues);
      }
    
    case 'check-box':
      return createCheckboxHTML(pathStr, escapedPath, enumValues, disableValues);
    
    case 'radio-button':
      return createRadioHTML(pathStr, escapedPath, enumValues, disableValues);
    
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
function createMultiSelectHTML(pathStr, escapedPath, enumValues, disableValues) {
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
  
  filterNewDisabledOptions(disableValues, enumValues).forEach(entry => {
    const doVal   = normalizeDisabledOption(entry).value;
    const doLabel = normalizeDisabledOption(entry).label;
    const doId    = `${pathStr}_do_${doVal.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    html += `
      <div class="multi-select-option">
        <input type="checkbox" id="${doId}" value="${doVal}" 
               data-path="${pathStr}" data-dropdown="${dropdownId}"
               data-label="${doLabel}"
               class="multi-select-checkbox"
               data-disable-option="true"
               disabled
               onchange="handleMultiSelectChange(event, '${pathStr}', '${dropdownId}')">
        <label for="${doId}" class="disable-option">${doLabel}</label>
      </div>`;
  });
  
  html += `</div></div>`;
  return html;
}

function createSingleSelectHTML(pathStr, enumValues, disableValues) {
  let html = `<select data-path="${pathStr}" id="${pathStr}" data-dependent="true">
    <option value="">-- Select --</option>`;
  
  enumValues.forEach(item => {
    html += `<option value="${item.value}">${item.label}</option>`;
  });
  
  // disable_values are always in the DOM; user cannot select them via UI.
  filterNewDisabledOptions(disableValues, enumValues).forEach(entry => {
    const doVal   = normalizeDisabledOption(entry).value;
    const doLabel = normalizeDisabledOption(entry).label;
    html += `<option value="${doVal}" disabled class="disable-option" data-disable-option="true">${doLabel}</option>`;
  });
  
  html += `</select>`;
  return html;
}

function createCheckboxHTML(pathStr, escapedPath, enumValues, disableValues) {
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
  
  filterNewDisabledOptions(disableValues, enumValues).forEach(entry => {
    const doVal   = normalizeDisabledOption(entry).value;
    const doLabel = normalizeDisabledOption(entry).label;
    const doId    = `${pathStr}_do_${doVal.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    html += `
      <label class="checkbox-option disable-option" for="${doId}">
        <input type="checkbox" id="${doId}" value="${doVal}" 
               data-path="${pathStr}" data-container="${containerId}"
               data-label="${doLabel}"
               class="checkbox-input"
               data-disable-option="true"
               disabled
               onchange="handleCheckboxChange(event, '${pathStr}', '${containerId}')">
        <span>${doLabel}</span>
      </label>`;
  });
  
  html += `</div>`;
  return html;
}

function createRadioHTML(pathStr, escapedPath, enumValues, disableValues) {
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
  
  filterNewDisabledOptions(disableValues, enumValues).forEach(entry => {
    const doVal   = normalizeDisabledOption(entry).value;
    const doLabel = normalizeDisabledOption(entry).label;
    const doId    = `${pathStr}_do_${doVal.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    html += `
      <label class="radio-option disable-option" for="${doId}">
        <input type="radio" id="${doId}" name="${pathStr}" value="${doVal}" 
               data-path="${pathStr}" 
               data-label="${doLabel}"
               class="radio-input"
               data-disable-option="true"
               disabled
               onchange="handleRadioChange(event, '${pathStr}')">
        <span>${doLabel}</span>
      </label>`;
  });
  
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
    populateSingleSelect,
    populateMultiSelectDropdown,
    expandRangeValues,
    normalizeDisabledOption,
    filterNewDisabledOptions,
    enableDisabledOptionForUncheck,
    updateSelectOptions,
    updateMultiSelectOptions,
    updateCheckboxOptions,
    updateRadioOptions,
    updateSliderValue,
    updateMultiSelectDisplay,
    detectCurrentControlType,
    rebuildControlWithType,
    getCurrentControlValue,
    restoreControlValue
  };
}

export {
    createInputControl,
    populateCheckboxList,
    populateRadioButton,
    populateSlider,
    populateSingleSelect,
    populateMultiSelectDropdown,
    createDefaultInput,
    expandRangeValues,
    normalizeDisabledOption,
    filterNewDisabledOptions,
    enableDisabledOptionForUncheck,
    updateSelectOptions,
    updateMultiSelectOptions,
    updateCheckboxOptions,
    updateRadioOptions,
    updateMultiSelectDisplay,
    detectCurrentControlType,
    rebuildControlWithType,
    getCurrentControlValue,
    restoreControlValue
};

// ==== END OF FILE ====/