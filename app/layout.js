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
        <footer className="footer">Syndicated from trusted public feeds · Ranked by your ratings</footer>
      </body>
    </html>
  );
}
