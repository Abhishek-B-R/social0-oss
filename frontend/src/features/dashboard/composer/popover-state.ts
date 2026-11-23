/** Open composer popovers, so the modal's Esc closes a popover first. */
let openCount = 0;

export function composerPopoverOpen(): boolean {
  return openCount > 0;
}

export function trackPopoverOpen(): () => void {
  openCount += 1;
  return () => {
    openCount -= 1;
  };
}
