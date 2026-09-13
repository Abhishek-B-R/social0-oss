import type { ReactNode } from "react";
import { toast } from "sonner";
import { PinterestConfigInline } from "@/components/PinterestConfigInline";
import { XPostSettingsInline } from "@/components/XPostSettingsInline";
import type { XPostSettings } from "@/components/XPostSettingsInline";
import type { PinterestPostSettings } from "@/lib/pinterest-settings";
import { getPinterestBoardRequiredMessage } from "@/lib/pinterest-board-validation";

const EMPTY_PINTEREST_SETTINGS: PinterestPostSettings = {
  boardId: "",
  title: "",
  link: "",
  rememberBoard: false,
  rememberLink: false,
};

type PinterestAccount = { id: string; platformUsername?: string | null };

/**
 * The dialog chrome both bulk-schedule settings steps use: scrim, panel,
 * heading, and a Cancel / Continue &amp; Schedule footer. `onContinue` is what
 * differs between the image and video tools — the video one has a YouTube step
 * after this — so the decision stays with the caller.
 */
function BulkSettingsModal(props: {
  titleId: string;
  title: string;
  panelWidthClass: string;
  onCancel: () => void;
  onContinue: () => void;
  children: ReactNode;
}) {
  return (
    <div className="sheet-scrim bg-black/50">
      <div
        className={`sheet-panel ${props.panelWidthClass} border border-border bg-card p-5 shadow-xl`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={props.titleId}
      >
        <h3
          id={props.titleId}
          className="text-lg font-semibold text-foreground"
        >
          {props.title}
        </h3>
        <div className="mt-4">{props.children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-border bg-bg-elevated px-4 py-2 text-sm font-medium text-text hover:bg-bg-subtle"
            onClick={props.onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            onClick={props.onContinue}
          >
            Continue &amp; Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Per-account Pinterest board/title/link before a bulk schedule. Continuing is
 * blocked until every selected Pinterest account has a board, which is the one
 * field the API rejects a pin without.
 */
export function BulkPinterestModal(props: {
  accounts: PinterestAccount[];
  settingsByAccount: Record<string, PinterestPostSettings>;
  setSettingsByAccount: React.Dispatch<
    React.SetStateAction<Record<string, PinterestPostSettings>>
  >;
  selectedAccountIndex: number;
  setSelectedAccountIndex: (index: number) => void;
  error: string | null;
  setError: (message: string | null) => void;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const activeId = props.accounts[props.selectedAccountIndex]?.id ?? "";
  const setFor = (id: string | undefined, settings: PinterestPostSettings) => {
    if (!id) return;
    props.setSettingsByAccount((prev) => ({ ...prev, [id]: settings }));
  };

  return (
    <BulkSettingsModal
      titleId="bulk-pinterest-settings-title"
      title="Pinterest Settings"
      panelWidthClass="max-w-2xl"
      onCancel={props.onCancel}
      onContinue={() => {
        const boardMessage = getPinterestBoardRequiredMessage(
          props.accounts,
          props.settingsByAccount,
          "schedule",
        );
        if (boardMessage) {
          props.setError(boardMessage);
          toast.error(boardMessage);
          return;
        }
        props.setError(null);
        props.onContinue();
      }}
    >
      {props.accounts.length > 1 ? (
        <>
          <div className="mb-4 flex rounded-lg border border-border bg-bg-muted/30 p-0.5">
            {props.accounts.map((acc, idx) => (
              <button
                key={acc.id}
                type="button"
                onClick={() => props.setSelectedAccountIndex(idx)}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  props.selectedAccountIndex === idx
                    ? "bg-bg-elevated text-text shadow-sm"
                    : "text-text-muted hover:text-text"
                }`}
              >
                {acc.platformUsername?.trim()
                  ? `@${acc.platformUsername}`
                  : `Account ${idx + 1}`}
              </button>
            ))}
          </div>
          <PinterestConfigInline
            accountId={activeId}
            value={props.settingsByAccount[activeId] ?? EMPTY_PINTEREST_SETTINGS}
            onChange={(s) => setFor(activeId, s)}
            isVisible={true}
          />
        </>
      ) : (
        <PinterestConfigInline
          accountId={props.accounts[0]?.id ?? ""}
          value={
            props.settingsByAccount[props.accounts[0]?.id ?? ""] ??
            EMPTY_PINTEREST_SETTINGS
          }
          onChange={(s) => setFor(props.accounts[0]?.id, s)}
          isVisible={true}
        />
      )}
      {props.error && (
        <p className="mt-3 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {props.error}
        </p>
      )}
    </BulkSettingsModal>
  );
}

/** X post options before a bulk schedule. */
export function BulkXModal(props: {
  value: XPostSettings;
  onChange: (settings: XPostSettings) => void;
  onCancel: () => void;
  onContinue: () => void;
}) {
  return (
    <BulkSettingsModal
      titleId="bulk-x-settings-title"
      title="X Settings"
      panelWidthClass="max-w-xl"
      onCancel={props.onCancel}
      onContinue={props.onContinue}
    >
      <XPostSettingsInline
        value={props.value}
        onChange={props.onChange}
        isVisible={true}
      />
    </BulkSettingsModal>
  );
}
