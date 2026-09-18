import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeFeedBody } from "./text.js";

const FOLHA = "Proposta que prevê código de conduta aos ministros do STF está parada no Senado há quatro meses";

// The regression: res.text() assumes UTF-8, so a Latin-1 feed lost every
// accented character to U+FFFD before the text reached the page or translator.
test("an ISO-8859-1 feed decodes to real accented text", () => {
  const body = Buffer.from(FOLHA, "latin1");
  const out = decodeFeedBody(body, "application/xml");
  assert.equal(out, FOLHA);
  assert.ok(!out.includes("�"), "no replacement characters");
});

test("the old behaviour is what produced the mojibake", () => {
  const body = Buffer.from(FOLHA, "latin1");
  const oldWay = new TextDecoder("utf-8").decode(body); // what res.text() did
  assert.ok(oldWay.includes("�"), "sanity: this is the bug being fixed");
  assert.notEqual(decodeFeedBody(body, ""), oldWay);
});

test("UTF-8 still decodes as UTF-8", () => {
  const body = Buffer.from(FOLHA, "utf8");
  assert.equal(decodeFeedBody(body, "application/xml; charset=utf-8"), FOLHA);
});

test("UTF-8 wins even when the feed mislabels itself as Latin-1", () => {
  // Publishers get this wrong in both directions. Valid UTF-8 is essentially
  // never accidental, so trusting the bytes beats trusting the label.
  const body = Buffer.from("Constituição", "utf8");
  assert.equal(decodeFeedBody(body, 'text/xml; charset="ISO-8859-1"'), "Constituição");
});

test("the charset in the Content-Type header is honoured", () => {
  const body = Buffer.from("público", "latin1");
  assert.equal(decodeFeedBody(body, "text/xml; charset=ISO-8859-1"), "público");
});

test("the XML declaration is used when the header says nothing", () => {
  const xml = `<?xml version="1.0" encoding="ISO-8859-1"?><rss><title>Núñez</title></rss>`;
  assert.equal(decodeFeedBody(Buffer.from(xml, "latin1"), ""), xml);
});

test("an unknown encoding label falls back instead of throwing", () => {
  const body = Buffer.from("café", "latin1");
  const out = decodeFeedBody(body, "text/xml; charset=x-not-a-real-charset");
  assert.equal(out, "café", "windows-1252 maps every byte to something");
});

test("windows-1252 smart quotes survive a feed that calls itself Latin-1", () => {
  const body = Buffer.from([0x93, 0x53, 0x69, 0x6c, 0x69, 0x63, 0x6f, 0x6e, 0x94]); // "Silicon"
  assert.equal(decodeFeedBody(body, "text/xml; charset=ISO-8859-1"), "“Silicon”");
});

test("empty and junk input never throws", () => {
  assert.equal(decodeFeedBody(Buffer.alloc(0), ""), "");
  assert.ok(typeof decodeFeedBody(Buffer.from([0xff, 0xfe, 0x00, 0x99]), "") === "string");
});
