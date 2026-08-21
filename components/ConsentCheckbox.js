"use client";
// Explicit opt-in. Unticked by default and never pre-ticked: a pre-ticked box
// is not consent under GDPR, and "implied consent on submit" is exactly what
// this replaced.
import Link from "next/link";
import { CONSENT_TEXT, CONSENT_NOTICE } from "@/lib/consent";

export function ConsentCheckbox({ id, checked, onChange, error }) {
  return (
    <div className="consent-block">
      <label className="consent-row" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={`${id}-notice`}
          aria-invalid={error ? "true" : undefined}
        />
        <span>{CONSENT_TEXT}</span>
      </label>
      <div id={`${id}-notice`} className="consent-notice">
        {CONSENT_NOTICE}{" "}
        {/* Linked at the point of consent, not just in the footer: this is where
            someone decides, so it is where the detail has to be reachable. */}
        <Link href="/privacy">Privacy Policy</Link>
      </div>
      {error ? (
        <div className="consent-error" role="alert">
          Tick the box above to continue.
        </div>
      ) : null}
    </div>
  );
}
