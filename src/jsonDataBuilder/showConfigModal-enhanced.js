// ─────────────────────────────────────────────────────────────────────────────
// ENHANCED CONFIG MODAL  (drop-in replacement for showConfigModal in
// file-operations.js)
//
// HOW TO INTEGRATE
// 1.  Add this import near the top of file-operations.js:
//
//       import {
//         getAllSchemas,
//         saveToRegistry,
//         loadSchemaEntry,
//         removeFromRegistry,
//         selectSchemaDirectory,
//         getDirectoryName,
//         isFileSystemAccessSupported
//       } from './schema-registry.js';
//
// 2.  Delete (or comment out) the existing showConfigModal function.
//
// 3.  Paste or import everything from this file in its place.
//
// All other exports in file-operations.js stay unchanged.
// ─────────────────────────────────────────────────────────────────────────────
// @ts-check

import { state, updateState }                                          from './state.js';
import { validateOptionsAgainstSchema, showValidationErrorsDialog,
         displayValidationResults }                                    from './file-validation.js';
import { ashAlert, ashConfirm }                                        from './utils.js';
import { renderForm, updateFileStatusDisplay }                         from './form-renderer.js';
import { resolveReferences }                                           from './file-operations.js';
import {
  getAllSchemas,
  saveToRegistry,
  loadSchemaEntry,
  removeFromRegistry,
  selectSchemaDirectory,
  getDirectoryName,
  isFileSystemAccessSupported
}                                                                      from './schema-registry.js';

// ─── CSS (injected once) ─────────────────────────────────────────────────────

(function injectModalStyles() {
  if (document.getElementById('jb-config-modal-styles')) return;
  const style = document.createElement('style');
  style.id = 'jb-config-modal-styles';
  style.textContent = `
    /* ── Config modal layout ── */
    .jb-modal-body          { display:flex; gap:0; max-height:72vh; }
    .jb-panel               { padding:20px 24px; overflow-y:auto; }
    .jb-panel-library       { flex:1 1 45%; border-right:1px solid #eaeaea; min-width:0; }
    .jb-panel-new           { flex:1 1 55%; min-width:0; }
    .jb-panel-title         { font-size:13px; font-weight:700; letter-spacing:.6px;
                               text-transform:uppercase; color:#888; margin:0 0 14px; }

    /* ── Schema library list ── */
    .jb-schema-list         { display:flex; flex-direction:column; gap:8px; }
    .jb-schema-item         { display:flex; align-items:flex-start; gap:10px;
                               padding:12px; border:1px solid #e0e0e0; border-radius:8px;
                               cursor:pointer; transition:all .18s;
                               background:#fafafa; position:relative; }
    .jb-schema-item:hover   { border-color:#0033ff; background:#f0f4ff; }
    .jb-schema-item.selected{ border-color:#0033ff; background:#eef2ff;
                               box-shadow:0 0 0 3px rgba(0,51,255,.12); }
    .jb-schema-radio        { margin-top:2px; cursor:pointer; accent-color:#0033ff; flex-shrink:0; }
    .jb-schema-meta         { flex:1; min-width:0; }
    .jb-schema-desc         { font-weight:600; font-size:14px; color:#222;
                               white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .jb-schema-files        { font-size:12px; color:#666; margin-top:3px; line-height:1.5; }
    .jb-schema-badge        { display:inline-block; font-size:10px; font-weight:700;
                               padding:1px 6px; border-radius:3px; margin-right:4px; }
    .jb-badge-schema        { background:#dae7f9; color:#0255b4; }
    .jb-badge-options       { background:#e0f6e5; color:#019240; }
    .jb-badge-no-options    { background:#f2f2f2; color:#888; }
    .jb-schema-delete       { position:absolute; top:8px; right:8px;
                               background:none; border:none; color:#ccc; font-size:15px;
                               cursor:pointer; padding:2px 5px; border-radius:4px;
                               line-height:1; transition:color .15s, background .15s; }
    .jb-schema-delete:hover { color:#d32f2f; background:#fae0de; }
    .jb-empty-lib           { color:#999; font-size:13px; text-align:center;
                               padding:30px 16px; line-height:1.6; }

    /* ── Directory bar ── */
    .jb-dir-bar             { display:flex; align-items:center; gap:8px;
                               margin-bottom:16px; padding:8px 12px;
                               background:#f5f5f5; border-radius:6px;
                               font-size:12px; color:#555; flex-wrap:wrap; }
    .jb-dir-bar span        { flex:1; overflow:hidden; text-overflow:ellipsis;
                               white-space:nowrap; }
    .jb-dir-btn             { font-size:11px; padding:4px 10px; cursor:pointer;
                               background:#fff; border:1px solid #ccc;
                               border-radius:4px; color:#333; white-space:nowrap;
                               transition:all .15s; }
    .jb-dir-btn:hover       { border-color:#0033ff; color:#0033ff; background:#f0f4ff; }

    /* ── Form steps inside "new" panel ── */
    .jb-step                { display:flex; gap:16px; margin-bottom:16px;
                               padding-bottom:16px; border-bottom:1px dashed #eee; }
    .jb-step:last-child     { border-bottom:none; }
    .jb-step-num            { width:28px; height:28px; border-radius:50%;
                               border:2px solid #0033ff; color:#0033ff; font-weight:700;
                               font-size:14px; display:flex; align-items:center;
                               justify-content:center; flex-shrink:0; margin-top:2px; }
    .jb-step-body           { flex:1; }
    .jb-step-body h4        { margin:0 0 6px; font-size:14px; color:#222; }
    .jb-step-body p         { margin:0 0 10px; font-size:12px; color:#777; }
    .jb-file-label          { display:inline-flex; align-items:center; gap:6px;
                               padding:7px 14px; background:#fff;
                               border:2px solid #0033ff; border-radius:8px;
                               cursor:pointer; font-size:13px; color:#0033ff;
                               font-weight:600; transition:all .2s; }
    .jb-file-label:hover    { background:#0033ff; color:#fff; }
    .jb-file-label:hover .jb-file-icon { filter:brightness(10); }
    .jb-file-icon           { font-size:16px; }
    .jb-file-name           { margin-top:6px; font-size:12px; color:#495057;
                               padding:5px 10px; background:#f8f9fa;
                               border-left:3px solid #0033ff; border-radius:3px;
                               display:none; }
    .jb-file-name.visible   { display:block; }
    .jb-desc-input          { width:100%; padding:8px 12px; font-family:inherit;
                               font-size:13px; border:1px solid #ccc; border-radius:6px;
                               resize:vertical; min-height:60px; box-sizing:border-box; }
    .jb-desc-input:focus    { outline:none; border-color:#0033ff;
                               box-shadow:0 0 0 3px rgba(0,51,255,.1); }
    .jb-save-row            { display:flex; align-items:center; gap:8px;
                               font-size:13px; color:#444; cursor:pointer; }
    .jb-save-row input      { accent-color:#0033ff; width:16px; height:16px; cursor:pointer; }

    /* ── Divider ── */
    .jb-divider             { display:flex; align-items:center; gap:10px;
                               margin:10px 0 16px; color:#bbb; font-size:12px; font-weight:600; }
    .jb-divider::before,
    .jb-divider::after      { content:''; flex:1; height:1px; background:#eee; }

    /* ── Validation status ── */
    .jb-status              { display:flex; align-items:center; gap:10px;
                               padding:12px 16px; background:#f8f9fa;
                               border-radius:8px; margin:0 24px 0; font-size:13px; }
    .jb-status-icon         { font-size:20px; }

    /* ── Footer ── */
    .jb-footer              { display:flex; justify-content:flex-end; gap:12px;
                               padding:16px 24px; background:#f8f9fa;
                               border-top:1px solid #eaeaea; border-radius:0 0 16px 16px; }
  `;
  document.head.appendChild(style);
})();

// ─── Modal HTML builder ────────────────────────────────────────────────────────

/**
 * Builds the inner HTML for the enhanced config modal.
 * @param {{ entries: import('./schema-registry.js').RegistryEntry[], directoryName: string|null, isFSMode: boolean }} registry
 */
function buildModalHTML(registry) {
  const { entries, directoryName, isFSMode } = registry;

  // ── Library panel ──────────────────────────────────────────────────────────
  const dirBarHTML = isFileSystemAccessSupported() ? `
    <div class="jb-dir-bar">
      <span title="${directoryName || 'No directory selected'}">
        📁 ${directoryName ? `<strong>${directoryName}</strong>` : 'No schema directory set'}
      </span>
      <button class="jb-dir-btn" id="jbSelectDirBtn">
        ${directoryName ? '⟳ Change' : '+ Set Directory'}
      </button>
    </div>` : `
    <div class="jb-dir-bar" style="background:#fff8e1; border:1px solid #ffe082;">
      ℹ️ File System API not available — schemas saved to browser storage.
    </div>`;

  const listHTML = entries.length === 0
    ? `<div class="jb-empty-lib">
         No schemas in library yet.<br>
         Load a new schema below and tick<br>
         <strong>"Save to Library"</strong> to add it.
       </div>`
    : entries.map((e, i) => `
        <div class="jb-schema-item" data-index="${i}" id="jb-lib-item-${i}">
          <input type="radio" class="jb-schema-radio"
                 name="jb-schema-sel" id="jb-schema-radio-${i}" value="${i}">
          <div class="jb-schema-meta">
            <div class="jb-schema-desc" title="${e.description || e.schema}">
              ${e.description || e.schema}
            </div>
            <div class="jb-schema-files">
              <span class="jb-schema-badge jb-badge-schema">Schema</span>${e.schema}<br>
              ${e.options
                ? `<span class="jb-schema-badge jb-badge-options">Options</span>${e.options}`
                : `<span class="jb-schema-badge jb-badge-no-options">No options</span>`}
            </div>
          </div>
          <button class="jb-schema-delete" data-index="${i}"
                  title="Remove from library" aria-label="Remove">✕</button>
        </div>`).join('');

  // ── Full modal ─────────────────────────────────────────────────────────────
  return `
    <div class="config-modal-content" style="max-width:780px;">
      <div class="config-modal-header">
        <h2>⚙️ Load Configuration</h2>
        <p class="config-subtitle">
          Select from your saved library or load new schema files
        </p>
      </div>

      <div class="jb-modal-body">

        <!-- Left: Schema Library -->
        <div class="jb-panel jb-panel-library">
          <p class="jb-panel-title">📚 Schema Library</p>
          ${dirBarHTML}
          <div class="jb-schema-list" id="jbSchemaList">${listHTML}</div>
        </div>

        <!-- Right: Load New Files -->
        <div class="jb-panel jb-panel-new">
          <p class="jb-panel-title">📁 Load New Files</p>

          <!-- Step 1 – Schema -->
          <div class="jb-step">
            <div class="jb-step-num">1</div>
            <div class="jb-step-body">
              <h4>Schema File <span style="color:#d32f2f">*</span></h4>
              <p>JSON Schema that defines your form structure</p>
              <input type="file" accept=".json" id="jbSchemaFileInput"
                     style="display:none">
              <label for="jbSchemaFileInput" class="jb-file-label">
                <span class="jb-file-icon">📄</span> Choose Schema
              </label>
              <div class="jb-file-name" id="jbSchemaFileName"></div>
            </div>
          </div>

          <!-- Step 2 – Options -->
          <div class="jb-step">
            <div class="jb-step-num">2</div>
            <div class="jb-step-body">
              <h4>Options File</h4>
              <p>Custom dropdowns, dependent fields, and rules (optional)</p>
              <input type="file" accept=".json" id="jbOptionsFileInput"
                     style="display:none">
              <label for="jbOptionsFileInput" class="jb-file-label">
                <span class="jb-file-icon">⚙️</span> Choose Options
              </label>
              <div class="jb-file-name" id="jbOptionsFileName"></div>
            </div>
          </div>

          <!-- Step 3 – Description -->
          <div class="jb-step">
            <div class="jb-step-num">3</div>
            <div class="jb-step-body">
              <h4>Description</h4>
              <p>Short description shown in the library (optional)</p>
              <textarea class="jb-desc-input" id="jbDescInput"
                placeholder="e.g. Member data entry form for Plan Year 2025…"
                maxlength="200"></textarea>
            </div>
          </div>

          <!-- Step 4 – Save toggle -->
          <div class="jb-step">
            <div class="jb-step-num">4</div>
            <div class="jb-step-body">
              <h4>Save to Library</h4>
              <label class="jb-save-row">
                <input type="checkbox" id="jbSaveToLibrary" checked>
                Remember this schema for quick access next time
              </label>
            </div>
          </div>
        </div>
      </div><!-- /.jb-modal-body -->

      <!-- Validation status row -->
      <div class="jb-status" id="jbValidationStatus">
        <span class="jb-status-icon">⏳</span>
        <span id="jbStatusText">Select a schema from the library or load a new file.</span>
      </div>

      <!-- Footer -->
      <div class="jb-footer">
        <button id="jbCancelBtn" class="btn-secondary">Cancel</button>
        <button id="jbConfirmBtn" class="btn-primary" disabled>
          <span class="btn-icon">▶</span> Load Configuration
        </button>
      </div>
    </div>`;
}

// ─── Status helpers ────────────────────────────────────────────────────────────

function setStatus(icon, text, cls = '') {
  const bar  = document.getElementById('jbValidationStatus');
  const txt  = document.getElementById('jbStatusText');
  const iconEl = bar?.querySelector('.jb-status-icon');
  if (!bar || !txt || !iconEl) return;

  bar.className    = `jb-status ${cls}`;
  iconEl.textContent = icon;
  txt.textContent  = text;
}

function setConfirmEnabled(enabled) {
  const btn = document.getElementById('jbConfirmBtn');
  if (btn) btn.disabled = !enabled;
}

// ─── Main exported function ───────────────────────────────────────────────────

/**
 * Opens the enhanced config modal.
 *
 * Mode A – Library: user picks a saved entry → files loaded from registry.
 * Mode B – New:     user selects files manually → optionally saved to registry.
 */
export async function showConfigModal() {
  // ── 1. Read current registry state ────────────────────────────────────────
  let registry = await getAllSchemas();

  // ── 2. Inject / replace modal content ────────────────────────────────────
  const configModal = document.getElementById('config-modal');
  if (!configModal) {
    console.error('config-modal element not found in DOM');
    return;
  }

  configModal.innerHTML = buildModalHTML(registry);
  configModal.style.display = 'flex';

  // ── 3. Local state for this modal session ─────────────────────────────────
  let selectedSchemaFile  = null;
  let selectedOptionsFile = null;
  let selectedLibIndex    = -1;   // -1 = "load new files" mode

  // ── 4. Library interactions ───────────────────────────────────────────────

  /** Highlights the selected library item row */
  function highlightLibItem(idx) {
    document.querySelectorAll('.jb-schema-item').forEach(el => el.classList.remove('selected'));
    if (idx >= 0) {
      document.getElementById(`jb-lib-item-${idx}`)?.classList.add('selected');
    }
  }

  /** Called whenever library selection changes */
  function onLibrarySelect(idx) {
    selectedLibIndex = idx;
    const entry = registry.entries[idx];
    if (!entry) return;

    highlightLibItem(idx);
    setStatus('✅', `Ready to load "${entry.description || entry.schema}"`, 'validation-success');
    setConfirmEnabled(true);
  }

  // Click on entire item row → select that radio
  document.querySelectorAll('.jb-schema-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (/** @type {HTMLElement} */ (e.target).classList.contains('jb-schema-delete')) return;
      const idx    = parseInt(item.dataset.index);
      const radio  = document.getElementById(`jb-schema-radio-${idx}`);
      if (radio) radio.checked = true;
      onLibrarySelect(idx);

      // Clear any "new file" selections so modes don't mix
      selectedSchemaFile  = null;
      selectedOptionsFile = null;
      document.getElementById('jbSchemaFileName').classList.remove('visible');
      document.getElementById('jbOptionsFileName').classList.remove('visible');
      if (document.getElementById('jbSchemaFileInput')) {
        document.getElementById('jbSchemaFileInput').value = '';
      }
    });
  });

  // Radio inputs (keyboard / direct)
  document.querySelectorAll('.jb-schema-radio').forEach(radio => {
    radio.addEventListener('change', () => {
      onLibrarySelect(parseInt(radio.value));
    });
  });

  // ── 5. Delete library entries ─────────────────────────────────────────────
  document.querySelectorAll('.jb-schema-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx   = parseInt(btn.dataset.index);
      const entry = registry.entries[idx];
      if (!entry) return;

      const ok = await ashConfirm(`Remove "${entry.description || entry.schema}" from the library?`);
      if (!ok) return;

      await removeFromRegistry(entry.schema, registry.dirHandle);

      // Refresh the modal (re-read registry)
      registry = await getAllSchemas();
      const list = document.getElementById('jbSchemaList');
      if (list) {
        list.innerHTML = registry.entries.length === 0
          ? `<div class="jb-empty-lib">
               No schemas in library yet.<br>
               Load a new schema below and tick
               <strong>"Save to Library"</strong> to add it.
             </div>`
          : registry.entries.map((e, i) => `
              <div class="jb-schema-item" data-index="${i}" id="jb-lib-item-${i}">
                <input type="radio" class="jb-schema-radio"
                       name="jb-schema-sel" id="jb-schema-radio-${i}" value="${i}">
                <div class="jb-schema-meta">
                  <div class="jb-schema-desc">${e.description || e.schema}</div>
                  <div class="jb-schema-files">
                    <span class="jb-schema-badge jb-badge-schema">Schema</span>${e.schema}<br>
                    ${e.options
                      ? `<span class="jb-schema-badge jb-badge-options">Options</span>${e.options}`
                      : `<span class="jb-schema-badge jb-badge-no-options">No options</span>`}
                  </div>
                </div>
                <button class="jb-schema-delete" data-index="${i}" title="Remove from library">✕</button>
              </div>`).join('');

        // Re-attach event listeners after list re-render
        list.querySelectorAll('.jb-schema-item').forEach(item => {
          item.addEventListener('click', (ev) => {
            if (ev.target.classList.contains('jb-schema-delete')) return;
            const i = parseInt(item.dataset.index);
            document.getElementById(`jb-schema-radio-${i}`)?.setAttribute('checked', '');
            onLibrarySelect(i);
          });
        });
        list.querySelectorAll('.jb-schema-delete').forEach(b => {
          b.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            b.dispatchEvent(new Event('click')); // handled above via closure re-render
          });
        });
      }

      if (selectedLibIndex === idx) {
        selectedLibIndex = -1;
        setStatus('⏳', 'Entry removed. Select from library or load new files.');
        setConfirmEnabled(false);
      }
    });
  });

  // ── 6. Set / change directory ─────────────────────────────────────────────
  document.getElementById('jbSelectDirBtn')?.addEventListener('click', async () => {
    const handle = await selectSchemaDirectory();
    if (!handle) return;

    registry = await getAllSchemas();  // re-read with new directory
    const dirSpan = document.querySelector('.jb-dir-bar span');
    if (dirSpan) {
      dirSpan.innerHTML = `📁 <strong>${handle.name}</strong>`;
    }
    await ashAlert(`Schema directory set to: ${handle.name}\nExisting schemas in this directory will appear in the library next time you open this dialog.`);
  });

  // ── 7. New file inputs ────────────────────────────────────────────────────
  document.getElementById('jbSchemaFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      JSON.parse(await file.text());   // quick validity check
    } catch {
      await ashAlert('Invalid JSON in schema file.');
      e.target.value = '';
      return;
    }

    selectedSchemaFile = file;
    selectedLibIndex   = -1;           // switch to "new file" mode
    document.querySelectorAll('.jb-schema-item').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.jb-schema-radio').forEach(r => r.checked = false);

    const nameEl = document.getElementById('jbSchemaFileName');
    nameEl.textContent = `📄 ${file.name}`;
    nameEl.classList.add('visible');

    // Pre-fill description with schema name if empty
    const descInput = document.getElementById('jbDescInput');
    if (descInput && !descInput.value.trim()) {
      descInput.value = file.name.replace(/\.json$/i, '').replace(/[-_]/g, ' ');
    }

    setStatus('✅', 'Schema ready. Add options file or confirm to load.', 'validation-success');
    setConfirmEnabled(true);
  });

  document.getElementById('jbOptionsFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      JSON.parse(await file.text());
    } catch {
      await ashAlert('Invalid JSON in options file.');
      e.target.value = '';
      return;
    }

    selectedOptionsFile = file;
    const nameEl = document.getElementById('jbOptionsFileName');
    nameEl.textContent = `⚙️ ${file.name}`;
    nameEl.classList.add('visible');
  });

  // ── 8. Cancel ─────────────────────────────────────────────────────────────
  document.getElementById('jbCancelBtn').addEventListener('click', () => {
    configModal.style.display = 'none';
  });

  configModal.addEventListener('click', (e) => {
    if (e.target === configModal) configModal.style.display = 'none';
  });

  // ── 9. Confirm / Load ─────────────────────────────────────────────────────
  document.getElementById('jbConfirmBtn').addEventListener('click', async () => {
    setStatus('⏳', 'Loading and validating…');
    setConfirmEnabled(false);

    try {
      if (selectedLibIndex >= 0) {
        // ── Mode A: Load from library ──────────────────────────────────────
        await loadFromLibrary(registry.entries[selectedLibIndex], registry.dirHandle, configModal);
      } else if (selectedSchemaFile) {
        // ── Mode B: Load new files ─────────────────────────────────────────
        const description   = document.getElementById('jbDescInput').value.trim();
        const saveToLibrary = document.getElementById('jbSaveToLibrary').checked;
        await loadNewFiles(selectedSchemaFile, selectedOptionsFile, description, saveToLibrary, registry.dirHandle, configModal);
      } else {
        setStatus('⚠️', 'Please select a schema from the library or load a new file.', 'validation-warning');
        setConfirmEnabled(true);
      }
    } catch (err) {
      setStatus('❌', `Error: ${err.message}`, 'validation-error');
      setConfirmEnabled(true);
      console.error('Config load error:', err);
    }
  });
}

// ─── Load helpers ─────────────────────────────────────────────────────────────

/**
 * Mode A: Load schema + options from the registry.
 * @param {import('./schema-registry.js').RegistryEntry} entry
 * @param {FileSystemDirectoryHandle|null} dirHandle
 * @param {HTMLElement} modal
 */
async function loadFromLibrary(entry, dirHandle, modal) {
  const { schemaData, optionsData, schemaFile, optionsFile } =
    await loadSchemaEntry(entry, dirHandle);

  // Apply to global state
  const schema = schemaData;
  updateState({
    currentSchema:      schema,
    definitions:        schema.definitions || schema.$defs || {},
    selectedSchemaFile: schemaFile,
    selectedOptionsFile: optionsFile,
    dataFilename:       null
  });

  if (optionsData) {
    await applyOptionsData(optionsData, optionsFile);
  } else {
    clearOptionsState();
  }

  closeModalAndRender(modal, schema);
  console.log(`✅ Loaded from library: ${entry.schema}`);
}

/**
 * Mode B: Load freshly chosen files, optionally save to library.
 * @param {File}        schemaFile
 * @param {File|null}   optionsFile
 * @param {string}      description
 * @param {boolean}     saveToLib
 * @param {FileSystemDirectoryHandle|null} dirHandle
 * @param {HTMLElement} modal
 */
async function loadNewFiles(schemaFile, optionsFile, description, saveToLib, dirHandle, modal) {
  // Parse schema
  const schemaText = await schemaFile.text();
  const schema     = JSON.parse(schemaText);

  updateState({
    currentSchema:      schema,
    definitions:        schema.definitions || schema.$defs || {},
    selectedSchemaFile: schemaFile,
    dataFilename:       null
  });

  // Handle options
  if (optionsFile) {
    const optionsText = await optionsFile.text();
    const rawOptions  = JSON.parse(optionsText);
    const resolved    = resolveReferences(rawOptions, rawOptions);

    // Validate options against schema
    const validation = validateOptionsAgainstSchema(resolved, schema);
    if (!validation.isValid) {
      const proceed = await showValidationErrorsDialog(validation.missingKeys);
      if (!proceed) {
        clearOptionsState();
        updateState({ selectedOptionsFile: null });
        setStatus('⚠️', 'Options rejected. Loading schema only.', 'validation-warning');
        await sleep(600);
      } else {
        await applyOptionsData(resolved, optionsFile);
      }
    } else {
      await applyOptionsData(resolved, optionsFile);
    }
  } else {
    clearOptionsState();
    updateState({ selectedOptionsFile: null });
  }

  // Save to library if requested
  if (saveToLib) {
    try {
      await saveToRegistry(schemaFile, optionsFile, description, dirHandle);
      console.log('✅ Saved to schema library');
    } catch (err) {
      console.warn('Could not save to library:', err);
      // Non-fatal — continue loading
    }
  }

  closeModalAndRender(modal, schema);
  console.log(`✅ Loaded new files: ${schemaFile.name}`);
}

// ─── Shared utilities ─────────────────────────────────────────────────────────

/** Applies a resolved options object to global app state. */
async function applyOptionsData(resolvedOptions, optionsFile) {
  updateState({
    customOptions:     resolvedOptions,
    conditionalRules:  resolvedOptions.conditional_rules || {},
    triggersToAffected: {},
    selectedOptionsFile: optionsFile
  });

  // Build triggers map
  Object.entries(state.customOptions).forEach(([field, config]) => {
    if (config.dependent_values) {
      const depField = Object.keys(config.dependent_values)[0];
      if (depField) {
        state.triggersToAffected[depField] = state.triggersToAffected[depField] || [];
        state.triggersToAffected[depField].push({
          affected:      field,
          optionsMap:    config.dependent_values[depField],
          defaultValues: config.values || [],
          responseType:  config.response_type,
          inputControl:  config.input_control || 'drop-down',
          disable_values: config.disable_values || []
        });
      }
    }
  });
}

/** Clears all options-related state. */
function clearOptionsState() {
  updateState({
    customOptions:      {},
    conditionalRules:   {},
    triggersToAffected: {},
    exclusiveOptionsMap: {}
  });
}

/** Hides modal, renders form, and resets load-button UI. */
function closeModalAndRender(modal, schema) {
  setTimeout(() => {
    modal.style.display = 'none';
    renderForm(schema);
    updateFileStatusDisplay();

    // Reset Load Data button
    const loadDataBtn = document.getElementById('loadDataBtn');
    if (loadDataBtn) {
      loadDataBtn.textContent = 'Load';
      loadDataBtn.style.color = '';
      loadDataBtn.style.backgroundColor = '';
    }

    console.log('✅ Configuration loaded and form rendered');
  }, 400);
}

/** Tiny promise-based sleep. */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Startup: Schema Picker Banner ───────────────────────────────────────────

/**
 * Call this from data-builder.js → DOMContentLoaded (replaces the existing
 * auto-load block).
 *
 * • If the registry has entries → shows a compact "quick-load" banner above
 *   the form, letting users pick a schema without opening the full modal.
 * • If the registry is empty → shows nothing (user must use ⚙️ Config).
 */
export async function initSchemaPickerBanner() {
  const registry = await getAllSchemas();

  if (registry.entries.length === 0) {
    console.log('ℹ️ Schema library empty — awaiting manual config.');
    return;
  }

  const banner = buildPickerBanner(registry);
  const container = document.getElementById('tab-contents')
                 || document.querySelector('.container');
  if (container) {
    container.insertAdjacentElement('beforebegin', banner);
  }
}

/**
 * Builds the quick-picker banner DOM element.
 * @param {import('./schema-registry.js').RegistryResult} registry
 * @returns {HTMLElement}
 */
function buildPickerBanner(registry) {
  // ── Inject banner styles once ──────────────────────────────────────────────
  if (!document.getElementById('jb-banner-styles')) {
    const s = document.createElement('style');
    s.id = 'jb-banner-styles';
    s.textContent = `
      .jb-picker-banner      { background:linear-gradient(135deg,#f0f4ff 0%,#e8f5e9 100%);
                               border:1px solid #c5cde8; border-radius:10px;
                               padding:14px 20px; margin-bottom:16px;
                               display:flex; align-items:center; gap:16px;
                               flex-wrap:wrap; box-shadow:0 2px 6px rgba(0,0,0,.07); }
      .jb-picker-banner h4   { margin:0 0 2px; font-size:14px; color:#1a237e; }
      .jb-picker-banner p    { margin:0; font-size:12px; color:#555; }
      .jb-picker-meta        { flex:1; min-width:160px; }
      .jb-picker-select      { padding:7px 12px; font-size:13px; border:1px solid #ccc;
                               border-radius:6px; background:#fff; cursor:pointer;
                               min-width:220px; }
      .jb-picker-load-btn    { padding:8px 18px; font-size:13px; font-weight:600;
                               background:#0033ff; color:#fff; border:none;
                               border-radius:6px; cursor:pointer; transition:background .2s; }
      .jb-picker-load-btn:hover  { background:#0022cc; }
      .jb-picker-dismiss     { background:none; border:none; color:#999; cursor:pointer;
                               font-size:18px; padding:0 4px; line-height:1; }
      .jb-picker-dismiss:hover   { color:#333; }
    `;
    document.head.appendChild(s);
  }

  const banner = document.createElement('div');
  banner.className = 'jb-picker-banner';
  banner.id        = 'jbPickerBanner';

  const options = registry.entries.map((e, i) =>
    `<option value="${i}">${e.description || e.schema}</option>`
  ).join('');

  banner.innerHTML = `
    <div class="jb-picker-meta">
      <h4>📚 Schema Library</h4>
      <p>${registry.entries.length} schema${registry.entries.length === 1 ? '' : 's'} available</p>
    </div>
    <select class="jb-picker-select" id="jbPickerSelect">
      <option value="">— Choose a schema —</option>
      ${options}
    </select>
    <button class="jb-picker-load-btn" id="jbPickerLoadBtn">Load ▶</button>
    <button class="jb-picker-dismiss" id="jbPickerDismiss" title="Hide banner">✕</button>
  `;

  // Load button
  banner.querySelector('#jbPickerLoadBtn').addEventListener('click', async () => {
    const idx = parseInt(banner.querySelector('#jbPickerSelect').value);
    if (isNaN(idx) || idx < 0) {
      await ashAlert('Please select a schema first.');
      return;
    }

    const entry = registry.entries[idx];
    const btn   = banner.querySelector('#jbPickerLoadBtn');
    btn.textContent = '⏳ Loading…';
    btn.disabled    = true;

    try {
      const { schemaData, optionsData, schemaFile, optionsFile } =
        await loadSchemaEntry(entry, registry.dirHandle);

      const schema = schemaData;
      updateState({
        currentSchema:      schema,
        definitions:        schema.definitions || schema.$defs || {},
        selectedSchemaFile: schemaFile,
        selectedOptionsFile: optionsFile,
        dataFilename:       null
      });

      if (optionsData) {
        await applyOptionsData(optionsData, optionsFile);
      } else {
        clearOptionsState();
      }

      renderForm(schema);
      updateFileStatusDisplay();
      banner.remove();

      console.log(`✅ Quick-loaded: ${entry.schema}`);
    } catch (err) {
      console.error('Quick-load error:', err);
      await ashAlert(`Error loading schema: ${err.message}`);
      btn.textContent = 'Load ▶';
      btn.disabled    = false;
    }
  });

  // Dismiss button
  banner.querySelector('#jbPickerDismiss').addEventListener('click', () => {
    banner.remove();
  });

  return banner;
}
// ==== END OF FILE ====
