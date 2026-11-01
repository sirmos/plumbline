"use strict";
// The demo church: fictional, complete, and safe to explore. Run: node test/demo.js
const os = require("os"), path = require("path"), fs = require("fs");
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pl-demo-"));
for (const k of Object.keys(process.env)) if (/_API_KEY$|_BASE$|^GITHUB_MODELS_TOKEN$|^AI_/.test(k)) delete process.env[k];
const store = require("../lib/store"), { newChurch } = require("../lib/seed"), demo = require("../lib/demo"), server = require("../server");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok   " + m); } else { fail++; console.log("  FAIL " + m); } };
async function main() {
  ok(demo.ensure(store, newChurch, "") === false && !store.exists(demo.ID), "nothing is created without a demo passcode");
  ok(demo.ensure(store, newChurch, "demo-pass-1") === true && store.exists(demo.ID), "the demo church is created when a passcode is set");
  ok(demo.ensure(store, newChurch, "other-pass-2") === false, "an existing demo church is never overwritten");
  await new Promise(x => server.listen(0, x));
  const B = "http://127.0.0.1:" + server.address().port;
  const j = async (p, o = {}, tok) => { const x = await fetch(B + p, { ...o, headers: { "content-type": "application/json", ...(tok ? { authorization: "Bearer " + tok } : {}) } }); return { s: x.status, j: await x.json().catch(() => ({})) }; };
  const login = b => j("/api/admin/login", { method: "POST", body: JSON.stringify(b) });
  const p = await login({ id: demo.ID, pass: "demo-pass-1" }), t = await login({ id: demo.ID, user: "Ruth Demo", pass: "demo-pass-1" });
  ok(p.s === 200 && p.j.role === "pastor" && t.s === 200 && t.j.role === "team", "judges can sign in as the pastor or as a team member");
  ok((await login({ id: demo.ID, pass: "wrong-pass" })).s === 401, "a wrong passcode still fails");
  const S = (await j("/api/admin/state", {}, p.j.token)).j.church;
  ok(S.name.includes("(demo)") && S.groups.length === 3 && S.prayers.length === 2 && S.visitors.length === 2 && S.care.length === 1 && S.queue.length === 1 && Object.keys(S.daily).length === 14, "it holds sample prayers, visitors, care, a queued draft and two weeks of activity");
  ok(JSON.stringify(S).includes("fictional") || S.site.about.includes("fictional"), "it says plainly that it is fictional");
  const cfg = (await j("/api/public/" + demo.ID + "/config")).j;
  ok(cfg.today.length >= 1 && cfg.studies.length === 1 && cfg.journey, "the widget has a devotional, a study and a reading plan to show");
  ok((await j("/api/public/" + demo.ID + "/site")).j.times.includes("Sundays"), "the church page is filled in");
  ok(!JSON.stringify(S).includes("demo-pass-1") && S.staff.every(u => !u.passHash), "no passcode or hash is exposed");
  const b = await j("/api/admin/brief", {}, p.j.token); ok(b.s === 200 && b.j.facts, "the Monday Brief works on the demo data");
  server.close(); console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
