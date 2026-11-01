"use strict";
// One JSON file per church. Simple, inspectable, and easy to swap for Postgres later.
const fs = require("fs"), path = require("path"), crypto = require("crypto");

const DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
fs.mkdirSync(DIR, { recursive: true });
const cache = new Map();

const FEATURES = { guide: true, week: true, visit: true, groups: true, prayer: true, care: true, moving: true, live: true, today: true };
function defaults() {
  return { groups: [], visitors: [], care: [], daily: {}, alertWebhook: "", pulpit: { services: [] }, site: { on: true, about: "", address: "", times: "", phone: "", email: "" }, briefs: [], prayers: [], devotionals: [], series: [], staff: [], members: [], features: { ...FEATURES } };
}
const STAT_KEYS = ["questions", "unanswered", "prayers", "crisis", "moves", "visits", "care", "groups"];
function backfill(c) { // older church files gain new fields without losing anything
  const d = defaults();
  for (const k of Object.keys(d)) if (!(k in c)) c[k] = d[k];
  c.features = { ...FEATURES, ...(c.features || {}) };
  c.stats = c.stats || {};
  for (const k of STAT_KEYS) if (typeof c.stats[k] !== "number") c.stats[k] = 0;
  return c;
}
const validId = (id) => typeof id === "string" && /^[a-z0-9-]{3,48}$/.test(id);
const file = (id) => path.join(DIR, id + ".json");

function get(id) {
  if (!validId(id)) return null;
  if (cache.has(id)) return cache.get(id);
  try { const c = backfill(JSON.parse(fs.readFileSync(file(id), "utf8"))); cache.set(id, c); return c; }
  catch (e) { return null; }
}
function put(c) {
  c.savedAt = Date.now();
  cache.set(c.id, c);
  const f = file(c.id), t = f + "." + process.pid + ".tmp";
  fs.writeFileSync(t, JSON.stringify(c, null, 2));
  fs.renameSync(t, f);
  markDirty(c.id);
}

/* --- optional off-site copy (see lib/remote.js) --- */
let remote = null; const dirty = new Set(); let timer = null; const FLUSH_MS = Number(process.env.REMOTE_FLUSH_MS) || 15000;
function markDirty(id) { if (!remote) return; dirty.add(id); if (!timer) { timer = setTimeout(() => { timer = null; flush().catch(() => {}); }, FLUSH_MS); if (timer.unref) timer.unref(); } }
async function flush() {
  if (!remote) return;
  for (const id of [...dirty]) {
    const c = cache.get(id); if (!c) { dirty.delete(id); continue; }
    if (await remote.save(id, JSON.stringify(c))) dirty.delete(id);
  }
  if (dirty.size && !timer) { timer = setTimeout(() => { timer = null; flush().catch(() => {}); }, 60000); if (timer.unref) timer.unref(); } // retry later, keep serving from memory
}
// Called once before the server starts listening. Pulls every church back from the off-site copy; the newer copy wins.
async function restore(log) {
  log = log || (() => {});
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url && !token) return { configured: false };
  if (!url || !token) { log("Storage: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must both be set. Using local files only."); return { configured: false }; }
  if (!process.env.SECRET) { log("Storage: set SECRET to turn on the off-site copy. It encrypts your data and must stay the same between restarts. Using local files only."); return { configured: false }; }
  remote = require("./remote").create({ url, token, secret: process.env.SECRET });
  let items;
  try { items = await remote.loadAll(); } catch (e) { log("Storage: the off-site database could not be read (" + e.message + "). Churches created now are kept on this server only until it works. Check the two UPSTASH values."); return { configured: true, ok: false, error: e.message }; }
  let n = 0, bad = [];
  for (const it of items) {
    if (it.error) { bad.push(it.id); continue; }
    try {
      const c = JSON.parse(it.json); if (!validId(c.id)) continue;
      let mine = null; try { mine = JSON.parse(fs.readFileSync(file(c.id), "utf8")); } catch (e) {}
      if (mine && (mine.savedAt || 0) >= (c.savedAt || 0)) { markDirty(c.id); continue; } // local copy is newer (a disk plan): keep it and push it up
      const f = file(c.id), t = f + "." + process.pid + ".tmp"; fs.writeFileSync(t, JSON.stringify(c, null, 2)); fs.renameSync(t, f); cache.delete(c.id); n++;
    } catch (e) { bad.push(it.id); }
  }
  if (bad.length) log("Storage: " + bad.length + " saved church(es) could not be read. If you changed SECRET, set the old one back: " + bad.join(", "));
  log("Storage: off-site copy on. Restored " + n + " church(es).");
  return { configured: true, ok: true, restored: n, unreadable: bad };
}
function remoteStatus() { return remote ? { configured: true, ...remote.status(), pending: dirty.size } : { configured: false }; }
function forgetLocalForTests() { cache.clear(); for (const f of fs.readdirSync(DIR)) if (f.endsWith(".json")) fs.unlinkSync(path.join(DIR, f)); }
function exists(id) { return !!get(id); }

/* --- secrets and passcodes --- */
function secret() {
  if (process.env.SECRET) return process.env.SECRET;
  const f = path.join(DIR, ".secret");
  try { return fs.readFileSync(f, "utf8"); }
  catch (e) { const s = crypto.randomBytes(32).toString("hex"); fs.writeFileSync(f, s, { mode: 0o600 }); return s; }
}
const SECRET = secret();
function hashPass(pass, salt) { return crypto.scryptSync(pass, salt, 32).toString("hex"); }
function checkPass(c, pass) {
  const a = Buffer.from(hashPass(String(pass), c.salt), "hex"), b = Buffer.from(c.passHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function sign(payload) {
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return p + "." + crypto.createHmac("sha256", SECRET).update(p).digest("base64url");
}
function verify(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [p, s] = token.split(".");
  const good = crypto.createHmac("sha256", SECRET).update(p).digest("base64url");
  const a = Buffer.from(s), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const d = JSON.parse(Buffer.from(p, "base64url").toString()); return d.exp > Date.now() ? d : null; }
  catch (e) { return null; }
}

module.exports = { restore, flush, remoteStatus, forgetLocalForTests, defaults, get, put, exists, validId, hashPass, checkPass, sign, verify, DIR };
