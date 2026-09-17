// Read-only audit of who is opted out of the NEXUS brief, and when it happened.
//
// Written to answer one question: which of these unsubscribes did a person mean?
//
// For six weeks the worker's /unsubscribe route acted on any HTTP method, so
// every mail scanner, safe-links rewriter and prefetcher that followed the link
// in a delivered brief silently opted that reader out. Those phantom opt-outs
// were invisible until the send began honouring subscription status on 8 Sep.
// Before resubscribing anyone, the real opt-outs have to be told apart from the
// machine-made ones — and only the timestamps can do that.
//
// This script writes NOTHING. It reads HubSpot and prints. Resubscribing is a
// deliberate act and stays a human one.
//
//   HUBSPOT_TOKEN=... HUBSPOT_LIST_ID=... node scripts/audit-optouts.mjs
//
// Needs the same scopes the send uses: crm.lists.read, crm.objects.contacts.read
// and communication_preferences.read_write.
const token = process.env.HUBSPOT_TOKEN;
const listId = process.env.HUBSPOT_LIST_ID;
if (!token || !listId) {
  console.error("Set HUBSPOT_TOKEN and HUBSPOT_LIST_ID. This script only reads; it changes nothing.");
  process.exit(1);
}
const auth = { Authorization: `Bearer ${token}` };

// Opt-outs this far apart or closer are treated as one cluster. Readers decide
// to leave independently; scanners move through a delivery batch together, so a
// tight cluster is the signature of the latter.
const CLUSTER_MS = 2 * 60 * 60 * 1000;

const iso = (t) => (Number.isFinite(t) ? new Date(t).toISOString().replace("T", " ").slice(0, 19) + "Z" : "unknown");
const ms = (v) => {
  if (v == null) return NaN;
  if (typeof v === "number") return v;
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : NaN;
};

async function getJson(url, init) {
  const res = await fetch(url, { ...init, headers: { ...auth, ...(init?.headers || {}) } });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// ---- 1. the list ----------------------------------------------------------
const members = await getJson(`https://api.hubapi.com/crm/v3/lists/${listId}/memberships?limit=100`);
const ids = (members.results || []).map((m) => ({ id: m.recordId || m }));
if (!ids.length) {
  console.log("The list has no members.");
  process.exit(0);
}

// ---- 2. contacts, with the opt-out flag's history -------------------------
// propertiesWithHistory gives each past value with the timestamp it was set and
// where it came from — which is the whole point of this exercise.
const contacts = await getJson("https://api.hubapi.com/crm/v3/objects/contacts/batch/read", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    inputs: ids,
    properties: ["email", "hs_email_optout"],
    propertiesWithHistory: ["hs_email_optout"],
  }),
});

// ---- 3. channel-level subscription status, per contact --------------------
// The v4 record is what the send actually obeys, so it is the authority on
// "opted out" even when hs_email_optout disagrees.
async function channelStatus(email) {
  try {
    const d = await getJson(
      `https://api.hubapi.com/communication-preferences/v4/statuses/${encodeURIComponent(email)}?channel=EMAIL`
    );
    const out = (d?.results || []).find((r) => String(r.status).toUpperCase() === "UNSUBSCRIBED");
    if (!out) return { status: "in", at: NaN, source: "" };
    // HubSpot has spelled this field several ways across versions; take whichever is present.
    const at = ms(out.timestamp ?? out.statusUpdatedAt ?? out.updatedAt ?? out.lastUpdated);
    return { status: "out", at, source: String(out.sourceOfStatus || out.source || "") };
  } catch (e) {
    return { status: "error", at: NaN, source: String(e.message).slice(0, 60) };
  }
}

const rows = [];
for (const c of contacts.results || []) {
  const email = c.properties?.email;
  if (!email) continue;
  const flag = String(c.properties?.hs_email_optout || "").toLowerCase() === "true";

  // The most recent history entry that set the flag true is when it happened.
  const hist = (c.propertiesWithHistory?.hs_email_optout || [])
    .filter((h) => String(h.value).toLowerCase() === "true")
    .map((h) => ({ at: ms(h.timestamp), source: `${h.sourceType || "?"}${h.sourceId ? `:${h.sourceId}` : ""}` }))
    .sort((a, b) => b.at - a.at);

  const ch = await channelStatus(email);
  if (ch.status === "in" && !flag) continue; // still subscribed — nothing to judge

  rows.push({
    email,
    flag,
    channel: ch.status,
    at: Number.isFinite(ch.at) ? ch.at : hist[0]?.at ?? NaN,
    source: ch.source || hist[0]?.source || "",
  });
}

if (!rows.length) {
  console.log(`${ids.length} contact(s) on the list, none opted out.`);
  process.exit(0);
}

// ---- 4. cluster, then report ----------------------------------------------
rows.sort((a, b) => (a.at || Infinity) - (b.at || Infinity));
let cluster = 0;
rows.forEach((r, i) => {
  const prev = rows[i - 1];
  if (!prev || !Number.isFinite(r.at) || !Number.isFinite(prev.at) || r.at - prev.at > CLUSTER_MS) cluster++;
  r.cluster = cluster;
});
const sizes = new Map();
for (const r of rows) sizes.set(r.cluster, (sizes.get(r.cluster) || 0) + 1);

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${rows.length} of ${ids.length} contact(s) are opted out.\n`);
console.log(pad("WHEN (UTC)", 22) + pad("EMAIL", 34) + pad("CHANNEL", 9) + pad("FLAG", 6) + "READING");
console.log("-".repeat(110));
for (const r of rows) {
  const grouped = sizes.get(r.cluster) > 1;
  const reading = !Number.isFinite(r.at)
    ? "no timestamp — check the contact timeline by hand"
    : grouped
      ? `LIKELY SCANNER — ${sizes.get(r.cluster)} opt-outs within ${CLUSTER_MS / 3600000}h (cluster ${r.cluster})`
      : "probably deliberate — isolated in time";
  console.log(pad(iso(r.at), 22) + pad(r.email, 34) + pad(r.channel, 9) + pad(r.flag ? "true" : "-", 6) + reading);
}

console.log(
  "\nHow to read this. A cluster is several addresses opted out within hours of each other:\n" +
    "readers don't leave in lockstep, delivery scanners do. An isolated opt-out is far more\n" +
    "likely to be a real person — resubscribing one of those would be the actual mistake here,\n" +
    "so treat 'probably deliberate' as leave-alone unless you know otherwise.\n" +
    "\nCross-check a cluster against the send that preceded it: the brief goes out 10:02-11:47 UTC,\n" +
    "and a scanner fires minutes to hours after delivery.\n" +
    "\nNothing was changed. Resubscribe from the HubSpot UI, and deploy the fixed worker first —\n" +
    "otherwise the next delivery gets scanned and opts them straight back out.\n"
);
