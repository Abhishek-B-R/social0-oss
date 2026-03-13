"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { IconSun, IconMoon } from "@tabler/icons-react";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className="h-9 w-[72px] rounded-full bg-[var(--muted)] border border-[var(--border)]"
        aria-hidden
      />
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative flex h-9 w-[72px] items-center rounded-full border border-[var(--border)] bg-[var(--muted)] transition-colors hover:bg-[var(--muted)]/80 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--background)]"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {/* Inactive icons on track (gray) */}
      <span className="flex w-full items-center justify-between px-2.5 pointer-events-none">
        <IconSun
          className={`h-4 w-4 transition-colors ${
            isDark ? "text-[var(--muted-foreground)]" : "opacity-0"
          }`}
          strokeWidth={1.5}
          aria-hidden
        />
        <IconMoon
          className={`h-4 w-4 transition-colors ${
            isDark ? "opacity-0" : "text-[var(--muted-foreground)]"
          }`}
          strokeWidth={1.5}
          aria-hidden
        />
      </span>
      {/* Sliding thumb with active icon inside */}
      <span
        className="absolute left-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--card)] border border-[var(--border)] transition-transform duration-200 ease-out pointer-events-none"
        style={{
          transform: isDark ? "translateX(36px)" : "translateX(0)",
        }}
        aria-hidden
      >
        {isDark ? (
          <IconMoon
            className="h-4 w-4 text-[var(--foreground)]"
            strokeWidth={1.5}
          />
        ) : (
          <IconSun
            className="h-4 w-4 text-[var(--foreground)]"
            strokeWidth={1.5}
          />
        )}
      </span>
    </button>
  );
}
