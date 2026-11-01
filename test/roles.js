"use strict";
// Roles: pastor, administrator, prayer and care team, members, visitors. Run: node test/roles.js
const os = require("os"), path = require("path"), fs = require("fs");
const dir = process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pl-roles-"));
for (const k of Object.keys(process.env)) if (/_API_KEY$|_BASE$|^GITHUB_MODELS_TOKEN$|^AI_/.test(k)) delete process.env[k];
const server = require("../server");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok   " + m); } else { fail++; console.log("  FAIL " + m); } };
async function main() {
  await new Promise(x => server.listen(0, x));
  const B = "http://127.0.0.1:" + server.address().port;
  const j = async (p, o = {}, tok) => { const x = await fetch(B + p, { ...o, headers: { "content-type": "application/json", ...(tok ? { authorization: "Bearer " + tok } : {}) } }); return { s: x.status, j: await x.json().catch(() => ({})) }; };
  const post = (p, b, tok) => j(p, { method: "POST", body: JSON.stringify(b || {}) }, tok), del = (p, tok) => j(p, { method: "DELETE" }, tok);
  const su = await post("/api/admin/signup", { name: "Grace Harbor", pass: "pastorpass1" }), pt = su.j.token, id = su.j.id, P = "/api/public/" + id;
  const state = async t => (await j("/api/admin/state", {}, t)).j.church;

  // staff management
  ok((await post("/api/admin/staff", { name: "Ruth Adeyemi", role: "team", pass: "short" }, pt)).s === 400, "a short temporary passcode is refused");
  ok((await post("/api/admin/staff", { name: "Ruth Adeyemi", role: "owner", pass: "ruthpass12" }, pt)).s === 400, "an unknown role is refused");
  ok((await post("/api/admin/staff", { name: "Ruth Adeyemi", role: "team", pass: "ruthpass12" }, pt)).s === 200, "the pastor adds a prayer and care team member");
  ok((await post("/api/admin/staff", { name: "ruth adeyemi", role: "admin", pass: "ruthpass12" }, pt)).s === 400, "a duplicate name is refused");
  await post("/api/admin/staff", { name: "Daniel Okoro", role: "admin", pass: "danielpass1" }, pt);
  let S = await state(pt); ok(S.staff.length === 2 && S.staff.every(u => !u.passHash && !u.salt), "the staff list never exposes password hashes");

  // sign in
  ok((await post("/api/admin/login", { id, user: "Ruth Adeyemi", pass: "wrong-pass" })).s === 401, "a wrong staff passcode is refused");
  const rl = await post("/api/admin/login", { id, user: "ruth adeyemi", pass: "ruthpass12" }), rt = rl.j.token;
  ok(rl.s === 200 && rl.j.role === "team", "a team member signs in with church ID, name and passcode (name is not case sensitive)");
  const dt = (await post("/api/admin/login", { id, user: "Daniel Okoro", pass: "danielpass1" })).j.token;
  ok((await post("/api/admin/login", { id, pass: "ruthpass12" })).s === 401, "a staff passcode does not open the pastor's account");

  // team limits
  const T = await state(rt);
  ok(T.role === "team" && T.me === "Ruth Adeyemi" && T.doctrine === "" && T.queue.length === 0 && T.origins.length === 0 && T.staff.length === 0, "the team sees no doctrine, queue, domains or staff");
  for (const [m, p, b] of [["POST", "/api/admin/sermon", { text: "a\n\nb" }], ["PUT", "/api/admin/settings", { name: "Hacked" }], ["GET", "/api/admin/brief"], ["POST", "/api/admin/staff", { name: "Eve Mallory", role: "admin", pass: "evepass123" }], ["POST", "/api/admin/queue/1/approve"], ["POST", "/api/admin/devotionals/generate", { topic: "x" }]])
    ok((await j(p, { method: m, body: b ? JSON.stringify(b) : undefined }, rt)).s === 403, "team blocked: " + m + " " + p.replace("/api/admin/", ""));
  ok((await j("/api/admin/care", {}, rt)).s !== 403 && (await j("/api/admin/visitors", {}, rt)).s !== 403, "team can reach care and visitors");

  // prayer reply by team, attributed
  const pr = await post(P + "/prayer", { text: "Please pray for my exams", share: true, name: "Tola" }), code = pr.j.code;
  const pid = (await state(rt)).prayers[0].id;
  ok((await post("/api/admin/prayers/" + pid + "/reply", { text: "Tola, we are praying for you this week." }, rt)).j.ok === true, "a team member replies to a prayer");
  ok((await post(P + "/prayer-status", { codes: [code] })).j.items[0].reply.by === "Ruth Adeyemi, prayer team", "the reply is signed with their name, not the pastor's");
  ok((await del("/api/admin/prayers/" + pid, rt)).s === 403, "the team cannot erase requests");

  // admin limits
  ok((await post("/api/admin/staff", { name: "Eve", role: "admin", pass: "evepass123" }, dt)).s === 403, "an administrator cannot manage staff");
  ok((await post("/api/admin/devotionals/generate", { topic: "Hope", days: 1 }, dt)).s === 200, "an administrator can do the pastor's day-to-day work");
  ok((await state(dt)).staff.length === 0, "and does not see the staff list");

  // pause / remove revokes immediately
  const uid = S.staff.find(u => u.name === "Ruth Adeyemi").id;
  await post("/api/admin/staff/" + uid + "/disable", {}, pt);
  ok((await j("/api/admin/state", {}, rt)).s === 401, "pausing a person signs them out immediately");
  ok((await post("/api/admin/login", { id, user: "Ruth Adeyemi", pass: "ruthpass12" })).s === 401, "and they cannot sign in again");
  await post("/api/admin/staff/" + uid + "/enable", {}, pt); await post("/api/admin/staff/" + uid + "/reset", { pass: "newpass1234" }, pt);
  ok((await post("/api/admin/login", { id, user: "Ruth Adeyemi", pass: "newpass1234" })).s === 200 && (await post("/api/admin/login", { id, user: "Ruth Adeyemi", pass: "ruthpass12" })).s === 401, "a reset passcode replaces the old one");
  await del("/api/admin/staff/" + (S.staff.find(u => u.name === "Daniel Okoro").id), pt);
  ok((await j("/api/admin/state", {}, dt)).s === 401, "removing a person revokes their token");

  // members
  const ms = await post(P + "/member/signup", { name: "Tola A", pass: "123456" }), mt = ms.j.token;
  ok(ms.s === 200 && mt, "a member creates an account with a name and passcode");
  ok((await post(P + "/member/signup", { name: "tola a", pass: "123456" })).s === 400 && (await post(P + "/member/signup", { name: "Bola", pass: "123" })).s === 400, "duplicate names and short passcodes are refused");
  ok((await post(P + "/member/login", { name: "Tola A", pass: "nope123" })).s === 401 && (await post(P + "/member/login", { name: "tola a", pass: "123456" })).s === 200, "member sign-in checks the passcode");
  ok((await j("/api/admin/state", {}, mt)).s === 401, "a member token cannot open the dashboard");
  ok((await j(P + "/member/me", {}, pt)).s === 401, "a pastor token is not a member token");
  const mp = await fetch(B + P + "/prayer", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + mt }, body: JSON.stringify({ text: "Pray for my family", share: true }) }).then(r => r.json());
  let me = await j(P + "/member/me", {}, mt);
  ok(me.j.name === "Tola A" && me.j.prayers.length === 1 && me.j.prayers[0].status === "new" && !("text" in me.j.prayers[0]), "a member sees the status of their own shared requests");
  const mpid = (await state(pt)).prayers.find(p => p.member).id;
  await post("/api/admin/prayers/" + mpid + "/reply", { text: "Praying for your family." }, pt);
  me = await j(P + "/member/me", {}, mt); ok(me.j.prayers[0].reply.text === "Praying for your family." && me.j.prayers[0].reply.by === "Pastor", "and the pastor's reply, on any phone");
  S = await state(pt); ok(S.members.length === 1 && S.members[0].prayers === 1 && !S.members[0].passHash, "the pastor sees members without their passcodes");
  await post("/api/admin/members/" + S.members[0].id + "/reset", { pass: "654321" }, pt);
  ok((await post(P + "/member/login", { name: "Tola A", pass: "654321" })).s === 200, "the pastor can reset a member's passcode");
  ok((await post(P + "/member/delete", {}, mt)).s === 200 && (await j(P + "/member/me", {}, mt)).s === 401, "a member can delete their own account");
  S = await state(pt); ok(S.members.length === 0 && !S.prayers.some(p => p.member), "which also removes the requests they shared");
  // visitors need nothing
  ok((await post(P + "/prayer", { text: "Pray for me", follow: false })).s === 200 && (await j(P + "/config")).s === 200, "visitors still need no account");
  for (let i = 0; i < 8; i++) await post(P + "/member/login", { name: "Nobody", pass: "x" + i });
  ok((await post(P + "/member/login", { name: "Nobody", pass: "x9" })).s === 429, "repeated wrong passcodes are rate limited");
  server.close(); console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
