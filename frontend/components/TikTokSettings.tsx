"use client";

import { useState, useEffect, useRef } from "react";

type TikTokCreatorInfo = {
  data?: {
    privacy_level_options?: string[];
    max_video_duration?: number;
    creator_username?: string;
    creator_nickname?: string;
    creator_avatar_url?: string;
    comment_disabled?: boolean;
    duet_disabled?: boolean;
    stitch_disabled?: boolean;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

type TikTokSettingsProps = {
  accountId: string;
  value: TikTokPostSettings;
  onChange: (settings: TikTokPostSettings) => void;
  onError: (error: string) => void;
  onCreatorInfoLoaded?: (info: { max_video_duration?: number }) => void;
};

export type TikTokPostSettings = {
  privacy_level: string;
  disable_comment: boolean;
  disable_duet: boolean;
  disable_stitch: boolean;
  brand_content_toggle: boolean;
  brand_organic: boolean; // "Your brand" checkbox
  brand_content: boolean; // "Branded content" checkbox
};

const DEFAULT_SETTINGS: TikTokPostSettings = {
  privacy_level: "", // No default - user must select
  disable_comment: false, // Allow comments by default (unchecked = allowed)
  disable_duet: false, // Allow duet by default
  disable_stitch: false, // Allow stitch by default
  brand_content_toggle: false, // Off by default
  brand_organic: false, // Off by default
  brand_content: false, // Off by default
};

export function TikTokSettings({
  accountId,
  value,
  onChange,
  onError,
  onCreatorInfoLoaded,
}: TikTokSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [creatorInfo, setCreatorInfo] = useState<TikTokCreatorInfo | null>(
    null,
  );
  const [settings, setSettings] = useState<TikTokPostSettings>(
    value.privacy_level !== undefined
      ? {
          ...value,
          // Migrate old brand_organic_toggle to new brand_organic/brand_content
          brand_organic: (value as any).brand_organic_toggle === true ? true : value.brand_organic ?? false,
          brand_content: (value as any).brand_organic_toggle === false && value.brand_content_toggle ? true : value.brand_content ?? false,
        }
      : {
          privacy_level: "",
          disable_comment: false,
          disable_duet: false,
          disable_stitch: false,
          brand_content_toggle: false,
          brand_organic: false,
          brand_content: false,
        },
  );

  // Sync local settings from parent when value prop changes (e.g. re-mount with saved state)
  useEffect(() => {
    if (
      value.privacy_level !== settings.privacy_level ||
      value.disable_comment !== settings.disable_comment ||
      value.disable_duet !== settings.disable_duet ||
      value.disable_stitch !== settings.disable_stitch ||
      value.brand_content_toggle !== settings.brand_content_toggle ||
      value.brand_organic !== settings.brand_organic ||
      value.brand_content !== settings.brand_content
    ) {
      setSettings({
        ...value,
        brand_organic: value.brand_organic ?? false,
        brand_content: value.brand_content ?? false,
      });
    }
  }, [
    value.privacy_level,
    value.disable_comment,
    value.disable_duet,
    value.disable_stitch,
    value.brand_content_toggle,
    value.brand_organic,
    value.brand_content,
  ]);

  const hasPushedInitial = useRef(false);

  useEffect(() => {
    // Fetch creator info on mount
    const fetchCreatorInfo = async () => {
      try {
        const res = await fetch(`/api/tiktok/creator-info?accountId=${accountId}`);
        const data = await res.json();
        if (!res.ok) {
          onError(data.error || "Failed to load TikTok settings");
          return;
        }
        
        // Check for posting caps/restrictions
        const errorCode = data.error?.code;
        if (errorCode === "spam_risk_too_many_posts") {
          onError("Daily post limit reached. Please try again tomorrow.");
          return;
        }
        if (errorCode === "spam_risk_user_banned_from_posting") {
          onError("Your account is banned from posting. Please contact TikTok support.");
          return;
        }
        if (errorCode === "reached_active_user_cap") {
          onError("Daily quota for active publishing users reached. Please try again later.");
          return;
        }
        
        setCreatorInfo(data);
        
        // Notify parent of creator info (for video duration validation)
        if (onCreatorInfoLoaded && data.data) {
          onCreatorInfoLoaded({
            max_video_duration: data.data.max_video_duration,
          });
        }
      } catch (err) {
        onError("Failed to load TikTok creator information");
      } finally {
        setLoading(false);
      }
    };

    if (accountId) {
      fetchCreatorInfo();
    }
  }, [accountId, onError]);

  // Push initial settings to parent once after load so form state has TikTok metadata (for scheduled/draft)
  useEffect(() => {
    if (!loading && accountId && !hasPushedInitial.current) {
      hasPushedInitial.current = true;
      onChange(settings);
    }
  }, [loading, accountId]);

  const updateSetting = <K extends keyof TikTokPostSettings>(
    key: K,
    val: TikTokPostSettings[K],
  ) => {
    const newSettings = { ...settings, [key]: val };
    setSettings(newSettings);
    onChange(newSettings);
  };

  const privacyOptions =
    creatorInfo?.data?.privacy_level_options || [
      "PUBLIC_TO_EVERYONE",
      "MUTUAL_FOLLOW_FRIENDS",
      "SELF_ONLY",
    ];

  const privacyLabels: Record<string, string> = {
    PUBLIC_TO_EVERYONE: "Public",
    MUTUAL_FOLLOW_FRIENDS: "Friends",
    SELF_ONLY: "Only me",
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-500">Loading TikTok settings...</p>
      </div>
    );
  }

  // Check if branded content is selected (affects privacy options)
  const hasBrandedContent = settings.brand_content_toggle && settings.brand_content;
  const canSelectPrivate = !hasBrandedContent; // Branded content cannot be private
  
  // Determine declaration text based on brand content selection
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
    <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">
          TikTok Post Settings
        </h3>
        {creatorInfo?.data?.creator_nickname && (
          <p className="text-xs text-gray-600 mt-1">
            Posting to: <span className="font-medium">{creatorInfo.data.creator_nickname}</span>
            {creatorInfo.data.creator_username && (
              <span className="text-gray-500"> (@{creatorInfo.data.creator_username})</span>
            )}
          </p>
        )}
        <p className="text-xs text-gray-500 mt-1">
          Required settings for TikTok posts
        </p>
      </div>

      {/* Privacy Level - REQUIRED, no default */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Privacy Level <span className="text-red-500">*</span>
        </label>
        <select
          value={settings.privacy_level}
          onChange={(e) => {
            const newLevel = e.target.value;
            // If branded content is selected and user tries to set private, auto-switch to public
            if (hasBrandedContent && newLevel === "SELF_ONLY") {
              updateSetting("privacy_level", "PUBLIC_TO_EVERYONE");
              return;
            }
            updateSetting("privacy_level", newLevel);
          }}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          required
        >
          <option value="">-- Select privacy level --</option>
          {privacyOptions.map((option) => {
            const isDisabled = hasBrandedContent && option === "SELF_ONLY";
            return (
              <option key={option} value={option} disabled={isDisabled}>
                {privacyLabels[option] || option}
                {isDisabled ? " (not available for branded content)" : ""}
              </option>
            );
          })}
        </select>
        {!settings.privacy_level && (
          <p className="mt-1 text-xs text-red-600">
            You must select a privacy level
          </p>
        )}
        {hasBrandedContent && settings.privacy_level === "SELF_ONLY" && (
          <p className="mt-1 text-xs text-amber-600">
            Branded content visibility cannot be set to private. Privacy has been set to Public.
          </p>
        )}
      </div>

      {/* Interaction Toggles - all unchecked by default (allowed), disabled if creator_info says disabled */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-900">Allow Interactions</p>
        <div className="space-y-2">
          <label className={`flex items-center gap-3 ${creatorInfo?.data?.comment_disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
            <input
              type="checkbox"
              checked={!settings.disable_comment}
              onChange={(e) =>
                updateSetting("disable_comment", !e.target.checked)
              }
              disabled={creatorInfo?.data?.comment_disabled === true}
              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 size-4 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className={`text-sm ${creatorInfo?.data?.comment_disabled ? "text-gray-500" : "text-gray-700"}`}>
              Allow Comments
              {creatorInfo?.data?.comment_disabled && (
                <span className="ml-1 text-xs text-gray-400">(disabled in your settings)</span>
              )}
            </span>
          </label>
          <label className={`flex items-center gap-3 ${creatorInfo?.data?.duet_disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
            <input
              type="checkbox"
              checked={!settings.disable_duet}
              onChange={(e) => updateSetting("disable_duet", !e.target.checked)}
              disabled={creatorInfo?.data?.duet_disabled === true}
              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 size-4 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className={`text-sm ${creatorInfo?.data?.duet_disabled ? "text-gray-500" : "text-gray-700"}`}>
              Allow Duet
              {creatorInfo?.data?.duet_disabled && (
                <span className="ml-1 text-xs text-gray-400">(disabled in your settings)</span>
              )}
            </span>
          </label>
          <label className={`flex items-center gap-3 ${creatorInfo?.data?.stitch_disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
            <input
              type="checkbox"
              checked={!settings.disable_stitch}
              onChange={(e) =>
                updateSetting("disable_stitch", !e.target.checked)
              }
              disabled={creatorInfo?.data?.stitch_disabled === true}
              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 size-4 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className={`text-sm ${creatorInfo?.data?.stitch_disabled ? "text-gray-500" : "text-gray-700"}`}>
              Allow Stitch
              {creatorInfo?.data?.stitch_disabled && (
                <span className="ml-1 text-xs text-gray-400">(disabled in your settings)</span>
              )}
            </span>
          </label>
        </div>
      </div>

      {/* Brand Disclosure Toggle */}
      <div className="space-y-3 border-t border-gray-100 pt-4">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings.brand_content_toggle}
            onChange={(e) => {
              const enabled = e.target.checked;
              updateSetting("brand_content_toggle", enabled);
              if (!enabled) {
                // Reset brand selections when toggle is off
                updateSetting("brand_organic", false);
                updateSetting("brand_content", false);
              }
            }}
            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 size-4"
          />
          <span className="text-sm font-medium text-gray-900">
            Does this promote a brand, product or service?
          </span>
        </label>
        {settings.brand_content_toggle && (
          <div className="ml-7 space-y-3">
            <p className="text-xs text-gray-500 mb-2">
              Select at least one option (you can select both):
            </p>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={settings.brand_organic}
                onChange={(e) => {
                  updateSetting("brand_organic", e.target.checked);
                  // If branded content is selected and user checks "Your brand", ensure privacy isn't private
                  if (e.target.checked && settings.brand_content && settings.privacy_level === "SELF_ONLY") {
                    updateSetting("privacy_level", "PUBLIC_TO_EVERYONE");
                  }
                }}
                className="mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 size-4"
              />
              <div className="flex-1">
                <span className="text-sm text-gray-700">Your brand</span>
                {settings.brand_organic && (
                  <p className="text-xs text-amber-700 mt-1 italic">
                    Your video will be labeled as &quot;Promotional content&quot;
                  </p>
                )}
              </div>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={settings.brand_content}
                onChange={(e) => {
                  const checked = e.target.checked;
                  updateSetting("brand_content", checked);
                  // If branded content is checked and privacy is private, switch to public
                  if (checked && settings.privacy_level === "SELF_ONLY") {
                    updateSetting("privacy_level", "PUBLIC_TO_EVERYONE");
                  }
                }}
                className="mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 size-4"
              />
              <div className="flex-1">
                <span className="text-sm text-gray-700">Branded content</span>
                {settings.brand_content && (
                  <p className="text-xs text-amber-700 mt-1 italic">
                    Your video will be labeled as &quot;Paid partnership&quot;
                  </p>
                )}
              </div>
            </label>
            {settings.brand_content_toggle && !settings.brand_organic && !settings.brand_content && (
              <p className="text-xs text-red-600 ml-7">
                You need to indicate if your content promotes yourself, a third party, or both.
              </p>
            )}
            {settings.brand_organic && settings.brand_content && (
              <p className="text-xs text-amber-700 ml-7 italic">
                Your video will be labeled as &quot;Paid partnership&quot;
              </p>
            )}
          </div>
        )}
      </div>

      {/* Declaration Text - updates based on brand content selection */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs text-gray-600 italic">
          {getDeclarationText()}
        </p>
      </div>

      {/* Max Video Duration Info */}
      {creatorInfo?.data?.max_video_duration && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
          <p className="text-xs text-blue-800">
            Maximum video duration: {creatorInfo.data.max_video_duration} seconds
          </p>
        </div>
      )}
    </div>
  );
}
