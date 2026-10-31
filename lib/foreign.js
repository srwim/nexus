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
      "https://news.web.nhk/n-data/conf/na/rss/cat0.xml", // www3.nhk.or.jp froze on 8 Aug 2026
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
    // State-run. That is worth knowing rather than hiding, and it is exactly
    // what the ownership label in lib/sources.js is for.
    //
    // China News Service only. People's Daily's feeds still answer 200 but have
    // been frozen at 5 Jun 2025, so the stale filter dropped every item; Zaobao
    // redirects to zaobao.com.sg and 404s; Xinhua's feed is frozen at 2022 and
    // undated, so keepUndated would publish it as today's news.
    // ponytail: one publisher. Add a second live outlet when one turns up.
    feeds: ["https://www.chinanews.com.cn/rss/china.xml", "https://www.chinanews.com.cn/rss/world.xml"],
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
    // Arabic-language outlets only: le360 and Le Matin (dead by Oct 2026 anyway)
    // publish in French, which the model was being told was Arabic.
    feeds: ["https://www.hespress.com/feed", "https://www.alyaoum24.com/feed", "https://www.barlamane.com/feed"],
  },
  eg: {
    label: "Egypt",
    lang: "ar",
    language: "Arabic",
    feeds: [
      "https://www.youm7.com/rss/SectionRss?SectionID=65",
      "https://www.almasryalyoum.com/rss/rssfeeds",
      "https://www.masrawy.com/rss/feed/25/%D8%A3%D8%AE%D8%A8%D8%A7%D8%B1", // أخبار (news)
    ],
  },
  mx: {
    label: "Mexico",
    lang: "es",
    language: "Spanish",
    feeds: [
      "https://www.eluniversal.com.mx/arc/outboundfeeds/rss/?outputType=xml",
      "https://www.jornada.com.mx/rss/edicion.xml",
      "https://www.elfinanciero.com.mx/arc/outboundfeeds/rss/?outputType=xml",
    ],
  },
  ar: {
    label: "Argentina",
    lang: "es",
    language: "Spanish",
    feeds: [
      "https://www.clarin.com/rss/lo-ultimo/",
      "https://www.lanacion.com.ar/arc/outboundfeeds/rss/",
      "https://www.pagina12.com.ar/arc/outboundfeeds/rss/portada/",
    ],
  },
  br: {
    label: "Brazil",
    lang: "pt",
    language: "Portuguese",
    feeds: [
      "https://g1.globo.com/rss/g1/",
      "https://feeds.folha.uol.com.br/emcimadahora/rss091.xml",
      "https://www.poder360.com.br/feed/",
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
