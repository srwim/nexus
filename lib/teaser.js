// Build a one-line "TL;DR" teaser above the news: the lead story from each of
// the top news sections, condensed and comma-joined. Sections arrive already
// sorted by the reader's ratings, so the first few are the highest priority.
// No emoji — just the headlines, shortened to keep it to a scannable line.
export function buildTeaser(sections, count = 3) {
  const picks = [];
  for (const s of sections || []) {
    if (s.type === "weather") continue; // weather isn't a "story"
    const item = (s.items || [])[0];
    if (!item || !item.title) continue;
    picks.push({ title: shortenHeadline(item.title), link: item.link || "" });
    if (picks.length >= count) break;
  }
  return picks;
}

// Trim a headline down to a teaser: drop a trailing " - Source" suffix and cap
// the length at a word boundary so the combined line stays short.
export function shortenHeadline(title, max = 52) {
  let t = String(title || "").replace(/\s+/g, " ").trim();
  t = t.replace(/\s[-–—|]\s[^-–—|]{2,40}$/, ""); // strip " - Publisher" style tails
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > 24 ? cut.slice(0, sp) : cut).replace(/[.,;:]+$/, "") + "…";
}
