"use strict";
// One JSON file per church. Simple, inspectable, and easy to swap for Postgres later.
const fs = require("fs"), path = require("path"), crypto = require("crypto");

const DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
fs.mkdirSync(DIR, { recursive: true });
const cache = new Map();

const FEATURES = { guide: true, week: true, visit: true, groups: true, prayer: true, care: true, moving: true, live: true };
function defaults() {
  return { groups: [], visitors: [], care: [], daily: {}, alertWebhook: "", pulpit: { services: [] }, features: { ...FEATURES } };
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
  cache.set(c.id, c);
  const f = file(c.id), t = f + "." + process.pid + ".tmp";
  fs.writeFileSync(t, JSON.stringify(c, null, 2));
  fs.renameSync(t, f);
}
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

module.exports = { defaults, get, put, exists, validId, hashPass, checkPass, sign, verify, DIR };
