"use strict";
// Live Pulpit end-to-end: browser audio -> speech-to-text -> translation -> viewers. Fake provider, no network.
// Run: node test/pulpit.js
const http = require("http"), os = require("os"), fs = require("fs"), path = require("path");
for (const k of Object.keys(process.env)) if (/_API_KEY$|_BASE$|^GITHUB_MODELS_TOKEN$|^AI_|^STT_|^DATA_DIR$/.test(k)) delete process.env[k];
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pulpit-"));
const ai = require("../lib/ai"), server = require("../server");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok   " + m); } else { fail++; console.log("  FAIL " + m); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Fake provider: Whisper route and chat route.
const fake = { stt: ["Welcome to church today.", "", "Thank you.", "Please open to John 3:16.", "God loves you."], sttN: 0, sttMode: "ok", chatMode: "ok", chatHits: 0, sttHits: 0, langsAsked: [] };
const prov = http.createServer((req, res) => {
  const chunks = []; req.on("data", d => chunks.push(d)); req.on("end", () => {
    const buf = Buffer.concat(chunks), json = (c, o) => { res.writeHead(c, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.url.endsWith("/audio/transcriptions")) {
      fake.sttHits++;
      if (!/multipart\/form-data/.test(req.headers["content-type"] || "") || !buf.includes("whisper")) return json(400, { error: "bad form" });
      if (fake.sttMode === "500") return json(500, { error: "down" });
      const t = fake.stt[fake.sttN++ % fake.stt.length];
      return json(200, { text: t, segments: t ? [{ text: t, no_speech_prob: 0.01, avg_logprob: -0.2 }] : [] });
    }
    if (req.url.endsWith("/chat/completions")) {
      fake.chatHits++;
      if (fake.chatMode === "500") return json(500, { error: "down" });
      const b = JSON.parse(buf.toString()), sys = b.messages[0].content, usr = b.messages[1].content;
      const m = sys.match(/(?:languages: |for: )([^\n]+)$/m), langs = m ? m[1].split(",").map(s => s.trim()) : [];
      fake.langsAsked.push(langs.join("+"));
      const data = (usr.match(/<data>\n([\s\S]*?)\n<\/data>/) || [, ""])[1];
      const lines = data.split("\n").map(l => l.replace(/^\d+\.\s/, ""));
      const single = /one key for each/.test(sys), tr = {};
      for (const l of langs) tr[l] = single ? "[" + l + "] " + lines[0] : lines.map(x => "[" + l + "] " + x);
      return json(200, { choices: [{ message: { content: JSON.stringify({ translations: tr }) } }] });
    }
    json(404, {});
  });
});

let base = "", tok = "", id = "";
const api = async (m, p, body, headers = {}) => { const r = await fetch(base + p, { method: m, headers: { ...(body && !(body instanceof Buffer) ? { "content-type": "application/json" } : {}), ...(tok ? { authorization: "Bearer " + tok } : {}), ...headers }, body: body ? (body instanceof Buffer ? body : JSON.stringify(body)) : undefined }); let j = {}; try { j = await r.json(); } catch (e) {} return { s: r.status, j }; };
const audio = (sid, n = 6000, mime = "audio/webm;codecs=opus") => api("POST", "/api/admin/pulpit/audio?sid=" + sid, Buffer.alloc(n, 1), { "content-type": mime });
const view = (sid, lang, since = 0, cid = id, extra = {}) => api("GET", `/api/public/${cid}/live/${sid}?since=${since}&lang=${encodeURIComponent(lang)}`, null, { authorization: "", ...extra });

async function main() {
  await new Promise(r => prov.listen(0, "127.0.0.1", r)); const PB = "http://127.0.0.1:" + prov.address().port;
  await new Promise(r => server.listen(0, "127.0.0.1", r)); base = "http://127.0.0.1:" + server.address().port;

  console.log("Setup");
  ai.configure({});
  let r = await api("POST", "/api/admin/signup", { name: "Grace Community Church", pass: "correct horse" }); tok = r.j.token; id = r.j.id;
  ok(!!id, "a church signs up");
  r = await api("POST", "/api/admin/pulpit/start", { title: "Sunday service", lang: "English" }); const sid = r.j.sid;
  ok(r.s === 200 && sid, "the pastor starts a live service");
  r = await api("GET", `/api/public/${id}/live`, null, { authorization: "" });
  ok(r.j.active === true && r.j.sid === sid && r.j.languages.length === 12, "visitors can see that a service is live and which 12 languages exist");
  r = await api("GET", `/api/public/${id}/config`, null, { authorization: "" }); ok(r.j.live && r.j.live.sid === sid, "the church widget learns a service is live");

  console.log("No speech provider configured");
  r = await audio(sid); ok(r.s === 503 && r.j.code === "no_stt", "audio is refused with a clear message when no speech provider exists");
  r = await api("POST", "/api/admin/pulpit/line", { sid, text: "Good morning everyone." }); ok(r.s === 200, "the pastor can type captions instead");
  r = await view(sid, "English"); ok(r.j.lines.length === 1 && r.j.lines[0].t === "Good morning everyone.", "typed captions reach viewers in the source language");

  console.log("Speech to text");
  ai.configure({ AI_PROVIDERS: "groq", GROQ_API_KEY: "k", GROQ_BASE: PB });
  ok(ai.sttLive(), "a Groq key turns speech-to-text on");
  r = await api("POST", "/api/admin/pulpit/audio?sid=" + sid, Buffer.alloc(6000, 1)); ok(r.s === 200 && r.j.text === "Welcome to church today.", "an audio chunk becomes a caption line");
  const small = await audio(sid, 400); ok(small.j.ok && small.j.text === "" && fake.sttHits === 1, "a tiny chunk is treated as silence without calling the provider");
  r = await audio(sid); ok(r.j.ok && r.j.text === "", "an empty transcription adds no line");
  r = await audio(sid); ok(r.j.ok && r.j.text === "", "a stock phantom phrase from silence (\"Thank you.\") is dropped");
  r = await audio(sid); ok(r.j.text === "Please open to John 3:16.", "real speech after silence comes through");
  r = await view(sid, "English", 0); ok(r.j.lines.map(l => l.o).join("|") === "Good morning everyone.|Welcome to church today.|Please open to John 3:16.", "viewers get lines in order, silence leaves no gaps");

  console.log("Translating only what is needed");
  const before = fake.chatHits;
  r = await audio(sid); await sleep(150);
  ok(fake.chatHits === before, "with only English viewers, no translation call is made");
  ai.configure({ AI_PROVIDERS: "groq", GROQ_API_KEY: "k", GROQ_BASE: PB });
  fake.stt = ["The Lord is my shepherd.", "We give thanks today."]; fake.sttN = 0;
  r = await view(sid, "Spanish", 0); await sleep(250);
  r = await view(sid, "Spanish", 0);
  ok(r.j.lines.length === 4 && r.j.lines.filter(l => l.t && l.t.startsWith("[Spanish]")).length === 4, "a viewer who joins in Spanish gets the most recent lines translated (backfill)");
  await audio(sid); await sleep(250);
  r = await view(sid, "Spanish", 4); ok(r.j.lines.length === 1 && r.j.lines[0].t === "[Spanish] The Lord is my shepherd.", "new lines arrive already translated for an active language");
  r = await view(sid, "French", 0); await view(sid, "Spanish", 0);
  fake.langsAsked = []; await audio(sid); await sleep(250);
  ok(fake.langsAsked.some(x => x.includes("Spanish") && x.includes("French")) && !fake.langsAsked.some(x => /English/.test(x)), "one call translates into all active languages at once, never into the source language");
  r = await view(sid, "Yoruba", 0); await sleep(250);
  const hard = fake.langsAsked.length; await view(sid, "Yoruba", 0); await audio(sid); await sleep(250);
  ok(fake.langsAsked.length > hard, "low-resource languages such as Yoruba are included when someone has them open");
  r = await view(sid, "Klingon", 0); ok(r.j.lines.every(l => l.t === l.o), "an unknown language falls back to the source language");

  console.log("Failures do not stop the service");
  fake.chatMode = "500"; await view(sid, "Spanish", 0); r = await audio(sid); await sleep(150);
  r = await view(sid, "Spanish", 0); const lastL = r.j.lines[r.j.lines.length - 1];
  ok(lastL && lastL.t === null && lastL.o.length > 0, "if translation fails, viewers still get the original line (t is null)");
  r = await api("GET", "/api/admin/pulpit"); ok(/groq: provider error/.test(r.j.active.stats.why), "the pastor's page says why translation failed, not only that it did");
  fake.chatMode = "ok";
  fake.sttMode = "500"; ai.configure({ AI_PROVIDERS: "groq", GROQ_API_KEY: "k", GROQ_BASE: PB });
  r = await audio(sid); ok(r.s === 200 && r.j.ok === false && /groq: provider error/.test(r.j.tried.join()), "a failing speech provider reports the failure and the request still returns normally");
  const hits = fake.sttHits; r = await audio(sid);
  ok(fake.sttHits === hits && /cooling down/.test(r.j.tried.join()) && ai.sttStatus()[0].state === "cooling down", "a failed speech provider cools down and is not hammered");
  fake.sttMode = "ok"; ai.configure({ AI_PROVIDERS: "groq", GROQ_API_KEY: "k", GROQ_BASE: PB });

  console.log("Isolation and access");
  r = await api("GET", "/api/admin/pulpit", null, { authorization: "" }); ok(r.s === 401, "pastor controls need a sign-in");
  r = await api("POST", "/api/admin/pulpit/audio?sid=" + sid, Buffer.alloc(3000, 1), { authorization: "", "content-type": "audio/webm" }); ok(r.s === 401, "audio upload needs a sign-in");
  const t1 = tok; r = await api("POST", "/api/admin/signup", { name: "Other Church", pass: "another long pass" }); const id2 = r.j.id; tok = r.j.token;
  r = await audio(sid); ok(r.s === 404, "another church cannot send audio into this service");
  r = await api("POST", "/api/admin/pulpit/end", { sid }); ok(r.s === 404, "another church cannot end this service");
  r = await view(sid, "English", 0, id2); ok(r.s === 404, "another church's viewers cannot read this service");
  tok = t1;
  r = await api("PUT", "/api/admin/settings", { origins: ["https://gracechurch.example"] });
  r = await api("GET", `/api/public/${id}/live`, null, { authorization: "" }); ok(r.s === 200, "the viewer page (no Origin header) still works when the widget is locked to a domain");
  r = await api("GET", `/api/public/${id}/live`, null, { authorization: "", origin: "https://evil.example" }); ok(r.s === 403, "a foreign website is still blocked");
  r = await api("PUT", "/api/admin/settings", { origins: [], features: { live: false } });
  r = await api("GET", `/api/public/${id}/live`, null, { authorization: "" }); ok(r.s === 404, "the pastor can switch live captions off");
  r = await api("PUT", "/api/admin/settings", { features: { live: true } });

  console.log("Ending and the saved transcript");
  r = await api("GET", "/api/admin/pulpit"); ok(r.j.active && r.j.active.lines >= 8 && r.j.active.viewers.Spanish >= 1 && r.j.sttLive, "the pastor's page shows lines, viewers per language and speech status");
  r = await api("POST", "/api/admin/pulpit/end", { sid }); ok(r.j.ok && r.j.lines >= 8, "the pastor ends the service");
  r = await view(sid, "Spanish", 0); ok(r.j.ended === true, "viewers are told the service has ended");
  r = await api("GET", `/api/public/${id}/live`, null, { authorization: "" }); ok(r.j.active === false, "no service is shown as live afterwards");
  r = await api("GET", "/api/admin/state"); const sv = r.j.church.pulpit.services[0];
  ok(sv && sv.id === sid && sv.count >= 8 && !sv.lines, "the state lists the saved service without shipping its transcript");
  r = await api("GET", "/api/admin/pulpit/transcript?id=" + sid); ok(/Good morning everyone\./.test(r.j.text) && !/\[Spanish\]/.test(r.j.text), "the saved transcript is the source text only, no translations");
  r = await api("POST", "/api/admin/pulpit/start", { title: "Second", lang: "Spanish" }); const sid2 = r.j.sid;
  r = await api("POST", "/api/admin/pulpit/start", { title: "Third", lang: "French" });
  ok((await view(sid2, "English", 0)).j.ended === true, "starting a new service ends the previous one");

  prov.close(); server.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
