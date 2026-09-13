import type { Dispatch, SetStateAction } from "react";
import { PinterestConfigInline } from "@/components/PinterestConfigInline";
import type { PinterestPostSettings } from "@/lib/pinterest-settings";

const EMPTY_PINTEREST_SETTINGS: PinterestPostSettings = {
  boardId: "",
  title: "",
  link: "",
  rememberBoard: false,
  rememberLink: false,
};

export type PinterestSettingsAccount = {
  id: string;
  platformUsername?: string | null;
};

/**
 * Board, title and link for each selected Pinterest account — a tab strip when
 * there is more than one, the config form alone when there is not.
 *
 * The image form, the video form and the bulk-schedule dialog each rendered
 * this, so callers keep only what genuinely differs between them: where it
 * sits, and how they surface a validation error.
 */
export function PinterestAccountSettings(props: {
  accounts: PinterestSettingsAccount[];
  settingsByAccount: Record<string, PinterestPostSettings>;
  setSettingsByAccount: Dispatch<
    SetStateAction<Record<string, PinterestPostSettings>>
  >;
  selectedAccountIndex: number;
  setSelectedAccountIndex: (index: number) => void;
}) {
  const activeId =
    props.accounts.length > 1
      ? (props.accounts[props.selectedAccountIndex]?.id ?? "")
      : (props.accounts[0]?.id ?? "");

  const setFor = (settings: PinterestPostSettings) => {
    if (!activeId) return;
    props.setSettingsByAccount((prev) => ({ ...prev, [activeId]: settings }));
  };

  const config = (
    <PinterestConfigInline
      accountId={activeId}
      value={props.settingsByAccount[activeId] ?? EMPTY_PINTEREST_SETTINGS}
      onChange={setFor}
      isVisible={true}
    />
  );

  if (props.accounts.length <= 1) return config;

  return (
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
      {config}
    </>
  );
}
