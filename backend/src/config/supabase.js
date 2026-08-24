// @ts-nocheck
const { createClient } = require("@supabase/supabase-js");
const ws = require("ws");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — papers upload/download will fail until these are set in .env",
  );
} else {
  supabase = createClient(supabaseUrl, supabaseServiceKey, {
    // We only use Storage here, never Realtime — this just stops
    // the client crashing on Node 20 while it initializes a
    // websocket transport it will never actually use.
    realtime: { transport: ws },
  });
}

module.exports = supabase;