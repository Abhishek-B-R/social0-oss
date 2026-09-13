import { OTP_LENGTH } from "@/lib/otp";

/**
 * The one-time-code boxes used by password reset, email verification and the
 * change-email step in settings.
 *
 * All three had their own copy of the same fiddly bits: strip non-digits,
 * advance on entry, step back on backspace into an empty box, and spread a
 * paste across the boxes from the first one. Only the input styling differed,
 * so that stays a prop.
 *
 * Digits are addressed by position rather than as one string, so a box the user
 * clicked into and filled out of order keeps its slot instead of sliding left.
 */
export function OtpInputs(props: {
  /** Exactly `length` entries; use `otpDigitsOf` to build it from a string. */
  digits: string[];
  onChange: (next: string[]) => void;
  inputClassName: string;
  length?: number;
}) {
  const length = props.length ?? OTP_LENGTH;

  const replaceAt = (index: number, digit: string) => {
    const next = props.digits.slice();
    next[index] = digit;
    props.onChange(next);
  };

  return (
    <>
      {props.digits.map((digit, i) => (
        <input
          key={i}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={digit}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            if (v.length > 1) return;
            replaceAt(i, v);
            if (v && i < length - 1) {
              const nextEl = e.target
                .nextElementSibling as HTMLInputElement | null;
              nextEl?.focus();
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            const pasted = e.clipboardData
              .getData("text")
              .replace(/\D/g, "")
              .slice(0, length);
            const next = props.digits.slice();
            pasted.split("").forEach((d, idx) => {
              next[idx] = d;
            });
            props.onChange(next);
            const firstEmpty = Math.min(pasted.length, length - 1);
            const el =
              e.currentTarget.parentElement?.querySelectorAll("input")[
                firstEmpty
              ];
            el?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !props.digits[i] && i > 0) {
              const prev = e.currentTarget
                .previousElementSibling as HTMLInputElement | null;
              prev?.focus();
            }
          }}
          className={props.inputClassName}
          aria-label={`Digit ${i + 1} of ${length}`}
        />
      ))}
    </>
  );
}
