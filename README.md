# Plumb Line

An AI helper that any church can add to its website with **one line of code**. Visitors get honest answers, members get a weekly reading plan, prayer and practical help, and the pastor reviews and approves everything. The AI drafts. People decide.

No dependencies. Node 18 or newer.

## Run it

    npm start          # http://localhost:3000
    npm test           # 78 end-to-end checks
    npm run test:ai    # 29 checks of the AI failover router

Open `http://localhost:3000`, create your church, and the dashboard shows your embed code. Without any AI key everything still works using simple rule-based drafts. Add a free key to turn AI on:

    GROQ_API_KEY=gsk_... npm start

Add more keys and they become a failover chain (see below). Open **AI engine** in the dashboard and press **Test connections** to check each one.

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
| `PORT` | Port to listen on | 3000 |
| `DATA_DIR` | Where church data is stored (one JSON file per church) | `./data` |
| `SECRET` | Signs sign-in tokens. Set it in production so sign-ins survive restarts. | generated in `DATA_DIR` |
| `ALLOW_SIGNUP` | `false` closes open sign-up, for a private server | true |

## AI providers and failover

Each AI request goes down the chain in order. A provider is skipped when it:

- is cooling down after an error (a rate limit honours the provider's `Retry-After`, a 5xx or timeout waits 30 seconds, a rejected key waits 10 minutes, a missing model one hour),
- would exceed its own per-minute limit (the router paces itself, so it rarely hits a 429 at all),
- returned something unusable. Every answer is parsed and checked against the shape that route needs, so valid JSON of the wrong shape moves on to the next provider too, or
- is not allowed to see private text.

If every provider fails, a rule-based fallback answers, so the widget never goes silent. Identical visitor questions are cached for ten minutes, which saves free-tier quota. The AI log shows which provider and model wrote each draft.

**Privacy tiers.** Prayer requests, care requests, visitor questions and member names are *private*. They are only sent to providers whose free tier does not train on prompts. Gemini's free tier and Mistral's free "Experiment" tier may use prompts to improve their products, and OpenRouter's free models depend on the upstream provider, so those three are blocked for private text by default and used only for public content such as a pastor's own sermon. Check each provider's current terms before relying on this. They change.

**Free-tier reality.** Free limits are per account, not per church. One shared key for many churches will run out; per published limits at the time of writing, Groq's free 70B model allows about 1,000 requests and 100,000 tokens a day. Plan on a local model (Ollama), a paid tier, or a key per church before you invite many churches. Model names and limits change often: verify them in each provider's console. The defaults in `lib/ai.js` are starting points, not guarantees.

## Put it on a church website

Each church pastes this before `</body>` (WordPress, Squarespace, Wix and Webflow all have a footer or custom-code box):

    <script src="https://YOUR-SERVER/widget.js" data-church="CHURCH-ID" async></script>

The widget runs in a sealed Shadow DOM, so it cannot clash with the site's styles. It adopts the church's color. Churches can lock it to their own domain and switch tabs on or off in the dashboard. `/demo.html?church=CHURCH-ID` shows it on a sample site.

## What each church gets

**Widget (visitors and members)**
- **Ask**: answers only from the church's approved list, in 12 languages. Says so and offers a person when it does not know.
- **New here?**: a first-visit card. Visitors choose what matters to them, may leave contact details, and pick when they want to hear back (never, after a second visit, this week).
- **Groups**: describe a group in plain words, get matches from the church's open groups.
- **This week**: the pastor-approved five-day reading plan from the sermon.
- **Prayer**: private requests. Only a theme is kept, never the words.
- **Help**: meals, rides, visits. Goes to a care board for a person to act on.
- **Moving?**: a consent-based letter of commendation to a partner church.

**Dashboard (pastor)**: overview with a 14-day activity chart and a "needs you" list; review queue; visitor board; care board with suggested steps; sermon-to-week with paragraph-level sourcing and drift flags; unanswered-question gaps that turn into guide answers; doctrine and rules; generated AI use policy; AI log with CSV export; install help.

## How it stays safe

- **A pastor approves everything.** Follow-ups, letters, check-in notes and reading plans wait in a queue. Plumb Line never sends a message itself. Approved text is copied and sent from the church's own email or phone.
- **The crisis rule is not AI.** Words about self-harm or abuse trigger a fixed rule. The text is not stored, a pastor is alerted, and no automated reply is given. Pastors can add a Slack, Discord or Zapier address so the alert reaches their phone.
- **Privacy.** Prayer text and group searches are never stored. Questions are stored only when unanswered, with emails and phone numbers removed. Visitor and care details are stored only with consent and can be erased in one click, including drafts about that person.
- **Doctrine.** Every agent reads the church's statement of faith first. Scripture is given as references, not quoted.
- **Isolation.** Each church sees only its own data. Rate limits, body-size limits and a domain lock protect the public endpoints. Prompts treat public text as data, not instructions.

## Known limits

- **Storage** is one JSON file per church on local disk. That suits tens or low hundreds of churches on one server. For more, swap `lib/store.js` for Postgres. That file is the only place that touches storage.
- **Run a single instance** with a persistent disk. Several instances would each cache their own copy.
- **No email or SMS sending**, by design. Add it only with a person approving each send.
- **Alert addresses** are checked to be https and non-private at send time. Run the server behind a normal reverse proxy.
- Partner churches and sample answers in the demo are fictional. A church must replace them with real ones.

## Deploy

Any host that runs Node or Docker works. `Dockerfile` and `render.yaml` are included. Mount a persistent disk at `/data`, and set at least one provider key (for example `GROQ_API_KEY`) and `SECRET`.

## Layout

    server.js          routes: public widget API, pastor API, static files
    lib/ai.js          AI provider chain with failover, rules, fixed guardrails, offline fallbacks
    lib/store.js       storage, passcode hashing, signed tokens
    lib/seed.js        a new church's starting content
    public/widget.js   the embeddable widget
    public/admin.html  the pastor dashboard
    public/demo.html   a sample church website
    test/e2e.js        end-to-end tests
    test/router.js     failover tests against fake providers
