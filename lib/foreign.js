// Foreign Reporting: what other countries are saying, in their own press.
//
// These are native-language outlets on purpose. An English-language edition of
// a foreign paper is written for foreigners; the domestic edition is written for
// the people who live there, and that difference is the whole point of the
// section. Titles and snippets are machine-translated at build time (see
// scripts/build-data.mjs) and the original is always kept alongside, so a reader
// who speaks the language can check the translation rather than trust it.
//
// Pure and browser-safe: no network, no Node-only imports.
import { mergeChunks } from "./rank.js";

// `lang` is the M2M100 source-language code used by the translate worker.
export const COUNTRIES = {
  jp: {
    label: "Japan",
    lang: "ja",
    language: "Japanese",
    feeds: [
      "https://www3.nhk.or.jp/rss/news/cat0.xml",
      "https://www.asahi.com/rss/asahi/newsheadlines.rdf",
      "https://news.yahoo.co.jp/rss/topics/top-picks.xml",
    ],
  },
  de: {
    label: "Germany",
    lang: "de",
    language: "German",
    feeds: [
      "https://www.spiegel.de/schlagzeilen/tops/index.rss",
      "https://www.tagesschau.de/index~rss2.xml",
      "https://newsfeed.zeit.de/index",
    ],
  },
  kr: {
    label: "South Korea",
    lang: "ko",
    language: "Korean",
    feeds: [
      "https://www.hani.co.kr/rss/",
      "https://rss.donga.com/total.xml",
      "https://www.yonhapnewstv.co.kr/browse/feed/",
    ],
  },
  cn: {
    label: "China",
    lang: "zh",
    language: "Chinese",
    // State-run and state-adjacent. That is worth knowing rather than hiding,
    // and it is exactly what the ownership label in lib/sources.js is for.
    feeds: [
      "http://www.people.com.cn/rss/politics.xml",
      "http://www.people.com.cn/rss/world.xml",
      "https://www.zaobao.com/realtime/china/rss.xml",
    ],
  },
  fr: {
    label: "France",
    lang: "fr",
    language: "French",
    feeds: [
      "https://www.lemonde.fr/rss/une.xml",
      "https://www.lefigaro.fr/rss/figaro_actualites.xml",
      "https://www.france24.com/fr/rss",
    ],
  },
  ma: {
    label: "Morocco",
    lang: "ar",
    language: "Arabic",
    feeds: ["https://www.hespress.com/feed", "https://www.le360.ma/rss", "https://lematin.ma/feed"],
  },
  eg: {
    label: "Egypt",
    lang: "ar",
    language: "Arabic",
    feeds: [
      "https://www.youm7.com/rss/SectionRss?SectionID=65",
      "https://www.almasryalyoum.com/rss/rssfeeds",
      "https://www.shorouknews.com/rss/Rss.aspx",
    ],
  },
  mx: {
    label: "Mexico",
    lang: "es",
    language: "Spanish",
    feeds: [
      "https://www.eluniversal.com.mx/rss.xml",
      "https://www.jornada.com.mx/rss/edicion.xml",
      "https://www.milenio.com/rss",
    ],
  },
  ar: {
    label: "Argentina",
    lang: "es",
    language: "Spanish",
    feeds: [
      "https://www.clarin.com/rss/lo-ultimo/",
      "https://www.lanacion.com.ar/arc/outboundfeeds/rss/",
      "https://www.pagina12.com.ar/rss/portada",
    ],
  },
  br: {
    label: "Brazil",
    lang: "pt",
    language: "Portuguese",
    feeds: [
      "https://g1.globo.com/rss/g1/",
      "https://feeds.folha.uol.com.br/emcimadahora/rss091.xml",
      "https://www.estadao.com.br/rss/ultimas.xml",
    ],
  },
};

export const COUNTRY_KEYS = Object.keys(COUNTRIES);

// Default to a spread of regions and languages rather than all ten: a reader who
// wants everything can switch the rest on, and starting narrow keeps the section
// readable on day one.
export const DEFAULT_COUNTRIES = ["jp", "de", "fr", "br", "eg"];

export function normalizeCountries(countries) {
  const picks = (countries || []).filter((c) => COUNTRIES[c]);
  return picks.length ? [...new Set(picks)] : DEFAULT_COUNTRIES;
}

// data: the parsed data/foreign.json — { countries: { jp: [...], de: [...] } }.
export function foreignFrom(data, countries, limit = 12) {
  return mergeChunks(
    normalizeCountries(countries).map((c) => data?.countries?.[c] || []),
    limit
  );
}
