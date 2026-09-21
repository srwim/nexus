// Repair tool for the phantom opt-outs, and nothing wider than that.
//
// Read this before using it.
//
// HubSpot's unsubscribe is sticky on purpose, and that stickiness is not a bug
// to be fixed. CAN-SPAM and GDPR both require an opt-out to hold until the
// person themselves reverses it; a system that quietly re-subscribes people is
// the thing those rules exist to prevent. So this script does NOT make
// unsubscribes less sticky, and there is deliberately no "resubscribe the whole
// list" mode.
//
// What it does is undo a specific, known, machine-made error: between 23 Jul and
// 18 Sep 2026 the worker's /unsubscribe route acted on GET, so mail scanners and
// link prefetchers opted readers out by merely scanning a delivered brief. Those
// readers never asked to leave. Putting them back is a correction, not a
// re-subscription, and it is only defensible for addresses where that is
// actually what happened.
//
// The rules that keep it defensible:
//   - Every address is named on the command line. There is no bulk mode.
//   - It is a dry run unless you pass --confirm.
//   - It re-reads the status afterwards and reports what is actually true,
//     rather than trusting the write to have worked.
//   - An address that is already subscribed is left alone.
//
// Run scripts/audit-optouts.mjs first. Anything it calls "probably deliberate"
// should not appear in this command's arguments. If you are unsure about an
// address, the safe answer is to leave it unsubscribed and let the person opt
// back in through the signup form themselves.
//
//   HUBSPOT_TOKEN=... node scripts/resubscribe.mjs a@x.com b@y.com
//   HUBSPOT_TOKEN=... node scripts/resubscribe.mjs a@x.com --confirm
//
// Meant to be run locally: it takes real addresses as arguments, so it has no
// business in a public CI log.
const token = process.env.HUBSPOT_TOKEN;
if (!token) {
  console.error("Set HUBSPOT_TOKEN.");
  process.exit(1);
}

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const emails = args.filter((a) => !a.startsWith("--") && a.includes("@")).map((e) => e.trim().toLowerCase());

if (!emails.length) {
  console.error(
    "Name the addresses to restore, one or more, as arguments.\n" +
      "There is no bulk mode: each address is a decision that someone has to make.\n\n" +
      "  node scripts/resubscribe.mjs reader@example.com another@example.com [--confirm]\n"
  );
  process.exit(1);
}

const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const LEGAL_BASIS = "LEGITIMATE_INTEREST_CLIENT";
const EXPLANATION =
  "Restoring a subscription removed in error: an unsubscribe endpoint that responded to " +
  "automated GET requests from mail scanners opted this contact out without any action by them.";

// What HubSpot currently thinks. This is the value the send obeys.
async function statusOf(email) {
  const res = await fetch(
    `https://api.hubapi.com/communication-preferences/v4/statuses/${encodeURIComponent(email)}?channel=EMAIL`,
    { headers: auth }
  );
  if (!res.ok) return { state: "unknown", detail: `${res.status}` };
  const results = (await res.json())?.results || [];
  const out = results.some((r) => String(r.status).toUpperCase() === "UNSUBSCRIBED");
  return { state: out ? "out" : "in", detail: "" };
}

// HubSpot has moved this endpoint between versions and the v4 subscribe body is
// not consistent across portals, so try v4, then the documented v3 call. Neither
// being accepted is reported as a failure rather than papered over.
async function subscribe(email) {
  const v4 = await fetch(
    `https://api.hubapi.com/communication-preferences/v4/statuses/${encodeURIComponent(email)}/subscribe-all?channel=EMAIL`,
    { method: "POST", headers: auth, body: JSON.stringify({ legalBasis: LEGAL_BASIS, legalBasisExplanation: EXPLANATION }) }
  );
  if (v4.ok) return "v4 subscribe-all";

  const defsRes = await fetch("https://api.hubapi.com/communication-preferences/v3/definitions", { headers: auth });
  if (defsRes.ok) {
    const subs = (await defsRes.json()).subscriptionDefinitions || [];
    const sub = subs.find((s) => /market/i.test(s.name || "")) || subs[0];
    if (sub) {
      const v3 = await fetch("https://api.hubapi.com/communication-preferences/v3/subscribe", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          emailAddress: email,
          subscriptionId: String(sub.id),
          legalBasis: LEGAL_BASIS,
          legalBasisExplanation: EXPLANATION,
        }),
      });
      if (v3.ok) return `v3 subscribe (${sub.name || sub.id})`;
      return `failed (v4 ${v4.status}, v3 ${v3.status})`;
    }
  }
  return `failed (v4 ${v4.status}, no v3 subscription definition)`;
}

// The send checks hs_email_optout as well as the channel status, so a contact
// restored on one but not the other would still be skipped.
async function clearOptOutFlag(email) {
  const search = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
      properties: ["email", "hs_email_optout"],
      limit: 1,
    }),
  });
  if (!search.ok) return `contact lookup failed (${search.status})`;
  const contact = (await search.json())?.results?.[0];
  if (!contact) return "no contact record";
  if (String(contact.properties?.hs_email_optout || "").toLowerCase() !== "true") return "flag already clear";

  const patch = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contact.id}`, {
    method: "PATCH",
    headers: auth,
    body: JSON.stringify({ properties: { hs_email_optout: "false" } }),
  });
  return patch.ok ? "flag cleared" : `flag PATCH failed (${patch.status})`;
}

console.log(
  confirm
    ? `\nRestoring ${emails.length} address(es). Each one is being treated as a scanner-made opt-out.\n`
    : `\nDRY RUN. Nothing will be changed. Add --confirm to apply.\n`
);

let restored = 0;
let skipped = 0;
let failed = 0;

for (const email of emails) {
  const before = await statusOf(email);

  if (before.state === "in") {
    console.log(`  ${email}: already subscribed, leaving alone`);
    skipped++;
    continue;
  }
  if (before.state === "unknown") {
    console.log(`  ${email}: status could not be read (${before.detail}), skipping rather than guessing`);
    failed++;
    continue;
  }
  if (!confirm) {
    console.log(`  ${email}: opted out, would be restored`);
    continue;
  }

  const how = await subscribe(email);
  const flag = await clearOptOutFlag(email);
  const after = await statusOf(email); // verify rather than assume

  if (after.state === "in") {
    console.log(`  ${email}: restored via ${how}; ${flag}`);
    restored++;
  } else {
    console.log(`  ${email}: NOT restored (${how}; ${flag}); still reads as ${after.state}`);
    failed++;
  }
}

console.log(
  confirm
    ? `\nRestored ${restored}, already subscribed ${skipped}, failed ${failed}.\n` +
        "Verified by re-reading each status, not by trusting the write.\n"
    : "\nNothing was changed. Re-run with --confirm to apply.\n"
);
