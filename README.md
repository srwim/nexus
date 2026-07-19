# NEXUS

Your personal syndicated news site — a **self-updating static site on GitHub Pages**. Rate your topics 0–5 stars, set your zipcode, and get a ranked feed plus a daily brief on the site, in your inbox, and in Slack. GitHub rebuilds the news every 30 minutes for free; there is no server to run or pay for.

## What's inside

**Topics:** US Politics · World News · World Conflict · Local News (by zipcode, obituaries filtered out) · Weather (national alerts + local forecast) · Sports (NFL, NBA, MLB, NHL, Soccer, College Football, College Basketball, Golf, Racing) · Technology · Space · AI · Culture & Entertainment

**Pages:** Feed (`/`) ranked by your star ratings · Daily Brief (`/digest`) · Settings (`/settings`)

All content comes from free public sources (BBC, NPR, Politico, The Hill, Al Jazeera, ReliefWeb, Defense One, War on the Rocks, ESPN, TechCrunch, The Verge, Ars Technica, NASA, Space.com, SpaceNews, VentureBeat, MIT Tech Review, Variety, Rolling Stone, Hollywood Reporter, the National Weather Service, and Google News for local). A dead feed silently drops out — the site keeps working.

## How it works

```
GitHub Action (every 30 min)          Your browser
─────────────────────────────         ─────────────────────────────
fetch all RSS feeds + weather   →     reads the prebuilt JSON
write public/data/*.json        →     applies YOUR star ratings
publish to GitHub Pages         →     shows your personalized feed

GitHub Action (daily)
─────────────────────────────
build digest from nexus.config.json
send email (Resend) · post to Slack · pull sponsor (Sponsy)
archive to Google Drive · recipients from HubSpot list
```

Star ratings and league picks live in your browser and apply instantly. The **zipcode and newsletter email** live in `nexus.config.json` in the repo (Settings has a "Copy my nexus.config.json" button — paste it into the file on GitHub whenever you change things).

## Deploy (one-time, ~5 minutes)

1. Create a **public** repository on github.com (public = free Pages + unlimited Action minutes) and push this folder to it. Easiest way without git experience: install [GitHub Desktop](https://desktop.github.com), Add local repository → this folder → Publish.
2. On GitHub: repo → **Settings → Pages → Source: "GitHub Actions"**.
3. Edit `nexus.config.json` (pencil icon on GitHub): set your `zip`, and after the first deploy set `siteUrl` to your Pages URL.
4. Repo → **Actions** tab → "Build & publish site" → **Run workflow**. Your site appears at `https://<username>.github.io/<repo>/` and refreshes itself every 30 minutes from then on.

## Turn on the daily email + integrations (optional)

All integrations are switched on by adding secrets: repo → **Settings → Secrets and variables → Actions → New repository secret**. Anything you skip is silently ignored.

| Secret | What it does | Where to get it |
|---|---|---|
| `RESEND_API_KEY` | Sends the daily email | Free account at resend.com |
| `NEWSLETTER_FROM` | Custom from-address (optional) | A domain verified in Resend |
| `SLACK_WEBHOOK_URL` | Posts the brief to a Slack channel | Slack → Apps → Incoming Webhooks |
| `SPONSY_API_KEY` + `SPONSY_PUBLICATION_ID` | Inserts today's sponsor slot into the email | Sponsy → Settings → API |
| `HUBSPOT_TOKEN` + `HUBSPOT_LIST_ID` | Emails everyone on a HubSpot contact list (delivery via Resend — no paid Marketing Hub needed) | HubSpot → Settings → Private Apps (scopes: `crm.objects.contacts.read`, `crm.lists.read`) |
| `GDRIVE_SERVICE_ACCOUNT` + `GDRIVE_FOLDER_ID` | Archives each day's newsletter HTML to Drive | Google Cloud service account (JSON key); share the Drive folder with the service account's email |

Set your own address in `nexus.config.json` → `newsletter.to`. The email goes out daily at 13:00 UTC (edit the cron in `.github/workflows/newsletter.yml`). Test anytime: Actions → "Daily newsletter" → Run workflow — the log shows exactly what was sent, posted, and skipped.

Newsletter format: every headline includes a paragraph snippet, and weather appears as forecast cards matching the site. Preview at `/newsletter.html` on your site or via Settings → Preview newsletter.

## Run locally

```
npm install
npm run dev
```

This fetches fresh data first, then serves at http://localhost:3000.

## Project map

```
nexus.config.json         Zipcode, ratings, leagues, newsletter recipient (drives the published site + email)
.github/workflows/
  site.yml                Fetch news + rebuild + publish every 30 min
  newsletter.yml          Daily email/Slack/Sponsy/Drive/HubSpot run
scripts/
  build-data.mjs          Fetches feeds → public/data/*.json + newsletter.html
  send-newsletter.mjs     Builds + delivers the daily brief
  integrations.mjs        Slack, Sponsy, HubSpot, Google Drive (all secret-gated)
app/                      Feed, Daily Brief, Settings pages
lib/
  topics.js               Topic → feed registry (add/remove sources here)
  rss.js                  Fetching, caching, dedup, entity decoding, obituary filter
  digest.js               Digest builder + weather/local logic
  email.js                Email HTML template
  clientDigest.js         Browser-side feed assembly from static JSON
```

To add a news source, add its RSS URL to the right topic in `lib/topics.js` — the next scheduled build picks it up.
