# SEO

What's wired, and the one thing that has to be done outside this repo.

## In the build

| Item | Where |
| --- | --- |
| Canonical URL (all pages → `arok.ai/nexus`) | `app/layout.js` `metadataBase` + per-route `alternates.canonical` |
| Title template (`Daily Brief — NEXUS`) | `app/layout.js` |
| Per-page title + description | `app/digest/layout.js`, `app/settings/layout.js` |
| OpenGraph + Twitter card | `app/layout.js` |
| Favicon | `app/icon.svg` |
| `sitemap.xml` | `app/sitemap.js` |
| `noindex` on Settings | `app/settings/layout.js` |

The canonical matters most. The site is published to **two** hosts with identical
content — `arok.ai/nexus/` (FTP mirror) and `srwim.github.io/nexus/` (Pages).
Without a canonical, that is duplicate content and search engines split
authority between them. Every page now names arok.ai as the original regardless
of which host served it.

## The one manual step

`robots.txt` is only honoured at a **domain root**. NEXUS lives at a subpath, so
a `robots.txt` generated here would land at `/nexus/robots.txt` and be ignored.
It has to go in arok.ai's WordPress root instead. Add:

```
Sitemap: https://arok.ai/nexus/sitemap.xml
```

Then submit `https://arok.ai/nexus/sitemap.xml` directly in Google Search
Console, which works regardless of path.

## What this will and won't do

It makes the site correct, shareable (links now unfurl with a title, blurb and
icon) and cleanly indexable. It will not make NEXUS rank for news.

The stories are other publishers' headlines and summaries. An aggregator does
not outrank the outlet whose words it is reprinting, and no amount of technical
SEO changes that. Two further limits worth naming:

- **Crawlers see an empty page.** Stories are fetched client-side after load, so
  the first-pass crawl gets "Gathering your stories…" and no `<h1>`. Fixing that
  means prerendering top stories into the static HTML at build time.
- **Nothing here is original.** The rankable asset in this project is the
  engineering writing — [`EVALS.md`](EVALS.md), the autonomy gate — not the news.

## If organic traffic becomes a goal

In rough order of return:

1. Prerender the top stories into static HTML so there is something to index.
2. Publish each daily brief as a permanent page (`/brief/2026-07-26/`) so the
   archive accumulates indexable URLs.
3. Write original commentary around the aggregation. This is the only one that
   escapes the duplicate-content ceiling.
