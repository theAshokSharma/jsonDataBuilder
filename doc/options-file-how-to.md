Options File Documentation
Overview
The Options File is a JSON configuration file that enhances schema-based forms by defining dropdown values, field behaviors, dependencies, and conditional rules. This document explains how to create an options file for your JSON schema.

Table of Contents

Basic Structure
Response Types
Single-Select Fields
Multi-Select Fields
Exclusive Values
N/A Options
Range Values
Dependent Values
Conditional Rules
Complete Examples


Basic Structure
The options file is a JSON object where each key corresponds to a field path in your schema, and the value defines how that field should behave.
Key Format
Use dot notation to reference nested fields:
"section.subsection.field_name"
Example Schema Structure
json{
  "properties": {
    "demographic": {
      "$ref": "#/$defs/Demographic"
    }
  },
  "$defs": {
    "Demographic": {
      "properties": {
        "mbr_gender_at_birth": {
          "type": "string",
          "title": "Your Gender At Birth"
        }
      }
    }
  }
}
Corresponding Options Key
json{
  "demographic.mbr_gender_at_birth": {
    "values": ["Female", "Male"],
    "response_type": "single-select"
  }
}

Response Types
Every field configuration must specify a response_type:

"single-select" - User can select only one value (dropdown)
"multi-select" - User can select multiple values (checkboxes)


Single-Select Fields
Single-select fields present a dropdown where the user can choose one option.
Basic Example
json{
  "demographic.mbr_gender_at_birth": {
    "values": ["Female", "Male"],
    "response_type": "single-select"
  }
}
```

**Result:**
```
Your Gender At Birth: [-- Select --  ▼]
                      Female
                      Male
With Many Options
json{
  "demographic.mbr_ethnicity": {
    "values": [
      "Aboriginal Australian",
      "Afro-Caribbean",
      "Arab",
      "Chinese (Han)",
      "Hispanic",
      "Indian",
      "Irish",
      "Japanese",
      "Mexican",
      "Other"
    ],
    "response_type": "single-select"
  }
}
Result: A dropdown with 10 ethnicity options.

Multi-Select Fields
Multi-select fields display checkboxes allowing users to select multiple values.
Basic Example
json{
  "demographic.mbr_country_lived_in": {
    "values": [
      "Chile (Andean region)",
      "China",
      "Columbia",
      "Costa Rica",
      "Japan",
      "South Korea",
      "None of the listed options"
    ],
    "response_type": "multi-select"
  }
}
```

**Result:**
```
Member Country Lived In:
☐ Chile (Andean region)
☐ China
☐ Columbia
☐ Costa Rica
☐ Japan
☐ South Korea
☐ None of the listed options

Exclusive Values
Exclusive values automatically deselect all other options when selected. This is useful for options like "None", "N/A", or "Unknown".
Configuration
json{
  "demographic.mbr_country_lived_in": {
    "values": [
      "Chile (Andean region)",
      "China",
      "Japan",
      "None of the listed options"
    ],
    "response_type": "multi-select",
    "exclusive_values": ["None of the listed options"]
  }
}
```

### Behavior

1. **User selects countries:**
```
   ☑ China
   ☑ Japan
   ☐ None of the listed options
```

2. **User then selects "None of the listed options":**
```
   ☐ China              ← Automatically unchecked
   ☐ Japan              ← Automatically unchecked
   ☑ None of the listed options
```

3. **User selects a country while "None" is checked:**
```
   ☑ China
   ☐ None of the listed options  ← Automatically unchecked
Multiple Exclusive Values
You can have multiple exclusive values:
json{
  "medical_history.mbr_family_cancer_hist": {
    "values": [
      "Unknown/Unsure",
      "Breast Cancer",
      "Lung Cancer",
      "Prostate Cancer",
      "None of the listed options"
    ],
    "response_type": "multi-select",
    "exclusive_values": ["None of the listed options", "Unknown/Unsure"]
  }
}
Result: Both "None of the listed options" and "Unknown/Unsure" are exclusive - selecting either will deselect all other options.

N/A Options
The na property adds a special "N/A" option that behaves as an exclusive value.
Single-Select with N/A
json{
  "lifestyle.mbr_smoke_cigar_pipe": {
    "values": [
      "No",
      "Yes"
    ],
    "na": "N/A",
    "response_type": "single-select"
  }
}
```

**Result:**
```
Do you smoke cigar or use a pipe? [-- Select --  ▼]
                                   No
                                   Yes
                                   N/A
Multi-Select with N/A
json{
  "carcinogen_exposure.mbr_occupation": {
    "values": [
      "Agriculture/Farming",
      "Construction",
      "Manufacturing",
      "None of the listed options"
    ],
    "na": "N/A",
    "response_type": "multi-select",
    "exclusive_values": ["None of the listed options", "N/A"]
  }
}
Behavior: N/A appears as an exclusive checkbox. When checked, all other options are unchecked.

Range Values
For numeric ranges, use the format "start-end" which will be automatically expanded.
Example
json{
  "lifestyle.mbr_cig_a_day": {
    "values": ["1-50"],
    "response_type": "single-select"
  }
}
Result: Dropdown with options: 1, 2, 3, 4, 5, ..., 48, 49, 50
Multiple Ranges
json{
  "age_groups": {
    "values": ["18-25", "26-40", "41-65", "66-100"],
    "response_type": "single-select"
  }
}
Result: Dropdown with 86 individual age values: 18, 19, 20, ..., 99, 100

Dependent Values
Dependent values change the available options based on another field's value.
Basic Structure
json{
  "field_name": {
    "values": [...],  // Default values
    "response_type": "multi-select",
    "dependent_values": {
      "trigger_field_path": {
        "trigger_value_1": [...options...],
        "trigger_value_2": [...options...]
      }
    }
  }
}
Example: Gender-Dependent Cancer Types
json{
  "medical_history.mbr_cancer_types_hist": {
    "values": [
      "Breast Cancer",
      "Lung Cancer",
      "Skin Cancer",
      "None of the listed options"
    ],
    "response_type": "multi-select",
    "exclusive_values": ["None of the listed options"],
    "dependent_values": {
      "demographic.mbr_gender_at_birth": {
        "Female": [
          "Breast Cancer",
          "Cervical Cancer",
          "Ovarian Cancer",
          "Uterine Cancer",
          "Lung Cancer",
          "Skin Cancer",
          "None of the listed options"
        ],
        "Male": [
          "Prostate Cancer",
          "Testicular Cancer",
          "Breast Cancer",
          "Lung Cancer",
          "Skin Cancer",
          "None of the listed options"
        ]
      }
    }
  }
}
```

### Behavior Flow

1. **Initial State** (no gender selected):
```
   Select type of cancer:
   ☐ Breast Cancer
   ☐ Lung Cancer
   ☐ Skin Cancer
   ☐ None of the listed options
```

2. **User selects Gender = "Female":**
```
   Select type of cancer:
   ☐ Breast Cancer
   ☐ Cervical Cancer          ← Added
   ☐ Ovarian Cancer            ← Added
   ☐ Uterine Cancer            ← Added
   ☐ Lung Cancer
   ☐ Skin Cancer
   ☐ None of the listed options
```

3. **User changes Gender = "Male":**
```
   Select type of cancer:
   ☐ Prostate Cancer          ← Added
   ☐ Testicular Cancer        ← Added
   ☐ Breast Cancer
   ☐ Lung Cancer
   ☐ Skin Cancer
   ☐ None of the listed options
(Cervical, Ovarian, Uterine removed)
Important Notes

Previous selections are cleared when the trigger field changes
The dependent field is initially populated with the values array
Once the trigger field has a value, options switch to the corresponding array in dependent_values


Conditional Rules
Conditional rules automatically enable/disable fields based on another field's value.
Basic Structure
json{
  "conditional_rules": {
    "trigger_field_path": [
      {
        "value": "trigger_value",
        "disable_fields": [
          "field_to_disable_1",
          "field_to_disable_2"
        ]
      }
    ]
  }
}
Example: Gender-Based Field Visibility
json{
  "conditional_rules": {
    "demographic.mbr_gender_at_birth": [
      {
        "value": "Male",
        "disable_fields": [
          "lifestyle.mbr_birth_control_use",
          "medical_history.mbr_menstruating_age_12_55",
          "medical_history.mbr_ever_pregnant",
          "medical_history.mbr_menopause_status"
        ]
      },
      {
        "value": "Female",
        "disable_fields": [
          "medical_history.mbr_undescend_testes",
          "medical_history.mbr_CIS_testes"
        ]
      }
    ]
  }
}
Behavior

User selects Gender = "Male":

Pregnancy-related fields are disabled and grayed out
Values set to default (N/A for strings, -9999 for numbers, 1900-01-01 for dates)
Visual indicator shows: "Auto-disabled (based on demographic.mbr_gender_at_birth)"


User selects Gender = "Female":

Male-specific fields are disabled
Female-specific fields become enabled



Example: Smoking-Based Rules
json{
  "conditional_rules": {
    "lifestyle.mbr_smoke_cigarette": [
      {
        "value": "No",
        "disable_fields": [
          "lifestyle.mbr_cig_a_day",
          "lifestyle.mbr_cig_total_yrs"
        ]
      },
      {
        "value": "Yes",
        "disable_fields": [
          "lifestyle.mbr_smoke_cigar_pipe",
          "lifestyle.mbr_smoke_ecig_vape"
        ]
      }
    ]
  }
}
Logic: If user smokes cigarettes, disable cigar/vape questions. If they don't smoke cigarettes, disable cigarette quantity questions.
Multiple Triggers
You can have rules for multiple trigger fields:
json{
  "conditional_rules": {
    "medical_history.mbr_diag_cancer_que": [
      {
        "value": "No",
        "disable_fields": ["medical_history.mbr_cancer_types_hist"]
      }
    ],
    "genetics.mbr_genetic_test_que": [
      {
        "value": "No",
        "disable_fields": ["genetics.mbr_genetic_mutation"]
      }
    ]
  }
}

Complete Examples
Example 1: Simple Single-Select
Schema Field:
json{
  "lifestyle": {
    "properties": {
      "mbr_drink_alcohol_que": {
        "type": "string",
        "title": "How frequently do you consume alcohol?"
      }
    }
  }
}
Options Configuration:
json{
  "lifestyle.mbr_drink_alcohol_que": {
    "values": [
      "Never",
      "Daily",
      "Weekly",
      "Occasionally"
    ],
    "response_type": "single-select"
  }
}

Example 2: Multi-Select with Exclusives
Schema Field:
json{
  "medical_history": {
    "properties": {
      "mbr_vaccines": {
        "type": "array",
        "items": { "type": "string" },
        "title": "Select all the Vaccines you have received"
      }
    }
  }
}
Options Configuration:
json{
  "medical_history.mbr_vaccines": {
    "values": [
      "Unknown/Unsure",
      "HPV Vaccine",
      "Hepatitis B",
      "None of the listed options"
    ],
    "na": "N/A",
    "response_type": "multi-select",
    "exclusive_values": ["None of the listed options", "N/A", "Unknown/Unsure"]
  }
}
Result: User can select multiple vaccines, but selecting "None", "N/A", or "Unknown/Unsure" will deselect all others.

Example 3: Range Values with Conditional Rules
Schema Fields:
json{
  "lifestyle": {
    "properties": {
      "mbr_smoke_cigarette": {
        "type": "string",
        "title": "Do you smoke cigarettes?"
      },
      "mbr_cig_a_day": {
        "type": "integer",
        "title": "Approximate number of cigarettes you smoke/smoked a day?"
      },
      "mbr_cig_total_yrs": {
        "type": "integer",
        "title": "For how many total years did you smoke?"
      }
    }
  }
}
Options Configuration:
json{
  "lifestyle.mbr_smoke_cigarette": {
    "values": ["No", "Yes", "I Quit"],
    "response_type": "single-select"
  },
  "lifestyle.mbr_cig_a_day": {
    "values": ["1-50"],
    "response_type": "single-select"
  },
  "lifestyle.mbr_cig_total_yrs": {
    "values": ["1-40"],
    "response_type": "single-select"
  },
  "conditional_rules": {
    "lifestyle.mbr_smoke_cigarette": [
      {
        "value": "No",
        "disable_fields": [
          "lifestyle.mbr_cig_a_day",
          "lifestyle.mbr_cig_total_yrs"
        ]
      }
    ]
  }
}
Behavior: If user selects "No" for smoking, the quantity and duration fields are automatically disabled.

Example 4: Nested Address Fields
Schema Structure:
json{
  "demographic": {
    "properties": {
      "mbr_address": {
        "$ref": "#/$defs/MemberAddress"
      }
    }
  },
  "$defs": {
    "MemberAddress": {
      "properties": {
        "mbr_country": { "type": "string", "title": "Country" },
        "mbr_state": { "type": "string", "title": "State" }
      }
    }
  }
}
Options Configuration:
json{
  "demographic.mbr_address.mbr_country": {
    "values": ["US"],
    "response_type": "single-select"
  },
  "demographic.mbr_address.mbr_state": {
    "values": [
      "AK", "AL", "AR", "AZ", "CA", "CO", "CT", 
      "DE", "FL", "GA", "HI", "IA", "ID", "IL",
      "IN", "KS", "KY", "LA", "MA", "MD", "ME",
      "MI", "MN", "MO", "MS", "MT", "NC", "ND",
      "NE", "NH", "NJ", "NM", "NV", "NY", "OH",
      "OK", "OR", "PA", "RI", "SC", "SD", "TN",
      "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY"
    ],
    "response_type": "single-select"
  }
}
Note: Use dot notation for nested objects: section.subsection.field

Example 5: Complex Dependent Values with Multiple Triggers
Options Configuration:
json{
  "medical_history.mbr_cancer_types_hist": {
    "values": [
      "Breast Cancer",
      "Lung Cancer",
      "None of the listed options"
    ],
    "na": "N/A",
    "response_type": "multi-select",
    "exclusive_values": ["None of the listed options", "N/A"],
    "dependent_values": {
      "demographic.mbr_gender_at_birth": {
        "Female": [
          "Breast Cancer",
          "Cervical Cancer",
          "Ovarian Cancer",
          "Uterine Cancer",
          "Vaginal Cancer",
          "Lung Cancer",
          "None of the listed options"
        ],
        "Male": [
          "Breast Cancer",
          "Prostate Cancer",
          "Testicular Cancer",
          "Penile Cancer",
          "Lung Cancer",
          "None of the listed options"
        ]
      }
    }
  },
  "conditional_rules": {
    "demographic.mbr_gender_at_birth": [
      {
        "value": "Male",
        "disable_fields": [
          "medical_history.mbr_menstruating_age_12_55",
          "medical_history.mbr_ever_pregnant"
        ]
      },
      {
        "value": "Female",
        "disable_fields": [
          "medical_history.mbr_undescend_testes"
        ]
      }
    ],
    "medical_history.mbr_diag_cancer_que": [
      {
        "value": "No",
        "disable_fields": ["medical_history.mbr_cancer_types_hist"]
      }
    ]
  }
}
Combined Behavior:

Cancer type options change based on gender
Gender-specific fields are disabled based on selection
Cancer type field is disabled if user hasn't been diagnosed with cancer


Best Practices
1. Always Specify Response Type
json{
  "field_name": {
    "values": [...],
    "response_type": "single-select"  // ✅ Required
  }
}
2. Use Exclusive Values for Mutually Exclusive Options
json{
  "exclusive_values": ["None of the above", "Not applicable", "Unknown"]
}
3. Keep Dependent Values Aligned with Schema
Ensure trigger field paths exist in your schema and values match exactly.
4. Use Meaningful Default Values
Provide sensible default values arrays for dependent fields that will be used before a trigger is selected.
5. Document Complex Dependencies
Add comments (outside JSON) explaining intricate dependency chains.
6. Test Conditional Rules
Verify that disabled fields receive appropriate default values (N/A, -9999, 1900-01-01).
7. Group Related Rules
Keep related conditional rules together for maintainability.

Common Patterns
Pattern 1: Yes/No with Follow-up
json{
  "main_question": {
    "values": ["No", "Yes"],
    "response_type": "single-select"
  },
  "conditional_rules": {
    "main_question": [
      {
        "value": "No",
        "disable_fields": ["follow_up_question"]
      }
    ]
  }
}
Pattern 2: Multi-Select with "None" Option
json{
  "field_name": {
    "values": [
      "Option 1",
      "Option 2",
      "Option 3",
      "None of the above"
    ],
    "response_type": "multi-select",
    "exclusive_values": ["None of the above"]
  }
}
Pattern 3: Cascading Dependencies
json{
  "conditional_rules": {
    "level_1_field": [
      {
        "value": "value_a",
        "disable_fields": ["level_2_field_group_1"]
      }
    ],
    "level_2_field": [
      {
        "value": "value_x",
        "disable_fields": ["level_3_field"]
      }
    ]
  }
}

Validation Tips
Check Your JSON Syntax
Use a JSON validator to ensure your file is properly formatted.
Verify Field Paths
Field paths must exactly match your schema structure using dot notation.
Test Exclusive Values
Ensure exclusive values are also present in the values array.
Validate Dependent Values
All values in dependent_values should be valid options for their respective trigger fields.
Review Conditional Rules
Disabled field paths must exist in your schema.

Troubleshooting
Issue: Dropdown Shows "-- Select --" with No Options
Cause: Field path doesn't match schema or values array is empty.
Solution: Verify the field path using dot notation and ensure values is populated.

Issue: Exclusive Values Not Working
Cause: Values not listed in exclusive_values array or misspelled.
Solution: Ensure exact string match between values and exclusive_values.

Issue: Dependent Values Not Updating
Cause: Trigger field path is incorrect or trigger value doesn't match exactly.
Solution: Check that trigger field path exists and values match case-sensitively.

Issue: Conditional Rules Not Disabling Fields
Cause: Field path in disable_fields doesn't exist in schema.
Solution: Verify all field paths in disable_fields array are valid schema paths.

Summary
The options file provides powerful customization for schema-based forms:

✅ Response Types: Control single vs. multi-select behavior
✅ Exclusive Values: Implement mutually exclusive options
✅ N/A Options: Add special "not applicable" choices
✅ Range Values: Auto-generate numeric ranges
✅ Dependent Values: Create dynamic option lists
✅ Conditional Rules: Enable/disable fields based on other selections

By following this documentation, you can create sophisticated, user-friendly forms that adapt to user input and enforce business logic automatically.

Version: 3.6
Last Updated: 2025
For Questions: Refer to your schema documentation or contact your development team.