"use strict";
// Church page and website check. Run: node test/site.js
const os = require("os"), path = require("path"), fs = require("fs");
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pl-site-"));
for (const k of Object.keys(process.env)) if (/_API_KEY$|_BASE$|^GITHUB_MODELS_TOKEN$|^AI_/.test(k)) delete process.env[k];
const { check } = require("../lib/sitecheck");
const server = require("../server");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok   " + m); } else { fail++; console.log("  FAIL " + m); } };
const page = body => ({ status: 200, headers: { get: () => null }, text: async () => body });
const pub = { lookup: async () => [{ address: "93.184.216.34" }] };

async function main() {
  ok((await check("http://127.0.0.1/", "x", pub)).ok === false, "a loopback address is refused");
  ok((await check("localhost", "x", { lookup: async () => [{ address: "127.0.0.1" }] })).ok === false, "a name that points to a private address is refused");
  ok((await check("http://169.254.169.254/latest", "x", pub)).ok === false, "the cloud metadata address is refused");
  ok((await check("ftp://example.org", "x", pub)).ok === false, "only http and https are checked");
  let r = await check("church.org", "harbor-1", { ...pub, fetch: async () => page('<html><script src="https://s.example/widget.js" data-church="harbor-1" async></script>') });
  ok(r.ok && r.found, "finds its own snippet (and adds https when missing)");
  r = await check("church.org", "harbor-1", { ...pub, fetch: async () => page('<script async data-church="harbor-1" src="https://s/widget.js"></script>') });
  ok(r.found, "finds the snippet with attributes in another order");
  r = await check("church.org", "harbor-1", { ...pub, fetch: async () => page('<script src="https://s/widget.js" data-church="other" async></script>') });
  ok(r.ok && !r.found && /different church/.test(r.note), "says when the snippet belongs to another church");
  r = await check("church.org", "harbor-1", { ...pub, fetch: async () => page("<html>hello</html>") });
  ok(r.ok && !r.found && /did not find/.test(r.note), "says when no snippet is there");
  let calls = 0;
  r = await check("church.org", "h", { lookup: async h => [{ address: h === "church.org" ? "93.184.216.34" : "10.0.0.5" }], fetch: async () => { calls++; return { status: 302, headers: { get: () => "http://internal.example/x" }, text: async () => "" }; } });
  ok(!r.ok && calls === 1, "a redirect to a private address is stopped before it is fetched");
  r = await check("church.org", "h", { ...pub, fetch: async () => { throw new Error("t"); } });
  ok(!r.ok, "a site that does not answer gives a plain message");

  await new Promise(x => server.listen(0, x));
  const B = "http://127.0.0.1:" + server.address().port;
  const j = async (p, o = {}, tok) => { const x = await fetch(B + p, { ...o, headers: { "content-type": "application/json", ...(tok ? { authorization: "Bearer " + tok } : {}), ...(o.headers || {}) } }); return { s: x.status, j: await x.json().catch(() => ({})) }; };
  const su = await j("/api/admin/signup", { method: "POST", body: JSON.stringify({ name: "Harbor Church", pass: "passcode123" }) });
  const tok = su.j.token, id = su.j.id;
  ok((await j("/api/public/" + id + "/site")).s === 200, "the church page data is public by default");
  ok((await fetch(B + "/c/" + id)).status === 200, "/c/<id> serves the church page");
  const sv = await j("/api/admin/settings", { method: "PUT", body: JSON.stringify({ site: { times: "Sundays 9 AM", address: "12 Harbor Road", about: "<b>Hi</b>", phone: "555" } }) }, tok);
  ok(sv.s === 200 && sv.j.church.site.times === "Sundays 9 AM", "the pastor saves page details");
  const pg = await j("/api/public/" + id + "/site");
  ok(pg.j.times === "Sundays 9 AM" && pg.j.about === "<b>Hi</b>" && !pg.j.passHash && !pg.j.visitors && !pg.j.care, "the public page shows only public fields");
  ok(Array.isArray(pg.j.faq) && pg.j.faq.length > 0, "guide answers appear on the page");
  await j("/api/admin/settings", { method: "PUT", body: JSON.stringify({ origins: ["https://other.example"] }) }, tok);
  ok((await j("/api/public/" + id + "/site", { headers: { origin: "https://evil.example" } })).s === 403, "a domain-locked church refuses other websites");
  const own = await fetch(B + "/api/public/" + id + "/config", { headers: { origin: B } });
  ok(own.status === 200, "the church's own hosted page still works when the widget is domain-locked");
  const own2 = await fetch(B + "/api/public/" + id + "/config", { headers: { "sec-fetch-site": "same-origin" } });
  ok(own2.status === 200, "a same-origin request without an Origin header also works (a browser sends none for GET)");
  await j("/api/admin/settings", { method: "PUT", body: JSON.stringify({ site: { on: false } }) }, tok);
  ok((await j("/api/public/" + id + "/site")).s === 404, "the page can be switched off");
  const ck = await j("/api/admin/check-site", { method: "POST", body: JSON.stringify({ url: "http://127.0.0.1/" }) }, tok);
  ok(ck.s === 200 && ck.j.ok === false, "the check endpoint refuses private addresses");
  ok((await j("/api/admin/check-site", { method: "POST", body: "{}" })).s === 401, "the check needs sign-in");
  server.close(); console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
