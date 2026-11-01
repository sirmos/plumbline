"use strict";
// Tests the AI failover router against fake providers that fail in different ways.
// Run: node test/router.js
const http = require("http");
for (const k of Object.keys(process.env)) if (/_API_KEY$|_BASE$|^GITHUB_MODELS_TOKEN$|^AI_/.test(k)) delete process.env[k];
const ai = require("../lib/ai");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok   " + m); } else { fail++; console.log("  FAIL " + m); } };

// A fake OpenAI-compatible provider. mode decides how it behaves. It records every request it receives.
function mock(mode) {
  const m = { mode, hits: 0, bodies: [], url: "" };
  m.server = http.createServer((req, res) => {
    let b = ""; req.on("data", d => b += d); req.on("end", () => {
      if (req.method === "GET" && /\/models$/.test(req.url)) { // the model list is not counted as a call
        m.listHits = (m.listHits || 0) + 1;
        if (!m.models) { res.writeHead(404, { "content-type": "application/json" }); return res.end("{}"); }
        res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ object: "list", data: m.models.map(id => ({ id })) }));
      }
      m.hits++; let body = {}; try { body = JSON.parse(b); } catch (e) {} m.bodies.push(body);
      const send = (code, obj, h) => { res.writeHead(code, { "content-type": "application/json", ...(h || {}) }); res.end(JSON.stringify(obj)); };
      const good = (content) => send(200, { choices: [{ message: { content } }] });
      const md = typeof m.mode === "function" ? m.mode(body, m.hits) : m.mode;
      if (md === "ok") return good('{"answer":"Sundays at 9 and 11.","needs_human":false,"ok":true}');
      if (md === "fenced") return good('Here you go:\n```json\n{"answer":"Fenced answer works."}\n```');
      if (md === "think") return good('<think>hmm</think>{"answer":"After thinking."}');
      if (md === "garbage") return good("I am sorry, I cannot help with that.");
      if (md === "wrongshape") return good('{"unexpected":true}');
      if (md === "429") return send(429, { error: "slow down" }, { "retry-after": "2" });
      if (md === "500") return send(500, { error: "boom" });
      if (md === "401") return send(401, { error: "bad key" });
      if (md === "404") return send(404, { error: "no such model" });
      if (md === "401key") return send(401, { error: "Incorrect API key provided: " + String(req.headers.authorization || "").replace("Bearer ", "") });
      if (md === "413") return send(413, { error: "too big" });
      if (md === "decom") return send(400, { error: { message: "The model `" + body.model + "` has been decommissioned and is no longer supported.", code: "model_decommissioned" } });
      if (md === "retrydelay") return send(429, { error: { status: "RESOURCE_EXHAUSTED", details: [{ retryDelay: "7s" }] } });
      if (md === "nojson") return body.response_format ? send(400, { error: "response_format unsupported" }) : good('{"answer":"Worked without JSON mode."}');
      if (md === "hang") return; // never answers
      send(500, {});
    });
  });
  return new Promise(r => m.server.listen(0, "127.0.0.1", () => { m.url = "http://127.0.0.1:" + m.server.address().port; r(m); }));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const validate = d => d && typeof d.answer === "string";
const call = (extra = {}) => ai.askJson({ system: "s", user: "u", tier: "quick", maxTokens: 50, fallback: () => ({ answer: "FALLBACK" }), validate, ...extra });

async function main() {
  const A = await mock("429"), B = await mock("500"), C = await mock("garbage"), D = await mock("ok"), T = await mock("ok");
  const env = (extra = {}) => ({ AI_PROVIDERS: "groq,cerebras,openrouter,custom", GROQ_API_KEY: "k1", GROQ_BASE: A.url, CEREBRAS_API_KEY: "k2", CEREBRAS_BASE: B.url,
    OPENROUTER_API_KEY: "k3", OPENROUTER_BASE: C.url, OPENROUTER_PRIVATE: "true", CUSTOM_BASE: D.url, CUSTOM_MODEL_QUICK: "q", CUSTOM_MODEL_DEFAULT: "d", ...extra });
  const reset = (...ms) => ms.forEach(m => { m.hits = 0; m.bodies = []; });

  console.log("Setup");
  ai.configure({});
  ok(!ai.live(), "with no keys nothing is configured and the app runs offline");
  let r = await call(); ok(r.live === false && r.data.answer === "FALLBACK" && r.why === "no provider configured", "offline call uses the rule-based fallback");
  ai.configure({ AI_PROVIDERS: "custom", CUSTOM_BASE: D.url });
  ok(!ai.live(), "custom provider without model names is ignored");
  ai.configure(env());
  ok(ai.status().map(p => p.name).join(",") === "groq,cerebras,openrouter,custom", "providers are tried in the order set in AI_PROVIDERS");

  console.log("Failover");
  r = await call();
  ok(r.live && r.via === "custom/q" && r.data.answer.startsWith("Sundays"), "rate-limited, broken and garbage providers are skipped, the next good one answers");
  ok(r.tried.join(" | ") === "groq: rate limited | cerebras: provider error | openrouter: not valid JSON | custom ok", "every attempt is recorded in order");
  const st = Object.fromEntries(ai.status().map(p => [p.name, p]));
  ok(st.groq.models.filter(m => m.tier !== "default").every(m => m.state === "cooling down" && m.coolSeconds <= 2) && st.cerebras.state === "cooling down", "a rate limit cools only the model that was limited (Retry-After is honoured); an outage cools the provider");
  ok(st.groq.models.some(m => m.state === "ready") && st.groq.state === "partly limited", "the same provider's other models stay available");
  reset(A, B, C, D);
  r = await call({ cacheKey: undefined });
  ok(r.via === "custom/q" && A.hits === 0 && B.hits === 0, "while cooling, failed providers are not called again");
  ok(C.hits === 1, "a provider that returned garbage is still tried (it is not cooling yet)");

  console.log("Output checks");
  A.mode = "ok"; B.mode = "ok"; C.mode = "ok"; D.mode = "ok";
  ai.configure(env());
  A.mode = "wrongshape"; reset(A, B, C, D);
  r = await call(); ok(r.via === "cerebras/llama3.1-8b" && r.tried[0] === "groq: unusable answer", "valid JSON of the wrong shape is rejected and the next provider answers");
  A.mode = "fenced"; ai.configure(env()); r = await call(); ok(r.via.startsWith("groq") && r.data.answer === "Fenced answer works.", "JSON inside a code fence is accepted");
  A.mode = "think"; ai.configure(env()); r = await call(); ok(r.data.answer === "After thinking.", "reasoning tags are stripped before parsing");
  A.mode = "nojson"; ai.configure(env()); reset(A); r = await call();
  ok(r.via.startsWith("groq") && A.hits === 2 && A.bodies[0].response_format && !A.bodies[1].response_format, "a model that rejects JSON mode is retried once without it");
  A.mode = "413"; ai.configure(env()); r = await call(); const s413 = ai.status().find(p => p.name === "groq");
  ok(r.via.startsWith("cerebras") && s413.state === "ready", "a too-large request moves on without cooling the provider down");

  console.log("Errors that should disable a provider");
  A.mode = "401"; ai.configure(env()); await call();
  ok(ai.status().find(p => p.name === "groq").state === "key rejected", "a rejected key marks the provider as such");
  A.mode = "404"; ai.configure(env()); reset(A); await call(); await call();
  ok(A.hits === 2 && A.bodies[0].model !== A.bodies[1].model, "a missing model is not hit again (each candidate model is tried once, then the provider is left alone)");
  A.mode = "garbage"; ai.configure(env({ AI_PROVIDERS: "groq,custom" })); reset(A); for (let i = 0; i < 5; i++) await call();
  ok(A.hits === 6 && new Set(A.bodies.map(x => x.model)).size === 2, "each call tries a provider's models once; after three unusable answers a model is benched and no longer asked");

  console.log("Pacing, privacy, caching");
  A.mode = "ok"; ai.configure(env({ GROQ_RPM: "2" })); reset(A, D);
  await call(); await call(); r = await call();
  ok(A.hits === 3 && A.bodies[0].model === A.bodies[1].model && A.bodies[2].model !== A.bodies[0].model, "pacing is per model: at its own limit a model is skipped and the provider's next model answers");
  await call(); await call(); r = await call();
  ok(A.hits === 4 && r.via.startsWith("cerebras"), "once every model of a provider is at its limit, the next provider takes over");
  ai.configure({ AI_PROVIDERS: "gemini,custom", GEMINI_API_KEY: "g", GEMINI_BASE: T.url, CUSTOM_BASE: D.url, CUSTOM_MODEL_QUICK: "q", CUSTOM_MODEL_DEFAULT: "d" });
  reset(T, D); r = await call();
  ok(T.hits === 0 && r.via === "custom/q", "private text is never sent to a provider whose free tier trains on prompts");
  r = await call({ sensitivity: "public" }); ok(T.hits === 1 && r.via.startsWith("gemini"), "public text such as a pastor's own sermon may use it");
  ai.configure({ AI_PROVIDERS: "gemini", GEMINI_API_KEY: "g", GEMINI_BASE: T.url }); reset(T);
  r = await call(); ok(r.live === false && T.hits === 0 && /allowed/.test(r.why), "if only a training provider exists, private text uses the offline fallback");
  ai.configure({ AI_PROVIDERS: "gemini", GEMINI_API_KEY: "g", GEMINI_BASE: T.url, GEMINI_PRIVATE: "true" }); reset(T);
  r = await call(); ok(T.hits === 1, "GEMINI_PRIVATE=true (for example after billing is switched on) allows it");
  ai.configure(env()); A.mode = "ok"; reset(A, B, C, D);
  await call({ cacheKey: "same" }); const before = A.hits + D.hits; r = await call({ cacheKey: "same" });
  ok(A.hits + D.hits === before && /^cache/.test(r.via), "an identical question is answered from cache and costs no quota");
  r = await call({ cacheKey: "same", tier: "default" }); ok(!/^cache/.test(r.via), "cache is separate for each model tier");

  console.log("Total failure and timeouts");
  A.mode = "500"; B.mode = "500"; C.mode = "500"; D.mode = "500"; ai.configure(env());
  r = await call(); ok(r.live === false && r.data.answer === "FALLBACK" && r.tried.length === 4, "when every provider fails the rule-based fallback answers");
  A.mode = "hang"; ai.configure(env({ AI_TIMEOUT_QUICK_MS: "300", AI_PROVIDERS: "groq,custom" })); D.mode = "ok";
  const t0 = Date.now(); r = await call(); ok(r.via === "custom/q" && Date.now() - t0 < 2500, "a provider that hangs is cut off and the next one answers");

  console.log("Retired models");
  { // A provider whose newest model has been shut down: the router must fall through to the next candidate within the same request.
    const R = await mock((body) => body.model === "openai/gpt-oss-20b" || body.model === "openai/gpt-oss-120b" ? "ok" : "404");
    R.mode = (body) => /gpt-oss/.test(body.model) ? "ok" : "ok"; R.hits = 0; R.bodies = [];
    const old = await mock((body) => body.model === "retired-new" ? "404" : "ok");
    ai.configure({ AI_PROVIDERS: "groq,custom", GROQ_API_KEY: "k", GROQ_BASE: old.url, GROQ_MODEL_QUICK: "retired-new,still-works", CUSTOM_BASE: D.url, CUSTOM_MODEL_QUICK: "q", CUSTOM_MODEL_DEFAULT: "d" });
    r = await call();
    ok(r.via === "groq/still-works" && old.hits === 2 && old.bodies[0].model === "retired-new" && old.bodies[1].model === "still-works", "a retired model is skipped and the next candidate answers in the same request");
    reset(old); r = await call();
    ok(r.via === "groq/still-works" && old.hits === 1 && old.bodies[0].model === "still-works", "the retired model is remembered and not asked again");
    ok(ai.status().find(p => p.name === "groq").state === "partly limited" && ai.status().find(p => p.name === "groq").quick === "still-works" && ai.status().find(p => p.name === "groq").models.find(m => m.id === "retired-new").state === "retired", "the provider stays usable, shows the model in use, and marks the retired one");
    // the built-in Groq defaults are the current models, with the old ones kept as fallbacks
    ai.configure({ AI_PROVIDERS: "groq", GROQ_API_KEY: "k", GROQ_BASE: old.url }); reset(old);
    await ai.askJson({ system: "s", user: "u", tier: "quick", maxTokens: 100, fallback: () => ({ answer: "F" }), validate });
    ok(old.bodies[0].model === "openai/gpt-oss-20b", "Groq's default quick model is the current one");
    ok(old.bodies[0].reasoning_effort === "low" && old.bodies[0].max_tokens === 700, "a reasoning model is asked to think briefly and given room to answer");
    old.mode = "ok"; ai.configure({ AI_PROVIDERS: "custom", CUSTOM_BASE: old.url, CUSTOM_MODEL_QUICK: "plain", CUSTOM_MODEL_DEFAULT: "plain" }); reset(old);
    await call(); ok(old.bodies[0].reasoning_effort === undefined && old.bodies[0].max_tokens === 50, "other models get no reasoning settings");
    R.server.close(); old.server.close();
  }

  console.log("Models that come and go");
  { // the provider lists what it offers now; the router uses that, not a fixed list
    const G = await mock("ok"); G.models = ["whisper-large-v3", "llama-guard-4", "mystery-chat-9b", "big-chat-70b"];
    ai.configure({ AI_PROVIDERS: "groq", GROQ_API_KEY: "k", GROQ_BASE: G.url });
    r = await call();
    ok(r.via === "groq/mystery-chat-9b", "every preferred model is gone, so the provider's own list is used: the closest chat model to the tier answers");
    ok(G.bodies.every(b => b.model !== "openai/gpt-oss-20b" && b.model !== "llama-3.1-8b-instant"), "retired preferred models are never called");
    const names = ai.status()[0].models.map(m => m.id);
    ok(names.includes("big-chat-70b") && !names.some(n => /whisper|guard/.test(n)), "speech and safety models are never used for chat");
    ok(ai.status()[0].listed === 4 && ai.status()[0].quick === "mystery-chat-9b" && ai.status()[0].default === "big-chat-70b", "the dashboard shows how many models were listed and which one each tier uses");
    r = await call({ tier: "default" }); ok(r.via === "groq/big-chat-70b", "the bigger tier picks the bigger model");
    const lists = G.listHits; await call(); await call(); ok(G.listHits === lists, "the model list is fetched once, not on every request");

    G.models = ["openai/gpt-oss-20b", "llama-3.1-8b-instant", "other-8b"]; ai.configure({ AI_PROVIDERS: "groq", GROQ_API_KEY: "k", GROQ_BASE: G.url }); reset(G);
    r = await call(); ok(r.via === "groq/openai/gpt-oss-20b", "preferred models that are listed are chosen first");

    G.models = null; ai.configure({ AI_PROVIDERS: "groq", GROQ_API_KEY: "k", GROQ_BASE: G.url }); reset(G);
    r = await call(); ok(r.via === "groq/openai/gpt-oss-20b" && ai.status()[0].listed === null && /could not list/.test(ai.status()[0].listErr), "if the list cannot be fetched, the preferred names are used and the problem is shown");
    ai.configure({ AI_PROVIDERS: "groq", GROQ_API_KEY: "k", GROQ_BASE: G.url, AI_DISCOVERY: "false" }); const l2 = G.listHits; await call();
    ok(G.listHits === l2, "AI_DISCOVERY=false turns the model list lookup off");

    ai.configure({ AI_PROVIDERS: "groq", GROQ_API_KEY: "k", GROQ_BASE: G.url, GROQ_MODEL_QUICK: "my-own-model" }); reset(G);
    r = await call(); ok(r.via === "groq/my-own-model", "a model you name yourself is tried first");

    // a model that is listed but has been shut down: the list is fetched again so its replacement is found
    G.models = ["old-8b", "new-8b"]; G.mode = (b) => b.model === "old-8b" ? "404" : "ok";
    ai.configure({ AI_PROVIDERS: "groq", GROQ_API_KEY: "k", GROQ_BASE: G.url, GROQ_MODEL_QUICK: "old-8b" }); await ai.discover("groq", true); const before = G.listHits;
    r = await call(); await sleep(60);
    ok(r.via === "groq/new-8b" && G.listHits > before, "a model that turns out to be retired triggers a fresh look at the provider's list");
    G.server.close();
  }
  { // free-tier limits are per model: one limited model must not take the whole provider down
    const G = await mock((b) => b.model === "limited-8b" ? "429" : "ok"); G.models = ["limited-8b", "free-8b"];
    ai.configure({ AI_PROVIDERS: "groq", GROQ_API_KEY: "k", GROQ_BASE: G.url, GROQ_MODEL_QUICK: "limited-8b" });
    r = await call(); ok(r.via === "groq/free-8b" && r.tried.join() === "groq ok" && r.detail[0].includes("limited-8b: rate limited"), "a rate-limited model hands over to another model of the same provider within the request");
    reset(G); r = await call(); ok(r.via === "groq/free-8b" && G.hits === 1, "the limited model is left alone until its wait is over");
    G.server.close();
    const O = await mock((b) => /:free$/.test(b.model) ? "429" : "ok"); O.models = ["paid-model", "a-free-8b:free", "b-free-8b:free"];
    ai.configure({ AI_PROVIDERS: "openrouter", OPENROUTER_API_KEY: "k", OPENROUTER_BASE: O.url, OPENROUTER_PRIVATE: "true" });
    await call(); ok(ai.status()[0].state === "cooling down" && !ai.status()[0].models.some(m => m.id === "paid-model"), "OpenRouter's free limit covers the account, so one 429 cools the provider; paid models are never used");
    O.server.close();
  }
  { // what a provider says in the body of an error
    const G = await mock((b) => b.model === "gone-8b" ? "decom" : "ok"); ai.configure({ AI_PROVIDERS: "groq", GROQ_API_KEY: "k", GROQ_BASE: G.url, GROQ_MODEL_QUICK: "gone-8b", AI_DISCOVERY: "false" });
    r = await call(); const sg = ai.status()[0];
    ok(r.live && r.via !== "groq/gone-8b" && sg.models.find(m => m.id === "gone-8b").state === "retired" && sg.state !== "cooling down", "a 400 that says the model was decommissioned is treated as a retired model, not a broken provider");
    G.server.close();
    const R = await mock("retrydelay"); ai.configure({ AI_PROVIDERS: "gemini", GEMINI_API_KEY: "k", GEMINI_BASE: R.url, GEMINI_PRIVATE: "true", AI_DISCOVERY: "false" });
    await call(); const gm = ai.status()[0].models.find(m => m.tier !== "default");
    ok(gm.state === "cooling down" && gm.coolSeconds >= 7 && gm.coolSeconds <= 9, "Gemini's retryDelay inside the error body is honoured");
    R.server.close();
  }

  console.log("Start-up check");
  { const G = await mock("ok"), M = await mock("ok"), K = await mock("401key"); G.models = ["good-8b", "good-70b"];
    ai.configure({ AI_PROVIDERS: "groq,gemini,mistral", GROQ_API_KEY: "k-good-key", GROQ_BASE: G.url, GEMINI_API_KEY: "g-good-key", GEMINI_BASE: M.url, MISTRAL_API_KEY: "sk-secret-123456", MISTRAL_BASE: K.url });
    const out = []; const res = await ai.startupCheck(l => out.push(l)); const txt = out.join("\n");
    ok(res.length === 3 && res[0].ok && res[1].ok && !res[2].ok, "the check reports each provider");
    ok(/OK\s+groq\s+good-8b/.test(txt) && /2 models listed/.test(txt), "a working provider is shown with the model it will use");
    ok(/FAIL\s+mistral\s+key rejected/.test(txt) && /console\.mistral\.ai\/api-keys/.test(txt), "a rejected key is shown with where to get a new one");
    ok(/gemini[^\n]*public text only/.test(txt), "a provider that may train on prompts is labelled");
    ok(!txt.includes("sk-secret-123456") && txt.includes("***"), "keys are never printed, even if the provider's error message repeats them");
    ai.configure({}); const empty = []; await ai.startupCheck(l => empty.push(l)); ok(/no provider key found/.test(empty.join()), "with no keys the check says how to add one");
    G.server.close(); M.server.close(); K.server.close(); }

  console.log("Dashboard helpers");
  A.mode = "ok"; D.mode = "ok"; ai.configure(env({ AI_PROVIDERS: "groq,custom" }));
  const pr = await ai.probe(); ok(pr.length === 2 && pr.every(x => x.ok), "the connection test reports each provider");
  ok(!JSON.stringify(ai.status()).includes("k1"), "status never contains API keys");
  ok(ai.via({ live: false }) === "rule-based fallback" && ai.via({ live: true, via: "groq/x" }) === "groq/x", "the log label shows which provider wrote a draft");

  for (const m of [A, B, C, D, T]) m.server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
