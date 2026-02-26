"use client";

import { useState } from "react";
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

  return (
    <div className="rounded-xl border border-border bg-bg-elevated overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex h-10 w-full items-center justify-between gap-2 px-4 text-left transition-colors hover:bg-bg-muted/50"
        aria-expanded={!collapsed}
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
      {!collapsed && (
        <div className="border-t border-border p-4">
          {children}
        </div>
      )}
    </div>
  );
}
