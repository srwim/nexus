// A "use client" page cannot export metadata, so it lives here.
export const metadata = {
  title: "Preview Your Email",
  description: "See the Daily Brief exactly as it will arrive in your inbox, built from your own settings.",
  alternates: { canonical: "https://arok.ai/nexus/preview/" },
  robots: { index: false }, // a per-visitor render; nothing for a crawler to index
};

export default function PreviewLayout({ children }) {
  return children;
}
