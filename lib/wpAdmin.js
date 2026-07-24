"use client";
// Detect whether the current visitor is logged into the arok.ai WordPress admin.
// NEXUS is served from the same origin (arok.ai/nexus), so a same-origin request
// to /wp-admin/ carries the WordPress login cookie: logged-in users land on the
// admin page (URL stays under /wp-admin/), while logged-out users get redirected
// to /wp-login.php. Used to gate admin-only tools on the Settings page.
export async function isWpAdmin() {
  if (typeof window === "undefined") return false;
  try {
    const res = await fetch("/wp-admin/profile.php", { credentials: "include", redirect: "follow" });
    return res.ok && res.url.includes("/wp-admin/") && !res.url.includes("wp-login");
  } catch {
    return false;
  }
}
