// schema-registry.js - Schema Registry Module
// Manages a persistent library of schemas using File System Access API
// Falls back to IndexedDB storage when File System Access is unavailable
// @ts-check

const REGISTRY_FILENAME   = 'jsonbuilder.config';
const DB_NAME             = 'JsonBuilderRegistry';
const DB_VERSION          = 1;
const STORE_HANDLES       = 'handles';
const STORE_SCHEMAS       = 'schemas';
const DIR_KEY             = 'schemaDirectory';
const IDB_CONFIG_KEY      = 'registryConfig';

// ─── IndexedDB helpers ───────────────────────────────────────────────────────

/**
 * Opens (or creates) the JsonBuilderRegistry IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = /** @type {IDBDatabase} */ (e.target.result);
      if (!db.objectStoreNames.contains(STORE_HANDLES)) {
        db.createObjectStore(STORE_HANDLES);
      }
      if (!db.objectStoreNames.contains(STORE_SCHEMAS)) {
        db.createObjectStore(STORE_SCHEMAS);
      }
    };

    req.onsuccess = (e) => resolve(/** @type {IDBDatabase} */ (e.target.result));
    req.onerror   = ()  => reject(req.error);
  });
}

/**
 * Generic IDB get.
 * @param {string} store
 * @param {string} key
 * @returns {Promise<any>}
 */
async function idbGet(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Generic IDB put.
 * @param {string} store
 * @param {string} key
 * @param {any}    value
 */
async function idbPut(store, key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(value, key);
    req.onsuccess = () => resolve(true);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Generic IDB delete.
 * @param {string} store
 * @param {string} key
 */
async function idbDelete(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror   = () => reject(req.error);
  });
}

// ─── File System Access API helpers ─────────────────────────────────────────

/** @returns {boolean} Whether the File System Access API is available */
export function isFileSystemAccessSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Stores a FileSystemDirectoryHandle in IndexedDB.
 * Handles are serialisable and survive page reloads.
 * @param {FileSystemDirectoryHandle} handle
 */
async function storeDirectoryHandle(handle) {
  await idbPut(STORE_HANDLES, DIR_KEY, handle);
}

/**
 * Retrieves the previously stored directory handle and (re-)verifies permission.
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
async function getStoredDirectoryHandle() {
  if (!isFileSystemAccessSupported()) return null;

  try {
    const handle = await idbGet(STORE_HANDLES, DIR_KEY);
    if (!handle) return null;

    // Check current permission level
    let permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      permission = await handle.requestPermission({ mode: 'readwrite' });
    }
    return permission === 'granted' ? handle : null;
  } catch {
    return null;
  }
}

/**
 * Prompts the user to pick a directory, persists the handle, and returns it.
 * Returns null if the user cancels.
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
export async function selectSchemaDirectory() {
  if (!isFileSystemAccessSupported()) {
    console.warn('File System Access API not available — using IndexedDB storage.');
    return null;
  }

  try {
    const handle = await window.showDirectoryPicker({
      id:      'jsonbuilder-schema-dir',
      mode:    'readwrite',
      startIn: 'documents'
    });
    await storeDirectoryHandle(handle);
    console.log('✅ Schema directory set:', handle.name);
    return handle;
  } catch (err) {
    if (err.name === 'AbortError') return null;
    throw err;
  }
}

// ─── Registry file I/O (FS mode) ─────────────────────────────────────────────

/**
 * Reads jsonbuilder.config from the directory.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @returns {Promise<Array<{schema:string, options:string, description:string}>>}
 */
async function readRegistryFromFS(dirHandle) {
  try {
    const fh   = await dirHandle.getFileHandle(REGISTRY_FILENAME);
    const file = await fh.getFile();
    const text = await file.text();
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (err.name === 'NotFoundError') return [];
    throw err;
  }
}

/**
 * Writes jsonbuilder.config to the directory.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {Array<{schema:string, options:string, description:string}>} registry
 */
async function writeRegistryToFS(dirHandle, registry) {
  const fh       = await dirHandle.getFileHandle(REGISTRY_FILENAME, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(registry, null, 2));
  await writable.close();
}

/**
 * Copies a File blob into the directory, returning the filename used.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {File} file
 * @returns {Promise<string>}
 */
async function copyFileToFS(dirHandle, file) {
  const fh       = await dirHandle.getFileHandle(file.name, { create: true });
  const writable = await fh.createWritable();
  await writable.write(await file.arrayBuffer());
  await writable.close();
  return file.name;
}

// ─── Registry file I/O (IndexedDB fallback) ───────────────────────────────

/**
 * Reads the registry from IndexedDB (fallback mode).
 * @returns {Promise<Array<{schema:string, options:string, description:string, _schemaData?:any, _optionsData?:any}>>}
 */
async function readRegistryFromIDB() {
  const data = await idbGet(STORE_SCHEMAS, IDB_CONFIG_KEY);
  return Array.isArray(data) ? data : [];
}

/**
 * Writes the registry to IndexedDB (fallback mode).
 * @param {Array} registry
 */
async function writeRegistryToIDB(registry) {
  await idbPut(STORE_SCHEMAS, IDB_CONFIG_KEY, registry);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * @typedef {Object} RegistryEntry
 * @property {string}  schema       - Schema filename
 * @property {string}  options      - Options filename (empty string if none)
 * @property {string}  description  - Human-readable description
 * @property {any}     [_schemaData]  - In-memory schema data (IDB fallback only)
 * @property {any}     [_optionsData] - In-memory options data (IDB fallback only)
 */

/**
 * @typedef {Object} RegistryResult
 * @property {RegistryEntry[]}                  entries
 * @property {FileSystemDirectoryHandle|null}   dirHandle
 * @property {boolean}                          isFSMode
 * @property {string|null}                      directoryName
 */

/**
 * Returns all entries from the schema registry.
 * @returns {Promise<RegistryResult>}
 */
export async function getAllSchemas() {
  // ── File System mode ──────────────────────────────────────────────────────
  const dirHandle = await getStoredDirectoryHandle();
  if (dirHandle) {
    try {
      const entries = await readRegistryFromFS(dirHandle);
      return {
        entries,
        dirHandle,
        isFSMode:      true,
        directoryName: dirHandle.name
      };
    } catch (err) {
      console.error('Error reading FS registry:', err);
    }
  }

  // ── IndexedDB fallback ────────────────────────────────────────────────────
  const entries = await readRegistryFromIDB();
  return {
    entries,
    dirHandle:     null,
    isFSMode:      false,
    directoryName: null
  };
}

/**
 * Saves schema (and optional options) to the registry.
 *
 * - If a File System directory is set, copies files there and updates
 *   jsonbuilder.config on disk.
 * - Otherwise, stores JSON content directly in IndexedDB.
 *
 * If a config entry with the same schema filename already exists it is
 * updated; otherwise a new entry is appended.
 *
 * @param {File}        schemaFile
 * @param {File|null}   optionsFile
 * @param {string}      description
 * @param {FileSystemDirectoryHandle|null} [dirHandle]  Pass if already known.
 * @returns {Promise<RegistryEntry>}  The saved/updated entry.
 */
export async function saveToRegistry(schemaFile, optionsFile, description, dirHandle = null) {
  // Resolve directory handle
  if (!dirHandle) {
    dirHandle = await getStoredDirectoryHandle();
  }

  let entry;

  if (dirHandle) {
    // ── File System mode ────────────────────────────────────────────────────
    const schemaFilename  = await copyFileToFS(dirHandle, schemaFile);
    const optionsFilename = optionsFile ? await copyFileToFS(dirHandle, optionsFile) : '';

    const registry = await readRegistryFromFS(dirHandle);
    const idx       = registry.findIndex(e => e.schema === schemaFilename);

    entry = { schema: schemaFilename, options: optionsFilename, description: description || '' };

    if (idx >= 0) {
      registry[idx] = entry;
      console.log(`✅ Registry updated (FS): ${schemaFilename}`);
    } else {
      registry.push(entry);
      console.log(`✅ Registry entry added (FS): ${schemaFilename}`);
    }

    await writeRegistryToFS(dirHandle, registry);

  } else {
    // ── IndexedDB fallback ──────────────────────────────────────────────────
    // Store file content as parsed JSON alongside the metadata
    const schemaData  = JSON.parse(await schemaFile.text());
    const optionsData = optionsFile ? JSON.parse(await optionsFile.text()) : null;

    const registry = await readRegistryFromIDB();
    const idx       = registry.findIndex(e => e.schema === schemaFile.name);

    entry = {
      schema:       schemaFile.name,
      options:      optionsFile?.name || '',
      description:  description || '',
      _schemaData:  schemaData,
      _optionsData: optionsData
    };

    if (idx >= 0) {
      registry[idx] = entry;
      console.log(`✅ Registry updated (IDB): ${schemaFile.name}`);
    } else {
      registry.push(entry);
      console.log(`✅ Registry entry added (IDB): ${schemaFile.name}`);
    }

    await writeRegistryToIDB(registry);
  }

  return entry;
}

/**
 * @typedef {Object} LoadedSchema
 * @property {Object}    schemaData
 * @property {Object|null} optionsData
 * @property {File}      schemaFile
 * @property {File|null} optionsFile
 */

/**
 * Loads the actual file content for a given registry entry.
 * @param {RegistryEntry}                      entry
 * @param {FileSystemDirectoryHandle|null}     dirHandle
 * @returns {Promise<LoadedSchema>}
 */
export async function loadSchemaEntry(entry, dirHandle) {
  if (dirHandle) {
    // ── File System mode ────────────────────────────────────────────────────
    const schemaFH   = await dirHandle.getFileHandle(entry.schema);
    const schemaFile = await schemaFH.getFile();
    const schemaText = await schemaFile.text();
    const schemaData = JSON.parse(schemaText);

    let optionsData = null;
    let optionsFile = null;

    if (entry.options) {
      try {
        const optsFH   = await dirHandle.getFileHandle(entry.options);
        const optsFile = await optsFH.getFile();
        const optsText = await optsFile.text();
        optionsData    = JSON.parse(optsText);
        // Re-create a File object so the rest of the app can call .text()
        optionsFile = new File([optsText], entry.options, { type: 'application/json' });
      } catch {
        console.warn(`Options file not found in directory: ${entry.options}`);
      }
    }

    return {
      schemaData,
      optionsData,
      schemaFile: new File([schemaText], entry.schema, { type: 'application/json' }),
      optionsFile
    };
  }

  // ── IndexedDB fallback ────────────────────────────────────────────────────
  const schemaJSON  = JSON.stringify(entry._schemaData  || {});
  const optionsJSON = entry._optionsData ? JSON.stringify(entry._optionsData) : null;

  return {
    schemaData:  entry._schemaData  || {},
    optionsData: entry._optionsData || null,
    schemaFile:  new File([schemaJSON],  entry.schema,  { type: 'application/json' }),
    optionsFile: optionsJSON
      ? new File([optionsJSON], entry.options || 'options.json', { type: 'application/json' })
      : null
  };
}

/**
 * Removes a registry entry (and optionally deletes files from disk).
 * @param {string}                         schemaFilename
 * @param {FileSystemDirectoryHandle|null} dirHandle
 * @param {boolean}                        [deleteFiles=false]
 */
export async function removeFromRegistry(schemaFilename, dirHandle, deleteFiles = false) {
  if (dirHandle) {
    const registry = await readRegistryFromFS(dirHandle);
    const entry     = registry.find(e => e.schema === schemaFilename);
    const updated   = registry.filter(e => e.schema !== schemaFilename);
    await writeRegistryToFS(dirHandle, updated);

    if (deleteFiles && entry) {
      try { await dirHandle.removeEntry(entry.schema);  } catch { /* ignore */ }
      try { await dirHandle.removeEntry(entry.options); } catch { /* ignore */ }
    }
    console.log(`🗑️ Removed from FS registry: ${schemaFilename}`);
  } else {
    const registry = await readRegistryFromIDB();
    const updated   = registry.filter(e => e.schema !== schemaFilename);
    await writeRegistryToIDB(updated);
    console.log(`🗑️ Removed from IDB registry: ${schemaFilename}`);
  }
}

/**
 * Returns the name of the configured schema directory, or null.
 * @returns {Promise<string|null>}
 */
export async function getDirectoryName() {
  const h = await getStoredDirectoryHandle();
  return h ? h.name : null;
}
// ==== END OF FILE ====