// schema-registry.js (Vercel/browser-compatible version)

const REGISTRY_KEY = 'jb_schema_registry';

// ── Kept for backward compatibility with any imports ──────────────────────────
export async function getDirectoryName() {
  return 'schemas';
}

export async function getAllSchemas() {
  const raw = localStorage.getItem(REGISTRY_KEY);
  return raw ? JSON.parse(raw) : { entries: [] };
}

export async function saveToRegistry(schemaFile, optionsFile, description) {
  const registry = await getAllSchemas();
  
  const schemaText = await schemaFile.text();
  const entry = {
    schema: schemaFile.name,
    options: optionsFile ? optionsFile.name : null,
    description: description || schemaFile.name,
    schemaContent: schemaText,
    optionsContent: optionsFile ? await optionsFile.text() : null,
    savedAt: new Date().toISOString()
  };

  const idx = registry.entries.findIndex(e => e.schema === entry.schema);
  if (idx >= 0) registry.entries[idx] = entry;
  else registry.entries.push(entry);

  localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
  return entry;
}

export async function loadSchemaEntry(entry) {
  const schemaData = JSON.parse(entry.schemaContent);
  const optionsData = entry.optionsContent ? JSON.parse(entry.optionsContent) : null;

  const schemaBlob = new Blob([entry.schemaContent], { type: 'application/json' });
  const schemaFile = new File([schemaBlob], entry.schema, { type: 'application/json' });

  let optionsFile = null;
  if (entry.optionsContent) {
    const optBlob = new Blob([entry.optionsContent], { type: 'application/json' });
    optionsFile = new File([optBlob], entry.options, { type: 'application/json' });
  }

  return { schemaData, optionsData, schemaFile, optionsFile };
}

export async function removeFromRegistry(schemaName) {
  const registry = await getAllSchemas();
  registry.entries = registry.entries.filter(e => e.schema !== schemaName);
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
}
