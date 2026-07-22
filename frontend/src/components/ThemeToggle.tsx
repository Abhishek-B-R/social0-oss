
import * as React from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

type ThemeChoice = "light" | "dark" | "system";

const OPTIONS: Array<{
  value: ThemeChoice;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "system", label: "System", Icon: Monitor },
  { value: "dark", label: "Dark", Icon: Moon },
];

type ThemeToggleProps = {
  /** On landing page: show only sun/moon toggle. In settings: show Light / System / Dark. */
  variant?: "full" | "simple";
};

export function ThemeToggle({ variant = "full" }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  // Avoid hydration mismatch: server/first paint shows placeholder.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!mounted) {
    return (
      <div
        className={
          variant === "simple"
            ? "h-10 w-10 rounded-xl border border-border bg-muted"
            : "h-10 w-[248px] rounded-xl border border-border bg-muted"
        }
      />
    );
  }

  if (variant === "simple") {
    const isDark = resolvedTheme === "dark";
    return (
      <button
        type="button"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted text-foreground transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {isDark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
      </button>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-1 rounded-xl border border-border bg-muted p-1"
      role="group"
      aria-label="Theme"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            className={[
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background hover:text-foreground",
            ].join(" ")}
            aria-pressed={active}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
