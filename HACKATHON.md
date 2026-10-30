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
| Monday Brief | _not started yet_ | |

Everything not in the second table is baseline. If a feature is not listed here, it was not built in the window.
