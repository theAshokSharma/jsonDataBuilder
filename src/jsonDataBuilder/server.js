// server.js  –  JSON Data Builder local server
// ─────────────────────────────────────────────
// Serves the application as static files and exposes three API
// endpoints that the browser cannot handle alone (writing files
// to the server's schemas/ folder).
//
// Usage:
//   node server.js            (default port 3000)
//   PORT=8080 node server.js  (custom port)
//
// Dependencies  (npm install express multer cors):
//   express  ^4
//   multer   ^1   (multipart file uploads)
//   cors     ^2   (optional – handy during development)

'use strict';

const express  = require('express');
const multer   = require('multer');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');

// ── Configuration ────────────────────────────────────────────────────────────

const PORT         = process.env.PORT || 3000;
const APP_ROOT     = __dirname;                          // folder containing server.js
const SCHEMAS_DIR  = path.join(APP_ROOT, 'schemas');     // schemas/ sub-folder
const CONFIG_FILE  = path.join(SCHEMAS_DIR, 'jsonbuilder.config');

// ── Ensure schemas/ folder exists on first run ───────────────────────────────

if (!fs.existsSync(SCHEMAS_DIR)) {
  fs.mkdirSync(SCHEMAS_DIR, { recursive: true });
  console.log('📁 Created schemas/ directory');
}

// ── Express setup ─────────────────────────────────────────────────────────────

const app = express();

app.use(cors());                          // allow cross-origin in dev
app.use(express.json());                  // parse JSON bodies
app.use(express.static(APP_ROOT));        // serve index.html, JS, CSS, etc.

// Multer – store uploaded files in memory so we can validate before writing
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },   // 10 MB per file
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files are accepted'));
    }
  }
});

// ── Helper: read registry (returns [] when file does not exist) ───────────────

function readRegistry() {
  if (!fs.existsSync(CONFIG_FILE)) return [];
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('⚠️  Could not parse jsonbuilder.config:', err.message);
    return [];
  }
}

// ── Helper: write registry ────────────────────────────────────────────────────

function writeRegistry(entries) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

// ══════════════════════════════════════════════════════════════════════════════
// API ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/registry  ────────────────────────────────────────────────────────
// Returns the full registry array.  If jsonbuilder.config does not exist yet
// the server creates an empty one and returns [].
app.get('/api/registry', (_req, res) => {
  const entries = readRegistry();

  // Auto-create the file if it was missing
  if (!fs.existsSync(CONFIG_FILE)) {
    writeRegistry([]);
  }

  res.json({ ok: true, entries });
});

// ── POST /api/registry/save  ──────────────────────────────────────────────────
// Accepts:
//   multipart fields:
//     schemaFile   (required)  – the JSON schema file
//     optionsFile  (optional)  – the options JSON file
//   multipart text fields:
//     description  (optional)  – human-readable label
//
// Behaviour:
//   1. Validates both files are valid JSON
//   2. Writes them into schemas/
//   3. Upserts the entry in jsonbuilder.config (match by schema filename)
//   4. Returns the saved entry
app.post(
  '/api/registry/save',
  upload.fields([
    { name: 'schemaFile',  maxCount: 1 },
    { name: 'optionsFile', maxCount: 1 }
  ]),
  (req, res) => {
    try {
      // ── Validate schema file ────────────────────────────────────────────────
      const schemaFiles = req.files['schemaFile'];
      if (!schemaFiles || schemaFiles.length === 0) {
        return res.status(400).json({ ok: false, error: 'schemaFile is required' });
      }

      const schemaFile = schemaFiles[0];

      // Parse to validate JSON
      try {
        JSON.parse(schemaFile.buffer.toString('utf8'));
      } catch {
        return res.status(400).json({ ok: false, error: 'schemaFile is not valid JSON' });
      }

      // ── Validate options file (if provided) ─────────────────────────────────
      const optionsFiles   = req.files['optionsFile'] || [];
      const optionsFile    = optionsFiles[0] || null;
      let   optionsFilename = '';

      if (optionsFile) {
        try {
          JSON.parse(optionsFile.buffer.toString('utf8'));
        } catch {
          return res.status(400).json({ ok: false, error: 'optionsFile is not valid JSON' });
        }
        optionsFilename = optionsFile.originalname;
      }

      // ── Write files to schemas/ ──────────────────────────────────────────────
      fs.writeFileSync(
        path.join(SCHEMAS_DIR, schemaFile.originalname),
        schemaFile.buffer
      );

      if (optionsFile) {
        fs.writeFileSync(
          path.join(SCHEMAS_DIR, optionsFile.originalname),
          optionsFile.buffer
        );
      }

      // ── Upsert registry entry ────────────────────────────────────────────────
      const description = (req.body.description || '').trim();
      const entries     = readRegistry();

      const entry = {
        schema:      schemaFile.originalname,
        options:     optionsFilename,
        description: description || schemaFile.originalname.replace(/\.json$/i, '')
      };

      const idx = entries.findIndex(e => e.schema === entry.schema);
      if (idx >= 0) {
        entries[idx] = entry;
        console.log(`✏️  Updated registry entry: ${entry.schema}`);
      } else {
        entries.push(entry);
        console.log(`➕ Added registry entry: ${entry.schema}`);
      }

      writeRegistry(entries);

      res.json({ ok: true, entry, entries });

    } catch (err) {
      console.error('❌ /api/registry/save error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  }
);

// ── DELETE /api/registry/remove  ──────────────────────────────────────────────
// Body: { "schema": "filename.json" }
// Removes the entry from jsonbuilder.config.
// Does NOT delete the actual files (they may still be useful).
app.delete('/api/registry/remove', (req, res) => {
  const { schema } = req.body;

  if (!schema) {
    return res.status(400).json({ ok: false, error: '"schema" field is required' });
  }

  const entries = readRegistry();
  const updated = entries.filter(e => e.schema !== schema);

  if (updated.length === entries.length) {
    return res.status(404).json({ ok: false, error: `Entry "${schema}" not found` });
  }

  writeRegistry(updated);
  console.log(`🗑️  Removed registry entry: ${schema}`);
  res.json({ ok: true, entries: updated });
});

// ── GET /schemas/:filename  ────────────────────────────────────────────────────
// Serves individual schema / options files from schemas/.
// (express.static already handles this, but an explicit route gives
//  better 404 messages.)
app.get('/schemas/:filename', (req, res) => {
  const filePath = path.join(SCHEMAS_DIR, path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ ok: false, error: `File not found: ${req.params.filename}` });
  }
  res.sendFile(filePath);
});

// ── Fallback: serve index.html for any unknown route ─────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(APP_ROOT, 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('┌──────────────────────────────────────────┐');
  console.log('│   JSON Data Builder                      │');
  console.log(`│   http://localhost:${PORT}                   │`);
  console.log('│                                          │');
  console.log(`│   schemas/  →  ${SCHEMAS_DIR.slice(-28).padEnd(28)} │`);
  console.log('└──────────────────────────────────────────┘');
  console.log('');
});
