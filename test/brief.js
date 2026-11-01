"use strict";
// Monday Brief: counts are exact, the AI cannot add figures, and no personal details reach it.
// Run: node test/brief.js
const http = require("http"), os = require("os"), fs = require("fs"), path = require("path");
for (const k of Object.keys(process.env)) if (/_API_KEY$|_BASE$|^GITHUB_MODELS_TOKEN$|^AI_|^STT_|^DATA_DIR$/.test(k)) delete process.env[k];
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "brief-"));
const ai = require("../lib/ai"), brief = require("../lib/brief"), server = require("../server");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok   " + m); } else { fail++; console.log("  FAIL " + m); } };

const NOW = Date.parse("2026-11-02T08:00:00Z"), DAY = 864e5, ago = (d) => new Date(NOW - d * DAY).toISOString(), key = (d) => ago(d).slice(0, 10);
// A church with known data, so every expected number can be counted by hand.
function church() {
  const daily = {};
  [[0, { q: 5, v: 2, p: 1, h: 1, g: 0 }], [3, { q: 4, v: 1, p: 2, h: 0, g: 1 }], [6, { q: 1, v: 0, p: 0, h: 0, g: 0 }],   // this week: q10 v3 p3 h1 g1
   [7, { q: 2, v: 1, p: 0, h: 0, g: 0 }], [10, { q: 3, v: 0, p: 1, h: 1, g: 2 }], [13, { q: 1, v: 0, p: 0, h: 0, g: 0 }],  // last week: q6 v1 p1 h1 g2
   [14, { q: 99, v: 99, p: 99, h: 99, g: 99 }]].forEach(([d, e]) => { daily[key(d)] = e; });                                   // older: must be ignored
  return {
    id: "x", name: "Grace Community Church", pastor: "Pastor", doctrine: "We believe in one God.", rules: { noQuote: true, noPromise: true, crisis: true, disclose: true }, nextId: 100, daily, briefs: [], log: [],
    friction: [{ q: "Do you have a youth group?", n: 2 }, { q: "Is there parking for wheelchairs?", n: 5 }, { q: "Do you baptise infants?", n: 1 }],
    visitors: [{ id: "v1", at: ago(10), name: "Amara Okafor", contact: "amara.okafor@example.org", status: "new" },        // waiting 10 days
               { id: "v2", at: ago(8), name: "Jon Reyes", contact: "+1 555 010 2233", status: "new" },                    // waiting 8 days
               { id: "v3", at: ago(2), name: "Priya Nair", contact: "priya@example.org", status: "new" },                  // new, not stale
               { id: "v4", at: ago(20), name: "Old Contact", contact: "old@example.org", status: "contacted" }],            // not new
    care: [{ id: "c1", at: ago(6), kind: "meal", status: "new", assignee: "", tasks: [{ t: "a", done: false }, { t: "b", done: true }] },       // stale, unassigned
           { id: "c2", at: ago(2), kind: "ride", status: "inprogress", assignee: "Ben", tasks: [{ t: "a", done: false }, { t: "b", done: false }] }, // open
           { id: "c3", at: ago(30), kind: "visit", status: "done", assignee: "Ben", tasks: [] }],                                                  // done: ignored
    queue: [{ id: 1, status: "pending", at: ago(4), title: "Follow-up draft" }, { id: 2, status: "pending", at: ago(1), title: "Urgent", urgent: true }, { id: 3, status: "approved", at: ago(9), title: "Old" }],
    pulpit: { services: [{ id: "s1", at: ago(2), lines: ["a", "b", "c", "d"] }, { id: "s2", at: ago(20), lines: ["old"] }] }
  };
}

const fakes = [];
function fake(mode) {
  const f = { hits: 0, bodies: [], mode };
  f.server = http.createServer((req, res) => { const ch = []; req.on("data", d => ch.push(d)); req.on("end", () => {
    if (req.method === "GET") { res.writeHead(404, { "content-type": "application/json" }); return res.end("{}"); }   // the router asks for the model list: not a call
    f.hits++; const raw = Buffer.concat(ch).toString(); f.bodies.push(raw);
    const md = typeof f.mode === "function" ? f.mode() : f.mode;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: typeof md === "string" ? md : JSON.stringify(md) } }] })); }); });
  fakes.push(f); return new Promise(r => f.server.listen(0, "127.0.0.1", () => { f.url = "http://127.0.0.1:" + f.server.address().port; r(f); }));
}
const GOOD = { headline: "Two people have waited too long", summary: "In the last 7 days 10 questions were asked and 3 first-time visitors came. 2 visitors have waited 7 days or more.", actions: [
  { title: "Welcome the waiting visitors", why: "2 first-time visitors have had no follow-up for 7 days or more.", view: "visitors" },
  { title: "Check the meal request", why: "1 open care request has waited 5 days or more.", view: "care" },
  { title: "Answer the wheelchair parking question", why: "It was asked 5 times without an answer.", view: "faq" }] };

let base = "", tok = "";
const api = async (m, p, body) => { const r = await fetch(base + p, { method: m, headers: { "content-type": "application/json", ...(tok ? { authorization: "Bearer " + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }); let j = {}; try { j = await r.json(); } catch (e) {} return { s: r.status, j }; };

async function main() {
  console.log("Counting");
  const { facts: f, records: rec, weekEnding } = brief.compute(church(), NOW), w = f.week;
  ok(weekEnding === "2026-11-02", "the week ends today");
  ok(w.questions.n === 10 && w.firstVisits.n === 3 && w.prayers.n === 3 && w.careRequests.n === 1 && w.groupSearches.n === 1, "this week's counts are summed from the last 7 days only");
  ok(w.questions.prev === 6 && w.questions.change === 4 && w.firstVisits.change === 2 && w.groupSearches.change === -1, "the week before is compared, and anything older is ignored");
  ok(f.unansweredQuestions[0].question === "Is there parking for wheelchairs?" && f.unansweredQuestions[0].timesAsked === 5 && f.unansweredQuestions.length === 3, "unanswered questions are ranked by how often they were asked");
  ok(f.visitors.newToWelcome === 3 && f.visitors.waitingOverThreshold === 2, "visitors: 3 are new, 2 have waited 7 days or more (contacted ones are not counted)");
  ok(f.care.open === 2 && f.care.waitingOverThreshold === 1 && f.care.unassigned === 1 && f.care.openSteps === 3, "care: 2 open, 1 stale, 1 unassigned, 3 steps left (done requests ignored)");
  ok(f.drafts.waitingForApproval === 2 && f.drafts.urgentAlerts === 1 && f.drafts.oldestWaitingDays === 4, "drafts: 2 waiting, 1 urgent, oldest waited 4 days");
  ok(f.liveServices.count === 1 && f.liveServices.captionLines === 4, "live services: only this week's service is counted");
  ok(rec.staleVisitors.map(v => v.id).join() === "v1,v2" && rec.staleVisitors[0].days === 10 && rec.staleCare[0].id === "c1", "the records behind each count are listed for the pastor");
  ok(!JSON.stringify(f).match(/Amara|Jon Reyes|Priya|example\.org|555/), "the facts sent to the AI contain no names or contact details");
  const empty = brief.compute({ daily: {}, care: [], visitors: [], queue: [], friction: [] }, NOW);
  ok(empty.facts.week.questions.n === 0 && empty.facts.drafts.oldestWaitingDays === 0 && empty.facts.liveServices.count === 0, "an empty church counts zero everywhere and does not crash");

  console.log("Figures the AI may use");
  const allowed = brief.allowedNumbers(f);
  ok(brief.numbersOk("10 questions, 3 visitors, waited 7 days, 5 times", allowed), "numbers that are in the counts are allowed");
  ok(!brief.numbersOk("about 47 people came", allowed) && !brief.numbersOk("a 23% rise", allowed), "an invented number is refused");
  ok(brief.numbersOk("three actions for you", allowed), "words are fine");

  console.log("Without AI");
  const fb = brief.fallback(f);
  ok(fb.actions.length === 3 && fb.actions[0].view === "queue" && /urgent/i.test(fb.headline), "the rule-based brief puts the urgent alert first and gives three actions");
  ok(fb.actions.every(a => brief.VIEWS.includes(a.view)) && brief.numbersOk(fb.summary + fb.actions.map(a => a.why).join(" "), allowed), "its actions point at real pages and it uses only counted numbers");
  const quiet = brief.fallback(empty.facts); ok(quiet.actions.length === 3 && quiet.headline === "A quiet week", "a quiet church still gets a sensible brief");

  console.log("With AI");
  const A = await fake(GOOD), B = await fake(GOOD);
  ai.configure({ AI_PROVIDERS: "groq,cerebras", GROQ_API_KEY: "k", GROQ_BASE: A.url, CEREBRAS_API_KEY: "k", CEREBRAS_BASE: B.url });
  let c = church(), r = await brief.generate(c, NOW);
  ok(r.brief.live && /groq/.test(r.brief.via) && r.brief.headline === GOOD.headline && r.brief.actions.length === 3, "a good AI answer is used and labelled with the provider that wrote it");
  ok(c.briefs.length === 1 && c.briefs[0].facts.week.questions.n === 10, "the brief is saved with the counts it was written from");
  const sent = A.bodies[0];
  ok(!/Amara|Jon Reyes|Priya|example\.org|555/.test(sent) && /wheelchairs/.test(sent), "names and contact details never reach the AI; scrubbed questions do");
  A.mode = { ...GOOD, summary: "47 people came this week and 3 visitors need you." }; c = church(); r = await brief.generate(c, NOW);
  ok(r.brief.via.startsWith("cerebras") && !/47/.test(r.brief.summary), "an answer with an invented figure is rejected and the next provider answers");
  A.mode = { ...GOOD, summary: "47 people came." }; B.mode = { ...GOOD, headline: "Up 80% this week" }; c = church(); r = await brief.generate(c, NOW);
  ok(!r.brief.live && r.brief.via === "rule-based fallback" && !/47|80/.test(JSON.stringify(r.brief)), "if every provider invents figures, the rule-based brief is used instead");
  A.mode = { ...GOOD, actions: [{ title: "x", why: "y", view: "../../etc" }] }; B.mode = "not json"; c = church(); r = await brief.generate(c, NOW);
  ok(r.brief.via === "rule-based fallback", "an action pointing at an unknown page is rejected");
  const text = brief.email(church(), { ...r.brief, facts: f, weekEnding });
  ok(/^Subject: Monday Brief for Grace Community Church/.test(text) && /10 questions asked \(up 4 from 6\)/.test(text) && !/Amara|example\.org/.test(text), "the email text shows the counts and holds no personal details");

  console.log("Routes");
  A.mode = GOOD; B.mode = GOOD; ai.configure({ AI_PROVIDERS: "groq", GROQ_API_KEY: "k", GROQ_BASE: A.url });
  await new Promise(r => server.listen(0, "127.0.0.1", r)); base = "http://127.0.0.1:" + server.address().port;
  let x = await api("GET", "/api/admin/brief"); ok(x.s === 401, "the brief needs a sign-in");
  x = await api("POST", "/api/admin/signup", { name: "Grace Community Church", pass: "correct horse" }); tok = x.j.token; const id = x.j.id;
  x = await api("GET", "/api/admin/brief"); ok(x.s === 200 && x.j.latest === null && x.j.facts.week.questions.n === 0, "a new church can see its counts before any brief exists");
  await api("POST", `/api/public/${id}/ask`, { messages: [{ role: "user", text: "Do you offer childcare during services?" }] });
  x = await api("POST", "/api/admin/brief"); ok(x.s === 200 && x.j.latest.actions.length === 3 && /Monday Brief for/.test(x.j.email), "the pastor writes a brief and gets copyable email text");
  ok(x.j.facts.week.questions.n >= 1, "the counts include real activity from the widget");
  await api("POST", `/api/public/${id}/care`, { kind: "meal", text: "Recovering from surgery, a meal would help", name: "Jon", contact: "jon@example.org", consent: true });
  for (let i = 0; i < 2; i++) await api("POST", `/api/public/${id}/prayer`, { text: "I want to end my life" }); // two crises: counted as crises, never as care requests
  x = await api("GET", "/api/admin/brief"); ok(x.j.facts.week.careRequests.n === 1, "a real care request is counted once, and a crisis is not counted as one");
  x = await api("GET", "/api/admin/brief"); ok(x.j.latest && x.j.latest.id, "the latest brief is remembered");
  x = await api("GET", "/api/admin/state"); ok(x.j.church.log.some(l => l.agent === "Monday Brief"), "the AI log records that a brief was written");
  const t1 = tok; x = await api("POST", "/api/admin/signup", { name: "Other Church", pass: "another long pass" }); tok = x.j.token;
  x = await api("GET", "/api/admin/brief"); ok(x.j.latest === null && x.j.facts.week.questions.n === 0, "another church sees none of it");
  tok = t1; let last; for (let i = 0; i < 10; i++) last = await api("POST", "/api/admin/brief"); ok(last.s === 429, "briefs are rate limited");

  for (const f2 of fakes) f2.server.close(); server.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
