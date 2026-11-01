"use strict";
// .env loading. Run: node test/env.js
const fs = require("fs"), os = require("os"), path = require("path"), { loadEnv, parse } = require("../lib/env");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log("  ok   " + m); } else { fail++; console.log("  FAIL " + m); } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "env-")), f = path.join(dir, ".env");
fs.writeFileSync(f, "﻿# comment\r\nGROQ_API_KEY=gsk_abc123\r\n  GEMINI_API_KEY = \"quoted value\"  \r\nexport MISTRAL_API_KEY='single'\r\nEMPTY=\r\nCOMMENTED=value   # trailing note\r\nnot a line\r\nSECRET=a#b\r\n");
const p = parse(fs.readFileSync(f, "utf8"));
ok(p.GROQ_API_KEY === "gsk_abc123", "a Windows file with a byte-order mark and CRLF line ends is read");
ok(p.GEMINI_API_KEY === "quoted value" && p.MISTRAL_API_KEY === "single", "quotes and spaces are removed; 'export' is allowed");
ok(p.COMMENTED === "value" && p.SECRET === "a#b", "a trailing comment is dropped but a # inside a value is kept");
ok(!("EMPTY" in {...p, EMPTY: undefined}) || p.EMPTY === "", "an empty value is just empty");
const env = { GEMINI_API_KEY: "from-terminal" }; const names = loadEnv(f, env);
ok(env.GROQ_API_KEY === "gsk_abc123" && env.GEMINI_API_KEY === "from-terminal", "the file fills gaps but never overrides a variable set in the terminal");
ok(names.includes("GROQ_API_KEY") && !names.includes("GEMINI_API_KEY") && !names.includes("EMPTY") && !JSON.stringify(names).includes("gsk_abc123"), "only the names of what it loaded are returned, never the values, and empty values are skipped");
ok(Array.isArray(loadEnv(path.join(dir, "missing.env"), {})) && loadEnv(path.join(dir, "missing.env"), {}).length === 0, "a missing file is fine");
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
