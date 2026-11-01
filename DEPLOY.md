# Put Plumb Line on the internet

Plumb Line is a normal Node server that keeps files on disk and holds live-caption sessions in memory. That is why it **cannot run on Vercel** (Vercel runs short-lived functions with no disk). It needs a host that runs a Node or Docker process.

Pick one path.

| Path | Cost | Good for | Catch |
|---|---|---|---|
| **A. Render, free instance** | free | showing judges a live link, and small real use with the free off-site copy (section A2) | sleeps when idle (first visit after a pause takes about a minute). Without A2, churches are lost on restart. The demo church is re-created on every start. |
| **B. Render or any host with a disk** | a few dollars a month (check current prices) | real churches | none |
| **C. Your own computer plus a tunnel** | free | trying it with a pastor this week | works only while your computer is on and connected |

For the hackathon, use **A** (and keep **C** as a backup while you record the video).

## A. Render free instance, step by step

1. Push the project to GitHub (already done: `sirmos/plumbline`).
2. Create a free account at render.com and choose **New, Web Service**, then connect the GitHub repo.
3. Settings: Language/Runtime **Docker** (the `Dockerfile` is included), Instance type **Free**.
4. Under **Environment**, add:

| Name | Value | Why |
|---|---|---|
| `GROQ_API_KEY` | your key from console.groq.com | drafts, answers, translation and live captions |
| `GEMINI_API_KEY` | optional, from aistudio.google.com | another safety net (sees only public text by default) |
| `SECRET` | any long random text, for example 40 random letters and digits | keeps sign-ins valid after a restart |
| `DEMO_PASS` | a passcode of 8+ characters you choose | creates the fictional church `harbor-demo` with sample data on every start |

5. Press **Create Web Service**. After the build, Render shows your address, for example `https://plumb-line-abcd.onrender.com`.
6. Open it. Sign in with church ID `harbor-demo` and your `DEMO_PASS`. Open **Self-test**: it tells you what is still missing.
7. Your church page is `https://YOUR-ADDRESS/c/harbor-demo`.

**Before judging starts (Nov 28), open the site once yourself to wake it**, and do the same before any live demo. On a free instance the first request after idle is slow.

**For the form's demo account fields:** username is not needed for the pastor login; give judges the church ID `harbor-demo` and the passcode. A team login also exists: church ID `harbor-demo`, name `Ruth Demo`, same passcode (shows the limited view).

Keys live only in Render's Environment page. Never put them in the repo. Rotate any key you have pasted into a chat or a screenshot.

## A2. Keep churches on a free host (free off-site copy)

A free Render instance forgets its files on every restart. Plumb Line can keep an encrypted copy of every church in a free Upstash Redis database and load it back at start-up.

1. Create a free account at upstash.com and choose **Create database** (Redis). Pick a region close to your Render region. No credit card is asked for the free plan, and **do not add a card** (adding one upgrades the database to pay-as-you-go).
2. Open the database, find the **REST API** section, and copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. In Render, add both as Environment variables next to the others, and make sure `SECRET` is set. Save, and Render redeploys.
4. In the logs you should see `Storage: off-site copy on. Restored 0 church(es).` Create a church, wait 20 seconds, then in Render press **Manual Deploy, Deploy latest commit**. After the redeploy the church is still there and you can sign in.
5. Open **Self-test**: it shows "Churches survive a restart" and "The off-site copy is saving".

How it behaves:
- Every change is saved off-site within about 15 seconds, and immediately when Render stops the service for a redeploy. A crash can lose the last 15 seconds.
- Everything is encrypted before it leaves the server, using a key made from `SECRET`. The database only ever holds ciphertext.
- **Never change `SECRET`** once real churches exist. With a different `SECRET` the saved churches cannot be read (the logs say so, and nothing is overwritten; put the old `SECRET` back).
- If Upstash is down or over its limit, the server keeps working from memory and retries; Self-test shows the error.
- Upstash's free plan at the time of writing: 500,000 commands a month, 250 MB, no card. Plumb Line uses one command per church per save and a few at start-up, which is far below the limit for a few dozen churches. Check Upstash's pricing page for current limits and for what happens to databases that are not used for a long time, which I could not confirm.
- This suits a handful to a few dozen churches. For more, use a real database or a disk (section B).

## B. Keeping real church data

Free instances do not keep files. For real churches, use a plan with a persistent disk, mount it at `/data`, and keep `DATA_DIR=/data` (the `Dockerfile` already sets it). `render.yaml` describes this setup (Blueprint). Back up the `/data` folder; each church is one JSON file. Run one instance only.

Any small Linux server also works:

    docker build -t plumbline .
    docker run -d --restart unless-stopped -p 3000:3000 -v plumbline-data:/data \
      -e GROQ_API_KEY=... -e SECRET=... plumbline

Put a reverse proxy with HTTPS in front (Caddy is the simplest: `plumbline.yourchurch.org { reverse_proxy localhost:3000 }`). HTTPS is required for the pastor's microphone in Live Pulpit when not on localhost.

## C. Your own computer with a free tunnel

    npm start
    cloudflared tunnel --url http://localhost:3000

`cloudflared` prints a public https address while it runs. Install it from Cloudflare's site. The address changes each time, and your computer must stay on.

## After it is live

- Open **Self-test** in the dashboard. Fix anything marked red.
- Open **Install on your website**. The code now uses your real address instead of `localhost`.
- Open **AI engine**, press **Test connections**, and confirm at least one provider answers.
- Free AI limits are per account. Many churches on one key will run out; see the README, "Free-tier reality".
