"use strict";
// Monday Brief: one page for the pastor. Every number is counted by code from the church's own data.
// The AI only writes the wording around those counts, and an answer that contains any figure that is
// not in the counts is rejected, so it cannot invent one. Nothing here is sent to anyone.
const ai = require("./ai");

const DAY = 864e5;
const STALE_VISITOR_DAYS = 7, STALE_CARE_DAYS = 5;
const VIEWS = ["queue", "visitors", "care", "insight", "faq", "pulpit", "sermon"];
const age = (iso, now) => Math.max(0, Math.floor((now - Date.parse(iso)) / DAY));
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

function windowSum(daily, key, now, from, to) { // days (now - to) .. (now - from), inclusive
  let n = 0;
  for (let i = from; i <= to; i++) n += ((daily || {})[dayKey(now - i * DAY)] || {})[key] || 0;
  return n;
}

// Counts only. `facts` goes to the AI. `records` (names, ids) stays on the server and is shown to the pastor.
function compute(c, now = Date.now()) {
  // Daily counter keys, as the server writes them: q questions, v visitors, p prayers, h care requests (help), g group searches. "c" is crisis alerts.
  const metric = (key) => { const n = windowSum(c.daily, key, now, 0, 6), prev = windowSum(c.daily, key, now, 7, 13); return { n, prev, change: n - prev }; };
  const openCare = c.care.filter(x => x.status === "new" || x.status === "inprogress");
  const staleCare = openCare.filter(x => age(x.at, now) >= STALE_CARE_DAYS);
  const staleVisitors = c.visitors.filter(v => v.status === "new" && age(v.at, now) >= STALE_VISITOR_DAYS);
  const pending = c.queue.filter(q => q.status === "pending");
  const urgent = pending.filter(q => q.urgent);
  const services = ((c.pulpit && c.pulpit.services) || []).filter(s => now - Date.parse(s.at) <= 7 * DAY);
  const gaps = c.friction.slice().sort((a, b) => b.n - a.n).slice(0, 5);
  const facts = {
    thresholds: { staleVisitorDays: STALE_VISITOR_DAYS, staleCareDays: STALE_CARE_DAYS },
    week: { questions: metric("q"), firstVisits: metric("v"), prayers: metric("p"), careRequests: metric("h"), groupSearches: metric("g") },
    unansweredQuestions: gaps.map(g => ({ question: g.q, timesAsked: g.n })),
    visitors: { newToWelcome: c.visitors.filter(v => v.status === "new").length, waitingOverThreshold: staleVisitors.length },
    care: { open: openCare.length, waitingOverThreshold: staleCare.length, unassigned: openCare.filter(x => !x.assignee).length, openSteps: openCare.reduce((a, x) => a + (x.tasks || []).filter(t => !t.done).length, 0) },
    drafts: { waitingForApproval: pending.length, urgentAlerts: urgent.length, oldestWaitingDays: pending.length ? Math.max(...pending.map(q => age(q.at, now))) : 0 },
    liveServices: { count: services.length, captionLines: services.reduce((a, s) => a + s.lines.length, 0) }
  };
  const records = {
    unanswered: gaps.map(g => ({ question: g.q, n: g.n })),
    staleVisitors: staleVisitors.map(v => ({ id: v.id, name: v.name || "Visitor", days: age(v.at, now) })),
    staleCare: staleCare.map(x => ({ id: x.id, kind: x.kind, days: age(x.at, now), assignee: x.assignee || "" })),
    pending: pending.map(q => ({ id: q.id, title: q.title, days: age(q.at, now), urgent: !!q.urgent }))
  };
  return { weekEnding: dayKey(now), facts, records };
}

// Every figure the AI may write: all numbers in the facts, plus the numbers 1 to 3 (for "three actions").
function allowedNumbers(facts) {
  const set = new Set(["1", "2", "3"]);
  (JSON.stringify(facts).match(/-?\d+(?:\.\d+)?/g) || []).forEach(x => { set.add(x.replace("-", "")); });
  return set;
}
function numbersOk(text, allowed) {
  return (String(text).match(/\d+(?:[.,]\d+)?/g) || []).every(x => allowed.has(x.replace(",", ".")));
}

const label = { questions: "questions asked", firstVisits: "first-time visitors", prayers: "prayer requests", careRequests: "care requests", groupSearches: "group searches" };
function fallback(f) {
  const acts = [];
  if (f.drafts.urgentAlerts) acts.push({ title: "Open the urgent alert" + (f.drafts.urgentAlerts === 1 ? "" : "s"), why: f.drafts.urgentAlerts + " urgent alert" + (f.drafts.urgentAlerts === 1 ? " is" : "s are") + " waiting for a person.", view: "queue" });
  if (f.care.waitingOverThreshold) acts.push({ title: "Check the care requests that have waited", why: f.care.waitingOverThreshold + " open care request" + (f.care.waitingOverThreshold === 1 ? " has" : "s have") + " waited " + f.thresholds.staleCareDays + " days or more.", view: "care" });
  if (f.visitors.waitingOverThreshold) acts.push({ title: "Welcome the visitors who are still waiting", why: f.visitors.waitingOverThreshold + " first-time visitor" + (f.visitors.waitingOverThreshold === 1 ? " has" : "s have") + " had no follow-up for " + f.thresholds.staleVisitorDays + " days or more.", view: "visitors" });
  if (f.drafts.waitingForApproval - f.drafts.urgentAlerts > 0) acts.push({ title: "Review the drafts waiting for you", why: (f.drafts.waitingForApproval - f.drafts.urgentAlerts) + " draft" + (f.drafts.waitingForApproval - f.drafts.urgentAlerts === 1 ? " is" : "s are") + " waiting for approval.", view: "queue" });
  if (f.unansweredQuestions.length) acts.push({ title: "Answer the question people keep asking", why: "“" + f.unansweredQuestions[0].question + "” was asked " + f.unansweredQuestions[0].timesAsked + " time" + (f.unansweredQuestions[0].timesAsked === 1 ? "" : "s") + " without an answer.", view: "faq" });
  if (!f.liveServices.count) acts.push({ title: "Try Live Pulpit at your next service", why: "No service was captioned this week.", view: "pulpit" });
  const pad = [{ title: "Turn this week's sermon into a reading plan", why: "A five-day plan keeps the message going through the week.", view: "sermon" }, { title: "Look at what people carry", why: "Prayer themes show what the congregation needs.", view: "insight" }, { title: "Check the AI log", why: "See what the AI drafted and what you decided.", view: "queue" }];
  for (const p of pad) if (acts.length < 3 && !acts.some(a => a.view === p.view)) acts.push(p);
  const w = f.week, busy = Object.keys(label).filter(k => w[k].n > 0).map(k => w[k].n + " " + label[k]);
  const urgent = f.drafts.urgentAlerts, waiting = f.care.waitingOverThreshold + f.visitors.waitingOverThreshold;
  return {
    headline: urgent ? "An urgent alert needs you first" : waiting ? "Some people have been waiting" : busy.length ? "A steady week" : "A quiet week",
    summary: (busy.length ? "In the last 7 days: " + busy.join(", ") + "." : "Nothing was recorded in the last 7 days.") + " " + (waiting ? waiting + " people or requests have waited longer than they should. " : "") + (f.drafts.waitingForApproval ? f.drafts.waitingForApproval + " draft" + (f.drafts.waitingForApproval === 1 ? " is" : "s are") + " waiting for your approval." : "No drafts are waiting for you."),
    actions: acts.slice(0, 3)
  };
}

function shape(d, allowed) {
  if (!d || typeof d.headline !== "string" || typeof d.summary !== "string" || !Array.isArray(d.actions) || d.actions.length < 1 || d.actions.length > 3) return false;
  if (!d.actions.every(a => a && typeof a.title === "string" && typeof a.why === "string" && VIEWS.includes(a.view))) return false;
  return numbersOk([d.headline, d.summary, ...d.actions.flatMap(a => [a.title, a.why])].join(" "), allowed);
}

async function generate(c, now = Date.now()) {
  const { weekEnding, facts, records } = compute(c, now), allowed = allowedNumbers(facts);
  const r = await ai.askJson({
    tier: "quick", maxTokens: 700,
    validate: d => shape(d, allowed),
    system: ai.rules(c) + "\nYou write a short Monday briefing for a pastor from counted facts. Use ONLY numbers that appear in the facts. Never invent a figure, a name, a date or an event. Do not guess about any person. Do not give advice about someone's spiritual state. Warm, plain, brief. Suggest exactly 3 actions, each tied to one fact, and set \"view\" to one of: " + VIEWS.join(", ") + ".\nReply with ONLY JSON: {\"headline\":string under 70 characters,\"summary\":string under 450 characters,\"actions\":[{\"title\":string under 70 characters,\"why\":string under 160 characters,\"view\":string}]}",
    user: "Counted facts for the last 7 days (week ending " + weekEnding + "). Questions are already cleaned of personal details.\n<data>\n" + JSON.stringify(facts) + "\n</data>",
    fallback: () => fallback(facts)
  });
  const d = shape(r.data, allowed) ? r.data : fallback(facts);
  const brief = {
    id: "b" + c.nextId++, at: new Date(now).toISOString(), weekEnding, facts,
    headline: String(d.headline).slice(0, 90), summary: String(d.summary).slice(0, 600),
    actions: d.actions.slice(0, 3).map(a => ({ title: String(a.title).slice(0, 90), why: String(a.why).slice(0, 200), view: a.view })),
    live: !!r.live, via: r.live ? ai.via(r) : "rule-based fallback"
  };
  c.briefs = c.briefs || []; c.briefs.unshift(brief); c.briefs.length = Math.min(c.briefs.length, 8);
  return { brief, records };
}

// A plain-text version the pastor can paste into an email to their team. Built from the brief and counts only.
function email(c, b) {
  const w = b.facts.week, line = (k) => { const x = w[k]; const d = x.change === 0 ? "same as the week before" : (x.change > 0 ? "up " : "down ") + Math.abs(x.change) + " from " + x.prev; return "  " + x.n + " " + label[k] + " (" + d + ")"; };
  return ["Subject: Monday Brief for " + c.name + " (week ending " + b.weekEnding + ")", "", b.headline, "", b.summary, "", "This week", ...Object.keys(label).map(line), "",
    "Waiting on a person", "  " + b.facts.drafts.waitingForApproval + " draft(s) to approve, " + b.facts.care.open + " open care request(s), " + b.facts.visitors.newToWelcome + " visitor(s) to welcome", "",
    "Three things to do", ...b.actions.map((a, i) => "  " + (i + 1) + ". " + a.title + ": " + a.why), "", "Counted from your own records. Written by " + b.via + ". A person decides what to do."].join("\n");
}

module.exports = { compute, generate, email, fallback, allowedNumbers, numbersOk, VIEWS };
