// showConfigModal-enhanced.js
// ──────────────────────────────────────────────────────────────────────────────
// Enhanced Config Modal with Schema Library.
//
// Reads the schema library from  /schemas/jsonbuilder.config  (via server API).
// When the user saves a new schema, files are uploaded to the server and the
// config file is updated automatically.
//
// Exports:
//   showConfigModal()          – open the config / library modal
//   initSchemaPickerBanner()   – show quick-load banner on page load
// ──────────────────────────────────────────────────────────────────────────────
// @ts-check

import { state, updateState }                                         from './state.js';
import { validateOptionsAgainstSchema, showValidationErrorsDialog }   from './file-validation.js';
import { ashAlert, ashConfirm }                                       from './utils.js';
import { renderForm, updateFileStatusDisplay }                        from './form-renderer.js';
import { resolveReferences }                                          from './file-operations.js';
import {
  getAllSchemas,
  saveToRegistry,
  loadSchemaEntry,
  removeFromRegistry
}                                                                     from './schema-registry.js';

// ─── Inject modal CSS once ────────────────────────────────────────────────────

(function injectStyles() {
  if (document.getElementById('jb-enhanced-modal-styles')) return;

  const style = document.createElement('style');
  style.id = 'jb-enhanced-modal-styles';
  style.textContent = `
    /* ── Modal shell ── */
    .jb-modal-content       { background:#fff; border-radius:16px; width:90%;
                               max-width:800px; max-height:90vh; overflow:hidden;
                               display:flex; flex-direction:column;
                               box-shadow:0 20px 60px rgba(0,0,0,.3);
                               animation:slideUp .35s ease; }
    .jb-modal-header        { padding:18px 24px 12px; background:var(--secondary-color,#0033ff);
                               color:#fff; flex-shrink:0; }
    .jb-modal-header h2     { margin:0 0 4px; font-size:26px; font-weight:700; }
    .jb-modal-subtitle      { margin:0; opacity:.88; font-size:14px; }

    /* ── Two-panel body ── */
    .jb-modal-body          { display:flex; flex:1; overflow:hidden; min-height:0; }
    .jb-panel               { padding:18px 20px; overflow-y:auto; }
    .jb-panel-library       { flex:0 0 42%; border-right:1px solid #eaeaea; }
    .jb-panel-new           { flex:1; }
    .jb-panel-title         { font-size:11px; font-weight:700; letter-spacing:.7px;
                               text-transform:uppercase; color:#999; margin:0 0 12px; }

    /* ── Schema library list ── */
    .jb-schema-list         { display:flex; flex-direction:column; gap:7px; }
    .jb-schema-item         { display:flex; align-items:flex-start; gap:10px;
                               padding:11px 12px; border:1px solid #e4e4e4;
                               border-radius:8px; cursor:pointer;
                               transition:border-color .15s, background .15s;
                               background:#fafafa; position:relative; }
    .jb-schema-item:hover   { border-color:#0033ff; background:#f0f4ff; }
    .jb-schema-item.selected{ border-color:#0033ff; background:#eef2ff;
                               box-shadow:0 0 0 3px rgba(0,51,255,.12); }
    .jb-schema-radio        { margin-top:3px; cursor:pointer;
                               accent-color:#0033ff; flex-shrink:0; }
    .jb-schema-meta         { flex:1; min-width:0; }
    .jb-schema-desc         { font-weight:600; font-size:13px; color:#1a1a2e;
                               white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .jb-schema-files        { font-size:11px; color:#777; margin-top:4px; line-height:1.7; }
    .jb-badge               { display:inline-block; font-size:10px; font-weight:700;
                               padding:1px 6px; border-radius:3px; margin-right:4px;
                               vertical-align:middle; }
    .jb-badge-schema        { background:#dae7f9; color:#0255b4; }
    .jb-badge-options       { background:#e0f6e5; color:#019240; }
    .jb-badge-none          { background:#f2f2f2; color:#999; }
    .jb-item-del            { background:none; border:none; color:#ddd; font-size:14px;
                               cursor:pointer; padding:2px 5px; border-radius:4px;
                               line-height:1; position:absolute; top:7px; right:7px;
                               transition:color .15s, background .15s; }
    .jb-item-del:hover      { color:#d32f2f; background:#fae0de; }
    .jb-empty               { color:#bbb; font-size:13px; text-align:center;
                               padding:32px 12px; line-height:1.8; }

    /* ── Steps (right panel) ── */
    .jb-step                { display:flex; gap:14px; margin-bottom:14px;
                               padding-bottom:14px; border-bottom:1px dashed #eee; }
    .jb-step:last-child     { border-bottom:none; margin-bottom:0; padding-bottom:0; }
    .jb-step-num            { width:26px; height:26px; border-radius:50%;
                               border:2px solid #0033ff; color:#0033ff; font-weight:700;
                               font-size:13px; display:flex; align-items:center;
                               justify-content:center; flex-shrink:0; margin-top:2px; }
    .jb-step-body h4        { margin:0 0 4px; font-size:13px; color:#222; font-weight:600; }
    .jb-step-body p         { margin:0 0 8px; font-size:12px; color:#888; line-height:1.5; }

    /* ── File chooser buttons ── */
    .jb-file-label          { display:inline-flex; align-items:center; gap:6px;
                               padding:6px 14px; background:#fff;
                               border:2px solid #0033ff; border-radius:7px;
                               cursor:pointer; font-size:12px; color:#0033ff;
                               font-weight:600; transition:all .2s; }
    .jb-file-label:hover    { background:#0033ff; color:#fff; }
    .jb-chosen-name         { display:none; margin-top:5px; font-size:11px;
                               color:#444; padding:4px 10px; background:#f0f4ff;
                               border-left:3px solid #0033ff; border-radius:3px; }
    .jb-chosen-name.show    { display:block; }

    /* ── Description textarea ── */
    .jb-desc                { width:100%; padding:7px 10px; font-family:inherit;
                               font-size:12px; border:1px solid #ccc; border-radius:6px;
                               resize:vertical; min-height:52px; box-sizing:border-box;
                               line-height:1.5; }
    .jb-desc:focus          { outline:none; border-color:#0033ff;
                               box-shadow:0 0 0 3px rgba(0,51,255,.1); }

    /* ── Save-to-library toggle ── */
    .jb-save-row            { display:flex; align-items:center; gap:8px;
                               font-size:12px; color:#555; cursor:pointer; }
    .jb-save-row input      { accent-color:#0033ff; width:15px; height:15px; cursor:pointer; }

    /* ── Status bar ── */
    .jb-status              { display:flex; align-items:center; gap:10px;
                               padding:10px 20px; background:#f8f9fa;
                               border-top:1px solid #eaeaea; font-size:13px;
                               flex-shrink:0; }
    .jb-status-icon         { font-size:18px; flex-shrink:0; }
    .jb-status.ok           { background:#f0faf2; }
    .jb-status.warn         { background:#fffbf0; }
    .jb-status.err          { background:#fff5f5; }

    /* ── Footer ── */
    .jb-footer              { display:flex; justify-content:flex-end; gap:12px;
                               padding:14px 20px; background:#f8f9fa;
                               border-top:1px solid #eaeaea; flex-shrink:0; }

    /* ── Quick-picker banner ── */
    .jb-banner              { display:flex; align-items:center; gap:14px; flex-wrap:wrap;
                               background:linear-gradient(135deg,#f0f4ff 0%,#e8f5e9 100%);
                               border:1px solid #c5cde8; border-radius:10px;
                               padding:12px 18px; margin-bottom:16px;
                               box-shadow:0 2px 6px rgba(0,0,0,.07); }
    .jb-banner-meta         { flex:1; min-width:140px; }
    .jb-banner-meta h4      { margin:0 0 2px; font-size:14px; color:#1a237e; font-weight:700; }
    .jb-banner-meta p       { margin:0; font-size:12px; color:#666; }
    .jb-banner-select       { padding:7px 10px; font-size:13px; border:1px solid #ccc;
                               border-radius:6px; background:#fff; cursor:pointer;
                               min-width:210px; max-width:320px; flex:1; }
    .jb-banner-load         { padding:8px 18px; font-size:13px; font-weight:600;
                               background:#0033ff; color:#fff; border:none;
                               border-radius:6px; cursor:pointer; white-space:nowrap;
                               transition:background .2s; }
    .jb-banner-load:hover   { background:#0022cc; }
    .jb-banner-load:disabled{ background:#aaa; cursor:not-allowed; }
    .jb-banner-dismiss      { background:none; border:none; color:#bbb; cursor:pointer;
                               font-size:18px; padding:0 4px; line-height:1; flex-shrink:0; }
    .jb-banner-dismiss:hover{ color:#555; }
  `;
  document.head.appendChild(style);
})();

// ─── Modal HTML ───────────────────────────────────────────────────────────────

/**
 * Builds inner HTML for the config modal.
 * @param {import('./schema-registry.js').RegistryEntry[]} entries
 */
function buildModalHTML(entries) {

  const libraryRows = entries.length === 0
    ? `<div class="jb-empty">
         No schemas saved yet.<br>
         Load a new schema on the right<br>
         and tick <strong>Save to Library</strong>.
       </div>`
    : entries.map((e, i) => `
        <div class="jb-schema-item" data-index="${i}" id="jb-item-${i}">
          <input type="radio" class="jb-schema-radio"
                 name="jb-sel" id="jb-radio-${i}" value="${i}">
          <div class="jb-schema-meta">
            <div class="jb-schema-desc" title="${escAttr(e.description || e.schema)}">
              ${escHtml(e.description || e.schema)}
            </div>
            <div class="jb-schema-files">
              <span class="jb-badge jb-badge-schema">Schema</span>${escHtml(e.schema)}<br>
              ${e.options
                ? `<span class="jb-badge jb-badge-options">Options</span>${escHtml(e.options)}`
                : `<span class="jb-badge jb-badge-none">No options file</span>`}
            </div>
          </div>
          <button class="jb-item-del" data-index="${i}"
                  title="Remove from library">✕</button>
        </div>`).join('');

  return `
    <div class="jb-modal-content">

      <div class="jb-modal-header">
        <h2>⚙️ Configuration</h2>
        <p class="jb-modal-subtitle">
          Pick a saved schema or load new files
        </p>
      </div>

      <div class="jb-modal-body">

        <!-- ── Left: Library ── -->
        <div class="jb-panel jb-panel-library">
          <p class="jb-panel-title">📚 Schema Library</p>
          <div class="jb-schema-list" id="jbList">${libraryRows}</div>
        </div>

        <!-- ── Right: Load new ── -->
        <div class="jb-panel jb-panel-new">
          <p class="jb-panel-title">📁 Load New Files</p>

          <!-- Step 1 – Schema -->
          <div class="jb-step">
            <div class="jb-step-num">1</div>
            <div class="jb-step-body">
              <h4>Schema File <span style="color:#d32f2f">*</span></h4>
              <p>JSON Schema that defines the form structure</p>
              <input type="file" accept=".json" id="jbSchemaInput" style="display:none">
              <label for="jbSchemaInput" class="jb-file-label">
                📄 Choose Schema
              </label>
              <div class="jb-chosen-name" id="jbSchemaName"></div>
            </div>
          </div>

          <!-- Step 2 – Options -->
          <div class="jb-step">
            <div class="jb-step-num">2</div>
            <div class="jb-step-body">
              <h4>Options File <span style="color:#999; font-weight:400;">(optional)</span></h4>
              <p>Custom dropdowns, dependent fields and conditional rules</p>
              <input type="file" accept=".json" id="jbOptionsInput" style="display:none">
              <label for="jbOptionsInput" class="jb-file-label">
                ⚙️ Choose Options
              </label>
              <div class="jb-chosen-name" id="jbOptionsName"></div>
            </div>
          </div>

          <!-- Step 3 – Description -->
          <div class="jb-step">
            <div class="jb-step-num">3</div>
            <div class="jb-step-body">
              <h4>Description <span style="color:#999; font-weight:400;">(optional)</span></h4>
              <p>Label shown in the library list</p>
              <textarea class="jb-desc" id="jbDesc"
                placeholder="e.g. Member entry form — Plan Year 2025"
                maxlength="200"></textarea>
            </div>
          </div>

          <!-- Step 4 – Save toggle -->
          <div class="jb-step">
            <div class="jb-step-num">4</div>
            <div class="jb-step-body">
              <h4>Save to Library</h4>
              <label class="jb-save-row">
                <input type="checkbox" id="jbSaveChk" checked>
                Remember this schema for quick access next time
              </label>
            </div>
          </div>
        </div>

      </div><!-- /.jb-modal-body -->

      <!-- Status bar -->
      <div class="jb-status" id="jbStatus">
        <span class="jb-status-icon">⏳</span>
        <span id="jbStatusText">Select a saved schema or load new files.</span>
      </div>

      <!-- Footer -->
      <div class="jb-footer">
        <button id="jbCancelBtn" class="btn-secondary">Cancel</button>
        <button id="jbConfirmBtn" class="btn-primary" disabled>
          <span class="btn-icon">▶</span> Load Configuration
        </button>
      </div>

    </div><!-- /.jb-modal-content -->
  `;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function setStatus(icon, text, cls = '') {
  const bar  = document.getElementById('jbStatus');
  const txt  = document.getElementById('jbStatusText');
  const ico  = bar?.querySelector('.jb-status-icon');
  if (!bar || !txt || !ico) return;
  bar.className       = `jb-status ${cls}`;
  ico.textContent     = icon;
  txt.textContent     = text;
}

function setConfirmEnabled(on) {
  const btn = document.getElementById('jbConfirmBtn');
  if (btn) btn.disabled = !on;
}

// ─── showConfigModal ──────────────────────────────────────────────────────────

/**
 * Opens the enhanced config modal.
 */
export async function showConfigModal() {

  const modal = document.getElementById('config-modal');
  if (!modal) { console.error('config-modal element missing'); return; }

  // Load registry from server
  let registry;
  try {
    registry = await getAllSchemas();
  } catch {
    registry = { entries: [] };
  }

  // Build and show modal
  modal.innerHTML = buildModalHTML(registry.entries);
  modal.style.display = 'flex';

  // ── Session-local state ──────────────────────────────────────────────────
  let newSchemaFile  = null;   // File chosen in step 1
  let newOptionsFile = null;   // File chosen in step 2
  let libIndex       = -1;     // selected library row (-1 = none)

  // ── Helpers ──────────────────────────────────────────────────────────────

  function selectLibRow(idx) {
    libIndex = idx;
    document.querySelectorAll('.jb-schema-item')
      .forEach(el => el.classList.remove('selected'));
    document.getElementById(`jb-item-${idx}`)?.classList.add('selected');
    const entry = registry.entries[idx];
    setStatus('✅', `Ready — "${entry.description || entry.schema}"`, 'ok');
    setConfirmEnabled(true);
    // Clear "new file" selections so modes don't mix
    newSchemaFile  = null;
    newOptionsFile = null;
    document.getElementById('jbSchemaName').classList.remove('show');
    document.getElementById('jbOptionsName').classList.remove('show');
    document.getElementById('jbSchemaInput').value  = '';
    document.getElementById('jbOptionsInput').value = '';
  }

  // ── Library row clicks ────────────────────────────────────────────────────

  function attachLibListeners() {
    document.querySelectorAll('.jb-schema-item').forEach(item => {
      item.addEventListener('click', e => {
        if (e.target.classList.contains('jb-item-del')) return;
        const idx = parseInt(item.dataset.index);
        document.getElementById(`jb-radio-${idx}`).checked = true;
        selectLibRow(idx);
      });
    });

    document.querySelectorAll('.jb-schema-radio').forEach(r => {
      r.addEventListener('change', () => selectLibRow(parseInt(r.value)));
    });

    document.querySelectorAll('.jb-item-del').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const idx   = parseInt(btn.dataset.index);
        const entry = registry.entries[idx];
        if (!entry) return;

        const ok = await ashConfirm(
          `Remove "${entry.description || entry.schema}" from the library?\n\nThe file in /schemas/ will not be deleted.`
        );
        if (!ok) return;

        try {
          await removeFromRegistry(entry.schema);
        } catch (err) {
          await ashAlert(`Could not remove entry: ${err.message}`);
          return;
        }

        // Refresh list
        registry = await getAllSchemas();
        rebuildList(registry.entries);

        if (libIndex === idx) {
          libIndex = -1;
          setStatus('⏳', 'Entry removed. Select from library or load new files.');
          setConfirmEnabled(false);
        }
      });
    });
  }

  /** Rebuilds the library list HTML without re-drawing the whole modal */
  function rebuildList(entries) {
    const list = document.getElementById('jbList');
    if (!list) return;
    list.innerHTML = entries.length === 0
      ? `<div class="jb-empty">
           No schemas saved yet.<br>
           Load a new schema on the right<br>
           and tick <strong>Save to Library</strong>.
         </div>`
      : entries.map((e, i) => `
          <div class="jb-schema-item" data-index="${i}" id="jb-item-${i}">
            <input type="radio" class="jb-schema-radio"
                   name="jb-sel" id="jb-radio-${i}" value="${i}">
            <div class="jb-schema-meta">
              <div class="jb-schema-desc">${escHtml(e.description || e.schema)}</div>
              <div class="jb-schema-files">
                <span class="jb-badge jb-badge-schema">Schema</span>${escHtml(e.schema)}<br>
                ${e.options
                  ? `<span class="jb-badge jb-badge-options">Options</span>${escHtml(e.options)}`
                  : `<span class="jb-badge jb-badge-none">No options file</span>`}
              </div>
            </div>
            <button class="jb-item-del" data-index="${i}" title="Remove from library">✕</button>
          </div>`).join('');
    attachLibListeners();
  }

  attachLibListeners();

  // ── New file inputs ────────────────────────────────────────────────────────

  document.getElementById('jbSchemaInput').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      JSON.parse(await file.text());
    } catch {
      await ashAlert('The chosen file is not valid JSON.');
      e.target.value = '';
      return;
    }

    newSchemaFile = file;
    libIndex      = -1;
    document.querySelectorAll('.jb-schema-item').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.jb-schema-radio').forEach(r => r.checked = false);

    const nameEl = document.getElementById('jbSchemaName');
    nameEl.textContent = `📄 ${file.name}`;
    nameEl.classList.add('show');

    // Pre-fill description if empty
    const descEl = document.getElementById('jbDesc');
    if (descEl && !descEl.value.trim()) {
      descEl.value = file.name.replace(/\.json$/i, '').replace(/[-_]/g, ' ');
    }

    setStatus('✅', 'Schema ready — add options or confirm to load.', 'ok');
    setConfirmEnabled(true);
  });

  document.getElementById('jbOptionsInput').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      JSON.parse(await file.text());
    } catch {
      await ashAlert('The chosen options file is not valid JSON.');
      e.target.value = '';
      return;
    }

    newOptionsFile = file;
    const nameEl = document.getElementById('jbOptionsName');
    nameEl.textContent = `⚙️ ${file.name}`;
    nameEl.classList.add('show');
  });

  // ── Cancel / backdrop ─────────────────────────────────────────────────────

  document.getElementById('jbCancelBtn').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  modal.addEventListener('click', e => {
    if (e.target === modal) modal.style.display = 'none';
  });

  // ── Confirm ───────────────────────────────────────────────────────────────

  document.getElementById('jbConfirmBtn').addEventListener('click', async () => {
    setStatus('⏳', 'Loading…');
    setConfirmEnabled(false);

    try {
      if (libIndex >= 0) {
        // ── Mode A: load from library ───────────────────────────────────────
        await doLoadFromLibrary(registry.entries[libIndex], modal);

      } else if (newSchemaFile) {
        // ── Mode B: load new files ──────────────────────────────────────────
        const description   = document.getElementById('jbDesc').value.trim();
        const saveToLib     = document.getElementById('jbSaveChk').checked;
        await doLoadNewFiles(newSchemaFile, newOptionsFile, description, saveToLib, modal);

      } else {
        setStatus('⚠️', 'Please select a library entry or choose a schema file.', 'warn');
        setConfirmEnabled(true);
      }
    } catch (err) {
      console.error('Config load error:', err);
      setStatus('❌', `Error: ${err.message}`, 'err');
      setConfirmEnabled(true);
    }
  });
}

// ─── Banner dropdown refresh ──────────────────────────────────────────────────

/**
 * Re-fetches the registry from the server, rebuilds the banner dropdown
 * options, and selects the entry whose schema filename matches `activeSchema`.
 *
 * Called after any load so the banner always reflects the current state:
 *   • Mode A (library load)  – selects the entry that was just loaded.
 *   • Mode B (new files)     – adds the newly saved entry and selects it.
 *   • Banner quick-load      – already has the index; still refreshes list
 *                              in case other entries were added meanwhile.
 *
 * @param {string} activeSchema  - Filename to select (e.g. "member-schema.json")
 */
async function refreshBannerDropdown(activeSchema) {
  const sel = document.getElementById('jbBannerSel');
  if (!sel) return;   // banner not present (dismissed or not yet shown)

  let registry;
  try {
    registry = await getAllSchemas();
  } catch {
    console.warn('Could not refresh banner dropdown.');
    return;
  }

  const entries = registry.entries || [];

  // Rebuild all <option> elements
  // Keep the placeholder as the first option
  sel.innerHTML =
    '<option value="">— Choose a schema —</option>' +
    entries.map((e, i) =>
      `<option value="${i}">${escHtml(e.description || e.schema)}</option>`
    ).join('');

  // Update the count label in the banner meta
  const metaP = document.querySelector('#jbPickerBanner .jb-banner-meta p');
  if (metaP) {
    metaP.textContent =
      `${entries.length} schema${entries.length === 1 ? '' : 's'} available`;
  }

  // Select the active entry
  const activeIdx = entries.findIndex(e => e.schema === activeSchema);
  if (activeIdx >= 0) {
    sel.value = String(activeIdx);
    console.log(`📌 Banner dropdown: selected index ${activeIdx} ("${activeSchema}")`);
  } else {
    sel.value = '';
    console.log(`ℹ️  Banner dropdown: "${activeSchema}" not found in registry`);
  }
}

// ─── Load helpers ─────────────────────────────────────────────────────────────

/** Mode A – load from saved library entry */
async function doLoadFromLibrary(entry, modal) {
  const { schemaData, optionsData, schemaFile, optionsFile } =
    await loadSchemaEntry(entry);

  updateState({
    currentSchema:      schemaData,
    definitions:        schemaData.definitions || schemaData.$defs || {},
    selectedSchemaFile: schemaFile,
    selectedOptionsFile: optionsFile,
    dataFilename:       null
  });

  if (optionsData) {
    // resolveReferences must run on raw data before applying —
    // it expands $ref pointers and ##listName shortcuts in the options file.
    const resolvedOptions = resolveReferences(optionsData, optionsData);
    await applyOptions(resolvedOptions, optionsFile);
    console.log(`✅ Options applied: ${entry.options}`);
  } else {
    clearOptions();
    console.log('ℹ️ No options file for this schema entry.');
  }

  finishLoad(modal, schemaData);

  // Refresh the banner dropdown and highlight the just-loaded entry.
  refreshBannerDropdown(entry.schema);

  console.log(`✅ Loaded from library: ${entry.schema}`);
}

/** Mode B – load freshly chosen files, optionally save to library */
async function doLoadNewFiles(schemaFile, optionsFile, description, saveToLib, modal) {
  const schemaText = await schemaFile.text();
  const schema     = JSON.parse(schemaText);

  updateState({
    currentSchema:      schema,
    definitions:        schema.definitions || schema.$defs || {},
    selectedSchemaFile: schemaFile,
    dataFilename:       null
  });

  if (optionsFile) {
    const rawOpts  = JSON.parse(await optionsFile.text());
    const resolved = resolveReferences(rawOpts, rawOpts);

    const validation = validateOptionsAgainstSchema(resolved, schema);
    if (!validation.isValid) {
      const proceed = await showValidationErrorsDialog(validation.missingKeys);
      if (!proceed) {
        clearOptions();
        updateState({ selectedOptionsFile: null });
      } else {
        await applyOptions(resolved, optionsFile);
      }
    } else {
      await applyOptions(resolved, optionsFile);
    }
  } else {
    clearOptions();
    updateState({ selectedOptionsFile: null });
  }

  // Save to server if requested
  if (saveToLib) {
    try {
      await saveToRegistry(schemaFile, optionsFile, description);
      console.log('✅ Schema saved to server library');
    } catch (err) {
      // Non-fatal — file still loads, just warn
      console.warn('⚠️  Could not save to library:', err.message);
    }
  }

  finishLoad(modal, schema);

  // Refresh the banner dropdown so the newly saved entry appears
  // and is selected. Works even when saveToLib was unchecked because
  // refreshBannerDropdown silently handles a missing entry.
  refreshBannerDropdown(schemaFile.name);

  console.log(`✅ Loaded new files: ${schemaFile.name}`);
}

// ─── Shared utilities ─────────────────────────────────────────────────────────

/** Applies resolved options object to global app state */
async function applyOptions(resolvedOptions, optionsFile) {
  updateState({
    customOptions:       resolvedOptions,
    conditionalRules:    resolvedOptions.conditional_rules || {},
    triggersToAffected:  {},
    selectedOptionsFile: optionsFile
  });

  Object.entries(state.customOptions).forEach(([field, config]) => {
    if (config.dependent_values) {
      const depField = Object.keys(config.dependent_values)[0];
      if (depField) {
        state.triggersToAffected[depField] = state.triggersToAffected[depField] || [];
        state.triggersToAffected[depField].push({
          affected:       field,
          optionsMap:     config.dependent_values[depField],
          defaultValues:  config.values || [],
          responseType:   config.response_type,
          inputControl:   config.input_control || 'drop-down',
          disable_values: config.disable_values || [],
          exclusive_values: config.exclusive_values || [] 
        });
      }
    }
  });
}

/** Clears all options-related state */
function clearOptions() {
  updateState({
    customOptions:       {},
    conditionalRules:    {},
    triggersToAffected:  {},
    exclusiveOptionsMap: {}
  });
}

/** Closes the modal and renders the form */
function finishLoad(modal, schema) {
  // Reset Load Data button
  const loadDataBtn = document.getElementById('loadDataBtn');
  if (loadDataBtn) {
    loadDataBtn.textContent       = '📀 Load';
    loadDataBtn.style.color       = '';
    loadDataBtn.style.backgroundColor = '';
  }

  setTimeout(() => {
    modal.style.display = 'none';
    renderForm(schema);
    updateFileStatusDisplay();
    console.log('✅ Form rendered');
  }, 350);
}

// ─── initSchemaPickerBanner ───────────────────────────────────────────────────

/**
 * Shows a compact quick-load banner above the form on page startup.
 * Does nothing if the library is empty.
 * Call this from data-builder.js → DOMContentLoaded.
 */
export async function initSchemaPickerBanner() {
  let registry;
  try {
    registry = await getAllSchemas();
  } catch {
    console.warn('Could not load schema registry for banner.');
    return;
  }

  if (!registry.entries || registry.entries.length === 0) {
    console.log('ℹ️ Schema library is empty — banner not shown.');
    return;
  }

  const banner = buildPickerBanner(registry.entries);

  // Insert immediately after the header so the banner sits below it
  // but above everything else. Using the header as the anchor means
  // the banner position is never affected by file-status toggling.
  const header = document.querySelector('.header');
  if (header) {
    header.insertAdjacentElement('afterend', banner);
  } else {
    // Fallback: first child of container
    const container = document.querySelector('.container');
    if (container) container.insertAdjacentElement('afterbegin', banner);
  }
}

/** Builds the quick-picker banner DOM element */
function buildPickerBanner(entries) {
  const banner = document.createElement('div');
  banner.className = 'jb-banner';
  banner.id        = 'jbPickerBanner';

  const options = entries.map((e, i) =>
    `<option value="${i}">${escHtml(e.description || e.schema)}</option>`
  ).join('');

  banner.innerHTML = `
    <div class="jb-banner-meta">
      <h4>📚 Schema Library</h4>
      <p>${entries.length} schema${entries.length === 1 ? '' : 's'} available</p>
    </div>
    <select class="jb-banner-select" id="jbBannerSel">
      <option value="">— Choose a schema —</option>
      ${options}
    </select>
    <button class="jb-banner-load" id="jbBannerLoad">Load ▶</button>
    <button class="jb-banner-dismiss" id="jbBannerDismiss" title="Dismiss">✕</button>
  `;

  // Load button
  banner.querySelector('#jbBannerLoad').addEventListener('click', async () => {
    const sel = banner.querySelector('#jbBannerSel');
    const idx = parseInt(sel.value);

    if (isNaN(idx) || idx < 0) {
      await ashAlert('Please choose a schema from the list first.');
      return;
    }

    const loadBtn       = banner.querySelector('#jbBannerLoad');
    loadBtn.textContent = '⏳ Loading…';
    loadBtn.disabled    = true;

    try {
      const entry = entries[idx];
      const { schemaData, optionsData, schemaFile, optionsFile } =
        await loadSchemaEntry(entry);

      updateState({
        currentSchema:       schemaData,
        definitions:         schemaData.definitions || schemaData.$defs || {},
        selectedSchemaFile:  schemaFile,
        selectedOptionsFile: optionsFile,
        dataFilename:        null
      });

      if (optionsData) {
        // resolveReferences must run on raw data before applying.
        const resolvedOptions = resolveReferences(optionsData, optionsData);
        await applyOptions(resolvedOptions, optionsFile);
        console.log(`✅ Options applied: ${entry.options}`);
      } else {
        clearOptions();
        console.log('ℹ️ No options file for this schema entry.');
      }

      renderForm(schemaData);
      updateFileStatusDisplay();

      // Keep the banner visible so the user can switch schemas at any time.
      // Show a brief success indicator then restore the button.
      loadBtn.textContent = '✅ Loaded';
      loadBtn.style.background = '#019240';
      setTimeout(() => {
        loadBtn.textContent       = 'Load ▶';
        loadBtn.style.background  = '';
        loadBtn.disabled          = false;
      }, 2000);

      // Refresh the dropdown (registry may have grown) and re-select.
      await refreshBannerDropdown(entry.schema);

      console.log(`✅ Quick-loaded: ${entry.schema}`);
    } catch (err) {
      console.error('Quick-load error:', err);
      await ashAlert(`Error loading schema: ${err.message}`);
      loadBtn.textContent      = 'Load ▶';
      loadBtn.style.background = '';
      loadBtn.disabled         = false;
    }
  });

  // Dismiss button
  banner.querySelector('#jbBannerDismiss').addEventListener('click', () => {
    banner.remove();
  });

  return banner;
}

// ─── Tiny escape helpers ──────────────────────────────────────────────────────

function escHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str = '') {
  return escHtml(str);
}
// ==== END OF FILE ====