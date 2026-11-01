"use strict";
// Prayer board: private by default, shared only by choice, replies seen only with the receipt code.
const os = require("os"), path = require("path"), fs = require("fs");
const dir = process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pl-pray-"));
for (const k of Object.keys(process.env)) if (/_API_KEY$|_BASE$|^GITHUB_MODELS_TOKEN$|^AI_/.test(k)) delete process.env[k];
const server = require("../server");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok   " + m); } else { fail++; console.log("  FAIL " + m); } };
async function main() {
  await new Promise(x => server.listen(0, x));
  const B = "http://127.0.0.1:" + server.address().port;
  const j = async (p, o = {}, tok) => { const x = await fetch(B + p, { ...o, headers: { "content-type": "application/json", ...(tok ? { authorization: "Bearer " + tok } : {}) } }); return { s: x.status, j: await x.json().catch(() => ({})) }; };
  const post = (p, b, tok) => j(p, { method: "POST", body: JSON.stringify(b || {}) }, tok);
  const su = await post("/api/admin/signup", { name: "Grace Harbor", pass: "passcode123" }), tok = su.j.token, id = su.j.id, P = "/api/public/" + id;
  const state = async () => (await j("/api/admin/state", {}, tok)).j.church;

  let r = await post(P + "/prayer", { text: "Please pray for my mother's surgery on Tuesday", follow: false });
  ok(r.s === 200 && !r.j.code, "a private request gets no receipt code");
  ok((await state()).prayers.length === 0, "a private request is not stored");
  ok(!fs.readdirSync(dir).some(f => fs.readFileSync(path.join(dir, f), "utf8").includes("mother's surgery")), "its words are not on disk anywhere");

  r = await post(P + "/prayer", { text: "Please pray for my mother's surgery. Reach me at ann@example.com", share: true, name: "Ann", contact: "0801 234 5678" });
  const code = r.j.code;
  ok(r.s === 200 && /^[0-9a-f]{10}$/.test(code), "a shared request returns a receipt code");
  let S = await state();
  ok(S.prayers.length === 1 && S.prayers[0].name === "Ann" && S.prayers[0].status === "new", "it appears on the board as new");
  ok(!/ann@example\.com/.test(S.prayers[0].text), "an email address typed into the words is removed");
  ok(S.prayers.every(p => p.h === undefined) && !JSON.stringify(S).includes(code), "the receipt code is never shown to the pastor's screen");
  ok(!fs.readFileSync(path.join(dir, fs.readdirSync(dir).find(f => f.endsWith(".json") && f.includes(id.slice(0, 5))) || fs.readdirSync(dir)[0]), "utf8").includes(code), "the code is stored only as a hash");

  let st = await post(P + "/prayer-status", { codes: [code, "ffffffffff"] });
  ok(st.j.items.length === 1 && st.j.items[0].status === "new" && !st.j.items[0].reply, "the requester sees status for their own code only");
  ok((await post(P + "/prayer-status", { codes: ["0000000000"] })).j.items.length === 0, "a wrong code shows nothing");

  const pid = S.prayers[0].id, A = "/api/admin/prayers/" + pid;
  ok((await post(A + "/praying", {}, tok)).s === 200 && (await post(P + "/prayer-status", { codes: [code] })).j.items[0].status === "praying", "marking as praying shows to the requester");
  ok((await post(A + "/reply", { text: "" }, tok)).s === 400, "an empty reply is refused");
  const dr = await post(A + "/draft", {}, tok);
  ok(dr.s === 200 && dr.j.reply.length > 20, "a reply draft is offered (offline wording without AI)");
  let rp = await post(A + "/reply", { text: "God will heal her completely, I guarantee it." }, tok);
  ok(rp.s === 200 && rp.j.ok === false && rp.j.flags.length > 0, "a reply that promises healing is flagged, not sent");
  ok(!(await post(P + "/prayer-status", { codes: [code] })).j.items[0].reply, "and the requester sees nothing yet");
  rp = await post(A + "/reply", { text: "Ann, we are praying for your mother and for you this week." }, tok);
  ok(rp.j.ok === true, "a clean reply is sent");
  st = await post(P + "/prayer-status", { codes: [code] });
  ok(st.j.items[0].status === "replied" && /praying for your mother/.test(st.j.items[0].reply.text), "the requester sees the pastor's reply with their code");

  ok((await post(P + "/prayer", { text: "I want to end my life", share: true })).j.crisis === true, "the crisis rule still fires first");
  ok((await state()).prayers.length === 1, "a crisis message is never stored on the board");

  ok((await post(P + "/prayer-remove", { code })).s === 200 && (await state()).prayers.length === 0, "the requester can remove their own request");
  r = await post(P + "/prayer", { text: "Pray for my job", share: true }); S = await state();
  ok((await j("/api/admin/prayers/" + S.prayers[0].id, { method: "DELETE" }, tok)).s === 200 && (await state()).prayers.length === 0, "the pastor can erase a request");
  ok((await post("/api/admin/prayers/" + "nope" + "/close", {})).s === 401, "the board needs sign-in");
  server.close(); console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
