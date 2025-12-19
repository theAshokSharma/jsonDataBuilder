# JSON Data Builder  
### Revolutionize Your Workflow with JSON Data Builder: Instant Forms from Schemas   

Are you constantly building forms from JSON schemas? Spending hours creating UI elements that match your data structures? We've built the solution you've been waiting for!

Introducing **JSON Data Builder** - a groundbreaking web application that bridges the gap between JSON schemas and user-friendly forms, entirely in your browser. This isn't just another form builder; it's a complete ecosystem for working with structured data, accessible to everyone, everywhere.

### 🌟 Why This Tool Stands Out:

- **⚡ Zero-Installation, Instant Access**
    Open your browser, load the page, and you're ready to go. No downloads, no installations, no server setup. Everything runs locally in your   browser, ensuring privacy and security for your data.
  
- **📊 Intelligent Organization**
    Complex schemas? No problem! The editor automatically creates tab-based navigation for root-level properties, making even the most complicated schemas manageable and user-friendly.  
  
- **🎮 Advanced UI Components**
    - Smart Dropdowns: Multi-select with search, tag display, and exclusive options  
    - Conditional Fields: Automatically show/hide fields based on user input  
    - Nested Objects: Collapsible sections for complex data structures  
    - Array Support: Dynamic add/remove functionality for array items  
    - Date Pickers, Number Inputs, Text Areas: All automatically generated from schema types  
  
- **🔄 Complete Data Lifecycle**
    - Load Schema: Upload your JSON schema file
    - Load Choices (Optional): Add dropdown options for better UX
    - Load Data (Optional): Pre-fill with existing JSON data
    - Fill Form: Users interact with the generated interface
    - Export: Save results as JSON or copy to clipboard
  
- **🔒 Privacy-First Design**
    - 100% Client-Side: Your data never leaves your browser
    - No Tracking: We don't collect or analyze your usage
    - File-Based: Everything works through standard file upload/download
    - Offline Capable: Once loaded, works without internet connection

- **💡 Real-World Applications:**
    - Healthcare: Patient intake forms from medical schemas
    - Research: Academic survey data collection
    - E-commerce: Product configuration interfaces
    - HR: Employee onboarding systems
    - Education: Interactive learning tools for JSON schemas
    - Development: Quick prototyping and testing
  
- **📈 Boost Your Productivity**
    Stop wasting time on repetitive form creation. Whether you're building a simple contact form or a complex multi-section questionnaire, JSON  Schema Editor cuts development time from hours to seconds.  

    - For Developers: Test APIs, create admin interfaces, generate mock data
    - For Data Scientists: Collect structured data for analysis
    - For Product Managers: Create prototypes without coding
    - For Everyone: Understand and work with JSON schemas visually    

- **🚀 Technical Excellence**
    - Pure Web Standards: HTML5, CSS3, vanilla JavaScript - no bloated frameworks
    - Modern UI: Clean, responsive design that works on any device
    - Schema Compatibility: Supports JSON Schema Draft 7+ features
    - File API: Leverages modern browser capabilities for file handling

- **🔗 Access It Now!**
    Simply visit the webpage and start creating. The tool is:
    - Free Forever: No pricing tiers, no limitations
    - Open Source: Transparent code, community-driven improvements
    - Accessible: Works on Chrome, Firefox, Safari, Edge
    - Mobile Friendly: Responsive design for tablets and phones

Transform your JSON schemas into beautiful, functional forms in minutes. Experience the power of automated form generation!

<details>
  <summary>For Developers and Contributors</summary>
  ### Quick Start
  ### Access at http://localhost:8080

  #### make script executable

  ```
  chmod +x build.sh run-dev.sh run-prod.sh stop.sh
  ```

  #### Usage instructions
  ##### Development
  ```
  # Build images
  ./build.sh

  # Start development environment (with live reload)
  ./run-dev.sh

  # View logs
  docker-compose logs -f
  ```
  ##### Production
  ```
  # Build images
  ./build.sh

  # Start production environment
  ./run-prod.sh

  # Check health
  docker ps
  ```
  ##### Stop All

  ```
  ./stop.sh
  ```
</details>

<details>
  <summary>Schema and choices</summary>
    ### Example of Choices.json 

    ```
    {
      "age": {
        "values": ["0-10"],
        "response_type": "single-select"
      },
      "pain_level": {
        "values": ["Unknown/Unsure", "0-10"],
        "response_type": "single-select"
      },
      "satisfaction": {
        "values": ["1-5"],
        "na": "-1",
        "response_type": "single-select"
      }
    }
    ```

    #### Rendered drop down
        - Age: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        - Pain Level: [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        - Satisfaction: [1, 2, 3, 4, 5, Not Applicable]

    #### Json Output
    ```
    {
      "age": 5,
      "pain_level": -1,
      "satisfaction": "Not Applicable"
    }
    ```

    ### date example
    ```
    {
      "birth_year": {
        "values": ["Unknown/Unsure", "1920-2010"],
        "response_type": "single-select"
      },
      "graduation_year": {
        "values": ["1950-2024"],
        "response_type": "single-select"
      },
      "event_year": {
        "values": ["2000-2025"],
        "na": "Not Applicable",
        "response_type": "single-select"
      },
      "model_year": {
        "values": ["1980-2024"],
        "response_type": "single-select"
      }
    }
    ```
    #### How It Expands:

    - "1920-2010" → [1920, 1921, 1922, ..., 2009, 2010] (91 values)
    - "1950-2024" → [1950, 1951, 1952, ..., 2023, 2024] (75 values)
    - "2000-2025" → [2000, 2001, 2002, ..., 2024, 2025] (26 values)

</details>