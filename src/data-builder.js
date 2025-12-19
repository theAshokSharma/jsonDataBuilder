// data-builder.js - JSON data builder Web Version
let currentSchema = null;
let formData = {};
let customChoices = {};
let conditionalRules = {};
let fieldDependencies = {};

// Tab management
let currentTab = null;
let tabContents = {};
let loadedData = null; // Store loaded data for later population

// Initialize on page load
console.log('JSON data Builder Loaded - Console Working!');

// Button event listeners
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('loadSchemaBtn').addEventListener('click', loadSchemaFromFile);
    document.getElementById('loadChoicesBtn').addEventListener('click', loadChoicesFromFile);
    document.getElementById('loadDataBtn').addEventListener('click', loadDataFromFile);
    document.getElementById('saveBtn').addEventListener('click', () => {
        const data = collectFormData();
        saveJsonToFile(data);
    });
    document.getElementById('exportBtn').addEventListener('click', () => {
        const data = collectFormData();
        exportJsonToClipboard(data);
    });
});

// ============ FILE LOADING FUNCTIONS ============

/**
 * Load schema from JSON file
 */
function loadSchemaFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            currentSchema = JSON.parse(text);
            renderForm(currentSchema);
            console.log('Schema loaded successfully');
            
            // If we have loaded data already, populate it now
            if (loadedData) {
                setTimeout(() => populateFormWithData(loadedData), 100);
            }
        } catch (error) {
            alert('Invalid JSON schema file: ' + error.message);
            console.error('Schema load error:', error);
        }
    };
    
    input.click();
}

/**
 * Load choices from JSON file
 */
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
            
            initializeDependencies();
            
            if (currentSchema) {
                renderForm(currentSchema);
                // If we have loaded data already, populate it now
                if (loadedData) {
                    setTimeout(() => populateFormWithData(loadedData), 100);
                }
            }
            
            alert('Choices file loaded successfully');
            console.log('Choices loaded:', customChoices);
        } catch (error) {
            alert('Invalid JSON choices file: ' + error.message);
            console.error('Choices load error:', error);
        }
    };
    
    input.click();
}

/**
 * Save form data to JSON file
 */
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
    
    console.log('JSON saved to file');
}

/**
 * Export form data to clipboard
 */
async function exportJsonToClipboard(data) {
    const jsonString = JSON.stringify(data, null, 2);
    
    try {
        await navigator.clipboard.writeText(jsonString);
        alert('JSON copied to clipboard!');
        console.log('JSON copied to clipboard');
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
    }
}

/**
 * Resolve JSON schema $ref references
 */
function resolveRef(ref) {
    if (!ref || !ref.startsWith('#/')) return null;
    const path = ref.substring(2).split('/');
    let result = currentSchema;
    
    for (const key of path) {
        if (key === 'definitions' && !result[key] && result.$defs) {
            result = result.$defs;
        } else if (result[key]) {
            result = result[key];
        } else {
            return null;
        }
    }
    return result;
}

// ============ FORM RENDERING FUNCTIONS ============

/**
 * Main form rendering function
 */
function renderForm(schema) {
    const noSchema = document.getElementById('no-schema');
    const tabsContainer = document.getElementById('tabs-container');
    
    // Show save/export buttons
    noSchema.style.display = 'none';
    ['saveBtn', 'loadChoicesBtn', 'loadDataBtn', 'exportBtn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'inline-block';
    });
    
    const properties = schema.properties || {};
    const required = schema.required || [];
    
    // Initialize formData with empty structure
    if (!formData) {
        formData = {};
        const properties = schema.properties || {};
        Object.keys(properties).forEach(key => {
            formData[key] = {};
        });
    }
    
    initializeDependencies();
    createTabs(properties);
    
    // Clear tabContents
    tabContents = {};
    
    // Create tab content for each property
    for (const [key, prop] of Object.entries(properties)) {
        const isRequired = required.includes(key);
        tabContents[key] = createTabContent(key, prop, isRequired, [key]);
    }
    
    tabsContainer.style.display = 'block';
    
    // Activate first tab and render its content immediately
    if (Object.keys(properties).length > 0) {
        const firstTab = Object.keys(properties)[0];
        switchTab(firstTab, true); // Force render content
    }
    
    attachEventListeners();
}

/**
 * Create tabs for each top-level property
 */
function createTabs(properties) {
    const tabsContainer = document.getElementById('form-tabs');
    const tabContentsContainer = document.getElementById('tab-contents');
    
    // Clear existing content
    tabsContainer.innerHTML = '';
    tabContentsContainer.innerHTML = '';
    
    // Create tab for each property
    Object.keys(properties).forEach(key => {
        const prop = properties[key];
        const title = prop.title || key;
        
        // Tab button
        const tabButton = document.createElement('button');
        tabButton.className = 'tab';
        tabButton.id = `tab-${key}`;
        tabButton.textContent = title;
        tabButton.addEventListener('click', () => switchTab(key));
        
        // Tab content container
        const tabContent = document.createElement('div');
        tabContent.className = 'tab-content';
        tabContent.id = `content-${key}`;
        
        // Title
        const titleElement = document.createElement('h2');
        titleElement.textContent = title;
        tabContent.appendChild(titleElement);
        
        tabsContainer.appendChild(tabButton);
        tabContentsContainer.appendChild(tabContent);
    });
}

/**
 * Create content for a tab
 */
function createTabContent(key, prop, isRequired, path) {
    return createField(key, prop, isRequired, path);
}

/**
 * Switch between tabs
 */
function switchTab(tabKey, forceRender = false) {
    // Remove active class from current tab
    if (currentTab) {
        document.getElementById(`tab-${currentTab}`)?.classList.remove('active');
        document.getElementById(`content-${currentTab}`)?.classList.remove('active');
    }
    
    // Add active class to new tab
    const newTabButton = document.getElementById(`tab-${tabKey}`);
    const newTabContent = document.getElementById(`content-${tabKey}`);
    
    if (newTabButton && newTabContent) {
        newTabButton.classList.add('active');
        newTabContent.classList.add('active');
        
        // Render content if not already rendered or if forceRender is true
        if (newTabContent.children.length <= 1 || forceRender) {
            const div = document.createElement('div');
            div.innerHTML = tabContents[tabKey] || '';
            // Remove existing form content if present
            const existingForm = newTabContent.querySelector('.form-content');
            if (existingForm) {
                existingForm.remove();
            }
            // Add new form content
            if (div.firstElementChild) {
                div.firstElementChild.className = 'form-content';
                newTabContent.appendChild(div.firstElementChild);
            }
            
            // Re-attach event listeners
            setTimeout(() => {
                attachEventListeners();
                // If we have loaded data, populate fields in this tab
                if (loadedData && loadedData[tabKey]) {
                    populateTabData(tabKey, loadedData[tabKey], [tabKey]);
                }
            }, 50);
        }
        
        currentTab = tabKey;
    }
}

/**
 * Populate data for a specific tab
 */
function populateTabData(tabKey, tabData, parentPath = []) {
    console.log(`Populating tab: ${tabKey}`, tabData);
    
    // Collect all fields in this tab
    const fieldsToPopulate = [];
    
    function collectFields(obj, currentPath) {
        for (const [key, value] of Object.entries(obj)) {
            const fieldPath = [...currentPath, key];
            const pathStr = fieldPath.join('.');
            
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                collectFields(value, fieldPath);
            } else if (Array.isArray(value)) {
                if (value.length > 0 && typeof value[0] === 'object') {
                    fieldsToPopulate.push({ path: pathStr, value, type: 'array-objects' });
                } else {
                    fieldsToPopulate.push({ path: pathStr, value, type: 'array' });
                }
            } else {
                fieldsToPopulate.push({ path: pathStr, value, type: 'simple' });
            }
        }
    }
    
    if (tabData) {
        collectFields(tabData, parentPath);
        
        // Sort fields: non-dependent first
        fieldsToPopulate.sort((a, b) => {
            const aIsDependent = customChoices[a.path]?.dependent_values;
            const bIsDependent = customChoices[b.path]?.dependent_values;
            return (aIsDependent ? 1 : 0) - (bIsDependent ? 1 : 0);
        });
        
        // Populate fields
        fieldsToPopulate.forEach(field => {
            if (field.type === 'array-objects') {
                setTimeout(() => populateArrayOfObjects(field.path, field.value), 10);
            } else if (field.type === 'array') {
                setTimeout(() => populateArrayField(field.path, field.value), 10);
            } else {
                setTimeout(() => populateSingleField(field.path, field.value), 10);
            }
        });
    }
}

/**
 * Create form field based on schema property
 */
/**
 * Create form field based on schema property
 */
function createField(key, prop, isRequired, path) {
    // Resolve $ref if present
    if (prop.$ref) {
        prop = resolveRef(prop.$ref);
        if (!prop) return '';
    }

    const type = prop.type;
    const title = prop.title || key;
    const description = prop.description || '';
    const pathStr = path.join('.');
    
    // Handle different field types
    if (type === 'object' && prop.properties) {
        return createNestedObject(key, prop, isRequired, path);
    }
    
    if (type === 'array') {
        const items = prop.items;
        if (items && (items.type === 'object' || items.$ref)) {
            return createArrayOfObjects(key, prop, isRequired, path);
        }
    }

    // Get dynamic values for this field
    let dynamicConfig = getDynamicValues(pathStr);
    
    let values = [];
    let responseType = null;
    let hasNAOption = false;
    let naValue = null;
    
    if (dynamicConfig && typeof dynamicConfig === 'object' && !Array.isArray(dynamicConfig)) {
        // Use dynamic values from config
        values = dynamicConfig.values || [];
        responseType = dynamicConfig.response_type || prop._responseType || null;
        naValue = dynamicConfig.na || null;
        hasNAOption = naValue !== null;
    } else if (prop.enum) {
        // Use schema enum
        values = prop.enum;
        responseType = prop._responseType || (type === 'array' ? 'multi-select' : 'single-select');
    }
    
    console.log(`Creating field ${pathStr} with values:`, values, 'responseType:', responseType);
    
    // Generate input HTML based on field type and values
    let inputHtml = generateInputHtml(pathStr, values, responseType, hasNAOption, naValue, type, prop, isRequired);
    
    return `
    <div class="form-group" data-field-path="${pathStr}">
        <label class="${isRequired ? 'required' : ''}">${title}</label>
        ${description ? `<div class="description">${description}</div>` : ''}
        ${inputHtml}
    </div>
    `;
}
/**
 * Get all possible values from a choice config including dependent values
 */
function getAllPossibleValues(choiceConfig) {
    if (!choiceConfig) return [];
    
    const allValues = new Set();
    
    // Add base values
    if (choiceConfig.values) {
        choiceConfig.values.forEach(val => allValues.add(val));
    }
    
    // Add values from all dependencies
    if (choiceConfig.dependent_values) {
        Object.values(choiceConfig.dependent_values).forEach(depMap => {
            Object.values(depMap).forEach(values => {
                values.forEach(val => allValues.add(val));
            });
        });
    }
    
    return Array.from(allValues);
}

/**
 * Generate HTML for different input types
 */
function generateInputHtml(pathStr, values, responseType, hasNAOption, naValue, type, prop, isRequired) {
    if (values.length > 0 && (responseType === 'multi-select' || responseType === 'single-select')) {
        if (responseType === 'multi-select') {
            const dropdownId = 'multiselect_' + pathStr.replace(/\./g, '_');
            return generateMultiSelectHtml(pathStr, values, dropdownId, hasNAOption, naValue);
        } else {
            return generateSelectHtml(pathStr, values, hasNAOption, naValue);
        }
    } else {
        // Generate standard input based on type
        switch (type) {
            case 'string':
                if (prop.format === 'date') {
                    return `<input type="date" name="${pathStr}" id="${pathStr}" data-path="${pathStr}" ${isRequired ? 'required' : ''}>`;
                } else if (prop.format === 'email') {
                    return `<input type="email" name="${pathStr}" id="${pathStr}" data-path="${pathStr}" ${isRequired ? 'required' : ''}>`;
                } else if (prop.maxLength && prop.maxLength > 100) {
                    return `<textarea name="${pathStr}" id="${pathStr}" data-path="${pathStr}" ${isRequired ? 'required' : ''}></textarea>`;
                }
                return `<input type="text" name="${pathStr}" id="${pathStr}" data-path="${pathStr}" ${isRequired ? 'required' : ''}>`;
            
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
}

/**
 * Generate multi-select HTML
 */
function generateMultiSelectHtml(pathStr, values, dropdownId, hasNAOption, naValue) {
    let html = `
    <div class="multi-select-container" id="${dropdownId}">
        <div class="multi-select-trigger" onclick="toggleMultiSelectDropdown('${dropdownId}')" tabindex="0">
            <div class="multi-select-selected" id="${dropdownId}_selected">
                <span class="multi-select-placeholder">-- Select --</span>
            </div>
        </div>
        <div class="multi-select-dropdown" id="${dropdownId}_dropdown">`;
    
    values.forEach((val, idx) => {
        html += `
        <div class="multi-select-option">
            <input type="checkbox" 
                id="${pathStr}_${idx}" 
                value="${val}" 
                data-path="${pathStr}"
                data-dropdown="${dropdownId}"
                class="multi-select-checkbox">
            <label for="${pathStr}_${idx}">${val}</label>
        </div>`;
    });
    
    if (hasNAOption) {
        html += `
        <div class="multi-select-option na-option">
            <input type="checkbox" 
                id="${pathStr}_na" 
                value="${naValue}" 
                data-path="${pathStr}"
                data-dropdown="${dropdownId}"
                class="na-checkbox">
            <label for="${pathStr}_na">${naValue} (exclusive)</label>
        </div>`;
    }
    
    html += `</div></div>`;
    return html;
}

/**
 * Generate select dropdown HTML
 */
function generateSelectHtml(pathStr, values, hasNAOption, naValue) {
    let html = `<select name="${pathStr}" id="${pathStr}" data-path="${pathStr}">
        <option value="">-- Select --</option>`;
    
    values.forEach(val => {
        html += `<option value="${val}">${val}</option>`;
    });
    
    if (hasNAOption) {
        html += `<option value="${naValue}">${naValue}</option>`;
    }
    
    html += `</select>`;
    return html;
}

/**
 * Create nested object field
 */
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

/**
 * Create array of objects field
 */
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

// ============ DEPENDENCY MANAGEMENT FUNCTIONS ============

/**
 * Initialize field dependencies from custom choices
 */
function initializeDependencies() {
    fieldDependencies = {};
    let visited = new Set(); // Track visited fields to prevent cycles
    
    function addDependency(dependentField, dependencyField, visitedPath = new Set()) {
        // Check for cycles
        if (visitedPath.has(dependentField)) {
            console.warn(`Cycle detected in dependencies: ${Array.from(visitedPath).join(' -> ')} -> ${dependentField}`);
            return;
        }
        
        visitedPath.add(dependentField);
        
        if (!fieldDependencies[dependencyField]) {
            fieldDependencies[dependencyField] = [];
        }
        
        if (!fieldDependencies[dependencyField].includes(dependentField)) {
            fieldDependencies[dependencyField].push(dependentField);
        }
        
        // Check if this dependent field has its own dependencies
        const dependentConfig = customChoices[dependentField];
        if (dependentConfig?.dependent_values) {
            for (const [nextDependencyField] of Object.entries(dependentConfig.dependent_values)) {
                addDependency(dependentField, nextDependencyField, new Set(visitedPath));
            }
        }
    }
    
    // Build dependency tree
    for (const [fieldKey, config] of Object.entries(customChoices)) {
        if (config?.dependent_values) {
            for (const [dependencyField] of Object.entries(config.dependent_values)) {
                addDependency(fieldKey, dependencyField);
            }
        }
    }
    
    console.log('Field dependencies initialized:', fieldDependencies);
}

/**
 * Update fields that depend on the changed field
 */
function updateDependentFields(changedFieldPath) {
    console.log(`Field changed: ${changedFieldPath}. Updating dependent fields...`);
    
    const dependentFields = fieldDependencies[changedFieldPath] || [];
    const processed = new Set(); // Track processed fields to prevent loops
    
    function processField(fieldKey) {
        if (processed.has(fieldKey)) {
            console.log(`Skipping already processed field: ${fieldKey}`);
            return;
        }
        
        processed.add(fieldKey);
        console.log(`Processing dependent field: ${fieldKey}`);
        
        // Only refresh if this field actually has dependent_values config
        const config = customChoices[fieldKey];
        if (config?.dependent_values) {
            // Check if the changed field is actually a dependency of this field
            if (config.dependent_values[changedFieldPath]) {
                console.log(`Refreshing ${fieldKey} because it depends on ${changedFieldPath}`);
                refreshFieldWithDependencies(fieldKey);
            } else {
                console.log(`Field ${fieldKey} does not directly depend on ${changedFieldPath}, skipping`);
            }
        } else {
            console.log(`Field ${fieldKey} has no dependent_values config, skipping`);
        }
    }
    
    // Process immediate dependents
    dependentFields.forEach(fieldKey => {
        processField(fieldKey);
    });
    
    console.log(`Updated ${processed.size} dependent fields`);
}

/**
 * Refresh a field considering its dependencies
 */
/**
 * Refresh a field considering its dependencies
 */
function refreshFieldWithDependencies(fieldKey) {
    console.log(`Refreshing field with dependencies: ${fieldKey}`);
    
    const fieldGroup = document.querySelector(`[data-field-path="${fieldKey}"]`);
    if (!fieldGroup) {
        console.warn(`Field group not found for: ${fieldKey}`);
        return;
    }
    
    // Store current value
    const currentValue = getFieldValue(fieldKey);
    console.log(`Current value of ${fieldKey}:`, currentValue);
    
    // Get dynamic values based on current dependencies
    const dynamicConfig = getDynamicValues(fieldKey);
    console.log(`Dynamic config for ${fieldKey}:`, dynamicConfig);
    
    // Find the property in schema
    const keys = fieldKey.split('.');
    let current = currentSchema.properties;
    let prop = null;
    
    for (let i = 0; i < keys.length; i++) {
        if (!current || !current[keys[i]]) {
            console.warn(`Schema path not found: ${fieldKey}`);
            return;
        }
        
        prop = current[keys[i]];
        
        if (prop.$ref) {
            const resolved = resolveRef(prop.$ref);
            if (i === keys.length - 1) {
                prop = resolved;
            } else {
                current = resolved.properties;
            }
        } else if (i === keys.length - 1) {
            break;
        } else {
            current = prop.properties;
        }
    }
    
    if (!prop) return;
    
    // Create a modified property with dynamic values
    const modifiedProp = { ...prop };
    
    // Update enum/values based on dynamic config
    if (dynamicConfig?.values) {
        modifiedProp.enum = dynamicConfig.values;
        
        // Set response type based on the field
        const responseType = dynamicConfig.response_type || 
                           (modifiedProp.type === 'array' ? 'multi-select' : 'single-select');
        
        // Store response type in a custom property
        modifiedProp._responseType = responseType;
    }
    
    const required = getFieldRequirement(fieldKey);
    const newFieldHtml = createField(keys[keys.length - 1], modifiedProp, required, keys);
    
    // Replace the field
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = newFieldHtml;
    const newFieldGroup = tempDiv.firstElementChild;
    
    if (fieldGroup.parentNode) {
        fieldGroup.parentNode.replaceChild(newFieldGroup, fieldGroup);
        
        // Restore value if it's still valid with the new options
        if (currentValue !== null && currentValue !== undefined && currentValue !== '') {
            setTimeout(() => {
                const validValue = getValidValueForField(fieldKey, currentValue, dynamicConfig);
                if (validValue !== null) {
                    console.log(`Restoring value for ${fieldKey}:`, validValue);
                    
                    if (Array.isArray(validValue)) {
                        populateArrayField(fieldKey, validValue);
                    } else {
                        populateSingleField(fieldKey, validValue);
                    }
                } else {
                    console.log(`Value ${currentValue} is no longer valid for ${fieldKey}`);
                }
            }, 100);
        }
        
        // Re-attach event listeners
        setTimeout(() => {
            attachEventListeners();
            applyConditionalRules();
        }, 150);
    }
}

function getValidValueForField(fieldKey, value, dynamicConfig) {
    if (!dynamicConfig || !dynamicConfig.values) {
        // If no dynamic config, check schema enum
        const keys = fieldKey.split('.');
        let current = currentSchema.properties;
        let prop = null;
        
        for (let i = 0; i < keys.length; i++) {
            if (!current || !current[keys[i]]) return null;
            
            prop = current[keys[i]];
            if (prop.$ref) {
                const resolved = resolveRef(prop.$ref);
                if (i === keys.length - 1) {
                    prop = resolved;
                } else {
                    current = resolved.properties;
                }
            } else if (i === keys.length - 1) {
                break;
            } else {
                current = prop.properties;
            }
        }
        
        if (!prop || !prop.enum) return null;
        const validValues = prop.enum;
        
        if (Array.isArray(value)) {
            const validSelections = value.filter(val => validValues.includes(val));
            return validSelections.length > 0 ? validSelections : null;
        } else {
            return validValues.includes(value) ? value : null;
        }
    }
    
    const validValues = dynamicConfig.values;
    
    if (Array.isArray(value)) {
        const validSelections = value.filter(val => validValues.includes(val));
        return validSelections.length > 0 ? validSelections : null;
    } else {
        return validValues.includes(value) ? value : null;
    }
}

function getDynamicValues(fieldKey) {
    const choiceConfig = customChoices[fieldKey];
    if (!choiceConfig || !choiceConfig.dependent_values) {
        return choiceConfig;
    }
    
    const dependencyValues = {};
    let allDependenciesMet = true;
    
    // Check each dependency
    for (const [dependencyField, valueMap] of Object.entries(choiceConfig.dependent_values)) {
        const currentValue = getFieldValue(dependencyField);
        
        if (currentValue !== null && currentValue !== undefined && currentValue !== '') {
            if (Array.isArray(currentValue)) {
                let matched = false;
                for (const val of currentValue) {
                    if (valueMap[val]) {
                        dependencyValues[dependencyField] = val;
                        matched = true;
                        break;
                    }
                }
                if (!matched) {
                    allDependenciesMet = false;
                    break;
                }
            } else {
                if (valueMap[currentValue] !== undefined) {
                    dependencyValues[dependencyField] = currentValue;
                } else {
                    allDependenciesMet = false;
                    break;
                }
            }
        } else {
            allDependenciesMet = false;
            break;
        }
    }
    
    if (allDependenciesMet) {
        let result = { ...choiceConfig };
        
        // Use the first matching dependency value
        for (const [dependencyField, depValue] of Object.entries(dependencyValues)) {
            const valueMap = choiceConfig.dependent_values[dependencyField];
            if (valueMap && valueMap[depValue]) {
                result.values = valueMap[depValue];
                // Preserve other properties
                if (choiceConfig.response_type) result.response_type = choiceConfig.response_type;
                if (choiceConfig.na) result.na = choiceConfig.na;
                break;
            }
        }
        
        console.log(`Dynamic values for ${fieldKey}:`, result.values);
        return result;
    }
    
    // If dependencies not met, return base values or null
    return choiceConfig.values ? choiceConfig : null;
}

/**
 * Check if field is required based on schema
 */
function getFieldRequirement(fieldKey) {
    const keys = fieldKey.split('.');
    let current = currentSchema;
    
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        
        if (i === 0 && current.required?.includes(key)) {
            return true;
        }
        
        if (current.properties?.[key]) {
            const prop = current.properties[key];
            
            if (prop.$ref) {
                current = resolveRef(prop.$ref);
            } else if (i === keys.length - 1) {
                return prop.required?.includes(key) || false;
            } else if (prop.properties) {
                current = prop;
            } else {
                return false;
            }
        } else {
            return false;
        }
    }
    
    return false;
}

// ============ EVENT LISTENER MANAGEMENT ============

/**
 * Attach event listeners to form inputs
 */
function attachEventListeners() {
    // Attach to all standard inputs
    const inputs = document.querySelectorAll('input:not(.multi-select-checkbox):not(.na-checkbox), select, textarea');
    
    inputs.forEach(input => {
        if (!input.dataset.listenerAttached) {
            input.addEventListener('change', handleFieldChange);
            input.dataset.listenerAttached = 'true';
        }
    });
    
    // Setup multi-select displays and attach checkbox listeners
    document.querySelectorAll('.multi-select-container').forEach(container => {
        const dropdownId = container.id;
        const firstCheckbox = container.querySelector('[data-path]');
        if (firstCheckbox) {
            const path = firstCheckbox.dataset.path;
            updateMultiSelectDisplay(dropdownId, path);
            
            // Attach change listeners to checkboxes in this multi-select
            const checkboxes = container.querySelectorAll('.multi-select-checkbox, .na-checkbox');
            checkboxes.forEach(cb => {
                if (!cb.dataset.listenerAttached) {
                    cb.addEventListener('change', function(e) {
                        const path = this.dataset.path;
                        const dropdownId = this.dataset.dropdown;
                        
                        console.log(`Multi-select checkbox changed: ${path}, Value: ${this.value}, Checked: ${this.checked}`);
                        
                        // Handle exclusive options logic
                        const exclusiveOptions = ['Unknown/Unsure', 'None of the listed options', 'N/A'];
                        
                        if (exclusiveOptions.includes(this.value) && this.checked) {
                            // Uncheck all other checkboxes
                            const allCheckboxes = document.querySelectorAll(`[data-path="${path}"].multi-select-checkbox, #${path}_na`);
                            allCheckboxes.forEach(otherCb => {
                                if (otherCb !== this) {
                                    otherCb.checked = false;
                                }
                            });
                        } else if (this.checked) {
                            // Uncheck any exclusive options if a regular option is selected
                            const allCheckboxes = document.querySelectorAll(`[data-path="${path}"].multi-select-checkbox, #${path}_na`);
                            allCheckboxes.forEach(otherCb => {
                                if (exclusiveOptions.includes(otherCb.value)) {
                                    otherCb.checked = false;
                                }
                            });
                        }
                        
                        // Update the display
                        updateMultiSelectDisplay(dropdownId, path);
                        
                        // Update form data and trigger dependencies
                        formData = collectFormData();
                        
                        // Check if this field has dependents
                        if (fieldDependencies[path] && fieldDependencies[path].length > 0) {
                            console.log(`Field ${path} has ${fieldDependencies[path].length} dependents`);
                            updateDependentFields(path);
                        }
                        
                        // Apply conditional rules
                        setTimeout(() => applyConditionalRules(), 100);
                    });
                    cb.dataset.listenerAttached = 'true';
                }
            });
        }
    });
    
    // Apply conditional rules
    setTimeout(applyConditionalRules, 300);
}

/**
 * Handle field change events
 */
function handleFieldChange(e) {
    const input = e.target;
    const fieldPath = input.dataset.path || input.name;
    
    console.log(`Field changed: ${fieldPath}, Value:`, input.value || input.checked);
    
    // Immediately update formData
    updateFormDataForField(fieldPath);
    
    // Only update dependent fields if this field has dependents
    if (fieldDependencies[fieldPath] && fieldDependencies[fieldPath].length > 0) {
        console.log(`Field ${fieldPath} has ${fieldDependencies[fieldPath].length} dependents`);
        updateDependentFields(fieldPath);
    }
    
    // Apply conditional rules
    setTimeout(() => applyConditionalRules(), 100);
}

/**
 * Update formData for a specific field
 */
function updateFormDataForField(fieldPath) {
    const value = getFieldValue(fieldPath);
    setNestedValue(formData, fieldPath, value);
    console.log(`Updated formData for ${fieldPath}:`, value);
}

/**
 * Set nested value in object using dot notation path
 */
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
// ============ WINDOW FUNCTIONS (Global scope) ============

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
    const required = itemSchema.required || [];
    
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

// window.handleMultiSelectChange = function(path, dropdownId) {
//     const changedCheckbox = event.target;
//     const changedValue = changedCheckbox.value;
    
//     const exclusiveOptions = ['Unknown/Unsure', 'None of the listed options', 'N/A'];
    
//     if (exclusiveOptions.includes(changedValue) && changedCheckbox.checked) {
//         const allCheckboxes = document.querySelectorAll(`[data-path="${path}"].multi-select-checkbox, #${path}_na`);
//         allCheckboxes.forEach(cb => {
//             if (cb !== changedCheckbox) {
//                 cb.checked = false;
//             }
//         });
//     } else if (changedCheckbox.checked) {
//         const allCheckboxes = document.querySelectorAll(`[data-path="${path}"].multi-select-checkbox, #${path}_na`);
//         allCheckboxes.forEach(cb => {
//             if (exclusiveOptions.includes(cb.value)) {
//                 cb.checked = false;
//             }
//         });
//     }
    
//     updateMultiSelectDisplay(dropdownId, path);
// };

// window.handleNAChange = function(path, dropdownId) {
//     const naCheckbox = document.getElementById(path + '_na');
//     if (naCheckbox && naCheckbox.checked) {
//         const multiSelectCheckboxes = document.querySelectorAll(`[data-path="${path}"].multi-select-checkbox`);
//         multiSelectCheckboxes.forEach(cb => cb.checked = false);
//     }
//     updateMultiSelectDisplay(dropdownId, path);
// };

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

/**
 * Update multi-select display
 */
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

// Close multi-select dropdowns when clicking outside
document.addEventListener('click', function(event) {
    if (!event.target.closest('.multi-select-container')) {
        document.querySelectorAll('.multi-select-dropdown').forEach(dd => {
            dd.classList.remove('open');
        });
    }
});

// ============ CONDITIONAL RULES FUNCTIONS ============

/**
 * Apply conditional rules to show/hide fields
 */
function applyConditionalRules() {
    if (!conditionalRules || Object.keys(conditionalRules).length === 0) {
        return;
    }

    for (const [triggerField, conditions] of Object.entries(conditionalRules)) {
        const currentValue = getFieldValue(triggerField);
        
        conditions.forEach(condition => {
            const triggerValue = condition.value;
            const affectedFields = condition.disable_fields || [];
            
            const conditionMet = String(currentValue).trim() === String(triggerValue).trim();
            
            affectedFields.forEach(fieldKey => {
                const fieldGroup = document.querySelector(`[data-field-path="${fieldKey}"]`);
                if (!fieldGroup) return;
                
                if (conditionMet) {
                    fieldGroup.classList.add('disabled');
                    
                    if (!fieldGroup.querySelector('.disabled-indicator')) {
                        const indicator = document.createElement('div');
                        indicator.className = 'disabled-indicator';
                        indicator.textContent = `Auto-disabled (based on ${triggerField})`;
                        fieldGroup.appendChild(indicator);
                    }
                    
                    setDisabledFieldValue(fieldKey, fieldGroup);
                } else {
                    fieldGroup.classList.remove('disabled');
                    fieldGroup.querySelector('.disabled-indicator')?.remove();
                }
            });
        });
    }
}

/**
 * Get current value of a field
 */
function getFieldValue(fieldPath) {
    // Try different input types
    const select = document.querySelector(`select[data-path="${fieldPath}"]`);
    if (select) return select.value;
    
    const textInput = document.querySelector(`input[type="text"][data-path="${fieldPath}"], input[type="email"][data-path="${fieldPath}"]`);
    if (textInput) return textInput.value;
    
    const numberInput = document.querySelector(`input[type="number"][data-path="${fieldPath}"]`);
    if (numberInput) return numberInput.value ? Number(numberInput.value) : null;
    
    const dateInput = document.querySelector(`input[type="date"][data-path="${fieldPath}"]`);
    if (dateInput) return dateInput.value;
    
    const checkbox = document.querySelector(`input[type="checkbox"][data-path="${fieldPath}"]:not(.multi-select-checkbox):not(.na-checkbox)`);
    if (checkbox) return checkbox.checked;
    
    const naCheckbox = document.getElementById(fieldPath + '_na');
    if (naCheckbox && naCheckbox.checked) return naCheckbox.value;
    
    const multiCheckboxes = document.querySelectorAll(`[data-path="${fieldPath}"].multi-select-checkbox:checked`);
    if (multiCheckboxes.length > 0) {
        return Array.from(multiCheckboxes).map(cb => cb.value);
    }

    return null;
}

/**
 * Set disabled field to default value
 */
function setDisabledFieldValue(fieldPath, fieldGroup) {
    const fieldType = getFieldTypeFromSchema(fieldPath);
    let defaultValue = fieldType === 'integer' || fieldType === 'number' ? -9999 : 
                      fieldType === 'date' ? '1900-01-01' : 'N/A';
    
    // Handle different input types
    const selectInput = fieldGroup.querySelector(`select[data-path="${fieldPath}"]`);
    if (selectInput) {
        if (!Array.from(selectInput.options).some(opt => opt.value === defaultValue)) {
            const naOption = document.createElement('option');
            naOption.value = defaultValue;
            naOption.textContent = defaultValue;
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
        const path = fieldPath;
        
        document.querySelectorAll(`[data-path="${path}"].multi-select-checkbox`).forEach(cb => cb.checked = false);
        
        const naCheckbox = document.getElementById(path + '_na');
        if (naCheckbox) {
            naCheckbox.value = defaultValue;
            const naLabel = document.querySelector(`label[for="${path}_na"]`);
            if (naLabel) {
                naLabel.textContent = `${defaultValue} (exclusive)`;
            }
            naCheckbox.checked = true;
        }
        
        updateMultiSelectDisplay(dropdownId, path);
    }
}

/**
 * Get field type from schema
 */
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

// ============ FORM DATA COLLECTION FUNCTIONS ============

/**
 * Collect all form data into a structured object
 */
/**
 * Collect all form data into a structured object
 */
function collectFormData() {
    const data = {};
    const processedPaths = new Set();
    
    // Process all fields with data-path attribute
    document.querySelectorAll('[data-path]').forEach(input => {
        const path = input.dataset.path;
        if (!path || processedPaths.has(path)) return;
        
        let value = null;
        
        // Handle multi-select fields specifically
        const multiSelectCheckboxes = document.querySelectorAll(`[data-path="${path}"].multi-select-checkbox:checked`);
        const naCheckbox = document.getElementById(path + '_na');
        
        if (multiSelectCheckboxes.length > 0 || (naCheckbox && naCheckbox.checked)) {
            // This is a multi-select field
            if (naCheckbox?.checked) {
                value = naCheckbox.value;
            } else {
                value = Array.from(multiSelectCheckboxes).map(cb => cb.value);
            }
        } else if (input.type === 'checkbox') {
            // Regular checkbox
            value = input.checked;
        } else if (input.type === 'number') {
            // Number input
            value = input.value ? Number(input.value) : null;
        } else if (input.tagName === 'TEXTAREA' && input.placeholder?.includes('comma-separated')) {
            // Textarea for arrays
            value = input.value.trim() ? input.value.split(',').map(v => v.trim()).filter(v => v) : [];
        } else {
            // All other inputs (text, date, email, select)
            value = input.value || null;
        }
        
        if (value !== null) {
            setNestedValue(data, path, value);
        }
        
        processedPaths.add(path);
    });
    
    return data;
}

// ============ FORM POPULATION FUNCTIONS ============

/**
 * Load and populate form with data from file
 */
function loadDataFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            loadedData = data; // Store the loaded data
            
            if (currentSchema) {
                populateFormWithData(data);
                alert('Data loaded and form populated successfully!');
            } else {
                alert('Schema not loaded yet. Data will be populated after schema is loaded.');
            }
            console.log('Data loaded:', data);
        } catch (error) {
            alert('Invalid JSON data file: ' + error.message);
            console.error('Data load error:', error);
        }
    };

    input.click();
}

/**
 * Main function to populate form with data
 */
function populateFormWithData(data) {
    console.log('Starting form population with data:', data);
    loadedData = data; // Store for later use
    
    if (!currentSchema) {
        console.warn('Schema not loaded yet, cannot populate form');
        return;
    }
    
    // Populate each tab's data
    Object.keys(currentSchema.properties || {}).forEach(tabKey => {
        if (data[tabKey]) {
            // If this tab is currently active, populate it
            if (currentTab === tabKey) {
                populateTabData(tabKey, data[tabKey], [tabKey]);
            }
        }
    });
    
    // Initialize dependencies and apply rules
    setTimeout(() => {
        initializeDependencies();
        applyConditionalRules();
        console.log('Form population complete');
    }, 1000); // Give time for all tabs to render
}

/**
 * Populate a single field with value
 */
function populateSingleField(pathStr, value) {
    if (value === null || value === undefined) {
        console.log(`Skipping null/undefined value for ${pathStr}`);
        return;
    }
    
    console.log(`Populating field: ${pathStr} with value:`, value);
    
    // Wait a bit for the field to be rendered
    setTimeout(() => {
        // First try to find the input element
        let input = null;
        
        // Try different input types in order
        const inputTypes = [
            `select[data-path="${pathStr}"]`,
            `input[type="text"][data-path="${pathStr}"]`,
            `input[type="email"][data-path="${pathStr}"]`,
            `input[type="number"][data-path="${pathStr}"]`,
            `input[type="date"][data-path="${pathStr}"]`,
            `input[type="checkbox"][data-path="${pathStr}"]:not(.multi-select-checkbox):not(.na-checkbox)`,
            `textarea[data-path="${pathStr}"]`
        ];
        
        for (const selector of inputTypes) {
            input = document.querySelector(selector);
            if (input) {
                console.log(`Found input for ${pathStr}:`, input);
                break;
            }
        }
        
        // If not found as standard input, try multi-select
        if (!input) {
            // Check if it's a multi-select field
            const escapedPath = pathStr.replace(/\./g, '_');
            const container = document.getElementById(`multiselect_${escapedPath}`);
            if (container) {
                console.log(`Found multi-select for ${pathStr}`);
                populateArrayField(pathStr, value);
                return;
            }
            
            // Check if field exists but might be in a different format
            const fieldGroup = document.querySelector(`[data-field-path="${pathStr}"]`);
            if (!fieldGroup) {
                console.warn(`Field group not found for: ${pathStr}`);
                return;
            }
            
            // Look for any input within the field group
            input = fieldGroup.querySelector('input, select, textarea');
            if (!input) {
                console.warn(`No input element found for: ${pathStr}`);
                return;
            }
        }
        
        // Set value based on input type
        if (input.tagName === 'SELECT') {
            // For select dropdowns
            const stringValue = String(value);
            const optionExists = Array.from(input.options).some(option => 
                option.value === stringValue
            );
            
            if (optionExists) {
                input.value = stringValue;
                console.log(`Set select value: ${pathStr} = ${stringValue}`);
            } else {
                console.warn(`Value "${stringValue}" not found in dropdown options for ${pathStr}. Options:`, 
                    Array.from(input.options).map(opt => opt.value));
                // Try case-insensitive match
                const matchingOption = Array.from(input.options).find(option => 
                    option.value.toLowerCase() === stringValue.toLowerCase()
                );
                if (matchingOption) {
                    input.value = matchingOption.value;
                    console.log(`Found case-insensitive match for ${pathStr}`);
                }
            }
        } else if (input.type === 'checkbox') {
            // For checkboxes
            input.checked = value === true || value === 'true' || value === 'Yes';
            console.log(`Set checkbox: ${pathStr} = ${input.checked}`);
        } else if (input.type === 'number') {
            // For number inputs
            input.value = Number(value);
            console.log(`Set number: ${pathStr} = ${input.value}`);
        } else if (input.tagName === 'TEXTAREA') {
            // For textareas
            input.value = Array.isArray(value) ? value.join(', ') : value;
            console.log(`Set textarea: ${pathStr} = ${input.value}`);
        } else {
            // For text/date/email inputs
            input.value = value;
            console.log(`Set input: ${pathStr} = ${value}`);
        }
        
        // Trigger change event
        setTimeout(() => {
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }, 50);
    }, 100); // Small delay to ensure DOM is ready
}

/**
 * Populate array/multi-select field
 */
function populateArrayField(pathStr, values) {
    console.log(`Populating array/multi-select field: ${pathStr} with values:`, values);
    
    // Wait for the field to be rendered
    setTimeout(() => {
        // Find multi-select container
        let container = null;
        const escapedPath = pathStr.replace(/\./g, '_');
        container = document.getElementById(`multiselect_${escapedPath}`);
        
        if (!container) {
            // Try to find by data-path attribute
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
            // Handle multi-select
            const allCheckboxes = document.querySelectorAll(`[data-path="${pathStr}"].multi-select-checkbox`);
            const naCheckbox = document.getElementById(`${pathStr}_na`);
            
            if (allCheckboxes.length === 0) {
                console.warn(`No multi-select checkboxes found for: ${pathStr}`);
                // Check if checkboxes haven't been rendered yet
                setTimeout(() => populateArrayField(pathStr, values), 200);
                return;
            }
            
            // Reset all checkboxes
            allCheckboxes.forEach(cb => cb.checked = false);
            if (naCheckbox) naCheckbox.checked = false;
            
            const exclusiveOptions = ['None of the listed options', 'Unknown/Unsure', 'N/A'];
            
            if (typeof values === 'string') {
                // Single value
                const stringValue = String(values);
                if (naCheckbox && naCheckbox.value === stringValue) {
                    naCheckbox.checked = true;
                    console.log(`Set NA checkbox for ${pathStr}`);
                } else if (exclusiveOptions.includes(stringValue)) {
                    const matchingCheckbox = Array.from(allCheckboxes).find(cb => cb.value === stringValue);
                    if (matchingCheckbox) {
                        matchingCheckbox.checked = true;
                        console.log(`Set exclusive option for ${pathStr}: ${stringValue}`);
                    }
                } else {
                    const matchingCheckbox = Array.from(allCheckboxes).find(cb => cb.value === stringValue);
                    if (matchingCheckbox) {
                        matchingCheckbox.checked = true;
                        console.log(`Set regular option for ${pathStr}: ${stringValue}`);
                    } else {
                        console.warn(`Value "${stringValue}" not found in options for ${pathStr}`);
                    }
                }
            } else if (Array.isArray(values)) {
                // Multiple values
                if (values.length > 0) {
                    const hasExclusiveOption = values.some(val => exclusiveOptions.includes(String(val)));
                    
                    if (hasExclusiveOption) {
                        const exclusiveValue = values.find(val => exclusiveOptions.includes(String(val)));
                        if (exclusiveValue === 'N/A' && naCheckbox) {
                            naCheckbox.checked = true;
                            console.log(`Set NA checkbox for ${pathStr} (from array)`);
                        } else {
                            const exclusiveCheckbox = Array.from(allCheckboxes).find(cb => 
                                cb.value === String(exclusiveValue)
                            );
                            if (exclusiveCheckbox) {
                                exclusiveCheckbox.checked = true;
                                console.log(`Set exclusive option for ${pathStr}: ${exclusiveValue}`);
                            }
                        }
                    } else {
                        values.forEach(val => {
                            const stringVal = String(val);
                            const checkbox = Array.from(allCheckboxes).find(cb => cb.value === stringVal);
                            if (checkbox) {
                                checkbox.checked = true;
                                console.log(`Set array option for ${pathStr}: ${stringVal}`);
                            } else {
                                console.warn(`Value "${stringVal}" not found in options for ${pathStr}`);
                            }
                        });
                    }
                }
            }
            
            // Update display
            updateMultiSelectDisplay(container.id, pathStr);
            
            // Trigger change event
            if (allCheckboxes.length > 0) {
                setTimeout(() => {
                    allCheckboxes[0].dispatchEvent(new Event('change', { bubbles: true }));
                }, 100);
            }
        } else {
            // Not a multi-select, try as regular textarea
            const textarea = document.querySelector(`textarea[data-path="${pathStr}"]`);
            if (textarea && textarea.placeholder?.includes('comma-separated')) {
                textarea.value = Array.isArray(values) ? values.join(', ') : values;
                setTimeout(() => {
                    textarea.dispatchEvent(new Event('change', { bubbles: true }));
                }, 100);
            } else {
                console.warn(`Field not found for: ${pathStr}`);
            }
        }
    }, 150); // Delay to ensure DOM is ready
}

/**
 * Populate array of objects
 */
function populateArrayOfObjects(pathStr, items) {
    const container = document.getElementById('array_' + pathStr);
    if (!container) {
        console.warn(`Array container not found for: ${pathStr}`);
        return;
    }
    
    // Clear existing items
    container.querySelectorAll('.array-item').forEach(item => item.remove());
    
    // Find item schema
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
    
    // Add items
    items.forEach((itemData, index) => {
        window.addArrayItem(pathStr, itemSchema);
        
        setTimeout(() => {
            for (const [subKey, subValue] of Object.entries(itemData)) {
                const itemPath = `${pathStr}.${index}.${subKey}`;
                populateSingleField(itemPath, subValue);
            }
        }, 50);
    });
}

// ============ UPDATED SWITCH TAB FOR BETTER DATA HANDLING ============

// Update the switchTab function to handle data population better
window.switchTab = function(tabKey, forceRender = false) {
    // Save current tab data before switching
    if (currentTab) {
        saveCurrentTabData();
    }
    
    // Remove active class from current tab
    if (currentTab) {
        document.getElementById(`tab-${currentTab}`)?.classList.remove('active');
        document.getElementById(`content-${currentTab}`)?.classList.remove('active');
    }
    
    // Add active class to new tab
    const newTabButton = document.getElementById(`tab-${tabKey}`);
    const newTabContent = document.getElementById(`content-${tabKey}`);
    
    if (newTabButton && newTabContent) {
        newTabButton.classList.add('active');
        newTabContent.classList.add('active');
        
        // Check if content needs to be rendered
        const needsRender = newTabContent.children.length <= 1 || forceRender;
        
        if (needsRender && tabContents[tabKey]) {
            // Clear existing content except title
            const title = newTabContent.querySelector('h2');
            newTabContent.innerHTML = '';
            if (title) newTabContent.appendChild(title);
            
            // Add form content
            const div = document.createElement('div');
            div.innerHTML = tabContents[tabKey];
            if (div.firstElementChild) {
                div.firstElementChild.className = 'form-content';
                newTabContent.appendChild(div.firstElementChild);
            }
            
            // Re-attach event listeners
            setTimeout(() => {
                attachEventListeners();
                // If we have loaded data, populate this tab
                if (loadedData && loadedData[tabKey]) {
                    console.log(`Populating ${tabKey} tab with loaded data`);
                    populateTabData(tabKey, loadedData[tabKey], [tabKey]);
                }
                // Also restore any values from current formData
                restoreTabData(tabKey);
            }, 100);
        } else if (loadedData && loadedData[tabKey]) {
            // Tab already rendered, just ensure data is populated
            console.log(`Tab ${tabKey} already rendered, ensuring data is populated`);
            populateTabData(tabKey, loadedData[tabKey], [tabKey]);
            restoreTabData(tabKey);
        }
        
        currentTab = tabKey;
    }
};

/**
 * Save current tab's data to formData before switching
 */
function saveCurrentTabData() {
    if (!currentTab) return;
    
    // Get all fields in current tab
    const currentTabContent = document.getElementById(`content-${currentTab}`);
    if (!currentTabContent) return;
    
    // Collect data from all inputs in current tab
    const inputs = currentTabContent.querySelectorAll('[data-path]');
    
    inputs.forEach(input => {
        const path = input.dataset.path;
        if (!path) return;
        
        let value = null;
        
        // Handle multi-select fields
        if (input.classList?.contains('multi-select-checkbox') || input.classList?.contains('na-checkbox')) {
            // Skip individual checkboxes - they're handled as a group
            return;
        }
        
        // For multi-select, get the group value
        const multiSelectCheckboxes = document.querySelectorAll(`[data-path="${path}"].multi-select-checkbox:checked`);
        const naCheckbox = document.getElementById(`${path}_na`);
        
        if (multiSelectCheckboxes.length > 0 || (naCheckbox && naCheckbox.checked)) {
            if (naCheckbox?.checked) {
                value = naCheckbox.value;
            } else {
                value = Array.from(multiSelectCheckboxes).map(cb => cb.value);
            }
        } else if (input.type === 'checkbox') {
            value = input.checked;
        } else if (input.type === 'number') {
            value = input.value ? Number(input.value) : null;
        } else if (input.tagName === 'TEXTAREA' && input.placeholder?.includes('comma-separated')) {
            value = input.value.trim() ? input.value.split(',').map(v => v.trim()).filter(v => v) : [];
        } else {
            value = input.value || null;
        }
        
        if (value !== null) {
            setNestedValue(formData, path, value);
        }
    });
    
    console.log(`Saved data for tab ${currentTab}:`, formData[currentTab]);
}

/**
 * Restore saved data to a tab
 */
function restoreTabData(tabKey) {
    if (!formData || !formData[tabKey]) return;
    
    // Populate fields in this tab with saved data
    const tabContent = document.getElementById(`content-${tabKey}`);
    if (!tabContent) return;
    
    // Get all paths in this tab
    const inputs = tabContent.querySelectorAll('[data-path]');
    const processedPaths = new Set();
    
    inputs.forEach(input => {
        const path = input.dataset.path;
        if (!path || processedPaths.has(path)) return;
        processedPaths.add(path);
        
        // Get value from formData
        const value = getNestedValue(formData, path);
        if (value !== undefined && value !== null) {
            setTimeout(() => {
                // Check if it's a multi-select field
                const multiSelectCheckboxes = document.querySelectorAll(`[data-path="${path}"].multi-select-checkbox`);
                if (multiSelectCheckboxes.length > 0) {
                    // It's a multi-select field
                    populateArrayField(path, value);
                } else {
                    // Regular field
                    populateSingleField(path, value);
                }
            }, 50);
        }
    });
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj, path) {
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
        if (current === null || current === undefined) {
            return undefined;
        }
        current = current[key];
    }
    
    return current;
}
