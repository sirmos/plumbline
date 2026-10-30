"use strict";
const crypto = require("crypto");
const { hashPass, defaults } = require("./store");

const DOCTRINE = `We believe the Bible is God's Word and our final authority for faith and life.
We believe in one God, eternally existing as Father, Son and Holy Spirit.
We believe salvation is by grace through faith in Jesus Christ, not by works.
We believe the church is a family: we care for one another and for our neighbors.
We hold to a historic, orthodox Christian faith and avoid speculative claims about private revelation.`;

const FAQ = [
  { id: "f1", q: "Service times", a: "Edit this answer in Setup. Example: Sundays at 9:00 AM and 11:00 AM." },
  { id: "f2", q: "Where are you and where do I park?", a: "Edit this answer in Setup. Add your address, parking and which door to use." },
  { id: "f3", q: "Kids check-in", a: "Edit this answer in Setup. Say when check-in opens, how kids are kept safe and how parents pick up." },
  { id: "f4", q: "Accessibility", a: "Edit this answer in Setup. Mention step-free access, accessible parking and any hearing or large-print help." },
  { id: "f5", q: "What should I wear?", a: "Come as you are." },
  { id: "f6", q: "What happens at a service?", a: "Edit this answer in Setup. Describe the order of a typical service and how long it lasts." },
  { id: "f7", q: "Do I have to give anything?", a: "No. Guests are never expected to give." },
  { id: "f8", q: "Small groups", a: "Edit this answer in Setup. Say when groups meet and how to join one." }
];

function slug(name) {
  const s = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36);
  return (s.length >= 3 ? s : "church") + "-" + crypto.randomBytes(2).toString("hex");
}

function newChurch(name, pass) {
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    id: slug(name), name: String(name).slice(0, 80), pastor: "Pastor", contact: "", color: "#0E5A58",
    salt, passHash: hashPass(pass, salt), created: new Date().toISOString(),
    doctrine: DOCTRINE,
    rules: { noQuote: true, noPromise: true, crisis: true, disclose: true },
    faq: FAQ.map(f => ({ ...f })), partners: [], origins: [],
    published: null, queue: [], log: [], nextId: 1, friction: [],
    themeCounts: {}, stats: { questions: 0, unanswered: 0, prayers: 0, crisis: 0, moves: 0, visits: 0, care: 0, groups: 0 },
    ...defaults()
  };
}
module.exports = { newChurch, DOCTRINE };
