import "./globals.css";
import Link from "next/link";
import { RATING_BASIS, CHECKED } from "@/lib/sources";

// The site is published to two hosts (arok.ai/nexus and srwim.github.io/nexus)
// with identical content. Without a canonical, search engines treat that as
// duplicate content and split any authority between them — so every page
// declares arok.ai as the original, whichever host served it.
const SITE = "https://arok.ai/nexus";
const DESCRIPTION =
  "A daily news brief you control. Rate topics 0–5 stars — politics, world, tech, AI, science, sports, weather and more — and get a personalized feed plus a morning email, assembled from trusted public feeds.";

export const metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "NEXUS — Your News, Your Way",
    template: "%s — NEXUS",
  },
  description: DESCRIPTION,
  applicationName: "NEXUS",
  // Absolute, not "/" — the site lives under a subpath, and a root-relative
  // canonical resolves against the ORIGIN, silently pointing at arok.ai's
  // homepage instead of NEXUS.
  alternates: { canonical: `${SITE}/` },
  openGraph: {
    type: "website",
    siteName: "NEXUS",
    url: SITE,
    title: "NEXUS — Your News, Your Way",
    description: DESCRIPTION,
    images: [{ url: "https://arok.ai/wp-content/uploads/2026/07/orb-128.png", width: 128, height: 128, alt: "NEXUS" }],
  },
  twitter: {
    card: "summary",
    title: "NEXUS — Your News, Your Way",
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <a href="https://arok.ai" className="topbar-logo" aria-label="AROK — arok.ai">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://arok.ai/wp-content/uploads/2026/07/orb-128.png" alt="AROK" width={44} height={44} />
          </a>
          <Link href="/" className="brand">
            <span>NEXUS</span>
          </Link>
          <nav>
            <Link href="/">Feed</Link>
            <Link href="/digest">Daily Brief</Link>
            <Link href="/settings">Settings</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="footer">
          <div>Syndicated from trusted public feeds · Ranked by your ratings</div>
          {/* Attribution belongs next to the claim, not buried in an About page:
              the labels assert something contestable about real organisations. */}
          <div className="footer-note">
            Ownership and political-lean labels summarise published ratings from {RATING_BASIS}, last
            reviewed {CHECKED}. They are not NEXUS&apos;s own assessment, and outlets are left unlabelled
            where those raters disagree.
          </div>
          <div className="footer-site">
            <span>
              Designed by{" "}
              <a href="http://sol-tek.us/" target="_blank" rel="noopener noreferrer">Sol-Tek</a>
            </span>
            <span>
              Copyright © <a href="https://arok.ai">Arok.ai</a> {new Date().getFullYear()}
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
