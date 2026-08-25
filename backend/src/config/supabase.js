// @ts-nocheck
const { createClient } = require("@supabase/supabase-js");
const ws = require("ws");
const config = require("./env");

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
  // We only use Auth and Storage here, never Realtime. This stops the
  // client initializing a websocket transport it will not use.
  realtime: { transport: ws },
});

module.exports = supabase;
