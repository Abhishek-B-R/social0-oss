import { useState } from "react";
import { ErrorState } from "@/components/app";
import { Button } from "@/components/ui/button";
import { useApplySettingsPatch, useSettingsData } from "../use-settings-data";
import { SettingsCard, SettingsRow, SettingsRowsSkeleton, settingsStackClass } from "../settings-ui";
import {
  ChangeEmailDialog,
  ChangePasswordDialog,
  DeleteAccountDialog,
  SignOutEverywhereDialog,
} from "./security-dialogs";

type OpenDialog = "password" | "email" | "signout" | "delete" | null;

export function SecuritySection() {
  const query = useSettingsData();
  const applyPatch = useApplySettingsPatch();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const close = (o: boolean) => {
    if (!o) setDialog(null);
  };

  if (query.isPending) {
    return (
      <SettingsCard title="Sign-in">
        <SettingsRowsSkeleton rows={3} />
      </SettingsCard>
    );
  }
  if (query.isError || !query.data) {
    return (
      <ErrorState
        message="Couldn't load your sign-in details."
        detail={query.error instanceof Error ? query.error.message : undefined}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  const { email, isCredentialUser } = query.data;

  return (
    <div className={settingsStackClass}>
      <SettingsCard title="Sign-in">
        {isCredentialUser ? (
          <>
            <SettingsRow label="Password" description="At least 8 characters.">
              <Button variant="outline" size="sm" onClick={() => setDialog("password")}>
                Change password
              </Button>
            </SettingsRow>
            <SettingsRow label="Email" description={email}>
              <Button variant="outline" size="sm" onClick={() => setDialog("email")}>
                Change email
              </Button>
            </SettingsRow>
          </>
        ) : (
          <SettingsRow
            label="Google sign-in"
            description={`You sign in with Google as ${email}. Your password and email are managed by Google.`}
          />
        )}
        <SettingsRow
          label="Devices"
          description="Signs out every browser and app, including this one."
        >
          <Button variant="outline" size="sm" onClick={() => setDialog("signout")}>
            Sign out of all devices
          </Button>
        </SettingsRow>
      </SettingsCard>

      <SettingsCard tone="danger" title="Danger zone">
        <SettingsRow
          label="Delete account"
          description="Disconnects your accounts, cancels your plan and deletes teams you own. Can't be undone."
        >
          <Button
            variant="outline"
            size="sm"
            className="border-danger-border text-danger hover:bg-danger-soft hover:text-danger"
            onClick={() => setDialog("delete")}
          >
            Delete account…
          </Button>
        </SettingsRow>
      </SettingsCard>

      {isCredentialUser ? (
        <>
          <ChangePasswordDialog open={dialog === "password"} onOpenChange={close} />
          <ChangeEmailDialog
            open={dialog === "email"}
            onOpenChange={close}
            currentEmail={email}
            onChanged={(next) => applyPatch({ email: next })}
          />
        </>
      ) : null}
      <SignOutEverywhereDialog open={dialog === "signout"} onOpenChange={close} />
      <DeleteAccountDialog open={dialog === "delete"} onOpenChange={close} email={email} />
    </div>
  );
}
