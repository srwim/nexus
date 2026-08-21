// Emitted as a static sitemap.xml at build time. Settings is deliberately
// absent — it's noindex, and listing a page you've asked not to be indexed is
// a contradiction crawlers report as an error.
//
// Note: it lands at /nexus/sitemap.xml, not the domain root, because the site
// lives under a subpath. That's fine for Search Console (submit the full URL);
// see docs/SEO.md for the one line arok.ai's root robots.txt needs.
export const dynamic = "force-static";

const SITE = "https://arok.ai/nexus";

export default function sitemap() {
  const lastModified = new Date();
  return [
    { url: `${SITE}/`, lastModified, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/digest/`, lastModified, changeFrequency: "daily", priority: 0.8 },
    // Indexable on purpose: people look for a publisher's privacy policy
    // directly, and a findable one is part of being credible about the claims
    // in it. /preview is not listed — it's a per-visitor render and noindex.
    { url: `${SITE}/privacy/`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
