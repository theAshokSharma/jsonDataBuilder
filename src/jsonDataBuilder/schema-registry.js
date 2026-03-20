// schema-registry.js
// ──────────────────────────────────────────────────────────────────────────────
// Manages the schema library by talking to the server-side API.
//
// All schema and options files live in  /schemas/  on the web server.
// The registry index lives at           /schemas/jsonbuilder.config
//
// API endpoints (provided by server.js):
//   GET    /api/registry          – fetch all registry entries
//   POST   /api/registry/save     – upload files + upsert entry
//   DELETE /api/registry/remove   – remove entry from config
//   GET    /schemas/:filename     – download a schema or options file
// ──────────────────────────────────────────────────────────────────────────────
// @ts-check

const REGISTRY_URL  = '/api/registry';
const SAVE_URL      = '/api/registry/save';
const REMOVE_URL    = '/api/registry/remove';
const SCHEMAS_BASE  = '/schemas';

// ─── Public types (JSDoc) ─────────────────────────────────────────────────────

/**
 * @typedef {Object} RegistryEntry
 * @property {string} schema      - Schema filename  (e.g. "member-schema.json")
 * @property {string} options     - Options filename (empty string when none)
 * @property {string} description - Human-readable label shown in the library
 */

/**
 * @typedef {Object} RegistryResult
 * @property {RegistryEntry[]} entries - All entries from jsonbuilder.config
 */

/**
 * @typedef {Object} LoadedSchema
 * @property {Object}      schemaData   - Parsed JSON schema
 * @property {Object|null} optionsData  - Parsed options JSON, or null
 * @property {File}        schemaFile   - File object (for passing to app state)
 * @property {File|null}   optionsFile  - File object, or null
 */

// ─── getAllSchemas ─────────────────────────────────────────────────────────────

/**
 * Fetches the full registry from the server.
 * If jsonbuilder.config does not exist yet the server creates it and returns [].
 *
 * @returns {Promise<RegistryResult>}
 */
export async function getAllSchemas() {
  try {
    const res = await fetch(REGISTRY_URL);

    if (!res.ok) {
      console.warn(`⚠️  GET ${REGISTRY_URL} returned ${res.status} — treating as empty registry`);
      return { entries: [] };
    }

    const data = await res.json();
    const entries = Array.isArray(data.entries) ? data.entries : [];

    console.log(`📚 Registry loaded: ${entries.length} schema(s)`);
    return { entries };

  } catch (err) {
    // Network error or server not running – fail gracefully
    console.error('❌ Could not reach registry endpoint:', err.message);
    return { entries: [] };
  }
}

// ─── saveToRegistry ───────────────────────────────────────────────────────────

/**
 * Uploads schema (and optional options) files to the server, then upserts the
 * entry in jsonbuilder.config.
 *
 * If an entry with the same schema filename already exists it is updated;
 * otherwise a new entry is appended.
 *
 * @param {File}        schemaFile   - The JSON schema file chosen by the user
 * @param {File|null}   optionsFile  - The options file (may be null)
 * @param {string}      description  - Human-readable description
 * @returns {Promise<RegistryEntry>} The saved / updated entry
 */
export async function saveToRegistry(schemaFile, optionsFile, description) {
  const form = new FormData();
  form.append('schemaFile',   schemaFile);
  form.append('description',  description || '');

  if (optionsFile) {
    form.append('optionsFile', optionsFile);
  }

  const res = await fetch(SAVE_URL, {
    method: 'POST',
    body:   form
    // Do NOT set Content-Type — the browser sets multipart boundary automatically
  });

  const data = await res.json();

  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Server error ${res.status}`);
  }

  console.log(`✅ Saved to registry: ${data.entry.schema}`);
  return data.entry;
}

// ─── loadSchemaEntry ──────────────────────────────────────────────────────────

/**
 * Downloads and parses the schema (and options) files for a registry entry.
 *
 * @param {RegistryEntry} entry
 * @returns {Promise<LoadedSchema>}
 */
export async function loadSchemaEntry(entry) {
  // ── Fetch schema ────────────────────────────────────────────────────────────
  const schemaURL  = `${SCHEMAS_BASE}/${encodeURIComponent(entry.schema)}`;
  const schemaRes  = await fetch(schemaURL);

  if (!schemaRes.ok) {
    throw new Error(`Could not load schema file "${entry.schema}" (${schemaRes.status})`);
  }

  const schemaText = await schemaRes.text();
  const schemaData = JSON.parse(schemaText);
  const schemaFile = new File([schemaText], entry.schema, { type: 'application/json' });

  // ── Fetch options (optional) ────────────────────────────────────────────────
  let optionsData = null;
  let optionsFile = null;

  if (entry.options) {
    try {
      const optsURL  = `${SCHEMAS_BASE}/${encodeURIComponent(entry.options)}`;
      const optsRes  = await fetch(optsURL);

      if (optsRes.ok) {
        const optsText = await optsRes.text();
        optionsData    = JSON.parse(optsText);
        optionsFile    = new File([optsText], entry.options, { type: 'application/json' });
      } else {
        console.warn(`⚠️  Options file "${entry.options}" not found on server (${optsRes.status})`);
      }
    } catch (err) {
      console.warn(`⚠️  Could not load options file "${entry.options}":`, err.message);
    }
  }

  console.log(`📂 Loaded: ${entry.schema}${optionsFile ? ` + ${entry.options}` : ''}`);

  return { schemaData, optionsData, schemaFile, optionsFile };
}

// ─── removeFromRegistry ───────────────────────────────────────────────────────

/**
 * Removes an entry from jsonbuilder.config on the server.
 * The actual files in schemas/ are NOT deleted.
 *
 * @param {string} schemaFilename  - The schema filename to remove
 * @returns {Promise<void>}
 */
export async function removeFromRegistry(schemaFilename) {
  const res  = await fetch(REMOVE_URL, {
    method:  'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ schema: schemaFilename })
  });

  const data = await res.json();

  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Server error ${res.status}`);
  }

  console.log(`🗑️  Removed from registry: ${schemaFilename}`);
}

// ─── getDirectoryName ─────────────────────────────────────────────────────────

/**
 * Returns the name of the schema directory as known to the server.
 * In the server-based model this is always the fixed "schemas" folder
 * sitting alongside index.html on the web server.
 *
 * Kept for API compatibility with code that previously used the
 * File System Access API version of this module.
 *
 * @returns {Promise<string>}
 */
export async function getDirectoryName() {
  return 'schemas';
}
// ==== END OF FILE ====