"use strict";
// Daily devotionals, Bible text lookup, series and Bible studies. Run: node test/studies.js
const os = require("os"), path = require("path"), fs = require("fs");
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pl-study-"));
for (const k of Object.keys(process.env)) if (/_API_KEY$|_BASE$|^GITHUB_MODELS_TOKEN$|^AI_/.test(k)) delete process.env[k];
const bible = require("../lib/bible"), studies = require("../lib/studies"), server = require("../server");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok   " + m); } else { fail++; console.log("  FAIL " + m); } };
const today = new Date().toISOString().slice(0, 10);
async function main() {
  // Bible lookup (fake network)
  let urls = [];
  const fake = async u => { urls.push(u); return { status: 200, json: async () => ({ reference: "John 3:16", text: "For God so loved the world…\n" }) }; };
  let r = await bible.lookup("John 3:16", "kjv", { fetch: fake });
  ok(r.ok && r.version === "kjv" && /loved the world/.test(r.text) && urls[0].startsWith("https://bible-api.com/John%203%3A16?translation=kjv"), "looks up a passage in a public-domain version");
  await bible.lookup("John 3:16", "kjv", { fetch: fake }); ok(urls.length === 1, "repeat lookups are cached");
  ok(!(await bible.lookup("John 3:16", "esv", { fetch: fake })).ok, "a copyrighted version is refused");
  ok(!(await bible.lookup("../etc/passwd", "web", { fetch: fake })).ok && !(await bible.lookup("John 3:16?x=1&y=2", "web", { fetch: fake })).ok, "odd references are refused before any request");
  ok((await bible.lookup("Psalm 23", "web", { fetch: async () => ({ status: 404 }) })).why.includes("not found"), "a missing passage gives a plain message");
  ok(!(await bible.lookup("Psalm 23", "web", { fetch: async () => { throw new Error("x"); } })).ok, "a dead text service gives a plain message");
  ok(studies.addDays("2026-12-30", 3) === "2027-01-02" && studies.isDate("2026-02-30") === false, "date helpers handle month and year ends");

  await new Promise(x => server.listen(0, x));
  const B = "http://127.0.0.1:" + server.address().port;
  const j = async (p, o = {}, tok) => { const x = await fetch(B + p, { ...o, headers: { "content-type": "application/json", ...(tok ? { authorization: "Bearer " + tok } : {}) } }); return { s: x.status, j: await x.json().catch(() => ({})) }; };
  const post = (p, b, tok) => j(p, { method: "POST", body: JSON.stringify(b || {}) }, tok), put = (p, b, tok) => j(p, { method: "PUT", body: JSON.stringify(b || {}) }, tok);
  const su = await post("/api/admin/signup", { name: "Grace Harbor", pass: "passcode123" }), tok = su.j.token, id = su.j.id, P = "/api/public/" + id;
  const state = async () => (await j("/api/admin/state", {}, tok)).j.church, cfg = async () => (await j(P + "/config")).j;

  // Devotionals
  ok((await post("/api/admin/devotionals/generate", {}, tok)).s === 400, "generating needs a theme or passage");
  let g = await post("/api/admin/devotionals/generate", { topic: "Trusting God in hard seasons", days: 7, start: today }, tok);
  ok(g.s === 200 && g.j.count === 7, "writes a week of devotional drafts");
  let S = await state(), D = S.devotionals;
  ok(D.length === 7 && D.every(d => d.status === "draft") && D[3].date === studies.addDays(today, 3), "each draft gets its own date and starts unpublished");
  ok((await cfg()).today.length === 0, "drafts are invisible to the public");
  ok((await post("/api/admin/devotionals/" + D[0].id + "/publish", {}, tok)).s === 200, "the pastor publishes one");
  let t = (await cfg()).today; ok(t.length === 1 && t[0].title === D[0].title && !("status" in t[0]), "today's devotional appears in the widget data");
  const pa = await post("/api/admin/devotionals-publish-all", {}, tok); ok(pa.j.n === 6, "publish all covers the other six");
  ok((await cfg()).today.every(d => d.date <= studies.addDays(today, 1)), "future days stay hidden until they are due");
  ok((await put("/api/admin/devotionals/" + D[1].id, { title: "Edited", text: "a verse typed by the pastor", version: "kjv" }, tok)).s === 200 && (await state()).devotionals.find(d => d.id === D[1].id).title === "Edited", "the pastor edits a devotional and attaches verse text");
  ok((await post("/api/admin/devotionals", { title: "", reflection: "" }, tok)).s === 400, "an empty devotional is refused");
  await post("/api/admin/devotionals/" + D[2].id + "/unpublish", {}, tok);
  ok((await state()).devotionals.find(d => d.id === D[2].id).status === "draft", "a published devotional can be pulled back");
  ok((await j("/api/admin/devotionals/" + D[2].id, { method: "DELETE" }, tok)).s === 200, "and deleted");
  ok((await post("/api/admin/devotionals/generate", { topic: "x", days: 3 })).s === 401, "writing needs sign-in");

  // Series and Bible studies
  g = await post("/api/admin/series/generate", { kind: "study", topic: "The Sermon on the Mount", passage: "Matthew 5-7", count: 4, start: today }, tok);
  ok(g.s === 200, "writes a four-week Bible study draft");
  S = await state(); const sr = S.series[0];
  ok(sr.kind === "study" && sr.items.length === 4 && sr.items.every(i => i.questions.length >= 2) && sr.status === "draft", "each week has discussion questions");
  ok((await cfg()).studies.length === 0, "a draft study is not public");
  await put("/api/admin/series/" + sr.id, { title: "Sermon on the Mount", items: sr.items.map((i, n) => ({ ...i, title: i.title + (n ? "" : " (edited)") })) }, tok);
  ok((await state()).series[0].items[0].title.endsWith("(edited)"), "the pastor edits titles and questions");
  await post("/api/admin/series/" + sr.id + "/publish", {}, tok);
  const pub = (await cfg()).studies[0]; ok(pub && pub.items.length === 4 && pub.start === today && pub.cadence === "weekly", "a published study reaches the widget with its schedule");
  g = await post("/api/admin/series/generate", { kind: "series", topic: "Faith under pressure", count: 12, cadence: "weekly" }, tok);
  ok(g.s === 200 && (await state()).series.find(x => x.kind === "series").items.length === 12, "a twelve-week sermon series with study guides");
  g = await post("/api/admin/series/generate", { kind: "study", topic: "Proverbs", count: 99 }, tok);
  ok((await state()).series.every(x => x.items.length <= 26), "length is capped");
  ok((await post("/api/admin/series/generate", {}, tok)).s === 400, "a study needs a topic or passage");
  ok((await j("/api/admin/series/" + sr.id, { method: "DELETE" }, tok)).s === 200 && (await state()).series.every(x => x.id !== sr.id), "a study can be deleted");

  // Self-test
  const stt = await post("/api/admin/self-test", {}, tok);
  ok(stt.s === 200 && stt.j.total >= 10 && stt.j.results.every(x => x.name && (x.ok || x.fix)), "the self-test reports each check with a fix for every failure");
  ok(stt.j.results.find(x => /AI provider is connected/.test(x.name)).ok === false, "it says plainly when no AI provider is set up");
  ok((await post("/api/admin/self-test", {})).s === 401, "the self-test needs sign-in");

  // Public Bible lookup route
  const rr = await j(P + "/bible?ref=" + encodeURIComponent("John 3:16") + "&v=esv"); ok(rr.s === 400, "the public lookup refuses a copyrighted version");
  await put("/api/admin/settings", { features: { today: false } }, tok);
  ok((await cfg()).today.length === 0 && (await cfg()).studies.length === 0, "the Today tab can be switched off");
  server.close(); console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
