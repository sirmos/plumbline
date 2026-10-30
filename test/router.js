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
      if (md === "413") return send(413, { error: "too big" });
      if (md === "nojson") return body.response_format ? send(400, { error: "response_format unsupported" }) : good('{"answer":"Worked without JSON mode."}');
      if (md === "hang") return; // never answers
      send(500, {});
    });
  });
  return new Promise(r => m.server.listen(0, "127.0.0.1", () => { m.url = "http://127.0.0.1:" + m.server.address().port; r(m); }));
}
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
  ok(st.groq.state === "cooling down" && st.groq.coolSeconds <= 2 && st.cerebras.state === "cooling down", "failed providers cool down (Retry-After is honoured)");
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
  ok(A.hits === 1, "a missing model is not hit again");
  A.mode = "garbage"; ai.configure(env({ AI_PROVIDERS: "groq,custom" })); reset(A); for (let i = 0; i < 5; i++) await call();
  ok(A.hits === 3, "a model that keeps returning unusable answers is benched after three tries");

  console.log("Pacing, privacy, caching");
  A.mode = "ok"; ai.configure(env({ GROQ_RPM: "2" })); reset(A, D);
  await call(); await call(); r = await call();
  ok(A.hits === 2 && r.via.startsWith("cerebras"), "a provider is not called past its own per-minute limit; the next one takes over");
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
