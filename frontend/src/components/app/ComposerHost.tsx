import { lazy, Suspense } from "react";
import { closeComposer, useComposerState } from "./composer-bus";

/**
 * Lazily loaded so the composer bundle only downloads on first open.
 * Contract: `@/features/dashboard/create/ComposerModal` exports a named
 * `ComposerModal` taking `ComposerModalProps` (from `./composer-bus`):
 *   { open: boolean; options: ComposerOpenOptions; nonce: number; onClose(): void }
 */
const ComposerModal = lazy(() =>
  import("@/features/dashboard/create/ComposerModal").then((m) => ({
    default: m.ComposerModal,
  })),
);

/**
 * Mount once inside the dashboard layout. Renders the composer modal when
 * something calls `openComposer()`. Nothing is loaded until then.
 */
export function ComposerHost() {
  const { open, options, nonce } = useComposerState();
  if (nonce === 0) return null;
  return (
    <Suspense fallback={null}>
      <ComposerModal
        open={open}
        options={options}
        nonce={nonce}
        onClose={closeComposer}
      />
    </Suspense>
  );
}
