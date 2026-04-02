/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef } from "react";

type TikTokCreatorInfo = {
  data?: {
    privacy_level_options?: string[];
    /** Official API field; normalized into max_video_duration for UI */
    max_video_post_duration_sec?: number;
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

export type TikTokPostSettings = {
  privacy_level: string;
  video_title: string;
  disable_comment: boolean;
  disable_duet: boolean;
  disable_stitch: boolean;
  brand_content_toggle: boolean;
  brand_organic: boolean;
  brand_content: boolean;
  post_as_draft: boolean;
  mark_ai_generated: boolean;
  /** Explicit consent before publish (TikTok UX guidelines) */
  tiktok_post_consent: boolean;
};

type TikTokSettingsProps = {
  accountId: string;
  value: TikTokPostSettings;
  onChange: (settings: TikTokPostSettings) => void;
  onError: (error: string) => void;
  onCreatorInfoLoaded?: (info: { max_video_duration?: number }) => void;
  /** Photo posts: only "Allow comment" per TikTok guidelines */
  mediaType?: "video" | "photo";
  /** For video posts: compared to creator max (Point 1c) */
  videoDurationSec?: number | null;
  showPreviewHint?: boolean;
};

export const DEFAULT_TIKTOK_POST_SETTINGS: TikTokPostSettings = {
  privacy_level: "",
  video_title: "",
  disable_comment: true,
  disable_duet: true,
  disable_stitch: true,
  brand_content_toggle: false,
  brand_organic: false,
  brand_content: false,
  post_as_draft: false,
  mark_ai_generated: false,
  tiktok_post_consent: false,
};

function normalizeCreatorResponse(raw: unknown): TikTokCreatorInfo {
  const r = raw as TikTokCreatorInfo & { data?: Record<string, unknown> };
  const d = r?.data;
  if (!d || typeof d !== "object") return r;
  const max =
    (d.max_video_post_duration_sec as number | undefined) ??
    (d.max_video_duration as number | undefined);
  return {
    ...r,
    data: {
      ...d,
      max_video_duration: max,
      max_video_post_duration_sec: d.max_video_post_duration_sec as
        | number
        | undefined,
    },
  };
}

export function TikTokSettings({
  accountId,
  value,
  onChange,
  onError,
  onCreatorInfoLoaded,
  mediaType = "video",
  videoDurationSec = null,
  showPreviewHint = true,
}: TikTokSettingsProps) {
  const isPhotoOnly = mediaType === "photo";
  const onErrorRef = useRef(onError);
  const onCreatorInfoLoadedRef = useRef(onCreatorInfoLoaded);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onCreatorInfoLoadedRef.current = onCreatorInfoLoaded;
  }, [onCreatorInfoLoaded]);

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [creatorInfo, setCreatorInfo] = useState<TikTokCreatorInfo | null>(
    null,
  );
  const [settings, setSettings] = useState<TikTokPostSettings>(() =>
    mergeIncoming(value),
  );

  const hasPushedInitial = useRef(false);

  useEffect(() => {
    if (
      value.privacy_level !== settings.privacy_level ||
      value.video_title !== settings.video_title ||
      value.disable_comment !== settings.disable_comment ||
      value.disable_duet !== settings.disable_duet ||
      value.disable_stitch !== settings.disable_stitch ||
      value.brand_content_toggle !== settings.brand_content_toggle ||
      value.brand_organic !== settings.brand_organic ||
      value.brand_content !== settings.brand_content ||
      (value as any).post_as_draft !== settings.post_as_draft ||
      (value as any).mark_ai_generated !== settings.mark_ai_generated ||
      ((value as any).tiktok_post_consent ?? false) !==
        settings.tiktok_post_consent
    ) {
      setSettings(mergeIncoming(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    value.privacy_level,
    value.video_title,
    value.disable_comment,
    value.disable_duet,
    value.disable_stitch,
    value.brand_content_toggle,
    value.brand_organic,
    value.brand_content,
    (value as any).post_as_draft,
    (value as any).mark_ai_generated,
    (value as any).tiktok_post_consent,
  ]);

  useEffect(() => {
    hasPushedInitial.current = false;
    setLoading(true);
    setFetchError(null);
    setCreatorInfo(null);
  }, [accountId]);

  useEffect(() => {
    if (!accountId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch(
          `/api/tiktok/creator-info?accountId=${accountId}`,
        );
        const raw = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          const msg = raw.error || "Failed to load TikTok settings";
          setFetchError(msg);
          onErrorRef.current(msg);
          return;
        }

        const data = normalizeCreatorResponse(raw);
        const code = data.error?.code;

        if (code && code !== "ok") {
          if (code === "spam_risk_too_many_posts") {
            const msg =
              "Daily post limit reached. Please try again tomorrow.";
            setFetchError(msg);
            onErrorRef.current(msg);
            return;
          }
          if (code === "spam_risk_user_banned_from_posting") {
            const msg =
              "Your account is banned from posting. Please contact TikTok support.";
            setFetchError(msg);
            onErrorRef.current(msg);
            return;
          }
          if (code === "reached_active_user_cap") {
            const msg =
              "Daily quota for active publishing users reached. Please try again later.";
            setFetchError(msg);
            onErrorRef.current(msg);
            return;
          }
          const msg =
            data.error?.message ||
            `TikTok could not load creator info (${code}).`;
          setFetchError(msg);
          onErrorRef.current(msg);
          return;
        }

        setCreatorInfo(data);

        const maxDur = data.data?.max_video_duration;
        if (onCreatorInfoLoadedRef.current && maxDur != null) {
          onCreatorInfoLoadedRef.current({ max_video_duration: maxDur });
        }
      } catch {
        if (!cancelled) {
          const msg = "Failed to load TikTok creator information";
          setFetchError(msg);
          onErrorRef.current(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  useEffect(() => {
    if (!loading && accountId && !hasPushedInitial.current) {
      hasPushedInitial.current = true;
      onChange(settings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, accountId]);

  const updateSetting = <K extends keyof TikTokPostSettings>(
    key: K,
    val: TikTokPostSettings[K],
  ) => {
    const newSettings = { ...settings, [key]: val };
    setSettings(newSettings);
    onChange(newSettings);
  };

  const applyPrivacyLevel = (newLevel: string) => {
    let next: TikTokPostSettings = { ...settings, privacy_level: newLevel };
    const hasBrand = next.brand_content_toggle && next.brand_content;
    if (hasBrand && newLevel === "SELF_ONLY") {
      const opts = creatorInfo?.data?.privacy_level_options ?? [];
      const fallback =
        opts.find((o) => o === "PUBLIC_TO_EVERYONE") ||
        opts.find(
          (o) =>
            o === "MUTUAL_FOLLOW_FRIENDS" || o === "FOLLOWER_OF_CREATOR",
        ) ||
        "";
      next.privacy_level = fallback || next.privacy_level;
    }
    if (newLevel === "SELF_ONLY") {
      next.disable_duet = true;
      next.disable_stitch = true;
    }
    setSettings(next);
    onChange(next);
  };

  const privacyOptions = creatorInfo?.data?.privacy_level_options ?? [];

  const privacyLabels: Record<string, string> = {
    PUBLIC_TO_EVERYONE: "Public",
    MUTUAL_FOLLOW_FRIENDS: "Friends",
    FOLLOWER_OF_CREATOR: "Followers",
    SELF_ONLY: "Only me",
  };

  const hasBrandedContent =
    settings.brand_content_toggle && settings.brand_content;

  const maxVideoSec = creatorInfo?.data?.max_video_duration;
  const durationInvalid =
    !isPhotoOnly &&
    typeof videoDurationSec === "number" &&
    videoDurationSec > 0 &&
    typeof maxVideoSec === "number" &&
    videoDurationSec > maxVideoSec;

  const getDeclarationText = () => {
    if (!settings.brand_content_toggle) {
      return "By posting, you agree to TikTok's Music Usage Confirmation";
    }
    if (settings.brand_content) {
      return "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation";
    }
    return "By posting, you agree to TikTok's Music Usage Confirmation";
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-bg-elevated p-4">
        <p className="text-sm text-text-muted">Loading TikTok settings…</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div
        className="rounded-xl border border-destructive/40 bg-destructive/10 p-4"
        role="alert"
      >
        <p className="text-sm font-medium text-destructive">{fetchError}</p>
        <p className="text-xs text-text-muted mt-2">
          Publishing to TikTok is not available until creator information loads
          successfully.
        </p>
      </div>
    );
  }

  const noPrivacyOptions =
    !loading && creatorInfo?.data && privacyOptions.length === 0;

  return (
    <div className="rounded-xl border border-border bg-bg-elevated p-6 space-y-8 text-text">
      {/* Point 1 — Creator info */}
      <section className="space-y-3" aria-labelledby="tiktok-point1-heading">
        <h3
          id="tiktok-point1-heading"
          className="text-sm font-semibold text-text"
        >
          1. TikTok account &amp; posting limits
        </h3>
        <p className="text-xs text-text-muted">
          We load the latest creator info from TikTok when you open these
          settings (see{" "}
          <a
            href="https://developers.tiktok.com/doc/content-sharing-guidelines#required_ux_implementation_in_your_app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2"
          >
            TikTok UX guidelines
          </a>
          ).
        </p>
        {creatorInfo?.data?.creator_nickname ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-bg p-3">
            {creatorInfo.data.creator_avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={creatorInfo.data.creator_avatar_url}
                alt=""
                className="h-12 w-12 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="h-12 w-12 rounded-full bg-bg-muted shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-text truncate">
                {creatorInfo.data.creator_nickname}
              </p>
              {creatorInfo.data.creator_username ? (
                <p className="text-xs text-text-muted truncate">
                  @{creatorInfo.data.creator_username}
                </p>
              ) : null}
              <p className="text-xs text-text-muted mt-1">
                Content will be posted to this TikTok account.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            TikTok did not return a display name. Reconnect your account if this
            persists.
          </p>
        )}
        {!isPhotoOnly &&
          typeof maxVideoSec === "number" &&
          maxVideoSec > 0 && (
            <div
              className={`rounded-lg border p-3 text-xs ${
                durationInvalid
                  ? "border-destructive/50 bg-destructive/10 text-destructive"
                  : "border-border bg-bg text-text-muted"
              }`}
            >
              {durationInvalid ? (
                <>
                  This video is about {Math.round(videoDurationSec ?? 0)}s; the
                  maximum for your account right now is {maxVideoSec}s. Shorten
                  the video or adjust it before posting.
                </>
              ) : (
                <>
                  Maximum video length for your account:{" "}
                  <span className="font-medium text-text">{maxVideoSec}s</span>
                  {typeof videoDurationSec === "number" && videoDurationSec > 0
                    ? ` · Your file: ${Math.round(videoDurationSec)}s`
                    : null}
                </>
              )}
            </div>
          )}
      </section>

      {/* Point 2a — Title */}
      <section className="space-y-2" aria-labelledby="tiktok-point2a-heading">
        <h3
          id="tiktok-point2a-heading"
          className="text-sm font-semibold text-text"
        >
          2. Post title
        </h3>
        <label className="block text-sm font-medium text-text">
          Title <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          value={settings.video_title}
          onChange={(e) =>
            updateSetting("video_title", e.target.value.slice(0, 150))
          }
          placeholder="Enter a title (editable before posting)"
          maxLength={150}
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        <div className="flex justify-between">
          {!settings.video_title.trim() && (
            <p className="text-xs text-destructive">A title is required</p>
          )}
          <p className="text-xs text-text-muted ml-auto">
            {settings.video_title.length}/150
          </p>
        </div>
      </section>

      {/* Point 2b — Privacy (no default; options from API only) */}
      <section className="space-y-2" aria-labelledby="tiktok-point2b-heading">
        <h3
          id="tiktok-point2b-heading"
          className="text-sm font-semibold text-text"
        >
          3. Privacy
        </h3>
        <p className="text-xs text-text-muted">
          Choose who can watch this post. Options come from TikTok for your
          account — there is no preset selection.
        </p>
        {noPrivacyOptions ? (
          <p className="text-sm text-destructive" role="alert">
            No privacy options were returned for this account. Try again later or
            reconnect TikTok.
          </p>
        ) : (
          <select
            value={settings.privacy_level}
            onChange={(e) => applyPrivacyLevel(e.target.value)}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            required
          >
            <option value="">— Select privacy —</option>
            {privacyOptions.map((option) => {
              const isDisabled = hasBrandedContent && option === "SELF_ONLY";
              return (
                <option
                  key={option}
                  value={option}
                  disabled={isDisabled}
                  title={
                    isDisabled
                      ? "Branded content visibility cannot be set to private."
                      : undefined
                  }
                >
                  {privacyLabels[option] || option}
                  {isDisabled ? " (not available for branded content)" : ""}
                </option>
              );
            })}
          </select>
        )}
        {!settings.privacy_level && (
          <p className="text-xs text-destructive">Select a privacy level</p>
        )}
        {hasBrandedContent && settings.privacy_level === "SELF_ONLY" && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Branded content cannot be private. Choose Public or Friends, or turn
            off branded content.
          </p>
        )}
      </section>

      {/* Point 2c — Interactions (none on by default; disabled when API says so) */}
      <section className="space-y-3" aria-labelledby="tiktok-point2c-heading">
        <h3
          id="tiktok-point2c-heading"
          className="text-sm font-semibold text-text"
        >
          4. Interactions
        </h3>
        <p className="text-xs text-text-muted">
          Turn on only what you want. Comment, Duet, and Stitch interact with
          your privacy choice (for example, Duet/Stitch are not available for
          &quot;Only me&quot;).
        </p>
        <div className="space-y-2">
          <label
            className={`flex items-center gap-3 ${creatorInfo?.data?.comment_disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <input
              type="checkbox"
              checked={!settings.disable_comment}
              onChange={(e) =>
                updateSetting("disable_comment", !e.target.checked)
              }
              disabled={creatorInfo?.data?.comment_disabled === true}
              className="rounded border-border text-accent focus:ring-accent size-4 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span
              className={`text-sm ${creatorInfo?.data?.comment_disabled ? "text-text-muted" : "text-text"}`}
            >
              Allow comment
              {creatorInfo?.data?.comment_disabled && (
                <span className="ml-1 text-xs text-text-muted">
                  (turned off in your TikTok app settings)
                </span>
              )}
            </span>
          </label>
          {!isPhotoOnly && (
            <>
              <label
                className={`flex items-center gap-3 ${creatorInfo?.data?.duet_disabled || settings.privacy_level === "SELF_ONLY" ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={!settings.disable_duet}
                  onChange={(e) =>
                    updateSetting("disable_duet", !e.target.checked)
                  }
                  disabled={
                    creatorInfo?.data?.duet_disabled === true ||
                    settings.privacy_level === "SELF_ONLY"
                  }
                  className="rounded border-border text-accent focus:ring-accent size-4 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <span
                  className={`text-sm ${creatorInfo?.data?.duet_disabled || settings.privacy_level === "SELF_ONLY" ? "text-text-muted" : "text-text"}`}
                >
                  Allow Duet
                  {settings.privacy_level === "SELF_ONLY" && (
                    <span className="ml-1 text-xs text-text-muted">
                      (not available with &quot;Only me&quot;)
                    </span>
                  )}
                  {settings.privacy_level !== "SELF_ONLY" &&
                    creatorInfo?.data?.duet_disabled && (
                      <span className="ml-1 text-xs text-text-muted">
                        (turned off in your TikTok app settings)
                      </span>
                    )}
                </span>
              </label>
              <label
                className={`flex items-center gap-3 ${creatorInfo?.data?.stitch_disabled || settings.privacy_level === "SELF_ONLY" ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={!settings.disable_stitch}
                  onChange={(e) =>
                    updateSetting("disable_stitch", !e.target.checked)
                  }
                  disabled={
                    creatorInfo?.data?.stitch_disabled === true ||
                    settings.privacy_level === "SELF_ONLY"
                  }
                  className="rounded border-border text-accent focus:ring-accent size-4 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <span
                  className={`text-sm ${creatorInfo?.data?.stitch_disabled || settings.privacy_level === "SELF_ONLY" ? "text-text-muted" : "text-text"}`}
                >
                  Allow Stitch
                  {settings.privacy_level === "SELF_ONLY" && (
                    <span className="ml-1 text-xs text-text-muted">
                      (not available with &quot;Only me&quot;)
                    </span>
                  )}
                  {settings.privacy_level !== "SELF_ONLY" &&
                    creatorInfo?.data?.stitch_disabled && (
                      <span className="ml-1 text-xs text-text-muted">
                        (turned off in your TikTok app settings)
                      </span>
                    )}
                </span>
              </label>
            </>
          )}
        </div>
      </section>

      {/* Consent before publish (guideline Point 2 note) */}
      <section
        className="rounded-lg border border-border bg-bg p-3 space-y-2"
        aria-labelledby="tiktok-consent-heading"
      >
        <h3
          id="tiktok-consent-heading"
          className="text-sm font-semibold text-text"
        >
          5. Confirm before publishing
        </h3>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.tiktok_post_consent}
            onChange={(e) =>
              updateSetting("tiktok_post_consent", e.target.checked)
            }
            className="mt-0.5 rounded border-border text-accent focus:ring-accent size-4 shrink-0"
          />
          <span className="text-sm text-text">
            I agree to the declarations below (including TikTok&apos;s Music
            Usage Confirmation
            {settings.brand_content_toggle && settings.brand_content
              ? " and Branded Content Policy where applicable"
              : ""}
            ) before this content is sent to TikTok.
          </span>
        </label>
      </section>

      {/* Point 3 — Commercial disclosure */}
      <section className="space-y-3 border-t border-border pt-6">
        <h3 className="text-sm font-semibold text-text">
          6. Commercial content disclosure
        </h3>
        <p className="text-xs text-text-muted">
          Off by default. If you turn this on, pick how your content should be
          labeled.
        </p>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-text">
            This content promotes a brand, product, or service
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={settings.brand_content_toggle}
            onClick={() => {
              const enabled = !settings.brand_content_toggle;
              const next = {
                ...settings,
                brand_content_toggle: enabled,
                brand_organic: enabled ? settings.brand_organic : false,
                brand_content: enabled ? settings.brand_content : false,
              };
              setSettings(next);
              onChange(next);
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ${
              settings.brand_content_toggle ? "bg-accent" : "bg-bg-muted"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                settings.brand_content_toggle ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        {settings.brand_content_toggle && (
          <div className="ml-0 sm:ml-1 space-y-3">
            <p className="text-xs text-text-muted">
              Select at least one (multiple allowed):
            </p>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={settings.brand_organic}
                onChange={(e) => {
                  const checked = e.target.checked;
                  let next = { ...settings, brand_organic: checked };
                  if (
                    checked &&
                    next.brand_content &&
                    next.privacy_level === "SELF_ONLY"
                  ) {
                    const opts = creatorInfo?.data?.privacy_level_options ?? [];
                    next.privacy_level =
                      opts.find((o) => o === "PUBLIC_TO_EVERYONE") ||
                      opts.find(
                        (o) =>
                          o === "MUTUAL_FOLLOW_FRIENDS" ||
                          o === "FOLLOWER_OF_CREATOR",
                      ) ||
                      next.privacy_level;
                  }
                  setSettings(next);
                  onChange(next);
                }}
                className="mt-0.5 rounded border-border text-accent focus:ring-accent size-4"
              />
              <div className="flex-1">
                <span className="text-sm text-text">Your brand</span>
                <p className="text-xs text-text-muted mt-0.5">
                  Promoting yourself or your own business (brand organic).
                </p>
                {settings.brand_organic && !settings.brand_content && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 italic">
                    Your photo/video will be labeled as &quot;Promotional
                    content&quot;
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
                  let next = { ...settings, brand_content: checked };
                  if (checked && next.privacy_level === "SELF_ONLY") {
                    const opts = creatorInfo?.data?.privacy_level_options ?? [];
                    next.privacy_level =
                      opts.find((o) => o === "PUBLIC_TO_EVERYONE") ||
                      opts.find(
                        (o) =>
                          o === "MUTUAL_FOLLOW_FRIENDS" ||
                          o === "FOLLOWER_OF_CREATOR",
                      ) ||
                      next.privacy_level;
                  }
                  setSettings(next);
                  onChange(next);
                }}
                className="mt-0.5 rounded border-border text-accent focus:ring-accent size-4"
              />
              <div className="flex-1">
                <span className="text-sm text-text">Branded content</span>
                <p className="text-xs text-text-muted mt-0.5">
                  Promoting another brand or third party.
                </p>
                {settings.brand_content && !settings.brand_organic && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 italic">
                    Your photo/video will be labeled as &quot;Paid
                    partnership&quot;
                  </p>
                )}
              </div>
            </label>
            {settings.brand_organic && settings.brand_content && (
              <p className="text-xs text-amber-700 dark:text-amber-400 italic">
                Your photo/video will be labeled as &quot;Paid partnership&quot;
              </p>
            )}
            {settings.brand_content_toggle &&
              !settings.brand_organic &&
              !settings.brand_content && (
                <p
                  className="text-xs text-destructive"
                  title="You need to indicate if your content promotes yourself, a third party, or both."
                >
                  You need to indicate if your content promotes yourself, a third
                  party, or both.
                </p>
              )}
          </div>
        )}
      </section>

      {/* Draft / AI — after commercial block */}
      <section className="space-y-4 border-t border-border pt-6">
        <h3 className="text-sm font-semibold text-text sr-only">
          Optional TikTok options
        </h3>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text">
              Send to TikTok as draft
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              Saves as a draft in TikTok so you can finish editing there.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.post_as_draft}
            onClick={() =>
              updateSetting("post_as_draft", !settings.post_as_draft)
            }
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ${
              settings.post_as_draft ? "bg-accent" : "bg-bg-muted"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                settings.post_as_draft ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text">
              Mark as AI-generated content
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              Labels the video as AI-generated in the description when
              supported.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.mark_ai_generated}
            onClick={() =>
              updateSetting("mark_ai_generated", !settings.mark_ai_generated)
            }
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ${
              settings.mark_ai_generated ? "bg-accent" : "bg-bg-muted"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                settings.mark_ai_generated ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </section>

      {/* Point 4 — Declarations */}
      <section className="border-t border-border pt-6 space-y-2">
        <h3 className="text-sm font-semibold text-text">
          7. Legal declarations
        </h3>
        <p className="text-xs text-text-muted italic">{getDeclarationText()}</p>
      </section>

      {/* Point 5 — Awareness & processing */}
      <section className="space-y-2 border-t border-border pt-6">
        <h3 className="text-sm font-semibold text-text">
          8. Preview &amp; processing
        </h3>
        {showPreviewHint && (
          <p className="text-xs text-text-muted">
            You can review the same {isPhotoOnly ? "images" : "media"} and
            caption in the composer before publishing. We do not add logos or
            watermarks on your behalf.
          </p>
        )}
        <p className="text-xs text-text-muted">
          After publishing, it may take a few minutes for TikTok to process your
          content before it appears on your profile. Post status is updated from
          TikTok when processing finishes.
        </p>
      </section>
    </div>
  );
}

function mergeIncoming(value: TikTokPostSettings): TikTokPostSettings {
  if (value.privacy_level !== undefined) {
    return {
      ...value,
      video_title: value.video_title ?? "",
      brand_organic:
        (value as any).brand_organic_toggle === true
          ? true
          : (value.brand_organic ?? false),
      brand_content:
        (value as any).brand_organic_toggle === false &&
        value.brand_content_toggle
          ? true
          : (value.brand_content ?? false),
      post_as_draft: (value as any).post_as_draft ?? false,
      mark_ai_generated: (value as any).mark_ai_generated ?? false,
      tiktok_post_consent: (value as any).tiktok_post_consent ?? false,
    };
  }
  return { ...DEFAULT_TIKTOK_POST_SETTINGS };
}
