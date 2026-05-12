// api/schemas.js — Vercel serverless function
// Handles all schema CRUD operations via Supabase (Postgres)
// Schemas are stored per-user in the 'schemas' table

import { createClient } from '@supabase/supabase-js';


import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env.local') });

// ── Supabase client ───────────────────────────────────────────────────────────
// Trim both values so stray whitespace / newlines in .env.local never
// produce a malformed URL (the leading cause of "Invalid path" errors).
const SUPABASE_URL = process.env.SUPABASE_URL?.trim().replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY?.trim();

// ── Vercel config — enable body parsing for JSON payloads ─────────────────────
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

// ── Helper: format a Supabase error for logging ───────────────────────────────
function supabaseErrorMessage(error) {
  // error objects from postgrest-js carry code, details, hint in addition to message
  const parts = [error.message];
  if (error.code)    parts.push(`code=${error.code}`);
  if (error.details) parts.push(`details=${error.details}`);
  if (error.hint)    parts.push(`hint=${error.hint}`);
  return parts.join(' | ');
}

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

  // ── Validate env vars ─────────────────────────────────────────────────────
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ SUPABASE_URL or SUPABASE_KEY missing');
    return res.status(500).json({ error: 'Server misconfigured: Supabase credentials missing' });
  }

  // Basic URL sanity-check — catches missing protocol, trailing garbage, etc.
  try {
    new URL(SUPABASE_URL);
  } catch {
    console.error('❌ SUPABASE_URL is not a valid URL:', SUPABASE_URL);
    return res.status(500).json({ error: 'Server misconfigured: SUPABASE_URL is not a valid URL' });
  }

  // Every request must identify the user
  const username = req.headers['x-username']?.trim().toLowerCase();
  if (!username) {
    return res.status(400).json({ error: 'x-username header is required' });
  }

  console.log(`🔑 Request — user: "${username}", method: ${req.method}, file: ${req.query.file || '(none)'}`);

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

      if (error) {
        console.error('❌ List query failed:', supabaseErrorMessage(error));
        throw new Error(error.message);
      }

      const entries = (data || []).map(row => ({
        schema:      row.schema_name,
        options:     row.options_name,
        description: row.description,
        savedAt:     row.saved_at
      }));

      console.log(`✅ Listed ${entries.length} schema(s) for "${username}"`);
      return res.status(200).json({ entries });
    }

    // ── GET /api/schemas?file=name.json ───────────────────────────────────────
    // Returns the JSON content of a single schema or options file.
    //
    // BUG FIX: The original code used:
    //   .or(`schema_name.eq.${filename},options_name.eq.${filename}`)
    // PostgREST parses the .or() string as  column.operator.value  where the
    // entire remainder after "eq." is the value.  However filenames that contain
    // dots (e.g. "my-schema.json") can confuse some versions of the postgrest-js
    // builder, producing a malformed URL path and the error
    // "Invalid path specified in request URL".
    //
    // FIX: Run two plain .eq() queries in sequence instead of .or().
    // This is unambiguous, works on every postgrest-js version, and is equally
    // fast because both paths are indexed on (username, schema_name / options_name).
    if (method === 'GET' && filename) {

      // 1. Try matching as the schema file
      const { data: bySchema, error: e1 } = await supabase
        .from('schemas')
        .select('schema_name, schema_content, options_name, options_content')
        .eq('username', username)
        .eq('schema_name', filename)
        .maybeSingle();            // maybeSingle() returns null instead of
                                   // throwing when no row is found (Supabase v2)

      if (e1) {
        console.error('❌ File query (schema_name) failed:', supabaseErrorMessage(e1));
        throw new Error(e1.message);
      }

      if (bySchema) {
        console.log(`✅ Returning schema content for "${filename}"`);
        return res.status(200).json(JSON.parse(bySchema.schema_content));
      }

      // 2. Try matching as the options file
      const { data: byOptions, error: e2 } = await supabase
        .from('schemas')
        .select('schema_name, schema_content, options_name, options_content')
        .eq('username', username)
        .eq('options_name', filename)
        .maybeSingle();

      if (e2) {
        console.error('❌ File query (options_name) failed:', supabaseErrorMessage(e2));
        throw new Error(e2.message);
      }

      if (byOptions) {
        console.log(`✅ Returning options content for "${filename}"`);
        return res.status(200).json(JSON.parse(byOptions.options_content));
      }

      // Neither matched
      console.warn(`⚠️ File not found: "${filename}" for user "${username}"`);
      return res.status(404).json({ error: `File not found: ${filename}` });
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

      // Upsert — insert or update if same username + schema_name.
      // NOTE: no spaces around the comma in onConflict — spaces caused the
      // upsert to silently fall back to INSERT and throw on a duplicate key.
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
          onConflict: 'username,schema_name'
        });

      if (error) {
        console.error('❌ Upsert failed:', supabaseErrorMessage(error));
        throw new Error(error.message);
      }

      console.log(`✅ Saved schema "${schemaName}" for "${username}"`);
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

      if (error) {
        console.error('❌ Delete failed:', supabaseErrorMessage(error));
        throw new Error(error.message);
      }

      console.log(`🗑️ Deleted schema "${filename}" for "${username}"`);
      return res.status(200).json({ status: 'deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('Schema API error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ── End of file ───────────────────────────────────────────────────────────────
