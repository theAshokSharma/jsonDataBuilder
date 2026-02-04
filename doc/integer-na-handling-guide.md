# Handling Integer/Number Fields with N/A Values

## Problem Statement

In the CK Score schema, integer fields like `mbr_cig_a_day` and `mbr_cig_total_yrs` need to support:
1. **Numeric input** when applicable (e.g., user smokes)
2. **N/A value** when disabled by conditional rules (e.g., user doesn't smoke)

Current implementation in `setDisabledFieldValue()` sets `-9999` for disabled integer/number fields, but this approach has limitations.

## Current Behavior

### In `conditional-rules.js` (lines 129-187):
```javascript
function setDisabledFieldValue(fieldPath, fieldGroup) {
  const fieldType = getFieldTypeFromSchema(fieldPath);
  let defaultValue;
  
  if (fieldType === 'integer' || fieldType === 'number') {
    defaultValue = -9999;  // ❌ Problematic approach
  } else if (fieldType === 'date') {
    defaultValue = '1900-01-01';
  } else {
    defaultValue = 'N/A';
  }
  
  const numberInput = fieldGroup.querySelector(`input[type="number"][data-path="${fieldPath}"]`);
  if (numberInput) {
    numberInput.value = defaultValue;  // Sets -9999
    return;
  }
  // ...
}
```

### Issues with Current Approach:
1. **Data Quality**: `-9999` in database is confusing (magic number)
2. **User Experience**: Users see `-9999` in the disabled field
3. **Validation**: `-9999` may fail schema validation (no min/max defined for it)
4. **Analytics**: Need to filter out `-9999` in reporting

---

## Recommended Solutions

### Solution 1: Use Null/Empty for Disabled Fields (Recommended)

#### Schema Modification
Make conditional fields **not required** or use `anyOf` to allow null:

```json
{
  "mbr_cig_a_day": {
    "anyOf": [
      {
        "type": "integer",
        "minimum": 0,
        "maximum": 100,
        "title": "Approximate number of cigarettes you smoke/smoked a day?"
      },
      {
        "type": "null",
        "title": "Not Applicable"
      }
    ],
    "title": "Cigarettes per Day"
  },
  "mbr_cig_total_yrs": {
    "anyOf": [
      {
        "type": "integer",
        "minimum": 0,
        "maximum": 100,
        "title": "For how many total years did you smoke?"
      },
      {
        "type": "null",
        "title": "Not Applicable"
      }
    ],
    "title": "Total Years Smoking"
  }
}
```

#### Updated `setDisabledFieldValue()`:
```javascript
function setDisabledFieldValue(fieldPath, fieldGroup) {
  const fieldType = getFieldTypeFromSchema(fieldPath);
  let defaultValue;
  
  if (fieldType === 'integer' || fieldType === 'number') {
    defaultValue = null;  // ✅ Use null instead of -9999
  } else if (fieldType === 'date') {
    defaultValue = null;  // ✅ Use null for dates too
  } else {
    defaultValue = 'N/A';
  }
  
  const numberInput = fieldGroup.querySelector(`input[type="number"][data-path="${fieldPath}"]`);
  if (numberInput) {
    numberInput.value = '';  // ✅ Empty string (renders as blank)
    numberInput.setAttribute('data-disabled-value', 'null');  // Store intent
    return;
  }
  
  const dateInput = fieldGroup.querySelector(`input[type="date"][data-path="${fieldPath}"]`);
  if (dateInput) {
    dateInput.value = '';  // ✅ Empty string
    dateInput.setAttribute('data-disabled-value', 'null');
    return;
  }
  // ...
}
```

#### Updated Data Collection (in `data-builder.js`):
```javascript
// In collectFormData() function
else if (input.type === 'number') {
  const fieldGroup = input.closest('.form-group');
  const isDisabled = fieldGroup?.classList.contains('disabled');
  
  if (isDisabled && input.getAttribute('data-disabled-value') === 'null') {
    setNestedValue(data, path, null);  // ✅ Export as null
  } else {
    setNestedValue(data, path, input.value ? Number(input.value) : null);
  }
  processedPaths.add(path);
}
```

**Benefits:**
- ✅ Clean data (null = not applicable)
- ✅ Standard JSON practice
- ✅ No magic numbers
- ✅ Easy analytics (just filter out nulls)
- ✅ Clear semantic meaning

---

### Solution 2: Use Dropdown with N/A Option

Make the field a dropdown when it needs N/A support.

#### Schema Modification
```json
{
  "mbr_cig_a_day": {
    "anyOf": [
      {
        "type": "integer"
      },
      {
        "type": "string",
        "enum": ["N/A"]
      }
    ],
    "title": "Approximate number of cigarettes you smoke/smoked a day?"
  }
}
```

#### Options File Configuration
```json
{
  "lifestyle.mbr_cig_a_day": {
    "input_control": "drop-down",
    "response_type": "single-select",
    "values": ["0", "1-5", "6-10", "11-20", "21-30", "31-40", "40+"],
    "na": "N/A"
  },
  "lifestyle.mbr_cig_total_yrs": {
    "input_control": "slider",
    "values": ["0-100"],
    "na": "N/A"
  }
}
```

#### Updated `setDisabledFieldValue()`:
```javascript
function setDisabledFieldValue(fieldPath, fieldGroup) {
  const fieldType = getFieldTypeFromSchema(fieldPath);
  let defaultValue = 'N/A';  // ✅ Use N/A for all types
  
  // Check if field has a custom options configuration
  const customConfig = state.customOptions[fieldPath];
  if (customConfig && customConfig.na) {
    defaultValue = customConfig.na;  // Use configured N/A value
  }
  
  // Try select/dropdown first
  const selectInput = fieldGroup.querySelector(`select[data-path="${fieldPath}"]`);
  if (selectInput) {
    let naOption = Array.from(selectInput.options).find(opt => opt.value === defaultValue);
    if (!naOption) {
      naOption = document.createElement('option');
      naOption.value = defaultValue;
      naOption.textContent = defaultValue;
      selectInput.appendChild(naOption);
    }
    selectInput.value = defaultValue;
    return;
  }
  
  // For multi-select
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
  
  // For number inputs (fallback)
  const numberInput = fieldGroup.querySelector(`input[type="number"][data-path="${fieldPath}"]`);
  if (numberInput) {
    numberInput.value = '';
    numberInput.setAttribute('data-disabled-value', defaultValue);
    return;
  }
  
  // For text inputs
  const textInput = fieldGroup.querySelector(`input[type="text"][data-path="${fieldPath}"], input[type="email"][data-path="${fieldPath}"]`);
  if (textInput) {
    textInput.value = defaultValue;
    return;
  }
  
  // For date inputs
  const dateInput = fieldGroup.querySelector(`input[type="date"][data-path="${fieldPath}"]`);
  if (dateInput) {
    dateInput.value = '';
    dateInput.setAttribute('data-disabled-value', defaultValue);
    return;
  }
}
```

**Benefits:**
- ✅ Explicit N/A option
- ✅ Works with dropdowns and sliders
- ✅ User-friendly
- ✅ No ambiguity in data

---

### Solution 3: Schema with Conditional Required Fields

Use JSON Schema conditionals to make fields required only when applicable.

#### Schema Example
```json
{
  "properties": {
    "mbr_smoke_cigarette": {
      "type": "string",
      "title": "Do you smoke cigarettes?",
      "enum": ["Yes", "No", "Previously"]
    },
    "mbr_cig_a_day": {
      "type": "integer",
      "minimum": 0,
      "maximum": 100,
      "title": "Cigarettes per day"
    },
    "mbr_cig_total_yrs": {
      "type": "integer",
      "minimum": 0,
      "maximum": 100,
      "title": "Total years smoking"
    }
  },
  "required": ["mbr_smoke_cigarette"],
  "allOf": [
    {
      "if": {
        "properties": {
          "mbr_smoke_cigarette": {
            "enum": ["Yes", "Previously"]
          }
        }
      },
      "then": {
        "required": ["mbr_cig_a_day", "mbr_cig_total_yrs"]
      }
    }
  ]
}
```

**Benefits:**
- ✅ Schema-driven validation
- ✅ Fields only required when relevant
- ✅ Standard JSON Schema approach

---

## Implementation Recommendations

### For Your CK Score Schema

#### Step 1: Identify Conditional Integer Fields
From the schema, these integer fields likely need conditional handling:
- `lifestyle.mbr_cig_a_day` (lines 191-194)
- `lifestyle.mbr_cig_total_yrs` (lines 195-198)
- `lifestyle.mbr_cig_start_year` (lines 199-202)
- `lifestyle.mbr_cig_end_year` (lines 203-206)
- `lifestyle.mbr_drink_avg_consumption` (lines 227-230)
- `lifestyle.mbr_mod_intense_hrs` (lines 259-262)
- `lifestyle.mbr_mod_intense_mins` (lines 263-266)
- `lifestyle.mbr_vigorous_hrs` (lines 267-270)
- `lifestyle.mbr_vigorous_mins` (lines 271-274)

#### Step 2: Update Schema (Recommended Approach)
```json
{
  "LifeStyle": {
    "properties": {
      "mbr_smoke_cigarette": {
        "title": "Do you smoke cigarettes?",
        "type": "string"
      },
      "mbr_cig_a_day": {
        "anyOf": [
          {
            "type": "integer",
            "minimum": 0,
            "maximum": 200,
            "title": "Number of cigarettes"
          },
          {
            "type": "null"
          }
        ],
        "title": "Approximate number of cigarettes you smoke/smoked a day?"
      },
      "mbr_cig_total_yrs": {
        "anyOf": [
          {
            "type": "integer",
            "minimum": 0,
            "maximum": 100,
            "title": "Years smoking"
          },
          {
            "type": "null"
          }
        ],
        "title": "For how many total years did you smoke?"
      },
      "mbr_cig_start_year": {
        "anyOf": [
          {
            "type": "integer",
            "minimum": 1900,
            "maximum": 2100
          },
          {
            "type": "null"
          }
        ],
        "title": "Year you started smoking"
      },
      "mbr_cig_end_year": {
        "anyOf": [
          {
            "type": "integer",
            "minimum": 1900,
            "maximum": 2100
          },
          {
            "type": "null"
          }
        ],
        "title": "Year you stopped smoking"
      }
    },
    "required": [
      "mbr_smoke_cigarette"
      // Note: mbr_cig_a_day, mbr_cig_total_yrs NOT required
    ]
  }
}
```

#### Step 3: Create Options File
```json
{
  "lifestyle.mbr_smoke_cigarette": {
    "input_control": "radio-button",
    "response_type": "single-select",
    "values": ["Yes", "No", "Previously"]
  },
  "lifestyle.mbr_cig_a_day": {
    "input_control": "drop-down",
    "response_type": "single-select",
    "values": [
      {"value": "0", "label": "0 (None)"},
      {"value": "1", "label": "1-5"},
      {"value": "6", "label": "6-10"},
      {"value": "11", "label": "11-20"},
      {"value": "21", "label": "21-30"},
      {"value": "31", "label": "31-40"},
      {"value": "41", "label": "40+"}
    ],
    "na": {"value": "N/A", "label": "Not Applicable"},
    "dependent_values": {
      "lifestyle.mbr_smoke_cigarette": {
        "No": {
          "values": [],
          "input_control": "text"
        }
      }
    }
  },
  "lifestyle.mbr_cig_total_yrs": {
    "input_control": "slider",
    "values": ["0-100"],
    "na": {"value": "N/A", "label": "Not Applicable"}
  },
  
  "conditional_rules": {
    "lifestyle.mbr_smoke_cigarette": [
      {
        "value": "No",
        "disable_fields": [
          "lifestyle.mbr_cig_a_day",
          "lifestyle.mbr_cig_total_yrs",
          "lifestyle.mbr_cig_start_year",
          "lifestyle.mbr_cig_end_year"
        ]
      }
    ]
  }
}
```

#### Step 4: Update `setDisabledFieldValue()` in `conditional-rules.js`

Replace lines 129-187 with:

```javascript
function setDisabledFieldValue(fieldPath, fieldGroup) {
  const fieldType = getFieldTypeFromSchema(fieldPath);
  let defaultValue;
  
  // Check if field has custom N/A configuration
  const customConfig = state.customOptions[fieldPath];
  const hasCustomNA = customConfig && customConfig.na;
  
  if (hasCustomNA) {
    // Use configured N/A value
    defaultValue = typeof customConfig.na === 'object' 
      ? customConfig.na.value 
      : customConfig.na;
  } else if (fieldType === 'integer' || fieldType === 'number') {
    defaultValue = null;  // Use null for numeric fields
  } else if (fieldType === 'date') {
    defaultValue = null;  // Use null for dates
  } else {
    defaultValue = 'N/A';  // String fields get 'N/A'
  }
  
  // Try select/dropdown
  const selectInput = fieldGroup.querySelector(`select[data-path="${fieldPath}"]`);
  if (selectInput) {
    let naOption = Array.from(selectInput.options).find(opt => opt.value === String(defaultValue));
    if (!naOption && defaultValue !== null) {
      naOption = document.createElement('option');
      naOption.value = String(defaultValue);
      naOption.textContent = hasCustomNA && typeof customConfig.na === 'object' 
        ? customConfig.na.label 
        : String(defaultValue);
      selectInput.appendChild(naOption);
    }
    selectInput.value = defaultValue !== null ? String(defaultValue) : '';
    return;
  }
  
  // Try multi-select
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
  
  // Number input
  const numberInput = fieldGroup.querySelector(`input[type="number"][data-path="${fieldPath}"]`);
  if (numberInput) {
    numberInput.value = '';  // Show as blank
    numberInput.setAttribute('data-disabled-value', defaultValue !== null ? String(defaultValue) : 'null');
    return;
  }
  
  // Text/email input
  const textInput = fieldGroup.querySelector(`input[type="text"][data-path="${fieldPath}"], input[type="email"][data-path="${fieldPath}"]`);
  if (textInput) {
    textInput.value = defaultValue !== null ? String(defaultValue) : '';
    return;
  }
  
  // Date input
  const dateInput = fieldGroup.querySelector(`input[type="date"][data-path="${fieldPath}"]`);
  if (dateInput) {
    dateInput.value = '';  // Show as blank
    dateInput.setAttribute('data-disabled-value', defaultValue !== null ? String(defaultValue) : 'null');
    return;
  }
}
```

#### Step 5: Update Data Collection in `data-builder.js`

In the `collectFormData()` function, update number field handling (around line 345):

```javascript
else if (input.type === 'number') {
  const fieldGroup = input.closest('.form-group');
  const isDisabled = fieldGroup?.classList.contains('disabled');
  
  if (isDisabled) {
    const disabledValue = input.getAttribute('data-disabled-value');
    if (disabledValue === 'null' || disabledValue === null) {
      setNestedValue(data, path, null);
    } else {
      setNestedValue(data, path, disabledValue);
    }
  } else {
    setNestedValue(data, path, input.value ? Number(input.value) : null);
  }
  processedPaths.add(path);
}
```

---

## Testing Checklist

- [ ] Load schema and options file
- [ ] Select "No" for `mbr_smoke_cigarette`
- [ ] Verify `mbr_cig_a_day` shows as blank or N/A (not -9999)
- [ ] Save data and verify JSON has `null` (not -9999)
- [ ] Load saved data - disabled fields should remain disabled
- [ ] Change to "Yes" - fields should enable and allow input
- [ ] Validate that only valid numbers are accepted when enabled
- [ ] Export to clipboard and verify clean JSON structure

---

## Summary

**Best Practice Recommendation:**
Use **Solution 1** (null/empty for disabled fields) with schema modification to support `anyOf` with null type. This provides:
- Clean, semantic data (null = not applicable)
- No magic numbers
- Standard JSON practice
- Easy backend processing
- Clear validation rules

The key files to modify are:
1. `ckscore_schema.json` - Add `anyOf` with null option
2. Options file - Configure N/A values
3. `conditional-rules.js` - Update `setDisabledFieldValue()`
4. `data-builder.js` - Update number field collection

This approach ensures professional data handling and maintains data integrity throughout the application lifecycle.
