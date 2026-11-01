# Plumb Line

An AI helper that any church can add to its website with **one line of code**. Visitors get honest answers, members get a weekly reading plan, prayer and practical help, and the pastor reviews and approves everything. The AI drafts. People decide.

No dependencies. Node 18 or newer.

## Run it

    npm start          # http://localhost:3000
    npm test           # all suites: app, AI failover, Live Pulpit, Monday Brief, church page and website check, prayer board, devotionals and studies, roles and accounts, .env loader
    npm run check      # tries every AI key you have and prints which ones answer

Open `http://localhost:3000`, create your church, and the dashboard shows your embed code. Without any AI key everything still works using simple rule-based drafts.

**Adding AI keys (works the same on Windows, Mac and Linux).** Copy `.env.example` to a new file named `.env` in the same folder as `server.js`, paste each key after its `=`, save, and run `npm start`. A key in the terminal (`$env:GROQ_API_KEY="..."` in PowerShell) overrides the file. `.env` is ignored by git, so keys are never committed. When the server starts it prints an **AI check**, one line per provider saying whether it answered, so a dead key or a retired model shows up immediately.

Every key you add is another safety net (see below). Open **AI engine** in the dashboard and press **Test connections** to see every model of every provider.

| Variable | Purpose | Default |
|---|---|---|
| `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `GITHUB_MODELS_TOKEN`, `OPENROUTER_API_KEY`, `MISTRAL_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` | Any you set join the chain. Keys stay on the server, never in a church's website. | none (offline mode) |
| `CUSTOM_BASE`, `CUSTOM_MODEL_QUICK`, `CUSTOM_MODEL_DEFAULT`, `CUSTOM_API_KEY` | Any OpenAI-compatible server, for example a local Ollama (`http://localhost:11434/v1`). Free forever, and private text never leaves your machine. | off |
| `AI_PROVIDERS` | Order to try providers, e.g. `groq,cerebras,custom,openrouter,anthropic` | groq, cerebras, github, custom, openrouter, mistral, gemini, anthropic |
| `<NAME>_MODEL_QUICK`, `<NAME>_MODEL_DEFAULT` | Override a provider's models, e.g. `GROQ_MODEL_DEFAULT` | see `lib/ai.js` |
| `<NAME>_RPM` | Requests per minute to stay under | set per provider |
| `<NAME>_PRIVATE=true` | Allow private text on a provider that otherwise trains on prompts (for example after you enable billing) | off |
| `AI_ALLOW_TRAINING_PROVIDERS=true` | Allow private text on every provider. Not recommended. | false |
| `AI_TIMEOUT_QUICK_MS`, `AI_TIMEOUT_MS`, `AI_CONCURRENCY` | Per-call timeouts and how many AI calls run at once | 20000, 45000, 4 |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Keep an encrypted off-site copy of every church, restored at start-up (needs `SECRET`). For hosts with no disk. See `DEPLOY.md`. | off |
| `DEMO_PASS` | Create and refresh a fictional demo church `harbor-demo` at every start | off |
| `PORT` | Port to listen on | 3000 |
| `DATA_DIR` | Where church data is stored (one JSON file per church) | `./data` |
| `SECRET` | Signs sign-in tokens. Set it in production so sign-ins survive restarts. | generated in `DATA_DIR` |
| `ALLOW_SIGNUP` | `false` closes open sign-up, for a private server | true |

## AI providers and failover

Free models come and go (Groq retired its two Llama defaults on 2026-08-16 and every call began failing), so the router does not trust a fixed model name.

- **It asks each provider what it offers today** (`GET /models`, refreshed every 6 hours and whenever a model turns out to be retired), ranks the models for each job (a small fast one for chat, a larger careful one for sermons, letters and briefs), and uses the best that exist. New models are picked up without a code change.
- **It uses many models per provider.** Free limits on Groq, Gemini, Cerebras and Mistral are per model, so when one model is rate-limited only that model cools down and the next model of the same provider answers. Up to three models of a provider are tried per request.
- **It uses many providers.** After a provider's models, the next provider is tried. Only a rejected key or an outage cools a whole provider (a rejected key waits 10 minutes, an outage 30 seconds).
- **It checks every answer.** Output is parsed and checked against the shape the feature needs, so valid JSON of the wrong shape moves on too.
- **It paces itself** under each provider's own per-minute limit, so it rarely hits a 429 at all.
- **It respects privacy tiers**: a provider that trains on free-tier prompts never sees private text.

If every provider fails, a rule-based fallback answers, so the widget never goes silent. Identical visitor questions are cached for ten minutes, which saves free-tier quota. The AI log shows which provider and model wrote each draft.

**Privacy tiers.** Prayer requests, care requests, visitor questions and member names are *private*. They are only sent to providers whose free tier does not train on prompts. Gemini's free tier and Mistral's free "Experiment" tier may use prompts to improve their products, and OpenRouter's free models depend on the upstream provider, so those three are blocked for private text by default and used only for public content such as a pastor's own sermon. Check each provider's current terms before relying on this. They change.

**Free-tier reality.** Free limits are per account, not per church. One shared key for many churches will run out; per published limits at the time of writing, Groq's free 70B model allows about 1,000 requests and 100,000 tokens a day. Plan on a local model (Ollama), a paid tier, or a key per church before you invite many churches. Limits change often: verify them in each provider's console. You can put a model you prefer first with `<NAME>_MODEL_DEFAULT` / `<NAME>_MODEL_QUICK` (comma-separated), but you never have to.

## A church with no website

Every church gets a public page at `/c/CHURCH-ID` (for example `https://your-server/c/harbor-church-16fd`) with service times, address, an about paragraph, open small groups, this week's approved reading plan, guide answers, a live-captions link when a service is running, and the chat button. The pastor fills it in under **Church page**, which also shows the address and a QR code for the bulletin. It can be switched off. Only public fields are returned (`/api/public/ID/site`); visitor, care and prayer data are never part of it.

## Put it on a church website

Each church pastes this before `</body>` (WordPress, Squarespace, Wix and Webflow all have a footer or custom-code box):

    <script src="https://YOUR-SERVER/widget.js" data-church="CHURCH-ID" async></script>

Under **Install on your website** the dashboard gives the line, step-by-step places to paste it for WordPress, Squarespace, Wix and Webflow, and a **Check my website** button that fetches the public page (public addresses only, redirects re-checked) and says whether the snippet is there. The widget runs in a sealed Shadow DOM, so it cannot clash with the site's styles. It adopts the church's color. Churches can lock it to their own domain and switch tabs on or off in the dashboard. `/demo.html?church=CHURCH-ID` shows it on a sample site.

## What each church gets

**Widget (visitors and members)**
- **Ask**: answers only from the church's approved list, in 12 languages. Says so and offers a person when it does not know.
- **New here?**: a first-visit card. Visitors choose what matters to them, may leave contact details, and pick when they want to hear back (never, after a second visit, this week).
- **Groups**: describe a group in plain words, get matches from the church's open groups.
- **This week**: the pastor-approved five-day reading plan from the sermon.
- **Prayer**: private by default, only a theme is kept, never the words. If the person ticks "share with the prayer team", the request goes to the pastor's **Prayer board** under a random receipt code (stored only as a hash on the server). The pastor can pray, reply (AI may draft, a person sends, and promises of healing are flagged) and erase; the person sees the reply in the same tab and can remove their request.
- **Today**: a daily devotional (verse, reflection, question, prayer) the pastor wrote or approved, the current part of each published Bible study or sermon series, and a public-domain Bible lookup.
- **Help**: meals, rides, visits. Goes to a care board for a person to act on.
- **Moving?**: a consent-based letter of commendation to a partner church.

**Live Pulpit (new in v0.4)**: the pastor starts a service, shows a QR code, and speaks. Anyone who scans it reads live captions in one of 12 languages. See "Live Pulpit" below.

**Monday Brief (new in v0.5)**: one page for the start of the pastor's week. Questions, visitors, prayer and care counts against the week before, then what is waiting on a person, then three suggested actions. See "Monday Brief" below.

**Daily devotionals, series and Bible studies (new in v0.6)**: write a week or a month of devotionals in one step, or plan a 4 to 26 part Bible study or a sermon series with a study guide for each message. Everything is a draft until the pastor approves it, then it appears in the widget's Today tab on the right day (weekly or daily). Bible text comes only from public-domain versions (WEB, KJV, BBE, WEBBE, OEB-US, Almeida) through bible-api.com; Scripture from licensed versions can be typed in by the pastor. The **Self-test** page checks that the server address, AI, speech, church page, alerts and published content are ready.

**Dashboard (pastor)**: overview with a 14-day activity chart and a "needs you" list; review queue; visitor board; care board with suggested steps; sermon-to-week with paragraph-level sourcing and drift flags; unanswered-question gaps that turn into guide answers; doctrine and rules; generated AI use policy; AI log with CSV export; install help.

## Live Pulpit

Open **Live Pulpit** in the dashboard, press **Start service**, then **Start microphone**. The room scans the QR code (or opens `/live?church=ID`) and picks a language.

    microphone -> 7 second audio chunks -> speech-to-text (Groq Whisper) -> caption line
                                                                         -> one AI call translates it into the languages
                                                                            people currently have open (never the source language)

- **Only open languages are translated.** A viewer's language counts as active for 20 seconds after their last poll, so cost follows the room, not the list of 12. One call covers all active languages.
- **Silence costs nothing.** The browser skips quiet chunks, the server skips tiny ones, and stock phrases Whisper invents from noise ("Thank you.") are dropped.
- **It degrades instead of stopping.** If translation fails, viewers still see the original line. If the speech provider fails it cools down and the pastor can type captions. Late joiners get the last six lines translated when they pick a language.
- **Larger model for harder languages.** When Yoruba, Igbo, Hausa, Nigerian Pidgin or Swahili is open, the larger model is used. Speech recognition itself is weaker for Yoruba, Hausa and Igbo, and Whisper has no Igbo or Pidgin model, so speak English, Spanish, French or similar and let viewers read the others.
- **Privacy.** Audio is never stored. Only the source transcript is saved when the pastor ends the service, and only for the church that owns it. Translations are not saved. Viewers see "Captions are made by AI and can contain mistakes."
- **Not a replacement for an interpreter** where accuracy is critical.

Speech settings: `GROQ_API_KEY` is enough (`GROQ_STT_MODEL` overrides the model). To use another Whisper-compatible server, set `STT_BASE`, `STT_MODEL` and optionally `STT_API_KEY`. Groq's free speech limits are per account, so one key covers a few churches at once; check its current limits.

## Monday Brief

Open **Monday Brief** in the dashboard. The counts are always live. Press **Write this week's brief** to have the wording written, then **Copy as email** or **Download**. Nothing is sent for you.

- **Code counts, the AI words.** Every figure comes from your own records in `lib/brief.js`. The AI is given only labels and numbers, and its answer is thrown away if it contains any figure it was not given, or points to a page that does not exist. Then the next provider is tried, and finally a plain rule-based brief is written.
- **No personal details reach the AI.** It sees counts and scrubbed question text, never names, contact details or prayer text. Names appear only on your own screen, under "Behind the numbers", so you can check each number against the records.
- **Every brief is logged** in the AI log with the provider that wrote it.

## Who signs in

| Person | Sign-in | Can do |
|---|---|---|
| Pastor | church ID and passcode | everything, including approving what goes out and managing the team |
| Administrator | church ID, their name, their passcode | everything except managing the team |
| Prayer and care team | church ID, their name, their passcode | Prayer board, Care board and Visitors only; replies are signed with their own name; cannot publish, approve or delete |
| Member (optional) | name and passcode in the widget | sees their own shared prayer requests and replies on any phone; can delete their account |
| Visitor | none | asks, finds a group, requests prayer or help, reads the Today tab and live captions |

The pastor adds staff under **Team & members**. Pausing or removing someone revokes their access on the very next request, because every request is checked against the current staff list. Member accounts store only a name and a passcode (scrypt hash), no email or phone; the pastor can reset a passcode or remove an account, which also removes the requests it shared. Member tokens cannot open the dashboard and dashboard tokens are not member tokens. Wrong passcodes are rate limited per account and per address.

## How it stays safe

- **A pastor approves everything.** Follow-ups, letters, check-in notes and reading plans wait in a queue. Plumb Line never sends a message itself. Approved text is copied and sent from the church's own email or phone.
- **The crisis rule is not AI.** Words about self-harm or abuse trigger a fixed rule. The text is not stored, a pastor is alerted, and no automated reply is given. Pastors can add a Slack, Discord or Zapier address so the alert reaches their phone.
- **Privacy.** Prayer text is not stored unless the person chooses to share it with the prayer team, and group searches are never stored. Questions are stored only when unanswered, with emails and phone numbers removed. Visitor and care details are stored only with consent and can be erased in one click, including drafts about that person.
- **Doctrine.** Every agent reads the church's statement of faith first. Scripture is given as references, not quoted.
- **Isolation.** Each church sees only its own data. Rate limits, body-size limits and a domain lock protect the public endpoints. Prompts treat public text as data, not instructions.

## Known limits

- **Storage** is one JSON file per church on local disk, optionally copied (encrypted with a key made from `SECRET`) to a free Upstash Redis database so a host without a disk keeps its churches. That suits tens or low hundreds of churches on one server. For more, swap `lib/store.js` for Postgres. That file is the only place that touches storage.
- **Run a single instance** with a persistent disk. Several instances would each cache their own copy.
- **No email or SMS sending**, by design. Add it only with a person approving each send.
- **Alert addresses** are checked to be https and non-private at send time. Run the server behind a normal reverse proxy.
- Partner churches and sample answers in the demo are fictional. A church must replace them with real ones.

## Deploy

See `DEPLOY.md` for a step-by-step guide (a free Render instance for demos, a disk for real churches, or a tunnel from your own computer). Vercel does not fit: Plumb Line needs a disk and a long-running process.

Any host that runs Node or Docker works. `Dockerfile` and `render.yaml` are included. Mount a persistent disk at `/data`, and set at least one provider key (for example `GROQ_API_KEY`) and `SECRET`.

## Layout

    server.js          routes: public widget API, pastor API, static files
    lib/ai.js          AI provider chain with failover, speech-to-text, rules, guardrails, offline fallbacks
    lib/pulpit.js      Live Pulpit sessions, viewer languages, translation
    lib/brief.js       Monday Brief: counts, figure check, rule-based fallback
    lib/sitecheck.js   "Check my website": safe fetch that looks for the snippet
    lib/bible.js       public-domain Bible text lookup
    lib/studies.js     devotional and series shaping, offline fallbacks
    lib/remote.js      encrypted off-site copy (Upstash Redis over REST)
    lib/store.js       storage, passcode hashing, signed tokens
    lib/seed.js        a new church's starting content
    public/widget.js   the embeddable widget
    public/admin.html  the pastor dashboard
    public/live.html   the page a phone opens from the QR code
    public/qr.js       small QR code generator, written for this project (no dependency)
    public/church.html a church's own public page (/c/ID)
    public/design.css  shared look of the dashboard and church page
    public/demo.html   a sample church website
    test/e2e.js        end-to-end tests
    test/router.js     AI failover tests against fake providers
    test/pulpit.js     Live Pulpit tests against a fake Whisper and chat provider
    test/brief.js      Monday Brief tests: exact counts, invented figures refused
    test/site.js       church page and website check, including private-address refusal
    test/prayer.js     prayer board: private by default, receipt codes, replies, crisis rule
    test/studies.js    devotionals, Bible lookup, series, self-test
    test/remote.js     off-site copy against a fake database: encryption, restore, outage, wrong secret
    test/roles.js      staff roles, member accounts, token separation, revocation
    test/router.js     failover tests against fake providers
