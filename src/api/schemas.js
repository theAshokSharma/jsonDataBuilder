// api/schemas.js — Vercel serverless function
// Handles all schema CRUD operations via GitHub API
// Schemas are stored per-user at: /schemas/{username}/

const GITHUB_API = 'https://api.github.com';
const REPO       = process.env.GITHUB_REPO;    // e.g. "your-username/your-repo"
const TOKEN      = process.env.GITHUB_TOKEN;   // GitHub personal access token
const BRANCH     = process.env.GITHUB_BRANCH || 'main';

// ── GitHub API helpers ────────────────────────────────────────────────────────

function ghHeaders() {
  return {
    'Authorization':        `Bearer ${TOKEN}`,
    'Accept':               'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type':         'application/json'
  };
}

async function getFile(path) {
  const res = await fetch(
    `${GITHUB_API}/repos/${REPO}/contents/${path}?ref=${BRANCH}`,
    { headers: ghHeaders() }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET failed: ${res.status} for ${path}`);
  const data = await res.json();
  return {
    content: Buffer.from(data.content, 'base64').toString('utf8'),
    sha:     data.sha
  };
}

async function putFile(path, content, sha = null) {
  const body = {
    message: `chore: update ${path}`,
    content: Buffer.from(content).toString('base64'),
    branch:  BRANCH
  };
  if (sha) body.sha = sha;  // required for updates, omit for new files

  const res = await fetch(
    `${GITHUB_API}/repos/${REPO}/contents/${path}`,
    { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`GitHub PUT failed: ${err.message}`);
  }
}

async function getRegistry(username) {
  const path = `schemas/${username}/jsonbuilder.config`;
  const file = await getFile(path);
  return file
    ? { data: JSON.parse(file.content), sha: file.sha }
    : { data: { entries: [] }, sha: null };
}

// ── Request router ────────────────────────────────────────────────────────────

export default async function handler(req, res) {

  // ── CORS headers ────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-username');

  // Handle preflight request (browser sends OPTIONS before POST/DELETE)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Every request must identify the user
  const username = req.headers['x-username']?.trim().toLowerCase();
  if (!username) {
    return res.status(400).json({ error: 'x-username header is required' });
  }

  // Validate environment variables are set
  if (!REPO || !TOKEN) {
    return res.status(500).json({ error: 'Server misconfigured: GITHUB_REPO or GITHUB_TOKEN missing' });
  }

  const { method } = req;
  const filename   = req.query.file || null;  // e.g. ?file=member-schema.json

  try {

    // ── GET /api/schemas ──────────────────────────────────────────────────────
    // Returns the user's registry entries list
    if (method === 'GET' && !filename) {
      const { data } = await getRegistry(username);
      return res.status(200).json(data);
    }

    // ── GET /api/schemas?file=name.json ───────────────────────────────────────
    // Returns the content of a single schema or options file
    if (method === 'GET' && filename) {
      const file = await getFile(`schemas/${username}/${filename}`);
      if (!file) return res.status(404).json({ error: `File not found: ${filename}` });
      return res.status(200).json(JSON.parse(file.content));
    }

    // ── POST /api/schemas ─────────────────────────────────────────────────────
    // Saves schema + optional options file, updates registry
    if (method === 'POST') {
      const { schemaName, schemaContent,
              optionsName, optionsContent,
              description } = req.body;

      if (!schemaName || !schemaContent) {
        return res.status(400).json({ error: 'schemaName and schemaContent are required' });
      }

      // Save schema file (update if exists)
      const existingSchema = await getFile(`schemas/${username}/${schemaName}`);
      await putFile(
        `schemas/${username}/${schemaName}`,
        schemaContent,
        existingSchema?.sha || null
      );

      // Save options file if provided
      if (optionsName && optionsContent) {
        const existingOptions = await getFile(`schemas/${username}/${optionsName}`);
        await putFile(
          `schemas/${username}/${optionsName}`,
          optionsContent,
          existingOptions?.sha || null
        );
      }

      // Update registry — replace existing entry if same schema name
      const { data: registry, sha: regSha } = await getRegistry(username);
      registry.entries = registry.entries.filter(e => e.schema !== schemaName);
      registry.entries.push({
        schema:      schemaName,
        options:     optionsName || null,
        description: description || schemaName,
        savedAt:     new Date().toISOString()
      });

      await putFile(
        `schemas/${username}/jsonbuilder.config`,
        JSON.stringify(registry, null, 2),
        regSha
      );

      return res.status(200).json({ status: 'saved' });
    }

    // ── DELETE /api/schemas?file=name.json ────────────────────────────────────
    // Removes entry from registry (does not delete the file from repo)
    if (method === 'DELETE' && filename) {
      const { data: registry, sha: regSha } = await getRegistry(username);
      registry.entries = registry.entries.filter(e => e.schema !== filename);
      await putFile(
        `schemas/${username}/jsonbuilder.config`,
        JSON.stringify(registry, null, 2),
        regSha
      );
      return res.status(200).json({ status: 'deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('Schema API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
