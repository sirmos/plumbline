"use strict";
// A fictional demo church for judges and first-time visitors. Created at start-up only when DEMO_PASS is set,
// and only if it does not exist yet. Everything in it is made up. Nothing here is a real person or church.
const crypto = require("crypto");
const studies = require("./studies");
const ID = "harbor-demo";

function build(newChurch, pass, today) {
  const c = newChurch("Harbor Community Church (demo)", pass);
  c.id = ID; c.pastor = "Pastor Amara"; c.contact = "Call the office on 555-0100 or email hello@harbor.example";
  c.site = { on: true, about: "This is a fictional demo church with sample data, so you can explore Plumb Line safely. Harbor is a small, friendly church by the water. Come as you are.", address: "12 Harbor Road (fictional)", times: "Sundays 9:00 AM and 11:00 AM\nWednesdays 7:00 PM, prayer", phone: "555-0100", email: "hello@harbor.example" };
  const set = (q, a) => { const f = c.faq.find(x => x.q === q); if (f) f.a = a; };
  set("Service times", "Sundays at 9:00 AM and 11:00 AM. Wednesday prayer is at 7:00 PM.");
  set("Where are you and where do I park?", "We meet at 12 Harbor Road. Parking is free behind the building. Use the blue door.");
  set("Kids check-in", "Check-in opens 20 minutes before each service at the red door. Every child gets a matching tag with the parent.");
  set("Accessibility", "The building is step-free, with accessible parking by the blue door and large-print notes at the welcome desk.");
  set("What happens at a service?", "About 75 minutes: singing, a short Bible message, and prayer. Coffee afterwards.");
  set("Small groups", "Groups meet through the week in homes and at church. Ask the guide to find one near you.");
  c.groups = [
    { id: "g1", name: "Young families", day: "Thursday", time: "6:30 PM", area: "North side", stage: "Young families", topic: "Bible and prayer", desc: "Dinner together, kids welcome, a short Bible conversation.", open: true },
    { id: "g2", name: "Morning women's study", day: "Tuesday", time: "9:30 AM", area: "Central", stage: "Any", topic: "Bible study", desc: "A relaxed study over coffee.", open: true },
    { id: "g3", name: "Young adults", day: "Friday", time: "7:30 PM", area: "Harbor Road", stage: "18 to 30", topic: "Friendship and faith", desc: "Games, food and honest questions.", open: true }
  ];
  c.partners = [{ id: "p1", name: "Lakeside Fellowship (fictional)", city: "Lakeside", contact: "welcome@lakeside.example" }];
  c.published = { title: "Rest for the weary", approvedAt: new Date().toISOString(), days: [
    { day: 1, passage: "Matthew 11:28-30", theme: "Come to Jesus", question: "What are you carrying that you could hand to Jesus today?", action: "Name one burden in a sentence and pray it out loud.", source: [1] },
    { day: 2, passage: "Psalm 23", theme: "The Shepherd", question: "Where have you seen care like a shepherd's this week?", action: "Thank someone who looked after you.", source: [2] },
    { day: 3, passage: "Philippians 4:6-7", theme: "Peace in place of worry", question: "What worry could become a prayer?", action: "Turn one worry into a prayer on paper.", source: [3] }
  ] };
  for (let i = 0; i < 7; i++) {
    const t = ["Rest", "Trust", "Peace", "Gratitude", "Patience", "Kindness", "Hope"][i];
    c.devotionals.push({ id: "d" + i, status: "published", at: new Date().toISOString(), date: studies.addDays(today, i - 1), title: t + " for today", ref: ["Matthew 11:28", "Proverbs 3:5-6", "John 14:27", "1 Thessalonians 5:18", "James 1:4", "Ephesians 4:32", "Romans 15:13"][i], text: "", version: "web",
      reflection: "Sample devotional for the demo. Read the passage slowly, notice one word that stands out, and ask what it shows you about God and about today.", question: "What is one small way to live this out today?", prayer: "Lord, help me to take this in and live it. Amen.", flags: [], approvedBy: c.pastor, approvedAt: new Date().toISOString() });
  }
  c.series = [{ id: "s1", kind: "study", status: "published", at: new Date().toISOString(), title: "The Sermon on the Mount", blurb: "A four-week small-group study.", cadence: "weekly", start: studies.addDays(today, -7), flags: [],
    items: [["Blessed are the poor in spirit", "Matthew 5:1-12"], ["Salt and light", "Matthew 5:13-16"], ["Treasure in heaven", "Matthew 6:19-24"], ["Build on the rock", "Matthew 7:24-27"]].map(([title, passage], i) => studies.item({ title, passage,
      summary: "Sample summary for the demo. Read the passage together and say in your own words what it teaches.", questions: ["What stands out to you?", "What does it show us about God?", "What does it ask of us this week?"], application: "Choose one step to take this week.", prayer: "Lord, teach us and help us do what it says." }, i, passage)) }];
  const ago = h => new Date(Date.now() - h * 3600000).toISOString();
  c.prayers = [
    { id: "pd1", h: crypto.randomBytes(8).toString("hex"), at: ago(5), theme: "Health", status: "new", name: "Demo visitor", contact: "", text: "Please pray for my mother's surgery on Tuesday. (Sample request)", reply: null, m: null },
    { id: "pd2", h: crypto.randomBytes(8).toString("hex"), at: ago(30), theme: "Work", status: "replied", name: "Sample member", contact: "", text: "I start a new job on Monday and I am nervous. (Sample request)", reply: { text: "We are praying for you this week as you start. You are not alone.", at: ago(20), by: c.pastor }, m: null }
  ];
  c.visitors = [
    { id: "v1", at: ago(26), name: "Sample visitor", contact: "sample@example.com", kids: true, interests: ["Kids", "Small groups"], pace: "week", status: "new", group: "Young families" },
    { id: "v2", at: ago(70), name: "Another sample", contact: "555-0111", kids: false, interests: ["Prayer"], pace: "second", status: "contacted", group: "" }
  ];
  c.care = [{ id: "c1", at: ago(10), kind: "meal", name: "Sample member", contact: "555-0122", text: "We had a baby last week and would love a meal or two. (Sample request)", tasks: [{ t: "Confirm days and allergies", done: false }, { t: "Choose a delivery day and a volunteer", done: false }, { t: "Drop off with a short note", done: false }], status: "new", assignee: "", live: false, via: "sample" }];
  c.nextId = 10;
  c.queue = [{ id: 1, status: "pending", at: ago(3), type: "followup", agent: "First Visit", title: "Follow-up for Sample visitor", body: "Hi, thank you for visiting Harbor Community Church. We would love to help you find a group for your family. Reply here any time and a real person will answer.", flags: [], score: 94, live: false, via: "sample", meta: { visitor: "v1" } }];
  c.log = [{ id: 2, at: ago(3), agent: "First Visit", what: "Follow-up drafted for a sample visitor", mode: "sample", item: 1, decision: "awaiting pastor" }];
  const d = {}; for (let i = 13; i >= 0; i--) d[studies.addDays(today, -i)] = { q: 6 + ((i * 7) % 9), p: 1 + (i % 4), v: 1 + (i % 3), c: 0, g: i % 4, h: i % 3 };
  c.daily = d; c.stats = { ...c.stats, questions: 140, prayers: 30, visits: 20, care: 12, groups: 40 };
  const salt = crypto.randomBytes(16).toString("hex");
  c.staff = [{ id: "udemo1", name: "Ruth Demo", role: "team", salt, passHash: require("./store").hashPass(pass, salt), at: new Date().toISOString() }];
  return c;
}

function ensure(store, newChurch, pass, opts) { // refresh: rebuild the demo at every start so its dates stay current
  if (!pass || (store.exists(ID) && !(opts && opts.refresh))) return false;
  store.put(build(newChurch, pass, new Date().toISOString().slice(0, 10)));
  return true;
}
module.exports = { ensure, ID };
