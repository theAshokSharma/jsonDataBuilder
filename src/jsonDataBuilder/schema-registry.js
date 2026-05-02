// schema-registry.js (Vercel + GitHub backed, per-user isolation)
// Drop-in replacement — all function signatures unchanged.

const API = '/api/schemas';

// ── User helpers (used by data-builder.js) ────────────────────────────────────

export function getCurrentUser() {
  return localStorage.getItem('jb-username') || null;
}

export function setCurrentUser(name) {
  localStorage.setItem('jb-username', name.trim().toLowerCase());
}

export function clearCurrentUser() {
  localStorage.removeItem('jb-username');
}

function userHeaders(extra = {}) {
  return {
    'x-username':   getCurrentUser() || '',
    'Content-Type': 'application/json',
    ...extra
  };
}

// ── Kept for backward compatibility with any imports ──────────────────────────
export async function getDirectoryName() {
  return 'schemas';
}

// ── Registry CRUD ─────────────────────────────────────────────────────────────

export async function getAllSchemas() {
  const res = await fetch(API, { headers: userHeaders() });
  if (!res.ok) throw new Error('Failed to fetch schemas');
  return await res.json();
}

export async function saveToRegistry(schemaFile, optionsFile, description) {
  const schemaContent  = await schemaFile.text();
  const optionsContent = optionsFile ? await optionsFile.text() : null;

  const res = await fetch(API, {
    method:  'POST',
    headers: userHeaders(),
    body: JSON.stringify({
      schemaName:     schemaFile.name,
      schemaContent,
      optionsName:    optionsFile?.name  || null,
      optionsContent: optionsContent     || null,
      description:    description        || schemaFile.name
    })
  });
  if (!res.ok) throw new Error('Failed to save schema');
  return await res.json();
}

export async function loadSchemaEntry(entry) {
  const schemaData = await fetch(
    `${API}?file=${entry.schema}`,
    { headers: userHeaders() }
  ).then(r => r.json());

  const optionsData = entry.options
    ? await fetch(`${API}?file=${entry.options}`, { headers: userHeaders() }).then(r => r.json())
    : null;

  // Wrap in File objects to match what the rest of the app expects
  const schemaFile = new File(
    [JSON.stringify(schemaData)],
    entry.schema,
    { type: 'application/json' }
  );
  const optionsFile = optionsData
    ? new File(
        [JSON.stringify(optionsData)],
        entry.options,
        { type: 'application/json' }
      )
    : null;

  return { schemaData, optionsData, schemaFile, optionsFile };
}

export async function removeFromRegistry(schemaName) {
  const res = await fetch(`${API}?file=${schemaName}`, {
    method:  'DELETE',
    headers: userHeaders()
  });
  if (!res.ok) throw new Error('Failed to remove schema');
}