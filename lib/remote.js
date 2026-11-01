"use strict";
// Optional off-site copy of every church, so a host without a disk (a free Render instance, for example) does not lose
// churches when it restarts. Talks to an Upstash Redis database over its REST API (no dependency, just fetch).
// Everything written is encrypted first with a key made from SECRET, so the database only ever holds ciphertext.
// Local files stay the working copy; the remote copy is written a few seconds after each change and read back at start-up.
const crypto = require("crypto");

const PREFIX = "plumbline:church:";
const keyCache = new Map();
function key(secret) {
  if (!keyCache.has(secret)) keyCache.set(secret, crypto.scryptSync(String(secret), "plumbline-remote-v1", 32));
  return keyCache.get(secret);
}
function seal(text, secret) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key(secret), iv);
  const enc = Buffer.concat([c.update(String(text), "utf8"), c.final()]);
  return "v1." + Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}
function open(blob, secret) {
  if (typeof blob !== "string" || !blob.startsWith("v1.")) throw new Error("unknown format");
  const b = Buffer.from(blob.slice(3), "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key(secret), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}

function create({ url, token, secret, fetch: f }) {
  const doFetch = f || fetch, base = String(url).replace(/\/+$/, "");
  const st = { lastOk: null, lastError: "", saves: 0, pending: 0 };
  async function call(path, body) {
    const r = await doFetch(base + path, { method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j && j.error) || "storage service returned " + r.status);
    return j;
  }
  const first = j => { if (j && j.error) throw new Error(j.error); return j.result; };
  async function cmd(args) { return first(await call("", args)); }
  async function pipe(cmds) { const j = await call("/pipeline", cmds); if (!Array.isArray(j)) throw new Error("unexpected reply"); return j.map(first); }
  const mark = e => { if (e) st.lastError = String(e.message || e).slice(0, 200); else { st.lastError = ""; st.lastOk = Date.now(); } };
  return {
    status: () => ({ ...st }),
    async ping() { try { const r = await cmd(["PING"]); mark(); return r === "PONG"; } catch (e) { mark(e); return false; } },
    async save(id, json) { try { await cmd(["SET", PREFIX + id, seal(json, secret)]); st.saves++; mark(); return true; } catch (e) { mark(e); return false; } },
    async loadAll() { // returns [{id, json}]; throws if the service cannot be reached, so start-up can say so
      const keys = []; let cursor = "0";
      do { const r = await cmd(["SCAN", cursor, "MATCH", PREFIX + "*", "COUNT", "100"]); cursor = String(r[0]); keys.push(...r[1]); } while (cursor !== "0");
      const out = [];
      for (let i = 0; i < keys.length; i += 20) {
        const part = keys.slice(i, i + 20), vals = await pipe(part.map(k => ["GET", k]));
        part.forEach((k, n) => { try { if (vals[n]) out.push({ id: k.slice(PREFIX.length), json: open(vals[n], secret) }); } catch (e) { out.push({ id: k.slice(PREFIX.length), error: "could not be decrypted (is SECRET the same as before?)" }); } });
      }
      mark(); return out;
    }
  };
}
module.exports = { create, seal, open, PREFIX };
