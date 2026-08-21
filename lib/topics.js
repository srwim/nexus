// Topic registry: every topic maps to one or more free RSS feeds.
// Local news + weather are built by zipcode (from nexus.config.json) at data-build time.

// How many stories a topic earns in the feed/digest, by rating (0-5 stars).
export const STORY_BUDGET = { 0: 0, 1: 2, 2: 3, 3: 4, 4: 6, 5: 8 };

// ESPN's RSS feeds block datacenter IPs, but its public JSON news API
// (site.api.espn.com) is CORS-enabled and served fresh, so sports is fetched
// live in the browser per selected league (see lib/espn.js). Each `espn` value
// is the sport/league path segment for that API.
export const SPORTS_LEAGUES = {
  nfl: { label: "NFL", espn: "football/nfl" },
  nba: { label: "NBA", espn: "basketball/nba" },
  mlb: { label: "MLB", espn: "baseball/mlb" },
  nhl: { label: "NHL", espn: "hockey/nhl" },
  soccer: { label: "Soccer", espn: "soccer/all" },
  ncaaf: { label: "College Football", espn: "football/college-football" },
  ncaab: { label: "College Basketball", espn: "basketball/mens-college-basketball" },
  golf: { label: "Golf", espn: "golf/pga" },
  racing: { label: "Racing", espn: "racing/f1" },
};

export const TOPICS = {
  politics: {
    label: "US Politics",
    icon: "🏛️",
    feeds: [
      "https://rss.politico.com/politics-news.xml",
      "https://thehill.com/homenews/feed/",
      "https://feeds.npr.org/1014/rss.xml",
      "https://feeds.washingtonpost.com/rss/politics",
      "https://www.vox.com/rss/policy-and-politics/index.xml",
      "https://abcnews.go.com/abcnews/politicsheadlines",
    ],
  },
  usnews: {
    // AP & Reuters no longer offer reliable free RSS; NPR National carries AP
    // wire copy and The Guardian US + BBC US & Canada round out the coverage.
    label: "US National News",
    icon: "🇺🇸",
    feeds: [
      "https://feeds.npr.org/1003/rss.xml",
      "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml",
      "https://www.theguardian.com/us-news/rss",
      "https://feeds.nbcnews.com/nbcnews/public/news",
      "https://abcnews.go.com/abcnews/usheadlines",
      "https://www.cbsnews.com/latest/rss/us",
    ],
  },
  world: {
    label: "World News",
    icon: "🌍",
    feeds: [
      "https://feeds.bbci.co.uk/news/world/rss.xml",
      "https://www.aljazeera.com/xml/rss/all.xml",
      "https://feeds.npr.org/1004/rss.xml",
      "https://www.theguardian.com/world/rss",
      "https://feeds.skynews.com/feeds/rss/world.xml",
      "https://rss.dw.com/rdf/rss-en-world",
    ],
  },
  conflict: {
    label: "World Conflict",
    icon: "⚔️",
    feeds: [
      "https://reliefweb.int/updates/rss.xml",
      "https://www.defenseone.com/rss/all/",
      "https://warontherocks.com/feed/",
      "https://breakingdefense.com/feed/",
      "https://www.stripes.com/rss/news.rss",
      "https://www.militarytimes.com/arc/outboundfeeds/rss/category/flashpoints/?outputType=xml",
    ],
  },
  business: {
    label: "Business & Markets",
    icon: "📈",
    feeds: [
      "https://www.cnbc.com/id/100003114/device/rss/rss.html",
      "https://feeds.content.dowjones.io/public/rss/mw_topstories",
      "https://feeds.npr.org/1006/rss.xml",
      "https://fortune.com/feed/",
      "https://www.businessinsider.com/rss",
      "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain",
    ],
  },
  science: {
    label: "Science",
    icon: "🔬",
    feeds: [
      "https://feeds.npr.org/1007/rss.xml",
      "https://feeds.arstechnica.com/arstechnica/science",
      "https://www.sciencedaily.com/rss/all.xml",
      "https://www.nature.com/nature.rss",
      "https://phys.org/rss-feed/",
      "https://www.newscientist.com/feed/home/",
    ],
  },
  health: {
    label: "Health & Medicine",
    icon: "🩺",
    feeds: [
      "https://feeds.npr.org/1128/rss.xml",
      "https://www.statnews.com/feed/",
      "https://www.theguardian.com/society/health/rss",
      "https://kffhealthnews.org/feed/",
      "https://www.medpagetoday.com/rss/headlines.xml",
      "https://www.sciencedaily.com/rss/health_medicine.xml",
    ],
  },
  climate: {
    label: "Climate & Environment",
    icon: "🌱",
    feeds: [
      "https://www.theguardian.com/environment/rss",
      "https://insideclimatenews.org/feed/",
      "https://grist.org/feed/",
      "https://www.carbonbrief.org/feed/",
      "https://yaleclimateconnections.org/feed/",
      "https://e360.yale.edu/feed.xml",
    ],
  },
  local: {
    label: "Local News",
    icon: "📍",
    feeds: [], // dynamic: Google News RSS by city, resolved from zipcode
    needsZip: true,
  },
  weather: {
    label: "Weather",
    icon: "⛅",
    feeds: [], // dynamic: NWS API, national alerts + local forecast by zipcode
    needsZip: true,
  },
  sports: {
    label: "Sports",
    icon: "🏆",
    feeds: [], // dynamic: union of selected leagues in SPORTS_LEAGUES
    hasLeagues: true,
  },
  tech: {
    label: "Technology",
    icon: "💻",
    feeds: [
      "https://techcrunch.com/feed/",
      "https://www.theverge.com/rss/index.xml",
      "https://feeds.arstechnica.com/arstechnica/index",
      "https://www.wired.com/feed/rss",
      "https://www.engadget.com/rss.xml",
      "https://www.theregister.com/headlines.atom",
    ],
  },
  cyber: {
    label: "Cybersecurity",
    icon: "🔒",
    feeds: [
      "https://krebsonsecurity.com/feed/",
      "https://www.bleepingcomputer.com/feed/",
      "https://feeds.feedburner.com/TheHackersNews",
      "https://www.darkreading.com/rss.xml",
      "https://www.securityweek.com/feed/",
      "https://therecord.media/feed",
    ],
  },
  ai: {
    label: "AI",
    icon: "🤖",
    feeds: [
      "https://techcrunch.com/category/artificial-intelligence/feed/",
      "https://venturebeat.com/category/ai/feed/",
      "https://www.technologyreview.com/feed/",
      "https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss",
      "https://the-decoder.com/feed/",
      "https://www.artificialintelligence-news.com/feed/",
    ],
  },
  space: {
    label: "Space",
    icon: "🚀",
    feeds: [
      "https://www.nasa.gov/feed/",
      "https://www.space.com/feeds/all",
      "https://spacenews.com/feed/",
      "https://www.universetoday.com/feed/",
      "https://phys.org/rss-feed/space-news/",
      "https://skyandtelescope.org/feed/",
    ],
  },
  gaming: {
    label: "Gaming",
    icon: "🎮",
    feeds: [
      "https://www.polygon.com/rss/index.xml",
      "https://www.eurogamer.net/feed",
      "https://kotaku.com/rss",
      "https://www.gamespot.com/feeds/news/",
      "https://www.pcgamer.com/rss/",
      "https://www.rockpapershotgun.com/feed",
      "https://www.gamesindustry.biz/feed",
    ],
  },
  crypto: {
    label: "Crypto & Web3",
    icon: "🪙",
    feeds: [
      "https://www.coindesk.com/arc/outboundfeeds/rss/",
      "https://cointelegraph.com/rss",
      "https://decrypt.co/feed",
      "https://www.theblock.co/rss.xml",
      "https://bitcoinmagazine.com/feed",
      "https://cryptoslate.com/feed/",
    ],
  },
  culture: {
    label: "Culture & Entertainment",
    icon: "🎬",
    feeds: [
      "https://variety.com/feed/",
      "https://www.rollingstone.com/feed/",
      "https://www.hollywoodreporter.com/feed/",
      "https://www.avclub.com/rss",
      "https://pitchfork.com/feed/feed-news/rss",
      "https://feeds.npr.org/1008/rss.xml",
    ],
  },
};

export const DEFAULT_PREFS = {
  zip: "",
  email: "",
  theme: "light", // newsletter appearance: "light" or "dark"
  leagues: ["nfl", "nba"],
  ratings: {
    politics: 3,
    usnews: 3,
    world: 3,
    conflict: 3,
    business: 2,
    science: 2,
    health: 2,
    climate: 2,
    local: 3,
    weather: 3,
    sports: 3,
    tech: 3,
    cyber: 2,
    ai: 3,
    space: 3,
    gaming: 2,
    crypto: 2,
    culture: 3,
  },
};

// Resolve the RSS feed list for a topic. Sports is not RSS-based — it uses the
// ESPN JSON API (see lib/espn.js) — so it returns no feeds here.
export function feedsForTopic(topicKey) {
  return TOPICS[topicKey]?.feeds || [];
}
