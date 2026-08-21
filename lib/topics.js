// Topic registry: every topic maps to one or more free RSS feeds.
// Local news + weather are built by zipcode (from nexus.config.json) at data-build time.

// How many stories a topic earns in the feed/digest, by rating (0-5 stars).
export const STORY_BUDGET = { 0: 0, 1: 2, 2: 3, 3: 4, 4: 6, 5: 8 };

// Sports, per league. ESPN's RSS blocks datacenter IPs but its public JSON news
// API (site.api.espn.com) is CORS-enabled and always fresh, so `espn` stays as
// each league's wire desk — and `feeds` adds the outlets that actually cover
// that league, because one source per league is not aggregation. See lib/sports.js.
//
// `sport` groups leagues in Settings; a sport with more than one league expands
// to let the reader pick between them (Motor Racing, chiefly).
export const SPORTS_LEAGUES = {
  nfl: {
    sport: "Football",
    label: "NFL",
    espn: "football/nfl",
    feeds: [
      "https://profootballtalk.nbcsports.com/feed/",
      "https://www.cbssports.com/rss/headlines/nfl/",
      "https://sports.yahoo.com/nfl/rss.xml",
      "https://www.theguardian.com/sport/nfl/rss",
    ],
  },
  ncaaf: {
    sport: "Football",
    label: "College Football",
    espn: "football/college-football",
    feeds: [
      "https://www.cbssports.com/rss/headlines/college-football/",
      "https://sports.yahoo.com/college-football/rss.xml",
      "https://www.si.com/rss/si_college_football.rss",
    ],
  },
  nba: {
    sport: "Basketball",
    label: "NBA",
    espn: "basketball/nba",
    feeds: [
      "https://www.cbssports.com/rss/headlines/nba/",
      "https://sports.yahoo.com/nba/rss.xml",
      "https://hoopshype.com/feed/",
      "https://www.theguardian.com/sport/nba/rss",
    ],
  },
  ncaab: {
    sport: "Basketball",
    label: "College Basketball",
    espn: "basketball/mens-college-basketball",
    feeds: [
      "https://www.cbssports.com/rss/headlines/college-basketball/",
      "https://sports.yahoo.com/college-basketball/rss.xml",
    ],
  },
  mlb: {
    sport: "Baseball",
    label: "MLB",
    espn: "baseball/mlb",
    feeds: [
      "https://www.cbssports.com/rss/headlines/mlb/",
      "https://sports.yahoo.com/mlb/rss.xml",
      "https://www.mlbtraderumors.com/feed",
      "https://www.theguardian.com/sport/mlb/rss",
    ],
  },
  nhl: {
    sport: "Hockey",
    label: "NHL",
    espn: "hockey/nhl",
    feeds: [
      "https://www.cbssports.com/rss/headlines/nhl/",
      "https://sports.yahoo.com/nhl/rss.xml",
      "https://www.theguardian.com/sport/nhl/rss",
    ],
  },
  soccer: {
    sport: "Soccer",
    label: "Soccer",
    espn: "soccer/all",
    feeds: [
      "https://www.theguardian.com/football/rss",
      "https://feeds.bbci.co.uk/sport/football/rss.xml",
      "https://www.skysports.com/rss/12040",
      "https://www.goal.com/feeds/en/news",
    ],
  },
  golf: {
    sport: "Golf",
    label: "Golf",
    espn: "golf/pga",
    feeds: [
      "https://www.theguardian.com/sport/golf/rss",
      "https://feeds.bbci.co.uk/sport/golf/rss.xml",
      "https://golfweek.usatoday.com/feed/",
      "https://www.golfdigest.com/feed/rss",
    ],
  },

  // Motor Racing — one entry per series. "Racing" used to mean ESPN's F1 page
  // and nothing else; a reader who picks Formula 1 should get the paddock press
  // (Autosport, Motorsport.com, PlanetF1, RaceFans) the way Google News shows it.
  f1: {
    sport: "Motor Racing",
    label: "Formula 1",
    espn: "racing/f1",
    feeds: [
      "https://www.motorsport.com/rss/f1/news/",
      "https://www.autosport.com/rss/f1/news/",
      "https://www.planetf1.com/feed",
      "https://www.racefans.net/feed/",
      "https://www.theguardian.com/sport/formulaone/rss",
      "https://feeds.bbci.co.uk/sport/formula1/rss.xml",
    ],
  },
  nascar: {
    sport: "Motor Racing",
    label: "NASCAR",
    espn: "racing/nascar-premier",
    feeds: [
      "https://www.motorsport.com/rss/nascar-cup/news/",
      "https://www.autosport.com/rss/nascar/news/",
      "https://frontstretch.com/feed/",
      "https://sports.yahoo.com/nascar/rss.xml",
    ],
  },
  motogp: {
    sport: "Motor Racing",
    label: "MotoGP",
    // ESPN has no MotoGP news endpoint — this league is RSS-only by necessity.
    feeds: [
      "https://www.crash.net/rss/motogp",
      "https://www.motorsport.com/rss/motogp/news/",
      "https://www.autosport.com/rss/motogp/news/",
      "https://www.motorsportweek.com/feed",
    ],
  },
  indycar: {
    sport: "Motor Racing",
    label: "IndyCar",
    espn: "racing/irl",
    feeds: [
      "https://www.motorsport.com/rss/indycar/news/",
      "https://www.autosport.com/rss/indycar/news/",
      "https://racer.com/feed/",
    ],
  },
};

// Leagues grouped for the Settings picker, in registry order.
export function leaguesBySport() {
  const bySport = new Map();
  for (const [key, league] of Object.entries(SPORTS_LEAGUES)) {
    if (!bySport.has(league.sport)) bySport.set(league.sport, []);
    bySport.get(league.sport).push([key, league]);
  }
  return [...bySport];
}

// Saved prefs and old share links still carry "racing", which became four
// series. Map it forward rather than silently dropping the reader's only sport.
const LEAGUE_ALIASES = { racing: "f1" };

export function normalizeLeagues(leagues) {
  const picks = (leagues || [])
    .map((l) => LEAGUE_ALIASES[l] || l)
    .filter((l) => SPORTS_LEAGUES[l]);
  return picks.length ? [...new Set(picks)] : DEFAULT_PREFS.leagues;
}

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
    feeds: [], // dynamic: prebuilt per league into data/sports.json (lib/sports.js)
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

// Resolve the RSS feed list for a topic. Sports is keyed by league rather than
// by topic (see SPORTS_LEAGUES / lib/sports.js), so it returns no feeds here.
export function feedsForTopic(topicKey) {
  return TOPICS[topicKey]?.feeds || [];
}
