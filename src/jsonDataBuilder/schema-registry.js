// schema-registry.js (Vercel + GitHub backed)

const API = '/api/schemas';

function username() {
  return localStorage.getItem('jb-username') || '';
}

export function getCurrentUser() {
  return localStorage.getItem('jb-username') || null;
}

export function setCurrentUser(name) {
  localStorage.setItem('jb-username', name.trim().toLowerCase());
}

export function clearCurrentUser() {
  localStorage.removeItem('jb-username');
}

function headers(extra = {}) {
  return { 'x-username': username(), 'Content-Type': 'application/json', ...extra };
}

// ── Kept for backward compatibility ──────────────────────────────────────────
export async function getDirectoryName() {
  return 'schemas';
}

export async function getAllSchemas() {
  const res = await fetch(API, { headers: headers() });
  if (!res.ok) throw new Error('Failed to fetch schemas');
  return await res.json();
}

export async function saveToRegistry(schemaFile, optionsFile, description) {
  const schemaContent  = await schemaFile.text();
  const optionsContent = optionsFile ? await optionsFile.text() : null;

  const res = await fetch(API, {
    method:  'POST',
    headers: headers(),
    body: JSON.stringify({
      schemaName:     schemaFile.name,
      schemaContent,
      optionsName:    optionsFile?.name || null,
      optionsContent,
      description:    description || schemaFile.name
    })
  });
  if (!res.ok) throw new Error('Failed to save schema');
  return await res.json();
}

export async function loadSchemaEntry(entry) {
  const schemaData = await fetch(
    `${API}?file=${entry.schema}`, { headers: headers() }
  ).then(r => r.json());

  const optionsData = entry.options
    ? await fetch(`${API}?file=${entry.options}`, { headers: headers() }).then(r => r.json())
    : null;

  const schemaFile = new File(
    [JSON.stringify(schemaData)], entry.schema, { type: 'application/json' }
  );
  const optionsFile = optionsData
    ? new File([JSON.stringify(optionsData)], entry.options, { type: 'application/json' })
    : null;

  return { schemaData, optionsData, schemaFile, optionsFile };
}

export async function removeFromRegistry(schemaName) {
  const res = await fetch(`${API}?file=${schemaName}`, {
    method:  'DELETE',
    headers: headers()
  });
  if (!res.ok) throw new Error('Failed to remove schema');
}