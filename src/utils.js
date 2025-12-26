// util.js - Utility functions

/**
 * Saves JSON data with a save file dialog if available, using stored filename/path.
 * If user cancels, does not save and stays on current screen.
 * Falls back to anchor download if showSaveFilePicker not supported.
 * @param {Object} data - The form data to save
 * @param {string|null} dataFilename - Suggested filename (with .json ensured)
 * @param {string} dataFilePath - Suggested path (limited use in browsers)
 * @returns {Promise<boolean>} True if saved, false if cancelled or error
 */
async function saveJsonWithDialog(data, dataFilename, dataFilePath) {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  
  // Ensure filename has .json extension
  let suggestedName = dataFilePath ? (dataFilePath + '/' + (dataFilename || 'form-data.json')) : (dataFilename || 'form-data.json');
  if (!suggestedName.endsWith('.json')) {
    suggestedName += '.json';
  }
  
  // Note: dataFilePath can't prefill dialog location due to browser security; used for logging only
  console.log(`Suggested save: ${dataFilePath ? dataFilePath + '/' : ''}${suggestedName}`);
  
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: suggestedName,
        types: [{
          description: 'JSON Files',
          accept: { 'application/json': ['.json'] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      console.log('✓ JSON saved to file');
      return true;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Save operation cancelled');
        return false;
      } else {
        console.error('Error saving file:', error);
        alert('Error saving file: ' + error.message);
        return false;
      }
    }
  } else {
    // Fallback: Anchor download (no true cancel dialog, but downloads immediately)
    console.warn('showSaveFilePicker not available; using fallback download');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('✓ JSON saved to file (fallback)');
    return true;
  }
}


// function to copy Json data to Clipboard
async function exportJsonToClipboard(data) {
  const jsonString = JSON.stringify(data, null, 2);
  
  try {
    await navigator.clipboard.writeText(jsonString);
    console.log('✓ JSON copied to clipboard');
    ashAlert('JSON copied to clipboard!');    
  } catch (error) {
    const textarea = document.createElement('textarea');
    textarea.value = jsonString;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    console.log('✓ JSON copied to clipboard (fallback)');    
    ashAlert('JSON copied to clipboard!');

  }
}

/**
 * Shows a custom confirm dialog with scrollable message if content is long.
 * Dialog size is capped at 600px width and 400px height.
 * @param {string} message - The message to display
 * @returns {Promise<boolean>} Resolves to true (Yes) or false (No)
 */
function ashConfirm(message) {
  return new Promise((resolve) => {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.background = 'rgba(0,0,0,0.5)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';

    // Create dialog box
    const dialog = document.createElement('div');
    dialog.style.background = 'white';
    dialog.style.padding = '24px';
    dialog.style.borderRadius = '12px';
    dialog.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
    dialog.style.maxWidth = '600px';
    dialog.style.width = '90%';           // Responsive on small screens
    dialog.style.maxHeight = '400px';
    dialog.style.display = 'flex';
    dialog.style.flexDirection = 'column';
    dialog.style.gap = '20px';
    dialog.style.overflow = 'hidden';     // Prevent dialog itself from scrolling

    // Message area (scrollable)
    const messageContainer = document.createElement('div');
    messageContainer.style.flex = '1';    // Take available space
    messageContainer.style.overflowY = 'auto';
    messageContainer.style.maxHeight = 'calc(400px - 120px)'; // Leave room for buttons + padding
    messageContainer.style.paddingRight = '8px'; // Space for scrollbar
    messageContainer.style.textAlign = 'left';

    const text = document.createElement('p');
    text.textContent = message;
    text.style.margin = '0';
    text.style.whiteSpace = 'pre-wrap';   // Respect newlines
    text.style.wordWrap = 'break-word';
    messageContainer.appendChild(text);

    // Button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '12px';

    // Yes button
    const yesBtn = document.createElement('button');
    yesBtn.textContent = 'Yes';
    yesBtn.style.padding = '10px 24px';
    yesBtn.style.backgroundColor = '#007bff';
    yesBtn.style.color = 'white';
    yesBtn.style.border = 'none';
    yesBtn.style.borderRadius = '6px';
    yesBtn.style.cursor = 'pointer';
    yesBtn.style.fontWeight = '500';
    yesBtn.onmouseover = () => { yesBtn.style.backgroundColor = '#0056b3'; };
    yesBtn.onmouseout = () => { yesBtn.style.backgroundColor = '#007bff'; };
    yesBtn.onclick = () => {
      resolve(true);
      document.body.removeChild(modal);
    };

    // No button
    const noBtn = document.createElement('button');
    noBtn.textContent = 'No';
    noBtn.style.padding = '10px 24px';
    noBtn.style.backgroundColor = '#6c757d';
    noBtn.style.color = 'white';
    noBtn.style.border = 'none';
    noBtn.style.borderRadius = '6px';
    noBtn.style.cursor = 'pointer';
    noBtn.style.fontWeight = '500';
    noBtn.onmouseover = () => { noBtn.style.backgroundColor = '#5a6268'; };
    noBtn.onmouseout = () => { noBtn.style.backgroundColor = '#6c757d'; };
    noBtn.onclick = () => {
      resolve(false);
      document.body.removeChild(modal);
    };

    // Assemble dialog
    buttonContainer.appendChild(noBtn);
    buttonContainer.appendChild(yesBtn);
    dialog.appendChild(messageContainer);
    dialog.appendChild(buttonContainer);
    modal.appendChild(dialog);
    document.body.appendChild(modal);

    // Focus "No" button by default (safer UX)
    noBtn.focus();
  });
}

// Function to show a custom alert dialog
function ashAlert(message) {
  return new Promise((resolve) => {
    // Create modal elements
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.background = 'rgba(0,0,0,0.5)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';

    const dialog = document.createElement('div');
    dialog.style.background = 'white';
    dialog.style.padding = '20px';
    dialog.style.borderRadius = '8px';
    dialog.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    dialog.style.maxWidth = '300px';
    dialog.style.textAlign = 'center';

    const text = document.createElement('p');
    text.textContent = message;
    dialog.appendChild(text);

    const okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    okBtn.onclick = () => {
      resolve(true); // Resolve on OK (or use void if no need for result)
      document.body.removeChild(modal);
    };

    dialog.appendChild(okBtn);
    modal.appendChild(dialog);
    document.body.appendChild(modal);

    // Focus the button for accessibility
    okBtn.focus();
  });
}

// // Usage example with async/await
// async function showMessage() {
//   await ashAlert('This is a custom alert message!');
//   console.log('Alert dismissed');
// }

// // Or synchronous usage
// customAlert('Hello, world!').then(() => {
//   console.log('Alert closed');
// });

// // Usage with async/await
// async function handleSave() {
//   const confirmed = await ashConfirm('Do you want to save anyway?');
//   if (confirmed) {
//     // Proceed with save
//   }
// }

/*
 * AddToolTip
 * Usage example for the buttons (add this after the buttons are defined or in DOMContentLoaded)
 * const loadSchemaBtn = document.getElementById('loadSchemaBtn');
 * addTooltip(loadSchemaBtn, 'Load the JSON schema file');
 * const loadOptionsBtn = document.getElementById('loadOptionsBtn');
 * addTooltip(loadOptionsBtn, 'Load the custom options JSON file');
*/
function addTooltip(element, initialMessage) {
  // Create tooltip element
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.innerText = initialMessage;
  tooltip.style.display = 'none';
  tooltip.style.position = 'absolute';
  tooltip.style.backgroundColor = '#333';
  tooltip.style.color = '#fff';
  tooltip.style.padding = '5px 10px';
  tooltip.style.borderRadius = '4px';
  tooltip.style.zIndex = '1000';
  tooltip.style.pointerEvents = 'none';

  // Append to body for positioning freedom
  document.body.appendChild(tooltip);

  // Show on mouseover
  element.addEventListener('mouseover', (e) => {
    tooltip.style.display = 'block';
    const rect = element.getBoundingClientRect();
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`; // Position below the element
  });

  // Hide on mouseout
  element.addEventListener('mouseout', () => {
    tooltip.style.display = 'none';
  });

  // Cleanup on element removal (optional)
  element.addEventListener('DOMNodeRemoved', () => {
    tooltip.remove();
  });

  // Return the tooltip element for later updates
  return tooltip;
}

export { saveJsonWithDialog, 
         exportJsonToClipboard,
         addTooltip,
         ashAlert, 
         ashConfirm };
