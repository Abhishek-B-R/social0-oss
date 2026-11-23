import Link from "@/components/AppLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import { authClient, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useAutosave } from "../use-autosave";
import { useApplySettingsPatch, useSettingsData } from "../use-settings-data";
import { useSettingsScope } from "../settings-scope";
import {
  FieldError,
  InlineSkeleton,
  SettingsCard,
  SettingsRow,
  settingsInputClass,
  settingsStackClass,
} from "../settings-ui";
import { AvatarEditor } from "./AvatarEditor";

const NAME_MAX = 80;

/**
 * Renders at once from the session (name, email, picture). Only the bits
 * that need the settings RPC (how you sign in) show inline placeholders.
 */
export function ProfileSection() {
  const query = useSettingsData();
  const { data: session } = useSession();
  const user = session?.user;
  return (
    <ProfileForm
      displayName={query.data?.displayName ?? user?.name ?? ""}
      email={query.data?.email ?? user?.email ?? ""}
      image={query.data ? query.data.image : (user?.image ?? null)}
      isCredentialUser={query.data?.isCredentialUser ?? null}
      detailsLoading={query.isPending}
      loadError={
        query.isError ? (
          <p role="alert" className="text-[13px] text-text-muted">
            Couldn&apos;t load your sign-in details.{" "}
            <button
              type="button"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              className="font-medium text-accent hover:underline disabled:opacity-60"
            >
              {query.isFetching ? "Retrying…" : "Retry"}
            </button>
          </p>
        ) : null
      }
    />
  );
}

function ProfileForm({
  displayName,
  email,
  image,
  isCredentialUser,
  detailsLoading,
  loadError,
}: {
  displayName: string;
  email: string;
  image: string | null;
  /** null until the settings RPC answers. */
  isCredentialUser: boolean | null;
  detailsLoading: boolean;
  loadError?: React.ReactNode;
}) {
  const applyPatch = useApplySettingsPatch();
  const { settingsBase } = useSettingsScope();

  const name = useAutosave<string>({
    value: displayName,
    errorMessage: "Couldn't save your name",
    delay: 800,
    validate: (v) => (v.trim() ? null : "Your name can't be empty."),
    save: async (v) => {
      const { error } = await authClient.updateUser({ name: v.trim() });
      if (error) throw new Error(error.message ?? "Try again.");
    },
    onSaved: (v) => applyPatch({ displayName: v.trim() }),
  });

  return (
    <div className={settingsStackClass}>
      <SettingsCard>
        <SettingsRow label="Profile picture" stack>
          <AvatarEditor
            currentUrl={image}
            displayLabel={name.value || email || "You"}
            onSave={async (url) => {
              const { error } = await authClient.updateUser({ image: url });
              if (error) return { error: error.message ?? "Try again." };
              applyPatch({ image: url });
              return {};
            }}
          />
        </SettingsRow>
        <SettingsRow
          label="Name"
          htmlFor="settings-display-name"
          description={
            isCredentialUser === false
              ? "Starts as your Google name. Changing it here doesn't change Google."
              : undefined
          }
        >
          <input
            id="settings-display-name"
            value={name.value}
            maxLength={NAME_MAX}
            autoComplete="name"
            aria-invalid={name.error ? true : undefined}
            aria-describedby={name.error ? "settings-display-name-error" : undefined}
            onChange={(e) => name.set(e.target.value)}
            onBlur={name.flush}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                name.flush();
              }
            }}
            className={cn(settingsInputClass, "sm:w-72")}
          />
          <FieldError id="settings-display-name-error">{name.error}</FieldError>
        </SettingsRow>
        <SettingsRow
          label="Email"
          description={
            detailsLoading ? (
              <InlineSkeleton className="w-40" />
            ) : isCredentialUser === null ? undefined : isCredentialUser ? (
              <>
                Change it in{" "}
                <Link href={`${settingsBase}/security`} className="font-medium text-accent hover:underline">
                  Security
                </Link>
                .
              </>
            ) : (
              "You sign in with Google, so your email comes from Google."
            )
          }
        >
          <p className="truncate text-sm text-text sm:text-right" title={email}>
            {email}
          </p>
        </SettingsRow>
        {loadError}
      </SettingsCard>

      <SettingsCard title="Appearance">
        <SettingsRow label="Theme" description="Only changes this browser.">
          <ThemeToggle />
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}
