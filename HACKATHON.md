# What is new in the hackathon window

The AI for Church Hackathon judges only work done in the build window (Oct 30 to Nov 27, 2026). Plumb Line began before it, so this file separates the two.

## Baseline (built before Oct 30, version 0.3.0)

Committed first, on its own, as "Baseline: Plumb Line v0.3.0 (pre-window)".

- Multi-church server, JSON storage, sign-in, rate limits, domain lock
- Embeddable widget: Ask, New here, Groups, This week, Prayer, Help, Moving
- Pastor dashboard: review queue, visitors, care board, sermon to week, insight, doctrine, FAQ, partners, policy, AI log
- Fixed-rule crisis alert (not AI), consent and erase
- AI provider router with free-tier failover and privacy tiers (`lib/ai.js`, `test/router.js`)

## Built in the window

Each item is a later commit.

| Feature | Files | Tests |
|---|---|---|
| **Live Pulpit**: live captions of a service in 12 languages, joined by QR code | `lib/pulpit.js`, `public/live.html`, `public/qr.js`, Live Pulpit view in `public/admin.html`, routes in `server.js` | `test/pulpit.js` (38 checks) |
| Speech-to-text with failover and silence/phantom filtering | `transcribe` in `lib/ai.js` | `test/pulpit.js` |
| "Live now" banner in the website widget | `public/widget.js` | browser check |
| **Monday Brief**: weekly page of counted numbers, the records behind them, and three suggested actions; AI wording is rejected if it contains a figure that was not counted | `lib/brief.js`, Monday Brief view in `public/admin.html`, `/api/admin/brief` in `server.js` | `test/brief.js` (33 checks) |
| **Design pass**: new look (limewash, ink, lapis, gold), plumb-line navigation, new sign-in | `public/design.css`, `public/admin.html`, `public/widget.js`, `public/live.html` |
| **Church page** for churches with no website, and a clearer install guide with a **Check my website** button that safely fetches the public page | `public/church.html`, `lib/sitecheck.js`, `test/site.js` |
| **Prayer board with replies**: opt-in sharing, receipt codes, pastor reply (AI drafts, a person sends), requester sees the reply, erase on both sides | `server.js`, `public/widget.js`, `test/prayer.js` |
| **Daily devotionals, series and Bible studies**: week or month generators, approval, scheduling by date, Today tab, public-domain Bible lookup | `lib/studies.js`, `lib/bible.js`, `test/studies.js` |
| **Self-test**: one click checks readiness and says how to fix each gap | `server.js`, `public/admin.html` |
| **Roles and accounts**: administrator and prayer-and-care-team sign-ins, optional member accounts, visitors with no sign-in, instant revocation | `server.js`, `public/admin.html`, `public/widget.js`, `test/roles.js` |
| **Free off-site storage** so a host without a disk keeps its churches: encrypted before it leaves the server, restored at start-up | `lib/remote.js`, `lib/store.js`, `test/remote.js` |

Everything not in the second table is baseline. If a feature is not listed here, it was not built in the window.
