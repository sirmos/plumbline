/* Plumb Line widget. Embed with:
   <script src="https://YOUR-SERVER/widget.js" data-church="your-church-id" async></script>
   Runs in a Shadow DOM so it cannot clash with the host site's styles. */
(function () {
  "use strict";
  var el = document.currentScript || Array.prototype.find.call(document.scripts, function (s) { return s.src && /widget\.js/.test(s.src); });
  if (!el) return;
  var CHURCH = el.getAttribute("data-church"), BASE = new URL(el.src).origin;
  if (!CHURCH) { console.warn("[Plumb Line] missing data-church"); return; }
  if (window.__plumblineLoaded) return; window.__plumblineLoaded = true;

  var KEY = "plumbline:" + CHURCH;
  function lget() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function lset(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  function api(path, body, token) {
    var o = body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {};
    if (token) { o.headers = o.headers || {}; o.headers.authorization = "Bearer " + token; }
    return fetch(BASE + "/api/public/" + CHURCH + "/" + path, o).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Something went wrong."); return j; });
    });
  }
  function h(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in (attrs || {})) {
      if (k === "class") n.className = attrs[k]; else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    }
    [].concat(kids == null ? [] : kids).forEach(function (c) { if (c == null) return; n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function onColor(hex) { var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16); return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#10201E" : "#FFFFFF"; }

  var CSS = [
    ":host{all:initial}",
    "[hidden]{display:none!important}",
    "*{box-sizing:border-box;font-family:'Hanken Grotesk',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}",
    ".root{--c:#2C47B8;--cf:#fff;--bg:#F8F8F5;--fg:#17203A;--mu:#566079;--ln:#CBCFC6;--so:#E9EBE6;position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:max(16px,env(safe-area-inset-bottom,0px));z-index:2147483000;color:var(--fg);font-size:15px;line-height:1.45}",
    "@media (prefers-color-scheme:dark){.root{--bg:#171D33;--fg:#E8EAF4;--mu:#A0A8C4;--ln:#2B3350;--so:#1E2540}}",
    ".launch{display:flex;align-items:center;gap:8px;border:0;background:var(--c);color:var(--cf);padding:12px 18px;border-radius:999px;font-weight:600;font-size:15px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.25)}",
    ".launch:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid var(--c);outline-offset:2px}",
    ".panel{position:absolute;right:0;bottom:56px;width:min(380px,calc(100vw - 32px));height:min(600px,calc(100vh - 100px));background:var(--bg);border:1px solid var(--ln);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden}",
    ".panel[hidden]{display:none}",
    ".head{background:var(--c);color:var(--cf);padding:14px 16px;display:flex;justify-content:space-between;align-items:center;gap:10px}",
    ".head b{font-size:16px} .head small{display:block;opacity:.85;font-size:12px}",
    ".x{background:none;border:0;color:inherit;font-size:22px;line-height:1;cursor:pointer;padding:4px 8px}",
    ".tabs.more{-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 36px),transparent);mask-image:linear-gradient(to right,#000 calc(100% - 36px),transparent)}",
    ".tabs{display:flex;border-bottom:1px solid var(--ln);background:var(--so);overflow-x:auto;scrollbar-width:thin;flex:none}",
    ".tabs button{flex:1 0 auto;border:0;background:none;color:var(--mu);padding:10px 12px;font-size:13.5px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap}",
    ".tabs button[aria-selected=true]{color:var(--fg);border-bottom-color:var(--c)}",
    ".body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}",
    ".msg{max-width:90%;padding:9px 12px;border-radius:12px;font-size:14.5px;white-space:pre-wrap}",
    ".msg.v{align-self:flex-end;background:var(--c);color:var(--cf)} .msg.a{align-self:flex-start;background:var(--so)}",
    ".msg small{display:block;margin-top:5px;color:var(--mu);font-size:12px}",
    ".chips{display:flex;gap:6px;flex-wrap:wrap} .chips button{border:1px solid var(--ln);background:var(--bg);color:var(--fg);padding:6px 10px;border-radius:14px;font-size:13px;cursor:pointer}",
    ".foot{padding:10px 14px;border-top:1px solid var(--ln);display:flex;flex-direction:column;gap:6px}",
    ".row{display:flex;gap:8px}",
    "input[type=text],textarea,select{width:100%;border:1px solid var(--ln);background:var(--bg);color:var(--fg);border-radius:8px;padding:9px 10px;font-size:14.5px}",
    "textarea{min-height:100px;resize:vertical}",
    ".btn{border:0;background:var(--c);color:var(--cf);padding:9px 14px;border-radius:8px;font-weight:600;font-size:14.5px;cursor:pointer;white-space:nowrap}",
    ".btn:disabled{opacity:.55;cursor:wait}",
    "label{display:flex;flex-direction:column;gap:5px;font-weight:600;font-size:13.5px} label.ck{flex-direction:row;gap:8px;font-weight:400;align-items:flex-start} label.ck input{margin-top:3px}",
    ".mu{color:var(--mu);font-size:12.5px} .box{background:var(--so);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px}",
    ".warn{background:#F8DCD8;color:#5B1410;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px}",
    ".day{border-top:1px solid var(--ln);padding-top:10px;display:flex;flex-direction:column;gap:3px} .day:first-of-type{border-top:0;padding-top:0}",
    ".ref{font:600 12px ui-monospace,Menlo,monospace;color:var(--c)} @media (prefers-color-scheme:dark){.ref{filter:brightness(1.6)}}",
    ".pill{display:inline-block;font-size:12px;font-weight:700;background:var(--so);color:var(--mu);padding:3px 7px;border-radius:4px}",
    ".opts{display:flex;gap:6px;flex-wrap:wrap} .opts label{flex-direction:row;align-items:center;gap:6px;font-weight:500;border:1px solid var(--ln);border-radius:14px;padding:5px 10px;cursor:pointer;background:var(--bg)} .opts label:has(input:checked){background:var(--c);color:var(--cf);border-color:var(--c)} .opts input{position:absolute;opacity:0;width:0;height:0} .opts label:has(input:focus-visible){outline:2px solid var(--c);outline-offset:2px}",
    ".card{border:1px solid var(--ln);border-radius:10px;padding:11px;display:flex;flex-direction:column;gap:3px} .card b{font-size:14.5px}",
    ".sel{font-size:12.5px;padding:5px 8px;width:auto}",
    "@media (max-width:480px){.panel{position:fixed;left:0;right:0;bottom:0;width:100%;height:85vh;border-radius:14px 14px 0 0}}"
  ].join("\n");

  var cfg, S = { tab: "ask", chat: [], busy: false, open: false }, mem = lget(), root, panel, bodyEl, footEl, tabsEl, launch, titleEl;

  function init() {
    fetch(BASE + "/api/public/" + CHURCH + "/config").then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (c) { cfg = c; build(); }).catch(function () { console.warn("[Plumb Line] could not load this church's settings"); });
  }
  function build() {
    var host = h("div", { id: "plumbline-host" }), sr = host.attachShadow({ mode: "open" });
    sr.appendChild(h("style", {}, CSS));
    root = h("div", { class: "root" });
    root.style.setProperty("--c", cfg.color || "#2C47B8"); root.style.setProperty("--cf", onColor(cfg.color || "#2C47B8"));
    titleEl = h("div", {}, [h("b", {}, cfg.name), h("small", {}, "Welcome. Ask anything.")]);
    panel = h("div", { class: "panel", role: "dialog", "aria-label": cfg.name + " assistant", hidden: true });
    var close = h("button", { class: "x", "aria-label": "Close", onclick: toggle }, "×");
    tabsEl = h("div", { class: "tabs", role: "tablist" });
    bodyEl = h("div", { class: "body", "aria-live": "polite" }); footEl = h("div", { class: "foot" });
    panel.appendChild(h("div", { class: "head" }, [titleEl, close])); panel.appendChild(tabsEl); panel.appendChild(bodyEl); panel.appendChild(footEl);
    launch = h("button", { class: "launch", "aria-expanded": "false", onclick: toggle }, ["💬 ", cfg.live ? "Live captions" : "Questions?"]);
    root.appendChild(panel); root.appendChild(launch); sr.appendChild(root);
    document.body.appendChild(host);
    root.addEventListener("keydown", function (e) { if (e.key === "Escape" && S.open) { toggle(); launch.focus(); } });
    draw();
  }
  function toggle() { S.open = !S.open; panel.hidden = !S.open; launch.setAttribute("aria-expanded", String(S.open)); if (S.open) draw(); }
  function tabs() {
    var f = cfg.features || {}, t = [];
    if (f.guide !== false) t.push(["ask", "Ask"]);
    if (f.visit !== false) t.push(["visit", "New here?"]);
    if (f.groups) t.push(["groups", "Groups"]);
    if ((cfg.today && cfg.today.length) || (cfg.studies && cfg.studies.length)) t.push(["today", "Today"]);
    if (f.week !== false) t.push(["week", "This week"]);
    if (f.prayer !== false) t.push(["prayer", "Prayer"]);
    if (f.care !== false) t.push(["care", "Help"]);
    if (f.moving) t.push(["moving", "Moving?"]);
    return t.length ? t : [["ask", "Ask"]];
  }
  function draw() {
    tabsEl.textContent = "";
    tabs().forEach(function (t) { tabsEl.appendChild(h("button", { role: "tab", "aria-selected": String(S.tab === t[0]), onclick: function () { S.tab = t[0]; draw(); } }, t[1])); });
    bodyEl.textContent = ""; footEl.textContent = ""; footEl.hidden = true;
    var avail = tabs().map(function (t) { return t[0]; }); if (avail.indexOf(S.tab) < 0) S.tab = avail[0];
    if (cfg.live) bodyEl.appendChild(h("a", { class: "box", href: BASE + "/live?church=" + encodeURIComponent(CHURCH), target: "_blank", rel: "noopener", style: "text-decoration:none;color:inherit;border-left:3px solid var(--c)" }, [h("b", {}, "Live now: " + cfg.live.title), h("span", { class: "mu" }, "Read the service as captions in your language. Opens in a new tab.")]));
    ({ ask: viewAsk, visit: viewVisit, groups: viewGroups, today: viewToday, week: viewWeek, prayer: viewPrayer, care: viewCare, moving: viewMoving }[S.tab] || viewAsk)();
    bodyEl.scrollTop = bodyEl.scrollHeight;
    var sel = tabsEl.querySelector("[aria-selected=true]");
    if (sel) { var l = sel.offsetLeft, r = l + sel.offsetWidth; if (r > tabsEl.scrollLeft + tabsEl.clientWidth) tabsEl.scrollLeft = r - tabsEl.clientWidth + 40; else if (l < tabsEl.scrollLeft) tabsEl.scrollLeft = Math.max(0, l - 20); }
    function hint() { tabsEl.classList.toggle("more", tabsEl.scrollWidth > tabsEl.clientWidth + 2 && tabsEl.scrollLeft + tabsEl.clientWidth < tabsEl.scrollWidth - 4); }
    if (!tabsEl.__hint) { tabsEl.__hint = true; tabsEl.addEventListener("scroll", hint); }
    hint(); setTimeout(hint, 60);
  }

  /* --- Ask --- */
  function viewAsk() {
    if (!S.chat.length) {
      bodyEl.appendChild(h("p", { class: "mu" }, "No question is too small. Answers come only from what " + cfg.name + " has confirmed. If the guide does not know, it will say so."));
      var chips = h("div", { class: "chips" });
      (cfg.suggestions || []).forEach(function (q) { chips.appendChild(h("button", { onclick: function () { ask(q); } }, q)); });
      bodyEl.appendChild(chips);
    }
    S.chat.forEach(function (m) {
      var d = h("div", { class: "msg " + (m.role === "user" ? "v" : "a") }, m.text);
      if (m.role !== "user") {
        var note = [];
        if (m.sources && m.sources.length) note.push("From: " + m.sources.join(", "));
        if (m.human) note.push(cfg.contact ? "To reach a person: " + cfg.contact : "A person on the team can help.");
        if (note.length) d.appendChild(h("small", {}, note.join(" · ")));
      }
      bodyEl.appendChild(d);
    });
    if (S.busy) bodyEl.appendChild(h("div", { class: "msg a" }, "Thinking…"));
    footEl.hidden = false;
    var ls = h("select", { class: "sel", "aria-label": "Language", onchange: function () { mem.lang = ls.value; lset(mem); } });
    (cfg.languages || ["English"]).forEach(function (l) { var o = h("option", { value: l }, l); if ((mem.lang || "English") === l) o.selected = true; ls.appendChild(o); });
    footEl.appendChild(h("div", { class: "row", style: "align-items:center;justify-content:space-between" }, [h("span", { class: "mu" }, "Language"), ls]));
    var inp = h("input", { type: "text", placeholder: "Type a question", "aria-label": "Your question", maxlength: "300", autocomplete: "off" });
    var btn = h("button", { class: "btn", disabled: S.busy }, "Ask");
    var f = h("form", { class: "row", onsubmit: function (e) { e.preventDefault(); var v = inp.value; inp.value = ""; ask(v); } }, [inp, btn]);
    footEl.appendChild(f);
    if (cfg.disclosure) footEl.appendChild(h("div", { class: "mu" }, cfg.disclosure));
  }
  function ask(q) {
    q = (q || "").trim(); if (!q || S.busy) return;
    S.chat.push({ role: "user", text: q }); S.busy = true; draw();
    api("ask", { lang: mem.lang || "English", messages: S.chat.map(function (m) { return { role: m.role, text: m.text }; }) }).then(function (r) {
      S.chat.push({ role: "assistant", text: r.answer, sources: r.sourceTitles, human: r.needsHuman });
    }).catch(function (e) { S.chat.push({ role: "assistant", text: e.message || "Something went wrong. Please try again." }); })
      .then(function () { S.busy = false; draw(); var i = footEl.querySelector("input"); if (i) i.focus(); });
  }


  /* --- New here? --- */
  function chipsPick(list, picked) {
    var box = h("div", { class: "opts" });
    list.forEach(function (it) {
      var cb = h("input", { type: "checkbox", value: it }); cb.addEventListener("change", function () { var i = picked.indexOf(it); if (cb.checked && i < 0) picked.push(it); if (!cb.checked && i >= 0) picked.splice(i, 1); });
      box.appendChild(h("label", {}, [cb, it]));
    });
    return box;
  }
  function viewVisit() {
    if (S.visitResult) {
      var r = S.visitResult, kids = [h("b", {}, "Here is what to know")];
      r.steps.forEach(function (s) { kids.push(h("div", { class: "card" }, [h("b", {}, s.title), h("span", {}, s.text)])); });
      if (r.groups && r.groups.length) kids.push(h("div", { class: "card" }, [h("b", {}, "A group you might like"), h("span", {}, r.groups[0].name + " · " + [r.groups[0].day, r.groups[0].time, r.groups[0].area].filter(Boolean).join(" · "))]));
      var note = r.followup === "now" ? "Thank you. A person will review a short note to you before anything is sent."
        : r.followup === "second" ? "Thank you. We will wait until after your second visit before reaching out, as you asked."
        : "Thank you. We saved nothing that identifies you, and no one will contact you.";
      kids.push(h("div", { class: "box" }, [h("span", {}, note)]));
      kids.push(h("button", { class: "btn", onclick: function () { S.visitResult = null; draw(); } }, "Start over"));
      kids.forEach(function (k) { bodyEl.appendChild(k); }); return;
    }
    var picked = [], name = h("input", { type: "text", placeholder: "First name (optional)", maxlength: "40", "aria-label": "First name" });
    var kidsIn = h("input", { type: "text", placeholder: "Kids' ages, if any (optional)", maxlength: "60", "aria-label": "Kids' ages" });
    var contact = h("input", { type: "text", placeholder: "Email or phone (optional)", maxlength: "120", "aria-label": "Email or phone" });
    var consent = h("input", { type: "checkbox" }), consentRow = h("label", { class: "ck", hidden: true }, [consent, "Yes, someone from " + cfg.name + " may contact me."]);
    var paceBox = h("div", { style: "display:none;flex-direction:column;gap:5px" });
    var pace = "second";
    [["second", "After my second visit"], ["now", "This week"], ["none", "Please don't contact me"]].forEach(function (p) {
      var rb = h("input", { type: "radio", name: "pl-pace", value: p[0], checked: p[0] === "second" }); rb.addEventListener("change", function () { pace = p[0]; });
      paceBox.appendChild(h("label", { class: "ck" }, [rb, p[1]]));
    });
    contact.addEventListener("input", function () { var on = contact.value.trim().length > 0; consentRow.hidden = !on; paceBox.style.display = on ? "flex" : "none"; });
    var msg = h("div", { class: "mu", role: "status" }), btn = h("button", { class: "btn", disabled: S.busy }, S.busy ? "One moment…" : "Show me what to expect");
    bodyEl.appendChild(h("p", { class: "mu" }, "First time with " + cfg.name + "? Tell us what matters to you. Leaving contact details is optional, and you choose if and when we reach out."));
    bodyEl.appendChild(h("form", { class: "box", onsubmit: function (e) {
      e.preventDefault(); if (S.busy) return;
      if (contact.value.trim() && !consent.checked) { msg.textContent = "Please tick the box if you want us to contact you."; return; }
      S.busy = true; btn.disabled = true;
      api("visit", { interests: picked, name: name.value, kids: kidsIn.value, contact: contact.value, consent: consent.checked, pace: pace })
        .then(function (r) { S.visitResult = r; }).catch(function (er) { msg.textContent = er.message; }).then(function () { S.busy = false; draw(); });
    } }, [h("span", { class: "mu" }, "What are you hoping to find?"), chipsPick(cfg.interests || [], picked), name, kidsIn, contact, consentRow, paceBox, btn, msg]));
  }

  /* --- Groups --- */
  function viewGroups() {
    var ta = h("textarea", { placeholder: "Example: a weeknight group for young families near the north side", maxlength: "300", "aria-label": "What you are looking for", style: "min-height:70px" });
    var out = h("div", { style: "display:flex;flex-direction:column;gap:8px" }), msg = h("div", { class: "mu", role: "status" });
    function run() {
      msg.textContent = "Looking…";
      api("groups", { text: ta.value }).then(function (r) {
        out.textContent = ""; msg.textContent = r.matches.length ? "" : "No open groups match yet. Ask a person at the welcome desk.";
        r.matches.forEach(function (g) { out.appendChild(h("div", { class: "card" }, [h("b", {}, g.name), h("span", { class: "mu" }, [g.day, g.time, g.area, g.stage].filter(Boolean).join(" · ")), h("span", {}, g.desc), g.why ? h("span", { class: "mu" }, g.why) : ""])); });
      }).catch(function (er) { msg.textContent = er.message; });
    }
    bodyEl.appendChild(h("p", { class: "mu" }, "Describe the kind of group you would enjoy. Nothing you type here is saved."));
    bodyEl.appendChild(h("form", { class: "box", onsubmit: function (e) { e.preventDefault(); run(); } }, [ta, h("div", { class: "row" }, [h("button", { class: "btn" }, "Find groups"), h("button", { type: "button", class: "btn", style: "background:var(--so);color:var(--fg)", onclick: function () { ta.value = ""; run(); } }, "Show all")]), msg]));
    bodyEl.appendChild(out);
  }

  /* --- Help (care) --- */
  function viewCare() {
    if (S.careDone) { bodyEl.appendChild(h("div", { class: "box" }, [h("b", {}, "Your request reached our care team"), h("span", {}, "A person will contact you. Only the pastoral and care team can see this."), h("button", { class: "btn", onclick: function () { S.careDone = false; draw(); } }, "Send another")])); return; }
    if (S.careCrisis) { bodyEl.appendChild(h("div", { class: "warn" }, [h("b", {}, "Thank you for telling us."), h("span", {}, cfg.pastor + " has been alerted and will contact you personally."), h("span", {}, "If you or someone near you is in immediate danger, please contact your local emergency number now.")])); return; }
    var kind = h("select", { "aria-label": "What would help" }); [["meal", "A meal"], ["ride", "A ride"], ["visit", "A visit or a call"], ["errand", "Help with an errand"], ["other", "Something else"]].forEach(function (o) { kind.appendChild(h("option", { value: o[0] }, o[1])); });
    var text = h("textarea", { placeholder: "Tell us a little about what would help", maxlength: "500", "aria-label": "What would help", style: "min-height:80px" });
    var name = h("input", { type: "text", placeholder: "Your first name", maxlength: "40", "aria-label": "First name" }), contact = h("input", { type: "text", placeholder: "Best email or phone", maxlength: "120", "aria-label": "Email or phone" });
    var consent = h("input", { type: "checkbox" }), msg = h("div", { class: "mu", role: "status" }), btn = h("button", { class: "btn", disabled: S.busy }, S.busy ? "Sending…" : "Ask for help");
    bodyEl.appendChild(h("p", { class: "mu" }, "Need practical help? Meals, rides, a visit. Your request goes to a person on the care team, not to a chatbot."));
    bodyEl.appendChild(h("form", { class: "box", onsubmit: function (e) {
      e.preventDefault(); if (S.busy) return;
      if (!text.value.trim() || !contact.value.trim()) { msg.textContent = "Tell us what would help and how to reach you."; return; }
      if (!consent.checked) { msg.textContent = "Please tick the box so we may share this with our care team."; return; }
      S.busy = true; btn.disabled = true;
      api("care", { kind: kind.value, text: text.value, name: name.value, contact: contact.value, consent: true })
        .then(function (r) { if (r.crisis) S.careCrisis = true; else S.careDone = true; }).catch(function (er) { msg.textContent = er.message; }).then(function () { S.busy = false; draw(); });
    } }, [h("label", {}, ["What would help", kind]), text, name, contact, h("label", { class: "ck" }, [consent, "I agree to share this with " + cfg.name + "'s care team so they can contact me."]), btn, msg]));
  }

  /* --- This week --- */
  /* --- Today: daily devotional, studies, Bible lookup --- */
  function localDate(d) { d = d || new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function dayDiff(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000); }
  function viewToday() {
    var td = localDate(), list = (cfg.today || []).filter(function (d) { return d.date <= td; }), cur = list[0];
    function devo(d, full) {
      var vname = ""; (cfg.versions || []).forEach(function (v) { if (v.id === d.version) vname = v.name; });
      return h("div", { class: "box" }, [h("span", { class: "ref" }, d.ref || ""), h("b", {}, d.title),
        d.text ? h("blockquote", { class: "mu", style: "margin:0;padding-left:10px;border-left:2px solid var(--ln)" }, d.text + (vname ? " (" + vname + ")" : "")) : null,
        h("span", {}, d.reflection), d.question ? h("span", {}, [h("b", {}, "Think about it: "), d.question]) : null, d.prayer ? h("span", { class: "mu" }, "Prayer: " + d.prayer) : null]);
    }
    if (cur) { bodyEl.appendChild(h("b", {}, cur.date === td ? "Today" : "Latest")); bodyEl.appendChild(devo(cur)); }
    list.slice(1, 7).forEach(function (d) { bodyEl.appendChild(h("details", {}, [h("summary", {}, d.date + " · " + d.title), devo(d)])); });
    (cfg.studies || []).forEach(function (x) {
      var n = x.items.length, step = x.cadence === "daily" ? 1 : 7, idx = Math.floor(dayDiff(x.start, td) / step), head = h("b", {}, x.title);
      bodyEl.appendChild(h("div", { class: "box" }, [h("span", { class: "pill" }, x.kind === "study" ? "Bible study" : "Sermon series"), head, x.blurb ? h("span", { class: "mu" }, x.blurb) : null,
        idx < 0 ? h("span", { class: "mu" }, "Starts " + x.start + ".") : null].concat(
        idx < 0 ? [] : x.items.slice(0, Math.min(n, idx + 1)).reverse().map(function (it, k) {
          var body = h("div", { class: "box" }, [h("span", { class: "ref" }, it.passage || ""), h("span", {}, it.summary),
            (it.questions && it.questions.length) ? h("div", {}, [h("b", {}, "Discuss"), h("ol", { style: "margin:4px 0 0;padding-left:18px" }, it.questions.map(function (q) { return h("li", {}, q); }))]) : null,
            it.application ? h("span", {}, [h("b", {}, "This week: "), it.application]) : null, it.prayer ? h("span", { class: "mu" }, "Prayer: " + it.prayer) : null]);
          return h("details", k === 0 ? { open: true } : {}, [h("summary", {}, "Part " + it.n + " of " + n + " · " + it.title), body]);
        }).concat(idx >= n - 1 ? [h("span", { class: "mu" }, "Finished. Thank you for following along.")] : []))));
    });
    var ref = h("input", { type: "text", maxlength: "40", placeholder: "John 3:16 or Psalm 23", "aria-label": "Passage" }), ver = h("select", { "aria-label": "Version" }, (cfg.versions || []).map(function (v) { return h("option", { value: v.id }, v.name); }));
    var out = h("div", { class: "mu", role: "status" });
    bodyEl.appendChild(h("form", { class: "box", onsubmit: function (e) {
      e.preventDefault(); if (!ref.value.trim()) return; out.textContent = "Looking it up…";
      fetch(BASE + "/api/public/" + CHURCH + "/bible?ref=" + encodeURIComponent(ref.value) + "&v=" + encodeURIComponent(ver.value)).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error); return j; }); })
        .then(function (j) { out.textContent = ""; out.appendChild(h("b", { style: "color:var(--fg)" }, j.ref)); out.appendChild(h("p", { style: "color:var(--fg);margin:4px 0" }, j.text)); }).catch(function (er) { out.textContent = er.message; });
    } }, [h("b", {}, "Read a passage"), ref, ver, h("button", { class: "btn" }, "Look up"), out, h("span", { class: "mu" }, "Public-domain versions only.")]));
  }

  function viewWeek() {
    var j = cfg.journey;
    if (!j) { bodyEl.appendChild(h("div", { class: "box" }, [h("b", {}, "Nothing published yet"), h("span", { class: "mu" }, "When " + cfg.pastor + " approves this week's reading plan, it will appear here.")])); return; }
    bodyEl.appendChild(h("b", {}, j.title));
    bodyEl.appendChild(h("p", { class: "mu" }, "Approved by " + j.approvedBy + ". Drafted with AI help from the message. Open the passages in your own Bible."));
    j.days.forEach(function (d) {
      bodyEl.appendChild(h("div", { class: "day" }, [h("span", { class: "ref" }, "DAY " + d.day + " · " + d.passage), h("b", {}, d.theme), h("span", {}, d.question), h("span", { class: "mu" }, "Try: " + d.action)]));
    });
  }

  /* --- Prayer --- */
  function accountBox() {
    var m = mem.member, wrap = h("div", { class: "box" }), msg = h("div", { class: "mu", role: "status" });
    function out() { mem.member = null; lset(mem); draw(); }
    if (m) {
      wrap.appendChild(h("span", {}, ["Signed in as ", h("b", {}, m.name), ". Your shared requests and replies are saved to your account."]));
      var list = h("div", { class: "box" }); wrap.appendChild(list);
      api("member/me", null, m.token).then(function (r) {
        if (!r.prayers.length) { list.appendChild(h("span", { class: "mu" }, "No shared requests yet.")); return; }
        r.prayers.slice(0, 8).forEach(function (p) {
          var label = p.reply ? "Reply from " + p.reply.by : p.status === "praying" ? "The team is praying for you" : p.status === "closed" ? "Closed" : "Received, waiting for the team";
          list.appendChild(h("div", {}, [h("span", { class: "pill" }, p.theme + " · " + label), p.reply ? h("p", { style: "margin:4px 0 0" }, p.reply.text) : null]));
        });
      }).catch(function (e) { if (/sign in/i.test(e.message)) out(); });
      wrap.appendChild(h("div", { class: "row" }, [
        h("button", { type: "button", class: "btn ghost", onclick: out }, "Sign out"),
        h("button", { type: "button", class: "btn ghost", onclick: function () {
          if (!confirm("Delete your account and every request you shared? This cannot be undone.")) return;
          api("member/delete", {}, m.token).then(out).catch(function (e) { msg.textContent = e.message; });
        } }, "Delete my account")]));
      wrap.appendChild(msg); return wrap;
    }
    var nm = h("input", { type: "text", maxlength: "40", placeholder: "First name and last initial", "aria-label": "Your name", autocomplete: "username" });
    var pw = h("input", { type: "password", maxlength: "200", placeholder: "Passcode (6 or more characters)", "aria-label": "Passcode", autocomplete: "current-password" });
    function go(kind) {
      msg.textContent = "…";
      api("member/" + kind, { name: nm.value, pass: pw.value }).then(function (r) { mem.member = { name: r.name, token: r.token }; lset(mem); draw(); }).catch(function (e) { msg.textContent = e.message; });
    }
    var d = h("details", {}, [h("summary", {}, "Sign in to keep your requests on every phone (optional)"),
      h("div", { class: "box", style: "margin-top:8px" }, [nm, pw, h("div", { class: "row" }, [h("button", { type: "button", class: "btn", onclick: function () { go("login"); } }, "Sign in"), h("button", { type: "button", class: "btn ghost", onclick: function () { go("signup"); } }, "Create account")]), msg,
        h("span", { class: "mu" }, "An account keeps only your name and passcode. No email or phone. You never need one to ask a question or request prayer.")])]);
    return d;
  }
  function viewPrayer() {
    if (S.crisis) {
      bodyEl.appendChild(h("div", { class: "warn" }, [h("b", {}, "Thank you for telling us."), h("span", {}, cfg.pastor + " has been alerted and will reach out personally."), h("span", {}, "If you or someone near you is in immediate danger, please contact your local emergency number now.")]));
      return;
    }
    var ta = h("textarea", { placeholder: "Write as much or as little as you like", maxlength: "1500", "aria-label": "Prayer request" });
    var fol = h("input", { type: "checkbox", checked: true });
    var shr = h("input", { type: "checkbox" });
    var nm = h("input", { type: "text", maxlength: "40", placeholder: "First name (optional)", "aria-label": "First name" });
    var ct = h("input", { type: "text", maxlength: "80", placeholder: "Phone or email (optional)", "aria-label": "Phone or email" });
    var more = h("div", { class: "box", style: "display:none" }, [nm, ct, h("span", { class: "mu" }, "Leave contact details only if you want a person to reach you. " + cfg.pastor + " can reply right here without them.")]);
    shr.onchange = function () { more.style.display = shr.checked ? "flex" : "none"; };
    var btn = h("button", { class: "btn", disabled: S.busy }, S.busy ? "Receiving…" : "Send request");
    var msg = h("div", { class: "mu", role: "status" });
    var f = h("form", { class: "box", onsubmit: function (e) {
      e.preventDefault(); if (!ta.value.trim() || S.busy) return;
      S.busy = true; btn.disabled = true;
      api("prayer", { text: ta.value, follow: fol.checked, share: shr.checked, name: shr.checked ? nm.value : "", contact: shr.checked ? ct.value : "" }, mem.member && mem.member.token).then(function (r) {
        if (r.crisis) { S.crisis = true; } else {
          mem.prayers = (mem.prayers || []).concat([{ theme: r.theme, follow: r.follow, code: r.code || null, at: Date.now() }]).slice(-20); lset(mem);
          msg.textContent = r.code ? "Received. Your request is with the prayer team. Come back here to see a reply." : "Received. Thank you.";
        }
      }).catch(function (er) { msg.textContent = er.message; }).then(function () { S.busy = false; draw(); });
    } }, [
      h("label", {}, ["Your request", ta]),
      h("label", { class: "ck" }, [shr, "Share with the prayer team so they can pray for me and write back."]),
      more,
      h("label", { class: "ck" }, [fol, "A prayer partner may check in on me later. A person approves every note."]),
      btn, msg,
      h("span", { class: "mu" }, "By default your words are used only to pick a general theme and are not stored. If you share with the prayer team, only " + cfg.pastor + " and the team can read it, and you can remove it any time below.")]);
    bodyEl.appendChild(accountBox());
    bodyEl.appendChild(f);
    var mine = mem.member ? [] : (mem.prayers || []).filter(function (p) { return p.code; }), box = h("div", { class: "box" });
    (mem.prayers || []).filter(function (p) { return !p.code; }).slice(-3).forEach(function (p) { bodyEl.appendChild(h("div", { class: "mu" }, ["Sent privately: ", h("span", { class: "pill" }, p.theme), p.follow ? " · check-in requested" : ""])); });
    if (mine.length) {
      bodyEl.appendChild(box);
      api("prayer-status", { codes: mine.map(function (p) { return p.code; }) }).then(function (r) {
        var by = {}; (r.items || []).forEach(function (i) { by[i.code] = i; });
        box.appendChild(h("b", {}, "Your shared requests"));
        mine.slice(-5).reverse().forEach(function (p) {
          var i = by[p.code];
          if (!i) { box.appendChild(h("span", { class: "mu" }, "A request is no longer on the prayer team's list.")); return; }
          var label = i.reply ? "Reply from " + i.reply.by : i.status === "praying" ? "The team is praying for you" : i.status === "closed" ? "Closed" : "Received, waiting for the team";
          var rm = h("button", { type: "button", class: "btn ghost", onclick: function () {
            api("prayer-remove", { code: p.code }).then(function () { mem.prayers = mem.prayers.filter(function (x) { return x.code !== p.code; }); lset(mem); draw(); });
          } }, "Remove my request");
          box.appendChild(h("div", { class: "box" }, [h("span", { class: "pill" }, p.theme + " · " + label), i.reply ? h("span", {}, i.reply.text) : null, rm]));
        });
      }).catch(function () {});
    }
  }

  /* --- Moving --- */
  function viewMoving() {
    if (S.moveResult) {
      var r = S.moveResult;
      bodyEl.appendChild(h("div", { class: "box" }, r.matched
        ? [h("b", {}, "Sent to " + cfg.pastor + " for approval"), h("span", {}, "We matched you with " + r.church + " in " + r.city + "." + (r.also && r.also.length ? " Also considered: " + r.also.join(", ") + "." : "")), h("span", { class: "mu" }, "Your pastor reviews the letter before anything is shared.")]
        : [h("b", {}, "No partner church there yet"), h("span", { class: "mu" }, "Your pastor may still know someone. Ask them directly.")]));
      return;
    }
    var name = h("input", { type: "text", placeholder: "Ada", maxlength: "40" }), city = h("input", { type: "text", placeholder: "City you are moving to", maxlength: "80", list: "pl-cities" });
    var dl = h("datalist", { id: "pl-cities" }); (cfg.partnerCities || []).forEach(function (c) { dl.appendChild(h("option", { value: c })); });
    var kids = h("input", { type: "checkbox" }), consent = h("input", { type: "checkbox" });
    function sel(opts) { var s = h("select"); opts.forEach(function (o) { s.appendChild(h("option", { value: o[0] }, o[1])); }); return s; }
    var lang = sel([["", "No preference"], ["English", "English"], ["Spanish", "Spanish"], ["Yoruba", "Yoruba"], ["Pidgin", "Pidgin"]]);
    var style = sel([["", "No preference"], ["Contemporary", "Contemporary"], ["Blended", "Blended"], ["Traditional", "Traditional"]]);
    var msg = h("div", { class: "mu", role: "status" }), btn = h("button", { class: "btn", disabled: S.busy }, S.busy ? "Drafting…" : "Ask my pastor");
    bodyEl.appendChild(h("p", { class: "mu" }, "Leaving us? With your consent, " + cfg.pastor + " can write a letter of commendation to a partner church in your new city."));
    bodyEl.appendChild(h("form", { class: "box", onsubmit: function (e) {
      e.preventDefault();
      if (!consent.checked) { msg.textContent = "Please tick the consent box first."; return; }
      if (!city.value.trim() || S.busy) { msg.textContent = "Tell us the city you are moving to."; return; }
      S.busy = true; btn.disabled = true;
      api("move", { name: name.value, city: city.value, kids: kids.checked, lang: lang.value, style: style.value, consent: true })
        .then(function (r) { S.moveResult = r; }).catch(function (er) { msg.textContent = er.message; }).then(function () { S.busy = false; draw(); });
    } }, [h("label", {}, ["First name", name]), h("label", {}, ["City", city, dl]), h("label", { class: "ck" }, [kids, "Children's ministry matters to us"]),
      h("label", {}, ["Language community", lang]), h("label", {}, ["Worship style", style]),
      h("label", { class: "ck" }, [consent, "I consent to my pastor sharing my first name and these preferences with the receiving church. Nothing else is shared."]), btn, msg]));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
