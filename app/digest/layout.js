// Server component wrapping the client page, purely so this route can declare
// its own metadata — a "use client" page cannot export any.
export const metadata = {
  title: "Daily Brief",
  description:
    "Today's brief: the top stories from every topic you follow, ordered by your star ratings and de-duplicated across sections.",
  // Absolute — a root-relative canonical would resolve to arok.ai/digest/,
  // which doesn't exist (the site is served under /nexus).
  alternates: { canonical: "https://arok.ai/nexus/digest/" },
};

export default function DigestLayout({ children }) {
  return children;
}
