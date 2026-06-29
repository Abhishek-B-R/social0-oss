"use client";

import { useState, useCallback } from "react";
import type { AutoResurfaceConfig } from "./auto-features-types.js";
import type { AutoPlugConfig } from "./auto-features-types.js";

const STORAGE_KEY = "remembered-autorepost-autoplug";

export type RememberedAutoRepostAutoPlugData = {
  remember: boolean;
  autoRepostEnabled: boolean;
  autoRepostConfig: AutoResurfaceConfig | null;
  autoPlugEnabled: boolean;
  autoPlugConfig: AutoPlugConfig | null;
};

function isValidResurfaceConfig(
  v: unknown,
): v is AutoResurfaceConfig {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.intervalHours === "number" &&
    typeof o.maxResurfaces === "number" &&
    typeof o.plugComment === "string"
  );
}

function isValidAutoPlugConfig(v: unknown): v is AutoPlugConfig {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    (o.metricType === "likes" || o.metricType === "retweets") &&
    typeof o.threshold === "number" &&
    typeof o.plugComment === "string"
  );
}

function readStored(): RememberedAutoRepostAutoPlugData {
  if (typeof window === "undefined") {
    return {
      remember: false,
      autoRepostEnabled: false,
      autoRepostConfig: null,
      autoPlugEnabled: false,
      autoPlugConfig: null,
    };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return defaultData();
    const d = data as Record<string, unknown>;
    const remember = d.remember === true;
    const autoRepostEnabled = d.autoRepostEnabled === true;
    const autoPlugEnabled = d.autoPlugEnabled === true;
    const autoRepostConfig =
      d.autoRepostConfig && isValidResurfaceConfig(d.autoRepostConfig)
        ? (d.autoRepostConfig as AutoResurfaceConfig)
        : null;
    const autoPlugConfig =
      d.autoPlugConfig && isValidAutoPlugConfig(d.autoPlugConfig)
        ? (d.autoPlugConfig as AutoPlugConfig)
        : null;
    return {
      remember,
      autoRepostEnabled,
      autoRepostConfig: autoRepostEnabled ? autoRepostConfig : null,
      autoPlugEnabled,
      autoPlugConfig: autoPlugEnabled ? autoPlugConfig : null,
    };
  } catch {
    return defaultData();
  }
}

function defaultData(): RememberedAutoRepostAutoPlugData {
  return {
    remember: false,
    autoRepostEnabled: false,
    autoRepostConfig: null,
    autoPlugEnabled: false,
    autoPlugConfig: null,
  };
}

function writeStored(data: RememberedAutoRepostAutoPlugData): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

/**
 * Hook to persist Auto-Repost and Auto-Plug settings in localStorage.
 * When "Remember" is checked and a Twitter account is selected, restores
 * the last saved on/off state and config for both features.
 */
export function useRememberedAutoRepostAutoPlug() {
  const [stored, setStored] = useState<RememberedAutoRepostAutoPlugData>(
    readStored,
  );

  const setRemember = useCallback((remember: boolean) => {
    setStored((prev) => {
      const next = { ...prev, remember };
      writeStored(next);
      return next;
    });
  }, []);

  const persistAutoRepost = useCallback(
    (enabled: boolean, config: AutoResurfaceConfig | null) => {
      setStored((prev) => {
        if (!prev.remember) return prev;
        const next = {
          ...prev,
          autoRepostEnabled: enabled,
          autoRepostConfig: enabled ? config : null,
        };
        writeStored(next);
        return next;
      });
    },
    [],
  );

  const persistAutoPlug = useCallback(
    (enabled: boolean, config: AutoPlugConfig | null) => {
      setStored((prev) => {
        if (!prev.remember) return prev;
        const next = {
          ...prev,
          autoPlugEnabled: enabled,
          autoPlugConfig: enabled ? config : null,
        };
        writeStored(next);
        return next;
      });
    },
    [],
  );

  /** Returns initial configs to apply when Twitter is selected and remember is true. */
  const getInitialState = useCallback((): {
    autoRepostConfig: AutoResurfaceConfig | null;
    autoPlugConfig: AutoPlugConfig | null;
  } => {
    if (!stored.remember) {
      return { autoRepostConfig: null, autoPlugConfig: null };
    }
    return {
      autoRepostConfig: stored.autoRepostConfig,
      autoPlugConfig: stored.autoPlugConfig,
    };
  }, [stored.remember, stored.autoRepostConfig, stored.autoPlugConfig]);

  return {
    remember: stored.remember,
    setRemember,
    persistAutoRepost,
    persistAutoPlug,
    getInitialState,
  };
}
