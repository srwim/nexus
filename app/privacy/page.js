// Privacy policy. Deliberately a page rather than a PDF or a link to a
// generator: it has to stay true as the code changes, so it lives next to the
// code and names the actual processors the pipeline uses.
//
// Everything here is checkable against the repo — HubSpot in scripts/
// integrations.mjs, Resend in scripts/send-newsletter.mjs, the Cloudflare
// worker in workers/local-news-proxy.js. If one of those changes, this changes.
import config from "@/nexus.config.json";
import { CONSENT_TEXT } from "@/lib/consent";

const UPDATED = "August 21, 2026";
const CONTACT = "privacy@arok.ai";

export default function PrivacyPage() {
  const postal = config.newsletter?.postalAddress || "";

  return (
    <div className="prose">
      <h1>Privacy <em>Policy</em></h1>
      <p className="subtitle">Last updated {UPDATED}</p>

      <h2>Who we are</h2>
      <p>
        NEXUS is a personalized news brief published under the AROK AI brand by{" "}
        <b>Consolidated Technologies LLC</b>, a Utah limited liability company. Consolidated
        Technologies LLC is the data controller for the information described below. If you have any
        question about your data, or want it deleted, email{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
      {postal ? <p>Our postal address is {postal.replace(/ · /g, ", ")}.</p> : null}

      <h2>What we collect, and why</h2>
      <ul>
        <li>
          <b>Your email address</b>, and your first name if you give it. Used only to send you the
          Daily Brief.
        </li>
        <li>
          <b>Your newsletter settings</b> — topic ratings, sports leagues, countries, theme, and
          zipcode if you set one. Used to decide which stories go in your edition.
        </li>
        <li>
          <b>A record of your consent</b> — the exact wording you agreed to, the time you agreed, and
          the page you were on. We keep this so we can show your subscription was opted into, which is
          something we are required to be able to demonstrate.
        </li>
      </ul>
      <p>
        Until you press <b>Apply to my email</b> or subscribe, your settings stay in your own browser
        and are never sent to us. Reading the site sends us nothing.
      </p>

      <h2>Our legal basis</h2>
      <p>
        Consent. You gave it by ticking the box that reads: &ldquo;{CONSENT_TEXT}&rdquo; You can
        withdraw it at any time, and withdrawing does not affect anything done before you did.
      </p>

      <h2>Who else handles it</h2>
      <p>
        We use a small number of service providers, all in the United States. They process your data
        only to provide their service to us.
      </p>
      <ul>
        <li><b>HubSpot</b> — stores the subscriber list, your settings and your consent record.</li>
        <li><b>Resend</b> — delivers the email.</li>
        <li>
          <b>Cloudflare</b> — runs a small service that turns your zipcode into local news and weather,
          and translates foreign headlines. Your zipcode reaches it; your email address never does.
        </li>
        <li><b>GitHub Pages</b> — hosts the site.</li>
      </ul>
      <p>
        We do not sell or rent your address, we do not share it with sponsors or advertisers, and we do
        not run third-party advertising or analytics trackers on this site.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Your address and settings are kept until you unsubscribe, after which they are removed from the
        sending list. We keep the consent record for two years after that, because it is the evidence
        that we had permission to email you in the first place. After two years it is deleted.
      </p>

      <h2>Your rights</h2>
      <p>
        Wherever you live, you can ask us to show you what we hold, correct it, delete it, hand it over
        in a portable form, restrict or object to how we use it, or withdraw your consent. Email{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we will act on it. There is no charge and you do
        not have to give a reason.
      </p>
      <p>
        If you are in the UK or the EEA and you think we have handled your data badly, you also have the
        right to complain to your national data protection authority.
      </p>

      <h2>Email practices</h2>
      <ul>
        <li>Every email says truthfully who it is from, with an accurate subject line.</li>
        <li>Every email carries a one-click unsubscribe link, honoured promptly and automatically.</li>
        <li>Every email includes our postal address.</li>
        <li>You will get one email a day, and nothing else. We do not send other campaigns.</li>
      </ul>
      <p>
        The fastest way to stop the emails is the unsubscribe link at the bottom of any of them.
        Emailing <a href={`mailto:${CONTACT}`}>{CONTACT}</a> works too.
      </p>

      <h2>Children</h2>
      <p>NEXUS is not directed at children, and we do not knowingly collect data from anyone under 16.</p>

      <h2>Changes</h2>
      <p>
        If this policy changes we will update the date at the top. If a change materially affects how we
        use your data, we will tell subscribers by email before it takes effect.
      </p>
    </div>
  );
}
