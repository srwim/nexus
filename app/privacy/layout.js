// A "use client" page cannot export metadata, so it lives here.
export const metadata = {
  title: "Privacy Policy",
  description:
    "What NEXUS collects, why, who processes it, and how to get it deleted. Covers GDPR rights and CAN-SPAM email practices.",
  alternates: { canonical: "https://arok.ai/nexus/privacy/" },
};

export default function PrivacyLayout({ children }) {
  return children;
}
