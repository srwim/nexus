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
