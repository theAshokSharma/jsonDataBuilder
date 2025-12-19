// data-builder.js - JSON data builder Web Version - Complete Rewrite

// Global variables
let currentSchema = null;
let formData = {};
let definitions = {};
let customChoices = {};
let conditionalRules = {};
let currentTab = null;
let tabContents = {};

// Initialize on page load
console.log('JSON Data Builder Loaded - Version 2.0');

// Button event listeners
document.getElementById('loadSchemaBtn').addEventListener('click', loadSchemaFromFile);
document.getElementById('loadChoicesBtn').addEventListener('click', loadChoicesFromFile);
document.getElementById('loadDataBtn').addEventListener('click', loadDataFromFile);
document.getElementById('saveBtn').addEventListener('click', () => {
  try {
    const data = collectFormData();
    saveJsonToFile(data);
  } catch (error) {
    console.error('Error saving data:', error);
    alert('Error saving data: ' + error.message);
  }
});
document.getElementById('exportBtn').addEventListener('click', () => {
  try {
    const data = collectFormData();
    exportJsonToClipboard(data);
  } catch (error) {
    console.error('Error exporting data:', error);
    alert('Error exporting data: ' + error.message);
  }
});

// ==================== FILE LOADING FUNCTIONS ====================

function loadSchemaFromFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const schema = JSON.parse(text);
      currentSchema = schema;
      definitions = schema.definitions || schema.$defs || {};
      renderForm(schema);
      console.log('✓ Schema loaded successfully');
    } catch (error) {
      alert('Invalid JSON schema file: ' + error.message);
      console.error('Schema load error:', error);
    }
  };
  
  input.click();
}

function loadChoicesFromFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const choices = JSON.parse(text);
      customChoices = choices;
      conditionalRules = choices.conditional_rules || {};
      
      if (currentSchema) {
        renderForm(currentSchema);
      }
      
      alert('Choices file loaded successfully');
      console.log('✓ Choices loaded with', Object.keys(customChoices).length, 'entries');
    } catch (error) {
      alert('Invalid JSON choices file: ' + error.message);
      console.error('Choices load error:', error);
    }
  };
  
  input.click();
}

function loadDataFromFile() {
  if (!currentSchema) {
    alert('Please load a schema first');
    return;
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';

  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      console.log('Loading data:', data);
      
      // CRITICAL FIX: Render all tabs before populating data
      renderAllTabs();
      
      // Give DOM time to render
      setTimeout(() => {
        populateFormWithData(data);
        alert('Data loaded and form populated successfully!');
        console.log('✓ Data loaded successfully');
      }, 100);
    } catch (error) {
      alert('Invalid JSON data file: ' + error.message);
      console.error('Data load error:', error);
    }
  };

  input.click();
}

function saveJsonToFile(data) {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'form-data-' + new Date().toISOString().split('T')[0] + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  console.log('✓ JSON saved to file');
}

async function exportJsonToClipboard(data) {
  const jsonString = JSON.stringify(data, null, 2);
  
  try {
    await navigator.clipboard.writeText(jsonString);
    alert('JSON copied to clipboard!');
    console.log('✓ JSON copied to clipboard');
  } catch (error) {
    const textarea = document.createElement('textarea');
    textarea.value = jsonString;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    alert('JSON copied to clipboard!');
    console.log('✓ JSON copied to clipboard (fallback)');
  }
}

// ==================== UTILITY FUNCTIONS ====================

function resolveRef(ref) {
  if (!ref || !ref.startsWith('#/')) return null;
  const path = ref.substring(2).split('/');
  let result = currentSchema;
  
  for (const key of path) {
    if (key === 'definitions' && !result[key] && result.$defs) {
      result = result.$defs;
    } else {
      result = result[key];
    }
    if (!result) return null;
  }
  return result;
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

function getFieldTypeFromSchema(fieldPath) {
  const keys = fieldPath.split('.');
  let current = currentSchema.properties;
  
  for (let i = 0; i < keys.length; i++) {
    if (!current || !current[keys[i]]) return 'string';
    
    const prop = current[keys[i]];
    
    if (prop.$ref) {
      const resolved = resolveRef(prop.$ref);
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

// ==================== FORM RENDERING ====================

function renderForm(schema) {
  const noSchema = document.getElementById('no-schema');
  const tabsContainer = document.getElementById('tabs-container');
  
  noSchema.style.display = 'none';
  document.getElementById('saveBtn').style.display = 'inline-block';
  document.getElementById('loadChoicesBtn').style.display = 'inline-block';
  document.getElementById('loadDataBtn').style.display = 'inline-block';    
  document.getElementById('exportBtn').style.display = 'inline-block';
  
  const properties = schema.properties || {};
  const required = schema.required || [];
  
  createTabs(properties);
  
  for (const [key, prop] of Object.entries(properties)) {
    const isRequired = required.includes(key);
    const tabContent = createTabContent(key, prop, isRequired, [key]);
    tabContents[key] = tabContent;
  }
  
  tabsContainer.style.display = 'block';
  
  if (Object.keys(properties).length > 0) {
    const firstTab = Object.keys(properties)[0];
    switchTab(firstTab);
  }
  
  attachEventListeners();
}

function createTabs(properties) {
  const tabsContainer = document.getElementById('form-tabs');
  const tabContentsContainer = document.getElementById('tab-contents');
  
  tabsContainer.innerHTML = '';
  tabContentsContainer.innerHTML = '';
  tabContents = {};
  
  Object.keys(properties).forEach((key) => {
    const prop = properties[key];
    const title = prop.title || key;
    
    const tabButton = document.createElement('button');
    tabButton.className = 'tab';
    tabButton.id = `tab-${key}`;
    tabButton.textContent = title;
    tabButton.addEventListener('click', () => switchTab(key));
    
    const tabContent = document.createElement('div');
    tabContent.className = 'tab-content';
    tabContent.id = `content-${key}`;
    
    const titleElement = document.createElement('h2');
    titleElement.textContent = title;
    tabContent.appendChild(titleElement);
    
    tabsContainer.appendChild(tabButton);
    tabContentsContainer.appendChild(tabContent);
  });
}

function createTabContent(key, prop, isRequired, path) {
  return createField(key, prop, isRequired, path);
}

function switchTab(tabKey) {
  if (currentTab) {
    const prevTabButton = document.getElementById(`tab-${currentTab}`);
    const prevTabContent = document.getElementById(`content-${currentTab}`);
    if (prevTabButton) prevTabButton.classList.remove('active');
    if (prevTabContent) prevTabContent.classList.remove('active');
  }
  
  const newTabButton = document.getElementById(`tab-${tabKey}`);
  const newTabContent = document.getElementById(`content-${tabKey}`);
  
  if (newTabButton && newTabContent) {
    newTabButton.classList.add('active');
    newTabContent.classList.add('active');
    
    if (newTabContent.children.length <= 1) {
      const div = document.createElement('div');
      div.innerHTML = tabContents[tabKey];
      newTabContent.appendChild(div.firstElementChild);
      
      setTimeout(() => attachEventListeners(), 100);
    }
    
    currentTab = tabKey;
  }
}

function renderAllTabs() {
  console.log('Rendering all tabs for data loading...');
  
  // Get all tab keys
  const tabKeys = Object.keys(tabContents);
  
  // Render each tab's content if not already rendered
  tabKeys.forEach(tabKey => {
    const tabContent = document.getElementById(`content-${tabKey}`);
    
    if (tabContent && tabContent.children.length <= 1) {
      // Tab content hasn't been rendered yet
      const div = document.createElement('div');
      div.innerHTML = tabContents[tabKey];
      tabContent.appendChild(div.firstElementChild);
      console.log(`✓ Rendered tab: ${tabKey}`);
    }
  });
  
  // Attach event listeners to all newly rendered elements
  attachEventListeners();
  
  console.log('✓ All tabs rendered');
}

function createField(key, prop, isRequired, path) {
  if (prop.$ref) {
    prop = resolveRef(prop.$ref);
    if (!prop) return '';
  }

  const type = prop.type;
  const title = prop.title || key;
  const description = prop.description || '';
  const pathStr = path.join('.');
  
  if (type === 'object' && prop.properties) {
    return createNestedObject(key, prop, isRequired, path);
  }
  
  if (type === 'array') {
    const items = prop.items;
    if (items && (items.type === 'object' || items.$ref)) {
      return createArrayOfObjects(key, prop, isRequired, path);
    }
  }

  let enumValues = [];
  let responseType = null;
  let hasNAOption = false;
  let naValue = null;
  
  const choiceConfig = customChoices[key] || customChoices[pathStr];
  
  if (choiceConfig && typeof choiceConfig === 'object' && !Array.isArray(choiceConfig)) {
    let rawValues = choiceConfig.values || [];
    enumValues = expandRangeValues(rawValues);
    responseType = choiceConfig.response_type || null;
    naValue = choiceConfig.na || null;
    hasNAOption = naValue !== null;
  } else if (Array.isArray(choiceConfig)) {
    enumValues = choiceConfig;
    responseType = type === 'array' ? 'multi-select' : 'single-select';
  } else {
    enumValues = prop.enum || [];
    responseType = type === 'array' ? 'multi-select' : 'single-select';
  }
  
  let inputHtml = '';

  if (enumValues.length > 0) {
    if (responseType === 'multi-select') {
      const dropdownId = 'multiselect_' + pathStr.replace(/\./g, '_');
      inputHtml = `
        <div class="multi-select-container" id="${dropdownId}">
          <div class="multi-select-trigger" onclick="toggleMultiSelectDropdown('${dropdownId}')" tabindex="0">
            <div class="multi-select-selected" id="${dropdownId}_selected">
              <span class="multi-select-placeholder">-- Select --</span>
            </div>
          </div>
          <div class="multi-select-dropdown" id="${dropdownId}_dropdown">
      `;
      
      enumValues.forEach((val, idx) => {
        inputHtml += `
          <div class="multi-select-option">
            <input type="checkbox" 
                   id="${pathStr}_${idx}" 
                   value="${val}" 
                   data-path="${pathStr}"
                   data-dropdown="${dropdownId}"
                   class="multi-select-checkbox"
                   onchange="handleMultiSelectChange('${pathStr}', '${dropdownId}')">
            <label for="${pathStr}_${idx}">${val}</label>
          </div>
        `;
      });
      
      if (hasNAOption) {
        inputHtml += `
          <div class="multi-select-option na-option">
            <input type="checkbox" 
                   id="${pathStr}_na" 
                   value="${naValue}" 
                   data-path="${pathStr}"
                   data-dropdown="${dropdownId}"
                   class="na-checkbox"
                   onchange="handleNAChange('${pathStr}', '${dropdownId}')">
            <label for="${pathStr}_na">${naValue} (exclusive)</label>
          </div>
        `;
      }
      
      inputHtml += `
          </div>
        </div>
      `;
    } else if (responseType === 'single-select') {
      inputHtml = `<select name="${pathStr}" id="${pathStr}" data-path="${pathStr}">
        <option value="">-- Select --</option>
        ${enumValues.map(val => `<option value="${val}">${val}</option>`).join('')}`;
      
      if (hasNAOption) {
        inputHtml += `<option value="${naValue}">${naValue}</option>`;
      }
      
      inputHtml += `</select>`;
    }
  } else {
    switch (type) {
      case 'string':
        if (prop.format === 'date') {
          inputHtml = `<input type="date" name="${pathStr}" id="${pathStr}" data-path="${pathStr}" ${isRequired ? 'required' : ''}>`;
        } else if (prop.format === 'email') {
          inputHtml = `<input type="email" name="${pathStr}" id="${pathStr}" data-path="${pathStr}" ${isRequired ? 'required' : ''}>`;
        } else if (prop.maxLength && prop.maxLength > 100) {
          inputHtml = `<textarea name="${pathStr}" id="${pathStr}" data-path="${pathStr}" ${isRequired ? 'required' : ''}></textarea>`;
        } else {
          inputHtml = `<input type="text" name="${pathStr}" id="${pathStr}" data-path="${pathStr}" ${isRequired ? 'required' : ''}>`;
        }
        break;
      case 'integer':
      case 'number':
        inputHtml = `<input type="number" name="${pathStr}" id="${pathStr}" data-path="${pathStr}"
          ${prop.minimum !== undefined ? `min="${prop.minimum}"` : ''}
          ${prop.maximum !== undefined ? `max="${prop.maximum}"` : ''}
          ${isRequired ? 'required' : ''}>`;
        break;
      case 'boolean':
        inputHtml = `<input type="checkbox" name="${pathStr}" id="${pathStr}" data-path="${pathStr}">`;
        break;
      case 'array':
        inputHtml = `<textarea name="${pathStr}" id="${pathStr}" data-path="${pathStr}" placeholder="Enter comma-separated values"></textarea>`;
        break;
      default:
        inputHtml = `<input type="text" name="${pathStr}" id="${pathStr}" data-path="${pathStr}" ${isRequired ? 'required' : ''}>`;
    }
  }

  return `
    <div class="form-group" data-field-path="${pathStr}">
      <label class="${isRequired ? 'required' : ''}">${title}</label>
      ${description ? `<div class="description">${description}</div>` : ''}
      ${inputHtml}
    </div>
  `;
}

function createNestedObject(key, prop, isRequired, path) {
  const title = prop.title || key;
  const description = prop.description || '';
  const pathStr = path.join('.');
  const properties = prop.properties || {};
  const required = prop.required || [];
  
  let fieldsHtml = '';
  for (const [subKey, subProp] of Object.entries(properties)) {
    const isSubRequired = required.includes(subKey);
    fieldsHtml += createField(subKey, subProp, isSubRequired, [...path, subKey]);
  }

  return `
    <div class="form-group" data-field-path="${pathStr}">
      <div class="nested-object">
        <div class="nested-object-header" onclick="toggleNested(this)">
          <span>${title}</span>
          ${isRequired ? '<span style="color: var(--vscode-errorForeground)">*</span>' : ''}
        </div>
        ${description ? `<div class="description">${description}</div>` : ''}
        <div class="nested-object-content">
          ${fieldsHtml}
        </div>
      </div>
    </div>
  `;
}

function createArrayOfObjects(key, prop, isRequired, path) {
  const title = prop.title || key;
  const description = prop.description || '';
  const pathStr = path.join('.');
  
  return `
    <div class="form-group" data-field-path="${pathStr}">
      <label class="${isRequired ? 'required' : ''}">${title}</label>
      ${description ? `<div class="description">${description}</div>` : ''}
      <div class="array-container" id="array_${pathStr}" data-path="${pathStr}">
        <div class="array-controls">
          <button onclick="addArrayItem('${pathStr}', ${JSON.stringify(prop.items).replace(/"/g, '&quot;')})">Add Item</button>
        </div>
      </div>
    </div>
  `;
}

// ==================== GLOBAL WINDOW FUNCTIONS ====================

window.toggleNested = function(header) {
  header.classList.toggle('collapsed');
  header.nextElementSibling.nextElementSibling.classList.toggle('collapsed');
};

window.addArrayItem = function(arrayPath, itemSchema) {
  itemSchema = typeof itemSchema === 'string' ? JSON.parse(itemSchema.replace(/&quot;/g, '"')) : itemSchema;
  
  if (itemSchema.$ref) {
    itemSchema = resolveRef(itemSchema.$ref);
  }
  
  const container = document.getElementById('array_' + arrayPath);
  const items = container.querySelectorAll('.array-item');
  const index = items.length;
  
  const properties = itemSchema.properties || {};
  const required = itemSchema.required || {};
  
  let fieldsHtml = '';
  for (const [subKey, subProp] of Object.entries(properties)) {
    const isSubRequired = required.includes(subKey);
    fieldsHtml += createField(subKey, subProp, isSubRequired, [...arrayPath.split('.'), index, subKey]);
  }
  
  const itemDiv = document.createElement('div');
  itemDiv.className = 'array-item';
  itemDiv.innerHTML = `
    <div class="array-item-header">
      <span class="array-item-title">Item ${index + 1}</span>
      <button class="remove-item-btn" onclick="removeArrayItem(this)">Remove</button>
    </div>
    ${fieldsHtml}
  `;
  
  container.insertBefore(itemDiv, container.querySelector('.array-controls'));
  attachEventListeners();
};

window.removeArrayItem = function(btn) {
  const item = btn.closest('.array-item');
  item.remove();
  const container = item.parentElement;
  const items = container.querySelectorAll('.array-item');
  items.forEach((item, idx) => {
    item.querySelector('.array-item-title').textContent = 'Item ' + (idx + 1);
  });
};

window.handleMultiSelectChange = function(path, dropdownId) {
  const changedCheckbox = event.target;
  const changedValue = changedCheckbox.value;
  
  const exclusiveOptions = ['Unknown/Unsure', 'None of the listed options', 'N/A'];
  
  if (exclusiveOptions.includes(changedValue) && changedCheckbox.checked) {
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

function updateMultiSelectDisplay(dropdownId, path) {
  const selectedContainer = document.getElementById(dropdownId + '_selected');
  if (!selectedContainer) return;
  
  const naCheckbox = document.getElementById(path + '_na');
  const selectedCheckboxes = document.querySelectorAll(`[data-path="${path}"].multi-select-checkbox:checked`);
  
  selectedContainer.innerHTML = '';
  
  if (naCheckbox && naCheckbox.checked) {
    const tag = document.createElement('span');
    tag.className = 'multi-select-tag';
    tag.textContent = naCheckbox.value;
    selectedContainer.appendChild(tag);
  } else if (selectedCheckboxes.length > 0) {
    selectedCheckboxes.forEach(cb => {
      const tag = document.createElement('span');
      tag.className = 'multi-select-tag';
      tag.textContent = cb.value;
      selectedContainer.appendChild(tag);
    });
  } else {
    const placeholder = document.createElement('span');
    placeholder.className = 'multi-select-placeholder';
    placeholder.textContent = '-- Select --';
    selectedContainer.appendChild(placeholder);
  }
}

document.addEventListener('click', function(event) {
  if (!event.target.closest('.multi-select-container')) {
    document.querySelectorAll('.multi-select-dropdown').forEach(dd => {
      dd.classList.remove('open');
    });
  }
});

// ==================== CONDITIONAL RULES ====================

function applyConditionalRules() {
  if (!conditionalRules || Object.keys(conditionalRules).length === 0) {
    return;
  }

  console.log('Applying conditional rules...');

  for (const [triggerField, conditions] of Object.entries(conditionalRules)) {
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

function getFieldValue(fieldPath) {
  let input = document.querySelector(`select[data-path="${fieldPath}"]`);
  if (input) {
    return input.value;
  }
  
  input = document.querySelector(`input[type="text"][data-path="${fieldPath}"], input[type="email"][data-path="${fieldPath}"]`);
  if (input) {
    return input.value;
  }
  
  input = document.querySelector(`input[type="number"][data-path="${fieldPath}"]`);
  if (input) {
    return input.value ? Number(input.value) : null;
  }
  
  input = document.querySelector(`input[type="checkbox"][data-path="${fieldPath}"]:not(.multi-select-checkbox):not(.na-checkbox)`);
  if (input) {
    return input.checked;
  }
  
  const naCheckbox = document.getElementById(fieldPath + '_na');
  if (naCheckbox && naCheckbox.checked) {
    return naCheckbox.value;
  }
  
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

// ==================== EVENT LISTENERS ====================

function attachEventListeners() {
  const inputs = document.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    if (!input.dataset.listenerAttached) {
      input.addEventListener('change', (e) => {
        console.log('Field changed:', input.dataset.path || input.name, 'Value:', input.value);
        formData = collectFormData();
        setTimeout(() => applyConditionalRules(), 100);
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
  
  setTimeout(() => applyConditionalRules(), 200);
}

// ==================== DATA COLLECTION ====================

function collectFormData() {
  const data = {};
  const inputs = document.querySelectorAll('[data-path]');
  const processedPaths = new Set();
  
  inputs.forEach(input => {
    const path = input.dataset.path;
    if (!path || processedPaths.has(path)) return;
    
    if (input.classList && input.classList.contains('na-checkbox')) {
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

// ==================== DATA POPULATION ====================

function populateFormWithData(data) {
  console.log('=== Starting data population ===');
  populateFields(data, []);
  
  setTimeout(() => {
    applyConditionalRules();
    console.log('✓ Form populated and rules applied');
  }, 300);
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
  
  // Try select dropdown
  let input = document.querySelector(`select[data-path="${pathStr}"]`);
  if (input) {
    const stringValue = String(value);
    const optionExists = Array.from(input.options).some(option => option.value === stringValue);
    if (optionExists) {
      input.value = stringValue;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      console.log(`✓ Set select ${pathStr} = ${stringValue}`);
    } else {
      console.warn(`Value "${stringValue}" not in dropdown for ${pathStr}`);
      console.log('Available options:', Array.from(input.options).map(o => o.value));
    }
    return;
  }
  
  // Try text/email input
  input = document.querySelector(`input[type="text"][data-path="${pathStr}"], input[type="email"][data-path="${pathStr}"]`);
  if (input) {
    input.value = String(value);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    console.log(`✓ Set text ${pathStr} = ${value}`);
    return;
  }
  
  // Try number input
  input = document.querySelector(`input[type="number"][data-path="${pathStr}"]`);
  if (input) {
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    console.log(`✓ Set number ${pathStr} = ${value}`);
    return;
  }
  
  // Try date input
  input = document.querySelector(`input[type="date"][data-path="${pathStr}"]`);
  if (input) {
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    console.log(`✓ Set date ${pathStr} = ${value}`);
    return;
  }
  
  // Try boolean checkbox
  input = document.querySelector(`input[type="checkbox"][data-path="${pathStr}"]:not(.multi-select-checkbox):not(.na-checkbox)`);
  if (input) {
    input.checked = value === true;
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
        console.warn(`⚠ Checkbox not found for value: "${stringValue}" in ${pathStr}`);
        console.log('Available checkbox values:', Array.from(allCheckboxes).map(cb => cb.value));
      }
    });
    
    // Update display
    const dropdownId = container.id;
    updateMultiSelectDisplay(dropdownId, pathStr);
    console.log(`✓ Updated display for ${pathStr}`);
    
  } else {
    console.warn(`⚠ No multi-select container found for ${pathStr}`);
    
    // Fallback to regular select
    const selectInput = document.querySelector(`select[data-path="${pathStr}"]`);
    if (selectInput) {
      const valueToSet = Array.isArray(values) ? values[0] : values;
      selectInput.value = String(valueToSet);
      selectInput.dispatchEvent(new Event('change', { bubbles: true }));
      console.log(`✓ Set select (fallback) ${pathStr} = ${valueToSet}`);
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
  let currentProp = currentSchema.properties;
  
  for (let i = 0; i < keys.length; i++) {
    if (currentProp[keys[i]]) {
      if (currentProp[keys[i]].$ref) {
        currentProp = resolveRef(currentProp[keys[i]].$ref);
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