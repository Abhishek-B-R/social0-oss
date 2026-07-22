
import { Link } from "react-router-dom";
import type { LegalConsentValues } from "@/components/auth/legal-consent";

type LegalConsentCheckboxesProps = {
  values: LegalConsentValues;
  onChange: (values: LegalConsentValues) => void;
  idPrefix?: string;
  showMarketing?: boolean;
};

function LegalCheckbox({
  id,
  checked,
  onCheckedChange,
  children,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-start gap-2.5 text-sm text-foreground cursor-pointer"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-accent focus:ring-emerald-500"
      />
      <span className="leading-snug">{children}</span>
    </label>
  );
}

export function LegalConsentCheckboxes({
  values,
  onChange,
  idPrefix = "legal",
  showMarketing = true,
}: LegalConsentCheckboxesProps) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
      <legend className="sr-only">Legal agreements</legend>
      <LegalCheckbox
        id={`${idPrefix}-terms`}
        checked={values.acceptTerms}
        onCheckedChange={(acceptTerms) => onChange({ ...values, acceptTerms })}
      >
        I agree to the{" "}
        <Link
          to="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-accent"
        >
          Terms of Service
        </Link>
        .
      </LegalCheckbox>
      <LegalCheckbox
        id={`${idPrefix}-privacy`}
        checked={values.acceptPrivacy}
        onCheckedChange={(acceptPrivacy) =>
          onChange({ ...values, acceptPrivacy })
        }
      >
        I acknowledge the{" "}
        <Link
          to="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-accent"
        >
          Privacy Policy
        </Link>
        .
      </LegalCheckbox>
      {showMarketing && (
        <LegalCheckbox
          id={`${idPrefix}-marketing`}
          checked={values.marketingOptIn}
          onCheckedChange={(marketingOptIn) =>
            onChange({ ...values, marketingOptIn })
          }
        >
          I&apos;d like to receive product updates and marketing emails.
        </LegalCheckbox>
      )}
    </fieldset>
  );
}
