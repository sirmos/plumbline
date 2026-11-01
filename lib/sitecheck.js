"use strict";
// "Check my website": fetches a church's public page and looks for its Plumb Line snippet.
// SSRF-safe: http(s) only, public addresses only (re-checked on every redirect), short timeout, small body.
// `deps` lets tests supply a fake fetch and DNS.
const net = require("net");

function privateIp(a) {
  if (net.isIPv4(a)) { const [x, y] = a.split(".").map(Number); return x === 10 || x === 127 || x === 0 || x >= 224 || (x === 169 && y === 254) || (x === 192 && y === 168) || (x === 172 && y >= 16 && y <= 31) || (x === 100 && y >= 64 && y <= 127); }
  const l = String(a).toLowerCase(); if (l.startsWith("::ffff:")) return privateIp(l.slice(7));
  return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe8") || l.startsWith("fe9") || l.startsWith("fea") || l.startsWith("feb");
}

async function check(input, churchId, deps = {}) {
  const lookup = deps.lookup || (h => require("dns").promises.lookup(h, { all: true }));
  const doFetch = deps.fetch || fetch;
  let raw = String(input || "").trim(); if (!raw) return { ok: false, why: "Type your website address first." };
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  let url; try { url = new URL(raw); } catch (e) { return { ok: false, why: "That does not look like a web address." }; }
  for (let hop = 0; hop < 4; hop++) {
    if (!/^https?:$/.test(url.protocol)) return { ok: false, why: "Only http and https addresses can be checked." };
    let addrs; try { addrs = net.isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname); } catch (e) { return { ok: false, why: "We could not find that website. Check the spelling." }; }
    if (!addrs.length || addrs.some(a => privateIp(a.address))) return { ok: false, why: "That address is not a public website, so it cannot be checked from here." };
    let r;
    try { r = await doFetch(url.href, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "user-agent": "PlumbLineSiteCheck/1.0", accept: "text/html" } }); }
    catch (e) { return { ok: false, why: "The website did not answer in time." }; }
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { try { url = new URL(r.headers.get("location"), url); } catch (e) { return { ok: false, why: "The website sent a broken redirect." }; } continue; }
    if (r.status >= 400) return { ok: false, why: "The website answered with an error (" + r.status + ")." };
    const text = (await r.text()).slice(0, 500000);
    const esc = String(churchId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const mine = new RegExp("<script[^>]+widget\\.js[^>]*data-church=[\"']" + esc + "[\"']|<script[^>]+data-church=[\"']" + esc + "[\"'][^>]*widget\\.js", "i").test(text);
    if (mine) return { ok: true, found: true, url: url.href, note: "Your Plumb Line button is on this page." };
    if (/widget\.js[^>]*data-church=/i.test(text)) return { ok: true, found: false, url: url.href, note: "A Plumb Line snippet is on this page, but it belongs to a different church ID. Copy the code from this screen again." };
    return { ok: true, found: false, url: url.href, note: "We did not find the snippet on this page. Paste it before the closing body tag (or in the footer code box), save and publish, then check again. Some site builders only add it after you publish." };
  }
  return { ok: false, why: "The website redirected too many times." };
}
module.exports = { check, privateIp };
