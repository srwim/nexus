import { test } from "node:test";
import assert from "node:assert/strict";
import { renderEmailHtml } from "./email.js";

// A sponsor link that doesn't render is revenue quietly not delivered, so the
// link paths get real coverage: every slot, with and without anchor text, and
// the empty-URL case that must never produce a dead anchor.

const digest = {
  dateLabel: "Sunday, July 26, 2026",
  sections: [
    {
      key: "politics",
      label: "US Politics",
      icon: "🏛",
      rating: 3,
      type: "news",
      items: [{ title: "Senate passes budget", link: "https://news.example/1", source: "Wire", date: null }],
    },
  ],
};

const render = (sponsors) => renderEmailHtml(digest, { sponsors, theme: "light", siteUrl: "https://arok.ai/nexus/" });

test("top sponsor renders anchor text pointing at the sponsor URL", () => {
  const html = render({
    top: { title: "Sol-Tek", cta: "", linkText: "Bring Light to your Site", url: "https://sol-tek.us/?utm_source=nexus" },
  });
  assert.match(html, /href="https:\/\/sol-tek\.us\/\?utm_source=nexus"/);
  assert.match(html, />Bring Light to your Site →<\/a>/);
});

test("top sponsor with a URL but no anchor text links the title itself", () => {
  const html = render({ top: { title: "Sol-Tek", cta: "", linkText: "", url: "https://sol-tek.us/" } });
  assert.match(html, /href="https:\/\/sol-tek\.us\/"/);
  assert.match(html, /Sol-Tek/);
});

test("footer sponsor links its anchor text and keeps the CTA as lead-in", () => {
  const html = render({
    footer: {
      title: "Arok.AI",
      cta: "Custom Apps Manifest",
      linkText: "Rapid Software Development",
      url: "https://arok.ai/?utm_content=footer",
    },
  });
  assert.match(html, /href="https:\/\/arok\.ai\/\?utm_content=footer"/);
  assert.match(html, />Rapid Software Development →<\/a>/);
  assert.match(html, />Custom Apps Manifest<\/div>/);
});

test("primary sponsor with no anchor text links via its CTA", () => {
  const html = render({
    primary: {
      title: "Blue Anchor Shop",
      cta: "Your summer polo is here!",
      linkText: "",
      url: "https://blueanchorshop.com/x",
      bodyHtml: "<p>Some patterns never go out to sea.</p>",
    },
  });
  assert.match(html, /href="https:\/\/blueanchorshop\.com\/x"/);
  assert.match(html, />Your summer polo is here! →<\/a>/);
});

test("a sponsor with no URL never emits a dead anchor", () => {
  const html = render({
    top: { title: "Sol-Tek", cta: "", linkText: "Bring Light to your Site", url: "" },
    footer: { title: "Arok.AI", cta: "Custom Apps Manifest", linkText: "", url: "" },
  });
  assert.doesNotMatch(html, /href=""/, "an empty href looks clickable and is not");
  assert.match(html, /Bring Light to your Site/, "anchor text still shows as plain text");
});

test("every sponsor slot appears when all three are booked", () => {
  const html = render({
    top: { title: "TopCo", cta: "", linkText: "top plug", url: "https://a.example" },
    primary: { title: "PrimaryCo", cta: "shop", linkText: "", url: "https://b.example", bodyHtml: "<p>x</p>" },
    footer: { title: "FooterCo", cta: "read", linkText: "footer plug", url: "https://c.example" },
  });
  for (const u of ["https://a.example", "https://b.example", "https://c.example"]) {
    assert.ok(html.includes(`href="${u}"`), `${u} must be linked`);
  }
});
