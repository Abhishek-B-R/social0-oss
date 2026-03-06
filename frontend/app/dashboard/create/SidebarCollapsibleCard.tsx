"use client";

import { useState, useId } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

type SidebarCollapsibleCardProps = {
  title: string;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
};

export function SidebarCollapsibleCard({
  title,
  defaultCollapsed = true,
  children,
}: SidebarCollapsibleCardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const panelId = useId();
  const triggerId = useId();

  return (
    <div className="rounded-xl border border-border bg-bg-elevated overflow-hidden shadow-sm">
      <button
        id={triggerId}
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex h-16 w-full items-center justify-between gap-2 px-4 text-left transition-colors hover:bg-bg-muted/50"
        aria-expanded={!collapsed}
        aria-controls={panelId}
      >
        <span className="text-sm font-medium text-text truncate">{title}</span>
        <span className="shrink-0 text-text-muted">
          {collapsed ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        className={`border-t border-border p-4 ${collapsed ? "hidden" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}
