// form-population.js - Functions for populating form fields with data
// UPDATED: Added polymorphic form detection and handling
import { state } from './state.js';
import { populateCheckboxList,
         populateRadioButton,
         populateSlider,
         updateMultiSelectDisplay} from './input-control.js'
import { resolveRef} from './file-validation.js'
import { applyConditionalRules } from './conditional-rules.js';


function populateFormWithData(data) {
  console.log('=== Starting data population ===');
  
  // NEW: Check if this is a polymorphic form
  const polymorphicSelector = document.getElementById('polymorphic-type-selector');
  
  if (polymorphicSelector) {
    console.log('🔍 Detected polymorphic form, attempting to match data structure');
    populatePolymorphicForm(data);
  } else {
    // Standard form population
    populateFields(data, []);
  }
  
  setTimeout(() => {
    applyConditionalRules();
    showInvalidFieldsSummary();
    console.log('✓ Form populated and rules applied');
  }, 300);
}

/**
 * NEW: Populates polymorphic forms by detecting which oneOf/anyOf option matches
 * @param {Object} data - Data to populate
 */
function populatePolymorphicForm(data) {
  console.log('🎯 Populating polymorphic form with data:', data);
  console.log('   Data keys:', Object.keys(data));
  
  const selector = document.getElementById('polymorphic-type-selector');
  const schema = state.currentSchema;
  const options = schema.oneOf || schema.anyOf || [];
  
  if (options.length === 0) {
    console.error('❌ No oneOf/anyOf options in schema');
    return;
  }
  
  console.log(`📋 Schema has ${options.length} options to check`);
  
  // Find which option matches the data structure
  let matchingIndex = -1;
  let matchingOption = null;
  
  for (let i = 0; i < options.length; i++) {
    let option = options[i];
    
    console.log(`  Checking option ${i}:`, option.title || option.$ref || 'Untitled');
    
    // Resolve $ref if present
    if (option.$ref) {
      const refPath = option.$ref;
      option = resolveRef(option.$ref, schema);
      console.log(`    Resolved $ref ${refPath} to:`, option?.title || 'object');
    }
    
    if (!option) {
      console.log(`    ⚠️ Could not resolve option ${i}`);
      continue;
    }
    
    // Check if data structure matches this option
    const matches = isDataMatchingSchema(data, option);
    console.log(`    Match result: ${matches}`);
    
    if (matches) {
      matchingIndex = i;
      matchingOption = option;
      console.log(`✅ Found matching option at index ${i}:`, option.title || 'Untitled');
      break;
    }
  }
  
  if (matchingIndex === -1) {
    console.error('❌ No matching schema option found for data structure');
    console.log('Data keys:', Object.keys(data));
    console.log('Available options:', options.map((o, i) => {
      const resolved = o.$ref ? resolveRef(o.$ref, schema) : o;
      return `  ${i}: ${o.title || resolved?.title || o.$ref || 'Untitled'}`;
    }).join('\n'));
    return;
  }
  
  // Set the selector to the matching option
  selector.value = matchingIndex;
  
  // Trigger change event to render the form structure
  const changeEvent = new Event('change', { bubbles: true });
  selector.dispatchEvent(changeEvent);
  
  console.log('⏳ Waiting for polymorphic form to render...');
  
  // Wait for form to render, then populate
  // Increased delay to ensure nested structures have time to render
  setTimeout(() => {
    console.log('📝 Form structure rendered, now populating fields');
    
    // Additional check: verify form elements are present
    const polymorphicContent = document.getElementById('polymorphic-content');
    if (!polymorphicContent || polymorphicContent.children.length === 0) {
      console.warn('⚠️ Polymorphic content not rendered yet, retrying...');
      setTimeout(() => populateFields(data, []), 300);
    } else {
      console.log(`✓ Found ${polymorphicContent.children.length} child elements in polymorphic content`);
      
      // NEW: Check for nested polymorphic selectors
      const nestedSelectors = polymorphicContent.querySelectorAll('.nested-polymorphic-selector');
      if (nestedSelectors.length > 0) {
        console.log(`🔍 Found ${nestedSelectors.length} nested polymorphic selector(s)`);
        console.log('   This is a nested polymorphic structure (e.g., groupRule with ALL_OF/ANY_OF)');
        
        // Handle nested polymorphic selection
        handleNestedPolymorphicData(data, nestedSelectors);
      } else {
        // No nested selectors, proceed with normal population
        populateFields(data, []);
      }
    }
  }, 500); // Increased from 200ms to 500ms
}

/**
 * NEW: Handles data population for nested polymorphic structures
 * Example: groupRule has oneOf with ALL_OF or ANY_OF options
 * 
 * @param {Object} data - Data to populate
 * @param {NodeList} nestedSelectors - Nested polymorphic selectors found
 */
function handleNestedPolymorphicData(data, nestedSelectors) {
  console.log('🎯 Handling nested polymorphic data structure');
  console.log('   Data keys:', Object.keys(data));
  
  // For each nested selector, find which option matches the data
  nestedSelectors.forEach((selector, selectorIndex) => {
    console.log(`📋 Processing nested selector ${selectorIndex}:`, selector.id);
    
    const options = Array.from(selector.options).slice(1); // Skip "-- Select --"
    console.log(`   Options available:`, options.map(o => o.textContent).join(', '));
    
    // Find which option key exists in data
    let matchingIndex = -1;
    for (let i = 0; i < options.length; i++) {
      const optionText = options[i].textContent;
      console.log(`   Checking option "${optionText}" against data keys...`);
      
      // Check if this option name matches any data key
      if (data.hasOwnProperty(optionText)) {
        matchingIndex = i;
        console.log(`   ✅ Match found: "${optionText}" exists in data`);
        break;
      }
    }
    
    if (matchingIndex !== -1) {
      const matchingOption = options[matchingIndex];
      selector.value = matchingOption.value;
      
      console.log(`   ✓ Setting nested selector to index ${matchingOption.value}: "${matchingOption.textContent}"`);
      
      // Trigger change event to render the nested form
      selector.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Wait for nested form to render, then populate
      setTimeout(() => {
        console.log('   📝 Nested form rendered, populating fields...');
        populateFields(data, []);
      }, 400);
    } else {
      console.error(`   ❌ No matching option found in nested selector`);
      console.log(`   Data has keys: ${Object.keys(data).join(', ')}`);
      console.log(`   Selector has options: ${options.map(o => o.textContent).join(', ')}`);
    }
  });
}

/**
 * NEW: Checks if data structure matches a schema option
 * @param {Object} data - Data to check
 * @param {Object} schema - Schema option to match against
 * @returns {boolean} True if structure matches
 */
function isDataMatchingSchema(data, schema) {
  console.log('      🔍 Matching data against schema...');
  console.log('        Data keys:', Object.keys(data));
  console.log('        Schema type:', schema.type);
  console.log('        Schema has oneOf:', !!schema.oneOf);
  console.log('        Schema has required:', schema.required);
  console.log('        Schema has properties:', !!schema.properties);
  
  // For groupRule pattern: check if data has ALL_OF or ANY_OF keys
  if (schema.oneOf) {
    console.log('        Checking nested oneOf options...');
    // Schema has nested oneOf (like groupRule with ALL_OF/ANY_OF options)
    for (let i = 0; i < schema.oneOf.length; i++) {
      const subOption = schema.oneOf[i];
      console.log(`          Sub-option ${i}:`, subOption.required);
      
      if (subOption.required && subOption.required.length > 0) {
        const requiredKey = subOption.required[0];
        if (data.hasOwnProperty(requiredKey)) {
          console.log(`          ✓ Match: Data has required key "${requiredKey}"`);
          return true;
        }
      }
      
      // Check properties
      if (subOption.properties) {
        const propKeys = Object.keys(subOption.properties);
        console.log(`          Sub-option properties:`, propKeys);
        if (propKeys.some(key => data.hasOwnProperty(key))) {
          console.log(`          ✓ Match: Data has property key from subOption`);
          return true;
        }
      }
    }
  }
  
  // For atomicRule pattern: check if data has all required fields
  if (schema.required && Array.isArray(schema.required)) {
    console.log('        Checking required fields:', schema.required);
    const hasAllRequired = schema.required.every(key => {
      const has = data.hasOwnProperty(key);
      console.log(`          "${key}": ${has}`);
      return has;
    });
    
    if (hasAllRequired) {
      console.log(`        ✓ Match: Data has all required fields`);
      return true;
    }
  }
  
  // Check if data keys match schema properties
  if (schema.properties) {
    const schemaKeys = Object.keys(schema.properties);
    const dataKeys = Object.keys(data);
    
    console.log('        Schema properties:', schemaKeys);
    console.log('        Data keys:', dataKeys);
    
    // Check if any data key matches a schema property
    const hasMatchingKey = dataKeys.some(key => schemaKeys.includes(key));
    if (hasMatchingKey) {
      console.log(`        ✓ Match: Data keys overlap with schema properties`);
      return true;
    }
  }
  
  console.log('        ✗ No match');
  return false;
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
  
  // ===== Check for checkbox container =====
  const checkboxContainer = document.getElementById(`checkbox_${escapedPath}`);
  if (checkboxContainer) {
    console.log(`Populating checkbox list for ${pathStr}`);
    populateCheckboxList(pathStr, value);
    return;
  }
  
  // ===== Check for radio container =====
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
      
      // UPDATED: Enhanced logging to show both value and label
      const selectedOption = input.options[input.selectedIndex];
      const displayLabel = selectedOption ? selectedOption.textContent : stringValue;
      console.log(`✓ Set select ${pathStr} = "${stringValue}" (displays as: "${displayLabel}")`);
    } else {
      console.warn(`⚠ Value "${stringValue}" not in dropdown for ${pathStr}`);
      
      // UPDATED: Enhanced logging to show available value/label pairs
      const availableOptions = Array.from(input.options)
        .filter(o => o.value) // Skip empty option
        .map(o => `"${o.value}" → "${o.textContent}"`)
        .join(', ');
      console.log(`Available options: ${availableOptions}`);
      
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
  
  // ===== Try slider =====
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
    
    console.log(`Values to check for ${pathStr}:`, valuesToCheck);
    
    let hasInvalidValues = false;
    const invalidValues = [];
    
    valuesToCheck.forEach(val => {
      const stringValue = String(val);
      
      // Check if it's the N/A checkbox
      if (naCheckbox && naCheckbox.value === stringValue) {
        naCheckbox.checked = true;
        
        // UPDATED: Enhanced logging with label
        const naLabel = naCheckbox.dataset.label || naCheckbox.value;
        console.log(`✓ Checked NA for ${pathStr}: value="${stringValue}", label="${naLabel}"`);
        return;
      }
      
      // UPDATED: Find and check the matching checkbox by VALUE (not label)
      const matchingCheckbox = Array.from(allCheckboxes).find(cb => String(cb.value) === stringValue);
      if (matchingCheckbox) {
        matchingCheckbox.checked = true;
        
        // UPDATED: Enhanced logging with label
        const label = matchingCheckbox.dataset.label || matchingCheckbox.value;
        console.log(`✓ Checked for ${pathStr}: value="${stringValue}", label="${label}"`);
      } else {
        hasInvalidValues = true;
        invalidValues.push(stringValue);
        console.warn(`⚠ Checkbox not found for value: "${stringValue}" in ${pathStr}`);
        
        // UPDATED: Enhanced logging to show available value/label pairs
        const available = Array.from(allCheckboxes).map(cb => 
          `"${cb.value}" → "${cb.dataset.label || cb.value}"`
        ).join(', ');
        console.log(`Available options: ${available}`);
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
    
    // Update display (will show labels)
    const dropdownId = container.id;
    updateMultiSelectDisplay(dropdownId, pathStr);
    console.log(`✓ Updated multi-select display for ${pathStr} (showing labels)`);
    
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
        
        // UPDATED: Enhanced logging with label
        const selectedOption = selectInput.options[selectInput.selectedIndex];
        const displayLabel = selectedOption ? selectedOption.textContent : stringValue;
        console.log(`✓ Set select (fallback) ${pathStr} = "${stringValue}" (displays as: "${displayLabel}")`);
      } else {
        console.warn(`⚠ Value "${stringValue}" not in dropdown for ${pathStr}`);
        
        // UPDATED: Enhanced logging to show available value/label pairs
        const availableOptions = Array.from(selectInput.options)
          .filter(o => o.value)
          .map(o => `"${o.value}" → "${o.textContent}"`)
          .join(', ');
        console.log(`Available options: ${availableOptions}`);
        
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
  console.log(`📋 Populating array of objects: ${pathStr}`, items);
  console.log(`   Data structure:`, JSON.stringify(items).substring(0, 200));
  
  // UPDATED: Try multiple strategies to find the array container
  const escapedPath = pathStr.replace(/\./g, '_');
  let container = document.getElementById('array_' + escapedPath);
  
  // Strategy 2: Try without 'array_' prefix (for some edge cases)
  if (!container) {
    container = document.getElementById(escapedPath);
  }
  
  // Strategy 3: Find by data-path attribute
  if (!container) {
    container = document.querySelector(`.array-container[data-path="${pathStr}"]`);
    if (container) {
      console.log(`✓ Found container by data-path attribute: ${container.id}`);
    }
  }
  
  // Strategy 4: Wait for container to appear (polymorphic forms may render slowly)
  if (!container) {
    console.log(`⏳ Container not found immediately, waiting for render...`);
    
    // Available containers for debugging
    const availableContainers = Array.from(document.querySelectorAll('.array-container'));
    console.log('Available array containers:', 
      availableContainers.map(el => `id="${el.id}" path="${el.dataset.path}"`).join(', ')
    );
    
    // Try again after a delay
    setTimeout(() => {
      const delayedContainer = document.querySelector(`.array-container[data-path="${pathStr}"]`) ||
                               document.getElementById('array_' + escapedPath);
      
      if (delayedContainer) {
        console.log(`✓ Found container after delay: ${delayedContainer.id}`);
        populateArrayOfObjectsDelayed(pathStr, items, delayedContainer);
      } else {
        console.error(`❌ Array container still not found for ${pathStr} after delay`);
        console.log('   This usually means the polymorphic type selector needs more time to render');
        console.log('   Available containers:', 
          Array.from(document.querySelectorAll('.array-container')).map(el => 
            `id="${el.id}" path="${el.dataset.path}"`
          )
        );
      }
    }, 300);
    
    return;
  }
  
  console.log(`✓ Found array container: ${container.id}`);
  populateArrayOfObjectsDelayed(pathStr, items, container);
}

/**
 * NEW: Separated helper function to populate array items
 * This allows retry logic with delays
 */
function populateArrayOfObjectsDelayed(pathStr, items, container) {
  console.log(`📝 Starting population of ${items.length} items in ${pathStr}...`);
  
  // Clear existing items
  const existingItems = container.querySelectorAll('.array-item');
  existingItems.forEach(item => item.remove());
  console.log(`🗑️ Cleared ${existingItems.length} existing items`);
  
  // Add items first, then populate them
  console.log(`➕ Adding ${items.length} array items...`);
  
  items.forEach((itemData, index) => {
    // Add the array item using the global function
    window.addArrayItem(pathStr);
    console.log(`  ✓ Added item ${index + 1}`);
  });
  
  // Wait for all items to be rendered, then populate
  setTimeout(() => {
    console.log('📝 Populating array item fields...');
    
    items.forEach((itemData, index) => {
      console.log(`  📝 Populating item ${index}:`, itemData);
      
      // For polymorphic array items, need to detect and set type first
      const itemContainer = container.querySelectorAll('.array-item')[index];
      if (itemContainer) {
        const typeSelector = itemContainer.querySelector('.array-item-type-selector');
        
        if (typeSelector) {
          console.log(`    🔍 Polymorphic array item detected at index ${index}`);
          
          // Find matching option for this item's data structure
          const options = Array.from(typeSelector.options).slice(1); // Skip first "-- Select Type --"
          let matchingOptionIndex = -1;
          
          // Try to match based on data keys
          for (let i = 0; i < options.length; i++) {
            const optionValue = options[i].value;
            // This is a simplified match - in real scenario might need schema lookup
            // For now, just set to first option if data exists
            if (Object.keys(itemData).length > 0) {
              matchingOptionIndex = optionValue;
              break;
            }
          }
          
          if (matchingOptionIndex !== -1) {
            typeSelector.value = matchingOptionIndex;
            typeSelector.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`    ✓ Set type selector to index ${matchingOptionIndex}`);
            
            // Wait for type-specific form to render
            setTimeout(() => {
              for (const [subKey, subValue] of Object.entries(itemData)) {
                const itemPath = `${pathStr}.${index}.${subKey}`;
                populateSingleField(itemPath, subValue);
              }
            }, 150);
          }
        } else {
          // Non-polymorphic array item - populate directly
          for (const [subKey, subValue] of Object.entries(itemData)) {
            const itemPath = `${pathStr}.${index}.${subKey}`;
            populateSingleField(itemPath, subValue);
          }
        }
      }
    });
    
    console.log('✅ Array population complete');
  }, 100 * items.length); // Longer delay for multiple items
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
  removeInvalidWarning,
  handleNestedPolymorphicData
};

// ==== END OF FILE ====//