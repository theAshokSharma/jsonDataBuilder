// api/schemas.js — Vercel serverless function
// Handles all schema CRUD operations via Supabase (Postgres)
// Schemas are stored per-user in the 'schemas' table

import { createClient } from '@supabase/supabase-js';

// ── Load .env.local for local dev ─────────────────────────────────────────────
// In production Vercel injects env vars automatically.
// For local dev, `vercel dev` loads .env.local automatically too —
// so dotenv is not needed here at all.
// If you run the file directly with `node api/schemas.js`, add a
// .env file at project root and uncomment the line below:
// import 'dotenv/config';

// ── Supabase client ───────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// ── Vercel config — enable body parsing for JSON payloads ─────────────────────
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

// ── Request router ────────────────────────────────────────────────────────────

export default async function handler(req, res) {

  // ── CORS headers ──────────────────────────────────────────────────────────── 
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-username');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Validate env vars
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ SUPABASE_URL or SUPABASE_KEY missing');
    return res.status(500).json({ error: 'Server misconfigured: Supabase credentials missing' });
  }

  // Every request must identify the user
  const username = req.headers['x-username']?.trim().toLowerCase();
  if (!username) {
    return res.status(400).json({ error: 'x-username header is required' });
  }

  console.log(`🔑 Request — user: "${username}", method: ${req.method}`);

  // Create Supabase client per request
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { method } = req;
  const filename   = req.query.file || null;

  try {

    // ── GET /api/schemas ──────────────────────────────────────────────────────
    // Returns the user's registry entries list
    if (method === 'GET' && !filename) {
      const { data, error } = await supabase
        .from('schemas')
        .select('schema_name, options_name, description, saved_at')
        .eq('username', username)
        .order('saved_at', { ascending: false });

      if (error) throw new Error(error.message);

      // Map to expected format
      const entries = (data || []).map(row => ({
        schema:      row.schema_name,
        options:     row.options_name,
        description: row.description,
        savedAt:     row.saved_at
      }));

      return res.status(200).json({ entries });
    }

    // ── GET /api/schemas?file=name.json ───────────────────────────────────────
    // Returns content of a single schema or options file
    if (method === 'GET' && filename) {
      // Check schema_content first
      const { data: schemaRow } = await supabase
        .from('schemas')
        .select('schema_name, schema_content, options_name, options_content')
        .eq('username', username)
        .or(`schema_name.eq.${filename},options_name.eq.${filename}`)
        .single();

      if (!schemaRow) {
        return res.status(404).json({ error: `File not found: ${filename}` });
      }

      // Return the correct content based on which file was requested
      const content = schemaRow.schema_name === filename
        ? schemaRow.schema_content
        : schemaRow.options_content;

      return res.status(200).json(JSON.parse(content));
    }

    // ── POST /api/schemas ─────────────────────────────────────────────────────
    // Saves schema + optional options file, updates registry
    if (method === 'POST') {
      const { schemaName, schemaContent,
              optionsName, optionsContent,
              description } = req.body || {};

      if (!schemaName || !schemaContent) {
        return res.status(400).json({
          error: 'schemaName and schemaContent are required',
          receivedKeys: Object.keys(req.body || {})
        });
      }

      // Upsert — insert or update if same username + schema_name
      const { error } = await supabase
        .from('schemas')
        .upsert({
          username:        username,
          schema_name:     schemaName,
          options_name:    optionsName    || null,
          description:     description   || schemaName,
          schema_content:  schemaContent,
          options_content: optionsContent || null,
          saved_at:        new Date().toISOString()
        }, {
          onConflict: 'username, schema_name'
        });

      if (error) throw new Error(error.message);

      return res.status(200).json({ status: 'saved' });
    }

    // ── DELETE /api/schemas?file=name.json ────────────────────────────────────
    // Removes entry from registry
    if (method === 'DELETE' && filename) {
      const { error } = await supabase
        .from('schemas')
        .delete()
        .eq('username', username)
        .eq('schema_name', filename);

      if (error) throw new Error(error.message);

      return res.status(200).json({ status: 'deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('Schema API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
