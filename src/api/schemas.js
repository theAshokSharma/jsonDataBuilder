// api/schemas.js  — Vercel serverless function
// Handles all schema CRUD via GitHub API

const GITHUB_API  = 'https://api.github.com';
const REPO        = process.env.GITHUB_REPO;   // e.g. "alice/json-data-builder"
const TOKEN       = process.env.GITHUB_TOKEN;
const BRANCH      = 'main';

function ghHeaders() {
  return {
    'Authorization': `Bearer ${TOKEN}`,
    'Accept':        'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type':  'application/json'
  };
}

// ── GitHub file helpers ───────────────────────────────────────────────────────

async function getFile(path) {
  const res = await fetch(
    `${GITHUB_API}/repos/${REPO}/contents/${path}?ref=${BRANCH}`,
    { headers: ghHeaders() }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET failed: ${res.status}`);
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
  if (sha) body.sha = sha;   // required for updates

  const res = await fetch(
    `${GITHUB_API}/repos/${REPO}/contents/${path}`,
    { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`GitHub PUT failed: ${err.message}`);
  }
}

async function deleteFile(path, sha) {
  const res = await fetch(
    `${GITHUB_API}/repos/${REPO}/contents/${path}`,
    {
      method: 'DELETE',
      headers: ghHeaders(),
      body: JSON.stringify({
        message: `chore: remove ${path}`,
        sha,
        branch: BRANCH
      })
    }
  );
  if (!res.ok) throw new Error(`GitHub DELETE failed: ${res.status}`);
}

async function getRegistry(username) {
  const file = await getFile(`schemas/${username}/jsonbuilder.config`);
  return file ? { data: JSON.parse(file.content), sha: file.sha }
              : { data: { entries: [] }, sha: null };
}

// ── Request router ────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Get username from header (set by frontend)
  const username = req.headers['x-username']?.trim().toLowerCase();
  if (!username) {
    return res.status(400).json({ error: 'x-username header required' });
  }

  const { method } = req;
  // Extract filename from URL e.g. /api/schemas/member-schema.json
  const filename = req.query.file || null;

  try {
    // GET /api/schemas  → list all entries
    if (method === 'GET' && !filename) {
      const { data } = await getRegistry(username);
      return res.status(200).json(data);
    }

    // GET /api/schemas?file=member-schema.json  → fetch one file
    if (method === 'GET' && filename) {
      const file = await getFile(`schemas/${username}/${filename}`);
      if (!file) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json(JSON.parse(file.content));
    }

    // POST /api/schemas  → save schema + options + update registry
    if (method === 'POST') {
      const { schemaName, schemaContent, optionsName,
              optionsContent, description } = req.body;

      // Save schema file
      const schemaSha = (await getFile(`schemas/${username}/${schemaName}`))?.sha;
      await putFile(`schemas/${username}/${schemaName}`, schemaContent, schemaSha);

      // Save options file if provided
      if (optionsName && optionsContent) {
        const optSha = (await getFile(`schemas/${username}/${optionsName}`))?.sha;
        await putFile(`schemas/${username}/${optionsName}`, optionsContent, optSha);
      }

      // Update registry
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

    // DELETE /api/schemas?file=member-schema.json  → remove entry
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