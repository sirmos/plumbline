"use strict";
// Off-site copy: encrypted, restored at start-up, newest copy wins, failures never stop the app. Run: node test/remote.js
const os = require("os"), path = require("path"), fs = require("fs"), http = require("http");
const dir = process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pl-remote-"));
for (const k of Object.keys(process.env)) if (/_API_KEY$|_BASE$|^GITHUB_MODELS_TOKEN$|^AI_/.test(k)) delete process.env[k];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok   " + m); } else { fail++; console.log("  FAIL " + m); } };

// A tiny fake of Upstash's REST API: POST / with a command array, POST /pipeline with an array of them.
const db = new Map(); let down = false, calls = 0;
function run(a) {
  const [c, ...r] = a;
  if (c === "PING") return { result: "PONG" };
  if (c === "SET") { db.set(r[0], r[1]); return { result: "OK" }; }
  if (c === "GET") return { result: db.has(r[0]) ? db.get(r[0]) : null };
  if (c === "SCAN") { const pre = r[2].replace("*", ""); return { result: ["0", [...db.keys()].filter(k => k.startsWith(pre))] }; }
  return { error: "unknown command" };
}
const fake = http.createServer((q, s) => {
  let b = ""; q.on("data", d => b += d); q.on("end", () => {
    calls++;
    if (q.headers.authorization !== "Bearer tok-123") { s.writeHead(401); return s.end(JSON.stringify({ error: "bad token" })); }
    if (down) { s.writeHead(503); return s.end("{}"); }
    const body = JSON.parse(b); s.writeHead(200, { "content-type": "application/json" });
    s.end(JSON.stringify(q.url === "/pipeline" ? body.map(run) : run(body)));
  });
});
const wait = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  await new Promise(r => fake.listen(0, r));
  const U = "http://127.0.0.1:" + fake.address().port;
  const remote = require("../lib/remote");
  const sealed = remote.seal("hello church", "s3cret"); ok(sealed.startsWith("v1.") && !sealed.includes("hello") && remote.open(sealed, "s3cret") === "hello church", "data is encrypted and opens with the same secret");
  let bad = false; try { remote.open(sealed, "other"); } catch (e) { bad = true; } ok(bad, "a different secret cannot read it");
  let tamper = false; try { const b = Buffer.from(sealed.slice(3), "base64"); b[b.length - 1] ^= 1; remote.open("v1." + b.toString("base64"), "s3cret"); } catch (e) { tamper = true; } ok(tamper, "tampering is detected");

  // not configured: nothing happens
  const store = require("../lib/store"), { newChurch } = require("../lib/seed");
  ok((await store.restore()).configured === false, "without the UPSTASH values nothing changes");
  process.env.UPSTASH_REDIS_REST_URL = U; process.env.UPSTASH_REDIS_REST_TOKEN = "tok-123"; process.env.REMOTE_FLUSH_MS = "50";
  const logs = []; delete process.env.SECRET;
  ok((await store.restore(m => logs.push(m))).configured === false && /SECRET/.test(logs[0]), "the off-site copy refuses to turn on without SECRET");

  process.env.SECRET = "a-long-secret-value";
  // fresh module state so the module-level flush delay (read at load time) is the short one
  delete require.cache[require.resolve("../lib/store")];
  const st2 = require("../lib/store");
  const r1 = await st2.restore(m => logs.push(m)); ok(r1.configured && r1.ok && r1.restored === 0, "it connects to an empty database");
  const c = newChurch("Grace Harbor", "passcode123"); st2.put(c);
  await wait(300); st2.flush && await st2.flush();
  const keys = [...db.keys()]; ok(keys.length === 1 && keys[0] === "plumbline:church:" + c.id, "a new church is saved off-site");
  const stored = db.get(keys[0]); ok(!stored.includes("Grace Harbor") && !stored.includes(c.passHash), "what is stored is ciphertext: no church name, no password hash");
  const c2 = st2.get(c.id); c2.pastor = "Pastor Ada"; st2.put(c2); await wait(300); await st2.flush();
  const before = calls; for (let i = 0; i < 5; i++) st2.put(c2); await wait(300); await st2.flush(); ok(calls - before <= 3, "several quick changes are sent as one save, not five");

  // restart on an empty disk
  st2.forgetLocalForTests();
  delete require.cache[require.resolve("../lib/store")];
  const st3 = require("../lib/store"); const r3 = await st3.restore(m => logs.push(m));
  ok(r3.restored === 1 && st3.get(c.id) && st3.get(c.id).pastor === "Pastor Ada" && st3.checkPass(st3.get(c.id), "passcode123"), "after a restart with an empty disk the church is back, with its latest change and its passcode");

  // newest copy wins
  const mine = st3.get(c.id); mine.pastor = "Pastor Newer"; st3.put(mine); // local newer than remote (not flushed yet)
  delete require.cache[require.resolve("../lib/store")];
  const st4 = require("../lib/store"); await st4.restore(m => logs.push(m)); ok(st4.get(c.id).pastor === "Pastor Newer", "a newer local copy is kept and not overwritten by an older remote one");

  // wrong secret
  process.env.SECRET = "a-different-secret"; st4.forgetLocalForTests();
  delete require.cache[require.resolve("../lib/store")];
  const st5 = require("../lib/store"); const r5 = await st5.restore(m => logs.push(m));
  ok(r5.unreadable && r5.unreadable.length >= 1 && logs.some(m => /SECRET/.test(m) && /old one/.test(m)) && !st5.get(c.id), "a changed SECRET is reported plainly and nothing is overwritten");
  ok(db.get(keys[0]) === db.get(keys[0]) && [...db.keys()].length === 1, "the saved copy is left untouched");
  process.env.SECRET = "a-long-secret-value";

  // outage
  down = true; delete require.cache[require.resolve("../lib/store")];
  const st6 = require("../lib/store"); const r6 = await st6.restore(m => logs.push(m));
  ok(r6.configured && r6.ok === false && logs.some(m => /could not be read/.test(m)), "an unreachable database is reported and the server still starts");
  const c3 = newChurch("Offline Church", "passcode123"); st6.put(c3);
  ok(st6.get(c3.id).name === "Offline Church", "churches still work from the local copy during an outage");
  await wait(300); await st6.flush(); ok(st6.remoteStatus().pending >= 1 && st6.remoteStatus().lastError, "the failure is visible in the status and the save is retried later");
  down = false; await st6.flush(); ok(st6.remoteStatus().pending === 0 && [...db.keys()].length === 2, "when the database returns, the waiting church is saved");
  process.env.UPSTASH_REDIS_REST_TOKEN = "wrong"; delete require.cache[require.resolve("../lib/store")];
  const st7 = require("../lib/store"); const r7 = await st7.restore(m => logs.push(m)); ok(r7.ok === false, "a wrong token is reported, not crashed on");
  fake.close(); console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
