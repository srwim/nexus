// Settings is a personal control panel — no content worth indexing, and it
// would only dilute the site's few real pages in search results.
export const metadata = {
  title: "Settings",
  description: "Rate topics, pick leagues, set your zipcode and choose your newsletter theme.",
  robots: { index: false, follow: true },
};

export default function SettingsLayout({ children }) {
  return children;
}
