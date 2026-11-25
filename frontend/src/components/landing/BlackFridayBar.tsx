// Black Friday 2026: 20% off with code BLACKFRIDAY (Dodo discount). Hidden after Dec 1 IST.
// shortcut: prerendered landing HTML keeps the bar until the next build, so rebuild after Dec 1.
export const BLACK_FRIDAY_CODE = "BLACKFRIDAY";
export const blackFridayActive = () => Date.now() < Date.UTC(2026, 11, 1, 18, 30);

export function BlackFridayBar() {
  if (!blackFridayActive()) return null;
  return (
    <div className="bg-[#111] px-4 py-2 text-center text-[13px] text-white">
      <b className="font-semibold">Black Friday:</b> 20% off any plan with code{" "}
      <code className="rounded bg-white/15 px-1.5 py-0.5 font-mono font-semibold">
        {BLACK_FRIDAY_CODE}
      </code>
      , for as long as you stay subscribed. Ends Dec 1.
    </div>
  );
}

export function BlackFridayNote() {
  if (!blackFridayActive()) return null;
  return (
    <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-[14px] text-foreground">
      <b className="font-semibold">Black Friday:</b> 20% off with code{" "}
      <code className="font-mono font-semibold">{BLACK_FRIDAY_CODE}</code> at
      checkout, for as long as you stay subscribed. Creator $23.92/mo, Agency
      $47.92/mo. Ends Dec 1.
    </p>
  );
}
