"use client";

import { useRef, useState } from "react";
import Link from "@/components/AppLink";
import { Settings2 } from "lucide-react";
import { AutoResurfaceSettingsModal } from "@/components/repost/AutoResurfaceSettingsModal";
import { AutoPlugSettingsModal } from "@/components/autoplug/AutoPlugSettingsModal";
import type { AutoResurfaceConfig } from "@/components/repost/AutoResurfacePanel";
import type { AutoPlugConfig, ConnectedAccount } from "@/components/autoplug/AutoPlugPanel";

export type BulkAutoFeaturesValue = {
  autoRepost: AutoResurfaceConfig | null;
  autoPlug: AutoPlugConfig | null;
};

type BulkAutoFeaturesCardProps = {
  selectedAccountIds: string[];
  allAccounts: ConnectedAccount[];
  value: BulkAutoFeaturesValue;
  onChange: (next: BulkAutoFeaturesValue) => void;
  remember: boolean;
  onRememberChange: (remember: boolean) => void;
  allowAutoRepost?: boolean;
  allowAutoPlug?: boolean;
};

export function BulkAutoFeaturesCard({
  selectedAccountIds,
  allAccounts,
  value,
  onChange,
  remember,
  onRememberChange,
  allowAutoRepost = true,
  allowAutoPlug = true,
}: BulkAutoFeaturesCardProps) {
  const [resurfaceModalOpen, setResurfaceModalOpen] = useState(false);
  const [autoPlugModalOpen, setAutoPlugModalOpen] = useState(false);
  const configBeforeResurfaceRef = useRef<AutoResurfaceConfig | null>(null);
  const configBeforeAutoPlugRef = useRef<AutoPlugConfig | null>(null);

  const openResurfaceSettings = () => {
    configBeforeResurfaceRef.current = value.autoRepost;
    setResurfaceModalOpen(true);
  };

  const openAutoPlugSettings = () => {
    configBeforeAutoPlugRef.current = value.autoPlug;
    setAutoPlugModalOpen(true);
  };

  const toggleAutoRepost = () => {
    if (!allowAutoRepost) return;
    if (value.autoRepost) {
      onChange({ ...value, autoRepost: null });
      return;
    }
    openResurfaceSettings();
  };

  const toggleAutoPlug = () => {
    if (!allowAutoPlug) return;
    if (value.autoPlug) {
      onChange({ ...value, autoPlug: null });
      return;
    }
    openAutoPlugSettings();
  };

  const cardClass =
    "rounded-xl border border-border bg-card px-4 py-3 shadow-sm";

  return (
    <div className="space-y-2">
      {/* Card 1: Remember only */}
      <div className={cardClass}>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => onRememberChange(e.target.checked)}
            className="rounded border-input bg-background text-accent focus:ring-accent"
          />
          <span className="text-sm font-medium text-foreground">Remember</span>
        </label>
      </div>

      {/* Card 2: Auto-Repost (Twitter/X only) */}
      <div className={`${cardClass} flex items-center justify-between gap-3`}>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Auto-Repost</p>
          <p className="text-xs text-muted-foreground">(Twitter/X only)</p>
          {!allowAutoRepost && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Available on Growth plan.{" "}
              <Link
                href="/dashboard/billing"
                className="text-accent hover:text-accent-hover underline underline-offset-2"
              >
                Upgrade
              </Link>
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={openResurfaceSettings}
            disabled={!allowAutoRepost || !value.autoRepost}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
            aria-label="Auto-Repost settings"
            title={
              !value.autoRepost
                ? "Enable Auto-Repost to edit settings"
                : "Edit Auto-Repost settings"
            }
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggleAutoRepost}
            disabled={!allowAutoRepost}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
              value.autoRepost ? "bg-accent" : "bg-muted"
            } ${!allowAutoRepost ? "opacity-60 cursor-not-allowed" : ""}`}
            role="switch"
            aria-checked={!!value.autoRepost}
            aria-label={
              value.autoRepost ? "Disable Auto-Repost" : "Enable Auto-Repost"
            }
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform mt-0.5 ${
                value.autoRepost ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Card 3: Auto-Plug (Twitter/X only) */}
      <div className={`${cardClass} flex items-center justify-between gap-3`}>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Auto-Plug</p>
          <p className="text-xs text-muted-foreground">(Twitter/X only)</p>
          {!allowAutoPlug && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Available on Growth plan.{" "}
              <Link
                href="/dashboard/billing"
                className="text-accent hover:text-accent-hover underline underline-offset-2"
              >
                Upgrade
              </Link>
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={openAutoPlugSettings}
            disabled={!allowAutoPlug || !value.autoPlug}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
            aria-label="Auto-Plug settings"
            title={
              !value.autoPlug
                ? "Enable Auto-Plug to edit settings"
                : "Edit Auto-Plug settings"
            }
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggleAutoPlug}
            disabled={!allowAutoPlug}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
              value.autoPlug ? "bg-accent" : "bg-muted"
            } ${!allowAutoPlug ? "opacity-60 cursor-not-allowed" : ""}`}
            role="switch"
            aria-checked={!!value.autoPlug}
            aria-label={
              value.autoPlug ? "Disable Auto-Plug" : "Enable Auto-Plug"
            }
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform mt-0.5 ${
                value.autoPlug ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      {resurfaceModalOpen && (
        <AutoResurfaceSettingsModal
          isOpen={true}
          selectedAccountIds={selectedAccountIds}
          allAccounts={allAccounts}
          initialConfig={value.autoRepost}
          onChange={(cfg) => onChange({ ...value, autoRepost: cfg })}
          onDone={() => setResurfaceModalOpen(false)}
          onCancel={() => {
            onChange({ ...value, autoRepost: configBeforeResurfaceRef.current });
            setResurfaceModalOpen(false);
          }}
        />
      )}
      {autoPlugModalOpen && (
        <AutoPlugSettingsModal
          isOpen={true}
          selectedAccountIds={selectedAccountIds}
          allAccounts={allAccounts}
          initialConfig={value.autoPlug}
          onChange={(cfg) => onChange({ ...value, autoPlug: cfg })}
          onDone={() => setAutoPlugModalOpen(false)}
          onCancel={() => {
            onChange({ ...value, autoPlug: configBeforeAutoPlugRef.current });
            setAutoPlugModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

