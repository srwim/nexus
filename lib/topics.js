// Topic registry: every topic maps to one or more free RSS feeds.
// Local news + weather are built by zipcode (from nexus.config.json) at data-build time.

// How many stories a topic earns in the feed/digest, by rating (0-5 stars).
export const STORY_BUDGET = { 0: 0, 1: 2, 2: 3, 3: 4, 4: 6, 5: 8 };

export const SPORTS_LEAGUES = {
  nfl: { label: "NFL", feeds: ["https://www.espn.com/espn/rss/nfl/news"] },
  nba: { label: "NBA", feeds: ["https://www.espn.com/espn/rss/nba/news"] },
  mlb: { label: "MLB", feeds: ["https://www.espn.com/espn/rss/mlb/news"] },
  nhl: { label: "NHL", feeds: ["https://www.espn.com/espn/rss/nhl/news"] },
  soccer: { label: "Soccer", feeds: ["https://www.espn.com/espn/rss/soccer/news"] },
  ncaaf: { label: "College Football", feeds: ["https://www.espn.com/espn/rss/ncf/news"] },
  ncaab: { label: "College Basketball", feeds: ["https://www.espn.com/espn/rss/ncb/news"] },
  golf: { label: "Golf", feeds: ["https://www.espn.com/espn/rss/golf/news"] },
  racing: { label: "Racing", feeds: ["https://www.espn.com/espn/rss/rpm/news"] },
};

export const TOPICS = {
  politics: {
    label: "US Politics",
    icon: "🏛️",
    feeds: [
      "https://rss.politico.com/politics-news.xml",
      "https://thehill.com/homenews/feed/",
      "https://feeds.npr.org/1014/rss.xml",
    ],
  },
  world: {
    label: "World News",
    icon: "🌍",
    feeds: [
      "https://feeds.bbci.co.uk/news/world/rss.xml",
      "https://www.aljazeera.com/xml/rss/all.xml",
      "https://feeds.npr.org/1004/rss.xml",
    ],
  },
  conflict: {
    label: "World Conflict",
    icon: "⚔️",
    feeds: [
      "https://reliefweb.int/updates/rss.xml",
      "https://www.defenseone.com/rss/all/",
      "https://warontherocks.com/feed/",
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
    ],
  },
  space: {
    label: "Space",
    icon: "🚀",
    feeds: [
      "https://www.nasa.gov/feed/",
      "https://www.space.com/feeds/all",
      "https://spacenews.com/feed/",
    ],
  },
  ai: {
    label: "AI",
    icon: "🤖",
    feeds: [
      "https://techcrunch.com/category/artificial-intelligence/feed/",
      "https://venturebeat.com/category/ai/feed/",
      "https://www.technologyreview.com/feed/",
    ],
  },
  culture: {
    label: "Culture & Entertainment",
    icon: "🎬",
    feeds: [
      "https://variety.com/feed/",
      "https://www.rollingstone.com/feed/",
      "https://www.hollywoodreporter.com/feed/",
    ],
  },
};

export const DEFAULT_PREFS = {
  zip: "",
  email: "",
  leagues: ["nfl", "nba"],
  ratings: {
    politics: 3,
    world: 3,
    conflict: 3,
    local: 3,
    weather: 3,
    sports: 3,
    tech: 3,
    space: 3,
    ai: 3,
    culture: 3,
  },
};

// Resolve the actual feed list for a topic given user prefs.
export function feedsForTopic(topicKey, prefs = {}) {
  const topic = TOPICS[topicKey];
  if (!topic) return [];
  if (topicKey === "sports") {
    const leagues = prefs.leagues?.length ? prefs.leagues : ["nfl", "nba"];
    return leagues.flatMap((l) => SPORTS_LEAGUES[l]?.feeds || []);
  }
  return topic.feeds;
}
