"use strict";
// Reads a .env file (KEY=value per line) into process.env, without any dependency.
// Real environment variables win over the file, so `$env:GROQ_API_KEY=...` in a terminal still overrides it.
// Returns the NAMES it set, never the values, so they are safe to print.
const fs = require("fs"), path = require("path");
function parse(text) {
  const out = {};
  for (const raw of String(text).replace(/^﻿/, "").split(/\r?\n/)) {       // Notepad saves a BOM; Windows files use \r\n
    const line = raw.trim(); if (!line || line[0] === "#") continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/); if (!m) continue;
    let v = m[2].trim();
    if (v.length > 1 && (v[0] === '"' || v[0] === "'") && v.endsWith(v[0])) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");                                           // trailing comment on an unquoted value
    out[m[1]] = v;
  }
  return out;
}
function loadEnv(file, env = process.env) {
  file = file || path.join(__dirname, "..", ".env");
  let text; try { text = fs.readFileSync(file, "utf8"); } catch (e) { return []; }
  const set = [];
  for (const [k, v] of Object.entries(parse(text))) if (v !== "" && (env[k] === undefined || env[k] === "")) { env[k] = v; set.push(k); }
  return set;
}
module.exports = { loadEnv, parse };
