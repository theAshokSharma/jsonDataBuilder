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

// Function to show a custom confirm dialog
function ashConfirm(message) {
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

    const yesBtn = document.createElement('button');
    yesBtn.textContent = 'Yes';
    yesBtn.style.marginRight = '10px';
    yesBtn.onclick = () => {
      resolve(true);
      document.body.removeChild(modal);
    };

    const noBtn = document.createElement('button');
    noBtn.textContent = 'No';
    noBtn.onclick = () => {
      resolve(false);
      document.body.removeChild(modal);
    };

    dialog.appendChild(yesBtn);
    dialog.appendChild(noBtn);
    modal.appendChild(dialog);
    document.body.appendChild(modal);
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

export { saveJsonWithDialog, exportJsonToClipboard, ashAlert, ashConfirm };
