import type { Dispatch, SetStateAction } from "react";
import { AccountTabs } from "@/components/AccountTabs";
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
      <AccountTabs
        accounts={props.accounts}
        selectedIndex={props.selectedAccountIndex}
        onSelect={props.setSelectedAccountIndex}
      />
      {config}
    </>
  );
}
