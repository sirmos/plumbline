"use strict";
// Hub: rename, real-person handoff, presence, templates, branches, member saves. Run: node test/hub.js
const os = require("os"), path = require("path"), fs = require("fs");
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pl-hub-"));
for (const k of Object.keys(process.env)) if (/_API_KEY$|_BASE$|^GITHUB_MODELS_TOKEN$|^AI_/.test(k)) delete process.env[k];
const server = require("../server");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok   " + m); } else { fail++; console.log("  FAIL " + m); } };
async function main() {
  await new Promise(x => server.listen(0, x));
  const B = "http://127.0.0.1:" + server.address().port;
  const j = async (p, o = {}, tok) => { const x = await fetch(B + p, { ...o, headers: { "content-type": "application/json", ...(tok ? { authorization: "Bearer " + tok } : {}) } }); return { s: x.status, j: await x.json().catch(() => ({})) }; };
  const post = (p, b, tok) => j(p, { method: "POST", body: JSON.stringify(b || {}) }, tok), put = (p, b, tok) => j(p, { method: "PUT", body: JSON.stringify(b || {}) }, tok);
  const su = await post("/api/admin/signup", { name: "Heaven's Assembly", pass: "pastorpass1" }), pt = su.j.token, id = su.j.id, P = "/api/public/" + id;
  const cfg = async () => (await j(P + "/config")).j;

  // rename
  ok((await cfg()).name === "Heaven's Assembly", "the church starts with the name it was created with");
  await put("/api/admin/settings", { name: "Heaven's Gate Assembly" }, pt);
  ok((await cfg()).name === "Heaven's Gate Assembly", "a renamed church shows its new name in the widget straight away");
  ok((await j(P + "/site")).j.name === "Heaven's Gate Assembly", "and on its church page");
  ok((await j("/api/admin/state", {}, pt)).j.church.id === id, "the church ID does not change, so the website code keeps working");
  ok((await put("/api/admin/settings", { name: "   " }, pt)).s === 200 && (await cfg()).name === "Heaven's Gate Assembly", "an empty name is ignored");

  // asking for a real person
  const ask = (text, history = []) => post(P + "/ask", { messages: [...history, { role: "user", text }] });
  let r = await ask("transfer me to a real person");
  ok(r.s === 200 && r.j.needsHuman === true && /Help tab/.test(r.j.answer), "asking for a person is recognised and points to the Help tab");
  ok(!/555|@/.test(r.j.answer) && r.j.handoff && r.j.handoff.phone === "", "with no contact details entered, none are invented");
  await put("/api/admin/settings", { site: { phone: "+234 801 234 5678", email: "office@heaven.example", hours: "Mon to Fri, 9 AM to 4 PM", handoff: "After hours, leave a message." } }, pt);
  r = await ask("can I speak to the pastor");
  ok(/\+234 801 234 5678/.test(r.j.answer) && /office@heaven\.example/.test(r.j.answer) && /Mon to Fri/.test(r.j.answer) && /After hours/.test(r.j.answer), "the reply uses the phone, email, hours and note the church entered");
  ok(r.j.handoff.phone === "+234 801 234 5678" && r.j.handoff.email === "office@heaven.example", "the buttons get the same details");
  ok(/not marked as reachable/.test(r.j.answer), "it does not claim anyone is available until the team says so");
  const again = await ask("transfer me to a real person", [{ role: "user", text: "can I speak to the pastor" }, { role: "assistant", text: r.j.answer }]);
  ok(/already shared/.test(again.j.answer) && again.j.answer !== r.j.answer, "asking again does not repeat the same words");
  const plain = await ask("what time is service");
  ok(!/Of course\. I am an AI guide/.test(plain.j.answer), "an ordinary question is not treated as a handoff");
  const un = async () => (await j("/api/admin/state", {}, pt)).j.church.stats.unanswered, u0 = await un();
  await ask("I need to speak to a human please");
  ok(await un() === u0, "a request for a person is not counted as an unanswered question");

  // presence
  ok((await post("/api/admin/presence", { hours: 2 }, pt)).s === 200, "the pastor marks the team reachable");
  ok((await cfg()).reach.available === true, "the widget learns the team is reachable");
  ok(/marked themselves reachable/.test((await ask("I want to talk to someone")).j.answer), "the reply says so");
  await post("/api/admin/staff", { name: "Ruth Adeyemi", role: "team", pass: "ruthpass12" }, pt);
  const rt = (await post("/api/admin/login", { id, user: "Ruth Adeyemi", pass: "ruthpass12" })).j.token;
  ok((await post("/api/admin/presence", { hours: 0 }, rt)).s === 200 && (await cfg()).reach.available === false, "a team member can switch it off");
  ok((await post("/api/admin/presence", { hours: 99 }, pt)).s === 200 && (await j("/api/admin/state", {}, pt)).j.church.presence - Date.now() <= 12 * 3600000 + 5000, "it can never be set for more than twelve hours");

  // launcher label and features
  await put("/api/admin/settings", { launcher: "Church hub" }, pt);
  ok((await cfg()).launcher === "Church hub", "the chat button label can be changed");
  await put("/api/admin/settings", { features: { members: false } }, pt);
  ok((await cfg()).features.members === false, "member accounts can be switched off");
  await put("/api/admin/settings", { features: { members: true } }, pt);

  // templates
  await put("/api/admin/settings", { site: { theme: "coastal", tagline: "A family of families", hero: "https://img.example/a.jpg", links: [{ label: "Give", url: "https://give.example/x" }, { label: "Bad", url: "javascript:alert(1)" }, { label: "Plain", url: "http://insecure.example" }] } }, pt);
  let site = (await j(P + "/site")).j;
  ok(site.theme === "coastal" && site.tagline === "A family of families", "a template and welcome line are saved");
  ok(site.hero === "https://img.example/a.jpg", "a banner photo with an https address is kept");
  ok(site.links.length === 1 && site.links[0].label === "Give", "only https links are kept");
  await put("/api/admin/settings", { site: { theme: "evil", hero: "http://x.example/a.jpg" } }, pt);
  site = (await j(P + "/site")).j;
  ok(site.theme === "coastal" && site.hero === "", "an unknown template is ignored and a non-https banner is removed");
  ok(site.features.members === true && site.hours === "Mon to Fri, 9 AM to 4 PM", "the page knows its features and office hours");

  // branches
  await put("/api/admin/settings", { partners: [{ name: "Heaven's Gate North", city: "Abuja", kind: "branch", address: "4 Mill Rd", times: "Sundays 9 AM", phone: "555", langs: ["English"] }, { name: "Grace Partners", city: "Ibadan", kind: "partner", langs: ["English"] }] }, pt);
  site = (await j(P + "/site")).j;
  ok(site.branches.length === 1 && site.branches[0].name === "Heaven's Gate North" && site.branches[0].address === "4 Mill Rd", "branches appear on the church page and partners do not");
  const mv = await post(P + "/move", { name: "Ada", city: "Abuja", consent: true });
  ok(mv.j.matched && mv.j.kind === "branch" && mv.j.address === "4 Mill Rd", "a member moving to a branch city is told it is one of the church's own branches, with the address");

  // member saves
  const m = (await post(P + "/member/signup", { name: "Tola A", pass: "tolapass1" })).j.token, m2 = (await post(P + "/member/signup", { name: "Femi B", pass: "femipass1" })).j.token;
  ok((await post(P + "/member/save", { key: "d:2026-11-01" })).s === 401, "saving needs an account");
  ok((await post(P + "/member/save", { key: "<script>" }, m)).s === 400, "an odd key cannot be saved");
  ok((await post(P + "/member/save", { key: "d:2026-11-01" }, m)).j.saves.length === 1, "a member saves a devotional");
  await post(P + "/member/save", { key: "s:s1a2b3c4:2" }, m); await post(P + "/member/save", { key: "j:week" }, m);
  ok((await j(P + "/member/me", {}, m)).j.saves.length === 3, "saved items come back on any phone");
  ok((await j(P + "/member/me", {}, m2)).j.saves.length === 0, "another member sees none of them");
  ok((await post(P + "/member/save", { key: "d:2026-11-01", on: false }, m)).j.saves.length === 2, "a saved item can be removed");
  ok((await post(P + "/member/save", { key: "j:week" }, m)).j.saves.length === 1, "saving the same item again toggles it off");
  const S = (await j("/api/admin/state", {}, pt)).j.church;
  ok(S.members.every(x => !x.saves && !x.passHash), "the pastor's list shows no saved items and no hashes");

  console.log("\n" + pass + " passed, " + fail + " failed"); server.close(); process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
