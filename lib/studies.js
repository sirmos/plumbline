"use strict";
// Daily devotionals and multi-week series or Bible studies. Normalisers keep whatever the AI (or a person) sends
// inside safe limits; fallbacks give a usable outline with no AI at all.
const clamp = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
const lines = (s, n) => String(s == null ? "" : s).trim().slice(0, n);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = d => { if (!DATE.test(String(d))) return false; const t = new Date(d + "T00:00:00Z"); return !isNaN(t) && t.toISOString().slice(0, 10) === d; };
const addDays = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

const VERSES = ["Psalm 23", "Philippians 4:6-7", "Proverbs 3:5-6", "Isaiah 41:10", "Matthew 11:28-30", "Romans 8:28", "Joshua 1:9", "Psalm 46:1-3", "John 15:5", "Colossians 3:12-14", "Micah 6:8", "Psalm 121", "1 Thessalonians 5:16-18", "Lamentations 3:22-23", "Galatians 5:22-23", "James 1:5", "Psalm 27:1", "Matthew 6:33", "2 Corinthians 12:9", "Hebrews 11:1", "Psalm 139:1-4", "Romans 12:1-2", "Ephesians 2:8-10", "Psalm 119:105", "John 14:27", "1 Peter 5:6-7", "Psalm 34:8", "Luke 11:9-10", "Revelation 21:4", "Deuteronomy 31:6", "Psalm 62:1-2"];

function devotional(x, i, passage) {
  x = x || {};
  return { title: clamp(x.title, 100), ref: clamp(x.ref || x.passage || passage, 60), reflection: lines(x.reflection || x.body, 1400), question: clamp(x.question, 300), prayer: lines(x.prayer, 500) };
}
function devotionalFallback(topic, n, startRef) {
  const t = clamp(topic, 80) || "trusting God";
  return Array.from({ length: n }, (_, i) => ({
    title: "Day " + (i + 1) + ": " + t,
    ref: VERSIONS_AT(startRef, i),
    reflection: "Read the passage slowly, twice. Notice one word or phrase that stands out. Ask what it shows you about God, and what it asks of you today in the matter of " + t + ".",
    question: "What is one small way you can respond to this passage today?",
    prayer: "Lord, help me to take in what I read and to live it out today. Amen."
  }));
}
function VERSIONS_AT(startRef, i) { return startRef && i === 0 ? clamp(startRef, 60) : VERSES[i % VERSES.length]; }

function item(x, i, passage) {
  x = x || {};
  const qs = (Array.isArray(x.questions) ? x.questions : []).map(q => clamp(q, 260)).filter(Boolean).slice(0, 6);
  return { n: i + 1, title: clamp(x.title, 100), passage: clamp(x.passage || passage, 80), summary: lines(x.summary, 700), questions: qs, application: clamp(x.application, 300), prayer: lines(x.prayer, 400) };
}
function seriesFallback(topic, passage, n) {
  const t = clamp(topic || passage, 80) || "this passage";
  return Array.from({ length: n }, (_, i) => ({
    title: "Part " + (i + 1) + " of " + n + ": " + t,
    passage: clamp(passage, 80) || VERSES[i % VERSES.length],
    summary: "Offline outline. Read the passage together and say in your own words what it teaches about " + t + ".",
    questions: ["What stands out to you in this passage?", "What does it show us about God?", "What does it ask of us this week?"],
    application: "Choose one concrete step to take this week and tell someone about it.",
    prayer: "Lord, teach us through your word and help us to do what it says. Amen."
  }));
}
module.exports = { clamp, lines, isDate, addDays, devotional, devotionalFallback, item, seriesFallback };
