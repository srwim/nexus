import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "NEXUS — Your News, Your Way",
  description: "Syndicated news, rated by you, delivered daily.",
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
