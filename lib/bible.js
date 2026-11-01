"use strict";
// Public-domain Bible text lookup. Only versions whose text is public domain are offered, because Plumb Line
// never puts copyrighted Scripture on a church's page. Fetch is injectable so tests need no network.
const VERSIONS = [
  { id: "web", name: "World English Bible" }, { id: "kjv", name: "King James Version" },
  { id: "bbe", name: "Bible in Basic English" }, { id: "webbe", name: "World English Bible, British" },
  { id: "oeb-us", name: "Open English Bible, US" }, { id: "almeida", name: "João Ferreira de Almeida (Português)" }
];
const cache = new Map();
const REF = /^[1-3]?\s?[A-Za-z][A-Za-z .]{1,24}\s\d{1,3}(:\d{1,3}(-\d{1,3})?)?$/;

function cleanRef(r) { return String(r || "").replace(/\s+/g, " ").trim(); }
function validRef(r) { return REF.test(cleanRef(r)); }

async function lookup(ref, version, deps = {}) {
  ref = cleanRef(ref); version = String(version || "web").toLowerCase();
  if (!validRef(ref)) return { ok: false, why: "Write a passage like John 3:16 or Psalm 23." };
  if (!VERSIONS.some(v => v.id === version)) return { ok: false, why: "That version is not offered." };
  const key = version + "|" + ref.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const url = "https://bible-api.com/" + encodeURIComponent(ref) + "?translation=" + version;
  let r;
  try { r = await (deps.fetch || fetch)(url, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } }); }
  catch (e) { return { ok: false, why: "The Bible text service did not answer. Try again in a moment, or type the verse yourself." }; }
  if (r.status === 404) return { ok: false, why: "That passage was not found in this version." };
  if (r.status === 429) return { ok: false, why: "The Bible text service is busy. Wait a minute and try again." };
  if (r.status >= 400) return { ok: false, why: "The Bible text service returned an error (" + r.status + ")." };
  let j; try { j = await r.json(); } catch (e) { return { ok: false, why: "The Bible text service sent something unreadable." }; }
  const text = String((j && j.text) || "").replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, why: "That passage came back empty." };
  const out = { ok: true, ref: String(j.reference || ref).slice(0, 60), version, text: text.slice(0, 3000) };
  if (cache.size > 800) cache.clear();
  cache.set(key, out);
  return out;
}
module.exports = { lookup, validRef, VERSIONS };
