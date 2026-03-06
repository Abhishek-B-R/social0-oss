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
  privacy_level: "", // No default; user must select
  disable_comment: true,
  disable_duet: true,
  disable_stitch: true,
  brand_content_toggle: false,
  brand_organic: false,
  brand_content: false,
};

export function TikTokSettings({
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
  }, [value]);

  const isPrivate = settings.privacy_level === "SELF_ONLY";
  // "Only me" must be disabled when branded content is selected
  const brandedContentActive =
    settings.brand_content_toggle && settings.brand_content;

  const updateSetting = <K extends keyof TikTokPostSettings>(
    key: K,
    val: TikTokPostSettings[K],
  ) => {
    let newSettings = { ...settings, [key]: val };

    // When privacy set to SELF_ONLY, disable duet + stitch
    if (key === "privacy_level" && val === "SELF_ONLY") {
      newSettings = {
        ...newSettings,
        disable_duet: true,
        disable_stitch: true,
      };
    }

    // When branded content is toggled off, reset both sub-options
    if (key === "brand_content_toggle" && val === false) {
      newSettings = {
        ...newSettings,
        brand_organic: false,
        brand_content: false,
      };
    }

    // When branded content is selected and privacy is SELF_ONLY, switch to PUBLIC
    if (
      key === "brand_content" &&
      val === true &&
      settings.privacy_level === "SELF_ONLY"
    ) {
      newSettings = {
        ...newSettings,
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_duet: settings.disable_duet,
        disable_stitch: settings.disable_stitch,
      };
    }

    setSettings(newSettings);
    onChange(newSettings);
  };

  // Per TikTok guidelines:
  // - No commercial toggle OR only "Your Brand" checked → Music Usage Confirmation only
  // - "Branded Content" checked (alone or with "Your Brand") → Branded Content Policy + Music Usage Confirmation
  const getDeclarationText = () => {
    if (!settings.brand_content_toggle) {
      return (
        <>
          By posting, you agree to TikTok&apos;s{" "}
          <a
            href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-text"
          >
            Music Usage Confirmation
          </a>
        </>
      );
    }
    if (settings.brand_content) {
      // brand_content checked (alone or with brand_organic)
      return (
        <>
          By posting, you agree to TikTok&apos;s{" "}
          <a
            href="https://www.tiktok.com/legal/page/global/bc-policy/en"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-text"
          >
            Branded Content Policy
          </a>{" "}
          and{" "}
          <a
            href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-text"
          >
            Music Usage Confirmation
          </a>
        </>
      );
    }
    // Toggle on, only brand_organic checked (or nothing checked yet)
    return (
      <>
        By posting, you agree to TikTok&apos;s{" "}
        <a
          href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-text"
        >
          Music Usage Confirmation
        </a>
      </>
    );
  };

  // Label shown under brand sub-options
  const getBrandLabel = () => {
    if (settings.brand_organic && settings.brand_content) {
      return "Your photo/video will be labeled as 'Paid partnership'";
    }
    if (settings.brand_organic) {
      return "Your photo/video will be labeled as 'Promotional content'";
    }
    if (settings.brand_content) {
      return "Your photo/video will be labeled as 'Paid partnership'";
    }
    return null;
  };

  const brandLabel = getBrandLabel();
  const noBrandOptionSelected =
    settings.brand_content_toggle &&
    !settings.brand_organic &&
    !settings.brand_content;

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

      {/* Privacy Level */}
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
          <option
            value="SELF_ONLY"
            disabled={brandedContentActive}
            title={
              brandedContentActive
                ? "Branded content visibility cannot be set to private."
                : undefined
            }
          >
            Only me
            {brandedContentActive ? " (unavailable for branded content)" : ""}
          </option>
        </select>
        <p className="mt-2 text-xs text-text-muted">
          Videos post as private until TikTok approves our app. Change to public
          on TikTok after posting.
        </p>
      </div>

      {/* Interaction toggles */}
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
              <label
                className={`flex items-center gap-3 ${
                  isPrivate ? "cursor-not-allowed opacity-50" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={!settings.disable_duet}
                  onChange={(e) =>
                    updateSetting("disable_duet", !e.target.checked)
                  }
                  disabled={isPrivate}
                  className="rounded border-border text-accent focus:ring-accent size-4 disabled:cursor-not-allowed"
                />
                <span className="text-sm text-text">Allow Duet</span>
              </label>
              <label
                className={`flex items-center gap-3 ${
                  isPrivate ? "cursor-not-allowed opacity-50" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={!settings.disable_stitch}
                  onChange={(e) =>
                    updateSetting("disable_stitch", !e.target.checked)
                  }
                  disabled={isPrivate}
                  className="rounded border-border text-accent focus:ring-accent size-4 disabled:cursor-not-allowed"
                />
                <span className="text-sm text-text">Allow Stitch</span>
              </label>
            </>
          )}
        </div>
      </div>

      {/* Content Disclosure - off by default */}
      <div className="space-y-3 border-t border-border pt-4">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings.brand_content_toggle}
            onChange={(e) =>
              updateSetting("brand_content_toggle", e.target.checked)
            }
            className="rounded border-border text-accent focus:ring-accent size-4"
          />
          <span className="text-sm font-medium text-text">
            Content Disclosure
          </span>
        </label>
        <p className="text-xs text-text-muted ml-7">
          Indicate whether this content promotes yourself, a brand, product or
          service.
        </p>

        {settings.brand_content_toggle && (
          <div className="ml-7 space-y-3">
            {/* YOUR BRAND — checkbox, not radio */}
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={settings.brand_organic}
                onChange={(e) =>
                  updateSetting("brand_organic", e.target.checked)
                }
                className="mt-0.5 rounded border-border text-accent focus:ring-accent size-4"
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-text">
                  Your brand
                </span>
                <p className="text-xs text-text-muted">
                  You are promoting yourself or your own business.
                </p>
              </div>
            </label>

            {/* BRANDED CONTENT — checkbox, not radio */}
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={settings.brand_content}
                onChange={(e) =>
                  updateSetting("brand_content", e.target.checked)
                }
                className="mt-0.5 rounded border-border text-accent focus:ring-accent size-4"
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-text">
                  Branded content
                </span>
                <p className="text-xs text-text-muted">
                  You are promoting another brand or a third party.
                </p>
              </div>
            </label>

            {/* Label prompt — shown when any option is selected */}
            {brandLabel && (
              <p className="text-xs text-amber-600 dark:text-amber-400 italic">
                {brandLabel}
              </p>
            )}

            {/* Error when nothing selected */}
            {noBrandOptionSelected && (
              <p className="text-xs text-destructive">
                You need to indicate if your content promotes yourself, a third
                party, or both.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Declaration */}
      <div className="border-t border-border pt-4">
        <p className="text-xs text-text-muted italic">{getDeclarationText()}</p>
      </div>
    </div>
  );
}
