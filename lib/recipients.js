// Who gets today's mail, assembled from three sources that disagree.
//
// Pure and I/O-free so the precedence rules can be tested directly: this is the
// path where a mistake means mailing someone who unsubscribed, which is the one
// failure in this pipeline that can't be taken back.
//
// Precedence, weakest to strongest:
//   1. configTo       : the publication's own address, no theme, no settings
//   2. listed         : HubSpot contacts, carrying their theme and prefs
//   3. dropped        : on the list but failed opt-out verification
//   4. suppressed     : the SUPPRESS_EMAILS emergency brake
//
// 3 beating 1 is the part that isn't obvious and the reason this is a function.
// configTo seeds the map first, so an address in both 1 and 3 used to come back
// from the dead as a config entry: mailed after the opt-out check had excluded
// it, and mailed with theme: null and no prefs, so a reader with their own
// settings silently received the publication default instead.
export function mergeRecipients({ configTo, listed = [], dropped = [], suppressed = [] } = {}) {
  const key = (e) => String(e || "").trim().toLowerCase();
  const byEmail = new Map();
  const resurrected = [];
  const configKey = configTo ? key(configTo) : "";

  if (configKey) byEmail.set(configKey, { email: configTo, theme: null });

  for (const person of listed) {
    const k = key(person?.email);
    if (k) byEmail.set(k, person);
  }

  for (const email of dropped) {
    const k = key(email);
    if (!k) continue;
    // Only the config address counts as resurrected. A dropped address that
    // came from `listed` is ordinary opt-out enforcement and needs no warning,
    // and in practice can't happen, since a dropped contact is excluded from
    // `listed` by the same pass that reports it.
    if (byEmail.delete(k) && k === configKey) resurrected.push(k);
  }

  for (const email of suppressed) {
    const k = key(email);
    if (k) byEmail.delete(k);
  }

  // `resurrected` is only the ones the config entry would have revived: worth
  // a warning line, because it means someone's settings were being ignored.
  return { recipients: [...byEmail.values()], resurrected };
}
