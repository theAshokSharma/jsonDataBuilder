// form-renderer.js - Form Rendering Module
// Handles all form generation, tabs, fields, arrays, and polymorphic structures

import { state, updateState } from './state.js';
import { createInputControl, createDefaultInput } from './input-control.js';
import { resolveRef } from './file-validation.js';
import { analyzeSchemaStructure, normalizeSchema, detectSchemaPattern } from './schema-manager.js';
import { attachEventListeners, initializeDependentFields, initializePendingDependentFields } from './conditional-rules.js'

console.log('📋 Form Renderer Module Loaded');

// ==================== MAIN FORM RENDERING ====================

/**
 * Enhanced renderForm with schema normalization
 * Main entry point for rendering any schema structure
 * @param {Object} schema - JSON schema (potentially non-standard)
 */
function renderForm(schema) {
  console.log('📋 Original schema structure:', {
    hasProperties: !!schema.properties,
    hasOneOf: !!schema.oneOf,
    hasAnyOf: !!schema.anyOf,
    has$Defs: !!schema.$Defs,
    has$defs: !!schema.$defs,
    hasDefinitions: !!schema.definitions
  });
  
  // Step 1: Normalize schema structure
  const normalizedSchema = normalizeSchema(schema);
  updateState({
    currentSchema: normalizedSchema
  });
  
  console.log('📋 Normalized schema structure:', {
    hasProperties: !!normalizedSchema.properties,
    propertyCount: normalizedSchema.properties ? Object.keys(normalizedSchema.properties).length : 0,
    propertyKeys: normalizedSchema.properties ? Object.keys(normalizedSchema.properties) : []
  });
  
  // Step 2: Analyze normalized schema
  const analysis = analyzeSchemaStructure(normalizedSchema);
  const patterns = detectSchemaPattern(normalizedSchema);
  
  console.log('🔍 Schema Analysis:', analysis);
  console.log('🔍 Detected Patterns:', patterns);
  
  // Step 3: Hide config modal
  document.getElementById('config-modal').style.display = 'none';
  
  // Step 4: Show form UI
  document.getElementById('configBtn').textContent = '⚙️ Config';
  document.getElementById('saveBtn').style.display = 'inline-block';
  document.getElementById('loadDataBtn').style.display = 'inline-block';
  document.getElementById('exportBtn').style.display = 'inline-block';
  
  // Step 5: Route to appropriate renderer
  switch(analysis.renderingStrategy) {
    case 'multi-section-tabs':
      console.log('🎨 Rendering: Multi-section with tabs');
      renderMultiSectionForm(normalizedSchema, analysis);
      break;
      
    case 'polymorphic-selector':
      console.log('🎨 Rendering: Polymorphic form with type selector');
      renderPolymorphicForm(normalizedSchema, analysis);
      break;
      
    case 'dynamic-recursive':
      console.log('🎨 Rendering: Recursive/dynamic form');
      renderRecursiveForm(normalizedSchema, analysis);
      break;
      
    case 'single-form-nested':
      console.log('🎨 Rendering: Single form with nested objects');
      renderSingleForm(normalizedSchema, analysis);
      break;
      
    case 'single-form-flat':
      console.log('🎨 Rendering: Single flat form');
      renderSingleForm(normalizedSchema, analysis);
      break;
      
    case 'single-form-collapsible':
      console.log('🎨 Rendering: Single form with collapsible sections');
      renderSingleForm(normalizedSchema, analysis);
      break;
      
    default:
      console.log('🎨 Rendering: Default single form');
      renderSingleForm(normalizedSchema, analysis);
  }
  
    // Step 6: Attach event listeners
    setTimeout(() => {
      attachEventListeners();
      
      // NEW: Initialize dependent fields with default values
      initializeDependentFields();
      
    }, 100);
}

// ==================== POLYMORPHIC FORM RENDERING ====================

/**
 * Renders polymorphic forms (oneOf/anyOf at root)
 * Generic for any schema with type selection
 * Enhanced: Renders polymorphic forms with better initial state
 */
function renderPolymorphicForm(schema, analysis) {
  const tabsContainer = document.getElementById('tabs-container');
  const tabContentsContainer = document.getElementById('tab-contents');
  
  // Hide tabs, show single container
  document.getElementById('form-tabs').style.display = 'none';
  tabContentsContainer.innerHTML = '';
  
  const container = document.createElement('div');
  container.className = 'single-form-container';
  
  // Add title
  const title = document.createElement('h2');
  title.textContent = schema.title || 'Form';
  container.appendChild(title);
  
  // Add description if present
  if (schema.description) {
    const desc = document.createElement('p');
    desc.className = 'form-description';
    desc.textContent = schema.description;
    container.appendChild(desc);
  }
  
  // Create type selector
  const typeSelector = createPolymorphicTypeSelector(schema);
  container.appendChild(typeSelector);
  
  // Create dynamic content area
  const dynamicContent = document.createElement('div');
  dynamicContent.id = 'polymorphic-content';
  dynamicContent.className = 'polymorphic-content';
  container.appendChild(dynamicContent);
  
  tabContentsContainer.appendChild(container);
  tabsContainer.style.display = 'block';
  
  // Don't auto-render anything - let user select
  console.log('✅ Polymorphic form ready, awaiting user selection');
}

/**
 * Creates type selector for polymorphic schemas
 * Enhanced: Creates type selector for polymorphic schemas with better titles
 */
function createPolymorphicTypeSelector(schema) {
  const formGroup = document.createElement('div');
  formGroup.className = 'form-group';
  
  const label = document.createElement('label');
  label.className = 'required';
  label.textContent = 'Type';
  
  const select = document.createElement('select');
  select.id = 'polymorphic-type-selector';
  select.className = 'polymorphic-type-selector';
  
  const options = schema.oneOf || schema.anyOf || [];
  const keyword = schema.oneOf ? 'oneOf' : 'anyOf';
  
  // Add default option
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '-- Select Type --';
  select.appendChild(defaultOpt);
  
  options.forEach((option, index) => {
    const opt = document.createElement('option');
    opt.value = index;
    
    // Try to get a meaningful title
    let title = option.title;
    
    // If no title, try to resolve $ref and get its title
    if (!title && option.$ref) {
      const resolved = resolveRef(option.$ref, schema);
      if (resolved) {
        title = resolved.title;
      }
      
      // If still no title, extract from $ref path
      if (!title) {
        title = option.$ref.split('/').pop();
      }
    }
    
    opt.textContent = title || `Option ${index + 1}`;
    select.appendChild(opt);
  });
  
  select.addEventListener('change', (e) => {
    const selectedIndex = parseInt(e.target.value);
    const contentArea = document.getElementById('polymorphic-content');
    contentArea.innerHTML = '';
    
    if (selectedIndex >= 0 && selectedIndex < options.length) {
      const selectedOption = options[selectedIndex];
      renderPolymorphicOption(selectedOption, contentArea, [], 0);
    }
  });
  
  formGroup.appendChild(label);
  formGroup.appendChild(select);
  
  return formGroup;
}


/**
 * Enhanced: Renders selected polymorphic option with support for nested oneOf/anyOf
 * 
 * @param {Object} optionSchema - The selected schema option
 * @param {HTMLElement} container - Container to render into
 * @param {Array} path - Current path in data structure
 * @param {number} level - Nesting level (for recursive rendering)
 */
function renderPolymorphicOption(optionSchema, container, path, level = 0) {
  // Resolve reference if needed
  if (optionSchema.$ref) {
    optionSchema = resolveRef(optionSchema.$ref, state.currentSchema);
  }
  
  if (!optionSchema) {
    console.error('Could not resolve schema reference');
    return;
  }
  
  console.log(`🎨 Rendering polymorphic option at level ${level}:`, {
    hasProperties: !!optionSchema.properties,
    hasOneOf: !!optionSchema.oneOf,
    hasAnyOf: !!optionSchema.anyOf,
    type: optionSchema.type,
    title: optionSchema.title
  });
  
  // Case 1: Nested polymorphic structure (oneOf/anyOf within the option)
  if (optionSchema.oneOf || optionSchema.anyOf) {
    console.log('📍 Nested polymorphic structure detected, creating sub-selector');
    renderNestedPolymorphic(optionSchema, container, path, level);
    return;
  }
  
  // Case 2: Standard object with properties
  if (optionSchema.properties) {
    console.log('📍 Rendering properties for option');
    for (const [key, prop] of Object.entries(optionSchema.properties)) {
      const isRequired = optionSchema.required?.includes(key) || false;
      const fieldHtml = createField(key, prop, isRequired, [...path, key]);
      const div = document.createElement('div');
      div.innerHTML = fieldHtml;
      container.appendChild(div.firstElementChild);
    }
    return;
  }
  
  // Case 3: Simple type (string, number, etc.)
  if (optionSchema.type && optionSchema.type !== 'object') {
    console.log('📍 Simple type option');
    const fieldHtml = createField('value', optionSchema, false, [...path, 'value']);
    const div = document.createElement('div');
    div.innerHTML = fieldHtml;
    container.appendChild(div.firstElementChild);
    return;
  }
  
  console.warn('⚠️  Unknown schema structure:', optionSchema);
}


/**
 * NEW: Handles nested polymorphic structures (oneOf/anyOf within oneOf/anyOf)
 * This is specifically for groupRule pattern in rule_data_schema.json
 * 
 * @param {Object} schema - Schema with nested oneOf/anyOf
 * @param {HTMLElement} container - Container to render into
 * @param {Array} path - Current path in data structure
 * @param {number} level - Nesting level
 */
function renderNestedPolymorphic(schema, container, path, level) {
  const options = schema.oneOf || schema.anyOf || [];
  const keyword = schema.oneOf ? 'oneOf' : 'anyOf';
  
  if (options.length === 0) {
    console.warn('⚠️  No options in nested polymorphic structure');
    return;
  }
  
  // Create a form group for the nested selector
  const formGroup = document.createElement('div');
  formGroup.className = 'form-group nested-polymorphic-group';
  formGroup.style.marginLeft = `${level * 20}px`; // Indent based on nesting level
  
  // Add label
  const label = document.createElement('label');
  label.className = 'required';
  label.textContent = schema.title || 'Select Type';
  formGroup.appendChild(label);
  
  // Create selector dropdown
  const select = document.createElement('select');
  select.className = 'nested-polymorphic-selector';
  select.id = `nested-polymorphic-${level}-${path.join('_')}`;
  select.dataset.level = level;
  select.dataset.path = path.join('.');
  
  // Add default option
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '-- Select --';
  select.appendChild(defaultOpt);
  
  // Add options from oneOf/anyOf
  options.forEach((option, index) => {
    const opt = document.createElement('option');
    opt.value = index;
    
    // Get title from option or from its properties
    let optionTitle = option.title;
    if (!optionTitle && option.properties) {
      // Use the property key as title (e.g., "ALL_OF", "ANY_OF")
      const propKeys = Object.keys(option.properties);
      if (propKeys.length > 0) {
        optionTitle = propKeys[0];
      }
    }
    if (!optionTitle && option.$ref) {
      // Extract title from $ref
      optionTitle = option.$ref.split('/').pop();
    }
    
    opt.textContent = optionTitle || `Option ${index + 1}`;
    select.appendChild(opt);
  });
  
  formGroup.appendChild(select);
  
  // Create dynamic content area for selected option
  const dynamicContent = document.createElement('div');
  dynamicContent.id = `nested-content-${level}-${path.join('_')}`;
  dynamicContent.className = 'nested-polymorphic-content';
  dynamicContent.style.marginTop = '15px';
  formGroup.appendChild(dynamicContent);
  
  container.appendChild(formGroup);
  
  // Add change event listener
  select.addEventListener('change', (e) => {
    const selectedIndex = parseInt(e.target.value);
    dynamicContent.innerHTML = '';
    
    if (selectedIndex >= 0 && selectedIndex < options.length) {
      const selectedOption = options[selectedIndex];
      
      // Resolve reference if needed
      let resolvedOption = selectedOption;
      if (selectedOption.$ref) {
        resolvedOption = resolveRef(selectedOption.$ref, state.currentSchema);
      }
      
      console.log(`🔄 Nested option selected at level ${level}:`, {
        index: selectedIndex,
        title: resolvedOption.title,
        hasProperties: !!resolvedOption.properties
      });
      
      // Render the selected option (could be recursive!)
      renderPolymorphicOption(resolvedOption, dynamicContent, path, level + 1);
    }
  });
  
  // Auto-select first option if there's only one
  if (options.length === 1) {
    select.value = '0';
    select.dispatchEvent(new Event('change'));
  }
}


/**
 * Renders recursive schemas (like rule_data_schema.json)
 * Handles self-referencing structures generically
 */
function renderRecursiveForm(schema, analysis) {
  // Use polymorphic renderer if root has oneOf/anyOf
  if (schema.oneOf || schema.anyOf) {
    renderPolymorphicForm(schema, analysis);
  } else {
    // Treat as single form with special array handling
    renderSingleForm(schema, analysis);
  }
}

/**
 * Renders single-container forms (no tabs)
 * Generic for flat or lightly nested schemas
 */
function renderSingleForm(schema, analysis) {
  const tabsContainer = document.getElementById('tabs-container');
  const tabContentsContainer = document.getElementById('tab-contents');
  
  // Hide tabs
  document.getElementById('form-tabs').style.display = 'none';
  tabContentsContainer.innerHTML = '';
  
  const container = document.createElement('div');
  container.className = 'single-form-container';
  
  // Add title
  const title = document.createElement('h2');
  title.textContent = schema.title || 'Form';
  container.appendChild(title);
  
  // Render all properties
  const properties = schema.properties || {};
  const required = schema.required || [];
  
  for (const [key, prop] of Object.entries(properties)) {
    const isRequired = required.includes(key);
    const fieldHtml = createField(key, prop, isRequired, [key]);
    const div = document.createElement('div');
    div.innerHTML = fieldHtml;
    container.appendChild(div.firstElementChild);
  }
  
  tabContentsContainer.appendChild(container);
  tabsContainer.style.display = 'block';
}

/**
 * Existing multi-section renderer (keep as is)
 * Used for complex nested schemas like test-schema.json
 */
function renderMultiSectionForm(schema, analysis) {
  // Existing implementation from current code
  const properties = schema.properties || {};
  const required = schema.required || [];
  
  createTabs(properties);
  
  for (const [key, prop] of Object.entries(properties)) {
    const isRequired = required.includes(key);
    const tabContent = createTabContent(key, prop, isRequired, [key]);
    updateState({
      tabContents: {
        ...state.tabContents,
        [key]: tabContent
      }
    });

  }
  
  document.getElementById('tabs-container').style.display = 'block';
  
  if (Object.keys(properties).length > 0) {
    const firstTab = Object.keys(properties)[0];
    switchTab(firstTab);
  }
}

function createTabs(properties) {
  const tabsContainer = document.getElementById('form-tabs');
  const tabContentsContainer = document.getElementById('tab-contents');
  
  tabsContainer.innerHTML = '';
  tabContentsContainer.innerHTML = '';
  
  updateState({
    tabContents: {}
  });
  
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
  if (state.currentTab) {
    const prevTabButton = document.getElementById(`tab-${state.currentTab}`);
    const prevTabContent = document.getElementById(`content-${state.currentTab}`);
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
      div.innerHTML = state.tabContents[tabKey];
      newTabContent.appendChild(div.firstElementChild);
      
      setTimeout(() => {
        attachEventListeners();
        // NEW: Initialize any dependent fields in this newly rendered tab
        initializePendingDependentFields();
      }, 100);
    }

    updateState({
      currentTab: tabKey
    });
  }
}

function renderAllTabs() {
  console.log('Rendering all tabs for data loading...');
  
  // Get all tab keys
  const tabKeys = Object.keys(state.tabContents);
  
  // Render each tab's content if not already rendered
  tabKeys.forEach(tabKey => {
    const tabContent = document.getElementById(`content-${tabKey}`);
    
    if (tabContent && tabContent.children.length <= 1) {
      // Tab content hasn't been rendered yet
      const div = document.createElement('div');
      div.innerHTML = state.tabContents[tabKey];
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
    prop = resolveRef(prop.$ref, state.currentSchema);
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

  const choiceConfig = state.customOptions[key] || state.customOptions[pathStr];
  
  let inputHtml = '';
  let isDependent = false;
  let depField = null;

  if (choiceConfig && typeof choiceConfig === 'object' && !Array.isArray(choiceConfig)) {
    isDependent = !!choiceConfig.dependent_values;
    if (isDependent) {
      depField = Object.keys(choiceConfig.dependent_values)[0];
    }
    inputHtml = createInputControl(key, prop, pathStr, choiceConfig, isRequired, isDependent, depField);
    
  } else if (Array.isArray(choiceConfig)) {
    const legacyConfig = {
      values: choiceConfig,
      input_control: 'drop-down',
      response_type: type === 'array' ? 'multi-select' : 'single-select'
    };
    inputHtml = createInputControl(key, prop, pathStr, legacyConfig, isRequired, false, null);
    
  } else if (prop.enum && prop.enum.length > 0) {
    const enumConfig = {
      values: prop.enum,
      input_control: 'drop-down',
      response_type: type === 'array' ? 'multi-select' : 'single-select'
    };
    inputHtml = createInputControl(key, prop, pathStr, enumConfig, isRequired, false, null);
    
  } else {
    inputHtml = createDefaultInput(pathStr, prop, isRequired);
  }

  return `
    <div class="form-group" data-field-path="${pathStr}">
      <label class="${isRequired ? 'required' : ''}">${title}</label>
      ${description ? `<div class="description">${description}</div>` : ''}
      ${inputHtml}
    </div>`;
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

/**
 * Enhanced: Creates array field with support for recursive references
 * 
 * @param {string} key - Field key
 * @param {Object} prop - Property schema
 * @param {boolean} isRequired - Whether field is required
 * @param {Array} path - Path in data structure
 * @returns {string} HTML string for array field
 */
function createArrayOfObjects(key, prop, isRequired, path) {
  const title = prop.title || key;
  const description = prop.description || '';
  const pathStr = path.join('.');
  
  // Check if array items are recursive (self-referencing)
  const itemSchema = prop.items;
  const isRecursive = itemSchema?.$ref && 
                     (itemSchema.$ref === '#' || itemSchema.$ref.startsWith('#/'));
  
  // FIXED: Always apply proper escaping for HTML attributes
  let itemSchemaData;
  if (isRecursive) {
    // For recursive refs, store a marker
    const markerObj = { __recursive: true, ref: itemSchema.$ref };
    itemSchemaData = JSON.stringify(markerObj).replace(/"/g, '&quot;');
  } else {
    // For non-recursive, store the actual schema
    itemSchemaData = JSON.stringify(itemSchema).replace(/"/g, '&quot;');
  }
  
  console.log('🔧 Creating array field:', {
    path: pathStr,
    isRecursive,
    ref: itemSchema?.$ref,
    escapedData: itemSchemaData.substring(0, 100) // Log first 100 chars
  });
  
  return `
    <div class="form-group" data-field-path="${pathStr}">
      <label class="${isRequired ? 'required' : ''}">${title}</label>
      ${description ? `<div class="description">${description}</div>` : ''}
      <div class="array-container ${isRecursive ? 'recursive-array' : ''}" 
           id="array_${pathStr.replace(/\./g, '_')}" 
           data-path="${pathStr}"
           ${isRecursive ? `data-recursive="true" data-ref="${itemSchema.$ref}"` : ''}
           data-item-schema="${itemSchemaData}">
        <div class="array-controls">
          <button type="button" class="add-array-item-btn" onclick="addArrayItem('${pathStr}')">Add Item</button>
        </div>
      </div>
    </div>
  `;
}


/**
 * NEW: Resolves recursive references safely
 * For "#" reference, returns the top-level polymorphic options
 * 
 * @param {string} ref - Reference string (e.g., "#")
 * @param {string} arrayPath - Current array path for context
 * @returns {Object} Resolved schema (safe for rendering)
 */
function resolveRecursiveReference(ref, arrayPath) {
  console.log('🔄 Resolving recursive reference:', ref, 'for path:', arrayPath);
  
  if (ref === '#') {
    // Reference to root schema
    console.log('📍 Root reference detected');
    
    // For rule_data_schema, root has oneOf with atomicRule and groupRule
    if (state.currentSchema.oneOf || state.currentSchema.anyOf) {
      console.log('✅ Root has polymorphic structure (oneOf/anyOf)');
      return {
        __polymorphic: true,
        oneOf: state.currentSchema.oneOf,
        anyOf: state.currentSchema.anyOf,
        title: 'Rule',
        type: 'object'
      };
    }
    
    // Fallback: return root properties if available
    if (state.currentSchema.properties) {
      console.log('✅ Using root properties as schema');
      return {
        type: 'object',
        properties: state.currentSchema.properties,
        required: state.currentSchema.required || []
      };
    }
    
    console.warn('⚠️  Root schema has neither oneOf/anyOf nor properties');
    return null;
  }
  
  // For other references, try normal resolution
  console.log('🔗 Attempting normal $ref resolution for:', ref);
  const resolved = resolveRef(ref, state.currentSchema);
  
  if (!resolved) {
    console.error('❌ Could not resolve reference:', ref);
    return null;
  }
  
  console.log('✅ Resolved reference:', resolved);
  return resolved;
}


/**
 * NEW: Creates complex array item (object, polymorphic, nested)
 * 
 * @param {string} arrayPath - Path to array
 * @param {Object} itemSchema - Schema for array item
 * @param {number} index - Item index
 * @param {HTMLElement} container - Array container element
 */
function createComplexArrayItem(arrayPath, itemSchema, index, container) {
  console.log('🎨 Creating complex array item:', { arrayPath, index });
  
  const itemDiv = document.createElement('div');
  itemDiv.className = 'array-item';
  itemDiv.dataset.index = index;
  itemDiv.dataset.arrayPath = arrayPath;
  
  // Create header with remove button
  const headerDiv = document.createElement('div');
  headerDiv.className = 'array-item-header';
  headerDiv.innerHTML = `
    <span class="array-item-title">Item ${index + 1}</span>
    <button type="button" class="remove-item-btn" onclick="removeArrayItem(this)">Remove</button>
  `;
  itemDiv.appendChild(headerDiv);
  
  // Create content area
  const contentDiv = document.createElement('div');
  contentDiv.className = 'array-item-content';
  contentDiv.id = `array-item-content-${arrayPath.replace(/\./g, '_')}-${index}`;
  
  // Handle different schema types
  if (itemSchema.__polymorphic || itemSchema.oneOf || itemSchema.anyOf) {
    // Polymorphic item - create type selector
    console.log('🎨 Creating polymorphic array item');
    renderPolymorphicArrayItem(itemSchema, contentDiv, arrayPath, index);
  } else if (itemSchema.properties) {
    // Object with properties
    console.log('🎨 Creating object array item with properties:', Object.keys(itemSchema.properties));
    const properties = itemSchema.properties || {};
    const required = itemSchema.required || [];
    
    for (const [subKey, subProp] of Object.entries(properties)) {
      const isSubRequired = required.includes(subKey);
      const fieldPath = [arrayPath, index, subKey];
      const fieldHtml = createField(subKey, subProp, isSubRequired, fieldPath);
      const div = document.createElement('div');
      div.innerHTML = fieldHtml;
      contentDiv.appendChild(div.firstElementChild);
    }
  } else {
    console.warn('⚠️  Unknown complex item schema:', itemSchema);
    contentDiv.innerHTML = '<p style="color: orange;">⚠️ Unknown schema structure</p>';
  }
  
  itemDiv.appendChild(contentDiv);
  
  // Insert before controls
  const controls = container.querySelector('.array-controls');
  if (controls) {
    container.insertBefore(itemDiv, controls);
    console.log('✅ Array item inserted before controls');
  } else {
    container.appendChild(itemDiv);
    console.log('⚠️  No controls found, appended to container');
  }
}

/**
 * NEW: Creates simple array item (string, number, etc.)
 * 
 * @param {string} arrayPath - Path to array
 * @param {Object} itemSchema - Schema for array item
 * @param {number} index - Item index
 * @param {HTMLElement} container - Array container element
 */
function createSimpleArrayItem(arrayPath, itemSchema, index, container) {
  const itemDiv = document.createElement('div');
  itemDiv.className = 'array-item array-item-simple';
  itemDiv.dataset.index = index;
  
  const itemPath = `${arrayPath}.${index}`;
  const inputType = getInputTypeFromSchema(itemSchema);
  
  itemDiv.innerHTML = `
    <div class="array-item-simple-content">
      <input type="${inputType}" 
             name="${itemPath}" 
             data-path="${itemPath}"
             placeholder="Item ${index + 1}"
             class="array-item-input">
      <button type="button" class="remove-item-btn" onclick="removeArrayItem(this)">×</button>
    </div>
  `;
  
  // Insert before controls
  const controls = container.querySelector('.array-controls');
  container.insertBefore(itemDiv, controls);
}

/**
 * NEW: Renders polymorphic item in array (with type selector)
 * 
 * @param {Object} schema - Schema with oneOf/anyOf
 * @param {HTMLElement} container - Container to render into
 * @param {string} arrayPath - Path to array
 * @param {number} index - Item index
 */
function renderPolymorphicArrayItem(schema, container, arrayPath, index) {
  console.log('🎨 Rendering polymorphic array item:', { arrayPath, index });
  
  const options = schema.oneOf || schema.anyOf || [];
  
  if (options.length === 0) {
    console.error('❌ No options in polymorphic array item');
    container.innerHTML = '<p style="color: red;">❌ No type options available</p>';
    return;
  }
  
  console.log('📋 Available options:', options.length);
  
  // Create type selector
  const selectorGroup = document.createElement('div');
  selectorGroup.className = 'form-group';
  
  const label = document.createElement('label');
  label.className = 'required';
  label.textContent = 'Type';
  selectorGroup.appendChild(label);
  
  const select = document.createElement('select');
  select.className = 'array-item-type-selector';
  const selectId = `array-type-${arrayPath.replace(/\./g, '_')}-${index}`;
  select.id = selectId;
  select.dataset.arrayPath = arrayPath;
  select.dataset.index = index;
  
  console.log('📋 Creating selector with ID:', selectId);
  
  // Default option
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '-- Select Type --';
  select.appendChild(defaultOpt);
  
  // Add options
  options.forEach((option, optIndex) => {
    const opt = document.createElement('option');
    opt.value = optIndex;
    
    // Get title
    let title = option.title;
    if (!title && option.$ref) {
      const resolved = resolveRef(option.$ref, state.currentSchema);
      title = resolved?.title || option.$ref.split('/').pop();
    }
    
    opt.textContent = title || `Option ${optIndex + 1}`;
    console.log(`  Option ${optIndex}: ${opt.textContent}`);
    select.appendChild(opt);
  });
  
  selectorGroup.appendChild(select);
  container.appendChild(selectorGroup);
  
  // Create dynamic content area
  const dynamicContent = document.createElement('div');
  dynamicContent.className = 'array-item-dynamic-content';
  dynamicContent.id = `array-item-dynamic-${arrayPath.replace(/\./g, '_')}-${index}`;
  container.appendChild(dynamicContent);
  
  console.log('✅ Polymorphic selector created, attaching change handler');
  
  // Add change handler
  select.addEventListener('change', (e) => {
    const selectedIndex = parseInt(e.target.value);
    console.log('🔄 Array item type changed to index:', selectedIndex);
    
    dynamicContent.innerHTML = '';
    
    if (selectedIndex >= 0 && selectedIndex < options.length) {
      let selectedOption = options[selectedIndex];
      
      console.log('📋 Selected option:', selectedOption);
      
      // Resolve reference
      if (selectedOption.$ref) {
        console.log('🔗 Resolving $ref:', selectedOption.$ref);
        selectedOption = resolveRef(selectedOption.$ref, state.currentSchema);
        console.log('✅ Resolved to:', selectedOption);
      }
      
      if (!selectedOption) {
        console.error('❌ Failed to resolve option');
        dynamicContent.innerHTML = '<p style="color: red;">❌ Failed to load option</p>';
        return;
      }
      
      console.log('🎨 Rendering selected option:', selectedOption.title || 'Untitled');
      
      // Render the option
      const itemPath = [arrayPath, index];
      renderPolymorphicOption(selectedOption, dynamicContent, itemPath, 0);
      
      console.log('✅ Option rendered successfully');
    }
  });
  
  console.log('✅ Polymorphic array item setup complete');
}

/**
 * Helper: Gets input type from schema
 */
function getInputTypeFromSchema(schema) {
  if (schema.type === 'number' || schema.type === 'integer') {
    return 'number';
  }
  if (schema.type === 'boolean') {
    return 'checkbox';
  }
  if (schema.format === 'date') {
    return 'date';
  }
  if (schema.format === 'email') {
    return 'email';
  }
  return 'text';
}

window.toggleNested = function(header) {
  header.classList.toggle('collapsed');
  header.nextElementSibling.nextElementSibling.classList.toggle('collapsed');
};


/**
 * Enhanced: Adds item to array with recursive reference support
 * Now reads schema from data attribute instead of parameter
 * 
 * @param {string} arrayPath - Path to the array field
 */
window.addArrayItem = function(arrayPath) {
  console.log('➕ Adding array item to:', arrayPath);
  
  // FIXED: Handle path with dots - need to escape for ID selector
  const escapedPath = arrayPath.replace(/\./g, '_');
  const container = document.getElementById('array_' + escapedPath);
  
  if (!container) {
    console.error('❌ Array container not found. Tried:', 'array_' + escapedPath);
    console.log('Available containers:', 
      Array.from(document.querySelectorAll('.array-container')).map(el => el.id)
    );
    return;
  }
  
  console.log('✅ Found container:', container.id);
  console.log('📦 Container datasets:', container.dataset);
  
  // Get item schema from data attribute
  const itemSchemaData = container.dataset.itemSchema;
  if (!itemSchemaData) {
    console.error('❌ No item schema found in dataset');
    console.log('Available dataset keys:', Object.keys(container.dataset));
    return;
  }
  
  console.log('📄 Raw schema data (first 200 chars):', itemSchemaData.substring(0, 200));
  
  // FIXED: Properly unescape HTML entities before parsing
  let itemSchema;
  try {
    // Convert HTML entities back to quotes
    const unescaped = itemSchemaData.replace(/&quot;/g, '"')
                                    .replace(/&apos;/g, "'")
                                    .replace(/&lt;/g, '<')
                                    .replace(/&gt;/g, '>')
                                    .replace(/&amp;/g, '&');
    
    console.log('📄 Unescaped data:', unescaped.substring(0, 200));
    
    itemSchema = JSON.parse(unescaped);
    console.log('✅ Parsed item schema:', itemSchema);
  } catch (e) {
    console.error('❌ Failed to parse item schema:', e);
    console.error('Raw data:', itemSchemaData);
    console.error('Attempted to parse:', itemSchemaData.replace(/&quot;/g, '"'));
    alert('Error: Unable to parse array item schema. Check console for details.');
    return;
  }
  
  // Check if this is a recursive reference
  if (itemSchema.__recursive) {
    console.log('🔄 Handling recursive reference:', itemSchema.ref);
    itemSchema = resolveRecursiveReference(itemSchema.ref, arrayPath);
    
    if (!itemSchema) {
      console.error('❌ Failed to resolve recursive reference:', itemSchema.ref);
      return;
    }
    console.log('✅ Resolved recursive schema:', itemSchema);
  }
  
  // Handle $ref if present (non-recursive case)
  if (itemSchema.$ref && !itemSchema.__recursive) {
    console.log('🔗 Resolving $ref:', itemSchema.$ref);
    const resolved = resolveRef(itemSchema.$ref, state.currentSchema);
    if (resolved) {
      itemSchema = resolved;
      console.log('✅ Resolved $ref:', itemSchema);
    } else {
      console.error('❌ Could not resolve $ref:', itemSchema.$ref);
      return;
    }
  }
  
  const items = container.querySelectorAll('.array-item');
  const index = items.length;
  
  console.log('📦 Creating array item at index:', index);
  console.log('📋 Item schema type:', itemSchema.type, 'Has oneOf:', !!itemSchema.oneOf);
  
  // Determine if this is a simple type or complex object
  if (itemSchema.type === 'object' || itemSchema.properties || itemSchema.oneOf || 
      itemSchema.anyOf || itemSchema.__polymorphic) {
    createComplexArrayItem(arrayPath, itemSchema, index, container);
  } else {
    createSimpleArrayItem(arrayPath, itemSchema, index, container);
  }
  
  console.log('✅ Array item created successfully');
  
  // Reattach event listeners
  setTimeout(() => attachEventListeners(), 100);
};

/**
 * Enhanced: Remove array item (already exists but ensure it updates indices)
 */
window.removeArrayItem = function(btn) {
  console.log('🗑️  Removing array item');
  
  const item = btn.closest('.array-item');
  if (!item) {
    console.error('❌ Could not find array item to remove');
    return;
  }
  
  const container = item.closest('.array-container');
  const arrayPath = container?.dataset.path;
  
  console.log('🗑️  Removing item from:', arrayPath);
  
  item.remove();
  
  // Update remaining item numbers and paths
  const items = container.querySelectorAll('.array-item');
  console.log(`📊 Remaining items: ${items.length}`);
  
  items.forEach((item, idx) => {
    item.dataset.index = idx;
    const title = item.querySelector('.array-item-title');
    if (title) {
      title.textContent = `Item ${idx + 1}`;
    }
    
    // Update data-path attributes for simple items
    const input = item.querySelector('.array-item-input');
    if (input && arrayPath) {
      const newPath = `${arrayPath}.${idx}`;
      input.dataset.path = newPath;
      input.name = newPath;
    }
  });
  
  console.log('✅ Array item removed and indices updated');
};

export {
    renderForm,
    renderAllTabs,
    createField,
    switchTab
};
// ==== END OF PROGRAM ====/