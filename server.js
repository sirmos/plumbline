"use strict";
// Plumb Line server. No dependencies. Node 18+.
const http = require("http"), fs = require("fs"), path = require("path"), dns = require("dns").promises, net = require("net"), crypto = require("crypto");
const store = require("./lib/store"), ai = require("./lib/ai"), pulpit = require("./lib/pulpit"), { newChurch } = require("./lib/seed");

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, "public");
const ALLOW_SIGNUP = process.env.ALLOW_SIGNUP !== "false";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

/* ---------- small helpers ---------- */
const hits = new Map();
function limited(key, max, windowMs) {
  const n = Date.now(), h = hits.get(key);
  if (!h || h.reset < n) { hits.set(key, { c: 1, reset: n + windowMs }); return false; }
  return ++h.c > max;
}
setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (v.reset < n) hits.delete(k); }, 60000).unref();
const ip = (req) => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
function send(res, code, obj, extra) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...(code === 413 ? { connection: "close" } : {}), ...(extra || {}) });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((ok, no) => {
    let n = 0; const parts = [];
    let over = false;
    req.on("data", d => { if (over) return; n += d.length; if (n > 200000) { over = true; parts.length = 0; no(Object.assign(new Error("Request is too large."), { code: 413 })); req.resume(); } else parts.push(d); });
    req.on("end", () => { if (over) return; try { ok(parts.length ? JSON.parse(Buffer.concat(parts).toString()) : {}); } catch (e) { no(Object.assign(new Error("bad json"), { code: 400 })); } });
    req.on("error", no);
  });
}
function readRaw(req, max) {
  return new Promise((ok, no) => {
    let n = 0, over = false; const parts = [];
    req.on("data", d => { if (over) return; n += d.length; if (n > max) { over = true; parts.length = 0; no(Object.assign(new Error("Audio chunk is too large."), { code: 413 })); req.resume(); } else parts.push(d); });
    req.on("end", () => { if (!over) ok(Buffer.concat(parts)); });
    req.on("error", no);
  });
}
const str = (v, max) => String(v == null ? "" : v).slice(0, max);
const now = () => new Date().toISOString();

const LANGS = ["English", "Spanish", "French", "Portuguese", "Yoruba", "Igbo", "Hausa", "Nigerian Pidgin", "Swahili", "Arabic", "Chinese", "Hindi"];
const INTERESTS = ["Kids", "Teens", "Music", "Bible study", "Serving", "Support", "Just looking"];
const VSTATUS = ["new", "contacted", "returned", "connected", "closed"], CSTATUS = ["new", "inprogress", "done"], CKINDS = ["meal", "ride", "visit", "errand", "other"];
const today = () => new Date().toISOString().slice(0, 10);
function bump(c, k) { // daily counters power the activity chart. They hold numbers only, never content.
  const d = today(), e = c.daily[d] || (c.daily[d] = { q: 0, p: 0, v: 0, c: 0, g: 0 });
  e[k] = (e[k] || 0) + 1;
  const ks = Object.keys(c.daily).sort(); while (ks.length > 60) delete c.daily[ks.shift()];
}
function privateIp(a) {
  if (net.isIPv4(a)) { const [x, y] = a.split(".").map(Number); return x === 10 || x === 127 || x === 0 || (x === 169 && y === 254) || (x === 192 && y === 168) || (x === 172 && y >= 16 && y <= 31) || (x === 100 && y >= 64 && y <= 127); }
  const l = a.toLowerCase(); if (l.startsWith("::ffff:")) return privateIp(l.slice(7));
  return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe8") || l.startsWith("fe9") || l.startsWith("fea") || l.startsWith("feb");
}
// Pushes a short, content-free alert to the pastor's own Slack/Discord/Zapier URL. https only, no private addresses.
async function notify(c, text) {
  const u = c.alertWebhook; if (!u) return { ok: false, why: "No alert address saved." };
  try {
    const url = new URL(u); if (url.protocol !== "https:") return { ok: false, why: "Address must start with https://" };
    const addrs = await dns.lookup(url.hostname, { all: true });
    if (!addrs.length || addrs.some(a => privateIp(a.address))) return { ok: false, why: "That address is not allowed." };
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
    const msg = c.name + ": " + text;
    const r = await fetch(u, { method: "POST", signal: ctl.signal, redirect: "error", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: msg, content: msg }) });
    clearTimeout(t);
    return r.ok ? { ok: true } : { ok: false, why: "The address answered with an error (" + r.status + ")." };
  } catch (e) { return { ok: false, why: "Could not reach that address." }; }
}
function logit(c, agent, what, mode, item) {
  c.log.unshift({ id: c.nextId++, at: now(), agent, what, mode, item: item || null, decision: item ? "awaiting pastor" : "n/a (read-only answer)" });
  c.log.length = Math.min(c.log.length, 300);
}
function enqueue(c, o) {
  const id = c.nextId++;
  c.queue.unshift({ id, status: "pending", at: now(), ...o });
  logit(c, o.agent, o.title, o.live ? (o.via || "AI") : "rule-based fallback", id);
  c.queue.length = Math.min(c.queue.length, 300);
  return id;
}

/* ---------- public API (called from church websites) ---------- */
function corsFor(c, req) {
  const origin = req.headers.origin;
  if (!c.origins.length) return { "access-control-allow-origin": "*", vary: "Origin" };
  if (origin && c.origins.includes(origin)) return { "access-control-allow-origin": origin, vary: "Origin" };
  return null;
}
async function publicApi(req, res, parts) {
  const c = store.get(parts[2]);
  if (!c) return send(res, 404, { error: "Unknown church" });
  const cors = corsFor(c, req);
  const base = { "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "600" };
  const liveView = parts[3] === "live" && req.method === "GET" && !req.headers.origin; // the viewer page is served from this server, so it sends no Origin
  if (!cors && !liveView) return send(res, 403, { error: "This site is not allowed to use this church's widget." });
  const H = { ...base, ...(cors || {}) };
  if (req.method === "OPTIONS") { res.writeHead(204, H); return res.end(); }
  const what = parts[3];

  if (what === "config" && req.method === "GET") {
    return send(res, 200, {
      name: c.name, pastor: c.pastor, color: c.color, contact: c.contact || "",
      journey: c.published ? { title: c.published.title, days: c.published.days, approvedAt: c.published.approvedAt, approvedBy: c.pastor } : null,
      suggestions: c.faq.slice(0, 4).map(f => f.q),
      partnerCities: c.partners.map(p => p.city),
      features: { guide: c.features.guide, week: c.features.week, visit: c.features.visit, prayer: c.features.prayer, care: c.features.care,
        groups: c.features.groups && c.groups.some(g => g.open), moving: c.features.moving && c.partners.length > 0 },
      live: (() => { const l = c.features.live && pulpit.activeFor(c.id); return l ? { sid: l.id, title: l.title } : null; })(),
      languages: LANGS, interests: INTERESTS,
      disclosure: c.rules.disclose ? "Answers are written by AI from information " + c.name + " has confirmed. A person reviews anything sent to you." : ""
    }, H);
  }
  if (what === "live" && req.method === "GET") {
    if (!c.features.live) return send(res, 404, { error: "Live captions are switched off for this church." }, H);
    if (limited("live:" + ip(req), 150, 60000)) return send(res, 429, { error: "Too many requests." }, H);
    if (!parts[4]) { const l = pulpit.activeFor(c.id); return send(res, 200, { church: c.name, color: c.color, active: !!l, sid: l ? l.id : null, title: l ? l.title : "", source: l ? l.lang : "", languages: LANGS, aiLive: ai.live() }, H); }
    const l = pulpit.get(parts[4]);
    if (!l || l.churchId !== c.id) return send(res, 404, { error: "That service was not found." }, H);
    const q = new URL(req.url, "http://x").searchParams;
    return send(res, 200, pulpit.poll(l, Math.max(0, Number(q.get("since")) || 0), q.get("lang") || ""), H);
  }
  if (req.method !== "POST") return send(res, 404, { error: "Not found" }, H);
  let b;
  try { b = await readBody(req); } catch (e) { return send(res, e.code || 400, { error: e.message }, H); }

  if (what === "ask") {
    if (limited("ask:" + ip(req), 30, 60000)) return send(res, 429, { error: "Too many questions. Please wait a minute." }, H);
    const msgs = (Array.isArray(b.messages) ? b.messages : []).slice(-6).map(m => ({ r: m.role === "assistant" ? "Guide" : "Visitor", t: str(m.text, 400) })).filter(m => m.t);
    const last = msgs.filter(m => m.r === "Visitor").pop();
    if (!last) return send(res, 400, { error: "Ask a question first." }, H);
    const info = c.faq.map(f => `[${f.id}] ${f.q}: ${f.a}`).join("\n");
    const lang = LANGS.includes(b.lang) ? b.lang : "English";
    const r = await ai.askJson({
      tier: "quick", maxTokens: 700,
      validate: d => d && typeof d.answer === "string" && d.answer.trim().length > 0,
      cacheKey: msgs.length === 1 ? JSON.stringify([c.id, lang, last.t.toLowerCase().trim(), c.faq, c.doctrine, c.rules]) : null,
      system: ai.rules(c) + "\nReply in " + lang + ". Keep times, addresses and names exactly as written in the approved information.\nYou are the welcome guide. Answer ONLY from the approved information. If it is not covered, set needs_human true and say a real person can help. Never guess times, places or policies. Do not pressure the visitor.\nReply with ONLY JSON: {\"answer\":string under 70 words,\"sources\":[ids],\"needs_human\":boolean}",
      user: "Approved information:\n" + info + "\n\nConversation:\n<data>\n" + msgs.map(m => m.r + ": " + m.t).join("\n") + "\n</data>",
      fallback: () => ai.faqFallback(last.t, c.faq)
    });
    const d = r.data || {};
    const out = { answer: str(d.answer, 600) || ai.faqFallback(last.t, c.faq).answer, sources: (Array.isArray(d.sources) ? d.sources : []).filter(i => c.faq.some(f => f.id === i)), needsHuman: !!d.needs_human };
    c.stats.questions++; bump(c, "q");
    if (out.needsHuman) {
      c.stats.unanswered++;
      const q = ai.scrub(last.t), e = c.friction.find(x => x.q.toLowerCase() === q.toLowerCase());
      if (e) e.n++; else c.friction.unshift({ q, n: 1 });
      c.friction.length = Math.min(c.friction.length, 100);
    }
    store.put(c);
    return send(res, 200, { ...out, sourceTitles: out.sources.map(i => c.faq.find(f => f.id === i).q) }, H);
  }

  if (what === "prayer") {
    if (limited("prayer:" + ip(req), 8, 60000)) return send(res, 429, { error: "Please wait a minute." }, H);
    const text = str(b.text, 1500).trim();
    if (!text) return send(res, 400, { error: "Write a request first." }, H);
    if (c.rules.crisis && ai.CRISIS.test(text)) {
      c.stats.crisis++; bump(c, "c");
      notify(c, "URGENT: a member may need personal care. Open your Plumb Line review queue now. Details are not sent here.");
      enqueue(c, { type: "urgent", agent: "Safety rule", title: "A member may need urgent personal care", urgent: true, score: 0, live: false,
        body: "A prayer request contained language about harm or safety. The text is not stored or shown here. Please reach out to your members personally and promptly.",
        flags: ["Flagged by a fixed rule, not by AI. A person must respond. Do not rely on an automated reply."] });
      store.put(c);
      return send(res, 200, { crisis: true }, H);
    }
    const r = await ai.askJson({
      tier: "quick", maxTokens: 300,
      validate: d => d && typeof d.checkin === "string" && typeof d.theme === "string",
      system: ai.rules(c) + "\nClassify one private prayer request and draft a short check-in note a human prayer partner could send. Do NOT repeat any specific details from the request in the note. Never diagnose, give medical advice or promise outcomes.\nReply with ONLY JSON: {\"theme\": one of " + JSON.stringify(ai.THEMES) + ",\"checkin\":string under 40 words}",
      user: "<data>\n" + text + "\n</data>",
      fallback: () => ({ theme: ai.themeFallback(text), checkin: "Hi, I have been praying for you this week. How are you doing? I would love to hear how things are going, and to keep praying with you." })
    });
    const d = r.data || {}, theme = ai.THEMES.includes(d.theme) ? d.theme : ai.themeFallback(text);
    c.themeCounts[theme] = (c.themeCounts[theme] || 0) + 1; c.stats.prayers++; bump(c, "p");
    // The prayer text itself is never stored. Only the theme count and, if asked, a generic check-in draft.
    if (b.follow) {
      const note = str(d.checkin, 400), lf = ai.lint(c, note);
      enqueue(c, { type: "checkin", agent: "Prayer Loop", title: `Check-in note for a "${theme}" prayer`, body: note, flags: lf, score: ai.clamp(96 - 14 * lf.length, 0, 100), live: r.live, via: r.via });
    } else logit(c, "Prayer Loop", "Prayer themed, no follow-up requested", ai.via(r));
    store.put(c);
    return send(res, 200, { theme, follow: !!b.follow }, H);
  }

  if (what === "move") {
    if (limited("move:" + ip(req), 5, 60000)) return send(res, 429, { error: "Please wait a minute." }, H);
    if (b.consent !== true) return send(res, 400, { error: "Consent is required before anything is shared." }, H);
    const m = { name: str(b.name, 40).trim(), city: str(b.city, 80).trim(), kids: !!b.kids, lang: str(b.lang, 20), style: str(b.style, 20) };
    if (!m.city) return send(res, 400, { error: "Tell us the city you are moving to." }, H);
    const cl = m.city.toLowerCase();
    const scored = c.partners.map(p => {
      let s = 0; const pc = p.city.toLowerCase();
      if (pc.includes(cl) || cl.includes(pc.split(",")[0])) s += 5;
      if (m.kids && p.kids) s += 2; if (m.lang && p.langs.some(l => l.toLowerCase() === m.lang.toLowerCase())) s += 2; if (m.style && p.style === m.style) s += 1;
      return { p, s };
    }).filter(x => x.s >= 5).sort((a, b) => b.s - a.s);
    if (!scored.length) { c.stats.moves++; store.put(c); return send(res, 200, { matched: false }, H); }
    const top = scored[0].p;
    const wants = [m.kids ? "children's ministry" : "", m.lang ? m.lang + "-language community" : "", m.style ? m.style + " worship" : ""].filter(Boolean).join(", ") || "a welcoming community";
    const r = await ai.askJson({
      tier: "default", maxTokens: 500,
      validate: d => d && typeof d.letter === "string" && d.letter.trim().length > 40,
      system: ai.rules(c) + "\nWrite a short letter of commendation (under 130 words) from " + c.pastor + " to the welcome team at " + top.name + " introducing a member. Include only what the member consented to share. Include no private, pastoral or financial details.\nReply with ONLY JSON: {\"letter\":string}",
      user: "<data>\nMember first name: " + (m.name || "our friend") + "\nMoving to: " + m.city + "\nThey value: " + wants + "\n</data>",
      fallback: () => ai.letterFallback(c, m, top)
    });
    const letter = str((r.data || {}).letter, 1500), lf = ai.lint(c, letter);
    c.stats.moves++;
    enqueue(c, { type: "letter", agent: "Sending Letter", title: `Commendation for ${m.name || "a member"} to ${top.name}`, body: letter, flags: lf, score: ai.clamp(96 - 14 * lf.length, 0, 100), live: r.live, via: r.via, meta: { church: top.name } });
    store.put(c);
    return send(res, 200, { matched: true, church: top.name, city: top.city, also: scored.slice(1, 3).map(x => x.p.name) }, H);
  }

  if (what === "groups") {
    if (limited("groups:" + ip(req), 20, 60000)) return send(res, 429, { error: "Please wait a minute." }, H);
    const open = c.groups.filter(g => g.open);
    if (!open.length) return send(res, 200, { matches: [] }, H);
    const text = str(b.text, 300).trim();
    let picks;
    if (!text) picks = open.slice(0, 6).map(g => ({ id: g.id, why: "" }));
    else {
      const r = await ai.askJson({
        tier: "quick", maxTokens: 500,
        validate: d => d && Array.isArray(d.matches),
        system: ai.rules(c) + "\nPick up to 3 small groups from the listings that fit what the person describes. Use only facts in the listings. Do not invent times or places. Give a one-sentence reason each.\nReply with ONLY JSON: {\"matches\":[{\"id\":string,\"why\":string}]}",
        user: "Listings:\n" + open.map(g => `[${g.id}] ${g.name} | ${g.day} ${g.time} | area: ${g.area} | stage: ${g.stage} | topic: ${g.topic} | ${g.desc}`).join("\n") + "\n\nWhat the person wrote:\n<data>\n" + text + "\n</data>",
        fallback: () => ({ matches: ai.groupsFallback(c.groups, text) })
      });
      picks = (Array.isArray((r.data || {}).matches) ? r.data.matches : []).filter(m => open.some(g => g.id === m.id)).slice(0, 3).map(m => ({ id: m.id, why: str(m.why, 220) }));
      if (!picks.length) picks = ai.groupsFallback(c.groups, text);
    }
    c.stats.groups++; bump(c, "g"); store.put(c); // the search text is never stored
    return send(res, 200, { matches: picks.map(p => { const g = open.find(x => x.id === p.id); return { id: g.id, name: g.name, day: g.day, time: g.time, area: g.area, stage: g.stage, desc: g.desc, why: p.why }; }) }, H);
  }

  if (what === "visit") {
    if (limited("visit:" + ip(req), 6, 60000)) return send(res, 429, { error: "Please wait a minute." }, H);
    const interests = (Array.isArray(b.interests) ? b.interests : []).filter(i => INTERESTS.includes(i)).slice(0, 7);
    const name = str(b.name, 40).trim(), contact = str(b.contact, 120).trim(), kids = str(b.kids, 60).trim();
    const pace = ["none", "second", "now"].includes(b.pace) ? b.pace : "second";
    if (contact && b.consent !== true) return send(res, 400, { error: "Please tick the box to let the church contact you." }, H);
    const steps = ai.nextSteps(c, interests);
    const open = c.groups.filter(g => g.open);
    const gm = open.length ? ai.groupsFallback(c.groups, interests.join(" ") + " " + kids) : [];
    const group = gm.length && interests.some(i => ["Bible study", "Support", "Serving", "Teens", "Kids"].includes(i)) ? open.find(g => g.id === gm[0].id) : null;
    c.stats.visits++; bump(c, "v");
    let followup = "none";
    if (contact) {
      const v = { id: "v" + c.nextId++, at: now(), name, contact, kids, interests, pace, status: pace === "none" ? "closed" : "new", group: group ? group.name : "" };
      c.visitors.unshift(v); c.visitors.length = Math.min(c.visitors.length, 500);
      if (pace === "none") { followup = "none"; logit(c, "First Visit", "Visitor left details, asked for no contact", "n/a"); }
      else {
        const r = await ai.askJson({
          tier: "quick", maxTokens: 400,
          validate: d => d && typeof d.message === "string" && d.message.trim().length > 20,
          system: ai.rules(c) + "\nWrite a short, warm follow-up message (under 70 words) from the church to a first-time visitor. Use only the facts given. Do not pressure, do not invent details about the visitor, and do not promise anything. Offer a real person if they have questions.\nReply with ONLY JSON: {\"message\":string}",
          user: "<data>\nFirst name: " + (name || "(none given)") + "\nInterested in: " + (interests.join(", ") || "not said") + "\nSuggested group: " + (group ? group.name + ", " + group.day + " " + group.time : "none") + "\nSigned by: " + c.pastor + ", " + c.name + "\n</data>",
          fallback: () => ai.followupFallback(c, v, group)
        });
        const msg = str((r.data || {}).message, 900) || ai.followupFallback(c, v, group).message, lf = ai.lint(c, msg);
        const flags = [...lf]; if (pace === "second") flags.unshift("The visitor asked to hear from the church after their second visit. Hold this until then.");
        enqueue(c, { type: "followup", agent: "First Visit", title: `Follow-up for ${name || "a visitor"}`, body: msg, flags, score: ai.clamp(96 - 14 * lf.length, 0, 100), live: r.live, via: r.via, meta: { visitor: v.id, pace } });
        followup = pace;
      }
    }
    store.put(c);
    return send(res, 200, { steps, groups: group ? [{ name: group.name, day: group.day, time: group.time, area: group.area }] : [], followup }, H);
  }

  if (what === "care") {
    if (limited("care:" + ip(req), 4, 60000)) return send(res, 429, { error: "Please wait a minute." }, H);
    if (b.consent !== true) return send(res, 400, { error: "Please tick the box so we may share this with our care team." }, H);
    const kind = CKINDS.includes(b.kind) ? b.kind : "other", text = ai.scrub(str(b.text, 500).trim(), 400), name = str(b.name, 40).trim(), contact = str(b.contact, 120).trim();
    if (!text || !contact) return send(res, 400, { error: "Tell us what would help and how to reach you." }, H);
    if (c.rules.crisis && ai.CRISIS.test(b.text || "")) {
      c.stats.crisis++; bump(c, "c");
      notify(c, "URGENT: a member may need personal care. Open your Plumb Line review queue now. Details are not sent here.");
      enqueue(c, { type: "urgent", agent: "Safety rule", title: "A member may need urgent personal care", urgent: true, score: 0, live: false,
        body: "A care request contained language about harm or safety. The text is not stored here. Please contact the person directly: " + (contact || "no contact given") + ".", flags: ["Flagged by a fixed rule, not by AI. A person must respond."] });
      store.put(c); return send(res, 200, { crisis: true }, H);
    }
    const r = await ai.askJson({
      tier: "quick", maxTokens: 400,
      validate: d => d && Array.isArray(d.tasks) && d.tasks.length > 0,
      system: ai.rules(c) + "\nA church member asked for practical help. Suggest 3 to 5 short task steps a care team could follow. Practical steps only. Do not diagnose, give medical or legal advice, or promise outcomes.\nReply with ONLY JSON: {\"tasks\":[string]}",
      user: "<data>\nKind: " + kind + "\nRequest: " + text + "\n</data>", fallback: () => ai.careFallback(kind)
    });
    const tasks = (Array.isArray((r.data || {}).tasks) ? r.data.tasks : ai.careFallback(kind).tasks).slice(0, 5).map(t => ({ t: str(t, 160), done: false })).filter(t => t.t);
    c.care.unshift({ id: "c" + c.nextId++, at: now(), kind, name, contact, text, tasks, status: "new", assignee: "", live: r.live, via: r.via });
    c.care.length = Math.min(c.care.length, 300);
    c.stats.care++; bump(c, "h"); logit(c, "Care board", "New " + kind + " request", ai.via(r));
    notify(c, "New care request on your care board (" + kind + ").");
    store.put(c); return send(res, 200, { ok: true }, H);
  }
  return send(res, 404, { error: "Not found" }, H);
}

/* ---------- admin API (pastor) ---------- */
function clean(c) {
  const { salt, passHash, ...rest } = c;
  rest.pulpit = { services: ((c.pulpit && c.pulpit.services) || []).map(({ lines, ...m }) => ({ ...m, count: lines.length })) }; // transcripts are fetched on demand
  return rest;
}
function auth(req) {
  const h = String(req.headers.authorization || "");
  const d = h.startsWith("Bearer ") ? store.verify(h.slice(7)) : null;
  return d ? store.get(d.id) : null;
}
function sanitizeSettings(c, b) {
  if (typeof b.name === "string" && b.name.trim()) c.name = str(b.name, 80).trim();
  if (typeof b.pastor === "string" && b.pastor.trim()) c.pastor = str(b.pastor, 60).trim();
  if (typeof b.contact === "string") c.contact = str(b.contact, 240).trim();
  if (typeof b.color === "string" && /^#[0-9a-fA-F]{6}$/.test(b.color)) c.color = b.color;
  if (typeof b.doctrine === "string") c.doctrine = str(b.doctrine, 4000);
  if (b.rules && typeof b.rules === "object") for (const k of ["noQuote", "noPromise", "crisis", "disclose"]) if (k in b.rules) c.rules[k] = !!b.rules[k];
  if (typeof b.alertWebhook === "string") { const u = b.alertWebhook.trim(); c.alertWebhook = /^https:\/\/[^\s]{4,300}$/.test(u) ? u : ""; }
  if (b.features && typeof b.features === "object") for (const k of Object.keys(c.features)) if (k in b.features) c.features[k] = !!b.features[k];
  if (Array.isArray(b.groups)) c.groups = b.groups.slice(0, 60).map((g, i) => ({
    id: "g" + (i + 1), name: str(g.name, 80).trim(), day: str(g.day, 30).trim(), time: str(g.time, 30).trim(), area: str(g.area, 60).trim(),
    stage: str(g.stage, 60).trim(), topic: str(g.topic, 60).trim(), desc: str(g.desc, 240).trim(), open: g.open !== false
  })).filter(g => g.name);
  if (Array.isArray(b.faq)) c.faq = b.faq.slice(0, 40).map((f, i) => ({ id: "f" + (i + 1), q: str(f.q, 120).trim(), a: str(f.a, 700).trim() })).filter(f => f.q && f.a);
  if (Array.isArray(b.faq)) c.friction = c.friction.filter(f => !c.faq.some(x => x.q.toLowerCase() === f.q.toLowerCase())); // answered gaps disappear
  if (Array.isArray(b.partners)) c.partners = b.partners.slice(0, 60).map((p, i) => ({
    id: "p" + (i + 1), name: str(p.name, 80).trim(), city: str(p.city, 80).trim(), style: ["Contemporary", "Blended", "Traditional"].includes(p.style) ? p.style : "Blended",
    kids: !!p.kids, langs: (Array.isArray(p.langs) ? p.langs : String(p.langs || "English").split(",")).map(l => str(l, 20).trim()).filter(Boolean).slice(0, 6), note: str(p.note, 160)
  })).filter(p => p.name && p.city);
  if (Array.isArray(b.origins)) c.origins = b.origins.map(o => str(o, 200).trim().replace(/\/+$/, "")).filter(o => /^https?:\/\/[^\s/]+$/.test(o)).slice(0, 20);
}
async function adminApi(req, res, parts) {
  const what = parts[2];
  let b = {};
  if (req.method !== "GET") { try { b = await readBody(req); } catch (e) { return send(res, e.code || 400, { error: e.message }); } }

  if (what === "signup" && req.method === "POST") {
    if (!ALLOW_SIGNUP) return send(res, 403, { error: "Sign-up is closed on this server." });
    if (limited("signup:" + ip(req), 5, 3600000)) return send(res, 429, { error: "Too many sign-ups from this address. Try again later." });
    const name = str(b.name, 80).trim(), pass = str(b.pass, 200);
    if (name.length < 2) return send(res, 400, { error: "Enter your church's name." });
    if (pass.length < 8) return send(res, 400, { error: "Use a passcode of at least 8 characters." });
    const c = newChurch(name, pass); store.put(c);
    return send(res, 200, { id: c.id, token: store.sign({ id: c.id, exp: Date.now() + 12 * 3600000 }) });
  }
  if (what === "login" && req.method === "POST") {
    if (limited("login:" + ip(req), 10, 600000)) return send(res, 429, { error: "Too many attempts. Wait ten minutes." });
    const c = store.get(str(b.id, 60).toLowerCase().trim());
    if (!c || !store.checkPass(c, str(b.pass, 200))) return send(res, 401, { error: "Church ID or passcode is wrong." });
    return send(res, 200, { id: c.id, token: store.sign({ id: c.id, exp: Date.now() + 12 * 3600000 }) });
  }

  const c = auth(req);
  if (!c) return send(res, 401, { error: "Please sign in again." });

  if (what === "state" && req.method === "GET") return send(res, 200, { church: clean(c), aiLive: ai.live(), aiStatus: ai.status() });

  if (what === "pulpit") {
    const sub = parts[3] || "", mine = (id) => { const l = pulpit.get(String(id || "")); return l && l.churchId === c.id && !l.ended ? l : null; };
    const info = (l) => l && { sid: l.id, title: l.title, lang: l.lang, at: l.at, lines: l.lines.length, viewers: pulpit.viewerCounts(l), stats: l.stats,
      recent: l.lines.slice(-8).map(x => ({ n: x.n, o: x.o, langs: Object.keys(x.tr), how: x.how })) };
    if (sub === "" && req.method === "GET") return send(res, 200, { active: info(pulpit.activeFor(c.id)), stt: ai.sttStatus(), sttLive: ai.sttLive(), aiLive: ai.live(), languages: LANGS, enabled: c.features.live });
    if (sub === "start" && req.method === "POST") {
      if (limited("pstart:" + c.id, 20, 3600000)) return send(res, 429, { error: "Too many services started this hour." });
      const l = pulpit.start(c, { title: b.title, lang: b.lang }); store.put(c);
      return send(res, 200, { sid: l.id, active: info(l) });
    }
    if (sub === "line" && req.method === "POST") {
      const l = mine(b.sid); if (!l) return send(res, 404, { error: "No live service is running." });
      if (limited("pline:" + c.id, 90, 60000)) return send(res, 429, { error: "Slow down a little." });
      const x = pulpit.addLine(l, str(b.text, 1200), "typed"); if (!x) return send(res, 400, { error: "Type some text first." });
      return send(res, 200, { ok: true, n: x.n });
    }
    if (sub === "end" && req.method === "POST") {
      const l = mine(b.sid); if (!l) return send(res, 404, { error: "No live service is running." });
      pulpit.end(c, l.id); store.put(c); return send(res, 200, { ok: true, lines: l.lines.length });
    }
    if (sub === "transcript" && req.method === "GET") {
      const id = new URL(req.url, "http://x").searchParams.get("id"), sv = ((c.pulpit && c.pulpit.services) || []).find(x => x.id === id);
      return sv ? send(res, 200, { title: sv.title, at: sv.at, text: sv.lines.join("\n") }) : send(res, 404, { error: "Service not found." });
    }
    return send(res, 404, { error: "Not found" });
  }

  if (what === "settings" && req.method === "PUT") { sanitizeSettings(c, b); store.put(c); return send(res, 200, { church: clean(c) }); }

  if (what === "sermon" && req.method === "POST") {
    if (limited("sermon:" + c.id, 12, 3600000)) return send(res, 429, { error: "Hourly limit reached for drafts." });
    const paras = str(b.text, 14000).split(/\n\s*\n/).map(s => s.trim()).filter(Boolean).slice(0, 40);
    if (paras.length < 2) return send(res, 400, { error: "Paste a sermon of at least two paragraphs." });
    const r = await ai.askJson({
      tier: "default", maxTokens: 2500, sensitivity: "public",
      validate: d => d && Array.isArray(d.days) && d.days.length >= 3 && d.days.every(x => x && typeof x.question === "string"),
      system: ai.rules(c) + "\nYou turn a pastor's own sermon into a five-day discipleship journey. Passages are references only. Each day must rest on at least one numbered sermon paragraph. In \"drift\" list anything you added that the sermon does not support or that could conflict with the doctrine. Be strict and honest about alignment.\nReply with ONLY JSON: {\"title\":string,\"alignment\":0-100,\"days\":[{\"day\":1,\"passage\":\"Book 1:1-5\",\"theme\":string,\"question\":string,\"action\":string,\"source\":[paragraph numbers]}],\"drift\":[{\"day\":number,\"issue\":string}]} with exactly 5 days.",
      user: "Sermon, numbered paragraphs:\n<data>\n" + paras.map((p, i) => `[${i + 1}] ${p}`).join("\n") + "\n</data>",
      fallback: () => ai.journeyFallback(paras)
    });
    const d = r.data || {};
    const days = (Array.isArray(d.days) ? d.days : []).slice(0, 5).map((x, i) => ({
      day: i + 1, passage: str(x.passage, 80), theme: str(x.theme, 120), question: str(x.question, 400), action: str(x.action, 300),
      source: (Array.isArray(x.source) ? x.source : []).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= paras.length)
    }));
    if (!days.length) return send(res, 502, { error: "The draft came back unusable. Try again." });
    const drift = (Array.isArray(d.drift) ? d.drift : []).slice(0, 12).map(x => (Number(x.day) >= 1 ? `Day ${Number(x.day)}: ` : "") + str(x.issue, 300));
    const unsourced = days.filter(x => !x.source.length).map(x => `Day ${x.day} cites no sermon paragraph. Check it.`);
    const lf = ai.lint(c, JSON.stringify(days));
    const score = ai.clamp(Math.round(Number(d.alignment) || 70) - 8 * lf.length - 4 * drift.length - 6 * unsourced.length, 0, 100);
    const id = enqueue(c, { type: "sermon", agent: "Sermon to week", title: str(d.title, 120) || "Five-day journey", payload: { title: str(d.title, 120), days, paragraphs: paras }, flags: [...drift, ...unsourced, ...lf], score, live: r.live, via: r.via });
    store.put(c);
    return send(res, 200, { id });
  }

  if (what === "queue" && parts[3]) {
    const q = c.queue.find(x => x.id === Number(parts[3]));
    if (!q) return send(res, 404, { error: "Not found" });
    if (req.method === "PATCH" && q.status === "pending" && typeof b.body === "string" && q.type !== "sermon") { q.body = str(b.body, 2000); store.put(c); return send(res, 200, { ok: true }); }
    if (req.method === "POST" && (parts[4] === "approve" || parts[4] === "reject") && q.status === "pending") {
      q.status = parts[4] === "approve" ? "approved" : "rejected";
      const lg = c.log.find(l => l.item === q.id);
      if (lg) lg.decision = (q.status === "approved" ? "approved by " : "rejected by ") + c.pastor + " at " + now();
      if (q.type === "followup" && q.meta) { const v = c.visitors.find(x => x.id === q.meta.visitor); if (v && v.status === "new" && q.status === "approved") v.status = "contacted"; }
      if (q.status === "approved" && q.type === "sermon") c.published = { title: q.payload.title, days: q.payload.days, approvedAt: now() };
      store.put(c);
      return send(res, 200, { ok: true, status: q.status });
    }
    return send(res, 400, { error: "That action is not available." });
  }

  if (what === "visitors" && parts[3]) {
    const i = c.visitors.findIndex(x => x.id === parts[3]); if (i < 0) return send(res, 404, { error: "Not found" });
    if (req.method === "PATCH" && VSTATUS.includes(b.status)) { c.visitors[i].status = b.status; store.put(c); return send(res, 200, { ok: true }); }
    if (req.method === "DELETE") { // erase a person completely, including drafts that mention them
      const id = c.visitors[i].id; c.visitors.splice(i, 1);
      const gone = new Set(c.queue.filter(q => q.meta && q.meta.visitor === id).map(q => q.id));
      c.queue = c.queue.filter(q => !gone.has(q.id)); c.log = c.log.filter(l => !gone.has(l.item));
      store.put(c); return send(res, 200, { ok: true });
    }
    return send(res, 400, { error: "That action is not available." });
  }
  if (what === "care" && parts[3]) {
    const x = c.care.find(k => k.id === parts[3]); if (!x) return send(res, 404, { error: "Not found" });
    if (req.method === "PATCH") {
      if (CSTATUS.includes(b.status)) x.status = b.status;
      if (typeof b.assignee === "string") x.assignee = str(b.assignee, 60);
      if (Array.isArray(b.tasks)) x.tasks = b.tasks.slice(0, 8).map(t => ({ t: str(t.t, 160), done: !!t.done })).filter(t => t.t);
      store.put(c); return send(res, 200, { ok: true });
    }
    if (req.method === "DELETE") { c.care = c.care.filter(k => k.id !== x.id); store.put(c); return send(res, 200, { ok: true }); }
    return send(res, 400, { error: "That action is not available." });
  }
  if (what === "friction" && req.method === "POST") { const i = Number(b.i); if (Number.isInteger(i) && c.friction[i]) { c.friction.splice(i, 1); store.put(c); } return send(res, 200, { ok: true }); }
  if (what === "ai-test" && req.method === "POST") {
    if (limited("aitest:" + c.id, 6, 3600000)) return send(res, 429, { error: "Test limit reached. Try again in an hour." });
    return send(res, 200, { results: await ai.probe(), aiStatus: ai.status() });
  }
  if (what === "alert-test" && req.method === "POST") {
    if (limited("alert:" + c.id, 6, 3600000)) return send(res, 429, { error: "Test limit reached. Try again later." });
    const r = await notify(c, "Test alert. If you can read this, urgent alerts will reach you here."); return send(res, r.ok ? 200 : 400, r.ok ? { ok: true } : { error: r.why });
  }
  return send(res, 404, { error: "Not found" });
}

/* ---------- static files and routing ---------- */
function serveStatic(req, res, p) {
  if (p === "/" || p === "/admin") p = "/admin.html";
  if (p === "/demo") p = "/demo.html";
  if (p === "/live") p = "/live.html";
  const f = path.normalize(path.join(PUB, p));
  if (!f.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("Not found"); }
    const h = { "content-type": TYPES[path.extname(f)] || "application/octet-stream", "x-content-type-options": "nosniff" };
    if (f.endsWith("widget.js")) { h["access-control-allow-origin"] = "*"; h["cache-control"] = "public, max-age=300"; }
    else if (f.endsWith(".html")) { h["x-frame-options"] = "DENY"; h["referrer-policy"] = "no-referrer"; }
    res.writeHead(200, h); res.end(buf);
  });
}
pulpit.setAutoEnd(s => { const c = store.get(s.churchId); pulpit.end(c, s.id); if (c) store.put(c); });
// One audio chunk (a few seconds) from the pastor's browser. Binary body, so it does not go through the JSON reader.
async function pulpitAudio(req, res, url) {
  const c = auth(req); if (!c) return send(res, 401, { error: "Please sign in again." });
  const l = pulpit.get(url.searchParams.get("sid") || "");
  if (!l || l.churchId !== c.id || l.ended) { req.resume(); return send(res, 404, { error: "No live service is running." }); }
  if (limited("paud:" + c.id, 40, 60000)) { req.resume(); return send(res, 429, { error: "Too many audio chunks." }); }
  let buf; try { buf = await readRaw(req, 1500000); } catch (e) { return send(res, e.code || 400, { error: e.message }); }
  if (!ai.sttLive()) return send(res, 503, { error: "No speech provider is set up on this server. Add GROQ_API_KEY, or type captions instead.", code: "no_stt" });
  l.touched = Date.now(); l.stats.chunks++;
  if (buf.length < 1500) { l.stats.silent++; return send(res, 200, { ok: true, text: "" }); }
  const prompt = l.lines.slice(-2).map(x => x.o).join(" ").slice(-160);
  const r = await ai.transcribe(buf, { mime: req.headers["content-type"], language: pulpit.ISO[l.lang], prompt });
  if (!r.ok) { l.stats.failed++; return send(res, 200, { ok: false, why: r.why, tried: r.tried }); }
  if (!r.text) { l.stats.silent++; return send(res, 200, { ok: true, text: "" }); }
  const x = pulpit.addLine(l, r.text, "voice");
  return send(res, 200, { ok: true, text: r.text, n: x ? x.n : 0, via: r.via });
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x"), parts = url.pathname.split("/").filter(Boolean);
    if (req.method === "POST" && parts[0] === "api" && parts[1] === "admin" && parts[2] === "pulpit" && parts[3] === "audio") return await pulpitAudio(req, res, url);
    if (parts[0] === "api" && parts[1] === "public" && parts[2]) return await publicApi(req, res, parts);
    if (parts[0] === "api" && parts[1] === "admin") return await adminApi(req, res, parts);
    if (parts[0] === "api") return send(res, 404, { error: "Not found" });
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
    return serveStatic(req, res, decodeURIComponent(url.pathname));
  } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, { error: "Something went wrong." }); else res.end(); }
});
if (require.main === module) server.listen(PORT, () => console.log(`Plumb Line on http://localhost:${PORT}  (AI: ${ai.live() ? ai.status().map(p => p.name).join(" > ") : "offline fallback"})`));
module.exports = server;
