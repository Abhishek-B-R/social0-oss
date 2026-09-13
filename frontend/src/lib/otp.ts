export const OTP_LENGTH = 6;

/** Pad or trim a code string into exactly `length` single-character slots. */
export function otpDigitsOf(value: string, length = OTP_LENGTH): string[] {
  return value
    .split("")
    .concat(Array(length).fill(""))
    .slice(0, length);
}
