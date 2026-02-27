"use client";

import { useState, useEffect } from "react";

type TikTokSettingsProps = {
  accountId: string;
  value: TikTokPostSettings;
  onChange: (settings: TikTokPostSettings) => void;
  /** When "photo", only Allow Comments is shown (Duet/Stitch do not apply to photo posts). */
  mediaType?: "video" | "photo";
};

export type TikTokPostSettings = {
  privacy_level: string;
  disable_comment: boolean;
  disable_duet: boolean;
  disable_stitch: boolean;
  brand_content_toggle: boolean;
  brand_organic: boolean;
  brand_content: boolean;
};

const DEFAULT_SETTINGS: TikTokPostSettings = {
  // TikTok requires user to choose privacy explicitly (no default).
  privacy_level: "",
  // TikTok requires interactions OFF by default; user must opt in.
  disable_comment: true,
  disable_duet: true,
  disable_stitch: true,
  brand_content_toggle: false,
  brand_organic: false,
  brand_content: false,
};

export function TikTokSettings({
  accountId,
  value,
  onChange,
  mediaType,
}: TikTokSettingsProps) {
  const isPhotoOnly = mediaType === "photo";
  const [settings, setSettings] = useState<TikTokPostSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...value,
    brand_organic: value.brand_organic ?? false,
    brand_content: value.brand_content ?? false,
  }));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings((prev) => ({
      ...prev,
      ...value,
      brand_organic: value.brand_organic ?? false,
      brand_content: value.brand_content ?? false,
    }));
  }, [
    value.privacy_level,
    value.disable_comment,
    value.disable_duet,
    value.disable_stitch,
    value.brand_content_toggle,
    value.brand_organic,
    value.brand_content,
    value,
  ]);

  const updateSetting = <K extends keyof TikTokPostSettings>(
    key: K,
    val: TikTokPostSettings[K],
  ) => {
    const newSettings = { ...settings, [key]: val };
    setSettings(newSettings);
    onChange(newSettings);
  };

  const getDeclarationText = () => {
    if (!settings.brand_content_toggle) {
      return "By posting, you agree to TikTok's Music Usage Confirmation";
    }
    const hasOrganic = settings.brand_organic;
    const hasBranded = settings.brand_content;
    if (hasOrganic && hasBranded) {
      return "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation";
    }
    if (hasBranded) {
      return "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation";
    }
    if (hasOrganic) {
      return "By posting, you agree to TikTok's Music Usage Confirmation";
    }
    return "By posting, you agree to TikTok's Music Usage Confirmation";
  };

  return (
    <div className="rounded-xl border border-border bg-bg-elevated p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-text mb-1">
          TikTok Post Settings
        </h3>
        <p className="text-xs text-text-muted mt-1">
          Required settings for TikTok posts
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text mb-2">
          Privacy Level <span className="text-destructive">*</span>
        </label>
        <select
          value={settings.privacy_level}
          onChange={(e) => updateSetting("privacy_level", e.target.value)}
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        >
          <option value="">Select privacy level</option>
          <option value="PUBLIC_TO_EVERYONE">Public</option>
          <option value="MUTUAL_FOLLOW_FRIENDS">Friends</option>
          <option value="SELF_ONLY">Only me</option>
        </select>
        <p className="mt-2 text-xs text-text-muted">
          Videos post as private until TikTok approves our app. Change to public
          on TikTok after posting.
        </p>
      </div>

      {/* Interaction toggles. For photo posts only Allow Comments applies (Duet/Stitch are video-only). */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-text">Allow Interactions</p>
        <div className="space-y-2">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={!settings.disable_comment}
              onChange={(e) =>
                updateSetting("disable_comment", !e.target.checked)
              }
              className="rounded border-border text-accent focus:ring-accent size-4"
            />
            <span className="text-sm text-text">Allow Comments</span>
          </label>
          {!isPhotoOnly && (
            <>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={!settings.disable_duet}
                  onChange={(e) =>
                    updateSetting("disable_duet", !e.target.checked)
                  }
                  className="rounded border-border text-accent focus:ring-accent size-4"
                />
                <span className="text-sm text-text">Allow Duet</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={!settings.disable_stitch}
                  onChange={(e) =>
                    updateSetting("disable_stitch", !e.target.checked)
                  }
                  className="rounded border-border text-accent focus:ring-accent size-4"
                />
                <span className="text-sm text-text">Allow Stitch</span>
              </label>
            </>
          )}
        </div>
      </div>

      {/* Brand disclosure - off by default */}
      <div className="space-y-3 border-t border-border pt-4">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings.brand_content_toggle}
            onChange={(e) => {
              const enabled = e.target.checked;
              updateSetting("brand_content_toggle", enabled);
              if (!enabled) {
                updateSetting("brand_organic", false);
                updateSetting("brand_content", false);
              }
            }}
            className="rounded border-border text-accent focus:ring-accent size-4"
          />
          <span className="text-sm font-medium text-text">
            Does this promote a brand, product or service?
          </span>
        </label>
        {settings.brand_content_toggle && (
          <div className="ml-7 space-y-3">
            <p className="text-xs text-text-muted mb-2">Select one:</p>
            <label className="flex items-start gap-3">
              <input
                type="radio"
                name={`brand-type-${accountId}`}
                checked={settings.brand_organic && !settings.brand_content}
                onChange={() => {
                  const next = {
                    ...settings,
                    brand_organic: true,
                    brand_content: false,
                  };
                  setSettings(next);
                  onChange(next);
                }}
                className="mt-0.5 border-border text-accent focus:ring-accent size-4"
              />
              <div className="flex-1">
                <span className="text-sm text-text">Your brand</span>
                {settings.brand_organic && !settings.brand_content && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 italic">
                    Your video will be labeled as &quot;Promotional
                    content&quot;
                  </p>
                )}
              </div>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="radio"
                name={`brand-type-${accountId}`}
                checked={!settings.brand_organic && settings.brand_content}
                onChange={() => {
                  const next = {
                    ...settings,
                    brand_organic: false,
                    brand_content: true,
                  };
                  setSettings(next);
                  onChange(next);
                }}
                className="mt-0.5 border-border text-accent focus:ring-accent size-4"
              />
              <div className="flex-1">
                <span className="text-sm text-text">Branded content</span>
                {!settings.brand_organic && settings.brand_content && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 italic">
                    Your video will be labeled as &quot;Paid partnership&quot;
                  </p>
                )}
              </div>
            </label>
            {!settings.brand_organic && !settings.brand_content && (
              <p className="text-xs text-destructive ml-7">
                Please select whether your content promotes your brand or
                branded content.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <p className="text-xs text-text-muted italic">{getDeclarationText()}</p>
      </div>
    </div>
  );
}
