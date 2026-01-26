### Testing Guide
#### Phase 2 Feature Tests:

#### Test 1: Control Type Switching 
```
1. Set education_level = "High School" 
   → field_of_study shows as dropdown  
2. Change to "Bachelor's"  
   → field_of_study rebuilds as radio buttons  
3. Change to "Master's"  
   → field_of_study rebuilds as checkboxes  
4. Change to "PhD"  
   → field_of_study rebuilds as multi-select dropdown  
```

##### Test 2: Nested Dependencies
```
1. Set field_of_study = "Computer Science"  
   → programming_languages shows CS languages as checkboxes  
2. Change to "Engineering"  
   → programming_languages rebuilds as multi-select dropdown  
3. Change to "Business"  
   → programming_languages rebuilds as radio buttons (single choice)  
```

##### Test 3: Employment Chain  
```
1. Set employment_status = "Employed Full-time"  
   → work_industry: dropdown  
   → years_experience: slider (0-20+)  
   → salary_range: radio buttons with labels  
   → availability: dropdown  
   
2. Change to "Employed Part-time"
   → work_industry: checkboxes (multiple jobs)
   → years_experience: dropdown (0-10 only)
   → salary_range: dropdown with different ranges
   → availability: radio buttons
   
3. Change to "Student"  
   → All fields show N/A or empty  
```

##### Test 4: Value/Label Pairs  
```
Set employment_status = "Employed Full-time"  
→ salary_range shows labels like "$150,000 - $200,000" 
  but stores values like "150k-200k"  
```

##### Test 5: Backward Compatibility  
```
education_level = "High School"  
→ field_of_study uses simple array (no overrides)  
→ Shows as basic dropdown  
```