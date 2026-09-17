// Build a one-line "Digest" teaser above the news: the lead story from each of
// the top news sections. Sections arrive already sorted by the reader's ratings,
// so the first few are the highest priority. No emoji — just clean headlines,
// each ending on a full stop (or a natural comma/clause break) rather than an
// ellipsis, so the line reads as finished thoughts.
export function buildTeaser(sections, count = 3) {
  const picks = [];
  for (const s of sections || []) {
    if (s.type === "weather") continue; // weather isn't a "story"
    const item = (s.items || [])[0];
    if (!item || !item.title) continue;
    picks.push({ title: cleanHeadline(item.title), link: item.link || "" });
    if (picks.length >= count) break;
  }
  return picks;
}

// Turn a raw headline into a finished teaser sentence: drop a trailing
// " - Source" suffix; if it's long, cut at the last natural break (comma,
// semicolon, colon, dash) within the cap, then end it cleanly with a period.
//
// Cutting at a word boundary and adding a period was worse than not cutting at
// all: it produced grammatical sentences that said something the headline
// didn't. "…Experts say Trump's arch would add one more risk" became "Experts
// say Trump's arch would." — a finished sentence with the claim amputated. A
// clause break can be trimmed to because what remains is still a whole thought;
// an arbitrary word boundary can't. So when there's no break to cut at, the
// headline is left whole — a teaser that runs a few characters long is a
// cosmetic problem, and inventing a claim is not.
export function cleanHeadline(title, max = 64) {
  let t = String(title || "").replace(/\s+/g, " ").trim();
  t = t.replace(/\s[-–—|]\s[^-–—|]{2,40}$/, ""); // strip " - Publisher" style tail

  if (t.length > max) {
    const slice = t.slice(0, max);
    const brk = Math.max(
      slice.lastIndexOf(", "),
      slice.lastIndexOf("; "),
      slice.lastIndexOf(": "),
      slice.lastIndexOf(" — "),
      slice.lastIndexOf(" – "),
      slice.lastIndexOf(" - ")
    );
    if (brk > 24) t = slice.slice(0, brk); // stop on a natural break, else leave it whole
  }

  t = t.replace(/[\s,;:–—-]+$/, ""); // no dangling break or space
  if (!/[.!?]$/.test(t)) t += ".";
  return t;
}
