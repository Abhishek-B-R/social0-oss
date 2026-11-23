import { useMemo } from "react";
import { LocateFixed } from "lucide-react";
import { ErrorState } from "@/components/app";
import { Button } from "@/components/ui/button";
import {
  updatePlatformPreferences,
  updateTimezone,
  type SettingsSnapshot,
} from "@/api/settings";
import {
  DATE_FORMAT_OPTIONS,
  formatTimezoneLabel,
  normalizeDateFormat,
  type DateFormatKey,
} from "@/lib/date-format";
import { useAutosave } from "../use-autosave";
import { useApplySettingsPatch, useSettingsData } from "../use-settings-data";
import {
  SettingsCard,
  SettingsRow,
  SettingsRowsSkeleton,
  SettingsSelect,
  SettingsToggleRow,
} from "../settings-ui";
import { browserTimeZone, sortedTimeZones } from "../timezones";

type Formats = { use24HourTimeFormat: boolean; dateFormat: DateFormatKey };

/** Timezone, date format and 24-hour time. These belong to you, not the workspace. */
export function PreferencesCard() {
  const query = useSettingsData();
  if (query.isPending) {
    return (
      <SettingsCard title="Time and dates">
        <SettingsRowsSkeleton rows={3} />
      </SettingsCard>
    );
  }
  if (query.isError || !query.data) {
    return (
      <ErrorState
        compact
        message="Couldn't load your timezone and formats."
        detail={query.error instanceof Error ? query.error.message : undefined}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  return <PreferencesForm settings={query.data.settings} />;
}

function PreferencesForm({ settings }: { settings: SettingsSnapshot }) {
  const applyPatch = useApplySettingsPatch();
  const detected = useMemo(() => browserTimeZone(), []);

  const timezone = useAutosave<string>({
    value: settings.timezone || "UTC",
    errorMessage: "Couldn't save your timezone",
    save: async (tz) => {
      const fd = new FormData();
      fd.append("timezone", tz);
      if (detected) fd.append("clientTimezone", detected);
      return updateTimezone(fd);
    },
    onSaved: (tz) => applyPatch({ timezone: tz }),
  });

  const formats = useAutosave<Formats>({
    value: {
      use24HourTimeFormat: settings.use24HourTimeFormat ?? false,
      dateFormat: normalizeDateFormat(settings.dateFormat),
    },
    isEqual: (a, b) =>
      a.use24HourTimeFormat === b.use24HourTimeFormat && a.dateFormat === b.dateFormat,
    errorMessage: "Couldn't save your date and time format",
    save: async (next) => {
      // One endpoint saves both, so always send both.
      const fd = new FormData();
      if (detected) fd.append("clientTimezone", detected);
      if (next.use24HourTimeFormat) fd.append("use24HourTimeFormat", "on");
      fd.append("dateFormat", next.dateFormat);
      await updatePlatformPreferences(fd);
    },
    onSaved: (next) => applyPatch(next),
  });

  const zones = useMemo(() => {
    const list = sortedTimeZones();
    return list.includes(timezone.value) ? list : [timezone.value, ...list];
  }, [timezone.value]);

  const canDetect = !!detected && detected !== timezone.value;

  return (
    <SettingsCard
      title="Time and dates"
      description="Used for schedules, the calendar and post times. Teammates keep their own."
    >
      <SettingsRow label="Timezone" htmlFor="settings-timezone" stack>
        <div className="flex max-w-xl flex-col gap-2 sm:flex-row sm:items-center">
          <SettingsSelect
            id="settings-timezone"
            value={timezone.value}
            onChange={(e) => timezone.set(e.target.value, { immediate: true })}
            className="min-w-0 sm:flex-1"
          >
            {zones.map((tz) => (
              <option key={tz} value={tz}>
                {formatTimezoneLabel(tz)}
              </option>
            ))}
          </SettingsSelect>
          {canDetect ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0 touch:h-11"
              onClick={() => timezone.set(detected, { immediate: true })}
              title={`Set to ${detected}`}
            >
              <LocateFixed aria-hidden />
              Use {detected.split("/").pop()?.replace(/_/g, " ")}
            </Button>
          ) : null}
        </div>
      </SettingsRow>
      <SettingsRow label="Date format" htmlFor="settings-date-format">
        <SettingsSelect
          id="settings-date-format"
          value={formats.value.dateFormat}
          onChange={(e) =>
            formats.set(
              { ...formats.value, dateFormat: e.target.value as DateFormatKey },
              { immediate: true },
            )
          }
          className="sm:w-72"
        >
          {DATE_FORMAT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </SettingsSelect>
      </SettingsRow>
      <SettingsToggleRow
        checked={formats.value.use24HourTimeFormat}
        onCheckedChange={(checked) =>
          formats.set({ ...formats.value, use24HourTimeFormat: checked }, { immediate: true })
        }
        label="24-hour time"
        description={formats.value.use24HourTimeFormat ? "Times show as 14:30." : "Times show as 2:30 PM."}
      />
    </SettingsCard>
  );
}
