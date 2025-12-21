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

export { saveJsonWithDialog };
