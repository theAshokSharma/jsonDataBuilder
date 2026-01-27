// conditional-rules.js: Conditional rules implementation
// Handle conditional field logic and dependencies
// UPDATED: Enhanced to work with value/label pairs from options
// @ts-check
import { state, updateState } from './state.js';
import { resolveRef } from './file-validation.js';
import { updateSelectOptions,
         updateMultiSelectOptions,
         updateCheckboxOptions,
         updateRadioOptions,
         expandRangeValues,
         updateMultiSelectDisplay,
         detectCurrentControlType,
         rebuildControlWithType} from './input-control.js'
import { collectFormData } from './data-builder.js';

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

/**
 * IMPORTANT: getFieldValue always returns VALUES (not labels)
 * This is correct - conditional rules work with stored values
 */
function getFieldValue(fieldPath) {
  // Select dropdown - returns value attribute
  let input = document.querySelector(`select[data-path="${fieldPath}"]`);
  if (input) return input.value;
  
  // Text/email - returns value
  input = document.querySelector(`input[type="text"][data-path="${fieldPath}"], input[type="email"][data-path="${fieldPath}"]`);
  if (input) return input.value;
  
  // Number/slider - returns value
  input = document.querySelector(`input[type="number"][data-path="${fieldPath}"], input[type="range"][data-path="${fieldPath}"]`);
  if (input) return input.value ? Number(input.value) : null;
  
  // Date/datetime/time - returns value
  input = document.querySelector(`input[type="date"][data-path="${fieldPath}"], input[type="datetime-local"][data-path="${fieldPath}"], input[type="time"][data-path="${fieldPath}"]`);
  if (input) return input.value;
  
  // Radio buttons - returns value attribute
  input = document.querySelector(`input[type="radio"][data-path="${fieldPath}"]:checked`);
  if (input) return input.value;
  
  // Boolean checkbox - returns boolean
  input = document.querySelector(`input[type="checkbox"][data-path="${fieldPath}"]:not(.multi-select-checkbox):not(.na-checkbox):not(.checkbox-input):not(.na-checkbox-input)`);
  if (input) return input.checked;
  
  // Checkbox list - returns array of values
  const checkboxInputs = document.querySelectorAll(`[data-path="${fieldPath}"].checkbox-input:checked`);
  if (checkboxInputs.length > 0) {
    return Array.from(checkboxInputs).map(cb => cb.value);
  }
  
  // Checkbox N/A - returns value
  const checkboxNA = document.getElementById(fieldPath + '_cb_na');
  if (checkboxNA && checkboxNA.checked) {
    return checkboxNA.value;
  }
  
  // Multi-select dropdown N/A - returns value
  const naCheckbox = document.getElementById(fieldPath + '_na');
  if (naCheckbox && naCheckbox.checked) {
    return naCheckbox.value;
  }
  
  // Multi-select dropdown - returns array of values
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

/**
 * ENHANCED: Update options for a dependent field with input_control override support
 * Now supports overriding both input_control and response_type per dependency value
 * 
 * @param {string} pathStr - Field path
 * @param {string} depValue - Current value of dependency field
 * @param {HTMLElement} element - DOM element (select, container, etc)
 * @param {Object} rule - Rule configuration with optionsMap, defaultValues, etc
 * @param {Array} explicitValues - Optional explicit values to use (for initialization)
 */
function updateFieldOptions(pathStr, depValue, element, rule, explicitValues = null) {
  console.log(`🔄 Updating ${pathStr} based on dependency value: "${depValue}"`);
  
  // ✅ PHASE 2: Extract configuration with potential overrides
  let rawValues, inputControl, responseType;
  
  if (explicitValues !== null) {
    // Explicit values provided (initialization case)
    rawValues = explicitValues;
    inputControl = rule.inputControl || 'drop-down';
    responseType = rule.responseType || 'single-select';
  } else if (depValue && rule.optionsMap[depValue]) {
    const depConfig = rule.optionsMap[depValue];
    
    // ✅ Check if depConfig is an object with overrides or just an array
    if (typeof depConfig === 'object' && !Array.isArray(depConfig) && depConfig.values) {
      // Object format with overrides
      rawValues = depConfig.values;
      inputControl = depConfig.input_control || rule.inputControl || 'drop-down';
      responseType = depConfig.response_type || rule.responseType || 'single-select';
      
      console.log(`  ✅ Using overrides from dependent value config:`, {
        inputControl,
        responseType,
        valueCount: rawValues.length
      });
    } else {
      // Simple array format (backward compatible)
      rawValues = Array.isArray(depConfig) ? depConfig : [depConfig];
      inputControl = rule.inputControl || 'drop-down';
      responseType = rule.responseType || 'single-select';
      
      console.log(`  ℹ️ Using default control types (backward compatible)`);
    }
  } else {
    // Use defaults
    rawValues = rule.defaultValues || [];
    inputControl = rule.inputControl || 'drop-down';
    responseType = rule.responseType || 'single-select';
    
    console.log(`  ℹ️ Using default values (dependency not matched)`);
  }
  
  // Expand range values
  const enumValues = expandRangeValues(rawValues);
  const naValue = rule.na || null;
  const hasNAOption = naValue !== null;
  
  console.log(`  📊 Configuration:`, {
    inputControl,
    responseType,
    expandedValueCount: enumValues.length,
    hasNA: hasNAOption
  });
  
  // ✅ PHASE 2: Check if we need to rebuild the control type
  const currentControlType = detectCurrentControlType(element);
  const needsRebuild = currentControlType !== inputControl;
  
  if (needsRebuild) {
    console.log(`  🔨 Control type change detected: ${currentControlType} → ${inputControl}`);
    element = rebuildControlWithType(pathStr, element, inputControl, responseType, enumValues, naValue, hasNAOption);
    
    if (!element) {
      console.error(`  ❌ Failed to rebuild control for ${pathStr}`);
      return;
    }
    console.log(`  ✅ Control rebuilt successfully`);
  } else {
    // Just update options (existing logic)
    console.log(`  ↻ Updating options (same control type: ${inputControl})`);
    
    if (element.tagName === 'SELECT') {
      updateSelectOptions(element, enumValues, naValue, hasNAOption, pathStr);
    } else if (element.classList.contains('multi-select-container')) {
      updateMultiSelectOptions(element, enumValues, naValue, hasNAOption, pathStr);
    } else if (element.classList.contains('checkbox-container')) {
      updateCheckboxOptions(element, enumValues, naValue, hasNAOption, pathStr);
    } else if (element.classList.contains('radio-container')) {
      updateRadioOptions(element, enumValues, naValue, hasNAOption, pathStr);
    } else {
      console.warn(`  ⚠️ Unknown element type for ${pathStr}`);
    }
  }
  
  console.log(`  ✅ Update complete for ${pathStr}`);
}


/**
 * Reset a field's value to initial (empty)
 * Works with values (not labels)
 */
function resetFieldValue(pathStr) {
  const el = document.querySelector(`select[data-path="${pathStr}"][data-dependent="true"]`) ||
    document.querySelector(`.multi-select-container[data-dependent="true"][id^="multiselect_${pathStr.replace(/\./g, '_')}"]`);
  if (!el) return;

  if (el.tagName === 'SELECT') {
    el.value = '';
    console.log(`  🔄 Reset select ${pathStr} to empty`);
  } else {
    const checkboxes = el.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);
    updateMultiSelectDisplay(el.id, pathStr);
    console.log(`  🔄 Reset multi-select ${pathStr} to empty`);
  }
}

/**
 * Revalidate and set previously invalid values now that options may be available
 * Works with values (not labels)
 */
function revalidateAndSetInvalid(el, pathStr) {
  if (el.classList.contains('invalid-data')) {
    if (el.tagName === 'SELECT') {
      const invalidValue = el.dataset.invalidValue;
      if (invalidValue) {
        // Check if value now exists in options
        const optionExistsNow = Array.from(el.options).some(opt => opt.value === invalidValue);
        if (optionExistsNow) {
          el.value = invalidValue;
          el.classList.remove('invalid-data');
          delete el.dataset.invalidValue;
          removeInvalidWarning(el);
          
          // UPDATED: Enhanced logging
          const selectedOption = el.options[el.selectedIndex];
          const label = selectedOption ? selectedOption.textContent : invalidValue;
          console.log(`✓ Recovered invalid value for ${pathStr}: "${invalidValue}" (displays as: "${label}")`);
        }
      }
    } else { // multi-select
      const invalidValues = JSON.parse(el.dataset.invalidValues || '[]');
      if (invalidValues.length > 0) {
        let stillInvalid = [];
        let recovered = [];
        
        invalidValues.forEach(val => {
          // Find checkbox by value
          const matchingCb = Array.from(el.querySelectorAll('.multi-select-checkbox')).find(cb => cb.value === val);
          if (matchingCb) {
            matchingCb.checked = true;
            recovered.push(`"${val}" → "${matchingCb.dataset.label || val}"`);
          } else {
            stillInvalid.push(val);
          }
        });
        
        if (stillInvalid.length === 0) {
          el.classList.remove('invalid-data');
          delete el.dataset.invalidValues;
          removeInvalidWarning(el);
          updateMultiSelectDisplay(el.id, pathStr);
          console.log(`✓ Recovered invalid values for ${pathStr}: ${recovered.join(', ')}`);
        } else {
          el.dataset.invalidValues = JSON.stringify(stillInvalid);
          addInvalidMultiSelectWarning(el, stillInvalid, pathStr);
          console.log(`⚠️ Still invalid for ${pathStr}: ${stillInvalid.join(', ')}`);
        }
      }
    }
  }
}

/**
 * UPDATED: Initialize dependent fields with default values on form load
 * Properly handles value/label pairs
 */
function initializeDependentFields() {
  console.log('🔄 Initializing dependent fields with default values...');
  
  Object.entries(state.customOptions).forEach(([fieldPath, config]) => {
    if (config.dependent_values && typeof config.dependent_values === 'object') {
      const depField = Object.keys(config.dependent_values)[0];
      const depFieldValue = getFieldValue(depField); // Gets VALUE (not label)
      
      console.log(`  Checking dependent field: ${fieldPath}`);
      console.log(`    Depends on: ${depField} = ${depFieldValue}`);
      
      // Try to find the element (might not exist yet in tab-based forms)
      const element = findDependentFieldElement(fieldPath);
      
      if (!element) {
        console.log(`    ⏸️ Element not rendered yet (tab-based form) - will initialize on tab switch`);
        // Store the initialization data for later use when tab is rendered
        if (!state.pendingDependentInits) {
          state.pendingDependentInits = {};
        }
        state.pendingDependentInits[fieldPath] = {
          depField,
          config,
          depFieldValue
        };
        return;
      }
      
      // Element exists, initialize it now
      initializeSingleDependentField(fieldPath, depField, depFieldValue, config, element);
    }
  });
  
  console.log('✅ Dependent fields initialized');
}

/**
 * NEW: Initialize a single dependent field
 * Extracted for reuse when tabs are switched
 * UPDATED: Properly handles value/label pairs
 * ENHANCED: Initialize a single dependent field with inputControl support
 */
function initializeSingleDependentField(fieldPath, depField, depFieldValue, config, element) {
  let valuesToUse;
  
  // Get values based on current dependency value
  if (depFieldValue && config.dependent_values[depFieldValue]) {
    const depConfig = config.dependent_values[depFieldValue];
    
    // ✅ Handle both object and array formats
    if (typeof depConfig === 'object' && !Array.isArray(depConfig) && depConfig.values) {
      valuesToUse = depConfig.values;
      console.log(`    ✅ Using values with overrides for: "${depFieldValue}"`);
    } else {
      valuesToUse = Array.isArray(depConfig) ? depConfig : [depConfig];
      console.log(`    ✅ Using values for dependency value: "${depFieldValue}"`);
    }
  } else {
    valuesToUse = config.values || [];
    console.log(`    ℹ️ Using default values (dependency value not matched or empty)`);
  }
  
  // Create rule object with inputControl
  const rule = {
    affected: fieldPath,
    optionsMap: config.dependent_values,
    defaultValues: config.values || [],
    responseType: config.response_type || 'single-select',
    inputControl: config.input_control || 'drop-down', // ✅ ADD THIS LINE
    na: config.na
  };
  
  // Update field options (will handle overrides automatically)
  updateFieldOptions(fieldPath, depFieldValue || null, element, rule, valuesToUse);
}

/**
 * NEW: Initialize pending dependent fields after tab content is rendered
 * Call this after rendering tab content
 */
function initializePendingDependentFields() {
  if (!state.pendingDependentInits || Object.keys(state.pendingDependentInits).length === 0) {
    return;
  }
  
  console.log('🔄 Initializing pending dependent fields after tab render...');
  
  const stillPending = {};
  
  Object.entries(state.pendingDependentInits).forEach(([fieldPath, initData]) => {
    const element = findDependentFieldElement(fieldPath);
    
    if (element) {
      console.log(`  ✓ Initializing ${fieldPath}`);
      initializeSingleDependentField(
        fieldPath,
        initData.depField,
        initData.depFieldValue,
        initData.config,
        element
      );
    } else {
      // Still not rendered, keep it pending
      stillPending[fieldPath] = initData;
    }
  });
  
  // Update pending list
  state.pendingDependentInits = stillPending;
  
  console.log(`✅ Pending dependent fields processed (${Object.keys(stillPending).length} still pending)`);
}

/**
 * Find the DOM element for a dependent field
 */
function findDependentFieldElement(fieldPath) {
  let element = document.querySelector(`select[data-path="${fieldPath}"][data-dependent="true"]`);
  if (element) return element;
  
  const escapedPath = fieldPath.replace(/\./g, '_');
  element = document.querySelector(`.multi-select-container[data-dependent="true"][id^="multiselect_${escapedPath}"]`);
  if (element) return element;
  
  element = document.querySelector(`.checkbox-container[data-dependent="true"][id^="checkbox_${escapedPath}"]`);
  if (element) return element;
  
  element = document.querySelector(`.radio-container[data-dependent="true"][id^="radio_${escapedPath}"]`);
  if (element) return element;
  
  return null;
}


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
        
        // Handle dependency updates on change
        const changedPath = e.target.dataset.path;
        if (changedPath && state.triggersToAffected[changedPath]) {  
          const newValue = getFieldValue(changedPath); // Gets VALUE (not label)
          console.log(`  🔗 Trigger field changed: ${changedPath} = "${newValue}"`);
          
          state.triggersToAffected[changedPath].forEach(rule => { 
            const affected = rule.affected;
            const affectedEl = findDependentFieldElement(affected);
            
            if (affectedEl) {
              console.log(`    ↳ Updating dependent field: ${affected}`);
              
              if (!window.isPopulating) {
                resetFieldValue(affected);
              }
              
              // UPDATED: Pass null for explicitValues to use rule logic
              // updateFieldOptions will call expandRangeValues internally
              updateFieldOptions(affected, newValue, affectedEl, rule, null);
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
  
  // Initialize any pending dependent fields that are now rendered
  initializePendingDependentFields();
  
  setTimeout(() => applyConditionalRules(), 200);
}

export {
  applyConditionalRules,
  getFieldValue,
  attachEventListeners,
  initializeDependentFields,
  initializePendingDependentFields,
  revalidateAndSetInvalid,
  updateFieldOptions
};

//==== END OF FILE ====//