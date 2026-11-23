import { ErrorState } from "@/components/app";
import { updateAutomationEmails, type SettingsSnapshot } from "@/api/settings";
import { useAutosave } from "../use-autosave";
import { useApplySettingsPatch, useSettingsData } from "../use-settings-data";
import { SettingsCard, SettingsRowsSkeleton, SettingsToggleRow } from "../settings-ui";

type EmailPrefs = Pick<SettingsSnapshot, "automationEmails" | "emailOnPostFailed">;

const sameEmailPrefs = (a: EmailPrefs, b: EmailPrefs) =>
  a.automationEmails === b.automationEmails && a.emailOnPostFailed === b.emailOnPostFailed;

function clientTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone?.trim() ?? "";
  } catch {
    return "";
  }
}

/** Only the two email switches that exist today. No placeholders. */
export function NotificationsSection() {
  const query = useSettingsData();
  if (query.isPending) {
    return (
      <SettingsCard title="Email">
        <SettingsRowsSkeleton rows={2} />
      </SettingsCard>
    );
  }
  if (query.isError || !query.data) {
    return (
      <ErrorState
        message="Couldn't load your email settings."
        detail={query.error instanceof Error ? query.error.message : undefined}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  return (
    <EmailPrefsForm
      initial={{
        // DB/API default is on; never show "off" for a missing value.
        automationEmails: query.data.settings.automationEmails ?? true,
        emailOnPostFailed: query.data.settings.emailOnPostFailed ?? true,
      }}
    />
  );
}

function EmailPrefsForm({ initial }: { initial: EmailPrefs }) {
  const applyPatch = useApplySettingsPatch();
  const prefs = useAutosave<EmailPrefs>({
    value: initial,
    isEqual: sameEmailPrefs,
    errorMessage: "Couldn't save your email settings",
    save: async (next) => {
      // One endpoint saves both switches, so always send both.
      const fd = new FormData();
      const tz = clientTimezone();
      if (tz) fd.append("clientTimezone", tz);
      if (next.automationEmails) fd.append("automationEmails", "on");
      if (next.emailOnPostFailed) fd.append("emailOnPostFailed", "on");
      await updateAutomationEmails(fd);
    },
    onSaved: (next) => applyPatch(next),
  });
  const v = prefs.value;

  return (
    <SettingsCard title="Email">
      <SettingsToggleRow
        checked={v.emailOnPostFailed}
        onCheckedChange={(checked) =>
          prefs.set({ ...v, emailOnPostFailed: checked }, { immediate: true })
        }
        label="Email me when a post fails"
        description={
          v.automationEmails
            ? "Says which account and network failed, with a link to the post."
            : "Paused while automation emails are off."
        }
      />
      <SettingsToggleRow
        checked={v.automationEmails}
        onCheckedChange={(checked) =>
          prefs.set({ ...v, automationEmails: checked }, { immediate: true })
        }
        label="Automation emails"
        description="Reminders Social0 sends on its own, like when you haven't posted or connected an account. Turning this off also stops failure emails."
      />
    </SettingsCard>
  );
}
