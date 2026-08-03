import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type LandingMode = "normal" | "agent";

const STORAGE_KEY = "landing-mode";

type LandingModeContextValue = {
  mode: LandingMode;
  setMode: (mode: LandingMode) => void;
};

const LandingModeContext = createContext<LandingModeContextValue | null>(null);

function readStoredMode(): LandingMode {
  if (typeof window === "undefined") return "normal";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "agent" || stored === "normal") return stored;
  } catch {
    /* ignore */
  }
  return "normal";
}

export function LandingModeProvider({ children }: { children: ReactNode }) {
  // ponytail: client-only lazy init; SSR/first paint still "normal" until hydrate if SSR ever lands
  const [mode, setModeState] = useState<LandingMode>(() => readStoredMode());

  const setMode = useCallback((next: LandingMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  // Re-sync if another tab changes mode
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue === "agent" || e.newValue === "normal") {
        setModeState(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);

  return (
    <LandingModeContext.Provider value={value}>
      {children}
    </LandingModeContext.Provider>
  );
}

export function useLandingMode() {
  const ctx = useContext(LandingModeContext);
  if (!ctx) {
    throw new Error("useLandingMode must be used within LandingModeProvider");
  }
  return ctx;
}

/** Defaults to Schedule mode when rendered outside the provider (e.g. stray mounts). */
export function useLandingModeOrDefault(): LandingModeContextValue {
  const ctx = useContext(LandingModeContext);
  return ctx ?? { mode: "normal", setMode: () => {} };
}

export function LandingModeToggle({ className = "" }: { className?: string }) {
  const ctx = useContext(LandingModeContext);
  if (!ctx) return null;

  const { mode, setMode } = ctx;

  return (
    <div
      role="group"
      aria-label="Landing audience"
      className={`inline-flex items-center rounded-lg border border-border bg-background p-0.5 ${className}`}
    >
      <button
        type="button"
        onClick={() => setMode("normal")}
        aria-pressed={mode === "normal"}
        className={`rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors sm:px-3 ${
          mode === "normal"
            ? "bg-emerald-500/15 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Schedule
      </button>
      <button
        type="button"
        onClick={() => setMode("agent")}
        aria-pressed={mode === "agent"}
        className={`rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors sm:px-3 ${
          mode === "agent"
            ? "bg-emerald-500/15 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Agents
      </button>
    </div>
  );
}
